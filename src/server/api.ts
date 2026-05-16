import fs from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getMimeType } from 'hono/utils/mime';
import { Readable } from 'node:stream';
import { journalRepo, sessionsRepo, sourcesRepo, summariesRepo, wingsRepo, type JournalItemRow } from './db';
import { parserFor } from './parsers';
import { subscribe } from './pubsub';
import { resolveTargetForSession, sendInput } from './tmux';
import { distill } from './distill';
import { complete, summarize, type Backend } from './summarize';
import { log } from './logger';
import type { AgentType, JournalItem, JournalKind } from '../shared/types';

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB

export const app = new Hono();

app.get('/api/sources', (c) => {
  const url = new URL(c.req.url);
  const project = url.searchParams.get('project');
  const q = url.searchParams.get('q');
  const counts = sessionsRepo.countsBySource({ project, q });
  const sources = sourcesRepo.list().map((s) => ({ ...s, count: counts[s.id] ?? 0 }));
  return c.json({ sources });
});

app.get('/api/sessions', (c) => {
  const url = new URL(c.req.url);
  const sourceId = url.searchParams.get('source');
  const agent = url.searchParams.get('agent');
  const q = url.searchParams.get('q');
  const project = url.searchParams.get('project');
  const rows = sessionsRepo.list({ sourceId, agent, q, project });
  // Strip filePath from the wire — keep it for entry endpoints only.
  const sessions = rows.map(({ filePath: _fp, ...rest }) => rest);
  return c.json({ sessions });
});

app.get('/api/projects', (c) => {
  const url = new URL(c.req.url);
  const sourceId = url.searchParams.get('source');
  const q = url.searchParams.get('q');
  return c.json({ projects: sessionsRepo.projects({ sourceId, q }) });
});

app.get('/api/sessions/:sourceId/:sessionId', (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  return c.json({ session: { ...session, filePath: undefined } });
});

app.get('/api/sessions/:sourceId/:sessionId/entries', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  const sources = sourcesRepo.list();
  const src = sources.find((s) => s.id === sourceId);
  if (!src) return c.json({ error: 'source missing' }, 404);
  const parser = parserFor(src.agent);
  if (!parser) return c.json({ error: 'no parser' }, 501);
  const entries = await parser.parseEntries(session.filePath);
  return c.json({ entries });
});

app.get('/api/sessions/:sourceId/:sessionId/file', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);

  const url = new URL(c.req.url);
  const requested = url.searchParams.get('path');
  if (!requested) return c.json({ error: 'path required' }, 400);
  if (!session.cwd) return c.json({ error: 'session has no cwd' }, 400);

  // Resolve target path: absolute is used as-is; relative is joined with cwd.
  const target = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(session.cwd, requested);

  // Confine to cwd. Use realpath to follow symlinks on both sides — if the
  // target doesn't exist, fall back to the lexical path for the 404 reply.
  let realTarget: string;
  let realRoot: string;
  try {
    realRoot = await fs.realpath(session.cwd);
  } catch {
    return c.json({ error: 'cwd missing' }, 404);
  }
  try {
    realTarget = await fs.realpath(target);
  } catch {
    return c.json({ error: 'file not found', path: target }, 404);
  }
  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return c.json({ error: 'path escapes session cwd' }, 403);
  }

  let stat;
  try { stat = await fs.stat(realTarget); }
  catch { return c.json({ error: 'file not found', path: target }, 404); }
  if (!stat.isFile()) return c.json({ error: 'not a regular file' }, 400);
  if (stat.size > MAX_FILE_BYTES) {
    return c.json({ error: 'file too large', size: stat.size, limit: MAX_FILE_BYTES }, 413);
  }

  let buf: Buffer;
  try { buf = await fs.readFile(realTarget); }
  catch (e) { return c.json({ error: 'read failed', detail: (e as Error).message }, 500); }

  // Reject binary content — quick heuristic: any NUL byte in the first 8 KB.
  const probe = buf.subarray(0, Math.min(buf.length, 8192));
  if (probe.includes(0)) return c.json({ error: 'binary file' }, 415);

  return c.json({
    path: realTarget,
    relative: rel || path.basename(realTarget),
    size: stat.size,
    mtime: stat.mtimeMs,
    content: buf.toString('utf8'),
  });
});

