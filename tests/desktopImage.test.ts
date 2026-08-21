// ============================================================
// desktopImage.ts 单元测试 — node tests/desktopImage.test.ts
//   验证：极简 PNG 编码（签名/IHDR/CRC/IDAT 可还原）+ 最近邻缩放 + BGRA→RGBA
//   （BGRA = robotjs screen.capture 在 Windows 上的实测字节序）
// ============================================================
import zlib from 'node:zlib'
import { encodePng, resizeBgraToPngBase64, MAX_IMAGE_WIDTH } from '../src/main/tools/desktopImage.ts'
import type { RawBgraImage } from '../src/main/tools/desktopImage.ts'

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${(err as Error).message}`)
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}
function assertEq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
}
function assertDeepEq(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a)
  const jb = JSON.stringify(b)
  if (ja !== jb) throw new Error(`${msg} — got ${ja}, want ${jb}`)
}

// ---- 解析 PNG chunk，返回 { type, data } 列表 ----
function parseChunks(png: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = []
  let off = 8 // 跳过 8 字节签名
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.slice(off + 4, off + 8).toString('ascii')
    const data = png.slice(off + 8, off + 8 + len)
    chunks.push({ type, data })
    off += 12 + len
  }
  return chunks
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ---- CRC32（与实现相同的算法，独立重写以交叉校验）----
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

// 构造一个已知内容的 BGRA 图像（robotjs 真实字节序 B,G,R,A）
// 像素 (x,y) 的逻辑颜色：R=x, G=y, B=x+y；BGRA 字节 = [B, G, R, A] = [x+y, y, x, 0xff]
function makeBgra(w: number, h: number): RawBgraImage {
  const image = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      image[i] = (x + y) & 0xff // B
      image[i + 1] = y // G
      image[i + 2] = x // R
      image[i + 3] = 0xff // A
    }
  }
  return { width: w, height: h, byteWidth: w * 4, image }
}

console.log('\nencodePng')

test('PNG 签名正确', () => {
  const png = encodePng(Buffer.alloc(4 * 4 * 4), 4, 4)
  assert(png.slice(0, 8).equals(PNG_SIG), '8 字节签名')
})

test('chunk 顺序 IHDR→IDAT→IEND 且各 chunk CRC 正确', () => {
  const rgba = Buffer.alloc(3 * 2 * 4)
  rgba.fill(0xab)
  const png = encodePng(rgba, 3, 2)
  const chunks = parseChunks(png)
  assertEq(chunks.map(c => c.type).join(','), 'IHDR,IDAT,IEND', 'chunk 顺序')
  // 逐块校验 CRC
  let off = 8
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.slice(off + 4, off + 8)
    const data = png.slice(off + 8, off + 8 + len)
    const crcStored = png.readUInt32BE(off + 8 + len)
    const crcCalc = crc32(Buffer.concat([type, data]))
    assertEq(crcStored, crcCalc, `chunk ${type.toString('ascii')} CRC`)
    off += 12 + len
  }
})

test('IHDR 字段：宽高/bit depth=8/color type=6(RGBA)', () => {
  const png = encodePng(Buffer.alloc(5 * 7 * 4), 5, 7)
  const ihdr = parseChunks(png).find(c => c.type === 'IHDR')!.data
  assertEq(ihdr.readUInt32BE(0), 5, 'width')
  assertEq(ihdr.readUInt32BE(4), 7, 'height')
  assertEq(ihdr[8], 8, 'bit depth')
  assertEq(ihdr[9], 6, 'color type RGBA')
  assertEq(ihdr[10], 0, 'compression')
  assertEq(ihdr[11], 0, 'filter')
  assertEq(ihdr[12], 0, 'interlace')
})

test('IDAT 可 inflate 还原为 raw（每行 filter byte=0 + RGBA）', () => {
  const w = 3, h = 2
  const rgba = Buffer.alloc(w * h * 4)
  rgba.fill(0x11)
  rgba[0] = 0x22
  const png = encodePng(rgba, w, h)
  const idat = parseChunks(png).find(c => c.type === 'IDAT')!.data
  const raw = zlib.inflateSync(idat)
  // raw 长度 = (w*4+1)*h
  assertEq(raw.length, (w * 4 + 1) * h, 'raw 长度')
  // 每行首个字节 = filter 0
  for (let y = 0; y < h; y++) assertEq(raw[y * (w * 4 + 1)], 0, `row ${y} filter byte`)
  // 像素数据一致
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ri = y * (w * 4 + 1) + 1 + x * 4
      assertEq(raw[ri], rgba[y * w * 4 + x * 4], `pixel(${x},${y}) R`)
      assertEq(raw[ri + 1], rgba[y * w * 4 + x * 4 + 1], `pixel(${x},${y}) G`)
    }
  }
})

console.log('\nresizeBgraToPngBase64')

test('BGRA→RGBA 字节序转换（1:1，未超 maxWidth）', () => {
  const img = makeBgra(4, 2)
  const r = resizeBgraToPngBase64(img, 100) // maxWidth 100 > 4 → 保持 4x2
  assertEq(r.width, 4, 'width 不变')
  assertEq(r.height, 2, 'height 不变')
  // 解码 base64 回 PNG，取 IDAT 还原，检查 (1,1) 像素
  const png = Buffer.from(r.base64, 'base64')
  const idat = parseChunks(png).find(c => c.type === 'IDAT')!.data
  const raw = zlib.inflateSync(idat)
  const rowStride = 4 * 4 + 1
  const off = rowStride + 1 + 1 * 4 // (1,1)：跳过 row0 + filter byte + 1 个像素
  const [R, G, B, A] = [raw[off], raw[off + 1], raw[off + 2], raw[off + 3]]
  // 逻辑颜色 (1,1)：R=1, G=1, B=2 → 期望 RGBA [1,1,2,FF]（字节序错会读出 [2,1,1]）
  assertDeepEq([R, G, B, A], [1, 1, 2, 0xff], '(1,1) RGBA')
})

test('最近邻缩放：4x2 → 2x1 采样源 (0,0) 与 (2,0)', () => {
  const img = makeBgra(4, 2)
  const r = resizeBgraToPngBase64(img, 2) // maxWidth 2 → 2x1
  assertEq(r.width, 2, 'width=2')
  assertEq(r.height, 1, 'height=1')
  const png = Buffer.from(r.base64, 'base64')
  const idat = parseChunks(png).find(c => c.type === 'IDAT')!.data
  const raw = zlib.inflateSync(idat)
  // dest(0,0) 采样源 sx=floor(0*4/2)=0, sy=floor(0*2/1)=0 → 源(0,0) R0 G0 B0 → RGBA[0,0,0,FF]
  const p0 = [raw[1], raw[2], raw[3], raw[4]]
  assertDeepEq(p0, [0, 0, 0, 0xff], 'dest(0,0) = 源(0,0)')
  // dest(1,0) 采样源 sx=floor(1*4/2)=2, sy=0 → 源(2,0) R2 G0 B2 → RGBA[2,0,2,FF]
  // （若字节序按 ARGB 误读会输出 [0,2,2]，此断言可捕获该回归）
  const p1 = [raw[5], raw[6], raw[7], raw[8]]
  assertDeepEq(p1, [2, 0, 2, 0xff], 'dest(1,0) = 源(2,0)')
})

test('maxWidth 生效：超宽源被限制到 MAX_IMAGE_WIDTH 内', () => {
  // 构造 2000 宽源（不实际填充，只验证目标尺寸计算 + 不抛错）
  const img: RawBgraImage = { width: 2000, height: 1000, byteWidth: 2000 * 4, image: Buffer.alloc(2000 * 1000 * 4) }
  const r = resizeBgraToPngBase64(img)
  assert(r.width <= MAX_IMAGE_WIDTH, `width ${r.width} <= ${MAX_IMAGE_WIDTH}`)
  assertEq(r.width, MAX_IMAGE_WIDTH, '缩放到 MAX_IMAGE_WIDTH')
  assertEq(r.height, 640, 'height 等比 = round(1000*1280/2000)=640')
})

test('byteWidth > width*4（HiDPI stride）时仍正确采样', () => {
  // 2x1 图，stride 大于像素行宽（模拟 HiDPI 行内 padding）。
  // 逻辑颜色 (0,0) R1 G2 B3, (1,0) R4 G5 B6 → BGRA 字节 [3,2,1,FF], [6,5,4,FF]
  const image = Buffer.alloc(12 * 4) // 大 stride
  image[0] = 3; image[1] = 2; image[2] = 1; image[3] = 0xff // (0,0)
  image[4] = 6; image[5] = 5; image[6] = 4; image[7] = 0xff // (1,0)
  const img: RawBgraImage = { width: 2, height: 1, byteWidth: 12 * 4, image }
  const r = resizeBgraToPngBase64(img, 2)
  assertEq(r.width, 2, 'width=2')
  const png = Buffer.from(r.base64, 'base64')
  const idat = parseChunks(png).find(c => c.type === 'IDAT')!.data
  const raw = zlib.inflateSync(idat)
  const p0 = [raw[1], raw[2], raw[3], raw[4]]
  assertDeepEq(p0, [1, 2, 3, 0xff], 'dest(0,0) 正确读取（跳过 stride 影响）')
})

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
