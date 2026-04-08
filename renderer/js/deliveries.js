'use strict'

const Deliveries = {
  deliveries: [],
  suppliers: [],
  products: [],

  async render() {
    const content = document.getElementById('content')

    const [delivRes, suppRes, prodRes] = await Promise.all([
      window.api.deliveries.getAll(),
      window.api.suppliers.getAll(),
      window.api.products.getAll()
    ])

    if (!delivRes.success) {
      content.innerHTML = `<div class="alert alert-danger">${delivRes.error}</div>`
      return
    }

    Deliveries.deliveries = delivRes.deliveries
    Deliveries.suppliers = suppRes.suppliers || []
    Deliveries.products = prodRes.products || []

    const rows = Deliveries.deliveries.map(d => `
      <tr>
        <td>${App.formatDate(d.delivery_date)}</td>
        <td>${d.supplier_name || '—'}</td>
        <td>${d.delivered_by}</td>
        <td class="text-center">${d.item_count} item${d.item_count !== 1 ? 's' : ''}</td>
        <td class="text-right font-bold">${App.formatCurrency(d.total_cost)}</td>
        <td>${App.formatDateTime(d.created_at)}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-secondary" onclick="Deliveries.viewDelivery(${d.id})">View</button>
        </td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">
          No deliveries recorded yet
        </td>
      </tr>
    `

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Deliveries</div>
          <div class="page-subtitle">${Deliveries.deliveries.length} total deliveries</div>
        </div>
        <button class="btn btn-primary" id="btn-add-delivery">+ Record Delivery</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Delivered By</th>
              <th class="text-center">Items</th>
              <th class="text-right">Total Cost</th>
              <th>Recorded At</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-delivery').addEventListener('click', () => Deliveries.showAddModal())
  },

  async showAddModal() {
    const today = App.todayISO()

    const supplierOptions = Deliveries.suppliers.map(s =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('')

    const productOptions = Deliveries.products.map(p =>
      `<option value="${p.id}" data-price="${p.purchase_price}" data-name="${p.name}">${p.name} (Stock: ${Number(p.stock_quantity).toFixed(1)} ${p.unit})</option>`
    ).join('')

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>Delivery Date *</label>
          <input type="date" id="del-date" value="${today}" required>
        </div>
        <div class="form-group">
          <label>Delivered By *</label>
          <input type="text" id="del-by" placeholder="Name of delivery person" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Supplier</label>
          <select id="del-supplier">
            <option value="">— Select Supplier —</option>
            ${supplierOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Supplier Name (override)</label>
          <input type="text" id="del-supplier-name" placeholder="Or type supplier name directly">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="del-notes" rows="2" placeholder="Optional notes..."></textarea>
      </div>

      <div style="margin:16px 0 8px;display:flex;align-items:center;justify-content:space-between">
        <strong>Delivery Items</strong>
        <button class="btn btn-sm btn-accent" id="btn-add-del-item" type="button">+ Add Item</button>
      </div>

      <div class="delivery-items-table">
        <table id="delivery-items-table" style="width:100%">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Row Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="del-items-body">
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right"><strong>Grand Total:</strong></td>
              <td id="del-grand-total" style="font-weight:700;color:var(--primary)">$0.00</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-delivery">Save Delivery</button>
    `

    App.showModal('Record Delivery', body, footer, { size: 'lg' })

    // Add first item row automatically
    Deliveries._itemRows = []
    Deliveries._addItemRow()
    Deliveries._addItemRow()

    document.getElementById('btn-add-del-item').addEventListener('click', () => Deliveries._addItemRow())
    document.getElementById('del-supplier').addEventListener('change', (e) => {
      const sel = e.target
      const selectedOption = sel.options[sel.selectedIndex]
      if (selectedOption.value) {
        document.getElementById('del-supplier-name').value = selectedOption.text
      }
    })
    document.getElementById('btn-save-delivery').addEventListener('click', () => Deliveries.saveDelivery())
  },

  _itemRowCount: 0,
  _itemRows: [],

  _addItemRow() {
    const tbody = document.getElementById('del-items-body')
    if (!tbody) return

    const id = ++Deliveries._itemRowCount
    const productOptions = Deliveries.products.map(p =>
      `<option value="${p.id}" data-price="${p.purchase_price}">${p.name}</option>`
    ).join('')

    const tr = document.createElement('tr')
    tr.id = `del-row-${id}`
    tr.innerHTML = `
      <td style="padding:6px 8px">
        <select class="del-product" style="width:100%;min-width:160px" data-row="${id}">
          <option value="">— Select Product —</option>
          ${productOptions}
        </select>
      </td>
      <td style="padding:6px 8px">
        <input type="number" class="del-qty" min="0.1" step="0.1" value="1" style="width:80px" data-row="${id}">
      </td>
      <td style="padding:6px 8px">
        <input type="number" class="del-cost" min="0" step="0.01" value="" style="width:90px" placeholder="0.00" data-row="${id}">
      </td>
      <td style="padding:6px 8px;font-weight:600" class="del-row-total" id="del-row-total-${id}">$0.00</td>
      <td style="padding:6px 8px">
        <button class="btn btn-sm btn-danger" onclick="Deliveries._removeItemRow(${id})">×</button>
      </td>
    `
    tbody.appendChild(tr)

    // Auto-fill cost from product
    const productSel = tr.querySelector('.del-product')
    productSel.addEventListener('change', () => {
      const opt = productSel.options[productSel.selectedIndex]
      const price = opt.dataset.price
      if (price) {
        tr.querySelector('.del-cost').value = parseFloat(price).toFixed(2)
      }
      Deliveries._updateRowTotal(id)
    })

    tr.querySelector('.del-qty').addEventListener('input', () => Deliveries._updateRowTotal(id))
    tr.querySelector('.del-cost').addEventListener('input', () => Deliveries._updateRowTotal(id))

    Deliveries._itemRows.push(id)
  },

  _removeItemRow(id) {
    const tr = document.getElementById(`del-row-${id}`)
    if (tr) tr.remove()
    Deliveries._itemRows = Deliveries._itemRows.filter(r => r !== id)
    Deliveries._updateGrandTotal()
  },

  _updateRowTotal(id) {
    const tr = document.getElementById(`del-row-${id}`)
    if (!tr) return

    const qty = parseFloat(tr.querySelector('.del-qty').value) || 0
    const cost = parseFloat(tr.querySelector('.del-cost').value) || 0
    const total = qty * cost

    const totalEl = document.getElementById(`del-row-total-${id}`)
    if (totalEl) totalEl.textContent = App.formatCurrency(total)

    Deliveries._updateGrandTotal()
  },

  _updateGrandTotal() {
    let grand = 0
    document.querySelectorAll('.del-row-total').forEach(el => {
      grand += parseFloat(el.textContent.replace('$', '')) || 0
    })
    const grandEl = document.getElementById('del-grand-total')
    if (grandEl) grandEl.textContent = App.formatCurrency(grand)
  },

  async saveDelivery() {
    const date = document.getElementById('del-date').value
    const deliveredBy = document.getElementById('del-by').value.trim()
    const supplierId = document.getElementById('del-supplier').value
    const supplierName = document.getElementById('del-supplier-name').value.trim()
    const notes = document.getElementById('del-notes').value.trim()

    if (!date || !deliveredBy) {
      App.showToast('Please fill in date and delivered by fields', 'error')
      return
    }

    // Collect items
    const items = []
    const rows = document.querySelectorAll('#del-items-body tr')

    for (const tr of rows) {
      const productId = tr.querySelector('.del-product')?.value
      const qty = parseFloat(tr.querySelector('.del-qty')?.value) || 0
      const cost = parseFloat(tr.querySelector('.del-cost')?.value) || 0

      if (!productId || qty <= 0) continue

      items.push({
        product_id: Number(productId),
        quantity: qty,
        unit_cost: cost
      })
    }

    if (items.length === 0) {
      App.showToast('Please add at least one item', 'error')
      return
    }

    const btn = document.getElementById('btn-save-delivery')
    btn.disabled = true
    btn.textContent = 'Saving...'

    const res = await window.api.deliveries.create({
      supplier_id: supplierId ? Number(supplierId) : null,
      supplier_name: supplierName || null,
      delivered_by: deliveredBy,
      delivery_date: date,
      notes: notes || null,
      items
    })

    if (res.success) {
      App.closeModal()
      App.showToast('Delivery recorded successfully!', 'success')
      await Deliveries.render()
    } else {
      App.showToast(res.error || 'Failed to save delivery', 'error')
      btn.disabled = false
      btn.textContent = 'Save Delivery'
    }
  },

  async viewDelivery(id) {
    const res = await window.api.deliveries.getById(id)
    if (!res.success) {
      App.showToast('Failed to load delivery details', 'error')
      return
    }

    const d = res.delivery
    const items = d.items || []

    const itemRows = items.map(item => `
      <tr>
        <td>${item.product_name}</td>
        <td class="text-right">${Number(item.quantity).toFixed(1)}</td>
        <td class="text-right">${App.formatCurrency(item.unit_cost)}</td>
        <td class="text-right font-bold">${App.formatCurrency(item.quantity * item.unit_cost)}</td>
      </tr>
    `).join('')

    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Delivery Date</div>
          <div style="font-weight:600">${App.formatDate(d.delivery_date)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Recorded At</div>
          <div style="font-weight:600">${App.formatDateTime(d.created_at)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Supplier</div>
          <div style="font-weight:600">${d.supplier_name || '—'}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Delivered By</div>
          <div style="font-weight:600">${d.delivered_by}</div>
        </div>
        ${d.notes ? `<div style="grid-column:1/-1"><div style="font-size:12px;color:var(--text-muted)">Notes</div><div>${d.notes}</div></div>` : ''}
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="text-right">Grand Total</td>
              <td class="text-right font-bold">${App.formatCurrency(d.total_cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `

    const footer = `<button class="btn btn-secondary" onclick="App.closeModal()">Close</button>`
    App.showModal(`Delivery #${id} Details`, body, footer, { size: 'lg' })
  }
}
