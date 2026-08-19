import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { MemoryEntry } from '@shared/types'

export function MemorySettings() {
  const { t } = useTranslation()
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')

  const loadMemories = async () => {
    const result = await window.api.memory.list({
      search: search || undefined,
      category: filterCategory || undefined,
      limit: 200
    })
    setMemories(result as MemoryEntry[])
  }

  useEffect(() => {
    loadMemories()
  }, [search, filterCategory])

  const handleDelete = async (id: string) => {
    await window.api.memory.delete(id)
    loadMemories()
  }

  const handleClearAll = async () => {
    await window.api.memory.clearAll()
    loadMemories()
  }

  const handleImportance = async (id: string, importance: number) => {
    await window.api.memory.updateImportance(id, importance)
    loadMemories()
  }

  const categoryColors: Record<string, string> = {
    preference: 'text-blue-400',
    habit: 'text-green-400',
    fact: 'text-yellow-400',
    skill: 'text-purple-400',
    context: 'text-cyan-400'
  }

  const getCategoryLabel = (cat: string): string => {
    return t(`settings.memory.${cat}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-text-muted">
          {t('settings.memory.hint')}
        </p>
        {memories.length > 0 && (
          <button onClick={handleClearAll} className="text-xs text-err hover:underline shrink-0 ml-4">
            {t('settings.memory.clearAll')}
          </button>
        )}
      </div>

      {/* 搜索与筛选 */}
      <div className="flex gap-2 mb-4">
        <input
          className="input-field flex-1 text-sm"
          placeholder={t('settings.memory.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-field text-sm"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">{t('settings.memory.allCategories')}</option>
          <option value="preference">{t('settings.memory.preference')}</option>
          <option value="habit">{t('settings.memory.habit')}</option>
          <option value="fact">{t('settings.memory.fact')}</option>
          <option value="skill">{t('settings.memory.skill')}</option>
          <option value="context">{t('settings.memory.context')}</option>
        </select>
      </div>

      {/* 记忆列表 */}
      {memories.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          {search || filterCategory ? t('settings.memory.noMatch') : t('settings.memory.noMemories')}
        </div>
      ) : (
        memories.map((mem) => (
          <div key={mem.id} className="bg-bg-card border border-border rounded-lg p-3 mb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${categoryColors[mem.category] || 'text-text-secondary'}`}>
                    {getCategoryLabel(mem.category)}
                  </span>
                  {/* Importance 星级 */}
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => handleImportance(mem.id, n)}
                        className={`text-xs ${n <= mem.importance ? 'text-accent-glow' : 'text-text-muted'}`}
                        title={`Set importance to ${n}`}
                      >
                        *
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-text-primary break-words">{mem.content}</p>
                {mem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {mem.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-bg-hover text-text-muted">{tag}</span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-text-muted mt-1">
                  {t('settings.memory.accessed')} {mem.accessCount}{t('settings.memory.times')} | {new Date(mem.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                className="text-xs text-err hover:underline shrink-0"
              >
                {t('settings.memory.delete')}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