app.post('/api/sessions/:sourceId/:sessionId/input', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);

  let body: { text?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.length === 0) return c.json({ error: 'text required' }, 400);

  const resolved = resolveTargetForSession({
    agent: session.agent as AgentType,
    cwd: session.cwd,
  });
  if (!resolved) {
    return c.json({
      error: 'no matching tmux pane',
      detail: 'No tmux pane found running this agent with a matching cwd. The session may not be attached to a multiplexer, or the agent process has exited.',
    }, 409);
  }

  try {
    await sendInput(resolved.target, text);
  } catch (e) {
    log.error({ err: e, target: resolved.target }, 'tmux send-keys failed');
    return c.json({ error: 'send failed', detail: (e as Error).message }, 500);
  }
  return c.json({ ok: true, target: resolved.target });
});

app.get('/api/sessions/:sourceId/:sessionId/summary/status', (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);
  const rows = summariesRepo.listForSession(sourceId, sessionId);
  // Returns the cached text so the UI can render it without triggering
  // generation. Regenerate is the only path that hits the LLM.
  const summaries = rows.map((r) => ({
    backend: r.backend,
    text: r.text,
    createdAt: r.createdAt,
  }));
  return c.json({ summaries });
});

app.get('/api/sessions/:sourceId/:sessionId/summary', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const url = new URL(c.req.url);
  const backendParam = url.searchParams.get('backend');
  const backend: Backend = backendParam === 'codex' ? 'codex' : 'claude';
  const force = url.searchParams.get('force') === '1';

  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);
  const sources = sourcesRepo.list();
  const src = sources.find((s) => s.id === sourceId);
  if (!src) return c.json({ error: 'source missing' }, 404);
  const parser = parserFor(src.agent);
  if (!parser) return c.json({ error: 'no parser' }, 501);

  // Cache hit: serve the stored summary if the session hasn't changed since
  // it was generated. Otherwise (or with ?force=1) regenerate.
  const cached = summariesRepo.get(sourceId, sessionId, backend);
  const cacheFresh = cached && cached.sessionUpdatedAt === session.updatedAt;

  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });

    if (cached && cacheFresh && !force) {
      await stream.writeSSE({
        event: 'meta',
        data: JSON.stringify({ backend, cached: true, createdAt: cached.createdAt }),
      });
      await stream.writeSSE({
        event: 'chunk',
        data: JSON.stringify({ type: 'chunk', text: cached.text }),
      });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ type: 'done' }) });
      return;
    }

    const entries = await parser.parseEntries(session.filePath);
    const distilled = distill(entries);
    await stream.writeSSE({
      event: 'meta',
      data: JSON.stringify({
        backend, cached: false,
        distilledChars: distilled.length, entryCount: entries.length,
        stale: cached ? true : undefined,
      }),
    });

    // If we have a stale cached summary, surface it first so the user sees
    // *something* while the fresh generation runs.
    if (cached && !cacheFresh && !force) {
      await stream.writeSSE({
        event: 'stale',
        data: JSON.stringify({ type: 'stale', text: cached.text, createdAt: cached.createdAt }),
      });
    }

    let accumulated = '';
    try {
      for await (const chunk of summarize(backend, distilled, ac.signal)) {
        await stream.writeSSE({ event: chunk.type, data: JSON.stringify(chunk) });
        if (chunk.type === 'chunk' && chunk.text) accumulated += chunk.text;
        if (chunk.type === 'done') {
          if (accumulated.trim()) {
            summariesRepo.upsert({
              sourceId, sessionId, backend,
              text: accumulated,
              sessionUpdatedAt: session.updatedAt,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        if (chunk.type === 'error') break;
      }
    } catch (err) {
      log.error({ err, backend, sourceId, sessionId }, 'summary stream failed');
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', detail: (err as Error).message }),
      });
    }
  });
});

// ── Journal CRUD ────────────────────────────────────────────────────────────

const VALID_KINDS = new Set<JournalKind>(['learning', 'next', 'note']);
const VALID_AGENTS = new Set<AgentType>(['claude', 'codex', 'opencode', 'pi']);

/** Row → wire shape (decode tags, coerce done). */
function rowToJournal(r: JournalItemRow): JournalItem {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(r.tags) as unknown;
    if (Array.isArray(parsed)) tags = parsed.filter((x): x is string => typeof x === 'string');
  } catch { /* ignore */ }
  return {
    id: r.id,
    kind: r.kind,
    text: r.text,
    projectKey: r.projectKey,
    sourceSessionId: r.sourceSessionId,
    sourceEntryId: r.sourceEntryId,
    agent: r.agent,
    tags,
    createdAt: r.createdAt,
    done: !!r.done,
  };
}

