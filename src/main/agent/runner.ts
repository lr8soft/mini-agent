// ============================================================
// Agent 调度器 — ReAct 工具调用循环
// 核心流程: 用户输入 → LLM → (tool_calls? → 执行工具 → 回传结果 → LLM)* → 最终回答
// ============================================================
import type { ChatMessage, ContentPart, ProviderConfig, ToolCall } from '../../shared/types'
import { streamChat, type TokenUsage } from '../llm/provider'
import { log } from '../llm/logger'
import { getTool, getAllTools, type ToolContext } from '../tools/registry'
import { buildMemoryPrompt, captureMemories } from '../memory/manager'
import { needsCompact, autoCompact, fetchContextWindow } from '../agent/context'
import { buildSystemPrompt } from '../agent/promptBuilder'

const MAX_TOOL_ROUNDS = 20      // 单次对话最大工具调用轮数，防止死循环

// Skill 提示词通过函数延迟获取，避免初始化顺序问题
let skillsPromptGetter: (() => string) | null = null
export function setSkillsPromptGetter(fn: () => string) {
  skillsPromptGetter = fn
}

export interface AgentEventCallbacks {
  /** LLM 流式 token */
  onToken?: (token: string) => void
  /** LLM 请求了工具调用 */
  onToolCall?: (toolCall: ToolCall) => void
  /** 工具执行完成 */
  onToolResult?: (toolCallId: string, toolName: string, result: string, isError: boolean, durationMs: number) => void
  /** 一轮 LLM 调用完成（可能继续循环或结束） */
  onAssistantMessage?: (content: string, toolCalls: ToolCall[]) => void
  /** Token 用量回调 */
  onTokenUsage?: (usage: TokenUsage, model: string) => void
  /** 整个对话完成 */
  onComplete?: () => void
  /** 出错 */
  onError?: (error: Error) => void
}

export interface AgentRunOptions {
  messages: ChatMessage[]
  provider: ProviderConfig
  workspacePath: string
  sessionId?: string
  /** 权限回调：返回 true 允许执行。决策逻辑由调用方实现（结合 autoApprove 和工具权限等级） */
  permissionCheck?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
  signal?: AbortSignal
  systemPromptExtra?: string
  /** 覆盖模型名（如果用户在聊天页选了别的模型） */
  modelOverride?: string
  /** 是否启用长期记忆（提取 + 注入） */
  memoryEnabled?: boolean
  /** 会话标题更新回调（由 IPC 层注入） */
  onSessionTitleUpdate?: (sessionId: string, title: string) => void
}

/**
 * 运行一次完整的 Agent 对话
 */
