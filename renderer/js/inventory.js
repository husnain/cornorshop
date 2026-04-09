'use strict'

const Inventory = {
  products: [],
  categories: [],
  filterCategory: '',
  searchQuery: '',

  async render() {
    const content = document.getElementById('content')

    const [prodsRes, catsRes] = await Promise.all([
      window.api.products.getAll(),
      window.api.categories.getAll()
    ])

    if (!prodsRes.success) {
      content.innerHTML = `<div class="alert alert-danger">${prodsRes.error}</div>`
      return
    }

    Inventory.products = prodsRes.products
    Inventory.categories = catsRes.categories || []

    const categoryOptions = Inventory.categories.map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('')

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Inventory</div>
          <div class="page-subtitle">${Inventory.products.length} products</div>
        </div>
        <button class="btn btn-primary" id="btn-add-product">+ Add Product</button>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <input type="search" id="inv-search" placeholder="Search by name or SKU..." style="max-width:280px" value="${Inventory.searchQuery}">
          <select id="inv-cat-filter" style="max-width:200px">
            <option value="">All Categories</option>
            ${categoryOptions}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-sm btn-secondary" onclick="Inventory.showAddCategoryModal()">+ Category</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table id="inventory-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Category</th>
              <th class="text-right">Purchase Price</th>
              <th class="text-right">Selling Price</th>
              <th class="text-right">Stock</th>
              <th>Unit</th>
              <th class="text-right">Margin</th>
              <th>Status</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody id="inventory-tbody">
          </tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-product').addEventListener('click', () => Inventory.showProductModal())
    document.getElementById('inv-search').addEventListener('input', (e) => {
      Inventory.searchQuery = e.target.value
      Inventory.renderTable()
    })
    document.getElementById('inv-cat-filter').addEventListener('change', (e) => {
      Inventory.filterCategory = e.target.value
      Inventory.renderTable()
    })

    // Restore filter
    if (Inventory.filterCategory) {
      document.getElementById('inv-cat-filter').value = Inventory.filterCategory
    }

    Inventory.renderTable()
  },

  renderTable() {
    const tbody = document.getElementById('inventory-tbody')
    if (!tbody) return

    let products = Inventory.products

    if (Inventory.searchQuery) {
      const q = Inventory.searchQuery.toLowerCase()
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      )
    }

    if (Inventory.filterCategory) {
      products = products.filter(p => String(p.category_id) === String(Inventory.filterCategory))
    }

    if (products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted)">
            No products found
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = products.map(p => {
      const isLow = p.stock_quantity <= p.low_stock_threshold
      const margin = p.selling_price > 0
        ? (((p.selling_price - p.purchase_price) / p.selling_price) * 100).toFixed(1)
        : '0.0'
      const marginClass = Number(margin) > 0 ? 'margin-positive' : (Number(margin) < 0 ? 'margin-negative' : 'margin-zero')
      const rowClass = isLow ? 'low-stock-row' : ''

      return `
        <tr class="${rowClass}">
          <td><strong>${p.name}</strong></td>
          <td><code style="font-size:12px">${p.sku || '—'}</code></td>
          <td><code style="font-size:12px">${p.barcode || '—'}</code></td>
          <td>${p.category_name || '—'}</td>
          <td class="text-right">${App.formatCurrency(p.purchase_price)}</td>
          <td class="text-right">${App.formatCurrency(p.selling_price)}</td>
          <td class="text-right ${isLow ? 'low-stock' : ''}">
            ${Number(p.stock_quantity).toFixed(1)}
            ${isLow ? ' ⚠️' : ''}
          </td>
          <td>${p.unit}</td>
          <td class="text-right"><span class="${marginClass}">${margin}%</span></td>
          <td>
            ${isLow
              ? '<span class="badge badge-danger">Low Stock</span>'
              : '<span class="badge badge-success">OK</span>'
            }
          </td>
          <td class="text-center">
            <div style="display:flex;gap:6px;justify-content:center">
              <button class="btn btn-sm btn-secondary" onclick="Inventory.showProductModal(${p.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="Inventory.deleteProduct(${p.id})">Del</button>
            </div>
          </td>
        </tr>
      `
    }).join('')
  },

  async showProductModal(id = null) {
    const isEdit = id !== null
    const product = isEdit ? Inventory.products.find(p => p.id === id) : null

    const categoryOptions = Inventory.categories.map(c =>
      `<option value="${c.id}" ${product && product.category_id === c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('')

    const body = `
      <form id="product-form">
        <div class="form-row">
          <div class="form-group">
            <label>Product Name *</label>
            <input type="text" name="name" value="${product ? product.name : ''}" required placeholder="e.g. Coca Cola 330ml">
          </div>
          <div class="form-group">
            <label>SKU</label>
            <input type="text" name="sku" value="${product ? (product.sku || '') : ''}" placeholder="e.g. BEV-001">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Barcode</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" name="barcode" id="barcode-input" value="${product ? (product.barcode || '') : ''}" placeholder="Scan or type barcode" style="font-family:monospace;flex:1">
              <button type="button" id="btn-scan-barcode" class="btn btn-sm btn-secondary" title="Click then scan with your barcode scanner">📷 Scan</button>
            </div>
          </div>
          <div class="form-group" style="flex:0 0 auto;display:flex;align-items:flex-end">
            <span id="barcode-scan-status" style="font-size:12px;color:var(--text-muted)"></span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select name="category_id">
              <option value="">— Select Category —</option>
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Unit</label>
            <select name="unit">
              ${['pcs', 'kg', 'g', 'L', 'mL', 'box', 'pack', 'dozen', 'bottle', 'can'].map(u =>
                `<option value="${u}" ${product && product.unit === u ? 'selected' : ''}>${u}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Purchase Price *</label>
            <input type="number" name="purchase_price" value="${product ? product.purchase_price : ''}" step="0.01" min="0" required placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Selling Price *</label>
            <input type="number" name="selling_price" value="${product ? product.selling_price : ''}" step="0.01" min="0" required placeholder="0.00">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Current Stock</label>
            <input type="number" name="stock_quantity" value="${product ? product.stock_quantity : '0'}" step="0.1" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label>Low Stock Threshold</label>
            <input type="number" name="low_stock_threshold" value="${product ? product.low_stock_threshold : '10'}" step="0.1" min="0" placeholder="10">
          </div>
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-product">${isEdit ? 'Save Changes' : 'Add Product'}</button>
    `

    App.showModal(isEdit ? 'Edit Product' : 'Add New Product', body, footer)

    document.getElementById('btn-save-product').addEventListener('click', async () => {
      await Inventory.saveProduct(id)
    })

    // Scan button: focus barcode input and wait for scanner input (Enter)
    document.getElementById('btn-scan-barcode').addEventListener('click', () => {
      const input = document.getElementById('barcode-input')
      const status = document.getElementById('barcode-scan-status')
      input.value = ''
      input.focus()
      status.textContent = 'Ready to scan...'
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          status.textContent = input.value ? `✓ ${input.value}` : ''
          input.onkeydown = null
        }
      }
    })
  },

  async saveProduct(id) {
    const form = document.getElementById('product-form')
    const formData = new FormData(form)

    const data = {
      name: formData.get('name').trim(),
      sku: formData.get('sku').trim() || null,
      barcode: formData.get('barcode').trim() || null,
      category_id: formData.get('category_id') ? Number(formData.get('category_id')) : null,
      purchase_price: parseFloat(formData.get('purchase_price')) || 0,
      selling_price: parseFloat(formData.get('selling_price')) || 0,
      stock_quantity: parseFloat(formData.get('stock_quantity')) || 0,
      unit: formData.get('unit'),
      low_stock_threshold: parseFloat(formData.get('low_stock_threshold')) || 10
    }

    if (!data.name) {
      App.showToast('Product name is required', 'error')
      return
    }

    const btn = document.getElementById('btn-save-product')
    btn.disabled = true
    btn.textContent = 'Saving...'

    try {
      let res
      if (id) {
        res = await window.api.products.update({ id, ...data })
      } else {
        res = await window.api.products.create(data)
      }

      if (res.success) {
        App.closeModal()
        App.showToast(`Product ${id ? 'updated' : 'added'} successfully`, 'success')
        await Inventory.render()
      } else {
        App.showToast(res.error || 'Failed to save product', 'error')
        btn.disabled = false
        btn.textContent = id ? 'Save Changes' : 'Add Product'
      }
    } catch (err) {
      App.showToast('Error: ' + err.message, 'error')
      btn.disabled = false
    }
  },

  async deleteProduct(id) {
    const product = Inventory.products.find(p => p.id === id)
    if (!product) return

    if (!App.confirm(`Delete "${product.name}"? This cannot be undone.`)) return

    const res = await window.api.products.delete(id)
    if (res.success) {
      App.showToast('Product deleted', 'success')
      await Inventory.render()
    } else {
      App.showToast(res.error || 'Failed to delete product', 'error')
    }
  },

  async showAddCategoryModal() {
    const body = `
      <div class="form-group">
        <label>Category Name *</label>
        <input type="text" id="new-category-name" placeholder="e.g. Beverages" style="font-size:15px">
      </div>
    `
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-category">Add Category</button>
    `

    App.showModal('Add Category', body, footer, { size: 'sm' })

    document.getElementById('new-category-name').focus()
    document.getElementById('btn-save-category').addEventListener('click', async () => {
      const name = document.getElementById('new-category-name').value.trim()
      if (!name) { App.showToast('Category name is required', 'error'); return }

      const res = await window.api.categories.create({ name })
      if (res.success) {
        App.closeModal()
        App.showToast('Category added', 'success')
        Inventory.categories.push(res.category)
        await Inventory.render()
      } else {
        App.showToast(res.error || 'Failed to add category', 'error')
      }
    })
  }
}
