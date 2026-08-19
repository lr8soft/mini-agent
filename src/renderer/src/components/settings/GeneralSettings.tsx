import { useTranslation } from 'react-i18next'
import { Check, FolderOpen, Globe, Monitor, Moon, Sun, Type } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type AppLanguage, getEffectiveLanguage, storeLanguage } from '../../i18n'
import { useAppStore, FONT_SIZE_OPTIONS, type Theme } from '../../store'

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'system', icon: Monitor, labelKey: 'settings.general.themeSystem' },
  { value: 'light', icon: Sun, labelKey: 'settings.general.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'settings.general.themeDark' }
]

export function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const { settings, saveSettings, theme, setTheme, fontSize, setFontSize } = useAppStore()

  const pickDir = async () => {
    const dir = await window.api.settings.pickDirectory()
    if (dir) saveSettings({ ...settings, workspacePath: dir })
  }

  const handleLanguageChange = (lang: AppLanguage) => {
    saveSettings({ ...settings, language: lang })
    const effective = getEffectiveLanguage(lang)
    storeLanguage(lang)
    i18n.changeLanguage(effective)
  }

  return (
    <div>
      {/* 外观：主题 + 字号 */}
      <section className="settings-section">
        <div className="settings-section-title">
          <Sun size={16} />
          <div>
            <h3>{t('settings.general.appearance')}</h3>
            <p>{t('settings.general.appearanceHint')}</p>
          </div>
        </div>

        <div className="form-field">
          <span className="form-label">{t('settings.general.theme')}</span>
          <div className="theme-choice-grid" role="radiogroup" aria-label={t('settings.general.theme')}>
            {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                className={theme === value ? 'active' : ''}
                onClick={() => setTheme(value)}
              >
                <Icon size={15} />
                {t(labelKey)}
                {theme === value && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field" style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="font-size-select">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Type size={13} />
              {t('settings.general.fontSize')}
            </span>
          </label>
          <select
            id="font-size-select"
            className="input-field"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
          >
            {FONT_SIZE_OPTIONS.map(px => (
              <option key={px} value={px}>{t('settings.general.fontSizeOption', { px })}</option>
            ))}
          </select>
          <p className="form-hint">{t('settings.general.fontSizeHint')}</p>
        </div>
      </section>

      {/* 语言 */}
      <section className="settings-section">
        <div className="settings-section-title">
          <Globe size={16} />
          <div>
            <h3>{t('settings.general.language')}</h3>
            <p>{t('settings.general.languageHint')}</p>
          </div>
        </div>
        <select
          className="input-field"
          value={settings.language || 'auto'}
          onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
        >
          {SUPPORTED_LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.code === 'auto' ? t('settings.general.autoDetect') : lang.nativeLabel}
            </option>
          ))}
        </select>
      </section>

      {/* 工作目录 */}
      <section className="settings-section">
        <div className="settings-section-title">
          <FolderOpen size={16} />
          <div>
            <h3>{t('settings.general.workspacePath')}</h3>
            <p>{t('settings.general.workspaceHint')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input-field mono"
            style={{ flex: 1 }}
            value={settings.workspacePath}
            onChange={(e) => saveSettings({ ...settings, workspacePath: e.target.value })}
          />
          <button onClick={pickDir} className="btn-ghost">{t('settings.general.browse')}</button>
        </div>
      </section>
    </div>
  )
}