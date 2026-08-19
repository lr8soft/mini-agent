// ============================================================
// Agent 调度器 — ReAct 工具调用循环
// 核心流程: 用户输入 → LLM → (tool_calls? → 执行工具 → 回传结果 → LLM)* → 最终回答
// ============================================================
import type { ChatMessage, ProviderConfig, ToolCall } from '../../shared/types'
import { streamChat, log } from '../llm/provider'
import { getTool, getAllTools, type ToolContext } from '../tools/registry'

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
  onToolResult?: (toolCallId: string, result: string, isError: boolean, durationMs: number) => void
  /** 一轮 LLM 调用完成（可能继续循环或结束） */
  onAssistantMessage?: (content: string, toolCalls: ToolCall[]) => void
  /** 整个对话完成 */
  onComplete?: () => void
  /** 出错 */
  onError?: (error: Error) => void
}

export interface AgentRunOptions {
  messages: ChatMessage[]
  provider: ProviderConfig
  workspacePath: string
  /** 权限回调：返回 true 允许执行 */
  permissionCheck?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
  signal?: AbortSignal
  systemPromptExtra?: string
  /** 覆盖模型名（如果用户在聊天页选了别的模型） */
  modelOverride?: string
  /** 自动批准所有工具调用，跳过权限弹窗 */
  autoApprove?: boolean
}

/**
 * 运行一次完整的 Agent 对话
 */
export async function runAgent(
  opts: AgentRunOptions,
  cb: AgentEventCallbacks
): Promise<ChatMessage[]> {
  const { provider, workspacePath, messages, signal, permissionCheck, modelOverride, autoApprove } = opts

  // 构建系统提示词
  const skillsPrompt = skillsPromptGetter ? skillsPromptGetter() : ''
  const systemPrompt = buildSystemPrompt(workspacePath, skillsPrompt, opts.systemPromptExtra)

  // 工作消息列表（含 system）
  const workingMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  let round = 0
  const allAssistantMessages: ChatMessage[] = []

  while (round < MAX_TOOL_ROUNDS) {
    round++
    log('info', `Agent round ${round} — sending ${workingMessages.length} messages to LLM`)

    const tools = getAllTools()
    const { content, toolCalls } = await streamChat(provider, {
      messages: workingMessages,
      tools: tools.length > 0 ? tools : undefined,
      model: modelOverride,
      temperature: provider.temperature,
      reasoningEffort: provider.reasoningEnabled ? provider.reasoningEffort : undefined,
      signal
    }, {
      onToken: cb.onToken,
      onError: cb.onError
    })

    cb.onAssistantMessage?.(content, toolCalls)

    // 如果没有工具调用 → 对话结束
    if (!toolCalls || toolCalls.length === 0) {
      log('info', `Agent completed after ${round} round(s)`)
      cb.onComplete?.()
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
          // 权限检查（autoApprove 模式跳过）
          if (permissionCheck && !autoApprove) {
            const allowed = await permissionCheck(tc.function.name, parsedArgs)
            if (!allowed) {
              resultText = 'Permission denied by user'
              isError = true
              cb.onToolResult?.(tc.id, resultText, true, 0)
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
          const ctx: ToolContext = { workspacePath }
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

      cb.onToolResult?.(tc.id, resultText, isError, durationMs)

      // 追加 tool 消息
      workingMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: resultText
      })
    }

    // 继续下一轮，让 LLM 看到工具结果后决定下一步
  }

  log('warn', `Agent reached max rounds (${MAX_TOOL_ROUNDS}), stopping`)
  cb.onComplete?.()
  return allAssistantMessages
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(workspacePath: string, skillsPrompt: string, extra?: string): string {
  let prompt = `You are MiniAgent, a powerful AI coding assistant operating in an Electron desktop environment.

## Environment
- You are connected to a local workspace at: ${workspacePath}
- You have access to tools for reading/writing files, running shell commands, and searching code.
- You also have access to MCP tools and Skills for extended capabilities.

## Guidelines
- When the user asks you to work with files, use the appropriate tools to read and modify them.
- Before editing a file, read it first to understand its current content.
- Be precise in your edits — use the edit tool with enough context to uniquely identify the location.
- When running shell commands, be aware of the workspace directory context.
- If a task requires multiple steps, plan your approach first, then execute step by step.
- Always explain what you're doing and why, especially before running potentially impactful operations.
- If you're unsure about something, ask the user for clarification.`

  if (skillsPrompt) {
    prompt += skillsPrompt
  }

  if (extra) {
    prompt += `\n\n${extra}`
  }

  return prompt
}
