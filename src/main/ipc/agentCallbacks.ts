// ============================================================
// Agent 回调构建器 — 从 IPC handler 中提取的回调与权限逻辑
// ============================================================
import type { BrowserWindow } from 'electron'
import type { AgentEventCallbacks } from '../agent/runner'
import type { TokenUsage } from '../llm/provider'
import type { PermissionLevel } from '../tools/registry'
import type { AutoApproveMode } from '../../shared/types'
import { getToolPermission } from '../tools/registry'
import * as db from '../store/db'
import { log } from '../llm/logger'

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * 构建 Agent 事件回调对象
 * 将流式 token、工具调用、工具结果、assistant 消息等事件转发到前端 + 存入 DB
 */
export function buildAgentCallbacks(
  sessionId: string,
  sender: Electron.WebContents
): {
  callbacks: AgentEventCallbacks
  getStreamingMsgId: () => string | null
  getStreamingContent: () => string
} {
  let streamingMsgId: string | null = null
  let streamingContent = ''

  const callbacks: AgentEventCallbacks = {
    onToken: (token) => {
      streamingContent += token
      sender.send('agent:token', { sessionId, messageId: streamingMsgId || '', token })
    },
    onToolCall: (toolCall) => {
      sender.send('agent:tool_call', { sessionId, toolCall })
    },
    onToolResult: (toolCallId, toolName, result, isError, durationMs) => {
      const toolMsg = {
        id: genId(),
        sessionId,
        role: 'tool' as const,
        content: result,
        toolCallId,
        toolName,
        timestamp: Date.now(),
        status: isError ? ('error' as const) : ('done' as const)
      }
      db.addMessage(toolMsg)
      sender.send('agent:tool_result', { sessionId, toolCallId, toolName, result, isError, durationMs })
    },
    onAssistantMessage: (content, toolCalls) => {
      const msgId = genId()
      const msg = {
        id: msgId,
        sessionId,
        role: 'assistant' as const,
        content: content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: Date.now(),
        status: 'done' as const
      }
      db.addMessage(msg)
      streamingMsgId = msgId
      streamingContent = content || ''
    },
    onTokenUsage: (usage: TokenUsage, model: string) => {
      db.addTokenUsage({
        sessionId,
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        createdAt: Date.now()
      })
    },
    onComplete: () => {
      // 如果最后一轮没有 toolCalls（纯文本回复），onAssistantMessage 已存
      // 如果 onAssistantMessage 没被调用（空回复），补存一条
      if (!streamingMsgId) {
        const msgId = genId()
        db.addMessage({
          id: msgId,
          sessionId,
          role: 'assistant',
          content: streamingContent || '',
          timestamp: Date.now(),
          status: 'done'
        })
      }
      sender.send('agent:complete', { sessionId, messageId: streamingMsgId || '', content: streamingContent })
    },
    onError: (error) => {
      if (!streamingMsgId) {
        db.addMessage({
          id: genId(),
          sessionId,
          role: 'assistant',
          content: streamingContent || `Error: ${error.message}`,
          timestamp: Date.now(),
          status: 'error'
        })
      }
      sender.send('agent:error', { sessionId, error: error.message })
    },
    onRetry: (failedAttempt, maxRetries) => {
      sender.send('agent:retry', { sessionId, failedAttempt, maxRetries })
    }
  }

  return {
    callbacks,
    getStreamingMsgId: () => streamingMsgId,
    getStreamingContent: () => streamingContent
  }
}

/**
 * 构建权限检查闭包
 *
 * 三档批准模式：
 * - manual: safe 放行，normal + dangerous 弹窗
 * - auto:   safe + normal 放行，dangerous 弹窗
 * - full:   全部放行，不弹窗
 *
 * 注意：approveModeGetter 是函数而非固定值，
 * 这样渲染进程运行中切换模式时 main 进程能实时感知。
 */
export function buildPermissionCheck(
  sessionId: string,
  approveModeGetter: () => AutoApproveMode,
  sender: Electron.WebContents,
  pendingPermissions: Map<string, { resolve: (ok: boolean) => void }>
): (toolName: string, args: Record<string, unknown>) => Promise<boolean> {
  return async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    const level: PermissionLevel = getToolPermission(toolName)
    const mode = approveModeGetter()

    // full 模式：全部放行
    if (mode === 'full') {
      return true
    }

    // safe 工具在所有模式下都放行
    if (level === 'safe') {
      return true
    }

    // auto 模式：normal 也放行，仅 dangerous 需要弹窗
    if (mode === 'auto' && level === 'normal') {
      return true
    }

    // 到达这里 = 需要弹窗确认：
    //   manual 模式的 normal + dangerous
    //   auto 模式的 dangerous
    const permId = genId()
    log('info', `Permission dialog needed: tool=${toolName}, level=${level}, mode=${mode}, permId=${permId}`)
    return new Promise<boolean>((resolve) => {
      pendingPermissions.set(permId, { resolve })
      sender.send('agent:permission_request', {
        sessionId, permId, toolName, args, level
      })
    })
  }
}
