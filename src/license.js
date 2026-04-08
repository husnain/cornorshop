'use strict'

const crypto = require('crypto')

// Secret used to sign license keys — keep this private
const SECRET = 'CS@CornerShop#License$2024!Key'

/**
 * Generate a license key that expires on the given date.
 * @param {string} expiryDate - 'YYYY-MM-DD'
 * @returns {string} e.g. 'CS-20270409-A1B2C3D4'
 */
function generateKey(expiryDate) {
  const dateStr = expiryDate.replace(/-/g, '') // YYYYMMDD
  const hmac = crypto
    .createHmac('sha256', SECRET)
    .update(dateStr)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()
  return `CS-${dateStr}-${hmac}`
}

/**
 * Validate a license key.
 * @param {string} key
 * @returns {{ valid: boolean, expiryDate?: string, daysLeft?: number, reason?: string }}
 */
function validateKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'No key provided' }
  }

  const clean = key.trim().toUpperCase().replace(/\s+/g, '')
  const match = clean.match(/^CS-(\d{8})-([A-F0-9]{8})$/)
  if (!match) {
    return { valid: false, reason: 'Invalid key format' }
  }

  const dateStr = match[1]
  const keyHmac = match[2]

  const expectedHmac = crypto
    .createHmac('sha256', SECRET)
    .update(dateStr)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()

  if (keyHmac !== expectedHmac) {
    return { valid: false, reason: 'Invalid license key' }
  }

  const year  = parseInt(dateStr.slice(0, 4), 10)
  const month = parseInt(dateStr.slice(4, 6), 10) - 1
  const day   = parseInt(dateStr.slice(6, 8), 10)
  const expiry = new Date(year, month, day, 23, 59, 59, 999)

  const now = new Date()
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))

  if (now > expiry) {
    return { valid: false, reason: 'License key has expired', expired: true, expiryDate: expiry.toISOString(), daysLeft: 0 }
  }

  return { valid: true, expiryDate: expiry.toISOString(), daysLeft }
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

module.exports = { generateKey, validateKey, checkTrial }
