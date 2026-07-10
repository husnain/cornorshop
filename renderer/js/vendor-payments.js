'use strict'

const VendorPayments = {
  payments: [],
  suppliers: [],
  balances: [],

  async render() {
    const content = document.getElementById('content')
    content.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    const [paymentsRes, suppliersRes, balancesRes] = await Promise.all([
      window.api.vendorPayments.getAll(),
      window.api.suppliers.getAll(),
      window.api.vendorPayments.getSupplierBalances()
    ])

    if (!paymentsRes.success) {
      content.innerHTML = `<div class="alert alert-danger">${paymentsRes.error}</div>`
      return
    }

    VendorPayments.payments = paymentsRes.payments
    VendorPayments.suppliers = suppliersRes.success ? suppliersRes.suppliers : []
    VendorPayments.balances = balancesRes.success ? balancesRes.balances : []

    const fc = App.formatCurrency
    const activeBalances = VendorPayments.balances.filter(b => b.total_purchased > 0 || b.total_paid > 0)

    const balanceCards = activeBalances.map(b => {
      const isOwed = b.balance_due > 0.005
      return `
        <div class="stat-card ${isOwed ? 'red' : 'green'}" style="min-width:180px;flex:1">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${b.name}</div>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.8">
            Purchased: ${fc(b.total_purchased)}<br>
            Paid: ${fc(b.total_paid)}
          </div>
          <div style="font-size:15px;font-weight:700;margin-top:6px;color:${isOwed ? 'var(--danger)' : 'var(--success)'}">
            ${isOwed ? 'Owed: ' + fc(b.balance_due) : 'Settled ✓'}
          </div>
        </div>
      `
    }).join('')

    const methodLabel = m => ({ cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' }[m] || m)

    const rows = VendorPayments.payments.map(p => `
      <tr>
        <td>${App.formatDate(p.payment_date)}</td>
        <td style="font-weight:600">${p.supplier_name}</td>
        <td>${p.delivery_id ? `Delivery #${p.delivery_id}` : '<span style="color:var(--text-muted)">General</span>'}</td>
        <td class="text-right" style="font-weight:600">${fc(p.amount)}</td>
        <td>${methodLabel(p.payment_method)}</td>
        <td>${p.notes || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${p.recorded_by || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-danger" onclick="VendorPayments.deletePayment(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('') || `
      <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No payments recorded yet</td></tr>
    `

    const totalPaid = VendorPayments.payments.reduce((s, p) => s + p.amount, 0)
    const totalOwed = activeBalances.reduce((s, b) => s + Math.max(0, b.balance_due), 0)

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Vendor Payments</div>
          <div class="page-subtitle">Track payments made to suppliers</div>
        </div>
        <button class="btn btn-primary" id="btn-add-payment">+ Record Payment</button>
      </div>

      <div class="stats-grid mb-2">
        <div class="stat-card">
          <div class="stat-icon">💸</div>
          <div class="stat-label">Total Paid</div>
          <div class="stat-value">${fc(totalPaid)}</div>
          <div class="stat-sub">${VendorPayments.payments.length} payment${VendorPayments.payments.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card red">
          <div class="stat-icon">⏳</div>
          <div class="stat-label">Outstanding Balance</div>
          <div class="stat-value">${fc(totalOwed)}</div>
          <div class="stat-sub">Across all suppliers</div>
        </div>
      </div>

      ${activeBalances.length > 0 ? `
      <div class="card mb-2">
        <div class="card-header"><div class="card-title">Supplier Balances</div></div>
        <div class="card-body">
          <div style="display:flex;gap:12px;flex-wrap:wrap">${balanceCards}</div>
        </div>
      </div>
      ` : ''}

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Reference</th>
              <th class="text-right">Amount</th>
              <th>Method</th>
              <th>Notes</th>
              <th>Recorded By</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-payment').addEventListener('click', () => VendorPayments.showAddModal())
  },

  showAddModal() {
    const supplierOptions = VendorPayments.suppliers.map(s =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('')

    const body = `
      <form id="payment-form">
        <div class="form-group">
          <label>Supplier *</label>
          <select name="supplier_id" required>
            <option value="">— Select Supplier —</option>
            ${supplierOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Payment Date *</label>
          <input type="date" name="payment_date" value="${App.todayISO()}" required>
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required>
        </div>
        <div class="form-group">
          <label>Payment Method</label>
          <select name="payment_method">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input type="text" name="notes" placeholder="e.g. Invoice #1234, Delivery reference">
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-payment">Record Payment</button>
    `

    App.showModal('Record Vendor Payment', body, footer, { size: 'sm' })

    document.getElementById('btn-save-payment').addEventListener('click', async () => {
      const form = document.getElementById('payment-form')
      const supplier_id = parseInt(form.supplier_id.value)
      const payment_date = form.payment_date.value
      const amount = parseFloat(form.amount.value)
      const payment_method = form.payment_method.value
      const notes = form.notes.value.trim()

      if (!supplier_id) { App.showToast('Please select a supplier', 'error'); return }
      if (!payment_date) { App.showToast('Payment date is required', 'error'); return }
      if (!amount || amount <= 0) { App.showToast('Amount must be greater than zero', 'error'); return }

      const supplier = VendorPayments.suppliers.find(s => s.id === supplier_id)
      const btn = document.getElementById('btn-save-payment')
      btn.disabled = true
      btn.textContent = 'Saving...'

      const res = await window.api.vendorPayments.create({
        supplier_id,
        supplier_name: supplier ? supplier.name : '',
        amount,
        payment_method,
        payment_date,
        notes: notes || null
      })

      if (res.success) {
        App.closeModal()
        App.showToast('Payment recorded successfully', 'success')
        await VendorPayments.render()
      } else {
        App.showToast(res.error || 'Failed to record payment', 'error')
        btn.disabled = false
        btn.textContent = 'Record Payment'
      }
    })
  },

  async deletePayment(id) {
    if (!App.confirm('Delete this payment record? This cannot be undone.')) return
    const res = await window.api.vendorPayments.delete(id)
    if (res.success) {
      App.showToast('Payment deleted', 'success')
      await VendorPayments.render()
    } else {
      App.showToast(res.error || 'Failed to delete payment', 'error')
    }
  }
}
