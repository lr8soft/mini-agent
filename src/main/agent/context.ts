// ============================================================
// 上下文管理 — Token 估算 + Auto Compact
// 当上下文使用超过阈值时自动压缩对话历史
// ============================================================
import type { ChatMessage, ProviderConfig } from '../../shared/types'
import { complete } from '../llm/provider'
import { log } from '../llm/logger'
import { planCompact } from './history'

// 默认上下文窗口（API 未返回时的 fallback）
const DEFAULT_CONTEXT_WINDOW = 32768

// 触发 auto compact 的阈值比例（60%）
const COMPACT_THRESHOLD = 0.6

// 压缩后保留的最近消息条数
const KEEP_RECENT_COUNT = 8

// 缓存：provider+model → contextWindow
const contextWindowCache = new Map<string, number>()

/**
 * 从 API 动态获取模型的上下文窗口大小
 *
 * 尝试顺序：
 * 1. 用户在 ProviderConfig.contextWindow 手动配置 → 直接使用
 * 2. GET /v1/models → data[0].meta.n_ctx（llama.cpp 扩展字段）
 * 3. GET /props → default_generation_settings.n_ctx（llama.cpp 专有端点）
 * 4. POST /api/show → model_info.<arch>.context_length（Ollama 专有端点）
 * 5. 以上都失败 → DEFAULT_CONTEXT_WINDOW
 */
