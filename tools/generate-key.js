#!/usr/bin/env node
'use strict'

/**
 * CornerShop License Key Generator
 * Usage: node tools/generate-key.js YYYY-MM-DD
 * Example: node tools/generate-key.js 2027-06-30
 */

const { generateKey } = require('../src/license')

const expiryDate = process.argv[2]

if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
  console.log('')
  console.log('  CornerShop License Key Generator')
  console.log('  Usage:   node tools/generate-key.js YYYY-MM-DD')
  console.log('  Example: node tools/generate-key.js 2027-06-30')
  console.log('')
  process.exit(1)
}

const [year, month, day] = expiryDate.split('-').map(Number)
const expiry = new Date(year, month - 1, day)
if (isNaN(expiry.getTime())) {
  console.error('  Error: Invalid date.')
  process.exit(1)
}
if (expiry < new Date()) {
  console.warn('  Warning: Expiry date is in the past.')
}

const key = generateKey(expiryDate)

console.log('')
console.log('  ┌─────────────────────────────────────┐')
console.log('  │     CornerShop License Key           │')
console.log('  ├─────────────────────────────────────┤')
console.log(`  │  Expiry : ${expiryDate}                  │`)
console.log(`  │  Key    : ${key}         │`)
console.log('  └─────────────────────────────────────┘')
console.log('')
