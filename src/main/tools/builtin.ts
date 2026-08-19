// ============================================================
// 内置工具集 — read / write / edit / bash / grep / glob / ls
// ============================================================
import { promises as fs, createReadStream } from 'node:fs'
import * as path from 'node:path'
import { exec } from 'node:child_process'
import { createInterface } from 'node:readline'
import { minimatch } from 'minimatch'
import type { ToolHandler, ToolContext } from './registry'
import { updateSessionTitle } from '../store/db'
import { mainWindow } from '../index'

// 文本读取工具
export const readTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'read',
      description: '读取文件内容。可指定 offset 和 limit 分段读取大文件。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '要读取的文件绝对路径' },
          offset: { type: 'number', description: '起始行号(1-based)，默认1' },
          limit: { type: 'number', description: '读取的行数上限，默认2000' }
        },
        required: ['file_path']
      }
    }
  },
  permission: 'safe',
  async execute(args, ctx: ToolContext) {
    const filePath = args.file_path as string
    const offset = (args.offset as number) || 1
    const limit = (args.limit as number) || 2000
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(ctx.workspacePath, filePath)

    try {
      const content = await fs.readFile(resolved, 'utf-8')
      const lines = content.split('\n')
      const start = Math.max(0, offset - 1)
      const end = Math.min(lines.length, start + limit)
      const result = lines.slice(start, end)
        .map((line, i) => `${String(start + i + 1).padStart(6)}: ${line}`)
        .join('\n')
      return result || '(empty file)'
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`
    }
  }
}

// 文件写入工具
export const writeTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'write',
      description: '写入文件（覆盖）。自动创建不存在的目录。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件绝对路径' },
          content: { type: 'string', description: '要写入的完整内容' }
        },
        required: ['file_path', 'content']
      }
    }
  },
  permission: 'normal',
  async execute(args, ctx) {
    const filePath = args.file_path as string
    const content = args.content as string
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(ctx.workspacePath, filePath)

    try {
      await fs.mkdir(path.dirname(resolved), { recursive: true })
      await fs.writeFile(resolved, content, 'utf-8')
      return `File written: ${resolved}`
    } catch (err) {
      return `Error writing file: ${(err as Error).message}`
    }
  }
}

// 文件编辑工具（精确替换）
export const editTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'edit',
      description: '编辑文件：找到 oldString 并替换为 newString。如果有多处匹配会失败。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件绝对路径' },
          oldString: { type: 'string', description: '要被替换的原始文本' },
          newString: { type: 'string', description: '替换后的文本' },
          replaceAll: { type: 'boolean', description: '是否替换所有匹配，默认false' }
        },
        required: ['file_path', 'oldString', 'newString']
      }
    }
  },
  permission: 'normal',
  async execute(args, ctx) {
    const filePath = args.file_path as string
    const oldStr = args.oldString as string
    const newStr = args.newString as string
    const replaceAll = args.replaceAll as boolean
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(ctx.workspacePath, filePath)

    try {
      const content = await fs.readFile(resolved, 'utf-8')
      const count = content.split(oldStr).length - 1
      if (count === 0) return `Error: oldString not found in file`
      if (count > 1 && !replaceAll) return `Error: ${count} matches found, set replaceAll=true or provide more context`

      const newContent = replaceAll
        ? content.split(oldStr).join(newStr)
        : content.replace(oldStr, newStr)
      await fs.writeFile(resolved, newContent, 'utf-8')
      return `File edited: ${resolved} (${replaceAll ? count : 1} replacement(s))`
    } catch (err) {
      return `Error editing file: ${(err as Error).message}`
    }
  }
}

// Bash 执行工具
export const bashTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'bash',
      description: '执行 shell 命令。默认超时 120 秒。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeout: { type: 'number', description: '超时秒数，默认120' }
        },
        required: ['command']
      }
    }
  },
  permission: 'dangerous',
  async execute(args, ctx) {
    const command = args.command as string
    const timeout = ((args.timeout as number) || 120) * 1000
    const resolvedCmd = `cd "${ctx.workspacePath}" && ${command}`

    return new Promise((resolve) => {
      exec(resolvedCmd, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        cwd: ctx.workspacePath,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
      }, (err, stdout, stderr) => {
        let result = ''
        if (stdout) result += stdout
        if (stderr) result += (result ? '\n' : '') + stderr
        if (err && err.killed) result += (result ? '\n' : '') + 'Process timed out'
        if (!result.trim()) result = '(no output)'
        resolve(result)
      })
    })
  }
}

// Grep 内容搜索工具
export const grepTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'grep',
      description: '搜索文件内容。支持正则表达式。返回匹配的文件路径和行号。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '正则表达式' },
          path: { type: 'string', description: '搜索目录，默认工作目录' },
          include: { type: 'string', description: '文件名 glob 过滤，如 *.ts、*.{h,cpp}' },
          exclude: { type: 'array', items: { type: 'string' }, description: '要跳过的目录名列表，如 ["node_modules", ".git", "Binaries"]' }
        },
        required: ['pattern']
      }
    }
  },
  permission: 'safe',
  async execute(args, ctx) {
    const pattern = args.pattern as string
    const searchPath = args.path as string || ctx.workspacePath
    const include = args.include as string
    const exclude = new Set((args.exclude as string[]) || [])
    const resolved = path.isAbsolute(searchPath) ? searchPath : path.join(ctx.workspacePath, searchPath)

    const regex = new RegExp(pattern)
    const results: string[] = []
    const maxResults = 200

    async function searchDir(dir: string) {
      if (results.length >= maxResults) return
      let entries: import('node:fs').Dirent[]
      try { entries = await fs.readdir(dir, { withFileTypes: true }) }
      catch { return }

      for (const entry of entries) {
        if (results.length >= maxResults) break
        if (entry.isDirectory() && exclude.size > 0 && exclude.has(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await searchDir(fullPath)
        } else if (entry.isFile()) {
          if (include && !minimatch(entry.name, include)) continue
          try {
            const rl = createInterface({ input: createReadStream(fullPath, { encoding: 'utf-8' }), crlfDelay: Infinity })
            let lineNum = 0
            for await (const line of rl) {
              lineNum++
              if (regex.test(line)) {
                const display = path.relative(ctx.workspacePath, fullPath)
                results.push(`${display}:${lineNum}: ${line.trim().slice(0, 200)}`)
                if (results.length >= maxResults) break
              }
            }
          } catch { /* skip binary/unreadable */ }
        }
      }
    }

    await searchDir(resolved)
    if (results.length === 0) return 'No matches found'
    if (results.length >= maxResults) results.push(`... (truncated at ${maxResults} results)`)
    return results.join('\n')
  }
}

// Glob 文件匹配工具
export const globTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'glob',
      description: '按通配符模式查找文件。支持标准 glob 语法：** 递归子目录，* 匹配任意字符（不含/），? 匹配单个字符。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'glob 模式，如 **/*.ts、**/*Scene*.h、src/**/*.cpp' },
          path: { type: 'string', description: '搜索根目录，默认工作目录' },
          exclude: { type: 'array', items: { type: 'string' }, description: '要跳过的目录名列表，如 ["node_modules", ".git", "Binaries"]' }
        },
        required: ['pattern']
      }
    }
  },
  permission: 'safe',
  async execute(args, ctx) {
    const pattern = args.pattern as string
    const searchPath = args.path as string || ctx.workspacePath
    const exclude = new Set((args.exclude as string[]) || [])
    const resolved = path.isAbsolute(searchPath) ? searchPath : path.join(ctx.workspacePath, searchPath)

    try {
      const results: string[] = []
      await walkDir(resolved, pattern, results, ctx.workspacePath, exclude)
      return results.length ? results.slice(0, 500).join('\n') : 'No files found'
    } catch (err) {
      return `Error: ${(err as Error).message}`
    }
  }
}

// 目录列表工具
export const lsTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'ls',
      description: '列出目录内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认工作目录' },
          ignore: { type: 'array', items: { type: 'string' }, description: '要忽略的目录/文件名模式' }
        }
      }
    }
  },
  permission: 'safe',
  async execute(args, ctx) {
    const target = args.path as string || ctx.workspacePath
    const ignore = new Set((args.ignore as string[]) || [])
    const resolved = path.isAbsolute(target) ? target : path.join(ctx.workspacePath, target)

    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true })
      const lines = entries
        .filter(e => !ignore.has(e.name))
        .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}${e.isDirectory() ? '/' : ''}`)
        .sort()
      return lines.join('\n') || '(empty)'
    } catch (err) {
      return `Error: ${(err as Error).message}`
    }
  }
}

