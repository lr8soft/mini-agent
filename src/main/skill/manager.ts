// ============================================================
// Skill 管理器 — 加载 SKILL.md 文件并注入系统提示词
// Skill 是一段 Markdown 指令，告诉 Agent 在特定场景下如何行动
// ============================================================
import { promises as fs } from 'node:fs'
import matter from 'gray-matter'
import type { SkillConfig } from '../../shared/types'
import { log } from '../llm/provider'

interface LoadedSkill {
  config: SkillConfig
  name: string
  description: string
  content: string
  triggers: string[]
}

let loadedSkills: LoadedSkill[] = []

/**
 * 从文件加载一个 Skill
 * SKILL.md 格式：可选 YAML frontmatter + Markdown 正文
 * frontmatter 支持字段: name, description, triggers(数组)
 */
export async function loadSkill(config: SkillConfig): Promise<LoadedSkill | null> {
  if (!config.enabled) return null

  try {
    const raw = await fs.readFile(config.path, 'utf-8')
    const { data, content } = matter(raw)
    const skill: LoadedSkill = {
      config,
      name: data.name || config.name,
      description: data.description || '',
      content: content.trim(),
      triggers: data.triggers || []
    }
    log('info', `Skill "${skill.name}" loaded from ${config.path}`)
    return skill
  } catch (err) {
    log('error', `Failed to load skill "${config.name}": ${(err as Error).message}`)
    return null
  }
}

/**
 * 重新加载所有 Skill
 */
export async function reloadSkills(configs: SkillConfig[]): Promise<void> {
  loadedSkills = []
  for (const config of configs) {
    const skill = await loadSkill(config)
    if (skill) loadedSkills.push(skill)
  }
  log('info', `Skills reloaded: ${loadedSkills.length} active`)
}

/**
 * 生成系统提示词中的 Skill 段落
 * 告诉 LLM 有哪些 Skill 可用，以及触发条件
 */
export function getSkillsSystemPrompt(): string {
  if (loadedSkills.length === 0) return ''

  let prompt = '\n\n## Available Skills\n'
  prompt += 'You can invoke skills to handle specialized tasks. '
  prompt += 'To use a skill, include it in your response using the format: `/skill <name> <task description>`.\n\n'

  for (const skill of loadedSkills) {
    prompt += `### ${skill.name}\n`
    if (skill.description) prompt += `${skill.description}\n`
    if (skill.triggers.length > 0) {
      prompt += `Triggers: ${skill.triggers.join(', ')}\n`
    }
    prompt += `${skill.content}\n\n`
  }

  return prompt
}

/**
 * 获取已加载的 Skill 列表（简略信息）
 */
export function getLoadedSkillsInfo(): { name: string; description: string; triggers: string[] }[] {
  return loadedSkills.map(s => ({ name: s.name, description: s.description, triggers: s.triggers }))
}
