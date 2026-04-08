# CornerShop

A desktop POS and inventory management app for small grocery shops.

## Tech Stack
- **Runtime**: Electron (desktop app)
- **Database**: SQLite via better-sqlite3
- **Auth**: bcryptjs for password hashing
- **UI**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Scope**: Single shop support

## Architecture
- `main.js` — Electron main process, IPC handlers, DB operations
- `preload.js` — Context bridge exposing safe API to renderer
- `renderer/` — All UI files (HTML, CSS, JS)
- `src/database/db.js` — SQLite schema and initialization

## Roles
- **Owner** — Full access: dashboard, inventory, deliveries, reports, users, POS
- **Cashier** — POS screen only

## Default Login
- Owner: `admin` / `admin123`

## Running
```bash
npm install
npm start
```
