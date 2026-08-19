import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Trash2 } from 'lucide-react'
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

  const getCategoryLabel = (cat: string): string => {
    return t(`settings.memory.${cat}`)
  }

  return (
    <div>
      <div className="memory-toolbar">
        <p className="form-hint">{t('settings.memory.hint')}</p>
        {memories.length > 0 && (
          <button onClick={handleClearAll} className="danger-link" style={{ flex: '0 0 auto' }}>
            {t('settings.memory.clearAll')}
          </button>
        )}
      </div>

      {/* 搜索与筛选 */}
      <div className="memory-filter-row">
        <input
          className="input-field"
          placeholder={t('settings.memory.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-field"
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
        <div className="memory-empty">
          {search || filterCategory ? t('settings.memory.noMatch') : t('settings.memory.noMemories')}
        </div>
      ) : (
        memories.map((mem) => (
          <div key={mem.id} className="memory-card">
            <div className="memory-card-head">
              <div className="memory-meta">
                <span className={`memory-category ${mem.category}`}>
                  <span className="dot" />
                  {getCategoryLabel(mem.category)}
                </span>
                {/* Importance 星级 */}
                <div className="memory-stars">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => handleImportance(mem.id, n)}
                      className={n <= mem.importance ? 'filled' : ''}
                      title={`Set importance to ${n}`}
                    >
                      <Star size={12} fill={n <= mem.importance ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                className="danger-link"
                style={{ flex: '0 0 auto' }}
              >
                <Trash2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                {t('settings.memory.delete')}
              </button>
            </div>
            <p className="memory-content">{mem.content}</p>
            {mem.tags.length > 0 && (
              <div className="memory-tags">
                {mem.tags.map(tag => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="memory-foot">
              <span>
                {t('settings.memory.accessed')} {mem.accessCount}{t('settings.memory.times')}
              </span>
              <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}