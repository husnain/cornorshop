'use strict'

const LicenseScreen = {
  showExpired(licenseRes) {
    document.getElementById('license-screen').style.display = 'flex'
    document.getElementById('login-screen').style.display = 'none'
    document.getElementById('app-shell').style.display = 'none'

    const subtitle = document.getElementById('license-screen-subtitle')
    const msg = document.getElementById('license-expired-msg')

    subtitle.textContent = 'Your trial has expired'

    const expiredOn = licenseRes.expiryDate
      ? new Date(licenseRes.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A'

    const machineId = licenseRes.machineId || '—'

    msg.innerHTML = `
      <div class="license-info-box">
        <div class="license-info-icon">⏰</div>
        <div>
          <div class="license-info-title">3-Month Free Trial Ended</div>
          <div class="license-info-sub">Expired on ${expiredOn}</div>
        </div>
      </div>
      <p class="license-info-text">Enter your license key below to continue using CornerShop.</p>
      <div class="license-machine-box">
        <span class="license-machine-label">Machine ID:</span>
        <code class="license-machine-id">${machineId}</code>
        <button class="btn-copy-machine-id" title="Copy Machine ID" onclick="navigator.clipboard.writeText('${machineId}')">Copy</button>
      </div>
      <p class="license-info-text" style="font-size:0.8em;color:#888;">Share this Machine ID with support to receive your license key.</p>
    `

    // Allow pressing Enter in the input to activate
    const input = document.getElementById('license-key-input')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') LicenseScreen.activate()
    })
  },

  async activate() {
    const input = document.getElementById('license-key-input')
    const errorEl = document.getElementById('license-error')
    const key = input.value.trim()

    errorEl.style.display = 'none'

    if (!key) {
      errorEl.textContent = 'Please enter a license key.'
      errorEl.style.display = 'block'
      return
    }

    const btn = document.querySelector('#license-screen-body .btn')
    btn.textContent = 'Activating…'
    btn.disabled = true

    const res = await window.api.license.activate({ key })

    btn.textContent = 'Activate License'
    btn.disabled = false

    if (!res.success) {
      errorEl.textContent = res.error || 'Invalid license key.'
      errorEl.style.display = 'block'
      input.select()
      return
    }

    // Success — reinitialize the app
    document.getElementById('license-screen').style.display = 'none'
    await App.init()
  }
}
