'use strict'

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const bcrypt = require('bcryptjs')
const { initDatabase } = require('./src/database/db')
const { getMachineId, validateKey, checkTrial } = require('./src/license')
const { autoUpdater } = require('electron-updater')

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

  // Check for updates in production only (not during dev/testing)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates()
  }
})

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: `CornerShop ${info.version} has been downloaded and is ready to install.`,
    detail: 'Click "Restart Now" to apply the update, or "Later" to install it next time you open the app.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
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
  const { name, sku, barcode, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold, expiry_date } = data
  const result = db.prepare(`
    INSERT INTO products (name, sku, barcode, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, sku || null, barcode || null, category_id || null, purchase_price || 0, selling_price || 0, stock_quantity || 0, unit || 'pcs', low_stock_threshold || 10, expiry_date || null)
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid)
  return { success: true, product }
}))

ipcMain.handle('products:update', wrap((data) => {
  const { id, name, sku, barcode, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold, expiry_date } = data
  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, barcode = ?, category_id = ?, purchase_price = ?, selling_price = ?,
        stock_quantity = ?, unit = ?, low_stock_threshold = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, sku || null, barcode || null, category_id || null, purchase_price || 0, selling_price || 0, stock_quantity || 0, unit || 'pcs', low_stock_threshold || 10, expiry_date || null, id)
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
    WHERE p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?
    ORDER BY p.name ASC
  `).all(like, like, like)
  return { success: true, products }
}))

