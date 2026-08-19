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

const MODEL_COLORS = ['#1389c9', '#0e9aa7', '#c18a2e', '#d23b4c', '#13875d', '#7c5cd6', '#ec4899', '#14b8a6']

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
      <div className="memory-empty">
        {t('settings.usage.noData')}
      </div>
    )
  }

  return (
    <div>
      <p className="form-hint" style={{ marginBottom: 14 }}>{t('settings.usage.hint')}</p>

      {/* 汇总表格 */}
      <div className="usage-table-wrap">
        <table className="usage-table">
          <thead>
            <tr>
              <th>{t('settings.usage.model')}</th>
              <th>{t('settings.usage.inputTokens')}</th>
              <th>{t('settings.usage.outputTokens')}</th>
              <th>{t('settings.usage.totalTokens')}</th>
              <th>{t('settings.usage.requests')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.model}>
                <td>{row.model}</td>
                <td className="num-input">{formatNumber(row.totalInput)}</td>
                <td className="num-output">{formatNumber(row.totalOutput)}</td>
                <td className="num-total">{formatNumber(row.totalInput + row.totalOutput)}</td>
                <td className="num-count">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 每日折线图 */}
      {chartData.length > 1 && (
        <div className="chart-panel">
          <h3>{t('settings.usage.dailyChart')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--app-color-text-mute)' }} stroke="var(--app-color-border-strong)" />
              <YAxis tick={{ fontSize: 11, fill: 'var(--app-color-text-mute)' }} tickFormatter={v => formatCompact(Number(v))} stroke="var(--app-color-border-strong)" />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-color-surface-solid)',
                  border: '1px solid var(--app-color-border-strong)',
                  borderRadius: 6,
                  fontSize: 12
                }}
                labelStyle={{ color: 'var(--app-color-text)' }}
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