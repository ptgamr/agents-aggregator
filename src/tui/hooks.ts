import { useEffect, useState, useCallback, useRef } from 'react';
import { splitSessionId, type Entry, type Session, type Source } from '../shared/types';
import type { Event } from '../server/pubsub';
import {
  fetchEntries,
  fetchProjects,
  fetchSessions,
  fetchSources,
  subscribeEvents,
  type Project,
  type SessionFilter,
} from './api-client';

export function useEvents(handler: (e: Event) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        for await (const ev of subscribeEvents(ac.signal)) handlerRef.current(ev);
      } catch { /* aborted or server gone */ }
    })();
    return () => ac.abort();
  }, []);
}

export function useSources(): Source[] {
  const [sources, setSources] = useState<Source[]>([]);
  const refresh = useCallback(() => {
    fetchSources().then(setSources).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEvents((e) => {
    if (e.type === 'session_updated') refresh();
  });
  return sources;
}

export function useProjects(sourceId: string | null): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);
  const idRef = useRef(sourceId);
  idRef.current = sourceId;
  const refresh = useCallback(() => {
    fetchProjects(idRef.current).then(setProjects).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [sourceId, refresh]);
  useEvents((e) => {
    if (e.type === 'session_updated') refresh();
  });
  return projects;
}

export function useSessions(filter: SessionFilter): Session[] {
  const [sessions, setSessions] = useState<Session[]>([]);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refresh = useCallback(() => {
    fetchSessions(filterRef.current).then(setSessions).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [filter.sourceId, filter.project, refresh]);

  useEvents((e) => {
    if (e.type !== 'session_updated') return;
    const { sourceId } = filterRef.current;
    if (!sourceId || e.sourceId === sourceId) refresh();
  });
  return sessions;
}

export function useEntries(session: Session | null): {
  entries: Entry[];
  loading: boolean;
  error: string | null;
} {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async (s: Session) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    setEntries([]);
    try {
      const sessionId = splitSessionId(s.id)?.sessionId ?? s.id;
      const e = await fetchEntries(s.sourceId, sessionId);
      if (seq === loadSeq.current) setEntries(e);
    } catch (err) {
      if (seq === loadSeq.current) {
        setError((err as Error).message);
        setEntries([]);
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      loadSeq.current++;
      setEntries([]);
      setLoading(false);
      return;
    }
    void load(session);
  }, [session?.sourceId, session?.id, load, session]);

  useEvents((e) => {
    if (!session) return;
    if (e.type !== 'session_updated') return;
    if (e.sourceId !== session.sourceId) return;
    const sessionId = splitSessionId(session.id)?.sessionId ?? session.id;
    if (e.sessionId && sessionId === e.sessionId) {
      void load(session);
    }
  });

  return { entries, loading, error };
}
