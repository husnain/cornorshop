'use strict'

const Expenses = {
  expenses: [],
  CATEGORIES: ['Rent', 'Utilities', 'Wages', 'Transport', 'Packaging', 'Maintenance', 'Marketing', 'Other'],

  async render() {
    const content = document.getElementById('content')
    content.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    const res = await window.api.expenses.getAll()
    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    Expenses.expenses = res.expenses
    const fc = App.formatCurrency

    const todayStr = App.todayISO()
    const monthStart = todayStr.slice(0, 7) + '-01'

    const thisMonth = Expenses.expenses.filter(e => e.expense_date >= monthStart && e.expense_date <= todayStr)
    const monthTotal = thisMonth.reduce((s, e) => s + e.amount, 0)
    const allTotal = Expenses.expenses.reduce((s, e) => s + e.amount, 0)

    const catMap = {}
    for (const e of thisMonth) {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount
    }
    const catBreakdown = Object.entries(catMap).sort((a, b) => b[1] - a[1])

    const methodLabel = m => ({ cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' }[m] || m)

    const rows = Expenses.expenses.map(e => `
      <tr>
        <td>${App.formatDate(e.expense_date)}</td>
        <td><span class="badge badge-primary">${e.category}</span></td>
        <td style="font-weight:500">${e.description}</td>
        <td class="text-right" style="font-weight:600">${fc(e.amount)}</td>
        <td>${methodLabel(e.payment_method)}</td>
        <td>${e.notes || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${e.recorded_by || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-danger" onclick="Expenses.deleteExpense(${e.id})">Delete</button>
        </td>
      </tr>
    `).join('') || `
      <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No expenses recorded yet</td></tr>
    `

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Expenses</div>
          <div class="page-subtitle">Track operational costs and overheads</div>
        </div>
        <button class="btn btn-primary" id="btn-add-expense">+ Add Expense</button>
      </div>

      <div class="stats-grid mb-2">
        <div class="stat-card blue">
          <div class="stat-icon">📅</div>
          <div class="stat-label">This Month</div>
          <div class="stat-value">${fc(monthTotal)}</div>
          <div class="stat-sub">${thisMonth.length} expense${thisMonth.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-label">All Time Total</div>
          <div class="stat-value">${fc(allTotal)}</div>
          <div class="stat-sub">${Expenses.expenses.length} records</div>
        </div>
        ${catBreakdown.length > 0 ? `
        <div class="stat-card" style="grid-column:span 2">
          <div class="stat-label" style="margin-bottom:8px;font-weight:600">This Month by Category</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${catBreakdown.map(([cat, amt]) => `
              <span class="badge badge-primary" style="font-size:12px;padding:4px 12px">
                ${cat}: ${fc(amt)}
              </span>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th class="text-right">Amount</th>
              <th>Method</th>
              <th>Notes</th>
              <th>By</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-expense').addEventListener('click', () => Expenses.showAddModal())
  },

  showAddModal() {
    const catOptions = Expenses.CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')

    const body = `
      <form id="expense-form">
        <div class="form-group">
          <label>Category *</label>
          <select name="category" required>${catOptions}</select>
        </div>
        <div class="form-group">
          <label>Description *</label>
          <input type="text" name="description" placeholder="e.g. Monthly shop rent" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="expense_date" value="${App.todayISO()}" required>
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
          <input type="text" name="notes" placeholder="Optional notes">
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-expense">Add Expense</button>
    `

    App.showModal('Add Expense', body, footer, { size: 'sm' })

    document.getElementById('btn-save-expense').addEventListener('click', async () => {
      const form = document.getElementById('expense-form')
      const category = form.category.value
      const description = form.description.value.trim()
      const expense_date = form.expense_date.value
      const amount = parseFloat(form.amount.value)
      const payment_method = form.payment_method.value
      const notes = form.notes.value.trim()

      if (!description) { App.showToast('Description is required', 'error'); return }
      if (!expense_date) { App.showToast('Date is required', 'error'); return }
      if (!amount || amount <= 0) { App.showToast('Amount must be greater than zero', 'error'); return }

      const btn = document.getElementById('btn-save-expense')
      btn.disabled = true
      btn.textContent = 'Saving...'

      const res = await window.api.expenses.create({
        category, description, amount, payment_method, expense_date, notes: notes || null
      })

      if (res.success) {
        App.closeModal()
        App.showToast('Expense added successfully', 'success')
        await Expenses.render()
      } else {
        App.showToast(res.error || 'Failed to add expense', 'error')
        btn.disabled = false
        btn.textContent = 'Add Expense'
      }
    })
  },

  async deleteExpense(id) {
    if (!App.confirm('Delete this expense? This cannot be undone.')) return
    const res = await window.api.expenses.delete(id)
    if (res.success) {
      App.showToast('Expense deleted', 'success')
      await Expenses.render()
    } else {
      App.showToast(res.error || 'Failed to delete expense', 'error')
    }
  }
}
