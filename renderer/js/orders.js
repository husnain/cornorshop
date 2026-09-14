'use strict'

const Orders = {
  _page: 1,
  _pageSize: 20,
  _query: '',
  _startDate: '',
  _endDate: '',
  _debounceTimer: null,

  async render() {
    const content = document.getElementById('content')
    content.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    Orders._page = 1
    Orders._query = ''
    Orders._startDate = ''
    Orders._endDate = ''

    const todayStr = App.todayISO()
    const monthStart = todayStr.slice(0, 7) + '-01'

    const [todayRes, monthRes] = await Promise.all([
      window.api.sales.search({ startDate: todayStr, endDate: todayStr, page: 1, pageSize: 1 }),
      window.api.sales.search({ startDate: monthStart, endDate: todayStr, page: 1, pageSize: 1 })
    ])

    const todayCount  = todayRes.success  ? todayRes.total  : 0
    const monthCount  = monthRes.success  ? monthRes.total  : 0

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Orders</div>
          <div class="page-subtitle">Search, view, and reprint past receipts</div>
        </div>
      </div>

      <div class="stats-grid mb-2" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-card blue">
          <div class="stat-icon">📋</div>
          <div class="stat-label">Today's Orders</div>
          <div class="stat-value">${todayCount}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-icon">📅</div>
          <div class="stat-label">This Month</div>
          <div class="stat-value">${monthCount}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;padding:16px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:200px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Search</label>
            <input type="search" id="orders-search" placeholder="Receipt #, cashier name…" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">From</label>
            <input type="date" id="orders-date-start" style="width:150px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">To</label>
            <input type="date" id="orders-date-end" style="width:150px">
          </div>
          <button class="btn btn-secondary btn-sm" id="orders-clear-btn">Clear</button>
        </div>
      </div>

      <div class="card">
        <div id="orders-table-wrap"></div>
        <div id="orders-pagination" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;flex-wrap:wrap;gap:8px"></div>
      </div>
    `

    document.getElementById('orders-search').addEventListener('input', (e) => {
      clearTimeout(Orders._debounceTimer)
      Orders._debounceTimer = setTimeout(() => {
        Orders._query = e.target.value.trim()
        Orders._page = 1
        Orders._loadTable()
      }, 300)
    })

    document.getElementById('orders-date-start').addEventListener('change', (e) => {
      Orders._startDate = e.target.value
      Orders._page = 1
      Orders._loadTable()
    })

    document.getElementById('orders-date-end').addEventListener('change', (e) => {
      Orders._endDate = e.target.value
      Orders._page = 1
      Orders._loadTable()
    })

    document.getElementById('orders-clear-btn').addEventListener('click', () => {
      Orders._query = ''
      Orders._startDate = ''
      Orders._endDate = ''
      Orders._page = 1
      document.getElementById('orders-search').value = ''
      document.getElementById('orders-date-start').value = ''
      document.getElementById('orders-date-end').value = ''
      Orders._loadTable()
    })

    await Orders._loadTable()
  },

  async _loadTable() {
    const wrap = document.getElementById('orders-table-wrap')
    const paginationEl = document.getElementById('orders-pagination')
    if (!wrap) return

    wrap.innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner" style="margin:auto"></div></div>'

    const res = await window.api.sales.search({
      query: Orders._query || undefined,
      startDate: Orders._startDate || undefined,
      endDate: Orders._endDate || undefined,
      page: Orders._page,
      pageSize: Orders._pageSize
    })

    if (!res.success) {
      wrap.innerHTML = `<div class="alert alert-danger" style="margin:16px">${res.error}</div>`
      return
    }

    const { sales, total, page, totalPages } = res
    const fc = App.formatCurrency

    const payBadge = (m) => {
      const map = { cash: 'badge-success', card: 'badge-info', online: 'badge-primary', credit: 'badge-warning' }
      return `<span class="badge ${map[m] || 'badge-secondary'}">${(m || 'cash').toUpperCase()}</span>`
    }

    const rows = sales.length ? sales.map(s => `
      <tr>
        <td style="font-weight:600">#${s.id}</td>
        <td>${App.formatDateTime(s.sale_date)}</td>
        <td>${s.cashier_name || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:center">${s.item_count}</td>
        <td style="font-weight:600;text-align:right">${fc(s.total)}</td>
        <td style="text-align:center">${payBadge(s.payment_method)}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn btn-sm btn-secondary" style="margin-right:4px" onclick="Orders.viewOrder(${s.id})">View</button>
          <button class="btn btn-sm btn-primary" onclick="Orders.reprintReceipt(${s.id})">🖨️ Print</button>
        </td>
      </tr>
    `).join('') : `
      <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No orders found</td></tr>
    `

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Receipt #</th>
            <th>Date & Time</th>
            <th>Cashier</th>
            <th style="text-align:center">Items</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:center">Payment</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `

    // Pagination
    if (!paginationEl) return
    if (total === 0) { paginationEl.innerHTML = ''; return }

    const start = (page - 1) * Orders._pageSize + 1
    const end   = Math.min(page * Orders._pageSize, total)

    const pageButtons = Orders._buildPageButtons(page, totalPages)

    paginationEl.innerHTML = `
      <span style="font-size:13px;color:var(--text-muted)">Showing ${start}–${end} of ${total} orders</span>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="btn btn-sm btn-secondary" onclick="Orders._goPage(1)" ${page === 1 ? 'disabled' : ''}>«</button>
        <button class="btn btn-sm btn-secondary" onclick="Orders._goPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>
        ${pageButtons}
        <button class="btn btn-sm btn-secondary" onclick="Orders._goPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>›</button>
        <button class="btn btn-sm btn-secondary" onclick="Orders._goPage(${totalPages})" ${page === totalPages ? 'disabled' : ''}>»</button>
      </div>
    `
  },

  _buildPageButtons(current, total) {
    const pages = []
    let prev = null
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || (p >= current - 2 && p <= current + 2)) {
        if (prev !== null && p - prev > 1) pages.push('…')
        pages.push(p)
        prev = p
      }
    }
    return pages.map(p => {
      if (p === '…') return `<span style="padding:0 4px;color:var(--text-muted)">…</span>`
      const active = p === current
      return `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" onclick="Orders._goPage(${p})" ${active ? 'disabled' : ''}>${p}</button>`
    }).join('')
  },

  async _goPage(p) {
    Orders._page = p
    await Orders._loadTable()
    document.getElementById('orders-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  },

  async viewOrder(id) {
    const res = await window.api.sales.getById(id)
    if (!res.success) { App.showToast('Failed to load order details', 'error'); return }

    const sale = res.sale
    const fc = App.formatCurrency

    const itemRows = (sale.items || []).map(item => `
      <tr>
        <td>${item.product_name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${fc(item.unit_price)}</td>
        <td style="text-align:right;font-weight:600">${fc(item.total_price)}</td>
      </tr>
    `).join('')

    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div><span style="font-size:12px;color:var(--text-muted)">Receipt #</span><br><strong>#${sale.id}</strong></div>
        <div><span style="font-size:12px;color:var(--text-muted)">Date & Time</span><br><strong>${App.formatDateTime(sale.sale_date)}</strong></div>
        <div><span style="font-size:12px;color:var(--text-muted)">Cashier</span><br><strong>${sale.cashier_name || '—'}</strong></div>
        <div><span style="font-size:12px;color:var(--text-muted)">Payment</span><br><strong>${(sale.payment_method || 'cash').toUpperCase()}</strong></div>
      </div>

      <table class="table" style="margin-bottom:12px">
        <thead>
          <tr>
            <th>Item</th>
            <th style="text-align:center">Qty</th>
            <th style="text-align:right">Unit Price</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="border-top:1px solid var(--border);padding-top:10px;display:grid;gap:4px;font-size:14px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${fc(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Discount</span><span style="color:var(--danger)">-${fc(sale.discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;border-top:1px solid var(--border);padding-top:6px;margin-top:2px"><span>Total</span><span>${fc(sale.total)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>Amount Paid</span><span>${fc(sale.amount_paid)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>Change</span><span>${fc(sale.change_amount)}</span></div>
      </div>
      ${sale.notes ? `<div style="margin-top:10px;padding:8px;background:var(--bg-secondary);border-radius:6px;font-size:13px"><strong>Notes:</strong> ${sale.notes}</div>` : ''}
    `

    App.showModal(`Order #${sale.id}`, body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      <button class="btn btn-primary" onclick="Orders.reprintReceipt(${sale.id});App.closeModal()">🖨️ Print Receipt</button>
    `, { size: 'lg' })
  },

  async reprintReceipt(id) {
    const res = await window.api.sales.getById(id)
    if (!res.success) { App.showToast('Failed to load order', 'error'); return }
    const printRes = await window.api.receipt.print(res.sale)
    if (!printRes.success) App.showToast('Print failed', 'error')
  }
}
