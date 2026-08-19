import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import type { AppLanguage } from '../i18n'
import { ProviderSettings } from './settings/ProviderSettings'
import { McpSettings } from './settings/McpSettings'
import { SkillSettings } from './settings/SkillSettings'
import { GeneralSettings } from './settings/GeneralSettings'
import { MemorySettings } from './settings/MemorySettings'
import { UsageSettings } from './settings/UsageSettings'

type TabKey = 'providers' | 'mcp' | 'skills' | 'memory' | 'usage' | 'general'

export default function SettingsView() {
  const { t } = useTranslation()
  const { settings, saveSettings } = useAppStore()
  const [local, setLocal] = useState({ ...settings })
  const [tab, setTab] = useState<TabKey>('providers')

  const handleSave = () => {
    saveSettings(local)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-lg font-bold text-text-primary mb-6">{t('settings.title')}</h2>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-6 bg-bg-card rounded-lg p-1">
          {(['providers', 'mcp', 'skills', 'memory', 'usage', 'general'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                tab === tabKey
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {t(`settings.tabs.${tabKey}`)}
            </button>
          ))}
        </div>

        {/* LLM Providers */}
        {tab === 'providers' && (
          <ProviderSettings
            providers={local.providers}
            activeId={local.activeProviderId}
            onChange={(providers, activeId) => setLocal({ ...local, providers, activeProviderId: activeId || null })}
          />
        )}

        {/* MCP Servers */}
        {tab === 'mcp' && (
          <McpSettings
            servers={local.mcpServers}
            onChange={(mcpServers) => setLocal({ ...local, mcpServers })}
          />
        )}

        {/* Skills */}
        {tab === 'skills' && (
          <SkillSettings
            skills={local.skills}
            onChange={(skills) => setLocal({ ...local, skills })}
          />
        )}

        {/* Memory */}
        {tab === 'memory' && (
          <MemorySettings />
        )}

        {/* Token Usage */}
        {tab === 'usage' && (
          <UsageSettings />
        )}

        {/* General */}
        {tab === 'general' && (
          <GeneralSettings
            workspacePath={local.workspacePath}
            language={(local.language as AppLanguage) || 'auto'}
            onLanguageChange={(lang) => setLocal({ ...local, language: lang })}
            onWorkspaceChange={(workspacePath) => setLocal({ ...local, workspacePath })}
          />
        )}

        {/* 保存按钮 */}
        <div className="mt-8 flex justify-end">
          <button onClick={handleSave} className="btn-primary px-8">{t('settings.save')}</button>
        </div>
      </div>
    </div>
  )
}
