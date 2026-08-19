import { useAppStore } from '../store'

export default function Sidebar() {
  const { sessions, activeSessionId, setActiveSession, createSession, deleteSession, setView, view } = useAppStore()

  return (
    <aside className="w-64 flex-shrink-0 bg-bg-panel border-r border-border flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-sm font-bold tracking-wide text-text-primary">
          MiniAgent
        </h1>
        <button
          onClick={createSession}
          className="text-text-muted hover:text-accent-glow transition-colors text-lg"
          title="New session"
        >
          +
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <p className="text-xs text-text-muted text-center py-8">No sessions yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
              s.id === activeSessionId
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-secondary hover:bg-bg-hover/50 hover:text-text-primary'
            }`}
            onClick={() => setActiveSession(s.id)}
          >
            <span className="text-xs opacity-50">⌘</span>
            <span className="text-sm truncate flex-1">{s.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-err transition-opacity text-xs"
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
              title="Delete session"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 底部 */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className={`w-full btn-ghost text-xs text-left px-3 py-2 ${
            view === 'settings' ? 'bg-bg-hover text-accent-glow' : ''
          }`}
        >
          ⚙ Settings
        </button>
      </div>
    </aside>
  )
}
