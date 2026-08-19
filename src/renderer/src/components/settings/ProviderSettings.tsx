import { useTranslation } from 'react-i18next'
import type { ProviderConfig } from '@shared/types'

interface Props {
  providers: ProviderConfig[]
  activeId: string | null
  onChange: (providers: ProviderConfig[], activeId: string | null) => void
}

export function ProviderSettings({ providers, activeId, onChange }: Props) {
  const { t } = useTranslation()
  const addProvider = () => {
    const id = `prov-${Date.now()}`
    const newProv: ProviderConfig = {
      id,
      name: 'New Provider',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      defaultModel: 'qwen2.5:14b',
      enabled: true,
      temperature: undefined,
      reasoningEnabled: false,
      reasoningEffort: 'medium',
      contextWindow: 0
    }
    onChange([...providers, newProv], activeId || id)
  }

  const updateProvider = (idx: number, updates: Partial<ProviderConfig>) => {
    const next = [...providers]
    next[idx] = { ...next[idx], ...updates }
    onChange(next, activeId)
  }

  const removeProvider = (idx: number) => {
    const next = providers.filter((_, i) => i !== idx)
    const newActiveId = providers[idx].id === activeId
      ? (next[0]?.id || null)
      : activeId
    onChange(next, newActiveId)
  }

  return (
    <div>
      <p className="text-xs text-text-muted mb-4">
        {t('settings.providers.hint')}
      </p>

      {/* 煮米 API 引流 */}
      <div className="flex items-center justify-between bg-bg-card border border-accent/30 rounded-lg px-4 py-3 mb-4">
        <div className="text-xs text-text-secondary">
          <span className="text-accent-glow font-medium">煮米 API</span> — {t('settings.providers.zhuminetBanner')}
        </div>
        <button
          onClick={() => window.api.settings.openExternal('https://api.zhuminet.com/')}
          className="text-xs text-accent hover:text-accent-glow underline shrink-0"
        >
          {t('settings.providers.zhuminetRegister')}
        </button>
      </div>

      {providers.map((p, i) => (
        <div key={p.id} className={`bg-bg-card border rounded-lg p-4 mb-3 ${activeId === p.id ? 'border-accent' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => onChange(providers, p.id)}
              className={`text-sm font-medium ${activeId === p.id ? 'text-accent-glow' : 'text-text-primary'}`}
            >
              {activeId === p.id ? '● ' : '○ '}{p.name}
            </button>
            <button onClick={() => removeProvider(i)} className="text-xs text-err hover:underline">{t('settings.providers.remove')}</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">{t('settings.providers.name')}</label>
              <input
                className="input-field w-full text-sm"
                value={p.name}
                onChange={(e) => updateProvider(i, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">{t('settings.providers.defaultModel')}</label>
              <input
                className="input-field w-full text-sm"
                value={p.defaultModel}
                onChange={(e) => updateProvider(i, { defaultModel: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted block mb-1">{t('settings.providers.baseUrl')}</label>
              <input
                className="input-field w-full text-sm"
                value={p.baseUrl}
                onChange={(e) => updateProvider(i, { baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">{t('settings.providers.apiKey')}</label>
              <input
                className="input-field w-full text-sm"
                type="password"
                value={p.apiKey}
                onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                placeholder={t('settings.providers.apiKeyPlaceholder')}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => updateProvider(i, { enabled: e.target.checked })}
                />
                <span className="text-text-secondary">{t('settings.providers.enabled')}</span>
              </label>
            </div>
          </div>

          {/* Temperature */}
          <div className="mt-3">
            <label className="text-xs text-text-muted block mb-1">
              {t('settings.providers.temperature')} {p.temperature !== undefined && `(${p.temperature})`}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={p.temperature ?? 1}
                onChange={(e) => updateProvider(i, { temperature: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <button
                onClick={() => updateProvider(i, { temperature: undefined })}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                {t('settings.providers.temperatureReset')}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">{t('settings.providers.temperatureHint')}</p>
          </div>

          {/* Reasoning Effort */}
          <div className="mt-3 flex items-start gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={p.reasoningEnabled || false}
                onChange={(e) => updateProvider(i, { reasoningEnabled: e.target.checked })}
              />
              <span className="text-text-secondary">{t('settings.providers.reasoningEffort')}</span>
            </label>
            {p.reasoningEnabled && (
              <div className="flex-1">
                <select
                  className="input-field w-full text-sm"
                  value={p.reasoningEffort || 'medium'}
                  onChange={(e) => updateProvider(i, { reasoningEffort: e.target.value as 'low' | 'medium' | 'high' })}
                >
                  <option value="low">{t('settings.providers.reasoningLow')}</option>
                  <option value="medium">{t('settings.providers.reasoningMedium')}</option>
                  <option value="high">{t('settings.providers.reasoningHigh')}</option>
                </select>
              </div>
            )}
          </div>

          {/* Context Window */}
          <div className="mt-3">
            <label className="text-xs text-text-muted block mb-1">{t('settings.providers.contextWindow')}</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input-field flex-1 text-sm"
                value={p.contextWindow || 0}
                min={0}
                step={1024}
                onChange={(e) => updateProvider(i, { contextWindow: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
              <button
                onClick={() => updateProvider(i, { contextWindow: 0 })}
                className="text-xs text-text-muted hover:text-text-primary shrink-0"
              >
                {t('settings.providers.contextWindowAuto')}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">{t('settings.providers.contextWindowHint')}</p>
          </div>
        </div>
      ))}

      <button onClick={addProvider} className="btn-ghost w-full mt-2">{t('settings.providers.addProvider')}</button>
    </div>
  )
}
