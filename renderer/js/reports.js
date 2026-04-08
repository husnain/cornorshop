'use strict'

const Reports = {
  startDate: '',
  endDate: '',

  async render() {
    const content = document.getElementById('content')

    // Default: current week (Mon to today)
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=Sun
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

    Reports.startDate = Reports.startDate || monday.toISOString().slice(0, 10)
    Reports.endDate = Reports.endDate || today.toISOString().slice(0, 10)

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Sales Reports</div>
          <div class="page-subtitle">Analyze your shop's performance</div>
        </div>
      </div>

      <!-- Date Range Picker -->
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
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" id="btn-generate-report">📊 Generate Report</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('today')">Today</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('week')">This Week</button>
            <button class="btn btn-secondary" onclick="Reports.setPreset('month')">This Month</button>
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
      start = end = today.toISOString().slice(0, 10)
    } else if (preset === 'week') {
      const day = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      start = monday.toISOString().slice(0, 10)
      end = today.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
      end = today.toISOString().slice(0, 10)
    }

    Reports.startDate = start
    Reports.endDate = end

    const startEl = document.getElementById('report-start')
    const endEl = document.getElementById('report-end')
    if (startEl) startEl.value = start
    if (endEl) endEl.value = end

    Reports.loadReport()
  },

  async loadReport() {
    const reportContent = document.getElementById('report-content')
    if (!reportContent) return

    reportContent.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    const res = await window.api.reports.getSalesReport({
      start: Reports.startDate,
      end: Reports.endDate
    })

    if (!res.success) {
      reportContent.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    const { daily, totals } = res
    const fc = App.formatCurrency

    const profitMargin = totals.total_revenue > 0
      ? ((totals.total_profit / totals.total_revenue) * 100).toFixed(1)
      : '0.0'

    // Build bar chart
    const maxRevenue = Math.max(...daily.map(d => d.revenue), 1)
    const chartBars = daily.map(d => {
      const heightPct = Math.round((d.revenue / maxRevenue) * 100)
      const label = d.sale_day ? d.sale_day.slice(5) : '' // MM-DD
      return `
        <div class="bar-wrap" title="${d.sale_day}: ${fc(d.revenue)}">
          <div class="bar-value">${d.revenue > 0 ? fc(d.revenue) : ''}</div>
          <div class="bar" style="height:${Math.max(heightPct, 2)}%"></div>
          <div class="bar-label">${label}</div>
        </div>
      `
    }).join('')

    // Build daily table
    const tableRows = daily.map(d => `
      <tr>
        <td>${App.formatDate(d.sale_day)}</td>
        <td class="text-center">${d.transactions}</td>
        <td class="text-right">${fc(d.revenue)}</td>
        <td class="text-right">${fc(d.cost)}</td>
        <td class="text-right text-success font-bold">${fc(d.profit)}</td>
        <td class="text-right">${d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) + '%' : '—'}</td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">
          No sales data for this period
        </td>
      </tr>
    `

    reportContent.innerHTML = `
      <!-- Summary Cards -->
      <div class="stats-grid mb-2">
        <div class="stat-card green">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value">${fc(totals.total_revenue)}</div>
          <div class="stat-sub">${totals.total_transactions} transactions</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-label">Total Cost</div>
          <div class="stat-value">${fc(totals.total_cost)}</div>
          <div class="stat-sub">Cost of goods sold</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-icon">📈</div>
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value">${fc(totals.total_profit)}</div>
          <div class="stat-sub">Revenue minus cost</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon">%</div>
          <div class="stat-label">Profit Margin</div>
          <div class="stat-value">${profitMargin}%</div>
          <div class="stat-sub">Gross margin</div>
        </div>
      </div>

      <!-- Bar Chart -->
      ${daily.length > 0 ? `
      <div class="card mb-2">
        <div class="card-header">
          <div class="card-title">Daily Revenue (${Reports.startDate} to ${Reports.endDate})</div>
        </div>
        <div class="card-body">
          <div class="bar-chart">
            ${chartBars}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Daily Breakdown Table -->
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
          <tbody>
            ${tableRows}
          </tbody>
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
    `
  }
}
