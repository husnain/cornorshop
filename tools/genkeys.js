/**
 * One-time ECDSA key pair generator.
 *
 * Run ONCE to create your key pair:
 *   node tools/genkeys.js
 *
 * - Copy the PUBLIC KEY into src/license.js (PUBLIC_KEY constant)
 * - Save the PRIVATE KEY somewhere safe (e.g. a password manager, offline file)
 *   and paste it into tools/keygen.js (PRIVATE_KEY constant)
 *
 * NEVER commit the private key or tools/keygen.js to a public repository.
 */

'use strict'

const { generateKeyPairSync } = require('crypto')

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

const priv = privateKey.export({ type: 'pkcs8', format: 'pem' })
const pub  = publicKey.export({ type: 'spki',  format: 'pem' })

console.log('=== PRIVATE KEY (keep secret — paste into tools/keygen.js) ===')
console.log(priv)
console.log('=== PUBLIC KEY (paste into src/license.js PUBLIC_KEY constant) ===')
console.log(pub)
