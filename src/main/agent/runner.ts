// ============================================================
// Agent 调度器 — ReAct 工具调用循环
// 核心流程: 用户输入 → LLM → (tool_calls? → 执行工具 → 回传结果 → LLM)* → 最终回答
// ============================================================
import type { ChatMessage, ContentPart, ProviderConfig, ToolCall } from '../../shared/types'
import { streamChat, log, type TokenUsage } from '../llm/provider'
import { getTool, getAllTools, getToolPermission, getToolsBySource, type ToolContext } from '../tools/registry'
import { buildMemoryPrompt, captureMemories } from '../memory/manager'
import { needsCompact, autoCompact, fetchContextWindow } from '../agent/context'
import { getMcpConnectionStatus } from '../mcp/client'

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
}

/**
 * 运行一次完整的 Agent 对话
 */
export async function runAgent(
  opts: AgentRunOptions,
  cb: AgentEventCallbacks
): Promise<ChatMessage[]> {
  const { provider, workspacePath, messages, signal, permissionCheck, modelOverride, sessionId, memoryEnabled } = opts

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
          const ctx: ToolContext = { workspacePath, sessionId }
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

/**
 * 构建系统提示词
 */
function buildSystemPrompt(workspacePath: string, skillsPrompt: string, memoryPrompt: string, extra?: string): string {
  // 动态获取 MCP 工具列表 + 未连接的 MCP 服务器，注入到 system prompt 中
  const mcpStatus = getMcpConnectionStatus()
  let mcpSection = ''

  const connectedServers = mcpStatus.filter(s => s.connected)
  const disconnectedServers = mcpStatus.filter(s => !s.connected)

  if (connectedServers.length > 0 || disconnectedServers.length > 0) {
    const lines: string[] = ['\n\n## MCP Tools (External integrations)']

    if (connectedServers.length > 0) {
      const mcpTools = getToolsBySource((s) => s.startsWith('mcp:'))
      if (mcpTools.length > 0) {
        lines.push('The following MCP tools are connected and available. Use them when the task matches their capabilities:')
        for (const t of mcpTools) {
          const fn = t.function
          const desc = fn.description || '(no description)'
          const params = fn.parameters as Record<string, unknown>
          const props = params?.properties as Record<string, { type?: string; description?: string }> | undefined
          const paramNames = props ? Object.entries(props).map(([k, v]) => `${k}(${v.type || 'any'})`).join(', ') : '(none)'
          lines.push(`- **${fn.name}**: ${desc} (params: ${paramNames})`)
        }
      }
    }

    if (disconnectedServers.length > 0) {
      const names = disconnectedServers.map(s => s.name).join(', ')
      lines.push(`\nNote: The following MCP servers are not currently connected (still connecting or failed): ${names}. Their tools are temporarily unavailable.`)
    }

    lines.push('\nWhen a user\'s request could benefit from an MCP tool, prefer using it over built-in tools.')

    mcpSection = lines.join('\n')
  }

  let prompt = `You are MiniAgent, a powerful AI coding assistant operating in an Electron desktop environment.

## Environment
- You are connected to a local workspace at: ${workspacePath}
- You also have access to MCP tools and Skills for extended capabilities.${mcpSection}
- You have a headless Chromium browser (via Playwright) with tools: browser_navigate, browser_click, browser_type, browser_screenshot, browser_get_text, browser_get_html, browser_wait, browser_close.

## Core File Tools
You have these built-in tools for working with files and code:

**Reading & Exploring:**
- read: Read file contents. Supports offset/limit for large files. Always read before editing.
- ls: List directory contents. Use this first when you need to understand project structure.
- glob: Find files by pattern. Supports standard glob: **/*.ts, **/*Scene*.h, src/**/*.cpp, etc. Pattern is matched against paths relative to workspace. Use exclude to skip directories (e.g. exclude=["node_modules", ".git"]).
- grep: Search file contents with regex. Use include param to filter by filename (e.g. include="*.cpp"). Use exclude to skip directories.

**Writing & Editing:**
- write: Create or overwrite a file entirely.
- edit: Find-and-replace in a file. You MUST provide the exact oldString from the file content — never guess or fabricate content. If unsure, read the file first.
- bash: Run shell commands (default timeout 120s).

## Editing Rules (IMPORTANT)
1. **ALWAYS read a file before editing it.** Never use edit with a guessed oldString — if the oldString doesn't match, the edit will fail.
2. When editing, copy the exact text from the read output as oldString. Include enough surrounding context to make the match unique.
3. For large changes across many files, prefer bash with sed/awk or write the entire file.
4. If edit fails with "oldString not found", re-read the file to get the current content, then retry with the exact text.

## Search Strategy
1. When exploring an unfamiliar project: ls first, then glob for specific files, then read relevant files.
2. When searching for code: use grep with include to narrow scope (e.g. include="*.{h,cpp}" for C++). Use exclude to skip irrelevant directories (e.g. exclude=["node_modules", ".git", "Binaries"]).
3. When looking for a specific file: use glob with the filename pattern (e.g. **/*AuthManager*). Similarly use exclude to avoid searching build artifacts.
4. All glob/grep paths default to the workspace directory. You can specify a subdirectory as path to narrow the search.

## Desktop Control
You can control the user's physical desktop (mouse, keyboard, screen) with these tools:
- desktop_screen_size: Get screen resolution before doing coordinate-based operations.
- desktop_get_mouse_pos: Check where the mouse cursor currently is.
- desktop_mouse_move: Move cursor to (x, y). Set smooth=true for visible movement.
- desktop_mouse_click: Click left/right/middle, optionally at specific coordinates. Supports double-click.
- desktop_mouse_drag: Drag from current position to (x, y) with a button held.
- desktop_mouse_scroll: Scroll the mouse wheel (positive Y=down, negative Y=up).
- desktop_key_tap: Press a key or key combination (e.g. key="c", modifier="control" for Ctrl+C).
- desktop_type_text: Type a string at the cursor. Set cpm for natural typing speed.
- desktop_screenshot: Capture the screen and return an image for visual analysis. The screenshot will be sent to you as an image — you can see and analyze it directly.
- desktop_get_pixel_color: Read the hex color of a specific pixel.

When to use desktop tools:
- When the user asks you to operate a desktop application, click UI elements, or automate GUI tasks.
- Always call desktop_screen_size first to learn the resolution, then use desktop_screenshot to see what's on screen.
- After any mouse/keyboard action, call desktop_screenshot to verify the result visually.
- Mouse coordinates are in pixels with (0,0) at top-left corner.

## Long-term Memory
You have access to a persistent memory system. You can proactively use these tools:
- memory_search: Search stored memories about the user's preferences, habits, facts, skills, and project context.
- memory_save: Save a new memory when you detect something worth remembering about the user.
- memory_list: List all stored memories or filter by category.
- memory_delete: Delete an outdated or incorrect memory (confirm with user first).

When to use memory tools:
- At the START of a conversation, proactively call memory_search with keywords from the user's message to check if you have relevant context.
- When the user mentions a preference, habit, or important context, call memory_save to store it.
- When the user asks "do you remember..." or refers to past conversations, use memory_search to find relevant memories.
- Do NOT save trivial information (e.g. "user said hello"). Only save durable, useful facts.

## Guidelines
- If a task requires multiple steps, plan your approach first, then execute step by step.
- Always explain what you're doing and why, especially before running potentially impactful operations.
- If you're unsure about something, ask the user for clarification.
- IMPORTANT: At the start of every new conversation, you MUST call the set_title tool with a short title (max 6 words) that summarizes the user's request. Do this before doing anything else.`

  if (skillsPrompt) {
    prompt += skillsPrompt
  }

  if (memoryPrompt) {
    prompt += memoryPrompt
  }

  if (extra) {
    prompt += `\n\n${extra}`
  }

  return prompt
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
