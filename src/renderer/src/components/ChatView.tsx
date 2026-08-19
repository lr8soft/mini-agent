import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FolderOpen, Send, ShieldCheck, ShieldOff, Square } from 'lucide-react'
import { useAppStore } from '../store'
import MessageBubble from './MessageBubble'

export default function ChatView() {
  const { t } = useTranslation()
  const { messages, isRunning, sendMessage, abortAgent, activeSessionId, sessions, settings, selectedProviderModel, setSelectedProviderModel, autoApprove, setAutoApprove } = useAppStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 当前 session 的工作目录
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const workspacePath = activeSession?.workspacePath || settings.workspacePath

  const handleChangeWorkspace = async () => {
    const dir = await window.api.settings.pickDirectory()
    if (dir && activeSessionId) {
      await window.api.session.updateWorkspace(activeSessionId, dir)
      // 重新加载 sessions 列表以更新 workspacePath
      useAppStore.getState().loadSessions()
    }
  }

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

  // 工具调用状态：从工具结果消息按 toolCallId 匹配
  const toolStatuses = useMemo(() => {
    const map: Record<string, 'done' | 'error'> = {}
    for (const m of messages) {
      if (m.role === 'tool' && m.toolCallId) {
        map[m.toolCallId] = m.status === 'error' ? 'error' : 'done'
      }
    }
    return map
  }, [messages])

  // 无活跃会话
  if (!activeSessionId) {
    return (
      <div className="chat-view">
        <div className="chat-messages" style={{ flex: 1 }}>
          <div className="chat-empty">
            <span className="empty-mark"><Bot size={26} /></span>
            <h2>{t('app.name')}</h2>
            <p>{t('chat.createSessionToStart')}</p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => useAppStore.getState().createSession()}>
              {t('chat.newSession')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-view">
      {/* 顶部栏 */}
      <div className="chat-topbar">
        <div className="chat-topbar-left">
          <span className="chat-session-label">{t('chat.session')}</span>
          <span className="chat-session-title">{activeSession?.title || t('chat.newSession')}</span>
          <span className="chat-topbar-sep">|</span>
          <span className="chat-workspace" title={workspacePath}>
            <FolderOpen size={13} />
            <span>{workspacePath}</span>
          </span>
          <button className="chat-workspace-change" onClick={handleChangeWorkspace}>
            {t('chat.changeWorkspace')}
          </button>
        </div>
        <div className="chat-topbar-right">
          {/* 自动批准开关 */}
          <button
            className={autoApprove ? 'toggle-chip active' : 'toggle-chip'}
            onClick={() => setAutoApprove(!autoApprove)}
            title={autoApprove ? t('chat.autoApproveOnHint') : t('chat.autoApproveOffHint')}
          >
            {autoApprove ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
            {autoApprove ? t('chat.autoApproveOn') : t('chat.autoApproveOff')}
          </button>
          {isRunning && (
            <>
              <span className="thinking">
                <span className="pulse-dot" />
                {t('chat.thinking')}
              </span>
              <button className="btn-danger btn-sm" onClick={abortAgent}>
                <Square size={11} />
                {t('chat.stop')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="chat-messages">
        <div className="chat-inner">
          {messages.length === 0 && (
            <div className="chat-empty">
              <span className="empty-mark"><Bot size={26} /></span>
              <h2>{t('app.name')}</h2>
              <p>{t('chat.welcome')}</p>
              <small>{t('chat.welcomeHint')}</small>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} toolStatuses={toolStatuses} />
          ))}
        </div>
      </div>

      {/* 输入区 */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            className="chat-textarea"
            rows={1}
            disabled={isRunning}
          />
          {/* Provider/模型选择下拉框 */}
          <select
            className="model-select"
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
            className="send-button"
            onClick={handleSubmit}
            disabled={!input.trim() || isRunning}
          >
            <Send size={15} />
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}