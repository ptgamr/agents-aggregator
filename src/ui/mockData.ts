import type { Entry, Session, Source } from '../shared/types';

export const SOURCES: Source[] = [
  { id: 'pi-personal', label: 'Pi (Personal)', agent: 'pi', root: '~/.pi', enabled: true, sessions: 47 },
  { id: 'claude-work', label: 'Claude (Work)', agent: 'claude', root: '~/.claude-work', enabled: true, sessions: 132 },
  { id: 'claude-personal', label: 'Claude (Personal)', agent: 'claude', root: '~/.claude', enabled: true, sessions: 88 },
  { id: 'codex-work', label: 'Codex (Work)', agent: 'codex', root: '~/.codex-work', enabled: true, sessions: 24 },
  { id: 'codex-personal', label: 'Codex (Personal)', agent: 'codex', root: '~/.codex', enabled: false, sessions: 9 },
  { id: 'opencode', label: 'OpenCode', agent: 'opencode', root: '~/.opencode', enabled: true, sessions: 6 },
];

export const SESSIONS: Session[] = [
  {
    id: 's-01', sourceId: 'claude-personal', agent: 'claude',
    name: 'Wire up SSE in agents-viewer',
    cwd: '~/code/agents-viewer', model: 'claude-sonnet-4-5',
    startedAt: '14:02', updatedAt: 'now', messageCount: 38,
    costUsd: 1.18, live: true, branches: 0, status: 'streaming',
  },
  {
    id: 's-02', sourceId: 'pi-personal', agent: 'pi',
    name: 'Refactor migration runner',
    cwd: '~/work/db-migration', model: 'pi-large',
    startedAt: '13:41', updatedAt: '2m', messageCount: 22,
    costUsd: 0.42, live: true, branches: 2, status: 'tool',
  },
  {
    id: 's-03', sourceId: 'codex-work', agent: 'codex',
    name: 'Investigate flaky checkout test',
    cwd: '~/work/api-gateway', model: 'gpt-5-codex',
    startedAt: '13:08', updatedAt: '14m', messageCount: 64,
    costUsd: 2.31, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-04', sourceId: 'claude-work', agent: 'claude',
    name: 'Add error handling to auth flow',
    cwd: '~/work/api-gateway', model: 'claude-opus-4',
    startedAt: '12:22', updatedAt: '1h', messageCount: 51,
    costUsd: 3.94, live: false, branches: 1, status: 'idle',
  },
  {
    id: 's-05', sourceId: 'pi-personal', agent: 'pi',
    name: null,
    cwd: '~/code/dotfiles', model: 'pi-large',
    startedAt: '11:58', updatedAt: '1h', messageCount: 8,
    costUsd: 0.06, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-06', sourceId: 'opencode', agent: 'opencode',
    name: 'Port build script to bun',
    cwd: '~/code/agents-viewer', model: 'gpt-5',
    startedAt: '11:14', updatedAt: '2h', messageCount: 19,
    costUsd: 0.88, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-07', sourceId: 'claude-personal', agent: 'claude',
    name: 'Draft README for tail.ts',
    cwd: '~/code/agents-viewer', model: 'claude-sonnet-4-5',
    startedAt: '10:48', updatedAt: '3h', messageCount: 12,
    costUsd: 0.21, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-08', sourceId: 'codex-work', agent: 'codex',
    name: 'Bisect deploy regression',
    cwd: '~/work/deploy-bot', model: 'gpt-5-codex',
    startedAt: '10:02', updatedAt: '3h', messageCount: 41,
    costUsd: 1.55, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-09', sourceId: 'claude-work', agent: 'claude',
    name: 'Migrate test runner config',
    cwd: '~/work/api-gateway', model: 'claude-sonnet-4-5',
    startedAt: '09:31', updatedAt: '4h', messageCount: 28,
    costUsd: 0.74, live: false, branches: 0, status: 'idle',
  },
  {
    id: 's-10', sourceId: 'pi-personal', agent: 'pi',
    name: 'Add /name handler tests',
    cwd: '~/code/pi-coding-agent', model: 'pi-large',
    startedAt: 'Yesterday', updatedAt: '14h', messageCount: 17,
    costUsd: 0.31, live: false, branches: 0, status: 'idle',
  },
];

