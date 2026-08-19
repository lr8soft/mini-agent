// ============================================================
// LLM Provider 适配器 — 统一 OpenAI 兼容接口
// 天然支持任意端点：OpenAI / Anthropic(兼容层) / Ollama / vLLM
// ============================================================
import type { ChatMessage, ProviderConfig, ToolCall, ToolDefinition } from '../../shared/types'
import { mainWindow } from '../index'

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface StreamCallbacks {
  onToken?: (token: string) => void
  onComplete?: (fullText: string, toolCalls: ToolCall[]) => void
  onError?: (error: Error) => void
}

export interface CompletionParams {
  messages: ChatMessage[]
  model?: string
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
}

/**
 * 发起流式补全请求
 * 返回 { content, toolCalls }
 */
export async function streamChat(
  provider: ProviderConfig,
  params: CompletionParams,
  cb?: StreamCallbacks
): Promise<{ content: string; toolCalls: ToolCall[]; usage?: TokenUsage }> {
  const model = params.model || provider.defaultModel
  const body: Record<string, unknown> = {
    model,
    messages: params.messages.map(m => {
      const msg: Record<string, unknown> = {
        role: m.role,
        // content 可能是 string、null 或多模态 ContentPart[]（截图工具结果）
        content: Array.isArray(m.content) ? m.content : (m.content ?? '')
      }
      // 只包含有值的字段，避免 llama.cpp 等严格后端因 null 报错
      if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      if (m.name) msg.name = m.name
      return msg
    }),
    stream: true,
    stream_options: { include_usage: true }
  }
  if (params.tools?.length) {
    body.tools = params.tools
    body.tool_choice = 'auto'
  }
  if (params.temperature !== undefined) body.temperature = params.temperature
  if (params.maxTokens) body.max_tokens = params.maxTokens
  // reasoning_effort（DeepSeek-R1 / OpenAI o-series 等）
  if (params.reasoningEffort) body.reasoning_effort = params.reasoningEffort

  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`
  let fullText = ''
  const toolCallsMap = new Map<number, ToolCall>()

  let lastUsage: TokenUsage | undefined

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: params.signal
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`LLM API ${resp.status}: ${errText.slice(0, 500)}`)
    }

    const reader = resp.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta

          // 提取 usage（OpenAI 兼容 API 在 stream_options.include_usage=true 时，最后一个 chunk 包含 usage）
          if (json.usage) {
            lastUsage = {
              prompt_tokens: json.usage.prompt_tokens || 0,
              completion_tokens: json.usage.completion_tokens || 0,
              total_tokens: json.usage.total_tokens || 0
            }
          }

          if (!delta) continue

          // 文本增量
          if (delta.content) {
            fullText += delta.content
            cb?.onToken?.(delta.content)
          }

          // 工具调用增量（分片到达，需拼接）
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                })
              }
              const existing = toolCallsMap.get(idx)!
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.function.name += tc.function.name
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
            }
          }
        } catch {
          // 部分 chunk 可能不完整，跳过即可
        }
      }
    }

    const toolCalls = Array.from(toolCallsMap.values())
    cb?.onComplete?.(fullText, toolCalls)
    return { content: fullText, toolCalls, usage: lastUsage }
  } catch (err) {
    const error = err as Error
    if (error.name === 'AbortError') {
      cb?.onComplete?.(fullText, Array.from(toolCallsMap.values()))
      return { content: fullText, toolCalls: Array.from(toolCallsMap.values()), usage: lastUsage }
    }
    cb?.onError?.(error)
    throw error
  }
}

/**
 * 非流式补全（简短调用，如生成会话标题）
 */
export async function complete(
  provider: ProviderConfig,
  messages: ChatMessage[],
  model?: string,
  maxTokens = 200
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: model || provider.defaultModel,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: Array.isArray(m.content) ? m.content : (m.content ?? '')
        }
        if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
        if (m.name) msg.name = m.name
        return msg
      }),
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false
    })
  })
  if (!resp.ok) throw new Error(`LLM API ${resp.status}: ${await resp.text()}`)
  const json: any = await resp.json()
  return json.choices?.[0]?.message?.content || ''
}

// 日志辅助
export function log(level: 'info' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`)
  mainWindow?.webContents.send('agent:log', { level, msg, ts })
}
