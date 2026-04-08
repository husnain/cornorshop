'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const bcrypt = require('bcryptjs')
const { initDatabase } = require('./src/database/db')
const { validateKey, checkTrial } = require('./src/license')

let db
let mainWindow
let currentUser = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'CornerShop',
    backgroundColor: '#1b4332'
  })
  mainWindow.loadFile('renderer/index.html')
  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  db = initDatabase(path.join(userDataPath, 'cornershop.db'))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Helper ───────────────────────────────────────────────────────────────────
function wrap(fn) {
  return async (_event, data) => {
    try {
      return await fn(data)
    } catch (err) {
      console.error(err)
      return { success: false, error: err.message }
    }
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:login', wrap(({ username, password }) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username)
  if (!user) return { success: false, error: 'Invalid username or password' }
  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) return { success: false, error: 'Invalid username or password' }
  const { password: _pw, ...safeUser } = user
  currentUser = safeUser
  return { success: true, user: safeUser }
}))

ipcMain.handle('auth:logout', wrap(() => {
  currentUser = null
  return { success: true }
}))

ipcMain.handle('auth:getCurrentUser', wrap(() => {
  return { success: true, user: currentUser }
}))

// ─── Products ─────────────────────────────────────────────────────────────────
ipcMain.handle('products:getAll', wrap(() => {
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name ASC
  `).all()
  return { success: true, products }
}))

ipcMain.handle('products:create', wrap((data) => {
  const { name, sku, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold } = data
  const result = db.prepare(`
    INSERT INTO products (name, sku, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, sku || null, category_id || null, purchase_price || 0, selling_price || 0, stock_quantity || 0, unit || 'pcs', low_stock_threshold || 10)
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid)
  return { success: true, product }
}))

ipcMain.handle('products:update', wrap((data) => {
  const { id, name, sku, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold } = data
  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, category_id = ?, purchase_price = ?, selling_price = ?,
        stock_quantity = ?, unit = ?, low_stock_threshold = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, sku || null, category_id || null, purchase_price || 0, selling_price || 0, stock_quantity || 0, unit || 'pcs', low_stock_threshold || 10, id)
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id)
  return { success: true, product }
}))

ipcMain.handle('products:delete', wrap((id) => {
  const referenced = db.prepare('SELECT COUNT(*) as count FROM sale_items WHERE product_id = ?').get(id)
  if (referenced.count > 0) {
    return { success: false, error: 'Cannot delete product that has sales history.' }
  }
  db.prepare('DELETE FROM delivery_items WHERE product_id = ?').run(id)
  db.prepare('DELETE FROM products WHERE id = ?').run(id)
  return { success: true }
}))

ipcMain.handle('products:search', wrap((query) => {
  const like = `%${query}%`
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.name LIKE ? OR p.sku LIKE ?
    ORDER BY p.name ASC
  `).all(like, like)
  return { success: true, products }
}))

// ─── Categories ───────────────────────────────────────────────────────────────
ipcMain.handle('categories:getAll', wrap(() => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all()
  return { success: true, categories }
}))

ipcMain.handle('categories:create', wrap((data) => {
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(data.name)
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid)
  return { success: true, category }
}))

// ─── Suppliers ────────────────────────────────────────────────────────────────
ipcMain.handle('suppliers:getAll', wrap(() => {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all()
  return { success: true, suppliers }
}))

ipcMain.handle('suppliers:create', wrap((data) => {
  const { name, phone, address } = data
  const result = db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?, ?, ?)').run(name, phone || null, address || null)
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid)
  return { success: true, supplier }
}))

// ─── Deliveries ───────────────────────────────────────────────────────────────
ipcMain.handle('deliveries:getAll', wrap(() => {
  const deliveries = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM delivery_items di WHERE di.delivery_id = d.id) AS item_count
    FROM deliveries d
    ORDER BY d.delivery_date DESC, d.created_at DESC
  `).all()
  return { success: true, deliveries }
}))

