import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { configDir, dbPath } from './paths';
import { composeSessionId, type Session, type Source } from '../shared/types';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(configDir(), { recursive: true });
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source (
      id      TEXT PRIMARY KEY,
      label   TEXT NOT NULL,
      agent   TEXT NOT NULL,
      root    TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS session (
      sourceId      TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
      sessionId     TEXT NOT NULL,
      agent         TEXT NOT NULL,
      filePath      TEXT NOT NULL,
      cwd           TEXT,
      name          TEXT,
      model         TEXT,
      startedAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL,
      messageCount  INTEGER NOT NULL DEFAULT 0,
      costUsd       REAL,
      branches      INTEGER NOT NULL DEFAULT 0,
      live          INTEGER NOT NULL DEFAULT 0,
      status        TEXT,
      PRIMARY KEY (sourceId, sessionId)
    );

    CREATE INDEX IF NOT EXISTS session_by_updatedAt ON session(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS session_by_cwd       ON session(cwd);

    CREATE TABLE IF NOT EXISTS entry_offset (
      sourceId  TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      filePath  TEXT NOT NULL,
      byteOff   INTEGER NOT NULL DEFAULT 0,
      mtime     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sourceId, sessionId)
    );
  `);
}

interface SourceRow {
  id: string;
  label: string;
  agent: string;
  root: string;
  enabled: number;
}

function rowToSource(r: SourceRow): Source {
  return {
    id: r.id,
    label: r.label,
    agent: r.agent as Source['agent'],
    root: r.root,
    enabled: !!r.enabled,
  };
}

export const sourcesRepo = {
  upsert(s: Source): void {
    getDb()
      .prepare(
        `INSERT INTO source(id,label,agent,root,enabled)
         VALUES (@id,@label,@agent,@root,@enabled)
         ON CONFLICT(id) DO UPDATE SET
           label=excluded.label, agent=excluded.agent,
           root=excluded.root, enabled=excluded.enabled`,
      )
      .run({ ...s, enabled: s.enabled ? 1 : 0 });
  },
  remove(id: string): void {
    getDb().prepare(`DELETE FROM source WHERE id = ?`).run(id);
  },
  list(): Source[] {
    return getDb().prepare<unknown[], SourceRow>(`SELECT * FROM source ORDER BY id`).all().map(rowToSource);
  },
};

export interface SessionRow {
  sourceId: string;
  sessionId: string;
  agent: string;
  filePath: string;
  cwd: string | null;
  name: string | null;
  model: string | null;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  costUsd: number | null;
  branches: number;
  live: number;
  status: string | null;
}

function rowToSession(r: SessionRow): Session & { filePath: string } {
  return {
    id: composeSessionId(r.sourceId, r.sessionId),
    sourceId: r.sourceId,
    agent: r.agent as Session['agent'],
    name: r.name,
    cwd: r.cwd ?? '',
    model: r.model ?? '',
    startedAt: r.startedAt,
    updatedAt: r.updatedAt,
    messageCount: r.messageCount,
    costUsd: r.costUsd,
    live: !!r.live,
    branches: r.branches,
    status: r.status ?? 'idle',
    filePath: r.filePath,
  };
}

export const sessionsRepo = {
  upsert(row: SessionRow): void {
    getDb()
      .prepare(
        `INSERT INTO session(sourceId,sessionId,agent,filePath,cwd,name,model,
                             startedAt,updatedAt,messageCount,costUsd,branches,live,status)
         VALUES (@sourceId,@sessionId,@agent,@filePath,@cwd,@name,@model,
                 @startedAt,@updatedAt,@messageCount,@costUsd,@branches,@live,@status)
         ON CONFLICT(sourceId,sessionId) DO UPDATE SET
           agent=excluded.agent, filePath=excluded.filePath, cwd=excluded.cwd,
           name=excluded.name, model=excluded.model, startedAt=excluded.startedAt,
           updatedAt=excluded.updatedAt, messageCount=excluded.messageCount,
           costUsd=excluded.costUsd, branches=excluded.branches,
           live=excluded.live, status=excluded.status`,
      )
      .run(row);
  },
  deleteForSource(sourceId: string): void {
    getDb().prepare(`DELETE FROM session WHERE sourceId = ?`).run(sourceId);
  },
  list(opts: { sourceId?: string | null; agent?: string | null; q?: string | null; project?: string | null } = {}): (Session & { filePath: string })[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.sourceId) { where.push('sourceId = @sourceId'); params.sourceId = opts.sourceId; }
    if (opts.agent) { where.push('agent = @agent'); params.agent = opts.agent; }
    if (opts.project) { where.push('cwd = @project'); params.project = opts.project; }
    if (opts.q) {
      where.push("(COALESCE(name,'') LIKE @q OR COALESCE(cwd,'') LIKE @q OR COALESCE(model,'') LIKE @q)");
      params.q = `%${opts.q}%`;
    }
    const sql = `SELECT * FROM session ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY updatedAt DESC`;
    return getDb().prepare<typeof params, SessionRow>(sql).all(params).map(rowToSession);
  },
  projects(opts: { sourceId?: string | null; q?: string | null } = {}): { cwd: string; count: number; latestAt: string }[] {
    const where: string[] = [`cwd IS NOT NULL`, `cwd <> ''`];
    const params: Record<string, unknown> = {};
    if (opts.sourceId) { where.push('sourceId = @sourceId'); params.sourceId = opts.sourceId; }
    if (opts.q) {
      where.push("(COALESCE(name,'') LIKE @q OR COALESCE(cwd,'') LIKE @q OR COALESCE(model,'') LIKE @q)");
      params.q = `%${opts.q}%`;
    }
    return getDb()
      .prepare<typeof params, { cwd: string; count: number; latestAt: string }>(
        `SELECT cwd, COUNT(*) AS count, MAX(updatedAt) AS latestAt
         FROM session
         WHERE ${where.join(' AND ')}
         GROUP BY cwd
         ORDER BY latestAt DESC`,
      )
      .all(params);
  },
  countsBySource(opts: { project?: string | null; q?: string | null } = {}): Record<string, number> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.project) { where.push('cwd = @project'); params.project = opts.project; }
    if (opts.q) {
      where.push("(COALESCE(name,'') LIKE @q OR COALESCE(cwd,'') LIKE @q OR COALESCE(model,'') LIKE @q)");
      params.q = `%${opts.q}%`;
    }
    const rows = getDb()
      .prepare<typeof params, { sourceId: string; count: number }>(
        `SELECT sourceId, COUNT(*) AS count FROM session
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY sourceId`,
      )
      .all(params);
    const m: Record<string, number> = {};
    for (const r of rows) m[r.sourceId] = r.count;
    return m;
  },
  find(sourceId: string, sessionId: string): (Session & { filePath: string }) | null {
    const r = getDb()
      .prepare<unknown[], SessionRow>(`SELECT * FROM session WHERE sourceId = ? AND sessionId = ?`)
      .get(sourceId, sessionId);
    return r ? rowToSession(r) : null;
  },
};

export function dbFile(): string {
  return path.resolve(dbPath());
}
