// ============================================================
// 循环检测 — 重复相同工具调用检测（Cline LoopDetectionTracker 方案）
//
// 每次工具调用的签名 = 工具名 + 参数（key 排序后的 JSON，参数顺序不敏感）。
// 连续相同调用计数：
//   达到 softThreshold（默认 3）→ 在工具结果追加软警告，提示模型换方法（不阻断）
//   达到 hardThreshold（默认 5）→ 硬停：跳过执行、占位结果、触发优雅收尾
//
// 设计取舍：轮数上限是"成本保险丝"（粗糙但兜底），循环检测才是精准打击
// "原地打转"病态的主要防线——5 次内拦住，同时不惩罚轮数多但每步有进展的长任务。
// ============================================================

export interface LoopDetectionConfig {
  /** 连续相同调用达到该次数 → 软警告（追加提示，不阻断） */
  softThreshold: number
  /** 连续相同调用达到该次数 → 硬停（停止执行 + 收尾） */
  hardThreshold: number
}

export const DEFAULT_LOOP_CONFIG: LoopDetectionConfig = {
  softThreshold: 3,
  hardThreshold: 5
}

export type LoopVerdictKind = 'ok' | 'soft' | 'hard'

export interface LoopVerdict {
  kind: LoopVerdictKind
  /** 当前连续相同调用次数 */
  count: number
  toolName: string
}

/** 递归排序对象 key，保证签名稳定（{"a":1,"b":2} 与 {"b":2,"a":1} 视为相同） */
function sortKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeys)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key])
  }
  return sorted
}

/** 工具调用签名：工具名 + 规范化后的参数 JSON（参数非法 JSON 时原样使用，保守处理） */
export function toolCallSignature(toolName: string, argsRaw: string): string {
  let args = argsRaw || ''
  try {
    args = JSON.stringify(sortKeys(JSON.parse(argsRaw || '{}')))
  } catch {
    // 参数不是合法 JSON → 用原始字符串（保守：不同原文视为不同调用）
  }
  return `${toolName}::${args}`
}

/**
 * 每次 Agent run 新建一个实例（状态不跨 run 保留）。
 */
export class LoopDetector {
  private lastSignature = ''
  private count = 0

  /** 检查一次工具调用，返回判定（调用顺序敏感：按 LLM 返回的 tool_calls 顺序逐个 inspect） */
  inspect(toolName: string, argsRaw: string, config: LoopDetectionConfig = DEFAULT_LOOP_CONFIG): LoopVerdict {
    const sig = toolCallSignature(toolName, argsRaw)
    this.count = sig === this.lastSignature ? this.count + 1 : 1
    this.lastSignature = sig
    const kind: LoopVerdictKind =
      this.count >= config.hardThreshold ? 'hard'
      : this.count >= config.softThreshold ? 'soft'
      : 'ok'
    return { kind, count: this.count, toolName }
  }
}
