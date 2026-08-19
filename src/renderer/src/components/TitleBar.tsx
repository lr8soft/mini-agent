import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Copy, Minus, Square, X } from 'lucide-react'

/**
 * 自定义窗口标题栏（无边框窗口）
 * 左侧品牌标识 + 拖拽区 + 右侧最小化/最大化/关闭
 */
export default function TitleBar() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className="window-titlebar">
      <div className="window-identity">
        <span className="titlebar-icon"><Bot size={13} /></span>
        <span>{t('app.name')}</span>
      </div>
      <div className="window-drag-space" />
      <div className="window-controls">
        <button
          title={t('window.minimize')}
          aria-label={t('window.minimize')}
          onClick={() => void window.api.window.minimize()}
        >
          <Minus size={16} />
        </button>
        <button
          title={maximized ? t('window.restore') : t('window.maximize')}
          aria-label={maximized ? t('window.restore') : t('window.maximize')}
          onClick={() => void window.api.window.toggleMaximize()}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          className="window-close"
          title={t('window.close')}
          aria-label={t('window.close')}
          onClick={() => void window.api.window.close()}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  )
}