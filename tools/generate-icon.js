#!/usr/bin/env node
'use strict'

/**
 * Generates assets/icon.png and assets/icon.ico for CornerShop.
 * Pure Node.js — no external dependencies required.
 */

const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

// ── Palette ──────────────────────────────────────────────────────────────────
const BG   = [0x1b, 0x43, 0x32, 0xff] // #1b4332 dark green
const FG   = [0xff, 0xff, 0xff, 0xff] // white

// ── Minimal PNG builder ───────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.concat([typeBytes, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, typeBytes, data, crc])
}

function makePNG(size, drawFn) {
  // Raw image rows: filter byte (0x00) + RGBA pixels
  const raw = Buffer.alloc(size * (1 + size * 4), 0)
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0 // None filter
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 4) + 1 + x * 4
      const px  = drawFn(x, y, size)
      raw[off]   = px[0]
      raw[off+1] = px[1]
      raw[off+2] = px[2]
      raw[off+3] = px[3]
    }
  }

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8]  = 8  // bit depth
  ihdrData[9]  = 6  // RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0

  const compressed = zlib.deflateSync(raw, { level: 6 })

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ── Icon draw function ────────────────────────────────────────────────────────
// Draws a rounded-rect background + a simple cart symbol in white
function drawIcon(x, y, size) {
  const cx = size / 2, cy = size / 2
  const r  = size * 0.42       // corner radius for bg circle

  // Background: circle
  const dx = x - cx, dy = y - cy
  if (Math.sqrt(dx*dx + dy*dy) > r) return [0, 0, 0, 0] // transparent outside

  // Cart body: a trapezoid basket
  const bx1 = size * 0.22, bx2 = size * 0.78
  const by1 = size * 0.35, by2 = size * 0.65
  // slightly narrower at top
  const topW = (bx2 - bx1) * 0.80
  const bxT1 = cx - topW / 2, bxT2 = cx + topW / 2

  // Cart handle (arc top-left)
  const hx1 = size * 0.18, hx2 = size * 0.40
  const hy  = size * 0.30

  // Wheels
  const w1cx = size * 0.34, w2cx = size * 0.66, wcy = size * 0.72, wr = size * 0.055

  const inWheel1 = Math.hypot(x - w1cx, y - wcy) < wr
  const inWheel2 = Math.hypot(x - w2cx, y - wcy) < wr

  // Cart basket (convex hull of 4 points — simple bounding check)
  const inBasket = x >= bxT1 && x <= bxT2 && y >= by1 && y <= (by1 + (by2 - by1) * 0.15)
                || x >= bx1  && x <= bx2  && y >= (by1 + (by2 - by1) * 0.15) && y <= by2

  // Handle bar: horizontal line at hy, from hx1..hx2, thin
  const inHandle = y >= hy - size * 0.04 && y <= hy + size * 0.04
                && x >= hx1 && x <= hx2

  // Pole connecting handle to basket
  const inPole = x >= hx2 - size * 0.04 && x <= hx2 + size * 0.04
              && y >= hy && y <= by1

  if (inWheel1 || inWheel2 || inBasket || inHandle || inPole) return FG

  return BG
}

// ── Build sizes ───────────────────────────────────────────────────────────────
const sizes = [16, 32, 48, 64, 128, 256]
const pngs  = {}

for (const s of sizes) {
  pngs[s] = makePNG(s, drawIcon)
}

// ── Write PNG (256) ───────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'assets')
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[256])
console.log('  ✔  assets/icon.png written (256×256)')

// ── Build ICO (multi-resolution) ──────────────────────────────────────────────
// ICO format: ICONDIR + N×ICONDIRENTRY + N×image_data
const icoSizes = [16, 32, 48, 256]
const icoImages = icoSizes.map(s => pngs[s])

// ICONDIR: reserved(2) + type(2) + count(2)
const icondir = Buffer.alloc(6)
icondir.writeUInt16LE(0,              0) // reserved
icondir.writeUInt16LE(1,              2) // type: 1 = icon
icondir.writeUInt16LE(icoSizes.length, 4)

// Entries are 16 bytes each; image data starts after dir + all entries
let offset = 6 + icoSizes.length * 16
const entries = icoSizes.map((s, i) => {
  const img  = icoImages[i]
  const entry = Buffer.alloc(16)
  entry[0] = s === 256 ? 0 : s  // width  (0 = 256)
  entry[1] = s === 256 ? 0 : s  // height (0 = 256)
  entry[2] = 0   // color count (0 = >256 colors)
  entry[3] = 0   // reserved
  entry.writeUInt16LE(1,          4)  // planes
  entry.writeUInt16LE(32,         6)  // bit count
  entry.writeUInt32LE(img.length, 8)  // size of image data
  entry.writeUInt32LE(offset,    12)  // offset of image data
  offset += img.length
  return entry
})

const ico = Buffer.concat([icondir, ...entries, ...icoImages])
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
console.log('  ✔  assets/icon.ico  written (16/32/48/256 px)')
