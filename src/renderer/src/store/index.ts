// ============================================================
// Zustand Store — 渲染进程全局状态
// ============================================================
import { create } from 'zustand'
import type { Session, UIMessage, AppSettings, ToolCall } from '@shared/types'

const api = window.api

// ---------- 主题 / 字号 ----------
export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'miniagent.theme'
export const FONT_SIZE_STORAGE_KEY = 'miniagent.fontSize'
/** 可选字号（px，作用于根字号，全局 rem 等比缩放） */
export const FONT_SIZE_OPTIONS = [13, 14, 15, 16, 18]
export const DEFAULT_FONT_SIZE = 15

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function getStoredFontSize(): number {
  try {
    const stored = parseInt(localStorage.getItem(FONT_SIZE_STORAGE_KEY) || '', 10)
    return FONT_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_FONT_SIZE
  } catch {
    return DEFAULT_FONT_SIZE
  }
}

interface PermissionRequest {
  permId: string
  toolName: string
  args: Record<string, unknown>
}

interface AppState {
  // 视图
  view: 'chat' | 'settings'
  setView: (v: 'chat' | 'settings') => void

  // 主题（light/dark/system，system 跟随系统）
  theme: Theme
  setTheme: (t: Theme) => void
  // 字号（px，根字号）
  fontSize: number
  setFontSize: (n: number) => void

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

  // 模型选择 — 格式为 "providerId::modelName"，null 则用 active provider 默认模型
  selectedProviderModel: string | null
  setSelectedProviderModel: (v: string | null) => void

  // 自动批准
  autoApprove: boolean
  setAutoApprove: (v: boolean) => void

  // 权限
  permissionRequest: PermissionRequest | null

  // 设置
  settings: AppSettings
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings, returnToChat?: boolean) => Promise<void>

  // Agent 操作
  sendMessage: (text: string) => Promise<void>
  abortAgent: () => void
  respondPermission: (allowed: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---- 视图 ----
  view: 'chat',
  setView: (v) => set({ view: v }),

  // ---- 主题 / 字号 ----
  theme: getStoredTheme(),
  setTheme: (t) => set({ theme: t }),
  fontSize: getStoredFontSize(),
  setFontSize: (n) => set({ fontSize: n }),

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

  // ---- 模型选择 ----
  selectedProviderModel: null,
  setSelectedProviderModel: (v) => set({ selectedProviderModel: v }),

  // ---- 自动批准 ----
  autoApprove: false,
  setAutoApprove: (v) => set({ autoApprove: v }),

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
      // 解析 selectedProviderModel — 格式 "providerId::modelName"
      const spm = get().selectedProviderModel
      let providerId: string | undefined
      let modelOverride: string | undefined
      if (spm) {
        const sepIdx = spm.indexOf('::')
        if (sepIdx > 0) {
          providerId = spm.slice(0, sepIdx)
          modelOverride = spm.slice(sepIdx + 2) || undefined
        }
      }

      const result = await api.agent.run(activeSessionId, text, {
        providerId,
        modelOverride,
        autoApprove: get().autoApprove
      })
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
  saveSettings: async (s, returnToChat = false) => {
    try {
      await api.settings.save(s)
      set({ settings: s })
      // 仅在用户显式点击"保存"按钮时回到聊天页；实时输入更新不应触发跳转
      if (returnToChat) set({ view: 'chat' })
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }
}))
