// ============================================================
// 桌面截图图像处理 — 纯 JS（无 robotjs / 无 DOM 依赖，可单测）
//
// robotjs 的 screen.capture() 返回 BGRA32 原始像素（Windows 实测：字节序 B,G,R,A，
// 行 stride = byteWidth，HiDPI 下可能大于 width*4）。Electron 主进程没有
// DOM/canvas，因此这里用纯 JS 完成：最近邻等比缩放 + 极简 PNG 编码（8bit RGBA）。
// ============================================================
import zlib from 'node:zlib'

/** 截图缩放后的最大宽度（像素）。超过则等比缩小。 */
export const MAX_IMAGE_WIDTH = 1280

/** robotjs 截图 Image 的最小结构（只用到这些字段）。 */
export interface RawBgraImage {
  width: number
  height: number
  byteWidth: number // 行字节数（stride），HiDPI 下可能 > width*4
  image: Buffer // BGRA32 原始像素
}

// ---------- 极简 PNG 编码 ----------

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * 编码 RGBA 像素为 PNG（8bit，color type 6，无交错）。
 * 每条 scanline 前缀 filter byte = 0（None），整体 zlib deflate。
 */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 6 })
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// ---------- 最近邻缩放（BGRA → RGBA）+ 编码 ----------

/**
 * 把 BGRA32 截图等比缩放到 ≤maxWidth 宽（最近邻），转为 RGBA 并编码为 PNG base64。
 * - 目标宽 = min(maxWidth, 源宽)；源已 ≤maxWidth 时保持原尺寸（1:1，仅字节序转换）。
 * - 源为 robotjs 的 BGRA 序（Windows 实测，stride = byteWidth），输出为 RGBA 序（连续）。
 * @returns base64 PNG 与最终图像宽高（该宽高即 LLM 坐标的基准空间）
 */
export function resizeBgraToPngBase64(
  img: RawBgraImage,
  maxWidth: number = MAX_IMAGE_WIDTH
): { base64: string; width: number; height: number } {
  const srcW = img.width
  const srcH = img.height
  const targetW = Math.min(maxWidth, srcW)
  const targetH = Math.max(1, Math.round((srcH * targetW) / srcW))

  const out = Buffer.alloc(targetW * targetH * 4)
  const src = img.image
  const stride = img.byteWidth
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / targetH))
    const srcRowOff = sy * stride
    const dstRowOff = y * targetW * 4
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / targetW))
      const si = srcRowOff + sx * 4
      const di = dstRowOff + x * 4
      out[di] = src[si + 2] // R
      out[di + 1] = src[si + 1] // G
      out[di + 2] = src[si] // B
      out[di + 3] = src[si + 3] // A
    }
  }
  return { base64: encodePng(out, targetW, targetH).toString('base64'), width: targetW, height: targetH }
}
