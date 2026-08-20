// ============================================================
// IPC 处理层 — 主进程侧
// 所有来自渲染进程的请求在这里注册
// ============================================================
import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import type { AppSettings, ChatMessage, UserMessageInput, AutoApproveMode } from '../../shared/types'
import { buildUserContent } from '../../shared/multimodal'
import * as db from '../store/db'
import { runAgent, setSkillsPromptGetter } from '../agent/runner'
import { autoCompact } from '../agent/context'
import { sanitizeHistory } from '../agent/history'
import { log } from '../llm/logger'
import { registerTool, clearTools } from '../tools/registry'
import { builtinTools } from '../tools/builtin'
import { browserTools } from '../tools/browser'
import { memoryTools } from '../tools/memory'
import { desktopTools } from '../tools/desktop'
import { reconnectAllMcpServers, connectMcpServer, disconnectMcpServer } from '../mcp/client'
import { reloadSkills, getSkillsSystemPrompt } from '../skill/manager'
import { getMemories, deleteMemory, clearAllMemories, updateMemoryImportance } from '../store/db'
import { buildAgentCallbacks, buildPermissionCheck } from './agentCallbacks'
import { genId } from './agentCallbacks'

let mainWindow: BrowserWindow | null = null

// 活跃的 abort 控制器，按 sessionId 区分
const abortControllers = new Map<string, AbortController>()

// 权限回调队列（按 permId 等待用户响应）
const pendingPermissions = new Map<string, { resolve: (ok: boolean) => void }>()

// 批准模式（按 sessionId 动态存储，运行中可实时切换）
const approveModeMap = new Map<string, AutoApproveMode>()

/** 获取某会话的批准模式（未设置时默认 manual） */
function getApproveMode(sessionId: string): AutoApproveMode {
  return approveModeMap.get(sessionId) || 'manual'
}