// ============================================================
// 辅助函数
// ============================================================

/** 递归遍历目录，用 minimatch 匹配完整相对路径 */
async function walkDir(dir: string, pattern: string, results: string[], workspacePath: string, exclude: Set<string> = new Set()) {
  if (results.length >= 500) return
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(dir, { withFileTypes: true }) }
  catch { return }

  for (const entry of entries) {
    if (results.length >= 500) break
    if (entry.isDirectory() && exclude.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(fullPath, pattern, results, workspacePath, exclude)
    } else if (entry.isFile()) {
      const relative = path.relative(workspacePath, fullPath)
      if (minimatch(relative, pattern, { matchBase: true })) {
        results.push(relative)
      }
    }
  }
}

// 设置会话标题工具
export const setTitleTool: ToolHandler = {
  definition: {
    type: 'function',
    function: {
      name: 'set_title',
      description: '为当前对话设置一个简短的标题（最多6个词）。在对话开始时应该尽早调用此工具来为会话命名。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '简洁的对话标题，不超过6个词' }
        },
        required: ['title']
      }
    }
  },
  permission: 'safe',
  async execute(args, ctx: ToolContext) {
    const title = (args.title as string || '').trim().slice(0, 50)
    if (!title) return 'Error: title is required'
    const sid = ctx.sessionId
    if (sid) {
      updateSessionTitle(sid, title)
      mainWindow?.webContents.send('session:title_updated', { sessionId: sid, title })
      return `Session title set to: ${title}`
    }
    return `Title suggestion: ${title} (no active session context)`
  }
}
// 导出所有内置工具
export const builtinTools: { name: string; handler: ToolHandler }[] = [
  { name: 'read', handler: readTool },
  { name: 'write', handler: writeTool },
  { name: 'edit', handler: editTool },
  { name: 'bash', handler: bashTool },
  { name: 'grep', handler: grepTool },
  { name: 'glob', handler: globTool },
  { name: 'ls', handler: lsTool },
  { name: 'set_title', handler: setTitleTool }
]
