import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { useAppStore } from '../store'

/**
 * 会话删除确认弹窗（防误操作）
 * 侧边栏点删除 → 弹出此框 → 确认才真正删除。
 * Esc / 点遮罩 = 取消。z-index 高于权限弹窗（删除是用户主动操作，应置于最前）。
 */
export default function ConfirmDeleteDialog() {
  const { t } = useTranslation()
  const pendingDeleteId = useAppStore(s => s.pendingDeleteId)
  const sessions = useAppStore(s => s.sessions)
  const cancelDeleteSession = useAppStore(s => s.cancelDeleteSession)
  const confirmDeleteSession = useAppStore(s => s.confirmDeleteSession)

  // Esc 关闭（弹窗打开时生效）
  useEffect(() => {
    if (!pendingDeleteId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDeleteSession()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingDeleteId, cancelDeleteSession])

  if (!pendingDeleteId) return null

  const target = sessions.find(s => s.id === pendingDeleteId)

  return (
    <div
      className="dialog-overlay"
      style={{ zIndex: 400 }}
      onMouseDown={(e) => {
        // 点遮罩（非弹窗本体）= 取消
        if (e.target === e.currentTarget) cancelDeleteSession()
      }}
    >
      <div className="dialog" style={{ width: 'min(400px, calc(100vw - 48px))' }} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <span className="dialog-title-icon" style={{ color: 'var(--app-color-primary-strong)', background: 'color-mix(in srgb, var(--app-color-primary-strong) 12%, transparent)' }}>
            <Trash2 size={16} />
          </span>
          <div>
            <h2>{t('sidebar.deleteSessionTitle')}</h2>
            {target && <p className="dialog-session-title">{target.title}</p>}
          </div>
        </div>
        <div className="dialog-body">
          <p className="dialog-confirm-text">{t('sidebar.deleteSessionConfirm')}</p>
        </div>
        <div className="dialog-footer dialog-footer-center">
          <button className="btn-ghost" onClick={cancelDeleteSession}>
            {t('settings.cancel')}
          </button>
          <button className="btn-danger" onClick={() => void confirmDeleteSession()}>
            {t('sidebar.deleteSession')}
          </button>
        </div>
      </div>
    </div>
  )
}
