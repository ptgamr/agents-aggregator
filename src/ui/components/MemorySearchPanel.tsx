import { useCallback, useEffect, useRef, useState } from 'react';

interface SearchHit {
  sourceId: string | null;
  sessionId: string | null;
  wing: string;
  room: string;
  sourceFile: string;
  snippet: string;
  scores: { cosine: number | null; bm25: number | null };
  session: {
    agent: string;
    cwd: string | null;
    label: string | null;
    updatedAt: string;
    messageCount: number;
  } | null;
}

interface SearchResponse {
  hits?: SearchHit[];
  error?: string;
  detail?: string;
  note?: string;
}

interface Props {
  theme: 'dark' | 'light';
  open: boolean;
  onClose: () => void;
  onJumpToSession: (compositeId: string) => void;
}

export function MemorySearchPanel({ theme, open, onClose, onJumpToSession }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      // Defer focus until the input has rendered.
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setHits([]);
      setError(null);
      setNote(null);
      abortRef.current?.abort();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setHits([]);
      setError(null);
      setNote(null);
      return;
    }
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/search?q=${encodeURIComponent(query)}&limit=20`;
        const res = await fetch(url, { signal: ac.signal });
        const body: SearchResponse = await res.json();
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setError(body.error ?? `request failed (${res.status})`);
          setHits([]);
        } else {
          setHits(body.hits ?? []);
          setNote(body.note ?? null);
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError((err as Error).message);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, open]);

  const handleHit = useCallback(
    (hit: SearchHit) => {
      if (!hit.sourceId || !hit.sessionId || !hit.session) return;
      onJumpToSession(`${hit.sourceId}:${hit.sessionId}`);
      onClose();
    },
    [onJumpToSession, onClose],
  );

  if (!open) return null;

  const dark = theme === 'dark';
  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(700px, 92vw)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: dark ? '#1a1a1a' : '#fff',
          color: dark ? '#e6e6e6' : '#111',
          border: `1px solid ${dark ? '#333' : '#ccc'}`,
          borderRadius: 8,
          boxShadow: dark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${dark ? '#2a2a2a' : '#eee'}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory across all sessions (MemPalace)…"
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              background: dark ? '#0d0d0d' : '#fff',
              color: dark ? '#e6e6e6' : '#111',
              border: `1px solid ${dark ? '#333' : '#ccc'}`,
              borderRadius: 6,
              outline: 'none',
            }}
          />
          <div style={{ fontSize: 11, marginTop: 6, color: dark ? '#888' : '#666' }}>
            {loading ? 'searching…' : note ?? ` `}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ padding: '12px 14px', color: '#e57373' }}>
              {error}
            </div>
          )}
          {!error && hits.length === 0 && !loading && query.trim() && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: dark ? '#888' : '#666' }}>
              No hits.
            </div>
          )}
          {hits.map((h, idx) => {
            const navigable = !!(h.sourceId && h.sessionId && h.session);
            return (
              <button
                key={`${h.sourceFile}-${idx}`}
                onClick={() => handleHit(h)}
                disabled={!navigable}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderTop: idx === 0 ? 'none' : `1px solid ${dark ? '#2a2a2a' : '#eee'}`,
                  background: 'transparent',
                  color: 'inherit',
                  cursor: navigable ? 'pointer' : 'default',
                  opacity: navigable ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (navigable) e.currentTarget.style.background = dark ? '#252525' : '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 11, color: dark ? '#999' : '#666', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{h.wing}</span> · {h.room}
                  {h.session?.cwd && <span> · {h.session.cwd}</span>}
                  {h.scores.cosine != null && (
                    <span style={{ marginLeft: 8, color: dark ? '#666' : '#999' }}>
                      cos={h.scores.cosine.toFixed(2)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {h.snippet || '(no snippet)'}
                </div>
                {!navigable && (
                  <div style={{ fontSize: 11, marginTop: 4, color: dark ? '#777' : '#888' }}>
                    Source: {h.sourceFile} (not in local index)
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: '6px 14px',
            borderTop: `1px solid ${dark ? '#2a2a2a' : '#eee'}`,
            fontSize: 11,
            color: dark ? '#777' : '#888',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Esc to close · Click a hit to open the session</span>
          <span>{hits.length > 0 && `${hits.length} hits`}</span>
        </div>
      </div>
    </div>
  );
}
