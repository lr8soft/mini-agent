import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TokenUsageSummary {
  model: string
  totalInput: number
  totalOutput: number
  count: number
}

interface TokenUsageDaily {
  date: string
  model: string
  inputTokens: number
  outputTokens: number
}

const MODEL_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#a855f7', '#ec4899', '#14b8a6']

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

export function UsageSettings() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<TokenUsageSummary[]>([])
  const [daily, setDaily] = useState<TokenUsageDaily[]>([])

  const loadData = async () => {
    const [s, d] = await Promise.all([
      window.api.token.summary(),
      window.api.token.daily(30)
    ])
    setSummary(s as TokenUsageSummary[])
    setDaily(d as TokenUsageDaily[])
  }

  useEffect(() => {
    loadData()
  }, [])

  // 按天聚合为 recharts 友好格式
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()

    for (const d of daily) {
      if (!byDate.has(d.date)) byDate.set(d.date, { date: d.date.slice(5) }) // MM-DD
      const entry = byDate.get(d.date)!
      entry[`${d.model}_input`] = (Number(entry[`${d.model}_input`]) || 0) + d.inputTokens
      entry[`${d.model}_output`] = (Number(entry[`${d.model}_output`]) || 0) + d.outputTokens
    }

    return Array.from(byDate.values())
  }, [daily])

  const allModelInputKeys = useMemo(() => {
    const models = Array.from(new Set(daily.map(d => d.model)))
    return models.map(m => ({ model: m, key: `${m}_input` }))
  }, [daily])

  if (summary.length === 0 && daily.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        {t('settings.usage.noData')}
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-text-muted mb-4">{t('settings.usage.hint')}</p>

      {/* 汇总表格 */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs">
              <th className="px-4 py-2 text-left">{t('settings.usage.model')}</th>
              <th className="px-4 py-2 text-right">{t('settings.usage.inputTokens')}</th>
              <th className="px-4 py-2 text-right">{t('settings.usage.outputTokens')}</th>
              <th className="px-4 py-2 text-right">{t('settings.usage.totalTokens')}</th>
              <th className="px-4 py-2 text-right">{t('settings.usage.requests')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.model} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-text-primary font-mono">{row.model}</td>
                <td className="px-4 py-2 text-right text-cyan-400">{formatNumber(row.totalInput)}</td>
                <td className="px-4 py-2 text-right text-amber-400">{formatNumber(row.totalOutput)}</td>
                <td className="px-4 py-2 text-right text-text-primary">{formatNumber(row.totalInput + row.totalOutput)}</td>
                <td className="px-4 py-2 text-right text-text-secondary">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 每日折线图 */}
      {chartData.length > 1 && (
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm text-text-primary mb-4">{t('settings.usage.dailyChart')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} tickFormatter={v => formatCompact(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: '#ccc' }}
                formatter={(value, name) => [formatNumber(Number(value) || 0), String(name ?? '')]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {allModelInputKeys.map((m, i) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={`${m.model} input`}
                  stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
