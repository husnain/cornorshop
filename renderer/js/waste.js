'use strict'

const Waste = {
  async render() {
    const content = document.getElementById('content')
    const res = await window.api.waste.getAll()

    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    const entries = res.entries
    const totalValue = entries.reduce((sum, e) => sum + (e.cost_value || 0), 0)

    const rows = entries.map(e => `
      <tr>
        <td>${App.formatDateTime(e.logged_at)}</td>
        <td><strong>${e.product_name}</strong></td>
        <td class="text-right">${Number(e.quantity).toFixed(2)} ${e.unit}</td>
        <td class="text-right">${App.formatCurrency(e.cost_value)}</td>
        <td><span class="badge badge-secondary">${e.reason}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${e.notes || '—'}</td>
        <td style="color:var(--text-muted);font-size:12px">${e.logged_by || '—'}</td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">
          No waste entries recorded yet.
        </td>
      </tr>
    `

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Waste & Spoilage Log</div>
          <div class="page-subtitle">${entries.length} entries · Total cost: ${App.formatCurrency(totalValue)}</div>
        </div>
        <button class="btn btn-primary" id="btn-log-waste">+ Log Waste</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Product</th>
              <th class="text-right">Qty Written Off</th>
              <th class="text-right">Cost Value</th>
              <th>Reason</th>
              <th>Notes</th>
              <th>Logged By</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `

    document.getElementById('btn-log-waste').addEventListener('click', () => Waste.showLogModal())
  },

  async showLogModal(preselectedProductId = null) {
    const prodsRes = await window.api.products.getAll()
    if (!prodsRes.success) { App.showToast('Failed to load products', 'error'); return }

    const products = prodsRes.products.filter(p => p.stock_quantity > 0)
    const productOptions = products.map(p =>
      `<option value="${p.id}" ${preselectedProductId === p.id ? 'selected' : ''}>
        ${p.name} (stock: ${Number(p.stock_quantity).toFixed(1)} ${p.unit})
      </option>`
    ).join('')

    const body = `
      <form id="waste-form">
        <div class="form-group">
          <label>Product *</label>
          <select name="product_id" id="waste-product-select" required>
            <option value="">— Select a product —</option>
            ${productOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantity Written Off *</label>
            <input type="number" name="quantity" id="waste-qty" step="0.01" min="0.01" required placeholder="0">
          </div>
          <div class="form-group">
            <label>Reason</label>
            <select name="reason">
              <option value="Spoiled">Spoiled</option>
              <option value="Expired">Expired</option>
              <option value="Damaged">Damaged</option>
              <option value="Theft">Theft</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notes <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="text" name="notes" placeholder="e.g. Dropped crate, smashed bottles">
        </div>
        <div id="waste-cost-preview" style="display:none;padding:10px 12px;background:var(--bg-secondary);border-radius:6px;font-size:13px;margin-top:4px">
          Estimated write-off cost: <strong id="waste-cost-value">—</strong>
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-waste">Log Waste</button>
    `

    App.showModal('Log Waste / Spoilage', body, footer)

    // Live cost preview
    const updateCostPreview = () => {
      const productId = parseInt(document.getElementById('waste-product-select').value)
      const qty = parseFloat(document.getElementById('waste-qty').value) || 0
      const product = products.find(p => p.id === productId)
      const preview = document.getElementById('waste-cost-preview')
      const valueEl = document.getElementById('waste-cost-value')
      if (product && qty > 0) {
        preview.style.display = 'block'
        valueEl.textContent = App.formatCurrency(qty * product.purchase_price)
      } else {
        preview.style.display = 'none'
      }
    }
    document.getElementById('waste-product-select').addEventListener('change', updateCostPreview)
    document.getElementById('waste-qty').addEventListener('input', updateCostPreview)

    document.getElementById('btn-confirm-waste').addEventListener('click', async () => {
      const form = document.getElementById('waste-form')
      const fd = new FormData(form)
      const product_id = parseInt(fd.get('product_id'))
      const quantity = parseFloat(fd.get('quantity'))
      const reason = fd.get('reason')
      const notes = fd.get('notes').trim()

      if (!product_id) { App.showToast('Please select a product', 'error'); return }
      if (!quantity || quantity <= 0) { App.showToast('Please enter a valid quantity', 'error'); return }

      const btn = document.getElementById('btn-confirm-waste')
      btn.disabled = true
      btn.textContent = 'Saving…'

      const res = await window.api.waste.log({ product_id, quantity, reason, notes: notes || null })

      if (res.success) {
        App.closeModal()
        App.showToast(`Waste logged — ${App.formatCurrency(res.cost_value)} written off`, 'warning')
        await Waste.render()
      } else {
        App.showToast(res.error || 'Failed to log waste', 'error')
        btn.disabled = false
        btn.textContent = 'Log Waste'
      }
    })
  }
}
