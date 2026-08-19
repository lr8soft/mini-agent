// ============================================================
// IPC 处理层 — 主进程侧
// 所有来自渲染进程的请求在这里注册
// ============================================================
import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import type { AppSettings, ChatMessage } from '../../shared/types'
import * as db from '../store/db'
import { runAgent, setSkillsPromptGetter, type AgentEventCallbacks } from '../agent/runner'
import { log } from '../llm/provider'
import { registerTool, clearTools } from '../tools/registry'
import { builtinTools } from '../tools/builtin'
import { browserTools } from '../tools/browser'
import { memoryTools } from '../tools/memory'
import { getToolPermission, type PermissionLevel } from '../tools/registry'
import { reconnectAllMcpServers, connectMcpServer, disconnectMcpServer } from '../mcp/client'
import { reloadSkills, getSkillsSystemPrompt } from '../skill/manager'
import { getMemories, deleteMemory, clearAllMemories, updateMemoryImportance } from '../store/db'

let mainWindow: BrowserWindow | null = null

// 活跃的 abort 控制器，按 sessionId 区分
const abortControllers = new Map<string, AbortController>()

// 权限回调队列（按 toolCallId 等待用户响应）
const pendingPermissions = new Map<string, { resolve: (ok: boolean) => void }>()

export function setupIpc(win: BrowserWindow): void {
  mainWindow = win

  // 注册内置工具
  clearTools()
  for (const { name, handler } of builtinTools) {
    registerTool(name, handler, 'builtin')
  }
  // 注册浏览器工具
  for (const { name, handler } of browserTools) {
    registerTool(name, handler, 'builtin')
  }
  // 注册记忆工具
  for (const { name, handler } of memoryTools) {
    registerTool(name, handler, 'builtin')
  }

  // Skill prompt getter
  setSkillsPromptGetter(() => getSkillsSystemPrompt())

  // ============================================================
  // Session 管理
  // ============================================================
  ipcMain.handle('session:create', (_e, title?: string) => {
    return db.createSession(title)
  })

  ipcMain.handle('session:list', () => {
    return db.getSessions()
  })

  ipcMain.handle('session:get', (_e, id: string) => {
    return db.getSession(id)
  })

  ipcMain.handle('session:delete', (_e, id: string) => {
    db.deleteSession(id)
    return true
  })

  ipcMain.handle('session:rename', (_e, id: string, title: string) => {
    db.updateSessionTitle(id, title)
    return true
  })

  ipcMain.handle('session:messages', (_e, id: string) => {
    return db.getMessages(id)
  })

  // ============================================================
  // Agent 对话
  // ============================================================
  ipcMain.handle('agent:run', async (e, sessionId: string, userMessage: string, options?: { modelOverride?: string; autoApprove?: boolean }) => {
    log('info', `agent:run — sessionId=${sessionId}, autoApprove=${options?.autoApprove}, modelOverride=${options?.modelOverride || '(default)'}`)
    const settings = db.getSettings()
    const provider = settings.providers.find(p => p.id === settings.activeProviderId)
    if (!provider) {
      return { error: 'No active provider. Please configure one in Settings.' }
    }

    // 保存用户消息
    const userMsg = {
      id: genId(),
      sessionId,
      role: 'user' as const,
      content: userMessage,
      timestamp: Date.now(),
      status: 'done' as const
    }
    db.addMessage(userMsg)

    // 获取历史消息
    const history = db.getMessages(sessionId)
    const chatMessages: ChatMessage[] = history.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
      name: m.toolName
    }))

    // 创建空白 assistant 消息（用于流式更新）
    const assistantMsgId = genId()
    const assistantMsg = {
      id: assistantMsgId,
      sessionId,
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
      status: 'streaming' as const
    }
    db.addMessage(assistantMsg)

    const abortController = new AbortController()
    abortControllers.set(sessionId, abortController)

    const callbacks: AgentEventCallbacks = {
      onToken: (token) => {
        // 延迟数据库写入，只在内存里更新，最终写一次
        assistantMsg.content += token
        e.sender.send('agent:token', { sessionId, messageId: assistantMsgId, token })
      },
      onToolCall: (toolCall) => {
        // 通知前端显示工具调用
        e.sender.send('agent:tool_call', { sessionId, toolCall })
      },
      onToolResult: (toolCallId, result, isError, durationMs) => {
        // 保存工具结果消息到 DB
        const toolMsg = {
          id: genId(),
          sessionId,
          role: 'tool' as const,
          content: result,
          toolCallId,
          toolName: toolCallId, // 简化处理
          timestamp: Date.now(),
          status: isError ? 'error' : 'done' as const
        }
        db.addMessage(toolMsg)
        e.sender.send('agent:tool_result', { sessionId, toolCallId, result, isError, durationMs })
      },
      onAssistantMessage: (content, toolCalls) => {
        // 如果有 toolCalls，更新 assistant 消息以反映
        if (toolCalls.length > 0) {
          assistantMsg.toolCalls = toolCalls
        }
      },
      onComplete: () => {
        // 最终写入数据库
        db.updateMessageContent(assistantMsgId, assistantMsg.content, 'done')
        e.sender.send('agent:complete', { sessionId, messageId: assistantMsgId, content: assistantMsg.content })
        abortControllers.delete(sessionId)
      },
      onError: (error) => {
        db.updateMessageContent(assistantMsgId, assistantMsg.content || `Error: ${error.message}`, 'error')
        e.sender.send('agent:error', { sessionId, error: error.message })
        abortControllers.delete(sessionId)
      }
    }

    // 权限检查回调 — 统一决策：根据工具权限等级 + autoApprove 决定是否弹窗
    // autoApprove=true: 所有工具自动放行（safe/normal/dangerous 全部跳过弹窗）
    // autoApprove=false:
    //   safe:      永远自动放行
    //   normal:    弹窗确认
    //   dangerous: 弹窗确认
    const permissionCheck = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
      const level: PermissionLevel = getToolPermission(toolName)
      const autoApprove = options?.autoApprove === true

      // safe 工具永远放行
      if (level === 'safe') {
        return true
      }

      // autoApprove 开启时，所有工具（包括 dangerous）自动放行
      if (autoApprove) {
        return true
      }

      // normal 或 dangerous，且未开启 autoApprove → 弹窗确认
      const permId = genId()
      return new Promise<boolean>((resolve) => {
        pendingPermissions.set(permId, { resolve })
        e.sender.send('agent:permission_request', {
          sessionId, permId, toolName, args
        })
      })
    }

    try {
      await runAgent(
        {
          messages: chatMessages,
          provider,
          workspacePath: settings.workspacePath,
          sessionId,
          permissionCheck,
          signal: abortController.signal,
          modelOverride: options?.modelOverride,
          memoryEnabled: settings.memoryEnabled !== false
        },
        callbacks
      )
      return { ok: true, assistantMessageId: assistantMsgId }
    } catch (err) {
      const msg = (err as Error).message
      db.updateMessageContent(assistantMsgId, assistantMsg.content || `Error: ${msg}`, 'error')
      return { error: msg }
    }
  })

  // 中止当前对话
  ipcMain.handle('agent:abort', (_e, sessionId: string) => {
    const ctrl = abortControllers.get(sessionId)
    if (ctrl) {
      ctrl.abort()
      abortControllers.delete(sessionId)
    }
    return true
  })

  // 权限响应
  ipcMain.handle('agent:permission_response', (_e, permId: string, allowed: boolean) => {
    const pending = pendingPermissions.get(permId)
    if (pending) {
      pending.resolve(allowed)
      pendingPermissions.delete(permId)
    }
    return true
  })

  // ============================================================
  // Settings 管理
  // ============================================================
  ipcMain.handle('settings:get', () => {
    return db.getSettings()
  })

  ipcMain.handle('settings:save', async (_e, settings: AppSettings) => {
    db.saveSettings(settings)
    // 重新连接 MCP（失败不阻塞保存）
    try {
      await reconnectAllMcpServers(settings.mcpServers)
    } catch (err) {
      console.error('MCP reconnect error:', err)
    }
    // 重新加载 Skills（失败不阻塞保存）
    try {
      await reloadSkills(settings.skills)
    } catch (err) {
      console.error('Skills reload error:', err)
    }
    return true
  })

  ipcMain.handle('settings:pickDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('settings:pickFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Skill files', extensions: ['md'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
    return true
  })

  // ============================================================
  // Memory 管理 — longterm-skill
  // ============================================================
  ipcMain.handle('memory:list', (_e, options?: { category?: string; search?: string; limit?: number }) => {
    return getMemories({
      category: options?.category as any,
      search: options?.search,
      limit: options?.limit
    })
  })

  ipcMain.handle('memory:delete', (_e, id: string) => {
    deleteMemory(id)
    return true
  })

  ipcMain.handle('memory:clearAll', () => {
    clearAllMemories()
    return true
  })

  ipcMain.handle('memory:updateImportance', (_e, id: string, importance: number) => {
    updateMemoryImportance(id, importance)
    return true
  })

  // ============================================================
  // MCP 管理
  // ============================================================
  ipcMain.handle('mcp:connect', async (_e, config) => {
    try {
      await connectMcpServer(config)
      return { ok: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('mcp:disconnect', async (_e, id: string) => {
    await disconnectMcpServer(id)
    return true
  })
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
