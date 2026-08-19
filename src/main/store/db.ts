// ============================================================
// SQLite 会话持久化
// ============================================================
import Database from 'better-sqlite3'
import * as path from 'node:path'
import { app } from 'electron'
import type { Session, UIMessage, AppSettings } from '../../shared/types'

let db: Database.Database | null = null

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'mini-agent.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Session',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      timestamp INTEGER NOT NULL,
      status TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

// ============================================================
// Session 操作
// ============================================================

export function createSession(title = 'New Session'): Session {
  const id = genId()
  const now = Date.now()
  db!.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, title, now, now)
  return { id, title, createdAt: now, updatedAt: now, messageCount: 0 }
}

export function getSessions(): Session[] {
  const rows = db!.prepare(`
    SELECT s.*, COUNT(m.id) as msg_count
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all() as any[]
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.msg_count
  }))
}

export function getSession(id: string): Session | null {
  const row = db!.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
  if (!row) return null
  const msgCount = (db!.prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get(id) as any).c
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: msgCount
  }
}

export function updateSessionTitle(id: string, title: string): void {
  db!.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id)
}

export function deleteSession(id: string): void {
  db!.prepare('DELETE FROM messages WHERE session_id = ?').run(id)
  db!.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function touchSession(id: string): void {
  db!.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

// ============================================================
// Message 操作
// ============================================================

export function addMessage(msg: UIMessage): void {
  db!.prepare(`
    INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, tool_name, timestamp, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.id, msg.sessionId, msg.role, msg.content,
    msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    msg.toolCallId, msg.toolName, msg.timestamp, msg.status || null
  )
  touchSession(msg.sessionId)
}

export function getMessages(sessionId: string): UIMessage[] {
  const rows = db!.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId) as any[]
  return rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content || '',
    toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
    toolCallId: r.tool_call_id,
    toolName: r.tool_name,
    timestamp: r.timestamp,
    status: r.status
  }))
}

export function updateMessageContent(id: string, content: string, status?: string): void {
  if (status) {
    db!.prepare('UPDATE messages SET content = ?, status = ? WHERE id = ?').run(content, status, id)
  } else {
    db!.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id)
  }
}

// ============================================================
// Settings 操作
// ============================================================

export function getSettings(): AppSettings {
  const row = db!.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as any
  if (row) {
    try { return JSON.parse(row.value) }
    catch { /* fall through to default */ }
  }
  return defaultSettings()
}

export function saveSettings(settings: AppSettings): void {
  db!.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('app_settings', JSON.stringify(settings))
}

function defaultSettings(): AppSettings {
  return {
    providers: [],
    mcpServers: [],
    skills: [],
    activeProviderId: null,
    workspacePath: app.getPath('home')
  }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
