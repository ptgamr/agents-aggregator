import { useEffect, useRef, useState } from 'react';
import type { Entry, Session, Source } from '../../shared/types';
import type { BlurredProjects } from '../hooks/useBlurredProjects';
import { sendSessionInput } from '../api';
import { lastPathSegment, relativeTime } from '../format';
import { AgentChip, LivePip } from './AgentChip';
import { EntryBlock } from './EntryBlock';
import { TimelineView } from './TimelineView';
import {
  monoFont, themes,
  type AgentTreatment, type DetailShape, type ThemeMode,
} from '../theme';

interface SessionDetailProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  loud: boolean;
  shape: DetailShape;
  session: Session | undefined;
  sources: Source[];
  entries: Entry[];
  selectedEntryId: string | undefined;
  setSelectedEntryId: (id: string) => void;
  loading?: boolean;
  onBack?: () => void;
  blurred: BlurredProjects;
}

export function SessionDetail({
  theme, treatment, dense, loud, shape, session, sources, entries, selectedEntryId, setSelectedEntryId, loading, onBack, blurred,
}: SessionDetailProps) {
  const t = themes[theme];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef<number>(entries.length);

  useEffect(() => {
    if (entries.length > lastCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = entries.length;
  }, [entries.length]);

  if (!session) return <div style={{ background: t.bg }} />;

  const sourceLabel = (sources.find((x) => x.id === session.sourceId) || { label: '' }).label;
  const sessionBlurred = blurred.has(session.cwd);

  const pad = onBack ? 12 : 22;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: t.bg }}>
      <div style={{ padding: `14px ${pad}px`, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          {onBack && (
            <button onClick={onBack} aria-label="Back to sessions" style={{
              background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6,
              color: t.fg2, padding: '4px 10px', fontSize: 15, lineHeight: 1, cursor: 'pointer',
            }}>‹</button>
          )}
          <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
            <AgentChip agent={session.agent} label={sourceLabel}
                       theme={theme} treatment={treatment} dense={false} />
          </span>
          {session.live && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
              color: t.green, fontSize: 12, fontFamily: monoFont }}>
              <LivePip theme={theme} loud={loud} size={6} />
              {session.status}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontFamily: monoFont, fontSize: 12, color: t.dim2 }}>
            <span style={{ padding: '3px 8px', background: t.panel, border: `1px solid ${t.border}`, borderRadius: 4 }}>fork</span>
            <span style={{ padding: '3px 8px', background: t.panel, border: `1px solid ${t.border}`, borderRadius: 4 }}>share</span>
            <span style={{ padding: '3px 8px', background: t.panel, border: `1px solid ${t.border}`, borderRadius: 4 }}>⋯</span>
          </div>
        </div>
        <div
          className={sessionBlurred ? 'blur-text' : undefined}
          style={{ fontSize: 18, fontWeight: 600, color: t.fg, letterSpacing: '-0.005em' }}
        >
          {session.name || <span style={{ color: t.dim2, fontStyle: 'italic', fontWeight: 400 }}>Untitled session</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: t.dim, marginTop: 6, fontFamily: monoFont, flexWrap: 'wrap' }}>
          <span
            title={sessionBlurred ? undefined : session.cwd}
            className={sessionBlurred ? 'blur-text' : undefined}
          >{lastPathSegment(session.cwd)}</span>
          <span>{session.model}</span>
          <span title={session.updatedAt}>{relativeTime(session.updatedAt)}</span>
          <span>${session.costUsd?.toFixed(2) ?? '—'}</span>
          <span>{entries.length} entries</span>
          {session.branches > 0 && <span style={{ color: t.amber }}>{session.branches} branches</span>}
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 4, padding: `0 ${pad}px`,
        borderBottom: `1px solid ${t.border}`,
      }}>
        {(['chat', 'timeline', 'inspect'] as const).map((mode) => (
          <div key={mode} style={{
            padding: '8px 12px', fontSize: 12.5, fontFamily: monoFont,
            color: shape === mode ? t.fg : t.dim,
            borderBottom: shape === mode ? `2px solid ${t.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{mode}</div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
          color: t.dim2, fontSize: 11.5, fontFamily: monoFont }}>
          <span>autoscroll ▸</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, minWidth: 0, overflow: 'auto',
          padding: shape === 'timeline' ? '0' : `6px ${pad}px 20px`,
          filter: sessionBlurred ? 'blur(7px)' : undefined,
          userSelect: sessionBlurred ? 'none' : undefined,
        }}
      >
        {loading && entries.length === 0 && (
          <div style={{ padding: 24, color: t.dim, fontSize: 13, fontFamily: monoFont }}>loading entries…</div>
        )}
        {shape === 'timeline' ? (
          <TimelineView theme={theme} entries={entries}
                        selectedEntryId={selectedEntryId}
                        setSelectedEntryId={setSelectedEntryId} loud={loud} />
        ) : (
          <ChatView theme={theme} treatment={treatment} dense={dense}
                    entries={entries} session={session}
                    selectedEntryId={selectedEntryId} setSelectedEntryId={setSelectedEntryId}
                    compact={shape === 'inspect'} />
        )}
      </div>

      {session.live && <SendBox theme={theme} session={session} pad={pad} />}
    </div>
  );
}

interface SendBoxProps { theme: ThemeMode; session: Session; pad: number; }
function SendBox({ theme, session, pad }: SendBoxProps) {
  const t = themes[theme];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await sendSessionInput(session.id, text);
      setText('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${t.border}`, padding: `10px ${pad}px 14px`, background: t.bg }}>
      {err && (
        <div style={{ color: t.amber ?? '#c47', fontFamily: monoFont, fontSize: 12, marginBottom: 6 }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message to inject into the live pane (Cmd/Ctrl+Enter to send)"
          rows={2}
          disabled={busy}
          style={{
            flex: 1, resize: 'vertical', minHeight: 36, maxHeight: 200,
            background: t.panel, color: t.fg, border: `1px solid ${t.border}`,
            borderRadius: 6, padding: '8px 10px',
            fontFamily: monoFont, fontSize: 13, lineHeight: 1.45,
            outline: 'none',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          style={{
            background: t.accent, color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 14px',
            fontFamily: monoFont, fontSize: 13, fontWeight: 600,
            cursor: busy || !text.trim() ? 'default' : 'pointer',
            opacity: busy || !text.trim() ? 0.5 : 1,
          }}
        >
          {busy ? 'sending…' : 'send'}
        </button>
      </div>
    </div>
  );
}

interface ChatViewProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  entries: Entry[];
  session: Session;
  selectedEntryId: string | undefined;
  setSelectedEntryId: (id: string) => void;
  compact: boolean;
}

function ChatView({ theme, treatment, entries, session, selectedEntryId, setSelectedEntryId, compact }: ChatViewProps) {
  return (
    <div>
      {entries.map((e, i) => (
        <EntryBlock key={e.id} entry={e} theme={theme} session={session}
                    compact={compact} treatment={treatment}
                    isNew={i === entries.length - 1}
                    selected={e.id === selectedEntryId}
                    onSelect={() => setSelectedEntryId(e.id)} />
      ))}
    </div>
  );
}
