'use strict'

const POS = {
  cart: [],
  products: [],
  filteredProducts: [],

  async render() {
    const content = document.getElementById('content')
    const res = await window.api.products.getAll()

    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    POS.products = res.products
    POS.filteredProducts = [...res.products]

    content.style.padding = '0'
    content.innerHTML = `
      <div class="pos-layout" style="padding:12px;height:calc(100vh - 0px);box-sizing:border-box">
        <!-- Left: Products -->
        <div class="pos-products">
          <div class="pos-products-header">
            <input type="search" id="pos-search" placeholder="Search products by name or SKU..." style="width:100%">
          </div>
          <div class="pos-products-grid" id="pos-product-grid">
          </div>
        </div>

        <!-- Right: Cart -->
        <div class="pos-cart">
          <div class="pos-cart-header">
            <h3>🛒 Cart <span id="cart-item-count" style="font-size:12px;opacity:0.8"></span></h3>
          </div>

          <div class="pos-cart-items" id="cart-items">
            <div class="cart-empty">
              <div class="cart-empty-icon">🛍️</div>
              <p>Cart is empty</p>
              <p style="font-size:12px;margin-top:4px">Click products to add them</p>
            </div>
          </div>

          <div class="pos-cart-summary" id="cart-summary" style="display:none">
            <div class="summary-row">
              <span>Subtotal</span>
              <span id="cart-subtotal">$0.00</span>
            </div>
            <div class="summary-row">
              <span>Discount</span>
              <span>
                <input type="number" id="cart-discount" min="0" step="0.01"
                  placeholder="0.00"
                  style="width:80px;padding:4px 8px;font-size:13px;text-align:right"
                  value="0">
              </span>
            </div>
            <div class="summary-row total">
              <span>TOTAL</span>
              <span id="cart-total">$0.00</span>
            </div>
            <div class="summary-input">
              <label>Payment Method</label>
              <select id="payment-method">
                <option value="cash">💵 Cash</option>
                <option value="card">💳 Card</option>
                <option value="transfer">📱 Transfer</option>
              </select>
            </div>
            <div class="summary-input" id="cash-section">
              <label>Amount Paid</label>
              <input type="number" id="amount-paid" min="0" step="0.01" placeholder="0.00" style="font-size:15px;font-weight:700">
            </div>
            <div class="change-display" id="change-display">
              Change: <span id="change-amount">$0.00</span>
            </div>
          </div>

          <div class="pos-cart-actions">
            <button class="btn btn-success btn-lg btn-block" id="btn-complete-sale" disabled>
              ✔ Complete Sale
            </button>
            <button class="btn btn-secondary btn-block" id="btn-clear-cart" disabled>
              🗑 Clear Cart
            </button>
          </div>
        </div>
      </div>
    `

    // Remove padding from content area for full-height POS
    content.style.padding = '0'
    content.style.overflow = 'hidden'

    POS.renderProductGrid()
    POS.attachEvents()
  },

  renderProductGrid() {
    const grid = document.getElementById('pos-product-grid')
    if (!grid) return

    if (POS.filteredProducts.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
          <div style="font-size:40px;margin-bottom:8px">🔍</div>
          <p>No products found</p>
        </div>
      `
      return
    }

    grid.innerHTML = POS.filteredProducts.map(p => {
      const outOfStock = p.stock_quantity <= 0
      return `
        <div class="product-card ${outOfStock ? 'out-of-stock' : ''}"
          data-id="${p.id}"
          title="${outOfStock ? 'Out of stock' : `Stock: ${p.stock_quantity} ${p.unit}`}">
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-price">${App.formatCurrency(p.selling_price)}</div>
          <div class="product-card-stock ${p.stock_quantity <= p.low_stock_threshold && !outOfStock ? 'low-stock' : ''}">
            ${outOfStock ? '❌ Out of Stock' : `${Number(p.stock_quantity).toFixed(1)} ${p.unit}`}
          </div>
        </div>
      `
    }).join('')

    grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id)
        const product = POS.products.find(p => p.id === id)
        if (product) POS.addToCart(product)
      })
    })
  },

  attachEvents() {
    document.getElementById('pos-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim()
      if (q) {
        POS.filteredProducts = POS.products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q))
        )
      } else {
        POS.filteredProducts = [...POS.products]
      }
      POS.renderProductGrid()
    })

    document.getElementById('btn-complete-sale').addEventListener('click', POS.completeSale)
    document.getElementById('btn-clear-cart').addEventListener('click', POS.clearCart)

    document.getElementById('cart-discount').addEventListener('input', POS.updateTotals)
    document.getElementById('amount-paid').addEventListener('input', POS.updateChange)

    document.getElementById('payment-method').addEventListener('change', (e) => {
      const cashSection = document.getElementById('cash-section')
      const changeDisplay = document.getElementById('change-display')
      if (e.target.value === 'cash') {
        cashSection.style.display = 'block'
        changeDisplay.style.display = 'block'
      } else {
        cashSection.style.display = 'none'
        changeDisplay.style.display = 'none'
      }
    })
  },

  addToCart(product) {
    const existing = POS.cart.find(item => item.product_id === product.id)

    // Check stock availability
    const currentCartQty = existing ? existing.quantity : 0
    if (currentCartQty >= product.stock_quantity) {
      App.showToast(`Only ${product.stock_quantity} ${product.unit} available`, 'warning')
      return
    }

    if (existing) {
      existing.quantity += 1
      existing.total_price = existing.quantity * existing.unit_price
    } else {
      POS.cart.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.selling_price,
        purchase_price: product.purchase_price,
        quantity: 1,
        total_price: product.selling_price,
        max_qty: product.stock_quantity,
        unit: product.unit
      })
    }

    POS.renderCart()
  },

  removeFromCart(productId) {
    POS.cart = POS.cart.filter(item => item.product_id !== productId)
    POS.renderCart()
  },

  updateQty(productId, delta) {
    const item = POS.cart.find(i => i.product_id === productId)
    if (!item) return

    const newQty = item.quantity + delta
    if (newQty <= 0) {
      POS.removeFromCart(productId)
      return
    }

    if (newQty > item.max_qty) {
      App.showToast(`Only ${item.max_qty} ${item.unit} in stock`, 'warning')
      return
    }

    item.quantity = newQty
    item.total_price = item.quantity * item.unit_price
    POS.renderCart()
  },

  setQty(productId, qty) {
    const item = POS.cart.find(i => i.product_id === productId)
    if (!item) return

    const newQty = parseFloat(qty) || 0
    if (newQty <= 0) {
      POS.removeFromCart(productId)
      return
    }
    if (newQty > item.max_qty) {
      App.showToast(`Only ${item.max_qty} ${item.unit} in stock`, 'warning')
      item.quantity = item.max_qty
    } else {
      item.quantity = newQty
    }
    item.total_price = item.quantity * item.unit_price
    POS.renderCart()
  },

  renderCart() {
    const cartItemsEl = document.getElementById('cart-items')
    const cartSummaryEl = document.getElementById('cart-summary')
    const btnComplete = document.getElementById('btn-complete-sale')
    const btnClear = document.getElementById('btn-clear-cart')
    const countEl = document.getElementById('cart-item-count')

    if (!cartItemsEl) return

    if (POS.cart.length === 0) {
      cartItemsEl.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🛍️</div>
          <p>Cart is empty</p>
          <p style="font-size:12px;margin-top:4px">Click products to add them</p>
        </div>
      `
      cartSummaryEl.style.display = 'none'
      btnComplete.disabled = true
      btnClear.disabled = true
      countEl.textContent = ''
      return
    }

    const totalItems = POS.cart.reduce((s, i) => s + i.quantity, 0)
    countEl.textContent = `(${totalItems} item${totalItems !== 1 ? 's' : ''})`

    cartItemsEl.innerHTML = POS.cart.map(item => `
      <div class="cart-item" data-id="${item.product_id}">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.product_name}</div>
          <div class="cart-item-price">${App.formatCurrency(item.unit_price)} / ${item.unit}</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="POS.updateQty(${item.product_id}, -1)">−</button>
          <input class="qty-display" type="number" min="0.1" step="0.1"
            style="width:48px;padding:2px 4px;text-align:center;border:1px solid var(--border);border-radius:4px"
            value="${item.quantity}"
            onchange="POS.setQty(${item.product_id}, this.value)">
          <button class="qty-btn" onclick="POS.updateQty(${item.product_id}, 1)">+</button>
        </div>
        <div class="cart-item-total">${App.formatCurrency(item.total_price)}</div>
        <button class="cart-remove-btn" onclick="POS.removeFromCart(${item.product_id})">×</button>
      </div>
    `).join('')

    cartSummaryEl.style.display = 'block'
    btnComplete.disabled = false
    btnClear.disabled = false

    POS.updateTotals()
  },

  updateTotals() {
    const subtotal = POS.cart.reduce((s, item) => s + item.total_price, 0)
    const discountInput = document.getElementById('cart-discount')
    const discount = parseFloat(discountInput ? discountInput.value : 0) || 0
    const total = Math.max(0, subtotal - discount)

    const subtotalEl = document.getElementById('cart-subtotal')
    const totalEl = document.getElementById('cart-total')

    if (subtotalEl) subtotalEl.textContent = App.formatCurrency(subtotal)
    if (totalEl) totalEl.textContent = App.formatCurrency(total)

    POS.updateChange()
  },

  updateChange() {
    const discountInput = document.getElementById('cart-discount')
    const subtotal = POS.cart.reduce((s, item) => s + item.total_price, 0)
    const discount = parseFloat(discountInput ? discountInput.value : 0) || 0
    const total = Math.max(0, subtotal - discount)

    const amountPaid = parseFloat(document.getElementById('amount-paid')?.value || 0) || 0
    const change = amountPaid - total
    const changeEl = document.getElementById('change-amount')
    const changeDisplay = document.getElementById('change-display')

    if (changeEl) changeEl.textContent = App.formatCurrency(Math.max(0, change))

    if (changeDisplay) {
      const method = document.getElementById('payment-method')?.value
      if (method === 'cash') {
        changeDisplay.style.display = amountPaid > 0 ? 'block' : 'none'
        changeDisplay.style.background = change >= 0 ? 'var(--success-light)' : 'var(--danger-light)'
        changeDisplay.style.color = change >= 0 ? 'var(--success)' : 'var(--danger)'
        changeDisplay.style.borderColor = change >= 0 ? '#c3e6cb' : '#f5c6cb'
      }
    }
  },

  clearCart() {
    if (POS.cart.length === 0) return
    if (!App.confirm('Clear all items from cart?')) return
    POS.cart = []
    POS.renderCart()
  },

  async completeSale() {
    if (POS.cart.length === 0) {
      App.showToast('Cart is empty', 'warning')
      return
    }

    const subtotal = POS.cart.reduce((s, item) => s + item.total_price, 0)
    const discountInput = document.getElementById('cart-discount')
    const discount = parseFloat(discountInput?.value || 0) || 0
    const total = Math.max(0, subtotal - discount)
    const paymentMethod = document.getElementById('payment-method').value
    const amountPaidInput = document.getElementById('amount-paid')
    let amountPaid = parseFloat(amountPaidInput?.value || 0) || 0

    if (paymentMethod === 'cash') {
      if (amountPaid < total) {
        App.showToast(`Amount paid (${App.formatCurrency(amountPaid)}) is less than total (${App.formatCurrency(total)})`, 'error')
        return
      }
    } else {
      amountPaid = total
    }

    const changeAmount = Math.max(0, amountPaid - total)

    const btn = document.getElementById('btn-complete-sale')
    btn.disabled = true
    btn.textContent = 'Processing...'

    const saleData = {
      cashier_id: App.currentUser.id,
      cashier_name: App.currentUser.name,
      subtotal,
      discount,
      total,
      payment_method: paymentMethod,
      amount_paid: amountPaid,
      change_amount: changeAmount,
      items: POS.cart.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        purchase_price: item.purchase_price,
        total_price: item.total_price
      }))
    }

    try {
      const res = await window.api.sales.create(saleData)

      if (res.success) {
        const completedCart = [...POS.cart]
        POS.cart = []

        // Refresh product stock in memory
        const prodsRes = await window.api.products.getAll()
        if (prodsRes.success) {
          POS.products = prodsRes.products
          POS.filteredProducts = [...prodsRes.products]
          POS.renderProductGrid()
        }

        POS.renderCart()
        App.showToast('Sale completed successfully!', 'success')

        // Show receipt
        POS.showReceipt(res.sale, completedCart)

        // Reset inputs
        if (discountInput) discountInput.value = '0'
        if (amountPaidInput) amountPaidInput.value = ''
        document.getElementById('payment-method').value = 'cash'
        document.getElementById('cash-section').style.display = 'block'
        document.getElementById('change-display').style.display = 'none'
      } else {
        App.showToast(res.error || 'Failed to complete sale', 'error')
        btn.disabled = false
        btn.textContent = '✔ Complete Sale'
      }
    } catch (err) {
      App.showToast('Error: ' + err.message, 'error')
      btn.disabled = false
      btn.textContent = '✔ Complete Sale'
    }
  },

  showReceipt(sale, cartItems) {
    const items = cartItems || sale.items || []
    const fc = App.formatCurrency

    const itemRows = items.map(item => `
      <tr>
        <td style="padding:3px 4px">${item.product_name}</td>
        <td style="padding:3px 4px;text-align:center">${item.quantity}</td>
        <td style="padding:3px 4px;text-align:right">${fc(item.unit_price)}</td>
        <td style="padding:3px 4px;text-align:right;font-weight:600">${fc(item.total_price)}</td>
      </tr>
    `).join('')

    const body = `
      <div class="receipt-preview">
        <div class="receipt-header">
          <div class="receipt-shop-name">🛒 CornerShop</div>
          <div style="font-size:12px;color:var(--text-muted)">Your Neighborhood Grocery</div>
        </div>
        <hr class="receipt-divider">
        <div style="font-size:12px">
          <div style="display:flex;justify-content:space-between">
            <span>Receipt #${sale.id}</span>
            <span>${App.formatDateTime(sale.sale_date)}</span>
          </div>
          <div>Cashier: ${sale.cashier_name}</div>
        </div>
        <hr class="receipt-divider">
        <div class="receipt-items">
          <table width="100%">
            <thead>
              <tr style="font-size:11px;color:var(--text-muted)">
                <th style="padding:3px 4px;text-align:left">Item</th>
                <th style="padding:3px 4px;text-align:center">Qty</th>
                <th style="padding:3px 4px;text-align:right">Price</th>
                <th style="padding:3px 4px;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
        <hr class="receipt-divider">
        <div style="font-size:13px">
          <div style="display:flex;justify-content:space-between">
            <span>Subtotal</span><span>${fc(sale.subtotal)}</span>
          </div>
          ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--danger)"><span>Discount</span><span>-${fc(sale.discount)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
            <span>TOTAL</span><span>${fc(sale.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span>Paid (${(sale.payment_method || 'cash').toUpperCase()})</span><span>${fc(sale.amount_paid)}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>Change</span><span>${fc(sale.change_amount)}</span>
          </div>
        </div>
        <hr class="receipt-divider">
        <div class="receipt-footer">
          <p>Thank you for shopping at CornerShop!</p>
          <p>Please come again. 😊</p>
        </div>
      </div>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      <button class="btn btn-primary" onclick="POS.printReceipt(${sale.id})">🖨️ Print Receipt</button>
    `

    App.showModal(`Receipt #${sale.id}`, body, footer, { size: 'sm' })
    POS._lastSale = sale
  },

  async printReceipt(saleId) {
    const res = await window.api.sales.getById(saleId)
    if (!res.success) { App.showToast('Failed to load sale for printing', 'error'); return }
    await window.api.receipt.print(res.sale)
  }
}
