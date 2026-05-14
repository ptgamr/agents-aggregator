import type { Entry } from '../shared/types';

// Streaming cycle: additional events injected into the active session over time.
export const PROTO_CYCLE: Entry[] = [
  {
    id: 'cycle-1', role: 'toolCall', tool: 'edit_file',
    args: { path: 'src/server/api.ts' }, timestamp: 'now',
    preview:
      "app.get('/api/sessions/:id/events', (c) => streamSSE(c, async (stream) => {\n  const id = c.req.param('id');\n  for await (const msg of pubsub.subscribe(c.req.raw.signal, id)) {\n    await stream.writeSSE({ event: 'entry', data: JSON.stringify(msg) });\n  }\n}));",
  },
  {
    id: 'cycle-2', role: 'toolResult', tool: 'edit_file', ok: true, timestamp: 'now',
    summary: '+21 / −0 in src/server/api.ts',
  },
  {
    id: 'cycle-3', role: 'bash', timestamp: 'now',
    cmd: 'curl -N localhost:3000/api/sessions/s-01/events',
    out: 'event: entry\ndata: {"id":"e1","role":"user","text":"Help me wire up Server-Sent Events…"}\n\nevent: entry\ndata: {"id":"e2","role":"thinking","text":"The user wants two SSE endpoints…"}\n',
  },
  {
    id: 'cycle-4', role: 'assistant', streaming: true, timestamp: 'now',
    text: "Endpoint is live. The client side is just an `EventSource` with a `useEventSource` hook that pushes new entries onto a TanStack Query cache. Want me to scaffold that next?",
  },
  {
    id: 'cycle-5', role: 'user', timestamp: 'now',
    text: "Yes — and have it reconcile against the initial GET so we don't double-render entries that arrived before the SSE connection opened.",
  },
  {
    id: 'cycle-6', role: 'thinking', timestamp: 'now',
    text: 'Need to keep entries keyed by id, dedupe on insert, and use the highest-known offset as the SSE resume cursor.',
  },
  {
    id: 'cycle-7', role: 'assistant', streaming: true, timestamp: 'now',
    text: "Right — I'll key entries by id in a `Map`, use the initial GET to seed it, then merge SSE inserts on top. The SSE handshake includes a `Last-Event-ID` so reconnects pick up from the right offset.",
  },
];