export async function fetchContextWindow(provider: ProviderConfig, modelOverride?: string): Promise<number> {
  // 用户手动配置优先
  if (provider.contextWindow && provider.contextWindow > 0) {
    return provider.contextWindow
  }

  const model = modelOverride || provider.defaultModel
  const cacheKey = `${provider.baseUrl}::${model}`
  if (contextWindowCache.has(cacheKey)) {
    return contextWindowCache.get(cacheKey)!
  }

  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  let nCtx: number | null = null

  // 尝试 1: GET /v1/models — llama.cpp 返回 data[].meta.n_ctx
  try {
    const resp = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(5000) })
    if (resp.ok) {
      const json: any = await resp.json()
      const models = json.data || json.models
      if (Array.isArray(models) && models.length > 0) {
        const meta = models[0].meta
        if (meta && typeof meta.n_ctx === 'number' && meta.n_ctx > 0) {
          nCtx = meta.n_ctx
          log('info', `Context window from /v1/models: n_ctx=${nCtx}`)
        }
      }
    }
  } catch {
    // 忽略，继续尝试下一个端点
  }

  // 尝试 2: GET /props — llama.cpp 专有端点
  if (nCtx === null) {
    try {
      // /props 可能在 baseUrl 根目录下，也可能在 /v1 下
      for (const propsUrl of [`${baseUrl.replace(/\/v1$/, '')}/props`, `${baseUrl}/../props`]) {
        try {
          const resp = await fetch(propsUrl, { headers, signal: AbortSignal.timeout(5000) })
          if (resp.ok) {
            const json: any = await resp.json()
            const settings = json.default_generation_settings
            if (settings && typeof settings.n_ctx === 'number' && settings.n_ctx > 0) {
              nCtx = settings.n_ctx
              log('info', `Context window from /props: n_ctx=${nCtx}`)
              break
            }
          }
        } catch {
          continue
        }
      }
    } catch {
      // 忽略
    }
  }

  // 尝试 3: POST /api/show — Ollama 专有端点
  if (nCtx === null) {
    try {
      const ollamaUrl = baseUrl.replace(/\/v1$/, '').replace(/\/api$/, '')
      const resp = await fetch(`${ollamaUrl}/api/show`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(5000)
      })
      if (resp.ok) {
        const json: any = await resp.json()
        const modelInfo = json.model_info
        if (modelInfo) {
          // 查找 <arch>.context_length 字段
          for (const [key, value] of Object.entries(modelInfo)) {
            if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
              nCtx = value
              log('info', `Context window from /api/show: ${key}=${nCtx}`)
              break
            }
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  if (nCtx !== null) {
    contextWindowCache.set(cacheKey, nCtx)
    return nCtx
  }

  log('warn', `Could not detect context window for ${model} at ${baseUrl}, using default ${DEFAULT_CONTEXT_WINDOW}`)
  contextWindowCache.set(cacheKey, DEFAULT_CONTEXT_WINDOW)
  return DEFAULT_CONTEXT_WINDOW
}

/**
 * 获取上下文窗口大小（同步版本，使用缓存或手动配置）
 * 首次调用前应先调用 fetchContextWindow
 */
export function getContextWindow(provider: ProviderConfig, modelOverride?: string): number {
  if (provider.contextWindow && provider.contextWindow > 0) {
    return provider.contextWindow
  }

  const model = modelOverride || provider.defaultModel
  const cacheKey = `${provider.baseUrl}::${model}`
  const cached = contextWindowCache.get(cacheKey)
  if (cached) {
    return cached
  }

  return DEFAULT_CONTEXT_WINDOW
}

/**
 * 粗略估算消息列表的 token 数
 * 使用字符数 / 4 作为近似值
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let totalChars = 0
  for (const msg of messages) {
    totalChars += 16 // 元数据开销
    if (msg.content) {
      if (Array.isArray(msg.content)) {
        // 多模态 content parts（如截图）
        for (const part of msg.content) {
          if (part.type === 'text') totalChars += part.text.length
          else if (part.type === 'image_url') {
            // base64 图片：粗略估算为 token 数 ≈ base64 长度 / 4（非常粗略，实际取决于模型视觉编码）
            const url = part.image_url?.url || ''
            const b64Start = url.indexOf('base64,')
            totalChars += b64Start >= 0 ? (url.length - b64Start - 7) / 6 : url.length
          }
        }
      } else {
        totalChars += msg.content.length
      }
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        totalChars += (tc.function.name.length + tc.function.arguments.length + 20)
      }
    }
    if (msg.name) {
      totalChars += msg.name.length
    }
  }
  return Math.ceil(totalChars / 4)
}

/**
 * 检查是否需要触发 auto compact
 */
export function needsCompact(
  messages: ChatMessage[],
  contextWindow: number
): boolean {
  const used = estimateTokens(messages)
  const threshold = Math.floor(contextWindow * COMPACT_THRESHOLD)
  log('info', `Context check: ${used} / ${contextWindow} tokens (${Math.round(used / contextWindow * 100)}%), threshold ${COMPACT_THRESHOLD * 100}%`)
  return used >= threshold
}

/**
 * 执行 auto compact：将早期消息压缩为摘要，保留最近 N 条
 */
export async function autoCompact(
  messages: ChatMessage[],
  provider: ProviderConfig,
  modelOverride?: string
): Promise<ChatMessage[]> {
  // 分离 system 消息和对话消息
  const systemMsgs: ChatMessage[] = []
  const conversationMsgs: ChatMessage[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMsgs.push(msg)
    } else {
      conversationMsgs.push(msg)
    }
  }

  if (conversationMsgs.length <= KEEP_RECENT_COUNT + 2) {
    log('info', 'Auto compact: not enough messages to compress')
    return messages
  }

  // 安全切分：切点不会落在 assistant(tool_calls) 与其 tool 结果之间，
  // 否则压缩后重排会产生悬空 tool 消息，LLM API 直接 400
  const { toCompress, toKeep } = planCompact(conversationMsgs, KEEP_RECENT_COUNT)
  if (toCompress.length === 0) {
    log('info', 'Auto compact: no safe boundary to split, skipping')
    return messages
  }

  log('info', `Auto compact: compressing ${toCompress.length} messages, keeping ${toKeep.length} recent`)

  const summaryInput = toCompress.map(m => {
    let text = `[${m.role}]`
    if (m.name) text += ` (${m.name})`
    if (m.content) {
      if (Array.isArray(m.content)) {
        // 多模态 content：提取文本部分，图片标记为 [image]
        for (const part of m.content) {
          if (part.type === 'text') text += `: ${part.text}`
          else if (part.type === 'image_url') text += ': [screenshot image]'
        }
      } else {
        text += `: ${m.content}`
      }
    }
    if (m.tool_calls && m.tool_calls.length > 0) {
      text += ` [Tool calls: ${m.tool_calls.map(tc => `${tc.function.name}(${tc.function.arguments.slice(0, 100)})`).join(', ')}]`
    }
    return text
  }).join('\n\n')

  const summaryPrompt: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a conversation summarizer. Summarize the following conversation history concisely, preserving key context, decisions, file paths, code snippets, and important findings. Output a single paragraph summary. Do not include pleasantries. Be specific about technical details.'
    },
    {
      role: 'user',
      content: `Summarize this conversation history:\n\n${summaryInput}`
    }
  ]

  try {
    const summary = await complete(provider, summaryPrompt, modelOverride, 800)
    log('info', `Auto compact: summary generated (${summary.length} chars)`)

    const compactedMessages: ChatMessage[] = [
      ...systemMsgs,
      {
        role: 'user',
        content: `[Auto Compact Summary]\n${summary}`
      },
      ...toKeep
    ]

    const beforeTokens = estimateTokens([...systemMsgs, ...conversationMsgs])
    const afterTokens = estimateTokens(compactedMessages)
    log('info', `Auto compact: ${beforeTokens} → ${afterTokens} tokens (saved ${beforeTokens - afterTokens})`)

    return compactedMessages
  } catch (err) {
    log('error', `Auto compact failed: ${(err as Error).message}`)
    const fallback: ChatMessage[] = [...systemMsgs, ...toKeep]
    log('warn', 'Auto compact: falling back to simple truncation')
    return fallback
  }
}
