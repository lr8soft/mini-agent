import React from 'react'
import { useTranslation } from 'react-i18next'
import type { UIMessage } from '@shared/types'
import ReactMarkdown from 'react-markdown'

interface Props {
  message: UIMessage
}

export default function MessageBubble({ message }: Props) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  return (
    <div className={`mb-4 ${isUser ? 'flex justify-end' : ''}`}>
      {/* 用户消息 */}
      {isUser && (
        <div className="max-w-[85%] bg-accent/10 border border-accent/20 rounded-2xl rounded-br-sm px-4 py-2.5">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      )}

      {/* 工具调用展示 */}
      {hasToolCalls && (
        <div className="mb-2">
          {message.toolCalls!.map((tc) => (
            <div key={tc.id} className="flex items-center gap-2 text-xs text-text-muted py-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-glow animate-pulse" />
              <span className="font-mono text-accent-glow">{tc.function.name}</span>
              <span className="truncate max-w-xs opacity-60">
                {tc.function.arguments.slice(0, 100)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 工具结果 */}
      {isTool && (
        <div className="mb-2">
          <ToolResultBubble message={message} />
        </div>
      )}

      {/* 助手消息 */}
      {!isUser && !isTool && message.content && (
        <div className="max-w-[90%]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-accent-glow">{t('app.name')}</span>
            {message.status === 'streaming' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            )}
            {message.status === 'error' && (
              <span className="text-err text-xs">{t('message.error')}</span>
            )}
          </div>
          <div className="markdown-body">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolResultBubble({ message }: { message: UIMessage }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  const lines = message.content.split('\n')
  const isLong = lines.length > 8
  const displayContent = isLong && !expanded
    ? lines.slice(0, 8).join('\n') + '\n...'
    : message.content

  return (
    <div className="bg-bg-card border border-border rounded-lg overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-hover/50 border-b border-border">
        <span className="font-mono text-text-muted">{message.toolCallId || 'tool'}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {isLong ? (expanded ? t('message.collapse') : t('message.expand')) : ''}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-text-secondary max-h-[400px] font-mono whitespace-pre-wrap">
        {displayContent}
      </pre>
    </div>
  )
}
