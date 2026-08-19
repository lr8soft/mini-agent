import { useTranslation } from 'react-i18next'
import { FileText, Plus, Trash2 } from 'lucide-react'
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

  return (
    <div>
      <p className="form-hint" style={{ marginBottom: 14 }}>{t('settings.skills.hint')}</p>

      {skills.map((s, i) => (
        <div key={s.id} className="memory-card">
          <div className="memory-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <FileText size={15} style={{ color: 'var(--app-color-primary-strong)', flex: '0 0 auto' }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.867rem', fontWeight: 650 }}>{s.name}</p>
                <p className="form-hint" style={{ fontFamily: 'Consolas, Monaco, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                  {s.path}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="switch"
                  checked={s.enabled}
                  onChange={() => toggleSkill(i)}
                />
                <span className="form-label">{s.enabled ? t('settings.skills.on') : t('settings.skills.off')}</span>
              </label>
              <button onClick={() => removeSkill(i)} className="danger-link">
                <Trash2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                {t('settings.skills.remove')}
              </button>
            </div>
          </div>
        </div>
      ))}

      <button onClick={addSkill} className="btn-ghost" style={{ width: '100%', marginTop: 8 }}>
        <Plus size={14} />
        {t('settings.skills.addSkill')}
      </button>
    </div>
  )
}