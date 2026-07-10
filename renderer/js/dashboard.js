'use strict'

const Dashboard = {
  async render() {
    const content = document.getElementById('content')
    const res = await window.api.dashboard.getStats()

    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">Failed to load dashboard: ${res.error}</div>`
      return
    }

    const s = res.stats
    const fc = App.formatCurrency
    const fmt = App.formatDateTime

    const profitMargin = s.today_sales > 0
      ? ((s.today_profit / s.today_sales) * 100).toFixed(1)
      : '0.0'

    // Opening balance banner
    const ob = s.opening_balance
    const cashPosition = ob ? (ob.amount + s.today_cash_sales) : null
    let openingBalanceBanner
    if (!ob) {
      openingBalanceBanner = `
        <div class="ob-banner ob-banner-unset">
          <div class="ob-banner-left">
            <span class="ob-banner-icon">💵</span>
            <div>
              <div class="ob-banner-title">Opening Balance Not Set</div>
              <div class="ob-banner-sub">Record today's starting cash to track your cash position</div>
            </div>
          </div>
          <button class="btn btn-primary" onclick="Dashboard.showSetOpeningBalance()">Set Opening Balance</button>
        </div>`
    } else {
      openingBalanceBanner = `
        <div class="ob-banner ob-banner-set">
          <div class="ob-banner-left">
            <span class="ob-banner-icon">💵</span>
            <div>
              <div class="ob-banner-title">Opening Balance: <strong>${fc(ob.amount)}</strong></div>
              <div class="ob-banner-sub">Cash Position: <strong>${fc(cashPosition)}</strong> (opening + cash sales)${ob.notes ? ' · ' + ob.notes : ''}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="Dashboard.showSetOpeningBalance()">Update</button>
        </div>`
    }

    const topProductsRows = (s.top_products || []).map((p, i) => `
      <tr>
        <td><span class="badge badge-secondary">${i + 1}</span></td>
        <td>${p.product_name}</td>
        <td class="text-center">${Number(p.total_qty).toFixed(1)}</td>
        <td class="text-right">${fc(p.total_revenue)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No sales this week</td></tr>'

    const recentSalesRows = (s.recent_sales || []).map(sale => `
      <tr>
        <td>#${sale.id}</td>
        <td>${fmt(sale.sale_date)}</td>
        <td>${sale.cashier_name || 'N/A'}</td>
        <td>${sale.payment_method || 'cash'}</td>
        <td class="text-right font-bold">${fc(sale.total)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No sales today</td></tr>'

    const lowStockClass = s.low_stock_count > 0 ? 'red' : 'green'
    const expiryClass = (s.expired_count > 0) ? 'red' : (s.expiring_soon_count > 0 ? 'orange' : 'green')

    // Alerts panel rows
    const lowStockAlertRows = (s.low_stock_items || []).map(p => `
      <div class="alert-row">
        <span class="alert-name">${p.name}</span>
        <span class="alert-detail">${Number(p.stock_quantity).toFixed(1)} ${p.unit} left (min ${Number(p.low_stock_threshold).toFixed(1)})</span>
        <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')" style="padding:2px 8px;font-size:11px">View</button>
      </div>
    `).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">All products are well stocked.</div>'

    const expiryAlertRows = (s.expiry_alerts || []).map(a => {
      const badge = a.days_left < 0
        ? `<span class="badge badge-danger">Expired</span>`
        : a.days_left <= 7
          ? `<span class="badge badge-danger">${a.days_left}d left</span>`
          : `<span class="badge badge-warning">${a.days_left}d left</span>`
      return `
        <div class="alert-row">
          <span class="alert-name">${a.name}</span>
          <span class="alert-detail">${App.formatDate(a.expiry_date)}</span>
          ${badge}
        </div>
      `
    }).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No products expiring within 30 days.</div>'

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-subtitle">Welcome back, ${App.currentUser.name}</div>
        </div>
        <div class="quick-actions">
          <button class="btn btn-primary" onclick="App.navigate('pos')">🛍️ New Sale</button>
          <button class="btn btn-secondary" onclick="App.navigate('inventory')">📦 Inventory</button>
          <button class="btn btn-secondary" onclick="App.navigate('deliveries')">🚚 Record Delivery</button>
        </div>
      </div>

      <!-- Opening Balance -->
      ${openingBalanceBanner}

      <!-- Stat Cards -->
      <div class="stats-grid">
        <div class="stat-card green">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Today's Sales</div>
          <div class="stat-value">${fc(s.today_sales)}</div>
          <div class="stat-sub">${s.today_transactions} transaction${s.today_transactions !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-icon">📈</div>
          <div class="stat-label">Today's Profit</div>
          <div class="stat-value">${fc(s.today_profit)}</div>
          <div class="stat-sub">${profitMargin}% margin</div>
        </div>
        <div class="stat-card ${lowStockClass}">
          <div class="stat-icon">⚠️</div>
          <div class="stat-label">Low Stock Items</div>
          <div class="stat-value">${s.low_stock_count}</div>
          <div class="stat-sub">Inventory: ${fc(s.inventory_value)}</div>
        </div>
        <div class="stat-card ${expiryClass}">
          <div class="stat-icon">🗓️</div>
          <div class="stat-label">Expiry Alerts</div>
          <div class="stat-value">${s.expired_count + s.expiring_soon_count}</div>
          <div class="stat-sub">${s.expired_count} expired · ${s.expiring_soon_count} expiring soon</div>
        </div>
      </div>

      <!-- Alerts Panel -->
      <div class="dashboard-grid" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header">
            <div class="card-title">⚠️ Low Stock</div>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">Manage</button>
          </div>
          <div class="card-body" style="padding:8px 16px">
            ${lowStockAlertRows}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">🗓️ Expiring Products</div>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">Manage</button>
          </div>
          <div class="card-body" style="padding:8px 16px">
            ${expiryAlertRows}
          </div>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- Recent Sales -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Recent Sales</div>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('pos')">+ New Sale</button>
          </div>
          <div class="table-wrapper" style="box-shadow:none;border-radius:0">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date & Time</th>
                  <th>Cashier</th>
                  <th>Payment</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${recentSalesRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Products -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Top Products (This Week)</div>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('reports')">View Reports</button>
          </div>
          <div class="table-wrapper" style="box-shadow:none;border-radius:0">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th class="text-center">Qty Sold</th>
                  <th class="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${topProductsRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Inventory Summary -->
      <div class="card mt-2">
        <div class="card-header">
          <div class="card-title">Inventory Overview</div>
          <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">Manage Inventory</button>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center">
            <div>
              <div style="font-size:22px;font-weight:700;color:var(--primary)">${fc(s.inventory_value)}</div>
              <div style="font-size:12px;color:var(--text-muted)">Total Inventory Value</div>
            </div>
            <div>
              <div style="font-size:22px;font-weight:700;color:${s.low_stock_count > 0 ? 'var(--danger)' : 'var(--success)'}">${s.low_stock_count}</div>
              <div style="font-size:12px;color:var(--text-muted)">Low Stock Items</div>
            </div>
            <div>
              <div style="font-size:22px;font-weight:700;color:var(--info)">${fc(s.month_sales)}</div>
              <div style="font-size:12px;color:var(--text-muted)">This Month's Revenue</div>
            </div>
            <div>
              <div style="font-size:22px;font-weight:700;color:${s.waste_value > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${fc(s.waste_value)}</div>
              <div style="font-size:12px;color:var(--text-muted)">Waste This Month (${s.waste_entries} entries)</div>
            </div>
          </div>
        </div>
      </div>
    `
  },

  showSetOpeningBalance() {
    const body = `
      <div class="form-group">
        <label for="ob-amount">Opening Cash Amount</label>
        <input type="number" id="ob-amount" class="form-control" placeholder="e.g. 5000" min="0" step="any" autofocus>
      </div>
      <div class="form-group">
        <label for="ob-notes">Notes <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input type="text" id="ob-notes" class="form-control" placeholder="e.g. From yesterday's closing">
      </div>
    `
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Dashboard.saveOpeningBalance()">Save</button>
    `
    App.showModal('Set Opening Balance', body, footer, { size: 'sm' })
    document.getElementById('ob-amount').focus()
    document.getElementById('ob-amount').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Dashboard.saveOpeningBalance()
    })
  },

  async saveOpeningBalance() {
    const amountEl = document.getElementById('ob-amount')
    const notesEl = document.getElementById('ob-notes')
    const amount = parseFloat(amountEl.value)
    if (isNaN(amount) || amount < 0) {
      App.showToast('Please enter a valid amount', 'error')
      return
    }
    const res = await window.api.openingBalance.set({ amount, notes: notesEl.value.trim() })
    if (res.success) {
      App.closeModal()
      App.showToast('Opening balance saved', 'success')
      Dashboard.render()
    } else {
      App.showToast('Failed to save opening balance', 'error')
    }
  }
}
