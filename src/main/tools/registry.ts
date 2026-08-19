// ============================================================
// 工具定义公共接口
// ============================================================
import type { ToolDefinition } from '../../shared/types'

export interface ToolContext {
  workspacePath: string
  onProgress?: (msg: string) => void
  /** 请求权限（如果用户配置了需要确认），返回是否允许 */
  requestPermission?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
}

export interface ToolHandler {
  definition: ToolDefinition
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
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

export function clearTools(source?: string) {
  if (source) {
    unregisterToolsBySource(source)
  } else {
    registry.clear()
  }
}