ipcMain.handle('deliveries:create', wrap((data) => {
  const { supplier_id, supplier_name, delivered_by, delivery_date, notes, items } = data

  if (!items || items.length === 0) {
    return { success: false, error: 'Delivery must have at least one item.' }
  }

  const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0)

  const insertDelivery = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO deliveries (supplier_id, supplier_name, delivered_by, delivery_date, total_cost, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(supplier_id || null, supplier_name || null, delivered_by, delivery_date, totalCost, notes || null)

    const deliveryId = result.lastInsertRowid

    for (const item of items) {
      const product = db.prepare('SELECT name FROM products WHERE id = ?').get(item.product_id)
      if (!product) throw new Error(`Product ${item.product_id} not found`)

      db.prepare(`
        INSERT INTO delivery_items (delivery_id, product_id, product_name, quantity, unit_cost)
        VALUES (?, ?, ?, ?, ?)
      `).run(deliveryId, item.product_id, product.name, item.quantity, item.unit_cost)

      db.prepare(`
        UPDATE products
        SET stock_quantity = stock_quantity + ?,
            purchase_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.quantity, item.unit_cost, item.product_id)
    }

    return deliveryId
  })

  const deliveryId = insertDelivery()
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
  return { success: true, delivery }
}))

ipcMain.handle('deliveries:getById', wrap((id) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id)
  if (!delivery) return { success: false, error: 'Delivery not found' }
  const items = db.prepare('SELECT * FROM delivery_items WHERE delivery_id = ?').all(id)
  return { success: true, delivery: { ...delivery, items } }
}))

// ─── Sales ────────────────────────────────────────────────────────────────────
ipcMain.handle('sales:create', wrap((data) => {
  const { cashier_id, cashier_name, subtotal, discount, total, payment_method, amount_paid, change_amount, notes, items } = data

  if (!items || items.length === 0) {
    return { success: false, error: 'Sale must have at least one item.' }
  }

  const insertSale = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO sales (cashier_id, cashier_name, subtotal, discount, total, payment_method, amount_paid, change_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cashier_id, cashier_name, subtotal, discount || 0, total, payment_method || 'cash', amount_paid || 0, change_amount || 0, notes || null)

    const saleId = result.lastInsertRowid

    for (const item of items) {
      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, purchase_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(saleId, item.product_id, item.product_name, item.quantity, item.unit_price, item.purchase_price || 0, item.total_price)

      db.prepare(`
        UPDATE products
        SET stock_quantity = stock_quantity - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.quantity, item.product_id)
    }

    return saleId
  })

  const saleId = insertSale()
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId)
  const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId)
  return { success: true, sale: { ...sale, items: saleItems } }
}))

ipcMain.handle('sales:getAll', wrap(() => {
  const sales = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
    FROM sales s
    ORDER BY s.sale_date DESC
  `).all()
  return { success: true, sales }
}))

ipcMain.handle('sales:getById', wrap((id) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id)
  if (!sale) return { success: false, error: 'Sale not found' }
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id)
  return { success: true, sale: { ...sale, items } }
}))

ipcMain.handle('sales:getByDate', wrap(({ start, end }) => {
  const sales = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
    FROM sales s
    WHERE date(s.sale_date) BETWEEN date(?) AND date(?)
    ORDER BY s.sale_date DESC
  `).all(start, end)
  return { success: true, sales }
}))

