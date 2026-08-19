import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type AppLanguage, getEffectiveLanguage, storeLanguage } from '../../i18n'

interface Props {
  workspacePath: string
  language: AppLanguage
  onWorkspaceChange: (path: string) => void
  onLanguageChange: (lang: AppLanguage) => void
}

export function GeneralSettings({ workspacePath, language, onWorkspaceChange, onLanguageChange }: Props) {
  const { t, i18n } = useTranslation()
  const pickDir = async () => {
    const dir = await window.api.settings.pickDirectory()
    if (dir) onWorkspaceChange(dir)
  }

  const handleLanguageChange = (lang: AppLanguage) => {
    onLanguageChange(lang)
    const effective = getEffectiveLanguage(lang)
    storeLanguage(lang)
    i18n.changeLanguage(effective)
  }

  return (
    <div>
      <label className="text-xs text-text-muted block mb-1">{t('settings.general.workspacePath')}</label>
      <div className="flex gap-2">
        <input
          className="input-field flex-1 text-sm font-mono"
          value={workspacePath}
          onChange={(e) => onWorkspaceChange(e.target.value)}
        />
        <button onClick={pickDir} className="btn-ghost">{t('settings.general.browse')}</button>
      </div>
      <p className="text-xs text-text-muted mt-2">
        {t('settings.general.workspaceHint')}
      </p>

      {/* 语言切换 */}
      <div className="mt-6">
        <label className="text-xs text-text-muted block mb-1">{t('settings.general.language')}</label>
        <select
          className="input-field w-full text-sm"
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
        >
          {SUPPORTED_LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.code === 'auto' ? t('settings.general.autoDetect') : `${lang.nativeLabel}`}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted mt-2">
          {t('settings.general.languageHint')}
        </p>
      </div>
    </div>
  )
}