export async function runAgent(
  opts: AgentRunOptions,
  cb: AgentEventCallbacks
): Promise<ChatMessage[]> {
  const { provider, workspacePath, messages, signal, permissionCheck, modelOverride, sessionId, memoryEnabled, onSessionTitleUpdate } = opts

  // 构建系统提示词（含记忆注入 + MCP 工具动态列表）
  const skillsPrompt = skillsPromptGetter ? skillsPromptGetter() : ''
  const memoryPrompt = memoryEnabled ? buildMemoryPrompt(getLastUserMessage(messages)) : ''
  const systemPrompt = buildSystemPrompt(workspacePath, skillsPrompt, memoryPrompt, opts.systemPromptExtra)

  // 工作消息列表（含 system）
  const workingMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  // 运行时获取上下文窗口大小（从 API 动态检测）
  const contextWindow = await fetchContextWindow(provider, modelOverride)
  log('info', `Context window: ${contextWindow} tokens`)

  // Auto Compact: 发送前检查上下文是否超阈值
  if (needsCompact(workingMessages, contextWindow)) {
    log('info', 'Auto compact triggered before sending')
    const compacted = await autoCompact(workingMessages, provider, modelOverride)
    workingMessages.length = 0
    workingMessages.push(...compacted)
  }

  let round = 0
  const allAssistantMessages: ChatMessage[] = []

  while (round < MAX_TOOL_ROUNDS) {
    round++
    log('info', `Agent round ${round} — sending ${workingMessages.length} messages to LLM`)

    // 每轮发送前也检查（工具结果可能很大，导致上下文膨胀）
    if (round > 1 && needsCompact(workingMessages, contextWindow)) {
      log('info', `Auto compact triggered at round ${round}`)
      const compacted = await autoCompact(workingMessages, provider, modelOverride)
      workingMessages.length = 0
      workingMessages.push(...compacted)
    }

    const tools = getAllTools()
    const model = modelOverride || provider.defaultModel
    const { content, toolCalls, usage } = await streamChat(provider, {
      messages: workingMessages,
      tools: tools.length > 0 ? tools : undefined,
      model,
      temperature: provider.temperature,
      reasoningEffort: provider.reasoningEnabled ? provider.reasoningEffort : undefined,
      signal
    }, {
      onToken: cb.onToken,
      onError: cb.onError
    })

    // 回传 token 用量
    if (usage) {
      cb.onTokenUsage?.(usage, model)
    }

    cb.onAssistantMessage?.(content, toolCalls)

    // 如果没有工具调用 → 对话结束
    if (!toolCalls || toolCalls.length === 0) {
      log('info', `Agent completed after ${round} round(s)`)
      cb.onComplete?.()
      // 异步提取记忆（不阻塞返回）
      if (memoryEnabled && sessionId) {
        captureMemories(provider, workingMessages, sessionId).catch(() => {})
      }
      return allAssistantMessages
    }

    // 记录 assistant 消息（含 tool_calls）
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls
    }
    workingMessages.push(assistantMsg)
    allAssistantMessages.push(assistantMsg)

    // 执行每个工具调用
    for (const tc of toolCalls) {
      cb.onToolCall?.(tc)

      const toolEntry = getTool(tc.function.name)
      let resultText: string
      let isError = false
      let durationMs = 0

      if (!toolEntry) {
        resultText = `Error: Tool "${tc.function.name}" not found`
        isError = true
        log('error', `Tool not found: ${tc.function.name}`)
      } else {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}')
        } catch {
          resultText = `Error: Invalid JSON arguments: ${tc.function.arguments}`
          isError = true
        }

        if (!isError) {
          // 权限检查 — 统一由 permissionCheck 决策
          // permissionCheck 内部根据工具权限等级 + autoApprove 判断是否需要弹窗
          if (permissionCheck) {
            const allowed = await permissionCheck(tc.function.name, parsedArgs)
            if (!allowed) {
              resultText = 'Permission denied by user'
              isError = true
              cb.onToolResult?.(tc.id, tc.function.name, resultText, true, 0)
              workingMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.function.name,
                content: resultText
              })
              continue
            }
          }

          // 执行工具
          const ctx: ToolContext = { workspacePath, sessionId, onSessionTitleUpdate }
          const start = Date.now()
          try {
            log('info', `Executing tool: ${tc.function.name}(${JSON.stringify(parsedArgs).slice(0, 200)})`)
            resultText = await toolEntry.handler.execute(parsedArgs, ctx)
            durationMs = Date.now() - start
            log('info', `Tool ${tc.function.name} completed in ${durationMs}ms`)
          } catch (err) {
            durationMs = Date.now() - start
            resultText = `Error: ${(err as Error).message}`
            isError = true
            log('error', `Tool ${tc.function.name} failed: ${(err as Error).message}`)
          }
        }
      }

      // 对于截图结果，传给前端/DB 的是精简文本，避免 base64 爆炸
      const isImageResult = !isError && resultText.startsWith('__IMAGE_BASE64__:')
      const displayResult = isImageResult
        ? 'Screenshot captured (image sent to LLM for visual analysis)'
        : resultText
      cb.onToolResult?.(tc.id, tc.function.name, displayResult, isError, durationMs)

      // 追加 tool 消息 — 如果结果是 base64 图片，组装为 OpenAI 多模态格式
      if (isImageResult) {
        const base64 = resultText.slice('__IMAGE_BASE64__:'.length)
        const imageContent: ContentPart[] = [
          { type: 'text', text: 'Screenshot captured.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}`, detail: 'auto' } }
        ]
        workingMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: imageContent
        })
      } else {
        workingMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: resultText
        })
      }
    }

    // 继续下一轮，让 LLM 看到工具结果后决定下一步
  }

    log('warn', `Agent reached max rounds (${MAX_TOOL_ROUNDS}), stopping`)
    cb.onComplete?.()
  // 异步提取记忆（不阻塞返回）
  if (memoryEnabled && sessionId) {
    captureMemories(provider, workingMessages, sessionId).catch(() => {})
  }
  return allAssistantMessages
}

/** 从消息列表中获取最后一条 user 消息的 content */
function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) {
      return messages[i].content!
    }
  }
  return ''
}
