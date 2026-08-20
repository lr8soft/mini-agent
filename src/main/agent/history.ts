// ============================================================
// 消息历史合法性工具 — 保证发送给 LLM 的消息序列符合 OpenAI 协议
//
// OpenAI 协议要求：
// 1. 每条 tool 消息必须紧跟在其对应 assistant(tool_calls) 之后
// 2. 每个 assistant(tool_calls) 的每个 tool_call 都必须有对应的 tool 结果
// 违反任一条，API 直接返回 400。
//
// 本项目有两个产生非法序列的来源：
// A. autoCompact 按"最近 N 条消息"硬切：切点可能落在
//    assistant(tool_calls) 与其 tool 结果之间 → tool 消息悬空
// B. 崩溃/中止恢复：runner 在工具执行前就把带 tool_calls 的 assistant
//    消息存入 DB；此时 abort/崩溃会留下"有调用无结果"的悬空组
// ============================================================
import type { ChatMessage } from '../../shared/types'

/**
 * 在 >= minIndex 的位置找一个安全切分点：
 * 切分后 messages[safeIdx..] 作为新序列开头是合法的。
 *
 * 返回 0 表示无法安全切分（整个序列是一个未闭合的工具组等极端情况），
 * 调用方应放弃压缩而不是强行切。
 */
export function splitAtSafeBoundary(messages: ChatMessage[], minIndex: number): number {
  const len = messages.length
  let idx = Math.max(0, Math.min(minIndex, len))

  // 情形 1：切点落在 tool 消息上 → 回退到发起该调用的 assistant，
  // 让整个"assistant + 全部 tool 结果"组都留在保留侧
  if (idx < len && messages[idx].role === 'tool') {
    const callId = messages[idx].tool_call_id
    let found = -1
    for (let j = idx - 1; j >= 0; j--) {
      const m = messages[j]
      if (m.role === 'assistant' && m.tool_calls?.some(tc => tc.id === callId)) {
        found = j
        break
      }
    }
    if (found < 0) return 0 // 找不到发起者（历史已损坏）→ 放弃切分
    idx = found
  }

  // 情形 2：切点前一条是 assistant(tool_calls)，而切点正好是它的一条 tool 结果
  // → 回退一条，让整组留在保留侧
  if (idx > 0 && idx < len) {
    const prev = messages[idx - 1]
    const next = messages[idx]
    if (
      prev.role === 'assistant' &&
      prev.tool_calls && prev.tool_calls.length > 0 &&
      next.role === 'tool' &&
      next.tool_call_id &&
      prev.tool_calls.some(tc => tc.id === next.tool_call_id)
    ) {
      idx -= 1
    }
  }

  return idx
}

function hasContent(m: ChatMessage): boolean {
  if (typeof m.content === 'string') return m.content.trim().length > 0
  if (Array.isArray(m.content)) return m.content.length > 0
  return false
}

/**
 * 把消息列表清洗为可直接发送的合法序列：
 * - 孤儿 tool 结果（前面没有对应的 assistant tool_call）→ 删除
 * - assistant(tool_calls) 缺任意结果（abort/崩溃残留）→ 整组删除（含已有结果）
 * - 无 content 且无 tool_calls 的空 assistant → 删除
 * system / user / 完整合法组原样保留，顺序不变
 */
export function sanitizeHistory(messages: ChatMessage[]): ChatMessage[] {
  // 预收集所有 tool 结果 id
  const resultIds = new Set<string>()
  for (const m of messages) {
    if (m.role === 'tool' && m.tool_call_id) resultIds.add(m.tool_call_id)
  }

  const out: ChatMessage[] = []
  const openCallIds = new Set<string>() // 已见 assistant 调用、尚未见其结果

  for (const m of messages) {
    if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        // 任一结果缺失 → 整组丢弃（其已有结果因 openCallIds 未登记也会被当孤儿丢弃）
        const allPresent = m.tool_calls.every(tc => resultIds.has(tc.id))
        if (!allPresent) continue
        for (const tc of m.tool_calls) openCallIds.add(tc.id)
      } else if (!hasContent(m)) {
        continue // 空 assistant 消息无意义
      }
      out.push(m)
    } else if (m.role === 'tool') {
      // 仅保留"前面存在对应调用"的 tool 结果
      if (m.tool_call_id && openCallIds.has(m.tool_call_id)) {
        openCallIds.delete(m.tool_call_id)
        out.push(m)
      }
    } else {
      out.push(m)
    }
  }
  return out
}

/**
 * 规划 compact 切分（切点对齐完整轮次）：
 * - toKeep   = 最近 keepRecent 条消息，必要时向前扩展到安全切点
 * - toCompress = 其余部分；为空数组表示本次不应压缩
 *
 * 不变量：toCompress 与 toKeep 拼接后等于原序列，且 toKeep 开头合法。
 */
export function planCompact(
  messages: ChatMessage[],
  keepRecent: number
): { toCompress: ChatMessage[]; toKeep: ChatMessage[] } {
  if (messages.length <= keepRecent + 2) {
    return { toCompress: [], toKeep: messages }
  }

  const idx = splitAtSafeBoundary(messages, messages.length - keepRecent)
  if (idx <= 0) {
    return { toCompress: [], toKeep: messages }
  }
  return { toCompress: messages.slice(0, idx), toKeep: messages.slice(idx) }
}
