import { useTranslation } from 'react-i18next'
import { ShieldAlert, Wrench } from 'lucide-react'
import { useAppStore } from '../store'

export default function PermissionDialog() {
  const { t } = useTranslation()
  const { permissionRequest, respondPermission } = useAppStore()

  if (!permissionRequest) return null

  const { permId, toolName, args } = permissionRequest

  const handleResponse = (allowed: boolean) => {
    respondPermission(allowed)
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div>
            <span className="dialog-title-icon"><ShieldAlert size={17} /></span>
            <div>
              <h2>{t('permission.title')}</h2>
              <p>{t('permission.description')}</p>
            </div>
          </div>
        </div>

        <div className="dialog-body">
          <div className="dialog-tool-name">
            <Wrench size={14} />
            {toolName}
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