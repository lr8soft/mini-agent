import { useEffect } from 'react'
import { useAppStore, THEME_STORAGE_KEY, FONT_SIZE_STORAGE_KEY } from './store'
import i18n, { getEffectiveLanguage, storeLanguage, type AppLanguage } from './i18n'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsView from './components/SettingsView'
import PermissionDialog from './components/PermissionDialog'

export default function App() {
  const { view, loadSessions, loadSettings, setActiveSession, theme, fontSize } = useAppStore()

  // 初始化
  useEffect(() => {
    loadSessions().then(() => {
      const { sessions } = useAppStore.getState()
      if (sessions.length > 0) {
        setActiveSession(sessions[0].id)
      }
    })
    // 加载设置后同步语言（DB 为权威来源）
    loadSettings().then(() => {
      const { settings } = useAppStore.getState()
      if (settings.language) {
        const lang = settings.language as AppLanguage
        const effective = getEffectiveLanguage(lang)
        storeLanguage(lang)
        i18n.changeLanguage(effective)
      }
    })
  }, [])

  // 主题：light / dark / system（system 实时跟随系统深浅色）
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* ignore */ }
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  // 字号：设置根字号，全局 rem 等比缩放
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize)) } catch { /* ignore */ }
  }, [fontSize])

  // 注册 IPC 事件
  useEffect(() => {
    const unsubs = [
      // 流式 token → 更新消息
      window.api.agent.onToken(({ sessionId, messageId, token }) => {
        useAppStore.setState((s) => {
          if (s.activeSessionId !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          // append 到最后一条 assistant 消息（但不是 tool_call 消息）
          if (last && last.role === 'assistant' && !last.toolCalls?.length) {
            // append 到最后一条 assistant 消息（思考占位 / 流式消息），占位收到首 token 即转为流式
            msgs[msgs.length - 1] = { ...last, content: last.content + token, status: 'streaming' }
          } else {
            msgs.push({
              id: messageId,
              sessionId,
              role: 'assistant',
              content: token,
              timestamp: Date.now(),
              status: 'streaming'
            })
          }
          return { messages: msgs, streamingMessageId: messageId }
        })
      }),

      // 工具调用
      window.api.agent.onToolCall(({ toolCall }) => {
        useAppStore.setState((s) => {
          const msgs = [...s.messages]
          // 首个响应是工具调用（无文本）→ 移除思考占位
          const thinkingIdx = msgs.findIndex(m => m.status === 'thinking')
          if (thinkingIdx >= 0) msgs.splice(thinkingIdx, 1)
          msgs.push({
            id: `tc-${Date.now()}`,
            sessionId: s.activeSessionId || '',
            role: 'assistant',
            content: '',
            toolCalls: [toolCall],
            timestamp: Date.now(),
            status: 'pending'
          })
          return { messages: msgs }
        })
      }),

      // 工具结果
      window.api.agent.onToolResult(({ toolCallId, toolName, result, isError }) => {
        useAppStore.setState((s) => {
          const msgs = [...s.messages]
          msgs.push({
            id: `tr-${Date.now()}`,
            sessionId: s.activeSessionId || '',
            role: 'tool',
            content: result,
            toolCallId,
            toolName,
            timestamp: Date.now(),
            status: isError ? 'error' : 'done'
          })
          return { messages: msgs }
        })
      }),

      // 对话完成
      window.api.agent.onComplete(({ sessionId }) => {
        const { activeSessionId } = useAppStore.getState()
        if (activeSessionId === sessionId) {
          useAppStore.setState({ isRunning: false, streamingMessageId: null, retryStatus: null })
          // 重新加载消息获取完整数据库记录
          useAppStore.getState().loadMessages(sessionId)
        }
        useAppStore.getState().loadSessions()
      }),

      // 错误
      window.api.agent.onError(({ sessionId, error }) => {
        const { activeSessionId } = useAppStore.getState()
        if (activeSessionId === sessionId) {
          useAppStore.setState((s) => ({
            isRunning: false,
            streamingMessageId: null,
            retryStatus: null,
            // 重试耗尽报错后，移除思考占位
            messages: s.messages.filter(m => m.status !== 'thinking')
          }))
        }
      }),

      // 网络重试状态
      window.api.agent.onRetry(({ sessionId, failedAttempt, maxRetries }) => {
        const { activeSessionId } = useAppStore.getState()
        if (activeSessionId === sessionId) {
          useAppStore.setState({ retryStatus: { failedAttempt, maxRetries } })
        }
      }),

      // 权限请求
      window.api.agent.onPermissionRequest(({ sessionId, permId, toolName, args, level }) => {
        useAppStore.setState({ permissionRequest: { permId, sessionId, toolName, args, level } })
      }),

      // 标题更新
      window.api.onLog(() => {}), // 静默消费日志

      window.api.onSessionTitleUpdated(({ sessionId, title }) => {
        useAppStore.setState((s) => ({
          sessions: s.sessions.map(s =>
            s.id === sessionId ? { ...s, title } : s
          )
        }))
      })
    ]

    return () => unsubs.forEach(fn => fn())
  }, [])

  return (
    <div className="app-frame">
      {/* 自定义窗口标题栏 */}
      <TitleBar />

      <div className="app-shell">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <main className="main-area">
          {view === 'chat' ? <ChatView /> : <SettingsView />}
        </main>
      </div>

      {/* 权限确认弹窗 */}
      <PermissionDialog />
    </div>
  )
}
