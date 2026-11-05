// Writes the PWA icons (teal square with a white tape-measure band) without extra libraries.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

function png(size) {
  const teal = [15, 118, 110], white = [255, 255, 255], dark = [17, 94, 89]
  const rows = []
  const bandTop = Math.round(size * 0.42), bandBot = Math.round(size * 0.58)
  const left = Math.round(size * 0.16), right = Math.round(size * 0.84)
  for (let y = 0; y < size; y++) {
    const row = [0]
    for (let x = 0; x < size; x++) {
      let px = teal
      if (y >= bandTop && y < bandBot && x >= left && x < right) {
        px = white
        const step = (right - left) / 10
        const i = Math.floor((x - left) / step)
        const inTick = (x - left) - i * step < Math.max(1, size * 0.012)
        const tickLen = i % 5 === 0 ? 0.6 : 0.35
        if (inTick && y < bandTop + (bandBot - bandTop) * tickLen) px = dark
      }
      row.push(...px)
    }
    rows.push(Buffer.from(row))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icons/icon-192.png', png(192))
writeFileSync('public/icons/icon-512.png', png(512))
writeFileSync('public/icons/apple-touch-icon.png', png(180))
console.log('icons written')
