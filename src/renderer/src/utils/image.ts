// ============================================================
// 图片附件处理 — File → 缩放后的 base64 data URL
// 仅渲染进程使用；主进程对 IPC 传入的 data URL 有二次校验
// 缩放目的：控制 base64 体积，避免吃满上下文窗口
// ============================================================

/** 单条消息最多附带的图片数 */
export const MAX_IMAGES = 4
/** 原始文件大小上限（字节） */
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024
/** 缩放后长边上限（px） */
export const MAX_IMAGE_DIMENSION = 2048
/** PNG 输出超过该体积（约，data URL 字符数）时回退 JPEG，进一步压缩上下文占用 */
const PNG_FALLBACK_BYTES = 4 * 1024 * 1024

export type ImageErrorCode = 'unsupported-type' | 'too-large' | 'decode-failed'

export class ImageAttachmentError extends Error {
  code: ImageErrorCode
  constructor(code: ImageErrorCode) {
    super(code)
    this.code = code
  }
}

/**
 * 把图片 File 处理为可发送给 LLM 的 data URL：
 * 1. 校验 MIME 类型与大小
 * 2. 长边缩放到 ≤ MAX_IMAGE_DIMENSION（canvas）
 * 3. PNG 保留无损（截图/文字更清晰）；超过阈值或非 PNG 统一转 JPEG(0.85)
 */
export async function processImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ImageAttachmentError('unsupported-type')
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new ImageAttachmentError('too-large')
  }

  const img = await loadImageElement(file)
  try {
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (!width || !height) throw new ImageAttachmentError('decode-failed')

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageAttachmentError('decode-failed')
    ctx.drawImage(img, 0, 0, targetW, targetH)

    let dataUrl = canvas.toDataURL('image/png')
    const isPng = file.type === 'image/png'
    if (!isPng || dataUrl.length > PNG_FALLBACK_BYTES) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

/** File → HTMLImageElement（objectURL 由调用方在 finally 中释放） */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageAttachmentError('decode-failed'))
    }
    img.src = url
  })
}
