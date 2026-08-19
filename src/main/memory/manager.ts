// ============================================================
// Memory Manager — 记忆写入、去重、检索、注入系统提示词
// ============================================================
import type { ChatMessage, ProviderConfig, MemoryEntry } from '../../shared/types'
import { addMemory, getMemories, touchMemory, getMemories as queryMemories } from '../store/db'
import { extractMemories } from './extractor'
import { log } from '../llm/logger'

/**
 * 从对话中提取并存储记忆
 * 在 agent 对话完成后异步调用
 */
export async function captureMemories(
  provider: ProviderConfig,
  messages: ChatMessage[],
  sessionId: string
): Promise<number> {
  try {
    const extracted = await extractMemories(provider, messages, sessionId)
    let saved = 0
    for (const mem of extracted) {
      // 去重检查：搜索已有记忆中是否有内容相似的
      const existing = queryMemories({ search: mem.content.slice(0, 30), limit: 5 })
      const isDuplicate = existing.some(e =>
        similarity(e.content, mem.content) > 0.85
      )
      if (isDuplicate) {
        log('info', `[Memory] Skipped duplicate: "${mem.content.slice(0, 60)}..."`)
        continue
      }

      addMemory({
        category: mem.category,
        content: mem.content,
        importance: mem.importance,
        sourceSessionId: sessionId,
        tags: mem.tags || []
      })
      saved++
    }
    if (saved > 0) {
      log('info', `[Memory] Saved ${saved} new memories from session ${sessionId}`)
    }
    return saved
  } catch (err) {
    log('warn', `[Memory] captureMemories error: ${(err as Error).message}`)
    return 0
  }
}

/**
 * 根据用户当前消息检索相关记忆
 * 使用关键词匹配 + 重要性排序
 */
export function retrieveRelevantMemories(userMessage: string, limit = 10): MemoryEntry[] {
  // 提取用户消息中的关键词
  const keywords = extractKeywords(userMessage)

  // 获取所有记忆，按重要性排序
  const allMemories = getMemories({ limit: 200 })

  if (allMemories.length === 0) return []

  // 按关键词匹配度 + 重要性打分
  const scored = allMemories.map(mem => {
    let score = mem.importance * 2 // 基础分来自重要性

    // 关键词匹配加分
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      if (mem.content.toLowerCase().includes(kwLower)) score += 3
      if (mem.tags?.some(t => t.toLowerCase().includes(kwLower))) score += 2
    }

    // 最近访问的记忆略微加分
    const ageDays = (Date.now() - mem.lastAccessed) / (1000 * 60 * 60 * 24)
    if (ageDays < 1) score += 1
    else if (ageDays < 7) score += 0.5

    return { mem, score }
  })

  // 按分数排序，取前 limit 条
  scored.sort((a, b) => b.score - a.score)
  const relevant = scored.slice(0, limit).map(s => s.mem)

  // 更新访问记录
  for (const mem of relevant) {
    touchMemory(mem.id)
  }

  return relevant
}

/**
 * 构建记忆系统提示词段落
 * 注入到 system prompt 中，让 Agent 感知用户的历史习惯
 */
export function buildMemoryPrompt(userMessage: string): string {
  const memories = retrieveRelevantMemories(userMessage)
  if (memories.length === 0) return ''

  // 按类别分组
  const grouped: Record<string, string[]> = {}
  for (const mem of memories) {
    if (!grouped[mem.category]) grouped[mem.category] = []
    grouped[mem.category].push(`- ${mem.content}`)
  }

  let prompt = '\n\n## User Memory (Long-term Preferences)\n'
  prompt += 'The following are remembered facts about this user. Use them to personalize your responses:\n\n'

  const categoryLabels: Record<string, string> = {
    preference: 'Preferences',
    habit: 'Working Habits',
    fact: 'Context & Facts',
    skill: 'Skills & Tech Stack',
    context: 'Project Context'
  }

  for (const [cat, items] of Object.entries(grouped)) {
    prompt += `### ${categoryLabels[cat] || cat}\n`
    prompt += items.join('\n') + '\n\n'
  }

  return prompt
}

// ============================================================
// 辅助函数
// ============================================================

/** 从文本中提取关键词（简单分词 + 过滤停用词） */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'cannot',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their',
    'and', 'or', 'but', 'not', 'no', 'if', 'then', 'so', 'for', 'to', 'of',
    'in', 'on', 'at', 'by', 'with', 'from', 'as',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    '帮我', '请', '一下', '一个', '这个', '那个', '什么', '怎么', '如何',
    '是的', '不是', '可以', '不能', '需要', '应该'
  ])

  // 英文单词 + 中文 2-4 字词组
  const words = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))

  // 提取中文片段（2-4 字）
  const chineseChunks = text.match(/[\u4e00-\u9fff]{2,4}/g) || []
  const filtered = chineseChunks.filter(c => !stopWords.has(c))

  return [...new Set([...words, ...filtered])].slice(0, 20)
}

/** 简单的文本相似度（基于共同词比例） */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}
