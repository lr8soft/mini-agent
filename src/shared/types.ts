// ============================================================
// Shared types — 主进程 & 渲染进程共用契约
// ============================================================

/** LLM 角色标记 */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** OpenAI 多模态 content part */
export interface ContentPartText {
  type: 'text'
  text: string
}
export interface ContentPartImageUrl {
  type: 'image_url'
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' }
}
export type ContentPart = ContentPartText | ContentPartImageUrl

/** 单条对话消息（OpenAI 格式扩展） */
export interface ChatMessage {
  role: Role
  content: string | null | ContentPart[]
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
  temperature?: number             // 采样温度，不设则由 API 默认
  reasoningEnabled?: boolean       // 是否启用思考强度
  reasoningEffort?: 'low' | 'medium' | 'high'  // 思考强度（reasoning_effort）
  contextWindow?: number           // 模型上下文窗口大小（token 数），0 或未设 = 自动检测
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
  workspacePath?: string
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
  type: 'stdio' | 'sse' | 'streamable-http'
  command?: string                 // stdio 模式
  args?: string[]
  env?: Record<string, string>
  url?: string                     // sse 模式
  headers?: Record<string, string> // sse 模式自定义 headers
  /** SSE 认证类型快捷配置 */
  authType?: 'none' | 'bearer' | 'apikey' | 'custom'
  /** Bearer Token（authType=bearer 时使用） */
  authToken?: string
  /** API Key（authType=apikey 时使用，发送到 authHeader 指定的 header） */
  apiKey?: string
  /** API Key 使用的 header 名称（authType=apikey 时使用，默认 X-API-Key） */
  authHeader?: string
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
  /** 长期记忆功能开关 */
  memoryEnabled?: boolean
  /** 界面语言 ('auto' 时跟随系统) */
  language?: string
  /** LLM/MCP 网络请求失败的最大重试次数（-1 = 无限重试，0 = 不重试，默认 5） */
  maxRetries?: number
}

// ============================================================
// 长期记忆 — longterm-skill
// ============================================================

/** 记忆类别 */
export type MemoryCategory = 'preference' | 'habit' | 'fact' | 'skill' | 'context'

/** 记忆条目 */
export interface MemoryEntry {
  id: string
  category: MemoryCategory
  content: string
  importance: number               // 1-5，5 最重要
  sourceSessionId: string | null   // 来源会话
  createdAt: number
  lastAccessed: number
  accessCount: number
  tags: string[]                    // 关键词标签，用于检索
}
