import { useEffect, useRef, useState } from 'react';
import { splitSessionId } from '../../shared/types';
import { monoFont, themes, type ThemeMode } from '../theme';
import { Markdown } from './Markdown';

type Backend = 'claude' | 'codex';
type Status = 'idle' | 'streaming' | 'done' | 'error';

interface SummaryMeta {
  cached?: boolean;
  createdAt?: string;
  distilledChars?: number;
  entryCount?: number;
  stale?: boolean;
}

interface SummaryPanelProps {
  theme: ThemeMode;
  sessionId: string;
  onClose?: () => void;
}

export function SummaryPanel({ theme, sessionId, onClose }: SummaryPanelProps) {
  const t = themes[theme];
  const [backend, setBackend] = useState<Backend | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState<string>('');
  const [meta, setMeta] = useState<SummaryMeta | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>('');
  const esRef = useRef<EventSource | null>(null);

  // Cancel any in-flight stream on unmount or restart.
  useEffect(() => () => { esRef.current?.close(); }, []);

  const freshStartedRef = useRef<boolean>(false);

  function start(b: Backend, force = false) {
    esRef.current?.close();
    setBackend(b);
    setText('');
    setMeta(null);
    setErrorDetail('');
    setStatus('streaming');
    freshStartedRef.current = false;

    const parts = splitSessionId(sessionId);
    if (!parts) { setStatus('error'); setErrorDetail('bad session id'); return; }

    const qs = new URLSearchParams({ backend: b });
    if (force) qs.set('force', '1');
    const url = `/api/sessions/${encodeURIComponent(parts.sourceId)}/${encodeURIComponent(parts.sessionId)}/summary?${qs.toString()}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('meta', (ev) => {
      try { setMeta(JSON.parse((ev as MessageEvent).data) as SummaryMeta); } catch { /* ignore */ }
    });
    es.addEventListener('status', () => { /* not surfaced for now */ });
    es.addEventListener('stale', (ev) => {
      // Show the previous summary as placeholder while a fresh one generates.
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { text?: string };
        if (data.text) setText(data.text);
      } catch { /* ignore */ }
    });
    es.addEventListener('chunk', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { text?: string };
        if (!data.text) return;
        if (!freshStartedRef.current) {
          // First fresh chunk: wipe any stale placeholder, start accumulating.
          freshStartedRef.current = true;
          setText(data.text);
        } else {
          setText((prev) => prev + data.text!);
        }
      } catch { /* ignore */ }
    });
    es.addEventListener('done', () => { setStatus('done'); es.close(); });
    es.addEventListener('error', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { detail?: string };
        setErrorDetail(data.detail || '');
      } catch { /* ignore */ }
      setStatus('error');
      es.close();
    });
  }

  const tabBtnStyle = (active: boolean) => ({
    background: active ? t.panel2 : 'transparent',
    border: `1px solid ${active ? t.accent : t.border}`,
    color: active ? t.fg : t.fg2,
    padding: '4px 10px', borderRadius: 5, fontFamily: monoFont, fontSize: 12,
    cursor: 'pointer',
  } as const);

  const statusLabel = (() => {
    if (status === 'idle') return 'pick a backend';
    if (status === 'error') return `${backend} • error`;
    if (status === 'streaming') {
      if (meta?.stale) return `${backend} • regenerating (showing stale)…`;
      return `${backend} • streaming…`;
    }
    // done
    if (meta?.cached) return `${backend} • cached${meta.createdAt ? ` ${formatAge(meta.createdAt)}` : ''}`;
    if (meta?.entryCount != null && meta.distilledChars != null) {
      return `${backend} • done • ${meta.entryCount} entries → ${meta.distilledChars.toLocaleString()} chars`;
    }
    return `${backend} • done`;
  })();

  return (
    <div style={{
      border: `1px solid ${t.border}`, borderRadius: 8,
      background: t.panel, margin: '10px 0',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderBottom: `1px solid ${t.border}`,
        background: t.panel2,
        fontFamily: monoFont, fontSize: 12,
      }}>
        <span style={{ color: t.fg, fontWeight: 600 }}>Summary</span>
        <button
          onClick={() => start('claude')}
          style={tabBtnStyle(backend === 'claude')}
          disabled={status === 'streaming'}
          title="Summarize with Claude Haiku"
        >Claude</button>
        <button
          onClick={() => start('codex')}
          style={tabBtnStyle(backend === 'codex')}
          disabled={status === 'streaming'}
          title="Summarize with Codex"
        >Codex</button>
        <span style={{ color: status === 'error' ? (t.amber ?? '#c47') : t.dim, marginLeft: 4 }}>
          {statusLabel}
        </span>
        {backend && status === 'done' && (
          <button
            onClick={() => start(backend, true)}
            style={tabBtnStyle(false)}
            title="Regenerate, ignoring cache"
          >Regenerate</button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 'none', color: t.dim,
              fontSize: 16, cursor: 'pointer', padding: '0 4px',
            }}
            aria-label="Close summary"
            title="Close"
          >×</button>
        )}
      </div>

      <div style={{ padding: '12px 16px', maxHeight: 480, overflow: 'auto' }}>
        {status === 'idle' && (
          <div style={{ color: t.dim, fontSize: 13, fontFamily: monoFont }}>
            Click Claude or Codex above to generate a summary.
          </div>
        )}
        {status === 'error' && (
          <div style={{ color: t.amber ?? '#c47', fontSize: 12, fontFamily: monoFont, whiteSpace: 'pre-wrap' }}>
            {errorDetail || 'Summary failed.'}
          </div>
        )}
        {text && <Markdown theme={theme} content={text} />}
        {status === 'streaming' && !text && (
          <div style={{ color: t.dim, fontSize: 13, fontFamily: monoFont }}>distilling and waiting on {backend}…</div>
        )}
      </div>
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