/** Parse + validate a body payload. Throws on first invalid field — we expect
 *  the UI to only send shapes it just rendered, so an error here is a bug. */
function coerceJournalRow(body: unknown, fallbackId?: string): JournalItemRow {
  if (!body || typeof body !== 'object') throw new Error('object required');
  const o = body as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : (fallbackId ?? `j-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const kind = String(o.kind);
  if (!VALID_KINDS.has(kind as JournalKind)) throw new Error(`bad kind: ${kind}`);
  const text = typeof o.text === 'string' ? o.text.slice(0, 8000) : '';
  if (!text.trim()) throw new Error('text required');
  const projectKey = typeof o.projectKey === 'string' && o.projectKey ? o.projectKey : '';
  if (!projectKey) throw new Error('projectKey required');
  const sourceSessionId = typeof o.sourceSessionId === 'string' ? o.sourceSessionId : null;
  const sourceEntryId = typeof o.sourceEntryId === 'string' ? o.sourceEntryId : null;
  const agentRaw = typeof o.agent === 'string' ? o.agent : null;
  const agent = agentRaw && VALID_AGENTS.has(agentRaw as AgentType) ? (agentRaw as AgentType) : null;
  const tagsArr = Array.isArray(o.tags)
    ? o.tags.filter((x): x is string => typeof x === 'string').slice(0, 8)
    : [];
  const createdAtRaw = typeof o.createdAt === 'number' ? o.createdAt : Date.now();
  const done = o.done === true || o.done === 1 ? 1 : 0;
  return {
    id, kind: kind as JournalKind, text, projectKey,
    sourceSessionId, sourceEntryId, agent,
    tags: JSON.stringify(tagsArr),
    createdAt: createdAtRaw, done,
  };
}

app.get('/api/journal/items', (c) => {
  return c.json({ items: journalRepo.list().map(rowToJournal) });
});

app.post('/api/journal/items', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const bodyObj = body as { item?: unknown; items?: unknown };
  // Accept either { item: {...} } or { items: [...] } for batch insert.
  if (Array.isArray(bodyObj.items)) {
    try {
      const rows = bodyObj.items.map((it) => coerceJournalRow(it));
      journalRepo.insertMany(rows);
      return c.json({ items: rows.map(rowToJournal) });
    } catch (err) {
      return c.json({ error: 'bad item', detail: (err as Error).message }, 400);
    }
  }
  const itemPayload = bodyObj.item ?? body;
  try {
    const row = coerceJournalRow(itemPayload);
    journalRepo.insert(row);
    return c.json({ item: rowToJournal(row) });
  } catch (err) {
    return c.json({ error: 'bad item', detail: (err as Error).message }, 400);
  }
});

app.patch('/api/journal/items/:id', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const o = (body ?? {}) as Record<string, unknown>;
  const patch: Partial<Omit<JournalItemRow, 'id' | 'createdAt'>> = {};
  if (typeof o.text === 'string') patch.text = o.text.slice(0, 8000);
  if (typeof o.kind === 'string') {
    if (!VALID_KINDS.has(o.kind as JournalKind)) return c.json({ error: 'bad kind' }, 400);
    patch.kind = o.kind as JournalKind;
  }
  if (typeof o.done === 'boolean') patch.done = o.done ? 1 : 0;
  if (Array.isArray(o.tags)) {
    const tags = o.tags.filter((x): x is string => typeof x === 'string').slice(0, 8);
    patch.tags = JSON.stringify(tags);
  }
  const row = journalRepo.update(id, patch);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ item: rowToJournal(row) });
});

app.delete('/api/journal/items/:id', (c) => {
  const id = c.req.param('id');
  const ok = journalRepo.remove(id);
  return c.json({ ok });
});

app.delete('/api/journal/items', (c) => {
  journalRepo.clear();
  return c.json({ ok: true });
});

/**
 * Journal extractor: takes a pre-built prompt from the client (the chat
 * transcript + instructions for JSON-only output) and returns the model's raw
 * response. The UI parses the JSON itself so it can be liberal about
 * surrounding prose if the model wraps the JSON in markdown fences.
 */
app.post('/api/journal/extract', async (c) => {
  let body: { prompt?: unknown; backend?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt) return c.json({ error: 'prompt required' }, 400);
  const backend: Backend = body.backend === 'codex' ? 'codex' : 'claude';

  const ac = new AbortController();
  c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });
  try {
    const text = await complete(backend, prompt, ac.signal);
    return c.json({ backend, text });
  } catch (err) {
    log.warn({ err, backend }, 'journal extract failed');
    return c.json({ error: 'extract failed', detail: (err as Error).message }, 500);
  }
});

app.get('/api/memory/status', async (c) => {
  const { detectMempalace } = await import('./memory/detect');
  return c.json(detectMempalace());
});

app.get('/api/memory/projects', (c) => {
  // Every unique cwd in the session table, enriched with the wing row
  // (if the user has opted it into mempalace) and the current job state.
  const projects = sessionsRepo.projects();
  const wings = wingsRepo.list();
  const wingByCwd = new Map(wings.map((w) => [w.cwd, w]));
  const items = projects.map((p) => {
    const w = wingByCwd.get(p.cwd);
    return {
      cwd: p.cwd,
      sessionCount: p.count,
      latestAt: p.latestAt,
      slug: w?.slug ?? null,
      status: w?.status ?? null,
      lastMinedAt: w?.lastMinedAt ?? null,
      lastMineError: w?.lastMineError ?? null,
    };
  });
  return c.json({ projects: items });
});

app.get('/api/memory/jobs', async (c) => {
  const { listJobs } = await import('./memory/jobs');
  return c.json(listJobs());
});

app.post('/api/memory/projects', async (c) => {
  const { addProject } = await import('./memory/jobs');
  const body = await c.req.json().catch(() => ({}));
  const cwd = typeof body.cwd === 'string' ? body.cwd : '';
  if (!cwd) return c.json({ error: 'cwd required' }, 400);
  const state = addProject(cwd);
  return c.json({ job: state });
});

app.delete('/api/memory/projects/:slug', async (c) => {
  const { removeProject } = await import('./memory/jobs');
  const slug = c.req.param('slug');
  if (!slug) return c.json({ error: 'slug required' }, 400);
  try {
    const r = await removeProject(slug);
    if (!r.removed) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  } catch (err) {
    log.warn({ err, slug }, 'remove project failed');
    return c.json({ error: 'remove failed', detail: (err as Error).message }, 500);
  }
});

app.get('/api/search', async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? '10')));
  const wing = url.searchParams.get('wing') ?? undefined;
  if (!q) return c.json({ hits: [], note: 'empty query' });
  try {
    const { searchPalace } = await import('./memory/search');
    const hits = await searchPalace(q, { limit, wing });
    return c.json({ hits });
  } catch (err) {
    log.warn({ err, q }, 'memory search failed');
    return c.json({ error: 'memory search failed', detail: (err as Error).message }, 500);
  }
});

app.get('/api/events', (c) => {
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });

    // Heartbeat so proxies don't drop the connection.
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: 'ping', data: '1' });
    }, 15_000);

    try {
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ ok: true }) });
      for await (const ev of subscribe(ac.signal)) {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
    } finally {
      clearInterval(heartbeat);
    }
  });
});

// Serve the built UI as the SPA fallback. Mounted last so it only catches
// requests that didn't hit an /api route above.
export function mountStaticUi(uiDir: string): void {
  if (!existsSync(uiDir)) {
    log.warn({ uiDir }, 'UI directory not found — UI will not be served');
    return;
  }
  const indexFile = path.join(uiDir, 'index.html');

  app.get('*', async (c) => {
    let reqPath = decodeURI(new URL(c.req.url).pathname);
    if (reqPath.includes('..')) return c.notFound();

    let filePath = path.join(uiDir, reqPath);
    let stat = safeStat(filePath);
    if (!stat || stat.isDirectory()) {
      // SPA fallback — serve index.html for any non-asset path
      filePath = indexFile;
      stat = safeStat(filePath);
      if (!stat) return c.notFound();
    }

    const mime = getMimeType(filePath) ?? 'application/octet-stream';
    c.header('Content-Type', mime);
    c.header('Content-Length', String(stat.size));
    return c.body(Readable.toWeb(createReadStream(filePath)) as ReadableStream);
  });
}

function safeStat(p: string) {
  try { return statSync(p); } catch { return null; }
}
