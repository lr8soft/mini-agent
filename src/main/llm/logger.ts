// ============================================================
// 日志模块 — 解耦 Electron Window 依赖
// 用 EventEmitter 模式替代直接导入 mainWindow
// ============================================================
import { EventEmitter } from 'node:events'

interface LogEvent {
  level: 'info' | 'warn' | 'error'
  msg: string
  ts: string
}

const emitter = new EventEmitter()
emitter.setMaxListeners(50) // 防止内存泄漏警告

/**
 * 发送日志。所有业务模块调用此函数。
 * 不直接依赖 Electron Window，由调用方（index.ts）注册 listener 转发到渲染进程。
 */
export function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`)
  emitter.emit('log', { level, msg, ts } satisfies LogEvent)
}

/**
 * 注册日志监听器。通常由主进程入口调用：
 *   onLog(({ level, msg, ts }) => mainWindow?.webContents.send('agent:log', { level, msg, ts }))
 */
export function onLog(listener: (event: LogEvent) => void): () => void {
  emitter.on('log', listener)
  return () => emitter.off('log', listener)
}
