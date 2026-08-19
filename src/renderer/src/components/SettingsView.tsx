import { useState } from 'react'
import { useAppStore } from '../store'
import type { ProviderConfig, McpServerConfig, SkillConfig } from '@shared/types'

export default function SettingsView() {
  const { settings, saveSettings } = useAppStore()
  const [local, setLocal] = useState({ ...settings })
  const [tab, setTab] = useState<'providers' | 'mcp' | 'skills' | 'general'>('providers')

  const handleSave = () => {
    saveSettings(local)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-lg font-bold text-text-primary mb-6">Settings</h2>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-6 bg-bg-card rounded-lg p-1">
          {(['providers', 'mcp', 'skills', 'general'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors capitalize ${
                tab === t
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {t === 'providers' ? 'LLM Providers' : t === 'mcp' ? 'MCP Servers' : t === 'skills' ? 'Skills' : 'General'}
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

        {/* General */}
        {tab === 'general' && (
          <GeneralSettings
            workspacePath={local.workspacePath}
            onChange={(workspacePath) => setLocal({ ...local, workspacePath })}
          />
        )}

        {/* 保存按钮 */}
        <div className="mt-8 flex justify-end">
          <button onClick={handleSave} className="btn-primary px-8">Save Settings</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Provider Settings
// ============================================================
function ProviderSettings({ providers, activeId, onChange }: {
  providers: ProviderConfig[]
  activeId: string | null
  onChange: (providers: ProviderConfig[], activeId: string | null) => void
}) {
  const addProvider = () => {
    const id = `prov-${Date.now()}`
    const newProv: ProviderConfig = {
      id,
      name: 'New Provider',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      defaultModel: 'qwen2.5:14b',
      enabled: true
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
        Configure LLM providers. Any OpenAI-compatible endpoint works (Ollama, vLLM, OpenAI, Anthropic, etc.).
      </p>

      {providers.map((p, i) => (
        <div key={p.id} className={`bg-bg-card border rounded-lg p-4 mb-3 ${activeId === p.id ? 'border-accent' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => onChange(providers, p.id)}
              className={`text-sm font-medium ${activeId === p.id ? 'text-accent-glow' : 'text-text-primary'}`}
            >
              {activeId === p.id ? '● ' : '○ '}{p.name}
            </button>
            <button onClick={() => removeProvider(i)} className="text-xs text-err hover:underline">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Name</label>
              <input
                className="input-field w-full text-sm"
                value={p.name}
                onChange={(e) => updateProvider(i, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Default Model</label>
              <input
                className="input-field w-full text-sm"
                value={p.defaultModel}
                onChange={(e) => updateProvider(i, { defaultModel: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted block mb-1">Base URL</label>
              <input
                className="input-field w-full text-sm"
                value={p.baseUrl}
                onChange={(e) => updateProvider(i, { baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">API Key</label>
              <input
                className="input-field w-full text-sm"
                type="password"
                value={p.apiKey}
                onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                placeholder="(optional for local)"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => updateProvider(i, { enabled: e.target.checked })}
                />
                <span className="text-text-secondary">Enabled</span>
              </label>
            </div>
          </div>
        </div>
      ))}

      <button onClick={addProvider} className="btn-ghost w-full mt-2">+ Add Provider</button>
    </div>
  )
}

// ============================================================
// MCP Settings
// ============================================================
function McpSettings({ servers, onChange }: {
  servers: McpServerConfig[]
  onChange: (servers: McpServerConfig[]) => void
}) {
  const addServer = () => {
    const id = `mcp-${Date.now()}`
    const newServer: McpServerConfig = {
      id,
      name: 'New MCP Server',
      type: 'stdio',
      command: '',
      args: [],
      enabled: true
    }
    onChange([...servers, newServer])
  }

  const updateServer = (idx: number, updates: Partial<McpServerConfig>) => {
    const next = [...servers]
    next[idx] = { ...next[idx], ...updates }
    onChange(next)
  }

  const removeServer = (idx: number) => {
    onChange(servers.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <p className="text-xs text-text-muted mb-4">
        Configure MCP (Model Context Protocol) servers for extended tool capabilities.
      </p>

      {servers.map((s, i) => (
        <div key={s.id} className="bg-bg-card border border-border rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-primary">{s.name}</span>
            <button onClick={() => removeServer(i)} className="text-xs text-err hover:underline">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Name</label>
              <input
                className="input-field w-full text-sm"
                value={s.name}
                onChange={(e) => updateServer(i, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Type</label>
              <select
                className="input-field w-full text-sm"
                value={s.type}
                onChange={(e) => updateServer(i, { type: e.target.value as 'stdio' | 'sse' })}
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
              </select>
            </div>
            {s.type === 'stdio' ? (
              <div className="col-span-2">
                <label className="text-xs text-text-muted block mb-1">Command</label>
                <input
                  className="input-field w-full text-sm font-mono"
                  value={s.command || ''}
                  onChange={(e) => updateServer(i, { command: e.target.value })}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem /path"
                />
              </div>
            ) : (
              <div className="col-span-2">
                <label className="text-xs text-text-muted block mb-1">URL</label>
                <input
                  className="input-field w-full text-sm font-mono"
                  value={s.url || ''}
                  onChange={(e) => updateServer(i, { url: e.target.value })}
                  placeholder="https://example.com/mcp"
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <button onClick={addServer} className="btn-ghost w-full mt-2">+ Add MCP Server</button>
    </div>
  )
}

// ============================================================
// Skill Settings
// ============================================================
function SkillSettings({ skills, onChange }: {
  skills: SkillConfig[]
  onChange: (skills: SkillConfig[]) => void
}) {
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
      <p className="text-xs text-text-muted mb-4">
        Load Skill definitions (SKILL.md files) to inject specialized prompts into the agent.
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
              <span className="text-text-secondary">{s.enabled ? 'On' : 'Off'}</span>
            </label>
            <button onClick={() => removeSkill(i)} className="text-xs text-err hover:underline">Remove</button>
          </div>
        </div>
      ))}

      <button onClick={addSkill} className="btn-ghost w-full mt-2">+ Add Skill (pick .md file)</button>
    </div>
  )
}

// ============================================================
// General Settings
// ============================================================
function GeneralSettings({ workspacePath, onChange }: {
  workspacePath: string
  onChange: (path: string) => void
}) {
  const pickDir = async () => {
    const dir = await window.api.settings.pickDirectory()
    if (dir) onChange(dir)
  }

  return (
    <div>
      <label className="text-xs text-text-muted block mb-1">Workspace Path</label>
      <div className="flex gap-2">
        <input
          className="input-field flex-1 text-sm font-mono"
          value={workspacePath}
          onChange={(e) => onChange(e.target.value)}
        />
        <button onClick={pickDir} className="btn-ghost">Browse</button>
      </div>
      <p className="text-xs text-text-muted mt-2">
        The root directory the agent will work in. File tools are relative to this path.
      </p>
    </div>
  )
}
