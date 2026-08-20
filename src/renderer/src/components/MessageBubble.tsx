import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { ChevronDown, ChevronUp, Terminal, Wrench, XCircle } from 'lucide-react'
import type { UIMessage, ToolCall } from '@shared/types'
import { useAppStore } from '../store'

interface Props {
  message: UIMessage
  /** 工具调用状态（按 toolCall.id 索引，由 ChatView 计算） */
  toolStatuses?: Record<string, 'done' | 'error'>
}

export default function MessageBubble({ message, toolStatuses }: Props) {
  const { t } = useTranslation()
  const retryStatus = useAppStore(s => s.retryStatus)

  // 用户消息（可含图片附件）
  if (message.role === 'user') {
    return (
      <div className="message-user">
        {message.images && message.images.length > 0 && (
          <div className="message-user-images">
            {message.images.map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" />
            ))}
          </div>
        )}
        {message.content && <div className="bubble">{message.content}</div>}
      </div>
    )
  }

  // 工具结果消息
  if (message.role === 'tool') {
    return <ToolResultBlock toolName={message.toolName || message.toolCallId || ''} content={message.content} isError={message.status === 'error'} />
  }

  // 助手消息（可能包含 toolCalls）
  return (
    <div className="message-assistant">
      {/* 头部 */}
      <div className="assistant-head">
        <span className="assistant-name"><img className="assistant-logo" src="./logo.png" alt="" />{t('app.name')}</span>
        {message.status === 'streaming' && <span className="pulse-dot" />}
        {message.status === 'error' && (
          <span className="assistant-status error">{t('message.error')}</span>
        )}
      </div>

      {/* 内容 */}
      {message.status === 'thinking' ? (
        <div className="thinking-line">
          <span className="spinner" />
          {retryStatus
            ? t('chat.retrying', { attempt: retryStatus.failedAttempt, max: retryStatus.maxRetries < 0 ? '∞' : retryStatus.maxRetries })
            : t('chat.thinking')}
        </div>
      ) : message.content ? (
        <div className="markdown-body">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      ) : null}

      {/* 工具调用列表 */}
      {message.toolCalls?.map(tc => (
        <ToolCallRow key={tc.id} toolCall={tc} status={toolStatuses?.[tc.id]} />
      ))}
    </div>
  )
}

/* ---------- 工具调用行 ---------- */
function ToolCallRow({ toolCall, status }: { toolCall: ToolCall; status?: 'done' | 'error' }) {
  const statusClass = status === 'done' ? 'done' : status === 'error' ? 'error' : ''
  return (
    <div className={`tool-call-row ${statusClass}`}>
      <span className="dot" />
      <Wrench size={12} />
      <span className="tool-call-name">{toolCall.function.name}</span>
      <span className="tool-call-args" title={toolCall.function.arguments}>
        {toolCall.function.arguments}
      </span>
    </div>
  )
}

/* ---------- 工具结果块 ---------- */
function ToolResultBlock({ toolName, content, isError }: { toolName: string; content: string; isError: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const long = content.length > 500

  return (
    <div className={`tool-result ${isError ? 'error' : ''}`}>
      <div className="tool-result-header">
        <span className="tool-result-title">
          {isError ? <XCircle size={12} /> : <Terminal size={12} />}
          {toolName}
        </span>
        {long && (
          <button className="tool-result-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? t('message.collapse') : t('message.expand')}
            {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        )}
      </div>
      <pre className="tool-result-body">{expanded || !long ? content : content.slice(0, 500) + '...'}</pre>
    </div>
  )
}