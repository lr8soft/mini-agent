// ============================================================
// Shared types — 主进程 & 渲染进程共用契约
// ============================================================

/** LLM 角色标记 */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** 单条对话消息（OpenAI 格式扩展） */
export interface ChatMessage {
  role: Role
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string          // role=tool 时关联的调用 ID
  name?: string                  // role=tool 时工具名
}

/** LLM 发起的工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }  // arguments 是 JSON 字符串
}

/** Provider 配置 */
export interface ProviderConfig {
  id: string
  name: string                     // 用户起的名字
  baseUrl: string                  // OpenAI 兼容端点，如 https://api.openai.com/v1
  apiKey: string
  defaultModel: string
  enabled: boolean
}

/** 单条渲染消息（UI 专用，含元数据） */
export interface UIMessage {
  id: string
  sessionId: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
  timestamp: number
  status?: 'pending' | 'streaming' | 'done' | 'error' | 'thinking'
}

/** 会话 */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

/** 工具描述（供 LLM function-calling） */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: object             // JSON Schema
  }
}

/** 工具执行结果 */
export interface ToolResult {
  id: string                       // 关联的 tool_call_id
  content: string
  isError: boolean
  durationMs: number
}

/** MCP Server 配置 */
export interface McpServerConfig {
  id: string
  name: string
  type: 'stdio' | 'sse'
  command?: string                 // stdio 模式
  args?: string[]
  env?: Record<string, string>
  url?: string                     // sse 模式
  headers?: Record<string, string>
  enabled: boolean
}

/** Skill 配置 */
export interface SkillConfig {
  id: string
  name: string
  path: string                     // SKILL.md 路径
  enabled: boolean
}

/** 设置 */
export interface AppSettings {
  providers: ProviderConfig[]
  mcpServers: McpServerConfig[]
  skills: SkillConfig[]
  activeProviderId: string | null
  workspacePath: string
}
