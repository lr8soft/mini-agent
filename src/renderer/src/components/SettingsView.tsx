import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Brain, Cable, Server, Settings2, Sparkles } from 'lucide-react'
import { useAppStore } from '../store'
import { ProviderSettings } from './settings/ProviderSettings'
import { McpSettings } from './settings/McpSettings'
import { SkillSettings } from './settings/SkillSettings'
import { MemorySettings } from './settings/MemorySettings'
import { UsageSettings } from './settings/UsageSettings'
import { GeneralSettings } from './settings/GeneralSettings'

type Tab = 'providers' | 'mcp' | 'skills' | 'memory' | 'usage' | 'general'

const TAB_ICONS: Record<Tab, typeof Server> = {
  providers: Server,
  mcp: Cable,
  skills: Sparkles,
  memory: Brain,
  usage: BarChart3,
  general: Settings2
}

export default function SettingsView() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('providers')
  const { settings, saveSettings } = useAppStore()

  const tabs: Tab[] = ['providers', 'mcp', 'skills', 'memory', 'usage', 'general']

  return (
    <div className="settings-view">
      <div className="settings-page">
        <h1 className="settings-page-title">{t('settings.title')}</h1>

        {/* 标签页 */}
        <div className="settings-tabs" role="tablist">
          {tabs.map((tb) => {
            const Icon = TAB_ICONS[tb]
            return (
              <button
                key={tb}
                className={tab === tb ? 'active' : ''}
                onClick={() => setTab(tb)}
                role="tab"
                aria-selected={tab === tb}
              >
                <Icon size={14} />
                {t(`settings.tabs.${tb}`)}
              </button>
            )
          })}
        </div>

        {/* 内容 */}
        {tab === 'providers' && <ProviderSettings
          providers={settings.providers}
          activeId={settings.activeProviderId}
          onChange={(providers, activeId) => saveSettings({ ...settings, providers, activeProviderId: activeId })}
        />}
        {tab === 'mcp' && <McpSettings
          servers={settings.mcpServers}
          onChange={(mcpServers) => saveSettings({ ...settings, mcpServers })}
        />}
        {tab === 'skills' && <SkillSettings
          skills={settings.skills}
          onChange={(skills) => saveSettings({ ...settings, skills })}
        />}
        {tab === 'memory' && <MemorySettings />}
        {tab === 'usage' && <UsageSettings />}
        {tab === 'general' && <GeneralSettings />}

        {/* 保存按钮 */}
        <div className="settings-footer">
          <button className="btn-primary" onClick={() => saveSettings(settings)}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}