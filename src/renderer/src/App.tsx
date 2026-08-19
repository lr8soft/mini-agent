import { useEffect } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsView from './components/SettingsView'
import PermissionDialog from './components/PermissionDialog'

export default function App() {
  const { view, loadSessions, loadSettings, setActiveSession } = useAppStore()

  // 初始化
  useEffect(() => {
    loadSessions().then(() => {
      const { sessions } = useAppStore.getState()
      if (sessions.length > 0) {
        setActiveSession(sessions[0].id)
      }
    })
    loadSettings()
  }, [])

  // 注册 IPC 事件
  useEffect(() => {
    const unsubs = [
      // 流式 token → 更新消息
      window.api.agent.onToken(({ sessionId, messageId, token }) => {
        useAppStore.setState((s) => {
          if (s.activeSessionId !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: last.content + token }
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
      window.api.agent.onToolResult(({ toolCallId, result, isError }) => {
        useAppStore.setState((s) => {
          const msgs = [...s.messages]
          msgs.push({
            id: `tr-${Date.now()}`,
            sessionId: s.activeSessionId || '',
            role: 'tool',
            content: result,
            toolCallId,
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
          useAppStore.setState({ isRunning: false, streamingMessageId: null })
          // 重新加载消息获取完整数据库记录
          useAppStore.getState().loadMessages(sessionId)
        }
        useAppStore.getState().loadSessions()
      }),

      // 错误
      window.api.agent.onError(({ sessionId, error }) => {
        const { activeSessionId } = useAppStore.getState()
        if (activeSessionId === sessionId) {
          useAppStore.setState({ isRunning: false, streamingMessageId: null })
        }
      }),

      // 权限请求
      window.api.agent.onPermissionRequest(({ permId, toolName, args }) => {
        useAppStore.setState({ permissionRequest: { permId, toolName, args } })
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
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-w-0">
        {view === 'chat' ? <ChatView /> : <SettingsView />}
      </main>

      {/* 权限确认弹窗 */}
      <PermissionDialog />
    </div>
  )
}
