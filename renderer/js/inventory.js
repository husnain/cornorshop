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
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="btn-import-csv">Import CSV</button>
          <button class="btn btn-primary" id="btn-add-product">+ Add Product</button>
        </div>
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
    document.getElementById('btn-import-csv').addEventListener('click', () => Inventory.showImportModal())
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

  // ─── CSV Import ─────────────────────────────────────────────────────────────

  parseCSV(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const rows = []
    let i = 0

    while (i < normalized.length) {
      const fields = []
      // Parse one row
      while (i < normalized.length && normalized[i] !== '\n') {
        if (normalized[i] === '"') {
          // Quoted field
          i++ // skip opening quote
          let field = ''
          while (i < normalized.length) {
            if (normalized[i] === '"') {
              if (normalized[i + 1] === '"') { field += '"'; i += 2 } // escaped quote
              else { i++; break } // closing quote
            } else if (normalized[i] === '\n') {
              // multi-line field
              field += '\n'; i++
            } else {
              field += normalized[i++]
            }
          }
          fields.push(field)
          if (normalized[i] === ',') i++ // skip comma after field
        } else {
          // Unquoted field
          let field = ''
          while (i < normalized.length && normalized[i] !== ',' && normalized[i] !== '\n') {
            field += normalized[i++]
          }
          fields.push(field.trim())
          if (normalized[i] === ',') i++ // skip comma
        }
      }
      if (normalized[i] === '\n') i++ // skip newline

      if (fields.length > 1 || (fields.length === 1 && fields[0] !== '')) {
        rows.push(fields)
      }
    }

    return rows
  },

  downloadTemplate() {
    const header = 'name,sku,barcode,category,purchase_price,selling_price,stock_quantity,unit,low_stock_threshold'
    const example = 'Coca Cola 330ml,BEV-001,5449000000996,Beverages,0.80,1.50,100,pcs,20'
    const csv = header + '\n' + example + '\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  },

  showImportModal() {
    const body = `
      <div id="import-step-upload">
        <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px">
          Upload a CSV file to import products in bulk. Existing products with matching SKUs will be updated.
          New categories are created automatically.
        </p>
        <div style="margin-bottom:16px">
          <button class="btn btn-sm btn-secondary" id="btn-dl-template">Download Template CSV</button>
        </div>
        <div id="csv-drop-zone" style="
          border:2px dashed var(--border);border-radius:8px;padding:32px;text-align:center;
          cursor:pointer;transition:border-color .2s;background:var(--bg-secondary)
        ">
          <div style="font-size:32px;margin-bottom:8px">📂</div>
          <div style="font-weight:600;margin-bottom:4px">Click or drop CSV file here</div>
          <div style="font-size:12px;color:var(--text-muted)">Supports files with thousands of products</div>
          <input type="file" id="csv-file-input" accept=".csv,text/csv" style="display:none">
        </div>
        <div id="csv-parse-error" style="display:none;margin-top:12px" class="alert alert-danger"></div>
      </div>

      <div id="import-step-preview" style="display:none">
        <div id="import-summary-bar" style="
          display:flex;gap:16px;padding:12px 16px;background:var(--bg-secondary);
          border-radius:8px;margin-bottom:16px;font-size:13px;flex-wrap:wrap
        "></div>
        <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="position:sticky;top:0;background:var(--bg-secondary)">
              <tr id="preview-header-row"></tr>
            </thead>
            <tbody id="preview-tbody"></tbody>
          </table>
        </div>
        <div id="import-errors-section" style="display:none;margin-top:12px">
          <div style="font-weight:600;font-size:13px;color:var(--danger);margin-bottom:6px" id="import-errors-title"></div>
          <div style="max-height:120px;overflow-y:auto;font-size:12px;font-family:monospace;
            background:var(--bg-secondary);border-radius:6px;padding:8px" id="import-errors-list"></div>
        </div>
      </div>

      <div id="import-step-result" style="display:none;text-align:center;padding:24px 0">
        <div style="font-size:48px;margin-bottom:12px" id="result-icon"></div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px" id="result-title"></div>
        <div style="color:var(--text-muted);font-size:14px" id="result-detail"></div>
      </div>
    `

    const footer = `
      <button class="btn btn-secondary" id="btn-import-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-import-confirm" style="display:none">Import Products</button>
      <button class="btn btn-primary" id="btn-import-done" style="display:none">Done</button>
    `

    App.showModal('Import Products from CSV', body, footer, { size: 'lg' })

    // Parsed rows ready for import
    let pendingRows = []

    document.getElementById('btn-import-cancel').addEventListener('click', () => App.closeModal())
    document.getElementById('btn-dl-template').addEventListener('click', () => Inventory.downloadTemplate())

    // File input via click on drop zone
    const dropZone = document.getElementById('csv-drop-zone')
    const fileInput = document.getElementById('csv-file-input')

    dropZone.addEventListener('click', () => fileInput.click())
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropZone.style.borderColor = 'var(--primary)'
    })
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border)'
    })
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropZone.style.borderColor = 'var(--border)'
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    })
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0])
    })

    function handleFile(file) {
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        showParseError('Please select a .csv file.')
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          processCSV(e.target.result)
        } catch (err) {
          showParseError('Failed to parse CSV: ' + err.message)
        }
      }
      reader.onerror = () => showParseError('Failed to read file.')
      reader.readAsText(file, 'UTF-8')
    }

    function showParseError(msg) {
      const el = document.getElementById('csv-parse-error')
      el.textContent = msg
      el.style.display = 'block'
    }

    function processCSV(text) {
      document.getElementById('csv-parse-error').style.display = 'none'

      const allRows = Inventory.parseCSV(text)
      if (allRows.length < 2) {
        showParseError('CSV must have a header row and at least one data row.')
        return
      }

      // Map header columns (case-insensitive, trimmed)
      const EXPECTED_COLS = ['name', 'sku', 'barcode', 'category', 'purchase_price',
        'selling_price', 'stock_quantity', 'unit', 'low_stock_threshold']
      const headerRow = allRows[0].map(h => h.toLowerCase().trim())
      const colIndex = {}
      EXPECTED_COLS.forEach(col => {
        const idx = headerRow.indexOf(col)
        if (idx !== -1) colIndex[col] = idx
      })

      if (colIndex['name'] === undefined) {
        showParseError('CSV must have a "name" column.')
        return
      }

      const dataRows = allRows.slice(1)
      const validRows = []
      const parseErrors = []

      dataRows.forEach((fields, i) => {
        const rowNum = i + 2
        const get = (col) => colIndex[col] !== undefined ? (fields[colIndex[col]] || '') : ''
        const name = get('name').trim()
        if (!name) {
          parseErrors.push({ row: rowNum, error: 'Missing product name' })
          return
        }
        validRows.push({
          name,
          sku:               get('sku').trim(),
          barcode:           get('barcode').trim(),
          category:          get('category').trim(),
          purchase_price:    get('purchase_price'),
          selling_price:     get('selling_price'),
          stock_quantity:    get('stock_quantity'),
          unit:              get('unit') || 'pcs',
          low_stock_threshold: get('low_stock_threshold') || '10',
          _rowNum: rowNum
        })
      })

      pendingRows = validRows

      // Switch to preview step
      document.getElementById('import-step-upload').style.display = 'none'
      document.getElementById('import-step-preview').style.display = 'block'
      document.getElementById('btn-import-confirm').style.display = 'inline-flex'

      // Summary bar
      const summaryBar = document.getElementById('import-summary-bar')
      summaryBar.innerHTML = `
        <span><strong>${dataRows.length}</strong> rows in file</span>
        <span style="color:var(--success)"><strong>${validRows.length}</strong> ready to import</span>
        ${parseErrors.length ? `<span style="color:var(--danger)"><strong>${parseErrors.length}</strong> rows with errors (skipped)</span>` : ''}
      `

      // Preview table (show first 100 rows to keep DOM fast)
      const PREVIEW_COLS = ['name', 'sku', 'barcode', 'category', 'purchase_price', 'selling_price', 'stock_quantity', 'unit']
      const headerRowEl = document.getElementById('preview-header-row')
      headerRowEl.innerHTML = PREVIEW_COLS.map(c =>
        `<th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:1px solid var(--border)">${c}</th>`
      ).join('')

      const PREVIEW_LIMIT = 100
      const previewRows = validRows.slice(0, PREVIEW_LIMIT)
      const tbody = document.getElementById('preview-tbody')
      tbody.innerHTML = previewRows.map((r, idx) => `
        <tr style="background:${idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)'}">
          ${PREVIEW_COLS.map(c => `<td style="padding:5px 10px;border-bottom:1px solid var(--border)">${r[c] || ''}</td>`).join('')}
        </tr>
      `).join('')

      if (validRows.length > PREVIEW_LIMIT) {
        tbody.innerHTML += `<tr><td colspan="${PREVIEW_COLS.length}" style="padding:8px 10px;color:var(--text-muted);font-style:italic">
          … and ${validRows.length - PREVIEW_LIMIT} more rows
        </td></tr>`
      }

      // Parse errors section
      if (parseErrors.length > 0) {
        const errSection = document.getElementById('import-errors-section')
        errSection.style.display = 'block'
        document.getElementById('import-errors-title').textContent =
          `${parseErrors.length} row${parseErrors.length > 1 ? 's' : ''} will be skipped:`
        document.getElementById('import-errors-list').innerHTML =
          parseErrors.map(e => `Row ${e.row}: ${e.error}`).join('<br>')
      }

      // Update confirm button label
      document.getElementById('btn-import-confirm').textContent = `Import ${validRows.length} Products`
    }

    document.getElementById('btn-import-confirm').addEventListener('click', async () => {
      if (!pendingRows.length) return

      const btn = document.getElementById('btn-import-confirm')
      btn.disabled = true
      btn.textContent = `Importing ${pendingRows.length} products…`

      const res = await window.api.products.bulkImport({ rows: pendingRows })

      // Switch to result step
      document.getElementById('import-step-preview').style.display = 'none'
      document.getElementById('import-step-result').style.display = 'block'
      document.getElementById('btn-import-confirm').style.display = 'none'
      document.getElementById('btn-import-cancel').style.display = 'none'
      document.getElementById('btn-import-done').style.display = 'inline-flex'

      if (res.success) {
        document.getElementById('result-icon').textContent = '✅'
        document.getElementById('result-title').textContent = 'Import Complete'
        const parts = []
        if (res.inserted > 0) parts.push(`${res.inserted} new product${res.inserted > 1 ? 's' : ''} added`)
        if (res.updated  > 0) parts.push(`${res.updated}  product${res.updated  > 1 ? 's' : ''} updated`)
        document.getElementById('result-detail').innerHTML = parts.join(' &nbsp;·&nbsp; ') ||
          'No changes were made.'
        if (res.errors && res.errors.length > 0) {
          document.getElementById('result-detail').innerHTML +=
            `<br><span style="color:var(--danger);font-size:12px">${res.errors.length} row${res.errors.length > 1 ? 's' : ''} failed and were skipped</span>`
        }
      } else {
        document.getElementById('result-icon').textContent = '❌'
        document.getElementById('result-title').textContent = 'Import Failed'
        document.getElementById('result-detail').textContent = res.error || 'Unknown error'
      }

      document.getElementById('btn-import-done').addEventListener('click', async () => {
        App.closeModal()
        if (res.success && (res.inserted > 0 || res.updated > 0)) {
          await Inventory.render()
        }
      })
    })
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
