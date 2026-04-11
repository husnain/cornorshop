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
      <p class="license-info-text">Import your license file below to continue using CornerShop.</p>
      <div class="license-machine-box">
        <span class="license-machine-label">Machine ID:</span>
        <code class="license-machine-id">${machineId}</code>
        <button class="btn-copy-machine-id" title="Copy Machine ID" onclick="navigator.clipboard.writeText('${machineId}')">Copy</button>
      </div>
      <p class="license-info-text" style="font-size:0.8em;color:#888;">Share this Machine ID with your software provider to receive a license file.</p>
    `
  },

  async importFile() {
    const errorEl = document.getElementById('license-error')
    const btn = document.getElementById('license-import-btn')

    errorEl.style.display = 'none'
    btn.textContent = 'Importing…'
    btn.disabled = true

    const res = await window.api.license.importFile()

    btn.textContent = 'Import License File (.lic)'
    btn.disabled = false

    if (!res.success) {
      errorEl.textContent = res.error || 'Failed to import license.'
      errorEl.style.display = 'block'
      return
    }

    // Success — reinitialize the app
    document.getElementById('license-screen').style.display = 'none'
    await App.init()
  }
}
