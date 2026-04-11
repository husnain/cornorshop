'use strict'

const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')

function initDatabase(dbPath) {
  const db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','cashier')),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      barcode TEXT,
      category_id INTEGER REFERENCES categories(id),
      purchase_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      stock_quantity REAL NOT NULL DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      low_stock_threshold REAL DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_name TEXT,
      delivered_by TEXT NOT NULL,
      delivery_date DATE NOT NULL,
      total_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL REFERENCES deliveries(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_id INTEGER REFERENCES users(id),
      cashier_name TEXT,
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      amount_paid REAL DEFAULT 0,
      change_amount REAL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      purchase_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // ── Migrations ────────────────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE products ADD COLUMN barcode TEXT') } catch (_) {}
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL')

  // Expiry date per product (nullable — not all products have one)
  try { db.exec('ALTER TABLE products ADD COLUMN expiry_date DATE') } catch (_) {}

  // Waste / spoilage log
  db.exec(`
    CREATE TABLE IF NOT EXISTS waste_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs',
      reason TEXT NOT NULL DEFAULT 'Spoiled',
      notes TEXT,
      logged_by TEXT,
      cost_value REAL DEFAULT 0,
      logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Seed default settings (INSERT OR IGNORE — won't overwrite existing values)
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_code', 'PKR')").run()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', '₨')").run()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_name', 'Pakistani Rupee')").run()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('print_mode', 'dialog')").run()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_name', 'CornerShop')").run()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_address', '')").run()

  // Record trial start date on very first run (never overwrite)
  const trialRow = db.prepare("SELECT value FROM settings WHERE key = 'trial_start'").get()
  if (!trialRow) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('trial_start', ?)").run(new Date().toISOString())
  }

  // Seed data on first run
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get()
  if (userCount.count === 0) {
    // Insert categories
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
    const categories = [
      'Beverages', 'Dairy', 'Snacks', 'Produce', 'Bakery',
      'Canned Goods', 'Frozen', 'Personal Care', 'Household', 'Other'
    ]
    for (const cat of categories) {
      insertCategory.run(cat)
    }

    // Insert owner
    const ownerPassword = bcrypt.hashSync('admin123', 10)
    db.prepare(`
      INSERT INTO users (name, username, password, role)
      VALUES (?, ?, ?, ?)
    `).run('Shop Owner', 'admin', ownerPassword, 'owner')

    // Insert cashier
    const cashierPassword = bcrypt.hashSync('cashier123', 10)
    db.prepare(`
      INSERT INTO users (name, username, password, role)
      VALUES (?, ?, ?, ?)
    `).run('John Cashier', 'cashier', cashierPassword, 'cashier')

    // Insert sample supplier
    db.prepare(`
      INSERT INTO suppliers (name, phone, address)
      VALUES (?, ?, ?)
    `).run('Default Supplier', '555-0100', '123 Supply Street')

    // Insert sample products
    const beveragesCat = db.prepare("SELECT id FROM categories WHERE name = 'Beverages'").get()
    const dairyCat = db.prepare("SELECT id FROM categories WHERE name = 'Dairy'").get()
    const snacksCat = db.prepare("SELECT id FROM categories WHERE name = 'Snacks'").get()
    const produceCat = db.prepare("SELECT id FROM categories WHERE name = 'Produce'").get()

    const insertProduct = db.prepare(`
      INSERT INTO products (name, sku, category_id, purchase_price, selling_price, stock_quantity, unit, low_stock_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insertProduct.run('Coca Cola 330ml', 'BEV-001', beveragesCat.id, 0.50, 1.00, 100, 'pcs', 20)
    insertProduct.run('Mineral Water 500ml', 'BEV-002', beveragesCat.id, 0.30, 0.75, 150, 'pcs', 30)
    insertProduct.run('Orange Juice 1L', 'BEV-003', beveragesCat.id, 1.20, 2.50, 60, 'pcs', 15)
    insertProduct.run('Whole Milk 1L', 'DAI-001', dairyCat.id, 0.90, 1.50, 80, 'pcs', 20)
    insertProduct.run('Butter 250g', 'DAI-002', dairyCat.id, 1.50, 2.25, 40, 'pcs', 10)
    insertProduct.run('Cheddar Cheese 200g', 'DAI-003', dairyCat.id, 2.00, 3.50, 30, 'pcs', 8)
    insertProduct.run('Potato Chips 150g', 'SNK-001', snacksCat.id, 0.80, 1.50, 90, 'pcs', 20)
    insertProduct.run('Chocolate Bar 100g', 'SNK-002', snacksCat.id, 0.60, 1.20, 120, 'pcs', 25)
    insertProduct.run('Bananas', 'PRD-001', produceCat.id, 0.50, 0.90, 200, 'kg', 30)
    insertProduct.run('Apples', 'PRD-002', produceCat.id, 0.70, 1.20, 150, 'kg', 25)
  }

  return db
}

module.exports = { initDatabase }
