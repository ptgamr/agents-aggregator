import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sessionsRepo, sourcesRepo } from './db';
import { parserFor } from './parsers';
import { subscribe } from './pubsub';
import { resolveTargetForSession, sendInput } from './tmux';
import { log } from './logger';
import type { AgentType } from '../shared/types';

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
