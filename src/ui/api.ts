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

export function useSources(refreshKey: number): { data: Source[]; error: Error | null } {
  const [data, setData] = useState<Source[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetchJson<SourcesResponse>('/api/sources', ac.signal)
      .then((r) => setData(r.sources))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); });
    return () => ac.abort();
  }, [refreshKey]);
  return { data, error };
}

export function useSessions(filter: { sourceId?: string | null; q?: string }, refreshKey: number): { data: Session[]; error: Error | null } {
  const [data, setData] = useState<Session[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    if (filter.sourceId) params.set('source', filter.sourceId);
    if (filter.q) params.set('q', filter.q);
    const qs = params.toString();
    fetchJson<SessionsResponse>(`/api/sessions${qs ? `?${qs}` : ''}`, ac.signal)
      .then((r) => setData(r.sessions))
      .catch((e) => { if (e.name !== 'AbortError') setError(e as Error); });
    return () => ac.abort();
  }, [filter.sourceId, filter.q, refreshKey]);
  return { data, error };
}

export function useEntries(sessionId: string | undefined, refreshKey: number): { data: Entry[]; error: Error | null; loading: boolean } {
  const [data, setData] = useState<Entry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  useEffect(() => {
    if (!sessionId) { setData([]); return; }
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
