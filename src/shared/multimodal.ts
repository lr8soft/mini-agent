// ============================================================
// 多模态消息工具 — 用户图片附件与 OpenAI ContentPart 的转换
// 主进程（IPC / runner / context）共用，保证组装规则单一出处
// ============================================================
import type { ChatMessage, ContentPart } from './types'

/**
 * 把用户输入（文本 + base64 图片 data URL）组装为 OpenAI 多模态 content。
 * - 无图片 → 返回纯字符串（保持旧格式，兼容不支持多模态的后端）
 * - 有图片 → 返回 ContentPart[]（text 在前，图片在后；空文本也保留 text part 兜底）
 */
export function buildUserContent(text: string, images?: string[]): string | ContentPart[] {
  if (!images || images.length === 0) return text
  const parts: ContentPart[] = []
  if (text.trim()) {
    parts.push({ type: 'text', text })
  }
  for (const url of images) {
    if (!url) continue
    parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
  }
  return parts
}

/**
 * 提取消息中的纯文本部分（用于日志、记忆检索、摘要等只关心文本的场景）。
 * - 字符串 → 原样返回
 * - ContentPart[] → 拼接所有 text part（忽略图片）
 */
export function extractTextContent(content: ChatMessage['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return content
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('\n')
}

/** 统计消息中携带的图片数量 */
export function countImages(content: ChatMessage['content']): number {
  if (!Array.isArray(content)) return 0
  return content.filter(p => p.type === 'image_url').length
}
