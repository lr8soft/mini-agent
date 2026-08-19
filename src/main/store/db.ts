// ============================================================
// SQLite 会话持久化
// ============================================================
import Database from 'better-sqlite3'
import * as path from 'node:path'
import { app } from 'electron'
import type { Session, UIMessage, AppSettings, MemoryEntry, MemoryCategory } from '../../shared/types'

let db: Database.Database | null = null

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'mini-agent.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      source_session_id TEXT,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_entries(category);
    CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_entries(importance DESC);

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
  `)

  // 迁移：给 sessions 加 workspace_path 列（如果不存在）
  const columns = db!.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]
  if (!columns.some(c => c.name === 'workspace_path')) {
    db!.exec('ALTER TABLE sessions ADD COLUMN workspace_path TEXT')
  }
}

// ============================================================
// Session 操作
// ============================================================

export function createSession(title = 'New Session', workspacePath?: string): Session {
  const id = genId()
  const now = Date.now()
  db!.prepare('INSERT INTO sessions (id, title, created_at, updated_at, workspace_path) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, now, now, workspacePath || null)
  return { id, title, createdAt: now, updatedAt: now, messageCount: 0, workspacePath }
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
    messageCount: r.msg_count,
    workspacePath: r.workspace_path || undefined
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
    messageCount: msgCount,
    workspacePath: row.workspace_path || undefined
  }
}

export function updateSessionTitle(id: string, title: string): void {
  db!.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id)
}

export function updateSessionWorkspace(id: string, workspacePath: string): void {
  db!.prepare('UPDATE sessions SET workspace_path = ? WHERE id = ?')
    .run(workspacePath, id)
}

export function deleteSession(id: string): void {
  // 外键级联开启后，删除 session 会自动删除关联的 messages 和 token_usage
  // 但为兼容旧数据库（可能未启用 foreign_keys），手动删除关联数据
  db!.prepare('DELETE FROM token_usage WHERE session_id = ?').run(id)
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
    providers: [
      {
        id: 'zhuminet-default',
        name: '煮米 API',
        baseUrl: 'https://api.zhuminet.com/v1',
        apiKey: '',
        defaultModel: 'gpt-4o',
        enabled: true
      }
    ],
    mcpServers: [],
    skills: [],
    activeProviderId: 'zhuminet-default',
    workspacePath: app.getPath('home'),
    memoryEnabled: true,
    language: 'auto'
  }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ============================================================
// Memory 操作 — longterm-skill
// ============================================================

export function addMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>): MemoryEntry {
  const id = genId()
  const now = Date.now()
  db!.prepare(`
    INSERT INTO memory_entries (id, category, content, importance, source_session_id, created_at, last_accessed, access_count, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, entry.category, entry.content, entry.importance, entry.sourceSessionId, now, now, JSON.stringify(entry.tags || []))
  return { ...entry, id, createdAt: now, lastAccessed: now, accessCount: 0 }
}

export function getMemories(options?: { category?: MemoryCategory; limit?: number; search?: string }): MemoryEntry[] {
  let sql = 'SELECT * FROM memory_entries'
  const params: any[] = []
  const conditions: string[] = []

  if (options?.category) {
    conditions.push('category = ?')
    params.push(options.category)
  }
  if (options?.search) {
    conditions.push('(content LIKE ? OR tags LIKE ?)')
    params.push(`%${options.search}%`, `%${options.search}%`)
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY importance DESC, last_accessed DESC'
  if (options?.limit) {
    sql += ' LIMIT ?'
    params.push(options.limit)
  }

  const rows = db!.prepare(sql).all(...params) as any[]
  return rows.map(r => ({
    id: r.id,
    category: r.category,
    content: r.content,
    importance: r.importance,
    sourceSessionId: r.source_session_id,
    createdAt: r.created_at,
    lastAccessed: r.last_accessed,
    accessCount: r.access_count,
    tags: r.tags ? JSON.parse(r.tags) : []
  }))
}

export function deleteMemory(id: string): void {
  db!.prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
}

export function clearAllMemories(): void {
  db!.prepare('DELETE FROM memory_entries').run()
}

export function touchMemory(id: string): void {
  db!.prepare('UPDATE memory_entries SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?')
    .run(Date.now(), id)
}

export function updateMemoryImportance(id: string, importance: number): void {
  db!.prepare('UPDATE memory_entries SET importance = ? WHERE id = ?').run(importance, id)
}

// ============================================================
// Token Usage 操作
// ============================================================

export interface TokenUsageRecord {
  id: string
  sessionId: string
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: number
}

export function addTokenUsage(record: Omit<TokenUsageRecord, 'id'>): void {
  const id = genId()
  db!.prepare('INSERT INTO token_usage (id, session_id, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, record.sessionId, record.model, record.inputTokens, record.outputTokens, record.createdAt)
}

export interface TokenUsageSummary {
  model: string
  totalInput: number
  totalOutput: number
  count: number
}

export function getTokenUsageSummary(): TokenUsageSummary[] {
  const rows = db!.prepare(`
    SELECT model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as count
    FROM token_usage
    GROUP BY model
    ORDER BY total_input + total_output DESC
  `).all() as any[]
  return rows.map(r => ({
    model: r.model,
    totalInput: r.total_input,
    totalOutput: r.total_output,
    count: r.count
  }))
}

export interface TokenUsageDaily {
  date: string
  model: string
  inputTokens: number
  outputTokens: number
}

export function getTokenUsageDaily(days: number = 30): TokenUsageDaily[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const rows = db!.prepare(`
    SELECT date(created_at / 1000, 'unixepoch', 'localtime') as day,
           model,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
    FROM token_usage
    WHERE created_at >= ?
    GROUP BY day, model
    ORDER BY day ASC
  `).all(since) as any[]
  return rows.map(r => ({
    date: r.day,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens
  }))
}
