'use strict'

// ─── App State & Router ──────────────────────────────────────────────────────
const App = {
  currentUser: null,
  currentView: null,
  currency: { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },

  async init() {
    // 1. Check license / trial first
    const licenseRes = await window.api.license.check()
    if (licenseRes.success && licenseRes.status === 'expired') {
      LicenseScreen.showExpired(licenseRes)
      return
    }

    // 2. Load currency setting
    const settingsRes = await window.api.settings.get()
    if (settingsRes.success && settingsRes.settings.currency_code) {
      App.currency = {
        code: settingsRes.settings.currency_code,
        symbol: settingsRes.settings.currency_symbol || '₨',
        name: settingsRes.settings.currency_name || 'Pakistani Rupee'
      }
    }

    // 3. Show trial banner if on trial
    if (licenseRes.success && licenseRes.status === 'trial') {
      App._trialDaysLeft = licenseRes.daysLeft
    }

    // 4. Check auth
    const res = await window.api.auth.getCurrentUser()
    if (res.success && res.user) {
      App.currentUser = res.user
      App.showMain()
      const defaultView = res.user.role === 'cashier' ? 'pos' : 'dashboard'
      App.navigate(defaultView)
    } else {
      App.showLogin()
    }
  },

  navigate(view) {
    if (!App.currentUser) return

    // Role guard: cashiers can only access POS
    if (App.currentUser.role === 'cashier' && view !== 'pos') {
      return
    }

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view)
    })

    App.currentView = view
    const content = document.getElementById('content')
    content.innerHTML = '<div class="loading-wrapper"><div class="spinner"></div></div>'

    const viewFns = {
      dashboard: () => Dashboard.render(),
      inventory: () => Inventory.render(),
      pos: () => POS.render(),
      deliveries: () => Deliveries.render(),
      reports: () => Reports.render(),
      users: () => Users.render(),
      settings: () => Settings.render(),
      waste: () => Waste.render()
    }

    if (viewFns[view]) {
      viewFns[view]().catch(err => {
        console.error(err)
        content.innerHTML = `<div class="alert alert-danger">Failed to load view: ${err.message}</div>`
      })
    }
  },

  showLogin() {
    document.getElementById('license-screen').style.display = 'none'
    document.getElementById('login-screen').style.display = 'flex'
    document.getElementById('app-shell').style.display = 'none'
    Auth.init()
  },

  showMain() {
    document.getElementById('login-screen').style.display = 'none'
    document.getElementById('app-shell').style.display = 'flex'

    const user = App.currentUser
    const nameEl = document.getElementById('sidebar-user-name')
    const roleEl = document.getElementById('sidebar-user-role')
    const avatarEl = document.getElementById('sidebar-user-avatar')

    nameEl.textContent = user.name
    roleEl.textContent = user.role
    avatarEl.textContent = user.name.charAt(0).toUpperCase()

    App.buildNav()
    App._renderTrialBanner()

    document.getElementById('btn-logout').addEventListener('click', App.logout)
  },

  _renderTrialBanner() {
    const banner = document.getElementById('trial-banner')
    if (!banner || !App._trialDaysLeft) return
    const days = App._trialDaysLeft
    const color = days <= 7 ? '#dc3545' : days <= 30 ? '#ffc107' : '#52b788'
    banner.style.display = 'block'
    banner.style.background = color
    banner.innerHTML = `
      <span>Trial: <strong>${days} day${days !== 1 ? 's' : ''}</strong> remaining</span>
      <button onclick="App.navigate('settings')" style="margin-left:8px;background:rgba(255,255,255,0.25);border:none;border-radius:4px;padding:2px 8px;cursor:pointer;color:inherit;font-size:0.8rem;">Enter License</button>
    `
  },

  buildNav() {
    const nav = document.getElementById('sidebar-nav')
    nav.innerHTML = ''

    const allItems = [
      { view: 'dashboard', icon: '📊', label: 'Dashboard', ownerOnly: true },
      { view: 'pos', icon: '🛍️', label: 'Point of Sale', ownerOnly: false },
      { view: 'inventory', icon: '📦', label: 'Inventory', ownerOnly: true },
      { view: 'deliveries', icon: '🚚', label: 'Deliveries', ownerOnly: true },
      { view: 'reports', icon: '📈', label: 'Reports', ownerOnly: true },
      { view: 'waste', icon: '🗑️', label: 'Waste Log', ownerOnly: true },
      { view: 'users', icon: '👥', label: 'Users', ownerOnly: true },
      { view: 'settings', icon: '⚙️', label: 'Settings', ownerOnly: true }
    ]

    const isOwner = App.currentUser.role === 'owner'

    allItems.forEach(item => {
      if (item.ownerOnly && !isOwner) return

      const el = document.createElement('div')
      el.className = 'nav-item'
      el.dataset.view = item.view
      el.innerHTML = `
        <span class="nav-item-icon">${item.icon}</span>
        <span>${item.label}</span>
      `
      el.addEventListener('click', () => App.navigate(item.view))
      nav.appendChild(el)
    })
  },

  async logout() {
    await window.api.auth.logout()
    App.currentUser = null
    App.currentView = null
    App.showLogin()
    App.showToast('Logged out successfully', 'info')
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container')
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    }
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-message">${message}</span>
    `
    container.appendChild(toast)

    setTimeout(() => {
      toast.classList.add('hiding')
      setTimeout(() => toast.remove(), 300)
    }, 3500)
  },

  // ─── Modal System ─────────────────────────────────────────────────────────
  showModal(title, bodyHTML, footerHTML = '', options = {}) {
    const overlay = document.getElementById('modal-overlay')
    const modal = document.getElementById('modal')
    const titleEl = document.getElementById('modal-title')
    const bodyEl = document.getElementById('modal-body')
    const footerEl = document.getElementById('modal-footer')

    titleEl.textContent = title
    bodyEl.innerHTML = bodyHTML
    footerEl.innerHTML = footerHTML

    // Size classes
    modal.className = 'modal'
    if (options.size) modal.classList.add(`modal-${options.size}`)

    overlay.style.display = 'flex'

    document.getElementById('modal-close').onclick = App.closeModal
    overlay.onclick = (e) => { if (e.target === overlay) App.closeModal() }

    return { bodyEl, footerEl }
  },

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none'
    document.getElementById('modal-body').innerHTML = ''
    document.getElementById('modal-footer').innerHTML = ''
  },

  // ─── Utility ──────────────────────────────────────────────────────────────
  formatCurrency(n) {
    const symbol = App.currency.symbol
    return symbol + Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },

  formatDate(dateStr) {
    if (!dateStr) return 'N/A'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  },

  formatDateTime(dateStr) {
    if (!dateStr) return 'N/A'
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  },

  todayISO() {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  },

  confirm(message) {
    return window.confirm(message)
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init())
