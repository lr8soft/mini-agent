// ============================================================
// Agent 回调构建器 — 从 IPC handler 中提取的回调与权限逻辑
// ============================================================
import type { BrowserWindow } from 'electron'
import type { AgentEventCallbacks } from '../agent/runner'
import type { TokenUsage } from '../llm/provider'
import type { PermissionLevel } from '../tools/registry'
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
 * 统一决策：根据工具权限等级 + autoApprove 决定是否弹窗
 * - autoApprove=true: 所有工具自动放行（safe/normal/dangerous 全部跳过弹窗）
 * - autoApprove=false:
 *   - safe:      永远自动放行
 *   - normal:    弹窗确认
 *   - dangerous: 弹窗确认
 */
export function buildPermissionCheck(
  sessionId: string,
  autoApprove: boolean,
  sender: Electron.WebContents,
  pendingPermissions: Map<string, { resolve: (ok: boolean) => void }>
): (toolName: string, args: Record<string, unknown>) => Promise<boolean> {
  return async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    const level: PermissionLevel = getToolPermission(toolName)

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
      sender.send('agent:permission_request', {
        sessionId, permId, toolName, args
      })
    })
  }
}
