import { useTranslation } from 'react-i18next'
import type { McpServerConfig } from '@shared/types'

interface Props {
  servers: McpServerConfig[]
  onChange: (servers: McpServerConfig[]) => void
}

export function McpSettings({ servers, onChange }: Props) {
  const { t } = useTranslation()
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
        {t('settings.mcp.hint')}
      </p>

      {servers.map((s, i) => (
        <div key={s.id} className="bg-bg-card border border-border rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-primary">{s.name}</span>
            <button onClick={() => removeServer(i)} className="text-xs text-err hover:underline">{t('settings.mcp.remove')}</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.name')}</label>
              <input
                className="input-field w-full text-sm"
                value={s.name}
                onChange={(e) => updateServer(i, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.type')}</label>
              <select
                className="input-field w-full text-sm"
                value={s.type}
                onChange={(e) => updateServer(i, { type: e.target.value as 'stdio' | 'sse' | 'streamable-http' })}
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="streamable-http">Streamable HTTP</option>
              </select>
            </div>
            {s.type === 'stdio' ? (
              <>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.command')}</label>
                  <input
                    className="input-field w-full text-sm font-mono"
                    value={s.command || ''}
                    onChange={(e) => updateServer(i, { command: e.target.value })}
                    placeholder="npx"
                  />
                  <p className="text-xs text-text-muted mt-1">{t('settings.mcp.commandHint')}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.args')}</label>
                  <input
                    className="input-field w-full text-sm font-mono"
                    value={(s.args || []).join(' ')}
                    onChange={(e) => updateServer(i, { args: e.target.value.split(/\s+/).filter(Boolean) })}
                    placeholder="-y @playwright/mcp@latest"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.env')}</label>
                  <textarea
                    className="input-field w-full text-sm font-mono"
                    rows={2}
                    value={Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                    onChange={(e) => {
                      const env: Record<string, string> = {}
                      for (const line of e.target.value.split('\n')) {
                        const eq = line.indexOf('=')
                        if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1)
                      }
                      updateServer(i, { env })
                    }}
                    placeholder="API_KEY=xxx"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.url')}</label>
                  <input
                    className="input-field w-full text-sm font-mono"
                    value={s.url || ''}
                    onChange={(e) => updateServer(i, { url: e.target.value })}
                    placeholder="https://example.com/mcp"
                  />
                </div>
                {/* 认证方式 */}
                <div className="col-span-2">
                  <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.authType')}</label>
                  <select
                    className="input-field w-full text-sm"
                    value={s.authType || 'none'}
                    onChange={(e) => updateServer(i, { authType: e.target.value as 'none' | 'bearer' | 'apikey' | 'custom' })}
                  >
                    <option value="none">{t('settings.mcp.authNone')}</option>
                    <option value="bearer">{t('settings.mcp.authBearer')}</option>
                    <option value="apikey">{t('settings.mcp.authApiKey')}</option>
                    <option value="custom">{t('settings.mcp.authCustom')}</option>
                  </select>
                </div>
                {/* Bearer Token */}
                {s.authType === 'bearer' && (
                  <div className="col-span-2">
                    <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.authToken')}</label>
                    <input
                      className="input-field w-full text-sm font-mono"
                      type="password"
                      value={s.authToken || ''}
                      onChange={(e) => updateServer(i, { authToken: e.target.value })}
                      placeholder="eyJhbGciOiJIUzI1NiIs..."
                    />
                  </div>
                )}
                {/* API Key */}
                {s.authType === 'apikey' && (
                  <>
                    <div>
                      <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.authHeader')}</label>
                      <input
                        className="input-field w-full text-sm font-mono"
                        value={s.authHeader || ''}
                        onChange={(e) => updateServer(i, { authHeader: e.target.value })}
                        placeholder="X-API-Key"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.apiKey')}</label>
                      <input
                        className="input-field w-full text-sm font-mono"
                        type="password"
                        value={s.apiKey || ''}
                        onChange={(e) => updateServer(i, { apiKey: e.target.value })}
                        placeholder="sk-xxx"
                      />
                    </div>
                  </>
                )}
                {/* 自定义 Headers */}
                {s.authType === 'custom' && (
                  <div className="col-span-2">
                    <label className="text-xs text-text-muted block mb-1">{t('settings.mcp.customHeaders')}</label>
                    <textarea
                      className="input-field w-full text-sm font-mono"
                      rows={3}
                      value={Object.entries(s.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}
                      onChange={(e) => {
                        const headers: Record<string, string> = {}
                        for (const line of e.target.value.split('\n')) {
                          const colon = line.indexOf(':')
                          if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
                        }
                        updateServer(i, { headers })
                      }}
                      placeholder={'Authorization: Bearer xxx\nX-Custom-Header: value'}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      <button onClick={addServer} className="btn-ghost w-full mt-2">{t('settings.mcp.addServer')}</button>
    </div>
  )
}
