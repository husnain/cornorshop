'use strict'

const Settings = {
  currencies: [
    { code: 'PKR', symbol: '₨',   name: 'Pakistani Rupee' },
    { code: 'USD', symbol: '$',    name: 'US Dollar' },
    { code: 'EUR', symbol: '€',    name: 'Euro' },
    { code: 'GBP', symbol: '£',    name: 'British Pound' },
    { code: 'INR', symbol: '₹',    name: 'Indian Rupee' },
    { code: 'AED', symbol: 'د.إ',  name: 'UAE Dirham' },
    { code: 'SAR', symbol: '﷼',    name: 'Saudi Riyal' },
    { code: 'OMR', symbol: '﷼',    name: 'Omani Rial' },
    { code: 'BDT', symbol: '৳',    name: 'Bangladeshi Taka' },
    { code: 'LKR', symbol: '₨',    name: 'Sri Lankan Rupee' },
    { code: 'NPR', symbol: '₨',    name: 'Nepalese Rupee' },
    { code: 'AFN', symbol: '؋',    name: 'Afghan Afghani' },
    { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar' },
    { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar' },
    { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit' },
    { code: 'JPY', symbol: '¥',    name: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan' },
    { code: 'TRY', symbol: '₺',    name: 'Turkish Lira' },
    { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound' },
    { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira' },
    { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling' },
    { code: 'ZAR', symbol: 'R',    name: 'South African Rand' },
    { code: 'GHS', symbol: '₵',    name: 'Ghanaian Cedi' },
  ],

  async render() {
    const [settingsRes, licenseRes] = await Promise.all([
      window.api.settings.get(),
      window.api.license.check()
    ])

    const currentCode = (settingsRes.success && settingsRes.settings.currency_code) ? settingsRes.settings.currency_code : 'PKR'
    const currentPrintMode = (settingsRes.success && settingsRes.settings.print_mode) ? settingsRes.settings.print_mode : 'dialog'
    const currentShopName = (settingsRes.success && settingsRes.settings.shop_name) ? settingsRes.settings.shop_name : ''
    const currentShopAddress = (settingsRes.success && settingsRes.settings.shop_address) ? settingsRes.settings.shop_address : ''

    const options = Settings.currencies
      .map(c => `<option value="${c.code}" ${c.code === currentCode ? 'selected' : ''}>${c.code} &mdash; ${c.name} (${c.symbol})</option>`)
      .join('')

    // Build license status block
    let licenseStatusHTML = ''
    if (licenseRes.success) {
      const { status, daysLeft, expiryDate } = licenseRes
      const expiryStr = expiryDate
        ? new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A'

      if (status === 'licensed') {
        licenseStatusHTML = `
          <div class="license-status-badge licensed">
            <span>✔ Licensed</span>
            <span>Expires ${expiryStr} &nbsp;(${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)</span>
          </div>`
      } else if (status === 'trial') {
        const color = daysLeft <= 7 ? 'danger' : daysLeft <= 30 ? 'warning' : 'trial'
        licenseStatusHTML = `
          <div class="license-status-badge ${color}">
            <span>⏳ Trial Active</span>
            <span>${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining &nbsp;·&nbsp; Ends ${expiryStr}</span>
          </div>`
      } else {
        licenseStatusHTML = `
          <div class="license-status-badge expired">
            <span>✖ Trial Expired</span>
            <span>Expired on ${expiryStr}</span>
          </div>`
      }
    }

    document.getElementById('content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="card settings-card">
        <div class="settings-section">
          <h3 class="settings-section-title">Shop Information</h3>
          <p class="settings-section-desc">This name and address will appear at the top of every printed receipt.</p>

          <div class="form-group">
            <label for="shop-name-input">Shop Name</label>
            <input type="text" id="shop-name-input" class="form-control" value="${currentShopName}" placeholder="e.g. Al-Noor General Store">
          </div>

          <div class="form-group">
            <label for="shop-address-input">Shop Address</label>
            <input type="text" id="shop-address-input" class="form-control" value="${currentShopAddress}" placeholder="e.g. Shop 4, Main Bazaar, Lahore">
          </div>

          <button class="btn btn-primary" onclick="Settings.saveShopInfo()">
            Save Shop Info
          </button>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section">
          <h3 class="settings-section-title">Currency</h3>
          <p class="settings-section-desc">Choose the currency used across the app — POS, receipts, reports, and inventory.</p>

          <div class="form-group">
            <label for="currency-select">Currency</label>
            <select id="currency-select" class="form-control">
              ${options}
            </select>
          </div>

          <div class="settings-preview" id="currency-preview"></div>

          <button class="btn btn-primary" onclick="Settings.saveCurrency()">
            Save Currency
          </button>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section">
          <h3 class="settings-section-title">Printing</h3>
          <p class="settings-section-desc">Choose how receipts are sent to the printer.</p>

          <div class="form-group">
            <label for="print-mode-select">Print Mode</label>
            <select id="print-mode-select" class="form-control">
              <option value="dialog" ${currentPrintMode === 'dialog' ? 'selected' : ''}>Show print dialog (choose printer each time)</option>
              <option value="silent" ${currentPrintMode === 'silent' ? 'selected' : ''}>Silent (send directly to default printer)</option>
            </select>
          </div>

          <button class="btn btn-primary" onclick="Settings.savePrintMode()">
            Save Print Settings
          </button>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section">
          <h3 class="settings-section-title">License</h3>
          <p class="settings-section-desc">Activate a license key to use CornerShop beyond the 3-month trial.</p>

          ${licenseStatusHTML}

          <div class="form-group">
            <label for="settings-license-input">License Key</label>
            <input type="text" id="settings-license-input" class="form-control"
              placeholder="CS-YYYYMMDD-XXXXXXXX" autocomplete="off" spellcheck="false">
          </div>
          <div id="settings-license-error" class="alert alert-danger" style="display:none; max-width:380px;"></div>
          <button class="btn btn-primary" onclick="Settings.activateLicense()">
            Activate License
          </button>
        </div>
      </div>
    `

    document.getElementById('currency-select').addEventListener('change', Settings.updatePreview)
    document.getElementById('settings-license-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Settings.activateLicense()
    })
    Settings.updatePreview()
  },

  updatePreview() {
    const select = document.getElementById('currency-select')
    const currency = Settings.currencies.find(c => c.code === select.value)
    if (!currency) return

    const preview = document.getElementById('currency-preview')
    preview.innerHTML = `
      <div class="preview-label">Preview</div>
      <div class="preview-examples">
        <div class="preview-item">
          <span class="preview-tag">Small amount</span>
          <span class="preview-value">${currency.symbol}${(250).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="preview-item">
          <span class="preview-tag">Large amount</span>
          <span class="preview-value">${currency.symbol}${(12500).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="preview-item">
          <span class="preview-tag">Currency name</span>
          <span class="preview-value" style="font-size: 0.95rem;">${currency.name}</span>
        </div>
      </div>
    `
  },

  async saveShopInfo() {
    const name = document.getElementById('shop-name-input').value.trim()
    const address = document.getElementById('shop-address-input').value.trim()
    if (!name) { App.showToast('Shop name cannot be empty', 'error'); return }
    const res = await window.api.settings.set({ shop_name: name, shop_address: address })
    if (res.success) {
      App.showToast('Shop info saved', 'success')
    } else {
      App.showToast('Failed to save shop info', 'error')
    }
  },

  async saveCurrency() {
    const select = document.getElementById('currency-select')
    const currency = Settings.currencies.find(c => c.code === select.value)
    if (!currency) return

    const res = await window.api.settings.set({
      currency_code: currency.code,
      currency_symbol: currency.symbol,
      currency_name: currency.name
    })

    if (res.success) {
      App.currency = { code: currency.code, symbol: currency.symbol, name: currency.name }
      App.showToast(`Currency set to ${currency.name} (${currency.symbol})`, 'success')
    } else {
      App.showToast('Failed to save settings', 'error')
    }
  },

  async savePrintMode() {
    const select = document.getElementById('print-mode-select')
    const res = await window.api.settings.set({ print_mode: select.value })
    if (res.success) {
      App.showToast(select.value === 'silent' ? 'Silent print enabled' : 'Print dialog enabled', 'success')
    } else {
      App.showToast('Failed to save print settings', 'error')
    }
  },

  async activateLicense() {
    const input = document.getElementById('settings-license-input')
    const errorEl = document.getElementById('settings-license-error')
    const key = input.value.trim()

    errorEl.style.display = 'none'

    if (!key) {
      errorEl.textContent = 'Please enter a license key.'
      errorEl.style.display = 'block'
      return
    }

    const btn = document.querySelector('#settings-license-error + button') ||
                document.querySelector('[onclick="Settings.activateLicense()"]')
    const origText = btn.textContent
    btn.textContent = 'Activating…'
    btn.disabled = true

    const res = await window.api.license.activate({ key })

    btn.textContent = origText
    btn.disabled = false

    if (!res.success) {
      errorEl.textContent = res.error || 'Invalid license key.'
      errorEl.style.display = 'block'
      input.select()
      return
    }

    // Clear trial banner since we're now licensed
    App._trialDaysLeft = null
    const banner = document.getElementById('trial-banner')
    if (banner) banner.style.display = 'none'

    App.showToast(`License activated! Valid for ${res.daysLeft} more days.`, 'success')

    // Re-render settings to show updated status
    Settings.render()
  }
}
