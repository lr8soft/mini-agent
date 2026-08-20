import { useTranslation } from 'react-i18next'
import { MessageSquare, Plus, Settings2, Trash2 } from 'lucide-react'
import { useAppStore } from '../store'

export default function Sidebar() {
  const { t } = useTranslation()
  const { sessions, activeSessionId, setActiveSession, createSession, deleteSession, setView, view } = useAppStore()

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
        {sessions.map((s) => (
          <button
            key={s.id}
            className={s.id === activeSessionId ? 'active' : ''}
            onClick={() => setActiveSession(s.id)}
          >
            <MessageSquare size={15} />
            <span>{s.title}</span>
            <span
              className="session-delete"
              title={t('sidebar.deleteSession')}
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
            >
              <Trash2 size={12} />
            </span>
          </button>
        ))}
      </nav>

      {/* 底部设置入口 */}
      <button
        className={view === 'settings' ? 'sidebar-settings active' : 'sidebar-settings'}
        onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
      >
        <Settings2 size={15} />
        {t('sidebar.settings')}
      </button>
    </aside>
  )
}
