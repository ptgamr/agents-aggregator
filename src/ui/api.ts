import { useEffect, useRef, useState } from 'react';
import { splitSessionId, type Entry, type Session, type Source } from '../shared/types';

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export interface SourcesResponse { sources: Source[]; }
export interface SessionsResponse { sessions: Session[]; }
export interface EntriesResponse { entries: Entry[]; }
export interface Project { cwd: string; count: number; latestAt: string; }
export interface ProjectsResponse { projects: Project[]; }

export function useSources(filter: { project?: string | null; q?: string }, refreshKey: number): { data: Source[]; error: Error | null } {
  const [data, setData] = useState<Source[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    if (filter.project) params.set('project', filter.project);
    if (filter.q) params.set('q', filter.q);
    const qs = params.toString();
    fetchJson<SourcesResponse>(`/api/sources${qs ? `?${qs}` : ''}`, ac.signal)
      .then((r) => setData(r.sources))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); });
    return () => ac.abort();
  }, [filter.project, filter.q, refreshKey]);
  return { data, error };
}

export function useSessions(filter: { sourceId?: string | null; q?: string; project?: string | null }, refreshKey: number): { data: Session[]; error: Error | null } {
  const [data, setData] = useState<Session[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    if (filter.sourceId) params.set('source', filter.sourceId);
    if (filter.project) params.set('project', filter.project);
    if (filter.q) params.set('q', filter.q);
    const qs = params.toString();
    fetchJson<SessionsResponse>(`/api/sessions${qs ? `?${qs}` : ''}`, ac.signal)
      .then((r) => setData(r.sessions))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); });
    return () => ac.abort();
  }, [filter.sourceId, filter.project, filter.q, refreshKey]);
  return { data, error };
}

export function useProjects(filter: { sourceId?: string | null; q?: string }, refreshKey: number): { data: Project[]; error: Error | null } {
  const [data, setData] = useState<Project[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    if (filter.sourceId) params.set('source', filter.sourceId);
    if (filter.q) params.set('q', filter.q);
    const qs = params.toString();
    fetchJson<ProjectsResponse>(`/api/projects${qs ? `?${qs}` : ''}`, ac.signal)
      .then((r) => setData(r.projects))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); });
    return () => ac.abort();
  }, [filter.sourceId, filter.q, refreshKey]);
  return { data, error };
}

export function useEntries(sessionId: string | undefined, refreshKey: number): { data: Entry[]; error: Error | null; loading: boolean } {
  const [data, setData] = useState<Entry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  // Track which session the current `data` belongs to so a session switch
  // doesn't render the previous session's entries against the new session's
  // metadata for one frame before the new fetch resolves.
  const dataForSessionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!sessionId) { setData([]); dataForSessionRef.current = undefined; return; }
    if (dataForSessionRef.current !== sessionId) {
      setData([]);
      dataForSessionRef.current = sessionId;
    }
    setLoading(true);
    const ac = new AbortController();
    const parts = splitSessionId(sessionId);
    if (!parts) { setLoading(false); return; }
    fetchJson<EntriesResponse>(`/api/sessions/${encodeURIComponent(parts.sourceId)}/${encodeURIComponent(parts.sessionId)}/entries`, ac.signal)
      .then((r) => setData(r.entries))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [sessionId, refreshKey]);
  return { data, error, loading };
}

export interface SessionFile {
  path: string;
  relative: string;
  size: number;
  mtime: number;
  content: string;
}

export interface SessionFileError {
  status: number;
  error: string;
  detail?: string;
  size?: number;
  limit?: number;
}

export async function fetchSessionFile(sessionId: string, filePath: string, signal?: AbortSignal): Promise<SessionFile> {
  const parts = splitSessionId(sessionId);
  if (!parts) throw new Error('bad session id');
  const url = `/api/sessions/${encodeURIComponent(parts.sourceId)}/${encodeURIComponent(parts.sessionId)}/file?path=${encodeURIComponent(filePath)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) {
    let body: { error?: string; detail?: string; size?: number; limit?: number } = {};
    try { body = await r.json() as typeof body; } catch { /* ignore */ }
    const err: SessionFileError = {
      status: r.status,
      error: body.error || `${r.status} ${r.statusText}`,
      detail: body.detail,
      size: body.size,
      limit: body.limit,
    };
    throw err;
  }
  return (await r.json()) as SessionFile;
}

export interface SummaryStatus {
  backend: string;
  text: string;
  createdAt: string;
}

export function useSummaryStatus(sessionId: string | undefined, refreshKey: number): { data: SummaryStatus[]; loading: boolean } {
  const [data, setData] = useState<SummaryStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  useEffect(() => {
    setData([]);
    if (!sessionId) return;
    const parts = splitSessionId(sessionId);
    if (!parts) return;
    const ac = new AbortController();
    setLoading(true);
    fetchJson<{ summaries: SummaryStatus[] }>(
      `/api/sessions/${encodeURIComponent(parts.sourceId)}/${encodeURIComponent(parts.sessionId)}/summary/status`,
      ac.signal,
    )
      .then((r) => setData(r.summaries))
      .catch(() => { /* status probe is best-effort */ })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [sessionId, refreshKey]);
  return { data, loading };
}

export async function sendSessionInput(sessionId: string, text: string): Promise<void> {
  const parts = splitSessionId(sessionId);
  if (!parts) throw new Error('bad session id');
  const r = await fetch(
    `/api/sessions/${encodeURIComponent(parts.sourceId)}/${encodeURIComponent(parts.sessionId)}/input`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json() as { error?: string; detail?: string }; detail = j.detail || j.error || ''; } catch { /* ignore */ }
    throw new Error(detail || `${r.status} ${r.statusText}`);
  }
}

interface ServerEvent {
  type: string;
  sourceId?: string;
  sessionId?: string;
}

/**
 * Subscribe to /api/events; calls onEvent for every server message.
 * EventSource auto-reconnects on transport drops.
 */
export function useEventStream(onEvent: (e: ServerEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  useEffect(() => {
    const es = new EventSource('/api/events');
    const handler = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as ServerEvent;
        onEventRef.current(payload);
      } catch { /* ignore */ }
    };
    es.addEventListener('session_updated', handler as EventListener);
    es.addEventListener('entry', handler as EventListener);
    return () => es.close();
  }, []);
}
