import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import MessageBubble from './MessageBubble'

export default function ChatView() {
  const { t } = useTranslation()
  const { messages, isRunning, sendMessage, abortAgent, activeSessionId, sessions, settings, selectedProviderModel, setSelectedProviderModel, autoApprove, setAutoApprove } = useAppStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N 新建会话
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        useAppStore.getState().createSession()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || isRunning) return
    sendMessage(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 无活跃会话
  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        <div className="text-center">
          <p className="text-2xl mb-3">⌬</p>
          <p className="mb-4">{t('chat.createSessionToStart')}</p>
          <button onClick={() => useAppStore.getState().createSession()} className="btn-primary">
            {t('chat.newSession')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-panel/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{t('chat.session')}</span>
          <span className="text-sm text-text-primary truncate max-w-xs">
            {sessions.find(s => s.id === activeSessionId)?.title || t('chat.newSession')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* 自动批准开关 */}
          <button
            onClick={() => setAutoApprove(!autoApprove)}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
              autoApprove
                ? 'bg-accent/20 border-accent text-accent-glow'
                : 'border-border text-text-muted hover:text-text-primary'
            }`}
            title={autoApprove ? t('chat.autoApproveOnHint') : t('chat.autoApproveOffHint')}
          >
            {autoApprove ? t('chat.autoApproveOn') : t('chat.autoApproveOff')}
          </button>
          {isRunning && (
            <>
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs text-text-muted">{t('chat.thinking')}</span>
              <button onClick={abortAgent} className="btn-danger text-xs">{t('chat.stop')}</button>
            </>
          )}
        </div>
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-20">
            <p className="text-3xl mb-4">⌬</p>
            <p className="text-base font-medium text-text-primary mb-2">{t('app.name')}</p>
            <p>{t('chat.welcome')}</p>
            <p className="mt-1 text-xs">{t('chat.welcomeHint')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* 输入区 */}
      <div className="border-t border-border bg-bg-panel p-4">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            className="input-field flex-1 resize-none min-h-[42px] max-h-[200px] font-mono text-sm"
            rows={1}
            disabled={isRunning}
          />
          {/* Provider/模型选择下拉框 */}
          <select
            className="input-field h-[42px] text-sm min-w-[140px]"
            value={selectedProviderModel || ''}
            onChange={(e) => setSelectedProviderModel(e.target.value || null)}
            title={t('chat.selectModelHint')}
          >
            <option value="">{t('chat.defaultModel')}</option>
            {settings.providers
              .filter(p => p.enabled)
              .map(p => (
                <optgroup key={p.id} label={p.name}>
                  <option value={`${p.id}::${p.defaultModel}`}>{p.defaultModel} {t('chat.modelDefaultSuffix')}</option>
                </optgroup>
              ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isRunning}
            className="btn-primary h-[42px] px-5"
          >
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}
