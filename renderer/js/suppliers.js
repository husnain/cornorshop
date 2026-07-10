'use strict'

const Suppliers = {
  suppliers: [],

  async render() {
    const content = document.getElementById('content')
    const res = await window.api.suppliers.getAll()

    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    Suppliers.suppliers = res.suppliers

    const rows = Suppliers.suppliers.map(s => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);
              color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">
              ${s.name.charAt(0).toUpperCase()}
            </div>
            <div style="font-weight:600">${s.name}</div>
          </div>
        </td>
        <td>${s.phone || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${s.address || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${App.formatDate(s.created_at)}</td>
        <td class="text-center">
          <div style="display:flex;gap:6px;justify-content:center">
            <button class="btn btn-sm btn-secondary" onclick="Suppliers.showEditModal(${s.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="Suppliers.deleteSupplier(${s.id})">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') || `
      <tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No suppliers yet</td></tr>
    `

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Suppliers</div>
          <div class="page-subtitle">${Suppliers.suppliers.length} supplier${Suppliers.suppliers.length !== 1 ? 's' : ''} registered</div>
        </div>
        <button class="btn btn-primary" id="btn-add-supplier">+ Add Supplier</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Added</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-supplier').addEventListener('click', () => Suppliers.showAddModal())
  },

  showAddModal() {
    const body = `
      <form id="supplier-form">
        <div class="form-group">
          <label>Supplier Name *</label>
          <input type="text" name="name" required placeholder="e.g. Ahmed Traders">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" name="phone" placeholder="e.g. 0300-1234567">
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" name="address" placeholder="e.g. 12 Market Road, Lahore">
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-supplier">Add Supplier</button>
    `

    App.showModal('Add New Supplier', body, footer, { size: 'sm' })

    document.getElementById('btn-save-supplier').addEventListener('click', async () => {
      const form = document.getElementById('supplier-form')
      const name = form.name.value.trim()
      const phone = form.phone.value.trim()
      const address = form.address.value.trim()

      if (!name) {
        App.showToast('Supplier name is required', 'error')
        return
      }

      const btn = document.getElementById('btn-save-supplier')
      btn.disabled = true
      btn.textContent = 'Adding...'

      const res = await window.api.suppliers.create({ name, phone, address })
      if (res.success) {
        App.closeModal()
        App.showToast('Supplier added successfully', 'success')
        await Suppliers.render()
      } else {
        App.showToast(res.error || 'Failed to add supplier', 'error')
        btn.disabled = false
        btn.textContent = 'Add Supplier'
      }
    })
  },

  showEditModal(id) {
    const s = Suppliers.suppliers.find(x => x.id === id)
    if (!s) return

    const body = `
      <form id="supplier-edit-form">
        <div class="form-group">
          <label>Supplier Name *</label>
          <input type="text" name="name" value="${s.name}" required>
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" name="phone" value="${s.phone || ''}">
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" name="address" value="${s.address || ''}">
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-update-supplier">Save Changes</button>
    `

    App.showModal(`Edit Supplier: ${s.name}`, body, footer, { size: 'sm' })

    document.getElementById('btn-update-supplier').addEventListener('click', async () => {
      const form = document.getElementById('supplier-edit-form')
      const name = form.name.value.trim()
      const phone = form.phone.value.trim()
      const address = form.address.value.trim()

      if (!name) {
        App.showToast('Supplier name is required', 'error')
        return
      }

      const btn = document.getElementById('btn-update-supplier')
      btn.disabled = true
      btn.textContent = 'Saving...'

      const res = await window.api.suppliers.update({ id, name, phone, address })
      if (res.success) {
        App.closeModal()
        App.showToast('Supplier updated successfully', 'success')
        await Suppliers.render()
      } else {
        App.showToast(res.error || 'Failed to update supplier', 'error')
        btn.disabled = false
        btn.textContent = 'Save Changes'
      }
    })
  },

  async deleteSupplier(id) {
    const s = Suppliers.suppliers.find(x => x.id === id)
    if (!s) return

    if (!App.confirm(`Delete supplier "${s.name}"? This cannot be undone.`)) return

    const res = await window.api.suppliers.delete(id)
    if (res.success) {
      App.showToast('Supplier deleted', 'success')
      await Suppliers.render()
    } else {
      App.showToast(res.error || 'Failed to delete supplier', 'error')
    }
  }
}
