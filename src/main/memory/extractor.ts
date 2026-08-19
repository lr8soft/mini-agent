// ============================================================
// Memory Extractor — 从对话中自动提取用户使用习惯与偏好
// 在 Agent 对话完成后异步调用，不影响主流程
// ============================================================
import type { ChatMessage, ProviderConfig, MemoryCategory } from '../../shared/types'
import { complete, log } from '../llm/provider'

/** LLM 提取的单条记忆 */
interface ExtractedMemory {
  category: MemoryCategory
  content: string
  importance: number
  tags: string[]
}

/** LLM 返回的提取结果 */
interface ExtractionResult {
  memories: ExtractedMemory[]
}

/**
 * 从一轮对话中提取值得记住的信息
 * 只提取 user 和 assistant 的对话内容（跳过 tool 消息）
 */
export async function extractMemories(
  provider: ProviderConfig,
  messages: ChatMessage[],
  sessionId: string
): Promise<ExtractedMemory[]> {
  // 过滤出有意义的对话内容（只取最近 20 条，避免过长）
  const dialogMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .filter(m => m.content && m.content.trim().length > 0)
    .slice(-20)

  if (dialogMessages.length < 2) return []

  // 构建对话摘要文本
  const dialogText = dialogMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content!.slice(0, 500)}`)
    .join('\n\n')

  const extractPrompt = `You are a memory extraction assistant. Analyze the following conversation and extract any memorable information about the user's preferences, habits, working style, technical environment, or important facts.

Only extract information that would be useful for future conversations. Skip generic or trivial content.

Categories:
- preference: User likes/dislikes, coding style preferences, UI preferences, tool preferences
- habit: Recurring patterns in how the user works or asks for things
- fact: Important context about the user's project, environment, or identity
- skill: Specific skills or technologies the user is proficient in
- context: Important project context, deadlines, constraints, or relationships

Importance scale (1-5):
- 5: Critical preference/fact that affects all future work
- 4: Strong preference or important context
- 3: Useful habit or moderate preference
- 2: Minor preference, may or may not be relevant later
- 1: Trivial, probably not worth remembering (avoid extracting these)

Respond in JSON format ONLY (no markdown, no explanation):
{"memories": [{"category": "preference", "content": "concise memory statement", "importance": 4, "tags": ["tag1", "tag2"]}]}

If nothing worth remembering, return: {"memories": []}

Conversation:
${dialogText}`

  try {
    const response = await complete(provider, [
      { role: 'system', content: 'You are a memory extraction assistant. Respond only with valid JSON.' },
      { role: 'user', content: extractPrompt }
    ], undefined, 1000)

    const cleaned = response.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed: ExtractionResult = JSON.parse(cleaned)
    const memories = parsed.memories || []

    // 过滤掉 importance < 2 的
    const filtered = memories.filter(m => m.importance >= 2 && m.content && m.content.trim().length > 0)
    log('info', `[Memory] Extracted ${filtered.length} memories from session ${sessionId}`)
    return filtered
  } catch (err) {
    log('warn', `[Memory] Failed to extract memories: ${(err as Error).message}`)
    return []
  }
}