// ─── Dashboard ────────────────────────────────────────────────────────────────
ipcMain.handle('dashboard:getStats', wrap(() => {
  const todaySales = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS today_sales,
           COUNT(*) AS today_transactions
    FROM sales
    WHERE date(sale_date) = date('now','localtime')
  `).get()

  const todayProfit = db.prepare(`
    SELECT COALESCE(SUM(si.total_price - si.purchase_price * si.quantity), 0) AS today_profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE date(s.sale_date) = date('now','localtime')
  `).get()

  const weekSales = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS week_sales
    FROM sales
    WHERE date(sale_date) >= date('now','localtime','-6 days')
  `).get()

  const monthSales = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS month_sales
    FROM sales
    WHERE strftime('%Y-%m', sale_date, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
  `).get()

  const inventoryValue = db.prepare(`
    SELECT COALESCE(SUM(stock_quantity * purchase_price), 0) AS inventory_value
    FROM products
  `).get()

  const lowStockCount = db.prepare(`
    SELECT COUNT(*) AS low_stock_count
    FROM products
    WHERE stock_quantity <= low_stock_threshold
  `).get()

  const topProducts = db.prepare(`
    SELECT si.product_name, SUM(si.quantity) AS total_qty, SUM(si.total_price) AS total_revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE date(s.sale_date) >= date('now','localtime','-6 days')
    GROUP BY si.product_id, si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  `).all()

  const recentSales = db.prepare(`
    SELECT * FROM sales
    ORDER BY sale_date DESC
    LIMIT 5
  `).all()

  return {
    success: true,
    stats: {
      today_sales: todaySales.today_sales,
      today_transactions: todaySales.today_transactions,
      today_profit: todayProfit.today_profit,
      week_sales: weekSales.week_sales,
      month_sales: monthSales.month_sales,
      inventory_value: inventoryValue.inventory_value,
      low_stock_count: lowStockCount.low_stock_count,
      top_products: topProducts,
      recent_sales: recentSales
    }
  }
}))

// ─── Reports ──────────────────────────────────────────────────────────────────
ipcMain.handle('reports:getDailyReport', wrap((date) => {
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(s.total), 0) AS total_sales,
      COALESCE(SUM(s.total - s.discount), 0) AS net_sales,
      COUNT(*) AS transactions,
      COALESCE(SUM(si2.total_items), 0) AS items_sold,
      COALESCE(SUM(si2.total_cost), 0) AS total_cost,
      COALESCE(SUM(si2.total_revenue - si2.total_cost), 0) AS total_profit
    FROM sales s
    LEFT JOIN (
      SELECT sale_id,
        SUM(quantity) AS total_items,
        SUM(purchase_price * quantity) AS total_cost,
        SUM(total_price) AS total_revenue
      FROM sale_items
      GROUP BY sale_id
    ) si2 ON si2.sale_id = s.id
    WHERE date(s.sale_date, 'localtime') = date(?)
  `).get(date)

  const byCategory = db.prepare(`
    SELECT c.name AS category, SUM(si.quantity) AS qty, SUM(si.total_price) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE date(s.sale_date, 'localtime') = date(?)
    GROUP BY c.id, c.name
    ORDER BY revenue DESC
  `).all(date)

  return { success: true, summary, byCategory }
}))

