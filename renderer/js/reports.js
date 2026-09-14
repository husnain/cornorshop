'use strict'

const Reports = {
  startDate: '',
  endDate: '',
  _data: null,
  _activeTab: 'overview',

  _localDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  async render() {
    const content = document.getElementById('content')

    if (!Reports.startDate || !Reports.endDate) {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      Reports.startDate = Reports._localDate(monday)
      Reports.endDate = Reports._localDate(today)
    }

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Sales Reports</div>
          <div class="page-subtitle">Analyze your shop's performance</div>
        </div>
      </div>

      <div class="card mb-2">
        <div class="card-body" style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
          <div class="form-group mb-0">
            <label>Start Date</label>
            <input type="date" id="report-start" value="${Reports.startDate}" style="width:160px">
          </div>
          <div class="form-group mb-0">
            <label>End Date</label>
            <input type="date" id="report-end" value="${Reports.endDate}" style="width:160px">
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-generate-report">📊 Generate</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('today')">Today</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('week')">This Week</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('month')">This Month</button>
            <button class="btn btn-secondary" id="btn-export-csv" onclick="Reports.exportCSV()">⬇ Export CSV</button>
          </div>
        </div>
      </div>

      <div id="report-content">
        <div class="loading-wrapper"><div class="spinner"></div></div>
      </div>
    `

    document.getElementById('btn-generate-report').addEventListener('click', () => {
      Reports.startDate = document.getElementById('report-start').value
      Reports.endDate = document.getElementById('report-end').value
      Reports.loadReport()
    })

    Reports.loadReport()
  },

  setPreset(preset) {
    const today = new Date()
    let start, end

    if (preset === 'today') {
      start = end = Reports._localDate(today)
    } else if (preset === 'week') {
      const day = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      start = Reports._localDate(monday)
      end = Reports._localDate(today)
    } else if (preset === 'month') {
      start = Reports._localDate(new Date(today.getFullYear(), today.getMonth(), 1))
      end = Reports._localDate(today)
    }

    Reports.startDate = start
    Reports.endDate = end

    const startEl = document.getElementById('report-start')
    const endEl = document.getElementById('report-end')
    if (startEl) startEl.value = start
    if (endEl) endEl.value = end

    Reports.loadReport()
  },

  switchTab(tab) {
    Reports._activeTab = tab
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab)
    })
    document.querySelectorAll('.report-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.tab === tab)
    })
  },

  async exportCSV() {
    if (!Reports._data) {
      App.showToast('Generate a report first', 'warning')
      return
    }

    const { daily, totals, expensesByCategory, salesByCategory, topProducts, slowStock, paymentSplit } = Reports._data
    const netProfit = totals.total_profit - (totals.total_expenses || 0)

    const esc = v => {
      const s = String(v == null ? '' : v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const row = (...cols) => cols.map(esc).join(',')

    const lines = []
    lines.push(row('Report Period', `${Reports.startDate} to ${Reports.endDate}`))
    lines.push(row('Generated', new Date().toLocaleString()))
    lines.push('')

    lines.push(row('SUMMARY'))
    lines.push(row('Total Revenue', totals.total_revenue))
    lines.push(row('Cost of Goods Sold', totals.total_cost))
    lines.push(row('Gross Profit', totals.total_profit))
    lines.push(row('Total Expenses', totals.total_expenses || 0))
    lines.push(row('Net Profit', netProfit))
    lines.push(row('Total Transactions', totals.total_transactions))
    lines.push('')

    lines.push(row('DAILY BREAKDOWN'))
    lines.push(row('Date', 'Transactions', 'Revenue', 'Cost', 'Gross Profit', 'Margin %'))
    for (const d of daily) {
      const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '0.0'
      lines.push(row(d.sale_day, d.transactions, d.revenue, d.cost, d.profit, margin))
    }
    lines.push('')

    if ((salesByCategory || []).length > 0) {
      lines.push(row('SALES BY CATEGORY'))
      lines.push(row('Category', 'Units Sold', 'Revenue', 'Cost', 'Profit'))
      for (const c of salesByCategory) {
        lines.push(row(c.category, c.total_qty, c.total_revenue, c.total_cost, c.total_profit))
      }
      lines.push('')
    }

    if ((topProducts || []).length > 0) {
      lines.push(row('TOP SELLING PRODUCTS'))
      lines.push(row('Product', 'Category', 'Units Sold', 'Revenue', 'Cost', 'Profit', 'Margin %'))
      for (const p of topProducts) {
        const margin = p.total_revenue > 0 ? ((p.total_profit / p.total_revenue) * 100).toFixed(1) : '0.0'
        lines.push(row(p.product_name, p.category, `${p.total_qty} ${p.unit}`, p.total_revenue, p.total_cost, p.total_profit, margin))
      }
      lines.push('')
    }

    if ((slowStock || []).length > 0) {
      lines.push(row('SLOW / DEAD STOCK'))
      lines.push(row('Product', 'Category', 'Stock', 'Unit', 'Selling Price', 'Stock Value'))
      for (const s of slowStock) {
        lines.push(row(s.name, s.category, s.stock_quantity, s.unit, s.selling_price, s.stock_value))
      }
      lines.push('')
    }

    if ((paymentSplit || []).length > 0) {
      lines.push(row('PAYMENT METHODS'))
      lines.push(row('Method', 'Transactions', 'Revenue'))
      for (const p of paymentSplit) {
        lines.push(row(p.payment_method, p.count, p.total))
      }
      lines.push('')
    }

    if ((expensesByCategory || []).length > 0) {
      lines.push(row('EXPENSES BY CATEGORY'))
      lines.push(row('Category', 'Amount'))
      for (const e of expensesByCategory) {
        lines.push(row(e.category, e.total))
      }
      lines.push('')
    }

    const csv = lines.join('\r\n')
    const defaultName = `report-${Reports.startDate}-to-${Reports.endDate}.csv`

    const btn = document.getElementById('btn-export-csv')
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...' }

    const res = await window.api.reports.saveCSV({ csv, defaultName })

    if (btn) { btn.disabled = false; btn.textContent = '⬇ Export CSV' }
    if (res.success) App.showToast('Report saved successfully', 'success')
    else if (res.error !== 'Cancelled') App.showToast(res.error || 'Failed to save report', 'error')
  },

  async loadReport() {
    const reportContent = document.getElementById('report-content')
    if (!reportContent) return

    reportContent.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    const res = await window.api.reports.getSalesReport({ start: Reports.startDate, end: Reports.endDate })

    if (!res.success) {
      reportContent.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    Reports._data = res
    const { daily, totals, expensesByCategory, salesByCategory, topProducts, slowStock, hourlyPattern, paymentSplit } = res
    const fc = App.formatCurrency

    const netProfit = totals.total_profit - (totals.total_expenses || 0)
    const profitMargin = totals.total_revenue > 0 ? ((totals.total_profit / totals.total_revenue) * 100).toFixed(1) : '0.0'
    const netMargin = totals.total_revenue > 0 ? ((netProfit / totals.total_revenue) * 100).toFixed(1) : '0.0'

    // ── Overview tab content ──────────────────────────────────────────────────

    const summaryCards = `
      <div class="stats-grid mb-2">
        <div class="stat-card green">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value">${fc(totals.total_revenue)}</div>
          <div class="stat-sub">${totals.total_transactions} transactions</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-label">Cost of Goods</div>
          <div class="stat-value">${fc(totals.total_cost)}</div>
          <div class="stat-sub">Cost of goods sold</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-icon">📈</div>
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value">${fc(totals.total_profit)}</div>
          <div class="stat-sub">Margin: ${profitMargin}%</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-icon">🧾</div>
          <div class="stat-label">Expenses</div>
          <div class="stat-value">${fc(totals.total_expenses || 0)}</div>
          <div class="stat-sub">${totals.expense_count || 0} expense${(totals.expense_count || 0) !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card ${netProfit >= 0 ? 'green' : 'red'}" style="grid-column:span 2">
          <div class="stat-icon">${netProfit >= 0 ? '✅' : '⚠️'}</div>
          <div class="stat-label">Net Profit</div>
          <div class="stat-value">${fc(netProfit)}</div>
          <div class="stat-sub">Gross profit minus expenses &nbsp;|&nbsp; Net margin: ${netMargin}%</div>
        </div>
      </div>
    `

    const maxRevenue = Math.max(...daily.map(d => d.revenue), 1)
    const chartBars = daily.map(d => {
      const heightPct = Math.round((d.revenue / maxRevenue) * 100)
      const label = d.sale_day ? d.sale_day.slice(5) : ''
      return `
        <div class="bar-wrap" title="${d.sale_day}: ${fc(d.revenue)}">
          <div class="bar-value">${d.revenue > 0 ? fc(d.revenue) : ''}</div>
          <div class="bar" style="height:${Math.max(heightPct, 2)}%"></div>
          <div class="bar-label">${label}</div>
        </div>
      `
    }).join('')

    const dailyRows = daily.map(d => `
      <tr>
        <td>${App.formatDate(d.sale_day)}</td>
        <td class="text-center">${d.transactions}</td>
        <td class="text-right">${fc(d.revenue)}</td>
        <td class="text-right">${fc(d.cost)}</td>
        <td class="text-right text-success font-bold">${fc(d.profit)}</td>
        <td class="text-right">${d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) + '%' : '—'}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No sales data for this period</td></tr>`

    const expenseCatRows = (expensesByCategory || []).map(e => `
      <tr>
        <td><span class="badge badge-primary">${e.category}</span></td>
        <td class="text-right" style="font-weight:600">${fc(e.total)}</td>
      </tr>
    `).join('') || `<tr><td colspan="2" style="color:var(--text-muted);padding:8px 0">No expenses in this period</td></tr>`

    const overviewHTML = `
      ${summaryCards}

      ${daily.length > 0 ? `
      <div class="card mb-2">
        <div class="card-header">
          <div class="card-title">Daily Revenue (${Reports.startDate} to ${Reports.endDate})</div>
        </div>
        <div class="card-body">
          <div class="bar-chart">${chartBars}</div>
        </div>
      </div>` : ''}

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-center">Transactions</th>
              <th class="text-right">Revenue</th>
              <th class="text-right">Cost</th>
              <th class="text-right">Profit</th>
              <th class="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>${dailyRows}</tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL</strong></td>
              <td class="text-center"><strong>${totals.total_transactions}</strong></td>
              <td class="text-right"><strong>${fc(totals.total_revenue)}</strong></td>
              <td class="text-right"><strong>${fc(totals.total_cost)}</strong></td>
              <td class="text-right text-success"><strong>${fc(totals.total_profit)}</strong></td>
              <td class="text-right"><strong>${profitMargin}%</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${(expensesByCategory || []).length > 0 ? `
      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Expenses Breakdown</div></div>
        <div class="card-body" style="max-width:400px">
          <table>
            <thead><tr><th>Category</th><th class="text-right">Total</th></tr></thead>
            <tbody>${expenseCatRows}</tbody>
            <tfoot>
              <tr>
                <td><strong>Total Expenses</strong></td>
                <td class="text-right"><strong>${fc(totals.total_expenses || 0)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>` : ''}
    `

    // ── Products tab content ──────────────────────────────────────────────────

    const maxCatRev = Math.max(...(salesByCategory || []).map(c => c.total_revenue), 1)
    const categoryRows = (salesByCategory || []).map((c, i) => {
      const barWidth = Math.round((c.total_revenue / maxCatRev) * 100)
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      return `
        <tr>
          <td><span style="margin-right:6px">${medal}</span>${c.category}</td>
          <td class="text-center">${c.total_qty}</td>
          <td class="text-right">${fc(c.total_revenue)}</td>
          <td class="text-right">${fc(c.total_cost)}</td>
          <td class="text-right text-success">${fc(c.total_profit)}</td>
          <td style="width:120px;padding-right:12px">
            <div style="background:var(--border-color,#dee2e6);border-radius:4px;height:8px;overflow:hidden">
              <div style="background:var(--primary);height:100%;width:${barWidth}%;border-radius:4px"></div>
            </div>
          </td>
        </tr>
      `
    }).join('') || `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">No category sales in this period</td></tr>`

    const maxProdRev = Math.max(...(topProducts || []).map(p => p.total_revenue), 1)
    const topProductRows = (topProducts || []).map((p, i) => {
      const margin = p.total_revenue > 0 ? ((p.total_profit / p.total_revenue) * 100).toFixed(1) : '0.0'
      const barWidth = Math.round((p.total_revenue / maxProdRev) * 100)
      return `
        <tr>
          <td style="font-weight:500">${i + 1}. ${p.product_name}</td>
          <td><span class="badge badge-secondary">${p.category}</span></td>
          <td class="text-center">${p.total_qty} ${p.unit}</td>
          <td class="text-right">${fc(p.total_revenue)}</td>
          <td class="text-right text-success">${fc(p.total_profit)}</td>
          <td class="text-right">${margin}%</td>
          <td style="width:100px;padding-right:12px">
            <div style="background:var(--border-light);border-radius:4px;height:8px;overflow:hidden">
              <div style="background:var(--accent);height:100%;width:${barWidth}%;border-radius:4px"></div>
            </div>
          </td>
        </tr>
      `
    }).join('') || `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">No product sales in this period</td></tr>`

    const slowStockTotal = (slowStock || []).reduce((s, p) => s + p.stock_value, 0)
    const slowStockRows = (slowStock || []).map(p => `
      <tr>
        <td style="font-weight:500">${p.name}</td>
        <td><span class="badge badge-secondary">${p.category}</span></td>
        <td class="text-center">${p.stock_quantity} ${p.unit}</td>
        <td class="text-right">${fc(p.selling_price)}</td>
        <td class="text-right" style="color:var(--warning);font-weight:600">${fc(p.stock_value)}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">✅ All stocked products sold at least once in this period</td></tr>`

    const productsHTML = `
      <div class="card mb-2">
        <div class="card-header"><div class="card-title">Sales by Category</div></div>
        <div class="card-body" style="padding:0">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th class="text-center">Units Sold</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Cost</th>
                <th class="text-right">Profit</th>
                <th style="width:120px">Revenue Share</th>
              </tr>
            </thead>
            <tbody>${categoryRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card mb-2">
        <div class="card-header"><div class="card-title">Top Selling Products</div></div>
        <div class="card-body" style="padding:0">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th class="text-center">Qty Sold</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Profit</th>
                <th class="text-right">Margin</th>
                <th style="width:100px">Share</th>
              </tr>
            </thead>
            <tbody>${topProductRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Slow / Dead Stock</div>
          <div class="card-subtitle">Products with stock on hand but no sales in this period</div>
        </div>
        <div class="card-body" style="padding:0">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th class="text-center">Stock</th>
                <th class="text-right">Selling Price</th>
                <th class="text-right">Stock Value</th>
              </tr>
            </thead>
            <tbody>${slowStockRows}</tbody>
            ${(slowStock || []).length > 0 ? `
            <tfoot>
              <tr>
                <td colspan="4"><strong>Total Tied-up Value</strong></td>
                <td class="text-right"><strong style="color:var(--warning)">${fc(slowStockTotal)}</strong></td>
              </tr>
            </tfoot>` : ''}
          </table>
        </div>
      </div>
    `

    // ── Operations tab content ────────────────────────────────────────────────

    // Build full 0–23 hour grid, filling gaps
    const hourMap = {}
    for (const h of (hourlyPattern || [])) hourMap[h.hour] = h
    const allHours = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, transactions: 0, revenue: 0 })
    const maxHourRev = Math.max(...allHours.map(h => h.revenue), 1)
    const peakHour = allHours.reduce((best, h) => h.revenue > best.revenue ? h : best, allHours[0])
    const fmt12 = h => {
      if (h === 0) return '12am'
      if (h < 12) return `${h}am`
      if (h === 12) return '12pm'
      return `${h - 12}pm`
    }

    const hourBars = allHours.map(h => {
      const heightPct = Math.round((h.revenue / maxHourRev) * 100)
      const isPeak = h.revenue > 0 && h.revenue === peakHour.revenue
      return `
        <div class="bar-wrap" title="${fmt12(h.hour)}: ${fc(h.revenue)} (${h.transactions} sales)">
          <div class="bar" style="height:${Math.max(heightPct, h.revenue > 0 ? 4 : 1)}%;background:${isPeak ? 'var(--primary)' : 'var(--accent)'}"></div>
          <div class="bar-label">${fmt12(h.hour)}</div>
        </div>
      `
    }).join('')

    const totalSales = (paymentSplit || []).reduce((s, p) => s + p.total, 0)
    const paymentRows = (paymentSplit || []).map(p => {
      const pct = totalSales > 0 ? ((p.total / totalSales) * 100).toFixed(1) : '0.0'
      const barWidth = Math.round((p.total / (totalSales || 1)) * 100)
      const label = p.payment_method ? p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1) : 'Unknown'
      return `
        <tr>
          <td style="font-weight:500">${label}</td>
          <td class="text-center">${p.count}</td>
          <td class="text-right">${fc(p.total)}</td>
          <td class="text-right">${pct}%</td>
          <td style="width:140px;padding-right:12px">
            <div style="background:var(--border-light);border-radius:4px;height:10px;overflow:hidden">
              <div style="background:var(--accent);height:100%;width:${barWidth}%;border-radius:4px"></div>
            </div>
          </td>
        </tr>
      `
    }).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">No sales data for this period</td></tr>`

    const operationsHTML = `
      <div class="card mb-2">
        <div class="card-header">
          <div class="card-title">Peak Hours</div>
          <div class="card-subtitle">${peakHour.revenue > 0 ? `Busiest hour: ${fmt12(peakHour.hour)} — ${fc(peakHour.revenue)} revenue` : 'No sales data for this period'}</div>
        </div>
        <div class="card-body">
          <div class="bar-chart" style="height:180px;gap:3px">${hourBars}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Payment Methods</div></div>
        <div class="card-body" style="padding:0">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th class="text-center">Transactions</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Share</th>
                <th style="width:140px"></th>
              </tr>
            </thead>
            <tbody>${paymentRows}</tbody>
            ${(paymentSplit || []).length > 0 ? `
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td class="text-center"><strong>${(paymentSplit || []).reduce((s, p) => s + p.count, 0)}</strong></td>
                <td class="text-right"><strong>${fc(totalSales)}</strong></td>
                <td class="text-right"><strong>100%</strong></td>
                <td></td>
              </tr>
            </tfoot>` : ''}
          </table>
        </div>
      </div>
    `

    // ── Render tabs ───────────────────────────────────────────────────────────

    const tabs = [
      { id: 'overview', label: '📊 Overview' },
      { id: 'products', label: '🛒 Products' },
      { id: 'operations', label: '⚙️ Operations' }
    ]

    reportContent.innerHTML = `
      <div class="report-tabs">
        ${tabs.map(t => `
          <button class="report-tab-btn ${Reports._activeTab === t.id ? 'active' : ''}"
            data-tab="${t.id}"
            onclick="Reports.switchTab('${t.id}')">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <div class="report-tab-panel ${Reports._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
        ${overviewHTML}
      </div>
      <div class="report-tab-panel ${Reports._activeTab === 'products' ? 'active' : ''}" data-tab="products">
        ${productsHTML}
      </div>
      <div class="report-tab-panel ${Reports._activeTab === 'operations' ? 'active' : ''}" data-tab="operations">
        ${operationsHTML}
      </div>
    `
  }
}
