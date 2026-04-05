import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgBuffer = readFileSync(join(root, 'build', 'icon.svg'))

mkdirSync(join(root, 'build'), { recursive: true })
mkdirSync(join(root, 'resources'), { recursive: true })

// ─── PNG 生成 ─────────────────────────────────────────────────────────────────
const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer()
writeFileSync(join(root, 'build', 'icon.png'), png512)
writeFileSync(join(root, 'resources', 'icon.png'), png512)
console.log('✅ build/icon.png, resources/icon.png (512x512)')

// ─── ICO 生成（16 / 32 / 48 / 256 の 4 サイズを 1 ファイルに）─────────────────
const icoSizes = [16, 32, 48, 256]
const pngBuffers = await Promise.all(
  icoSizes.map(s => sharp(svgBuffer).resize(s, s).png().toBuffer())
)

function buildIco(buffers, sizes) {
  const count = buffers.length
  const entriesOffset = 6 + 16 * count
  let dataOffset = entriesOffset
  const offsets = buffers.map(buf => {
    const o = dataOffset
    dataOffset += buf.length
    return o
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type: icon
  header.writeUInt16LE(count, 4)

  const entries = buffers.map((buf, i) => {
    const e = Buffer.alloc(16)
    const s = sizes[i]
    e.writeUInt8(s >= 256 ? 0 : s, 0)  // 0 = 256px
    e.writeUInt8(s >= 256 ? 0 : s, 1)
    e.writeUInt8(0, 2)   // color count (0 = truecolor)
    e.writeUInt8(0, 3)   // reserved
    e.writeUInt16LE(1, 4)   // planes
    e.writeUInt16LE(32, 6)  // bit depth
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offsets[i], 12)
    return e
  })

  return Buffer.concat([header, ...entries, ...buffers])
}

const icoBuffer = buildIco(pngBuffers, icoSizes)
writeFileSync(join(root, 'build', 'icon.ico'), icoBuffer)
console.log('✅ build/icon.ico (16 / 32 / 48 / 256px)')
console.log('\n🎉 完了！次は npm run build:win でビルドしてください。')
