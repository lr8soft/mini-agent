import { useTranslation } from 'react-i18next'
import type { SkillConfig } from '@shared/types'

interface Props {
  skills: SkillConfig[]
  onChange: (skills: SkillConfig[]) => void
}

export function SkillSettings({ skills, onChange }: Props) {
  const { t } = useTranslation()
  const addSkill = async () => {
    const filePath = await window.api.settings.pickFile()
    if (!filePath) return
    const id = `skill-${Date.now()}`
    const name = filePath.split(/[\\/]/).pop()?.replace('.md', '') || 'Skill'
    const newSkill: SkillConfig = {
      id,
      name,
      path: filePath,
      enabled: true
    }
    onChange([...skills, newSkill])
  }

  const removeSkill = (idx: number) => {
    onChange(skills.filter((_, i) => i !== idx))
  }

  const toggleSkill = (idx: number) => {
    const next = [...skills]
    next[idx] = { ...next[idx], enabled: !next[idx].enabled }
    onChange(next)
  }

  // @ts-ignore
  // @ts-ignore
  return (
    <div>
      <p className="text-xs text-text-muted mb-4">
        {t('settings.skills.hint')}
      </p>

      {skills.map((s, i) => (
        <div key={s.id} className="bg-bg-card border border-border rounded-lg p-4 mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">{s.name}</p>
            <p className="text-xs text-text-muted font-mono truncate max-w-sm">{s.path}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={s.enabled} onChange={() => toggleSkill(i)} />
              <span className="text-text-secondary">{s.enabled ? t('settings.skills.on') : t('settings.skills.off')}</span>
            </label>
            <button onClick={() => removeSkill(i)} className="text-xs text-err hover:underline">{t('settings.skills.remove')}</button>
          </div>
        </div>
      ))}

      <button onClick={addSkill} className="btn-ghost w-full mt-2">{t('settings.skills.addSkill')}</button>
    </div>
  )
}
