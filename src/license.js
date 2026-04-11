'use strict'

const crypto = require('crypto')
const os = require('os')

// Only the public key lives in the app — the private key never leaves your machine.
// Generated with: node tools/genkeys.js
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHibOxpttGqdOb3wjtQanutXn73mp
nTmG6XxqV5cdRzR2CzeoqmBr1c1Zh3CfuSL8ZJ8NzGJURMJaTZgttNKcsA==
-----END PUBLIC KEY-----`

/**
 * Generate a stable fingerprint for the current machine.
 * Uses hostname + all non-internal MAC addresses.
 * @returns {string} 16-char hex string, e.g. 'A1B2C3D4E5F60001'
 */
function getMachineId() {
  const interfaces = os.networkInterfaces()
  const macs = []
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macs.push(addr.mac.toUpperCase())
      }
    }
  }
  macs.sort()
  const raw = [os.hostname(), ...macs].join('|')
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase()
}

/**
 * Validate a .lic file payload (JSON object) against the current machine.
 * @param {object} license - parsed JSON from .lic file: { machineId, expiry, sig }
 * @param {string} currentMachineId - from getMachineId()
 * @returns {{ valid: boolean, daysLeft?: number, expiryDate?: string, reason?: string }}
 */
function validateKey(license, currentMachineId) {
  if (!license || typeof license !== 'object') {
    return { valid: false, reason: 'Invalid license file' }
  }

  const { machineId, expiry, sig } = license

  if (!machineId || !expiry || !sig) {
    return { valid: false, reason: 'License file is missing required fields' }
  }

  if (machineId.trim().toUpperCase() !== currentMachineId) {
    return { valid: false, reason: 'This license is not valid for this machine' }
  }

  // Verify ECDSA signature — the app can only verify, never forge
  const message = `${machineId.trim().toUpperCase()}|${expiry}`
  try {
    const verify = crypto.createVerify('SHA256')
    verify.update(message)
    const ok = verify.verify(PUBLIC_KEY, sig, 'base64')
    if (!ok) return { valid: false, reason: 'License signature is invalid' }
  } catch {
    return { valid: false, reason: 'License verification failed' }
  }

  // Check expiry date (format: YYYYMMDD)
  if (!/^\d{8}$/.test(expiry)) {
    return { valid: false, reason: 'License has an invalid expiry date' }
  }

  const year  = parseInt(expiry.slice(0, 4), 10)
  const month = parseInt(expiry.slice(4, 6), 10) - 1
  const day   = parseInt(expiry.slice(6, 8), 10)
  const expiryDate = new Date(year, month, day, 23, 59, 59, 999)

  const now = new Date()
  if (now > expiryDate) {
    return { valid: false, reason: 'License has expired', expired: true, expiryDate: expiryDate.toISOString(), daysLeft: 0 }
  }

  const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
  return { valid: true, daysLeft, expiryDate: expiryDate.toISOString() }
}

/**
 * Check trial status given the stored trial_start ISO string.
 * Trial lasts 3 months from first run.
 * @param {string} trialStart - ISO date string
 * @returns {{ active: boolean, daysLeft: number, expiryDate: string }}
 */
function checkTrial(trialStart) {
  const start  = new Date(trialStart)
  const expiry = new Date(start)
  expiry.setMonth(expiry.getMonth() + 3)
  expiry.setHours(23, 59, 59, 999)

  const now = new Date()
  const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)))

  return {
    active: now <= expiry,
    daysLeft,
    expiryDate: expiry.toISOString()
  }
}

module.exports = { getMachineId, validateKey, checkTrial }
