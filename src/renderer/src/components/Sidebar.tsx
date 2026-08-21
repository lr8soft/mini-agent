import { useTranslation } from 'react-i18next'
import { MessageSquare, Plus, Settings2, Trash2 } from 'lucide-react'
import { useAppStore } from '../store'

export default function Sidebar() {
  const { t } = useTranslation()
  const sessions = useAppStore(s => s.sessions)
  const activeSessionId = useAppStore(s => s.activeSessionId)
  // 运行中的会话集合（多个会话可并行运行，各自独立转圈）
  const runningIds = useAppStore(s => s.runningIds)
  const view = useAppStore(s => s.view)
  // actions 引用稳定，从 getState 取（避免整 store 订阅导致流式期间高频重渲染）
  const { setActiveSession, createSession, deleteSession, setView } = useAppStore.getState()

  return (
    <aside className="sidebar">
      {/* 品牌 */}
      <div className="brand">
        <img className="brand-mark" src="./logo.png" alt="" />
        <strong>{t('app.name')}</strong>
      </div>

      {/* 新建会话 */}
      <button className="new-session-button" onClick={createSession} title={t('sidebar.newSession')}>
        <Plus size={15} />
        {t('sidebar.newSession')}
      </button>

      {/* 会话列表 */}
      <nav className="session-nav" aria-label={t('app.name')}>
        {sessions.length === 0 && (
          <p className="sidebar-empty">{t('sidebar.noSessions')}</p>
        )}
        {sessions.map((s) => {
          const running = runningIds.has(s.id)
          return (
            <button
              key={s.id}
              className={s.id === activeSessionId ? 'active' : ''}
              title={running ? t('sidebar.running') : undefined}
              onClick={() => setActiveSession(s.id)}
            >
              {running
                ? <span className="session-spinner" />
                : <MessageSquare size={15} />}
              <span className="session-title">{s.title}</span>
              <span
                className="session-delete"
                title={t('sidebar.deleteSession')}
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
              >
                <Trash2 size={12} />
              </span>
            </button>
          )
        })}
      </nav>

      {/* 底部设置入口（有未保存改动时离开需确认） */}
      <button
        className={view === 'settings' ? 'sidebar-settings active' : 'sidebar-settings'}
        onClick={() => {
          if (view === 'settings') {
            const st = useAppStore.getState()
            if (st.isSettingsDirty && !confirm(t('settings.confirmLeave'))) return
            // 离开设置页 → 丢弃草稿并恢复即时预览的外观/语言（与"取消"按钮同语义）
            st.cancelSettings()
          }
          setView(view === 'settings' ? 'chat' : 'settings')
        }}
      >
        <Settings2 size={15} />
        {t('sidebar.settings')}
      </button>
    </aside>
  )
}