export const ENTRIES: Entry[] = [
  {
    id: 'e1', role: 'user', timestamp: '14:02:11',
    text: "Help me wire up Server-Sent Events for the session detail view. The Hono route should stream new entries as they're tailed from disk. Use a shared in-process pubsub.",
  },
  {
    id: 'e2', role: 'thinking', timestamp: '14:02:13',
    text: "The user wants two SSE endpoints: a per-session stream and a global activity stream. Both should fan out from the same in-memory pubsub keyed by (sourceId, sessionId). I'll start by sketching the pubsub interface.",
  },
  {
    id: 'e3', role: 'assistant', timestamp: '14:02:18',
    text: "I'll set this up in three parts: a tiny pubsub with async-iterator subscribers, a Hono route using `streamSSE`, and a client hook. Starting with the pubsub:",
  },
  {
    id: 'e4', role: 'toolCall', timestamp: '14:02:21', tool: 'edit_file',
    args: { path: 'src/server/pubsub.ts' },
    preview:
      'export function createPubSub<T>() {\n  const subs = new Set<(msg: T) => void>();\n  return {\n    publish(msg: T) { for (const s of subs) s(msg); },\n    async *subscribe(signal: AbortSignal) {\n      const queue: T[] = [];\n      ...\n    }\n  };\n}',
  },
  {
    id: 'e5', role: 'toolResult', timestamp: '14:02:22', tool: 'edit_file',
    ok: true, summary: '+34 / −0 in src/server/pubsub.ts',
  },
  {
    id: 'e6', role: 'bash', timestamp: '14:02:24',
    cmd: 'pnpm typecheck --filter server',
    out: "src/server/pubsub.ts:14:3 - error TS2322: Type 'AsyncGenerator' is not assignable to type 'AsyncIterable'.\n\nFound 1 error.\n",
  },
  {
    id: 'e7', role: 'thinking', timestamp: '14:02:27',
    text: 'Forgot the generator return type. Need to type the queue properly and yield-resolve a pending promise on publish.',
  },
  {
    id: 'e8', role: 'assistant', timestamp: '14:02:30',
    text: 'TypeScript caught a return-type mismatch. Tightening the generator types and adding a waiter promise so `publish` wakes pending subscribers:',
  },
  {
    id: 'e9', role: 'toolCall', timestamp: '14:02:31', tool: 'edit_file',
    args: { path: 'src/server/pubsub.ts' },
    preview:
      'async *subscribe(signal: AbortSignal): AsyncGenerator<T> {\n  let resolveNext: (() => void) | null = null;\n  const onPublish = (msg: T) => {\n    queue.push(msg);\n    resolveNext?.();\n  };',
  },
  {
    id: 'e10', role: 'toolResult', timestamp: '14:02:32', tool: 'edit_file',
    ok: true, summary: '+12 / −3 in src/server/pubsub.ts',
  },
  {
    id: 'e11', role: 'bash', timestamp: '14:02:33',
    cmd: 'pnpm typecheck --filter server',
    out: '✔ No errors found.\n',
  },
  {
    id: 'e12', role: 'assistant', timestamp: '14:02:36', streaming: true,
    text: "Clean. Now the Hono route. I'll use the `streamSSE` helper and pipe the async iterator straight through, with a heartbeat every 15s so proxies don't drop the connection…",
  },
];

export function sampleEntriesFor(s: Session): Entry[] {
  return [
    {
      id: `${s.id}-e1`, role: 'user', timestamp: s.startedAt,
      text: s.name ? `Let's work on: ${s.name}.` : 'Help me with this.',
    },
    {
      id: `${s.id}-e2`, role: 'thinking', timestamp: s.startedAt,
      text: 'Planning the approach. Will start with the smallest change that moves the needle.',
    },
    {
      id: `${s.id}-e3`, role: 'assistant', timestamp: s.startedAt,
      text: 'Here is my plan — I will tackle this in three steps and check in after each one.',
    },
    {
      id: `${s.id}-e4`, role: 'toolCall', tool: 'read_file', timestamp: s.startedAt,
      args: { path: `${s.cwd}/src/main.ts` }, preview: '// reading…',
    },
    {
      id: `${s.id}-e5`, role: 'toolResult', tool: 'read_file', ok: true, timestamp: s.startedAt,
      summary: 'read 142 lines',
    },
  ];
}
