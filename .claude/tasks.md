# CornerShop — Outstanding Tasks

Audit findings that still need to be implemented. Tick off items as they are done.

---

## Critical

- [ ] **Sale Returns / Voids** — No mechanism to reverse a sale. Need a `refunds` table, `sales:void` IPC handler, and a UI flow in Orders. Cashiers cannot correct over-charges or wrong items.

- [ ] **Stock Validation at Backend** — `sales:create` (main.js:437) deducts stock without checking availability. Check is UI-only (pos.js:304). Concurrent sales or direct IPC calls can push stock negative. Add a server-side guard before the deduct.

- [ ] **Backup Integrity** — `backup:create` (main.js:1345) uses `fs.copyFileSync` on a live WAL-mode SQLite DB. Use `better-sqlite3`'s `.backup()` method instead to avoid corrupt/incomplete backups.

- [ ] **Tax / VAT** — No tax rate setting, no tax-inclusive/exclusive pricing, no tax line on receipts. Legal requirement in most markets (PKR → Pakistan GST). Needs: settings key for tax %, tax column in sale_items, tax line on receipt.

---

## High Priority

- [ ] **End-of-Day Cash Reconciliation** — Opening balance exists but no closing count workflow. Need a shift-close screen: expected cash in drawer vs. actual count, shortfall/overage, daily cash report.

- [ ] **Delivery Edit / Void** — Once saved a delivery is permanent. Need an edit flow (correct quantity/cost) and a void/cancel that reverses stock movements and batch records.

- [ ] **On-Screen Receipt Ignores Shop Settings** — `pos.js:630` hardcodes `"🛒 CornerShop"` and `"Your Neighborhood Grocery"`. Should read from `App.settings.shop_name` / `App.settings.shop_address` like the print path does.

---

## Medium Priority

- [ ] **Customer Accounts / Credit System** — No customer table, no credit sales ("put on tab"), no per-customer purchase history. Add `customers` table, link to sales, allow credit balance tracking.

- [ ] **Audit Log for Sensitive Actions** — Stock movements are logged, but price changes, deletions (products, expenses, vendor payments), and user management changes leave no trace. Add a general `audit_log` table.

- [ ] **Inventory & Deliveries Pagination** — Inventory (`products:getAll`) and Deliveries load all rows into DOM. Add server-side pagination like the Orders screen already has. *(Pagination on POS and Orders is done.)*

---

## Done

- [x] Pagination on Orders list (sales:search with page/pageSize)
- [x] Stock movements ledger
- [x] Batch / lot tracking with FEFO support
- [x] Waste log
- [x] Vendor payments & supplier balance
- [x] Expenses tracking
- [x] CSV report export
- [x] Database backup & restore with auto-backup on launch
- [x] Opening balance tracking
