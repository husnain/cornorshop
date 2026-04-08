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
        <div class="stat-card orange">
          <div class="stat-icon">📅</div>
          <div class="stat-label">Week Sales</div>
          <div class="stat-value">${fc(s.week_sales)}</div>
          <div class="stat-sub">Month: ${fc(s.month_sales)}</div>
        </div>
        <div class="stat-card ${lowStockClass}">
          <div class="stat-icon">⚠️</div>
          <div class="stat-label">Low Stock Items</div>
          <div class="stat-value">${s.low_stock_count}</div>
          <div class="stat-sub">Inventory: ${fc(s.inventory_value)}</div>
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
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center">
            <div>
              <div style="font-size:24px;font-weight:700;color:var(--primary)">${fc(s.inventory_value)}</div>
              <div style="font-size:12px;color:var(--text-muted)">Total Inventory Value</div>
            </div>
            <div>
              <div style="font-size:24px;font-weight:700;color:${s.low_stock_count > 0 ? 'var(--danger)' : 'var(--success)'}">${s.low_stock_count}</div>
              <div style="font-size:12px;color:var(--text-muted)">Low Stock Items</div>
            </div>
            <div>
              <div style="font-size:24px;font-weight:700;color:var(--info)">${fc(s.month_sales)}</div>
              <div style="font-size:12px;color:var(--text-muted)">This Month's Revenue</div>
            </div>
          </div>
        </div>
      </div>
    `
  }
}