export function setupIpc(win: BrowserWindow): void {
  mainWindow = win

  // ============================================================
  // 窗口控制（无边框自定义标题栏）
  // ============================================================
  ipcMain.handle('window:minimize', () => {
    win.minimize()
  })
  ipcMain.handle('window:toggle-maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', () => {
    win.close()
  })
  ipcMain.handle('window:is-maximized', () => win.isMaximized())
  win.on('maximize', () => win.webContents.send('window:maximized-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-change', false))

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
  // 注册桌面控制工具
  for (const { name, handler } of desktopTools) {
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
    approveModeMap.delete(id)
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
  ipcMain.handle('agent:run', async (e, sessionId: string, userMessage: UserMessageInput, options?: { providerId?: string; modelOverride?: string; approveMode?: AutoApproveMode }) => {
    // 只接受合法的 data URL 图片（渲染进程已过滤，这里二次防御）
    const inputImages = (userMessage.images || []).filter(u => typeof u === 'string' && u.startsWith('data:image/'))
    // 初始化批准模式（renderer 传入的值作为初始值，之后通过 agent:set-approve-mode 动态更新）
    if (options?.approveMode) {
      approveModeMap.set(sessionId, options.approveMode)
    }
    log('info', `agent:run — sessionId=${sessionId}, approveMode=${getApproveMode(sessionId)}, providerId=${options?.providerId || '(active)'}, modelOverride=${options?.modelOverride || '(default)'}, images=${inputImages.length}`)
    const settings = db.getSettings()
    // 优先用 options.providerId（聊天页下拉框选择），否则用 settings.activeProviderId
    const providerId = options?.providerId || settings.activeProviderId
    const provider = settings.providers.find(p => p.id === providerId)
    if (!provider) {
      return { error: 'No active provider. Please configure one in Settings.' }
    }

    // 保存用户消息
    db.addMessage({
      id: genId(),
      sessionId,
      role: 'user',
      content: userMessage.text,
      images: inputImages.length > 0 ? inputImages : undefined,
      timestamp: Date.now(),
      status: 'done'
    })

    // 获取历史消息
    const history = db.getMessages(sessionId)
    // 清洗 abort/崩溃遗留的非法序列（孤儿 tool 结果、不完整的 tool_call 组）
    const chatMessages: ChatMessage[] = sanitizeHistory(history.map(m => ({
      role: m.role,
      // 带图片的 user 消息组装为多模态 ContentPart[]（LLM 可见图片）
      content: m.role === 'user' && m.images && m.images.length > 0
        ? buildUserContent(m.content, m.images)
        : m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
      name: m.toolName
    })))

    // 构建回调（流式 token / 工具调用 / DB 持久化）
    const { callbacks } = buildAgentCallbacks(sessionId, e.sender)

    // 构建权限检查闭包 — 使用动态 getter，运行中切换模式即时生效
    const permissionCheck = buildPermissionCheck(
      sessionId,
      () => getApproveMode(sessionId),
      e.sender,
      pendingPermissions
    )

    const abortController = new AbortController()
    abortControllers.set(sessionId, abortController)

    try {
      // 获取 session 的工作目录（优先用 session 的，没有再用 settings 的默认值）
      const session = db.getSession(sessionId)
      const workspacePath = session?.workspacePath || settings.workspacePath

      await runAgent(
        {
          messages: chatMessages,
          provider,
          workspacePath,
          sessionId,
          permissionCheck,
          signal: abortController.signal,
          modelOverride: options?.modelOverride,
          memoryEnabled: settings.memoryEnabled !== false,
          maxRounds: settings.maxRounds,
          onSessionTitleUpdate: (sid, title) => {
            mainWindow?.webContents.send('session:title_updated', { sessionId: sid, title })
          }
        },
        callbacks
      )
      return { ok: true }
    } catch (err) {
      const msg = (err as Error).message
      // 错误已在 onError 回调中存入 DB，这里只返回错误信息
      return { error: msg }
    } finally {
      abortControllers.delete(sessionId)
      approveModeMap.delete(sessionId)
    }
  })

  // 中止当前对话
  ipcMain.handle('agent:abort', (_e, sessionId: string) => {
    const ctrl = abortControllers.get(sessionId)
    if (ctrl) {
      ctrl.abort()
      abortControllers.delete(sessionId)
    }
    // 清理该会话的悬挂权限请求（以 false resolve，避免内存泄漏）
    for (const [permId, pending] of pendingPermissions) {
      pending.resolve(false)
      pendingPermissions.delete(permId)
    }
    return true
  })

  // 动态切换批准模式（运行中即时生效）
  ipcMain.handle('agent:set-approve-mode', (_e, sessionId: string, mode: AutoApproveMode) => {
    approveModeMap.set(sessionId, mode)
    log('info', `approveMode changed: sessionId=${sessionId}, mode=${mode}`)
    return true
  })

  // 手动压缩上下文（复用 autoCompact 逻辑，压缩后把保留消息写回 DB）
  ipcMain.handle('agent:compact-now', async (e, sessionId: string) => {
    // 运行中不允许手动压缩：workingMessages 与 DB 会不一致
    if (abortControllers.has(sessionId)) {
      return { error: 'Agent is running. Wait for it to finish before compacting.' }
    }

    const settings = db.getSettings()
    const provider = settings.providers.find(p => p.id === settings.activeProviderId)
    if (!provider) {
      return { error: 'No active provider. Please configure one in Settings.' }
    }

    const uiMessages = db.getMessages(sessionId)
    // 与 agent:run 相同的组装：图片转多模态 + sanitize 非法序列
    const chatMessages: ChatMessage[] = sanitizeHistory(uiMessages.map(m => ({
      role: m.role,
      content: m.role === 'user' && m.images && m.images.length > 0
        ? buildUserContent(m.content, m.images)
        : m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
      name: m.toolName
    })))

    try {
      const { messages: compacted, info, keptUiMessages } = await autoCompact(chatMessages, provider, undefined, uiMessages)
      if (info.compressedCount <= 0) {
        return { ok: true, info }
      }

      // 重建会话历史：删除旧消息 → 写入摘要 + 保留的原始消息
      db.deleteMessages(sessionId)
      const summaryMsg = compacted.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[Auto Compact Summary]'))
      if (summaryMsg && typeof summaryMsg.content === 'string') {
        db.addMessage({
          id: genId(),
          sessionId,
          role: 'user',
          content: summaryMsg.content,
          timestamp: Date.now(),
          status: 'done'
        })
      }
      for (const m of keptUiMessages || []) {
        db.addMessage(m)
      }
      // 通知前端展示压缩提示
      e.sender.send('agent:compact', { sessionId, ...info })
      log('info', `Manual compact done: sessionId=${sessionId}, ${info.beforeTokens} → ${info.afterTokens} tokens`)
      return { ok: true, info }
    } catch (err) {
      const msg = (err as Error).message
      log('error', `Manual compact failed: ${msg}`)
      return { error: msg }
    }
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
    const prev = db.getSettings()
    db.saveSettings(settings)
    // 仅当 mcpServers 实际变化时重连 MCP（设置为实时保存，不能每次击键都重连；重试机制下重连代价很高）
    if (JSON.stringify(settings.mcpServers || []) !== JSON.stringify(prev.mcpServers || [])) {
      try {
        await reconnectAllMcpServers(settings.mcpServers)
      } catch (err) {
        console.error('MCP reconnect error:', err)
      }
    }
    // 仅当 skills 实际变化时重新加载
    if (JSON.stringify(settings.skills || []) !== JSON.stringify(prev.skills || [])) {
      try {
        await reloadSkills(settings.skills)
      } catch (err) {
        console.error('Skills reload error:', err)
      }
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
  // Token Usage 查询
  // ============================================================
  ipcMain.handle('token:summary', () => {
    return db.getTokenUsageSummary()
  })

  ipcMain.handle('token:daily', (_e, days?: number) => {
    return db.getTokenUsageDaily(days || 30)
  })

  // ============================================================
  // Session Workspace 更新
  // ============================================================
  ipcMain.handle('session:updateWorkspace', (_e, id: string, workspacePath: string) => {
    db.updateSessionWorkspace(id, workspacePath)
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
