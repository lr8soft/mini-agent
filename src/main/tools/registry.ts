// ============================================================
// 工具定义公共接口
// ============================================================
import type { ToolDefinition } from '../../shared/types'

/**
 * 工具权限等级
 * - safe:      永远自动放行（只读、无副作用操作）
 * - normal:    默认需确认，autoApprove 开启时自动放行
 * - dangerous: 始终需要用户确认，autoApprove 也无法跳过
 */
export type PermissionLevel = 'safe' | 'normal' | 'dangerous'

export interface ToolContext {
  workspacePath: string
  sessionId?: string
  onProgress?: (msg: string) => void
  /** 请求权限（如果用户配置了需要确认），返回是否允许 */
  requestPermission?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
  /** 会话标题更新回调（由 IPC 层注入，转发到渲染进程） */
  onSessionTitleUpdate?: (sessionId: string, title: string) => void
}

export interface ToolHandler {
  definition: ToolDefinition
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  /** 权限等级，默认 normal */
  permission?: PermissionLevel
}

/**
 * 统一工具注册表
 * 所有工具（内置 + MCP）都注册到这里供 Agent 调度
 */
const registry = new Map<string, { handler: ToolHandler; source: 'builtin' | string }>()

export function registerTool(name: string, handler: ToolHandler, source: string = 'builtin') {
  registry.set(name, { handler, source })
}

export function unregisterToolsBySource(source: string) {
  for (const [name, entry] of registry) {
    if (entry.source === source) registry.delete(name)
  }
}

export function getTool(name: string): { handler: ToolHandler; source: string } | undefined {
  return registry.get(name)
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values()).map(e => e.handler.definition)
}

/**
 * 按 source 过滤获取工具定义
 * 接受字符串精确匹配或谓词函数
 */
export function getToolsBySource(filter: string | ((source: string) => boolean)): ToolDefinition[] {
  const predicate = typeof filter === 'string' ? (s: string) => s === filter : filter
  return Array.from(registry.entries())
    .filter(([, entry]) => predicate(entry.source))
    .map(([, entry]) => entry.handler.definition)
}

export function clearTools(source?: string) {
  if (source) {
    unregisterToolsBySource(source)
  } else {
    registry.clear()
  }
}

/**
 * 获取工具的权限等级
 */
export function getToolPermission(name: string): PermissionLevel {
  const entry = registry.get(name)
  return entry?.handler.permission || 'normal'
}
