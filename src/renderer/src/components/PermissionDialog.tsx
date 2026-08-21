import { useTranslation } from 'react-i18next'
import { ShieldAlert, Wrench } from 'lucide-react'
import { useAppStore, type PermissionRequest } from '../store'

/**
 * 权限确认弹窗
 * 多会话并行运行时可能有多个会话同时请求权限 → 按 FIFO（permId 生成顺序）
 * 逐个显示，确认一个再弹下一个（不阻塞其他会话的 Agent 执行，仅阻塞其当前工具调用）。
 */
export default function PermissionDialog() {
  const { t } = useTranslation()
  // 取最早的请求（genId 时间单调 → FIFO）；返回原始对象引用，选择器结果稳定
  const permissionRequest: PermissionRequest | undefined = useAppStore(s => {
    let first: PermissionRequest | undefined
    for (const req of Object.values(s.permissionRequests)) {
      if (!first || req.permId < first.permId) first = req
    }
    return first
  })
  const respondPermission = useAppStore(s => s.respondPermission)
  const sessions = useAppStore(s => s.sessions)
  const activeSessionId = useAppStore(s => s.activeSessionId)

  if (!permissionRequest) return null

  const { permId, sessionId, toolName, args, level } = permissionRequest
  const isDangerous = level === 'dangerous'
  // 弹窗所属会话与当前查看会话不同 → 显示会话名提示用户切回去看
  const isOtherSession = sessionId !== activeSessionId
  const sessionTitle = sessions.find(s => s.id === sessionId)?.title

  const handleResponse = (allowed: boolean) => {
    respondPermission(allowed)
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div>
            <span className={`dialog-title-icon${isDangerous ? ' dangerous' : ''}`}>
              <ShieldAlert size={17} />
            </span>
            <div>
              <h2>{isDangerous ? t('permission.titleDangerous') : t('permission.title')}</h2>
              <p>{isDangerous ? t('permission.descriptionDangerous') : t('permission.description')}</p>
              {isOtherSession && sessionTitle && (
                <p className="dialog-session-hint">{t('permission.fromSession', { title: sessionTitle })}</p>
              )}
            </div>
          </div>
        </div>

        <div className="dialog-body">
          <div className="dialog-tool-name">
            <Wrench size={14} />
            {toolName}
            {isDangerous && <span className="dialog-level-badge">{t('permission.levelDangerous')}</span>}
          </div>
          <pre className="dialog-args">{JSON.stringify(args, null, 2)}</pre>
        </div>

        <div className="dialog-footer">
          <button className="btn-danger" onClick={() => handleResponse(false)}>
            {t('permission.deny')}
          </button>
          <button className="btn-primary" onClick={() => handleResponse(true)}>
            {t('permission.allow')}
          </button>
        </div>
      </div>
    </div>
  )
}