ipcMain.handle('reports:getSalesReport', wrap(({ start, end }) => {
  const daily = db.prepare(`
    SELECT
      date(s.sale_date, 'localtime') AS sale_day,
      COUNT(*) AS transactions,
      COALESCE(SUM(s.total), 0) AS revenue,
      COALESCE(SUM(si2.total_cost), 0) AS cost,
      COALESCE(SUM(s.total - si2.total_cost), 0) AS profit
    FROM sales s
    LEFT JOIN (
      SELECT sale_id, SUM(purchase_price * quantity) AS total_cost
      FROM sale_items
      GROUP BY sale_id
    ) si2 ON si2.sale_id = s.id
    WHERE date(s.sale_date, 'localtime') BETWEEN date(?) AND date(?)
    GROUP BY sale_day
    ORDER BY sale_day ASC
  `).all(start, end)

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(s.total), 0) AS total_revenue,
      COALESCE(SUM(si2.total_cost), 0) AS total_cost,
      COALESCE(SUM(s.total - si2.total_cost), 0) AS total_profit,
      COUNT(*) AS total_transactions
    FROM sales s
    LEFT JOIN (
      SELECT sale_id, SUM(purchase_price * quantity) AS total_cost
      FROM sale_items
      GROUP BY sale_id
    ) si2 ON si2.sale_id = s.id
    WHERE date(s.sale_date, 'localtime') BETWEEN date(?) AND date(?)
  `).get(start, end)

  return { success: true, daily, totals }
}))

// ─── Users ────────────────────────────────────────────────────────────────────
ipcMain.handle('users:getAll', wrap(() => {
  const users = db.prepare('SELECT id, name, username, role, active, created_at FROM users ORDER BY name ASC').all()
  return { success: true, users }
}))

ipcMain.handle('users:create', wrap((data) => {
  const { name, username, password, role } = data
  const hashed = bcrypt.hashSync(password, 10)
  const result = db.prepare(`
    INSERT INTO users (name, username, password, role)
    VALUES (?, ?, ?, ?)
  `).run(name, username, hashed, role)
  const user = db.prepare('SELECT id, name, username, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid)
  return { success: true, user }
}))

ipcMain.handle('users:update', wrap((data) => {
  const { id, name, role, active, password } = data
  if (password && password.trim()) {
    const hashed = bcrypt.hashSync(password, 10)
    db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password = ? WHERE id = ?').run(name, role, active, hashed, id)
  } else {
    db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, id)
  }
  const user = db.prepare('SELECT id, name, username, role, active, created_at FROM users WHERE id = ?').get(id)
  return { success: true, user }
}))

ipcMain.handle('users:delete', wrap((id) => {
  if (currentUser && currentUser.id === id) {
    return { success: false, error: 'Cannot deactivate your own account.' }
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id)
  return { success: true }
}))

// ─── License ──────────────────────────────────────────────────────────────────
ipcMain.handle('license:check', wrap(() => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (\'trial_start\', \'license_key\')').all()
  const s = {}
  for (const r of rows) s[r.key] = r.value

  // If a license key is stored, validate it first
  if (s.license_key) {
    const result = validateKey(s.license_key)
    if (result.valid) {
      return { success: true, status: 'licensed', daysLeft: result.daysLeft, expiryDate: result.expiryDate }
    }
    // Key is invalid/expired — fall through to trial check
  }

  // Check trial
  if (!s.trial_start) {
    return { success: true, status: 'expired', reason: 'No trial start date found' }
  }

  const trial = checkTrial(s.trial_start)
  if (trial.active) {
    return { success: true, status: 'trial', daysLeft: trial.daysLeft, expiryDate: trial.expiryDate }
  }

  return { success: true, status: 'expired', daysLeft: 0, expiryDate: trial.expiryDate }
}))

ipcMain.handle('license:activate', wrap(({ key }) => {
  const result = validateKey(key)
  if (!result.valid) {
    return { success: false, error: result.reason }
  }
  // Store the validated key
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(key.trim().toUpperCase())
  return { success: true, daysLeft: result.daysLeft, expiryDate: result.expiryDate }
}))

// ─── Settings ─────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', wrap(() => {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  return { success: true, settings }
}))

ipcMain.handle('settings:set', wrap((data) => {
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(data)) {
    update.run(key, String(value))
  }
  return { success: true }
}))

// ─── Receipt ──────────────────────────────────────────────────────────────────
ipcMain.handle('receipt:print', wrap((saleData) => {
  const { BrowserWindow } = require('electron')

  const settingsRows = db.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of settingsRows) settings[row.key] = row.value
  const currencySymbol = settings.currency_symbol || '₨'
  const formatCurrency = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatDate = (d) => new Date(d).toLocaleString()

  const itemRows = (saleData.items || []).map(item => `
    <tr>
      <td>${item.product_name}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${formatCurrency(item.unit_price)}</td>
      <td style="text-align:right">${formatCurrency(item.total_price)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; padding: 10px; color: #000; }
  .center { text-align: center; }
  .shop-name { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 4px; }
  td { padding: 2px 0; vertical-align: top; }
  .totals td { padding: 2px 0; }
  .totals .label { font-weight: normal; }
  .totals .grand-total td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; }
  .thank-you { margin-top: 12px; font-size: 11px; }
</style>
</head>
<body>
<div class="center">
  <div class="shop-name">CornerShop</div>
  <div>Your Neighborhood Grocery</div>
</div>
<div class="divider"></div>
<div>Receipt #: ${saleData.id}</div>
<div>Date: ${formatDate(saleData.sale_date)}</div>
<div>Cashier: ${saleData.cashier_name || 'N/A'}</div>
<div class="divider"></div>
<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Price</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>
<div class="divider"></div>
<table class="totals">
  <tr><td class="label">Subtotal</td><td style="text-align:right">${formatCurrency(saleData.subtotal)}</td></tr>
  ${saleData.discount > 0 ? `<tr><td class="label">Discount</td><td style="text-align:right">-${formatCurrency(saleData.discount)}</td></tr>` : ''}
  <tr class="grand-total"><td><strong>TOTAL</strong></td><td style="text-align:right"><strong>${formatCurrency(saleData.total)}</strong></td></tr>
  <tr><td class="label">Payment (${(saleData.payment_method || 'cash').toUpperCase()})</td><td style="text-align:right">${formatCurrency(saleData.amount_paid)}</td></tr>
  <tr><td class="label">Change</td><td style="text-align:right">${formatCurrency(saleData.change_amount)}</td></tr>
</table>
<div class="divider"></div>
<div class="center thank-you">
  <p>Thank you for shopping at CornerShop!</p>
  <p>Please come again.</p>
</div>
</body>
</html>`

  const win = new BrowserWindow({
    width: 380,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  win.webContents.once('did-finish-load', () => {
    win.webContents.print({ silent: false, printBackground: false }, () => {
      win.close()
    })
  })

  return { success: true }
}))
