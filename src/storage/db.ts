import { Database } from "bun:sqlite"
import { ensureDataDir, dataDir } from "../config/paths"

export interface SessionRecord {
  id: string
  cwd: string
  model?: string
  agent?: string
  title?: string
  created_at: number
  updated_at: number
}

export interface MessageRecord {
  id: string
  session_id: string
  role: string
  content: string
  tool_calls?: string
  tool_call_id?: string
  created_at: number
}

export interface GoalRecord {
  id: string
  title: string
  description?: string
  status: string
  model?: string
  data?: string
  created_at: number
  updated_at: number
}

export interface StateRecord {
  key: string
  value: string
  updated_at: number
}

export class Store {
  readonly db: Database

  private constructor(db: Database) {
    this.db = db
  }

  static open(): Store {
    ensureDataDir()
    const db = new Database(`${dataDir()}/xuanjian.sqlite`)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        model TEXT,
        agent TEXT,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        model TEXT,
        data TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    return new Store(db)
  }

  // ---- sessions ----
  createSession(s: SessionRecord): void {
    this.db
      .query(`INSERT INTO sessions (id, cwd, model, agent, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(s.id, s.cwd, s.model ?? null, s.agent ?? null, s.title ?? null, s.created_at, s.updated_at)
  }

  getSession(id: string): SessionRecord | undefined {
    const row = this.db.query(`SELECT * FROM sessions WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return row ? mapSession(row) : undefined
  }

  updateSession(id: string, patch: Partial<SessionRecord>): void {
    const current = this.getSession(id)
    if (!current) return
    const next = { ...current, ...patch, updated_at: Date.now() }
    this.db
      .query(`UPDATE sessions SET cwd=?, model=?, agent=?, title=?, updated_at=? WHERE id=?`)
      .run(next.cwd, next.model ?? null, next.agent ?? null, next.title ?? null, next.updated_at, id)
  }

  listSessions(): SessionRecord[] {
    const rows = this.db.query(`SELECT * FROM sessions ORDER BY updated_at DESC`).all() as Record<string, unknown>[]
    return rows.map(mapSession)
  }

  latestSession(): SessionRecord | undefined {
    const row = this.db.query(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined
    return row ? mapSession(row) : undefined
  }

  deleteSession(id: string): void {
    this.db
      .transaction(() => {
        this.db.query(`DELETE FROM messages WHERE session_id = ?`).run(id)
        this.db.query(`DELETE FROM sessions WHERE id = ?`).run(id)
      })()
  }

  // ---- messages ----
  addMessage(m: MessageRecord): void {
    this.db
      .query(`INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(m.id, m.session_id, m.role, m.content, m.tool_calls ?? null, m.tool_call_id ?? null, m.created_at)
  }

  listMessages(sessionId: string): MessageRecord[] {
    const rows = this.db.query(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at`).all(sessionId) as Record<string, unknown>[]
    return rows.map(mapMessage)
  }

  deleteMessages(sessionId: string, ids: string[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => "?").join(",")
    this.db.query(`DELETE FROM messages WHERE session_id = ? AND id IN (${placeholders})`).run(sessionId, ...ids)
  }

  // ---- goals ----
  upsertGoal(g: GoalRecord): void {
    this.db
      .query(`INSERT INTO goals (id, title, description, status, model, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, status=excluded.status, model=excluded.model, data=excluded.data, updated_at=excluded.updated_at`)
      .run(g.id, g.title, g.description ?? null, g.status, g.model ?? null, g.data ?? null, g.created_at, g.updated_at)
  }

  getGoal(id: string): GoalRecord | undefined {
    const row = this.db.query(`SELECT * FROM goals WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return row ? mapGoal(row) : undefined
  }

  listGoals(): GoalRecord[] {
    const rows = this.db.query(`SELECT * FROM goals ORDER BY updated_at DESC`).all() as Record<string, unknown>[]
    return rows.map(mapGoal)
  }

  // ---- state ----
  getState(key: string): string | undefined {
    const row = this.db.query(`SELECT value FROM state WHERE key = ?`).get(key) as { value: string } | undefined
    return row?.value
  }

  setState(key: string, value: string): void {
    this.db
      .query(`INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(key, value, Date.now())
  }

  deleteState(key: string): void {
    this.db.query(`DELETE FROM state WHERE key = ?`).run(key)
  }

  close(): void {
    this.db.close()
  }
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    cwd: String(row.cwd),
    model: row.model == null ? undefined : String(row.model),
    agent: row.agent == null ? undefined : String(row.agent),
    title: row.title == null ? undefined : String(row.title),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  }
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    role: String(row.role),
    content: String(row.content),
    tool_calls: row.tool_calls == null ? undefined : String(row.tool_calls),
    tool_call_id: row.tool_call_id == null ? undefined : String(row.tool_call_id),
    created_at: Number(row.created_at),
  }
}

function mapGoal(row: Record<string, unknown>): GoalRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? undefined : String(row.description),
    status: String(row.status),
    model: row.model == null ? undefined : String(row.model),
    data: row.data == null ? undefined : String(row.data),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  }
}
