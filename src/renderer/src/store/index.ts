// ============================================================
// Zustand Store — 渲染进程全局状态
// ============================================================
import { create } from 'zustand'
import type { Session, UIMessage, AppSettings, ToolCall } from '@shared/types'

const api = window.api

interface PermissionRequest {
  permId: string
  toolName: string
  args: Record<string, unknown>
}

interface AppState {
  // 视图
  view: 'chat' | 'settings'
  setView: (v: 'chat' | 'settings') => void

  // 会话
  sessions: Session[]
  activeSessionId: string | null
  setActiveSession: (id: string) => void
  loadSessions: () => Promise<void>
  createSession: () => Promise<void>
  deleteSession: (id: string) => Promise<void>

  // 消息
  messages: UIMessage[]
  loadMessages: (sessionId: string) => Promise<void>

  // Agent 状态
  isRunning: boolean
  streamingMessageId: string | null

  // 权限
  permissionRequest: PermissionRequest | null

  // 设置
  settings: AppSettings
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>

  // Agent 操作
  sendMessage: (text: string) => Promise<void>
  abortAgent: () => void
  respondPermission: (allowed: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---- 视图 ----
  view: 'chat',
  setView: (v) => set({ view: v }),

  // ---- 会话 ----
  sessions: [],
  activeSessionId: null,
  setActiveSession: (id) => {
    set({ activeSessionId: id })
    get().loadMessages(id)
  },
  loadSessions: async () => {
    const sessions = await api.session.list()
    set({ sessions })
  },
  createSession: async () => {
    const session = await api.session.create()
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
      messages: []
    }))
  },
  deleteSession: async (id) => {
    await api.session.delete(id)
    const { sessions, activeSessionId } = get()
    const newSessions = sessions.filter(s => s.id !== id)
    const newActiveId = activeSessionId === id
      ? (newSessions[0]?.id || null)
      : activeSessionId
    set({ sessions: newSessions, activeSessionId: newActiveId })
    if (newActiveId) get().loadMessages(newActiveId)
    else set({ messages: [] })
  },

  // ---- 消息 ----
  messages: [],
  loadMessages: async (sessionId) => {
    const messages = await api.session.messages(sessionId)
    set({ messages })
  },

  // ---- Agent ----
  isRunning: false,
  streamingMessageId: null,

  sendMessage: async (text: string) => {
    let { activeSessionId } = get()
    if (!activeSessionId) {
      await get().createSession()
      activeSessionId = get().activeSessionId!
    }

    // 添加用户消息到 UI
    const userMsg: UIMessage = {
      id: `local-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'done'
    }
    set((s) => ({
      messages: [...s.messages, userMsg],
      isRunning: true,
      streamingMessageId: null
    }))

    try {
      const result = await api.agent.run(activeSessionId, text)
      if (result.error) {
        set((s) => ({
          messages: [...s.messages, {
            id: `err-${Date.now()}`,
            sessionId: activeSessionId!,
            role: 'assistant',
            content: `Error: ${result.error}`,
            timestamp: Date.now(),
            status: 'error'
          }],
          isRunning: false
        }))
      }
    } catch (err) {
      set((s) => ({
        messages: [...s.messages, {
          id: `err-${Date.now()}`,
          sessionId: activeSessionId!,
          role: 'assistant',
          content: `Error: ${(err as Error).message}`,
          timestamp: Date.now(),
          status: 'error'
        }],
        isRunning: false
      }))
    }
  },

  abortAgent: () => {
    const { activeSessionId } = get()
    if (activeSessionId) {
      api.agent.abort(activeSessionId)
      set({ isRunning: false, streamingMessageId: null })
    }
  },

  respondPermission: (allowed: boolean) => {
    const { permissionRequest } = get()
    if (permissionRequest) {
      api.agent.respondPermission(permissionRequest.permId, allowed)
      set({ permissionRequest: null })
    }
  },

  // ---- 权限 ----
  permissionRequest: null,

  // ---- 设置 ----
  settings: {
    providers: [],
    mcpServers: [],
    skills: [],
    activeProviderId: null,
    workspacePath: ''
  },
  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
  },
  saveSettings: async (s) => {
    try {
      await api.settings.save(s)
      set({ settings: s })
      // 保存成功后自动回到聊天页
      set({ view: 'chat' })
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }
}))
