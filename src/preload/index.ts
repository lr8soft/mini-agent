// ============================================================
// Preload — 安全暴露 IPC 到渲染进程
// 通过 contextBridge 暴露最小化 API surface
// ============================================================
import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, Session, UIMessage } from '../shared/types'

const api = {
  // ============================================================
  // Session 管理
  // ============================================================
  session: {
    create: (title?: string): Promise<Session> =>
      ipcRenderer.invoke('session:create', title),
    list: (): Promise<Session[]> =>
      ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<Session | null> =>
      ipcRenderer.invoke('session:get', id),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('session:delete', id),
    rename: (id: string, title: string): Promise<boolean> =>
      ipcRenderer.invoke('session:rename', id, title),
    messages: (id: string): Promise<UIMessage[]> =>
      ipcRenderer.invoke('session:messages', id),
    updateWorkspace: (id: string, workspacePath: string): Promise<boolean> =>
      ipcRenderer.invoke('session:updateWorkspace', id, workspacePath)
  },

  // ============================================================
  // 窗口控制（无边框自定义标题栏）
  // ============================================================
  window: {
    minimize: (): Promise<void> =>
      ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> =>
      ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> =>
      ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      const handler = (_e: any, maximized: boolean) => cb(maximized)
      ipcRenderer.on('window:maximized-change', handler)
      return () => { ipcRenderer.removeListener('window:maximized-change', handler) }
    }
  },

  // ============================================================
  // Agent 对话
  // ============================================================
  agent: {
    /** 发送消息并启动 agent 运行 */
    run: (sessionId: string, message: string, options?: { providerId?: string; modelOverride?: string; autoApprove?: boolean }): Promise<{ ok?: boolean; error?: string; assistantMessageId?: string }> =>
      ipcRenderer.invoke('agent:run', sessionId, message, options),
    /** 中止当前运行 */
    abort: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('agent:abort', sessionId),
    /** 回复权限请求 */
    respondPermission: (permId: string, allowed: boolean): Promise<boolean> =>
      ipcRenderer.invoke('agent:permission_response', permId, allowed),

    // 事件监听
    onToken: (cb: (data: { sessionId: string; messageId: string; token: string }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:token', handler)
      return () => ipcRenderer.removeListener('agent:token', handler)
    },
    onToolCall: (cb: (data: { sessionId: string; toolCall: any }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:tool_call', handler)
      return () => ipcRenderer.removeListener('agent:tool_call', handler)
    },
    onToolResult: (cb: (data: { sessionId: string; toolCallId: string; toolName: string; result: string; isError: boolean; durationMs: number }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:tool_result', handler)
      return () => ipcRenderer.removeListener('agent:tool_result', handler)
    },
    onComplete: (cb: (data: { sessionId: string; messageId: string; content: string }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:complete', handler)
      return () => ipcRenderer.removeListener('agent:complete', handler)
    },
    onError: (cb: (data: { sessionId: string; error: string }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:error', handler)
      return () => ipcRenderer.removeListener('agent:error', handler)
    },
    onRetry: (cb: (data: { sessionId: string; failedAttempt: number; maxRetries: number }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:retry', handler)
      return () => ipcRenderer.removeListener('agent:retry', handler)
    },
    onPermissionRequest: (cb: (data: { sessionId: string; permId: string; toolName: string; args: any }) => void) => {
      const handler = (_e: any, data: any) => cb(data)
      ipcRenderer.on('agent:permission_request', handler)
      return () => ipcRenderer.removeListener('agent:permission_request', handler)
    }
  },

  // ============================================================
  // Settings
  // ============================================================
  settings: {
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings): Promise<boolean> =>
      ipcRenderer.invoke('settings:save', settings),
    pickDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('settings:pickDirectory'),
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke('settings:pickFile'),
    openExternal: (url: string): Promise<boolean> =>
      ipcRenderer.invoke('shell:openExternal', url)
  },

  // ============================================================
  // MCP
  // ============================================================
  mcp: {
    connect: (config: any): Promise<{ ok?: boolean; error?: string }> =>
      ipcRenderer.invoke('mcp:connect', config),
    disconnect: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('mcp:disconnect', id)
  },

  // ============================================================
  // Memory — longterm-skill
  // ============================================================
  memory: {
    list: (options?: { category?: string; search?: string; limit?: number }): Promise<any[]> =>
      ipcRenderer.invoke('memory:list', options),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('memory:delete', id),
    clearAll: (): Promise<boolean> =>
      ipcRenderer.invoke('memory:clearAll'),
    updateImportance: (id: string, importance: number): Promise<boolean> =>
      ipcRenderer.invoke('memory:updateImportance', id, importance)
  },

  // ============================================================
  // Token Usage
  // ============================================================
  token: {
    summary: (): Promise<any[]> =>
      ipcRenderer.invoke('token:summary'),
    daily: (days?: number): Promise<any[]> =>
      ipcRenderer.invoke('token:daily', days)
  },

  // ============================================================
  // 通用事件
  // ============================================================
  onLog: (cb: (data: { level: string; msg: string; ts: string }) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('agent:log', handler)
    return () => ipcRenderer.removeListener('agent:log', handler)
  },
  onSessionTitleUpdated: (cb: (data: { sessionId: string; title: string }) => void) => {
    const handler = (_e: any, data: any) => cb(data)
    ipcRenderer.on('session:title_updated', handler)
    return () => ipcRenderer.removeListener('session:title_updated', handler)
  }
}

export type MiniAgentAPI = typeof api

// 使用 contextBridge 安全暴露
contextBridge.exposeInMainWorld('api', api)