ipcMain.handle('products:getByBarcode', wrap((barcode) => {
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.barcode = ?
  `).get(barcode)
  if (!product) return { success: false, error: 'Product not found' }
  return { success: true, product }
}))

ipcMain.handle('products:bulkImport', wrap((data) => {
  const { rows } = data
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: 'No rows to import' }
  }

  let inserted = 0
  let updated = 0
  const errors = []

  // Cache existing categories for fast lookup
  const catMap = new Map()
  db.prepare('SELECT id, name FROM categories').all().forEach(c => {
    catMap.set(c.name.toLowerCase(), c.id)
  })

  const VALID_UNITS = new Set(['pcs', 'kg', 'g', 'L', 'mL', 'box', 'pack', 'dozen', 'bottle', 'can'])

  const stmtInsertCat  = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
  const stmtGetCat     = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)')
  const stmtFindBySku  = db.prepare('SELECT id FROM products WHERE sku = ?')
  const stmtInsert     = db.prepare(`
    INSERT INTO products
      (name, sku, barcode, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const stmtUpdate     = db.prepare(`
    UPDATE products
    SET name = ?, barcode = ?, category_id = ?, purchase_price = ?, selling_price = ?,
        stock_quantity = ?, unit = ?, low_stock_threshold = ?, updated_at = CURRENT_TIMESTAMP
    WHERE sku = ?
  `)

  // Run everything in one transaction — critical for thousands-of-rows performance
  const runImport = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed + account for header row

      try {
        const name = String(row.name || '').trim()
        if (!name) {
          errors.push({ row: rowNum, error: 'Missing product name' })
          continue
        }

        const sku               = String(row.sku      || '').trim() || null
        const barcode           = String(row.barcode  || '').trim() || null
        const purchase_price    = Math.max(0, parseFloat(row.purchase_price)    || 0)
        const selling_price     = Math.max(0, parseFloat(row.selling_price)     || 0)
        const stock_quantity    = Math.max(0, parseFloat(row.stock_quantity)    || 0)
        const low_stock_threshold = Math.max(0, parseFloat(row.low_stock_threshold) || 10)
        const rawUnit           = String(row.unit || 'pcs').trim()
        const unit              = VALID_UNITS.has(rawUnit) ? rawUnit : 'pcs'

        // Resolve category — create it automatically if unknown
        let category_id = null
        const catName = String(row.category || '').trim()
        if (catName) {
          const key = catName.toLowerCase()
          if (catMap.has(key)) {
            category_id = catMap.get(key)
          } else {
            stmtInsertCat.run(catName)
            const cat = stmtGetCat.get(catName)
            if (cat) {
              catMap.set(key, cat.id)
              category_id = cat.id
            }
          }
        }

        if (sku) {
          const existing = stmtFindBySku.get(sku)
          if (existing) {
            stmtUpdate.run(name, barcode, category_id, purchase_price, selling_price,
              stock_quantity, unit, low_stock_threshold, sku)
            updated++
          } else {
            stmtInsert.run(name, sku, barcode, category_id, purchase_price, selling_price,
              stock_quantity, unit, low_stock_threshold)
            inserted++
          }
        } else {
          stmtInsert.run(name, null, barcode, category_id, purchase_price, selling_price,
            stock_quantity, unit, low_stock_threshold)
          inserted++
        }
      } catch (err) {
        errors.push({ row: rowNum, error: err.message })
      }
    }
  })

  runImport()

  return { success: true, inserted, updated, errors }
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

  const lowStockItems = db.prepare(`
    SELECT id, name, stock_quantity, low_stock_threshold, unit
    FROM products
    WHERE stock_quantity <= low_stock_threshold
    ORDER BY (stock_quantity - low_stock_threshold) ASC
    LIMIT 20
  `).all()

  const expiryAlerts = db.prepare(`
    SELECT id, name, expiry_date,
           CAST(julianday(expiry_date) - julianday('now','localtime') AS INTEGER) AS days_left
    FROM products
    WHERE expiry_date IS NOT NULL AND expiry_date != ''
      AND date(expiry_date) <= date('now','localtime','+30 days')
    ORDER BY expiry_date ASC
    LIMIT 20
  `).all()

  const expiredCount = db.prepare(`
    SELECT COUNT(*) AS expired_count
    FROM products
    WHERE expiry_date IS NOT NULL AND expiry_date != ''
      AND date(expiry_date) < date('now','localtime')
  `).get()

  const expiringSoonCount = db.prepare(`
    SELECT COUNT(*) AS expiring_soon_count
    FROM products
    WHERE expiry_date IS NOT NULL AND expiry_date != ''
      AND date(expiry_date) BETWEEN date('now','localtime') AND date('now','localtime','+30 days')
  `).get()

  const wasteThisMonth = db.prepare(`
    SELECT COALESCE(SUM(cost_value), 0) AS waste_value,
           COALESCE(SUM(quantity), 0) AS waste_qty,
           COUNT(*) AS waste_entries
    FROM waste_log
    WHERE strftime('%Y-%m', logged_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
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
      low_stock_items: lowStockItems,
      expired_count: expiredCount.expired_count,
      expiring_soon_count: expiringSoonCount.expiring_soon_count,
      expiry_alerts: expiryAlerts,
      waste_value: wasteThisMonth.waste_value,
      waste_entries: wasteThisMonth.waste_entries,
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
ipcMain.handle('license:getMachineId', wrap(() => {
  return { success: true, machineId: getMachineId() }
}))

ipcMain.handle('license:check', wrap(() => {
  const machineId = getMachineId()
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (\'trial_start\', \'license_key\', \'trial_machine_id\')').all()
  const s = {}
  for (const r of rows) s[r.key] = r.value

  // If a license is stored, validate it against this machine
  if (s.license_key) {
    try {
      const license = JSON.parse(s.license_key)
      const result = validateKey(license, machineId)
      if (result.valid) {
        return { success: true, status: 'licensed', daysLeft: result.daysLeft, expiryDate: result.expiryDate }
      }
    } catch { /* corrupt stored value — fall through */ }
    // Invalid/expired/wrong machine — fall through to trial check
  }

  // Check trial
  if (!s.trial_start) {
    return { success: true, status: 'expired', reason: 'No trial start date found', machineId }
  }

  // Lock trial to the machine it started on
  if (s.trial_machine_id && s.trial_machine_id !== machineId) {
    return { success: true, status: 'expired', reason: 'Trial is locked to another machine', machineId }
  }

  // Record machine ID when trial first starts
  if (!s.trial_machine_id) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('trial_machine_id', ?)").run(machineId)
  }

  const trial = checkTrial(s.trial_start)
  if (trial.active) {
    return { success: true, status: 'trial', daysLeft: trial.daysLeft, expiryDate: trial.expiryDate, machineId }
  }

  return { success: true, status: 'expired', daysLeft: 0, expiryDate: trial.expiryDate, machineId }
}))

ipcMain.handle('license:importFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import License File',
    filters: [{ name: 'License File', extensions: ['lic'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths.length) return { success: false, error: 'No file selected' }

  let license
  try {
    const fs = require('fs')
    license = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
  } catch {
    return { success: false, error: 'Could not read license file' }
  }

  const machineId = getMachineId()
  const result = validateKey(license, machineId)
  if (!result.valid) return { success: false, error: result.reason }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(JSON.stringify(license))
  return { success: true, daysLeft: result.daysLeft, expiryDate: result.expiryDate }
})

// ─── Waste Log ────────────────────────────────────────────────────────────────
ipcMain.handle('waste:log', wrap((data) => {
  const { product_id, quantity, reason, notes } = data
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id)
  if (!product) return { success: false, error: 'Product not found' }
  if (quantity <= 0) return { success: false, error: 'Quantity must be greater than zero' }
  if (quantity > product.stock_quantity) return { success: false, error: 'Quantity exceeds current stock' }

  const cost_value = quantity * (product.purchase_price || 0)
  const loggedBy = currentUser ? currentUser.name : 'Unknown'

  db.prepare(`
    INSERT INTO waste_log (product_id, product_name, quantity, unit, reason, notes, logged_by, cost_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(product_id, product.name, quantity, product.unit, reason || 'Spoiled', notes || null, loggedBy, cost_value)

  db.prepare('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(quantity, product_id)

  return { success: true, cost_value }
}))

ipcMain.handle('waste:getAll', wrap(() => {
  const entries = db.prepare(`
    SELECT w.*, p.selling_price
    FROM waste_log w
    LEFT JOIN products p ON p.id = w.product_id
    ORDER BY w.logged_at DESC
  `).all()
  return { success: true, entries }
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
  const os  = require('os')
  const path = require('path')
  const fs  = require('fs')

  const settingsRows = db.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of settingsRows) settings[row.key] = row.value
  const currencySymbol = settings.currency_symbol || '₨'
  const shopName = settings.shop_name || 'CornerShop'
  const shopAddress = settings.shop_address || ''
  const silent = (settings.print_mode || 'dialog') === 'silent'
  const formatCurrency = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatDate = (d) => new Date(d).toLocaleString()

  const items = saleData.items || []

  const itemRows = items.map(item => `
    <tr>
      <td class="col-name">${item.product_name}</td>
      <td class="col-qty">${item.quantity}</td>
      <td class="col-price">${formatCurrency(item.unit_price)}</td>
      <td class="col-total">${formatCurrency(item.total_price)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; color: #000; }
  .center { text-align: center; }
  .shop-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 10px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items-table .col-name  { width: 46%; word-break: break-word; }
  .items-table .col-qty   { width: 10%; text-align: center; }
  .items-table .col-price { width: 22%; text-align: right; }
  .items-table .col-total { width: 22%; text-align: right; }
  th { font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 3px; text-align: left; }
  th.col-qty   { text-align: center; }
  th.col-price, th.col-total { text-align: right; }
  td { padding: 2px 0; vertical-align: top; font-size: 11px; }
  .totals-table .lbl { width: 60%; }
  .totals-table .amt { width: 40%; text-align: right; }
  .grand-total td { font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 3px; }
  .thank-you { margin-top: 10px; font-size: 10px; text-align: center; }
  .install-footer { margin-top: 8px; font-size: 9px; text-align: center; color: #555; }
</style>
</head>
<body>
<div class="center">
  <div class="shop-name">${shopName}</div>
  ${shopAddress ? `<div>${shopAddress}</div>` : ''}
</div>
<div class="divider"></div>
<div class="meta">
  <div>Receipt #: ${saleData.id}</div>
  <div>Date: ${formatDate(saleData.sale_date)}</div>
  <div>Cashier: ${saleData.cashier_name || 'N/A'}</div>
</div>
<div class="divider"></div>
<table class="items-table">
  <thead>
    <tr>
      <th class="col-name">Item</th>
      <th class="col-qty">Qty</th>
      <th class="col-price">Price</th>
      <th class="col-total">Total</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="divider"></div>
<table class="totals-table">
  <tr><td class="lbl">Subtotal</td><td class="amt">${formatCurrency(saleData.subtotal)}</td></tr>
  ${saleData.discount > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">-${formatCurrency(saleData.discount)}</td></tr>` : ''}
  <tr class="grand-total"><td class="lbl">TOTAL</td><td class="amt">${formatCurrency(saleData.total)}</td></tr>
  <tr><td class="lbl">Payment (${(saleData.payment_method || 'cash').toUpperCase()})</td><td class="amt">${formatCurrency(saleData.amount_paid)}</td></tr>
  <tr><td class="lbl">Change</td><td class="amt">${formatCurrency(saleData.change_amount)}</td></tr>
</table>
<div class="divider"></div>
<div class="thank-you">
  <p>Thank you for shopping at CornerShop!</p>
  <p>Please come again.</p>
</div>
<div class="divider"></div>
<div class="install-footer">
  <p>Get this app: 0333-121-1992</p>
</div>
</body>
</html>`

  const tmpFile = path.join(os.tmpdir(), `receipt-${saleData.id}-${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')


  // 80mm at 96 DPI = 302px — match print width so scrollHeight reflects actual print layout
  const printWidthPx = 302
  const win = new BrowserWindow({
    width: printWidthPx,
    height: 2000,
    show: !silent,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  win.loadFile(tmpFile)
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      win.webContents.executeJavaScript('document.body.offsetHeight').then(scrollHeight => {
        win.setSize(printWidthPx, scrollHeight + 40)
        // 1 CSS px = 1/96 inch = 264.583 µm; add 15mm (15000 µm) safety margin
        const pageHeightMicrons = Math.ceil(scrollHeight * 265) + 15000
        win.webContents.print({
          silent,
          printBackground: true,
          pageSize: { width: 80000, height: pageHeightMicrons }
        }, () => {
          try { fs.unlinkSync(tmpFile) } catch (_) {}
          setTimeout(() => win.close(), silent ? 0 : 1000)
        })
      }).catch(() => {
        win.webContents.print({ silent, printBackground: true }, () => {
          try { fs.unlinkSync(tmpFile) } catch (_) {}
          setTimeout(() => win.close(), silent ? 0 : 1000)
        })
      })
    }, 500)
  })

  return { success: true }
}))
