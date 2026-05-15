import type { Entry, Session, Source } from '../shared/types';
import type { Event } from '../server/pubsub';

let BASE = 'http://localhost:3000';

export function setApiBase(url: string): void {
  BASE = url.replace(/\/$/, '');
}

export function apiBase(): string {
  return BASE;
}

export async function fetchSources(): Promise<Source[]> {
  const r = await fetch(`${BASE}/api/sources`);
  if (!r.ok) throw new Error(`sources: HTTP ${r.status}`);
  const { sources } = (await r.json()) as { sources: Source[] };
  return sources;
}

export interface SessionFilter {
  sourceId?: string | null;
  project?: string | null;
}

export async function fetchSessions(filter: SessionFilter = {}): Promise<Session[]> {
  const url = new URL(`${BASE}/api/sessions`);
  if (filter.sourceId) url.searchParams.set('source', filter.sourceId);
  if (filter.project) url.searchParams.set('project', filter.project);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`sessions: HTTP ${r.status}`);
  const { sessions } = (await r.json()) as { sessions: Session[] };
  return sessions;
}

export interface Project {
  cwd: string;
  count: number;
  latestAt: string;
}

export async function fetchProjects(sourceId: string | null = null): Promise<Project[]> {
  const url = new URL(`${BASE}/api/projects`);
  if (sourceId) url.searchParams.set('source', sourceId);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`projects: HTTP ${r.status}`);
  const { projects } = (await r.json()) as { projects: Project[] };
  return projects;
}

export async function fetchEntries(sourceId: string, sessionId: string): Promise<Entry[]> {
  const r = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sourceId)}/${encodeURIComponent(sessionId)}/entries`,
  );
  if (!r.ok) throw new Error(`entries: HTTP ${r.status}`);
  const { entries } = (await r.json()) as { entries: Entry[] };
  return entries;
}

/**
 * SSE subscription via fetch + ReadableStream. We don't use the global
 * EventSource because it doesn't accept AbortSignal in a portable way.
 */
export async function* subscribeEvents(signal: AbortSignal): AsyncGenerator<Event> {
  const res = await fetch(`${BASE}/api/events`, { signal });
  if (!res.ok || !res.body) throw new Error(`events: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Each SSE event is delimited by a blank line.
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = parseSse(chunk);
        if (!parsed) continue;
        if (parsed.event === 'ping' || parsed.event === 'hello') continue;
        try {
          const data = JSON.parse(parsed.data) as Event;
          yield data;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ok */ }
  }
}

function parseSse(chunk: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
