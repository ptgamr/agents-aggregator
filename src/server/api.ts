import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sessionsRepo, sourcesRepo } from './db';
import { parserFor } from './parsers';
import { subscribe } from './pubsub';

export const app = new Hono();

app.get('/api/sources', (c) => {
  return c.json({ sources: sourcesRepo.list() });
});

app.get('/api/sessions', (c) => {
  const url = new URL(c.req.url);
  const sourceId = url.searchParams.get('source');
  const agent = url.searchParams.get('agent');
  const q = url.searchParams.get('q');
  const rows = sessionsRepo.list({ sourceId, agent, q });
  // Strip filePath from the wire — keep it for entry endpoints only.
  const sessions = rows.map(({ filePath: _fp, ...rest }) => rest);
  return c.json({ sessions });
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
