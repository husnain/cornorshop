#!/usr/bin/env node
'use strict'

/**
 * Generate a machine-locked CornerShop license key.
 *
 * Usage:
 *   node scripts/gen-key.js <YYYY-MM-DD> <MACHINE_ID>
 *
 * Example:
 *   node scripts/gen-key.js 2027-04-09 A1B2C3D4E5F60001
 */

const { generateKey } = require('../src/license')

const [,, expiryDate, machineId] = process.argv

if (!expiryDate || !machineId) {
  console.error('Usage: node scripts/gen-key.js <YYYY-MM-DD> <MACHINE_ID>')
  process.exit(1)
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
  console.error('Error: expiryDate must be in YYYY-MM-DD format')
  process.exit(1)
}

const key = generateKey(expiryDate, machineId)
console.log(key)
