'use strict'

const crypto = require('crypto')
const os = require('os')

// Only the public key lives in the app — the private key never leaves your machine.
// Generated with: node tools/genkeys.js
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHibOxpttGqdOb3wjtQanutXn73mp
nTmG6XxqV5cdRzR2CzeoqmBr1c1Zh3CfuSL8ZJ8NzGJURMJaTZgttNKcsA==
-----END PUBLIC KEY-----`

// Symmetric key used to encrypt the .lic file payload. Keeps the file opaque
// (no readable machineId/expiry) and lets GCM detect any byte-level tampering
// before signature verification runs. Same key must live in tools/keygen.js.
const LICENSE_CIPHER_KEY = Buffer.from(
  '8652c65f31771d6d12929cb813f273a7b04889b2303f29f7d4113ada7e1efd62',
  'hex'
)
const LICENSE_FILE_MAGIC = Buffer.from('CSL1')  // CornerShop License v1

// Grace window after a trial or paid license has officially expired. The app
// keeps working but the UI nags so users have a few days to obtain/renew a
// .lic file without losing access to their POS mid-shift.
const GRACE_DAYS = 3

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
    const graceEnd = new Date(expiryDate.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    if (now <= graceEnd) {
      const graceDaysLeft = Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)))
      return {
        valid: true,
        inGrace: true,
        graceDaysLeft,
        daysLeft: 0,
        expiryDate: expiryDate.toISOString()
      }
    }
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
  const graceEnd = new Date(expiry.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)

  if (now <= expiry) {
    const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)))
    return { active: true, daysLeft, expiryDate: expiry.toISOString() }
  }

  if (now <= graceEnd) {
    const graceDaysLeft = Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)))
    return { active: true, inGrace: true, graceDaysLeft, daysLeft: 0, expiryDate: expiry.toISOString() }
  }

  return { active: false, daysLeft: 0, expiryDate: expiry.toISOString() }
}

/**
 * Decrypt an encrypted .lic file buffer into the parsed license object.
 * File layout: [4-byte magic 'CSL1'][12-byte IV][16-byte authTag][ciphertext].
 * @param {Buffer} buf - raw bytes read from the .lic file
 * @returns {object} parsed license JSON ({ machineId, expiry, sig })
 * @throws if the file is not a valid encrypted license
 */
function decryptLicenseFile(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) {
    throw new Error('License file is not a valid CornerShop license')
  }
  if (!buf.slice(0, 4).equals(LICENSE_FILE_MAGIC)) {
    throw new Error('License file is not a valid CornerShop license')
  }
  const iv         = buf.slice(4, 16)
  const authTag    = buf.slice(16, 32)
  const ciphertext = buf.slice(32)

  const decipher = crypto.createDecipheriv('aes-256-gcm', LICENSE_CIPHER_KEY, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}

/**
 * Encrypt a license object into the binary .lic file format. Only the keygen
 * tool calls this — exported so both sides share the exact layout.
 * @param {object} license - { machineId, expiry, sig }
 * @returns {Buffer}
 */
function encryptLicenseFile(license) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', LICENSE_CIPHER_KEY, iv)
  const plaintext = Buffer.from(JSON.stringify(license), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([LICENSE_FILE_MAGIC, iv, authTag, ciphertext])
}

module.exports = { getMachineId, validateKey, checkTrial, decryptLicenseFile, encryptLicenseFile }
