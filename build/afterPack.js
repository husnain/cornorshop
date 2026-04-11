'use strict'

/**
 * electron-builder afterPack hook.
 * Runs after the app is packaged but before the installer is created.
 *
 * Does two things:
 *  1. Applies Electron Fuses — disables DevTools, remote debugging, and
 *     the ability to run the executable as a plain Node.js process.
 *  2. Obfuscates all JavaScript source files inside app.asar so that
 *     extracting the archive still yields unreadable code.
 */

const path = require('path')
const fs   = require('fs')
const os   = require('os')

module.exports = async ({ appOutDir, packager }) => {
  // ── 1. Electron Fuses ──────────────────────────────────────────────────────
  try {
    const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

    const platform = packager.platform.name   // 'windows' | 'mac' | 'linux'
    const execName = platform === 'windows'
      ? `${packager.appInfo.productName}.exe`
      : packager.appInfo.productName

    const execPath = path.join(appOutDir, execName)

    await flipFuses(execPath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]:              false,  // blocks --inspect / --require bypasses
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]:        false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]:    true,   // blocks loading app outside asar
    })

    console.log('[afterPack] Electron fuses applied.')
  } catch (err) {
    console.warn('[afterPack] Could not apply fuses (install @electron/fuses):', err.message)
  }

  // ── 2. ASAR obfuscation ────────────────────────────────────────────────────
  try {
    const asar       = require('@electron/asar')
    const obfuscator = require('javascript-obfuscator')

    const asarPath   = path.join(appOutDir, 'resources', 'app.asar')
    if (!fs.existsSync(asarPath)) {
      console.warn('[afterPack] app.asar not found — skipping obfuscation.')
      return
    }

    // Extract asar to a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cornershop-obf-'))
    asar.extractAll(asarPath, tmpDir)

    // Obfuscate every .js file in main process and src/ (not node_modules)
    const targets = [
      path.join(tmpDir, 'main.js'),
      path.join(tmpDir, 'preload.js'),
      ...walkJs(path.join(tmpDir, 'src')),
    ]

    for (const file of targets) {
      if (!fs.existsSync(file)) continue
      const original = fs.readFileSync(file, 'utf8')
      const result = obfuscator.obfuscate(original, {
        compact:                     true,
        controlFlowFlattening:       true,
        controlFlowFlatteningThreshold: 0.5,
        numbersToExpressions:        true,
        simplify:                    true,
        stringArrayShuffle:          true,
        splitStrings:                true,
        splitStringsChunkLength:     5,
        stringArray:                 true,
        stringArrayCallsTransform:   true,
        stringArrayEncoding:         ['base64'],
        stringArrayIndexShift:       true,
        stringArrayRotate:           true,
        stringArrayWrappersCount:    2,
        stringArrayWrappersType:     'function',
        stringArrayThreshold:        0.75,
        unicodeEscapeSequence:       false,
        deadCodeInjection:           false,   // keep output size reasonable
      })
      fs.writeFileSync(file, result.getObfuscatedCode(), 'utf8')
    }

    // Re-pack the asar
    await asar.createPackage(tmpDir, asarPath)

    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true })

    console.log(`[afterPack] Obfuscated ${targets.length} JS files and repacked app.asar.`)
  } catch (err) {
    console.warn('[afterPack] Obfuscation skipped:', err.message)
  }
}

/** Recursively collect .js files under a directory (excluding node_modules). */
function walkJs(dir) {
  if (!fs.existsSync(dir)) return []
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkJs(full))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full)
    }
  }
  return results
}
