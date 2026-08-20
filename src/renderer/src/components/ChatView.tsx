import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, ImagePlus, Send, ShieldCheck, ShieldOff, Square, X } from 'lucide-react'
import { processImageFile, ImageAttachmentError, MAX_IMAGES } from '../utils/image'
import { useAppStore } from '../store'
import MessageBubble from './MessageBubble'

export default function ChatView() {
  const { t } = useTranslation()
  const { messages, isRunning, retryStatus, sendMessage, abortAgent, activeSessionId, sessions, settings, selectedProviderModel, setSelectedProviderModel, autoApprove, setAutoApprove } = useAppStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 待发送的图片附件（base64 data URL，发送前暂存在输入区预览）
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  }, [messages, retryStatus])

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

  // 切换会话时清空未发送的附件（它们不属于新会话）
  useEffect(() => {
    setPendingImages([])
    setImageError(null)
  }, [activeSessionId])

  const handleSubmit = () => {
    const text = input.trim()
    if ((!text && pendingImages.length === 0) || isRunning) return
    sendMessage(text, pendingImages.length > 0 ? [...pendingImages] : undefined)
    setInput('')
    setPendingImages([])
    setImageError(null)
  }

  /** 添加图片附件（粘贴 / 拖放 / 文件选择，统一入口；内部做类型、大小、缩放校验） */
  const addImages = async (files: File[]) => {
    if (isRunning) return
    const room = MAX_IMAGES - pendingImages.length
    if (room <= 0) {
      setImageError(t('chat.imageLimit', { max: MAX_IMAGES }))
      return
    }
    setImageError(null)
    const processed: string[] = []
    for (const file of files.slice(0, room)) {
      try {
        processed.push(await processImageFile(file))
      } catch (err) {
        const code = err instanceof ImageAttachmentError ? err.code : 'decode-failed'
        const errorKey = {
          'unsupported-type': 'chat.imageErrorUnsupported',
          'too-large': 'chat.imageErrorTooLarge',
          'decode-failed': 'chat.imageErrorDecode'
        }[code]
        setImageError(t(errorKey))
        break
      }
    }
    if (processed.length > 0) {
      setPendingImages(prev => [...prev, ...processed])
    }
  }

  /** 粘贴图片（如截图） */
  const handlePaste = (e: React.ClipboardEvent) => {
    if (isRunning) return
    const files: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      void addImages(files)
    }
  }

  /** 拖放图片 */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (isRunning) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) void addImages(files)
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
            <img className="empty-mark" src="./logo.png" alt="" />
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
              <img className="empty-mark" src="./logo.png" alt="" />
              <h2>{t('app.name')}</h2>
              <p>{t('chat.welcome')}</p>
              <small>{t('chat.welcomeHint')}</small>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} toolStatuses={toolStatuses} />
          ))}
          {/* 重试状态行（思考占位已被移除时显示，如工具轮之间的重试） */}
          {retryStatus && isRunning && !messages.some(m => m.status === 'thinking') && (
            <div className="retry-status">
              <span className="spinner" />
              <span>{t('chat.retrying', { attempt: retryStatus.failedAttempt, max: retryStatus.maxRetries < 0 ? '∞' : retryStatus.maxRetries })}</span>
            </div>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div className="chat-input-area">
        {/* 图片附件预览 */}
        {pendingImages.length > 0 && (
          <div className="chat-image-previews">
            {pendingImages.map((src, i) => (
              <span key={i} className="chat-image-preview">
                <img src={src} alt="" />
                <button
                  className="chat-image-remove"
                  title={t('chat.removeImage')}
                  onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {imageError && <p className="chat-image-error">{imageError}</p>}
        <div className="chat-input-row" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <button
            className="attach-button"
            title={t('chat.attachImage')}
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning || pendingImages.length >= MAX_IMAGES}
          >
            <ImagePlus size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="attach-file-input"
            onChange={(e) => {
              if (e.target.files) void addImages(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
            disabled={(!input.trim() && pendingImages.length === 0) || isRunning}
          >
            <Send size={15} />
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}