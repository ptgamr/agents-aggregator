import { useEffect, useRef, useState } from 'react';
import type { Entry, Session, Source } from '../../shared/types';
import type { BlurredProjects } from '../hooks/useBlurredProjects';
import { sendSessionInput, useSummaryStatus } from '../api';
import { lastPathSegment, relativeTime } from '../format';
import { ProposalSheet } from '../journal/ProposalSheet';
import { SelectionCaptureToolbar } from '../journal/SelectionCaptureToolbar';
import { SummarizeButton } from '../journal/SummarizeButton';
import type { JournalKind, JournalProposal } from '../journal/types';
import { AgentChip, LivePip } from './AgentChip';
import { EntryBlock } from './EntryBlock';
import { PinGlyph } from './PinGlyph';
import { SummaryPanel } from './SummaryPanel';
import {
  monoFont, themes,
  type AgentTreatment, type SummarizeBackend, type Theme, type ThemeMode,
} from '../theme';

type ViewMode = 'chat' | 'reader';

interface SessionDetailProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  loud: boolean;
  session: Session | undefined;
  sources: Source[];
  entries: Entry[];
  selectedEntryId: string | undefined;
  setSelectedEntryId: (id: string) => void;
  loading?: boolean;
  onBack?: () => void;
  blurred: BlurredProjects;
  /** When `true`, render in full-bleed tab mode: bigger title, ~880px reading column,
   *  and a "← Home" button instead of Pin / Open-in-tab. */
  inTab: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onOpenInTab: () => void;
  onBackHome?: () => void;
  /** Per-entry capture handler. Omitting it hides the inline capture buttons.
   *  Pass an optional `text` to override the captured body (e.g. when the user
   *  picked a snippet via the selection toolbar). */
  onCapture?: (entry: Entry, kind: JournalKind, text?: string) => void;
  /** Proposals currently pending for this session (from `summarize → journal`). */
  proposals?: JournalProposal[];
  /** When `true`, the floating proposals panel is visible. */
  proposalsOpen?: boolean;
  /** Click on the summarize button when proposals already exist toggles the
   *  panel via this callback instead of re-running the model. */
  onToggleProposalsPanel?: () => void;
  /** Called once the model returns parsed proposals. */
  onProposals?: (proposals: JournalProposal[]) => void;
  onAcceptProposal?: (p: JournalProposal) => void;
  onAcceptAllProposals?: (ps: JournalProposal[]) => void;
  onDismissProposals?: () => void;
  /** Backend to use for the summarize→journal extractor. */
  summarizeBackend?: SummarizeBackend;
}

export function SessionDetail({
  theme, treatment, dense, loud, session, sources, entries, selectedEntryId, setSelectedEntryId, loading, onBack, blurred,
  inTab, isPinned, onTogglePin, onOpenInTab, onBackHome,
  onCapture,
  proposals, proposalsOpen, onToggleProposalsPanel,
  onProposals, onAcceptProposal, onAcceptAllProposals, onDismissProposals,
  summarizeBackend,
}: SessionDetailProps) {
  const t = themes[theme];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef<number>(entries.length);
  const [mode, setMode] = useState<ViewMode>('chat');
  const [summaryRefresh, setSummaryRefresh] = useState<number>(0);
  const { data: summaryStatus } = useSummaryStatus(session?.id, summaryRefresh);
  const cached = summaryStatus[0];
  const preloadedSummary = cached
    ? {
        backend: (cached.backend === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex',
        text: cached.text,
        createdAt: cached.createdAt,
      }
    : undefined;

  useEffect(() => {
    // Don't auto-scroll to bottom on new entries in reader mode — the summary
    // sits above the chat and we'd scroll the user away from it.
    if (mode === 'chat' && entries.length > lastCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = entries.length;
  }, [entries.length, mode]);

  // Bring the summary into view when switching into reader mode.
  useEffect(() => {
    if (mode === 'reader' && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [mode]);

  if (!session) return <div style={{ background: t.bg }} />;

  const sourceLabel = (sources.find((x) => x.id === session.sourceId) || { label: '' }).label;
  const sessionBlurred = blurred.has(session.cwd);

  const pad = inTab ? 32 : (onBack ? 12 : 22);
  // In tab mode, give the chat a comfortable reading column.
  const innerWrapStyle = inTab
    ? { maxWidth: 880, width: '100%', margin: '0 auto' } as const
    : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: t.bg, flex: 1, position: 'relative' }}>
      <div style={{ padding: `${inTab ? 18 : 14}px ${pad}px`, borderBottom: `1px solid ${t.border}` }}>
        <div style={innerWrapStyle}>
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
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontFamily: monoFont, fontSize: 12, color: t.dim2 }}>
              {inTab ? (
                <button onClick={onBackHome} style={headerBtnStyle(t)} title="Back to Home">← Home</button>
              ) : (
                <>
                  <button
                    onClick={onTogglePin}
                    title={isPinned ? 'Unpin from tabs' : 'Pin as tab'}
                    style={headerBtnStyle(t, isPinned)}
                  >
                    <PinGlyph filled={isPinned} size={11} />
                    <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                  </button>
                  {!isPinned && (
                    <button onClick={onOpenInTab} style={headerBtnStyle(t)}>Open in tab ↗</button>
                  )}
                </>
              )}
              {onProposals && (
                <SummarizeButton
                  theme={theme} session={session}
                  entries={entries} onProposals={onProposals}
                  backend={summarizeBackend}
                  proposalsCount={proposals?.length ?? 0}
                  panelOpen={!!proposalsOpen}
                  onToggle={onToggleProposalsPanel}
                />
              )}
              <button style={headerBtnStyle(t)}>fork</button>
              <button style={headerBtnStyle(t)}>share</button>
              <button style={headerBtnStyle(t)}>⋯</button>
            </div>
          </div>
          <div
            className={sessionBlurred ? 'blur-text' : undefined}
            style={{ fontSize: inTab ? 22 : 18, fontWeight: 600, color: t.fg, letterSpacing: '-0.005em' }}
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
      </div>

      <div style={{
        display: 'flex', gap: 2, padding: `0 ${pad}px`,
        borderBottom: `1px solid ${t.border}`,
      }}>
        <div style={innerWrapStyle}>
          <div style={{ display: 'flex', gap: 2 }}>
            <TabButton theme={theme} active={mode === 'chat'} onClick={() => setMode('chat')}>Chat</TabButton>
            <TabButton theme={theme} active={mode === 'reader'} onClick={() => setMode('reader')}>
              <span>Reader mode</span>
              {cached && (
                <span
                  title={`Summary cached · ${cached.backend}`}
                  style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                    marginLeft: 7, verticalAlign: 'middle',
                    background: t.green,
                  }}
                />
              )}
            </TabButton>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, minWidth: 0, overflow: 'auto',
          padding: `6px ${pad}px 20px`,
          filter: sessionBlurred ? 'blur(7px)' : undefined,
          userSelect: sessionBlurred ? 'none' : undefined,
        }}
      >
        <div style={innerWrapStyle}>
          {mode === 'reader' && (
            <SummaryPanel
              // Key in the cache version so the panel re-initializes when a
              // newly-loaded cached row arrives (status fetch is async, and
              // initial state is set from `preloaded` at mount only).
              key={`${session.id}:${cached?.createdAt ?? 'none'}`}
              theme={theme}
              sessionId={session.id}
              preloaded={preloadedSummary}
              onGenerated={() => setSummaryRefresh((n) => n + 1)}
            />
          )}
          {loading && entries.length === 0 && (
            <div style={{ padding: 24, color: t.dim, fontSize: 13, fontFamily: monoFont }}>loading entries…</div>
          )}
          {/* Reader mode narrows just the transcript for comfortable line length;
              the summary block above stays at the full panel width. */}
          <div style={mode === 'reader'
            ? { maxWidth: 680, width: '100%', margin: '0 auto' } as const
            : undefined}>
            <ChatView theme={theme} treatment={treatment} dense={dense}
                      entries={entries} session={session} readerMode={mode === 'reader'}
                      selectedEntryId={selectedEntryId} setSelectedEntryId={setSelectedEntryId}
                      onCapture={onCapture} />
          </div>
        </div>
      </div>

      {session.live && <SendBox theme={theme} session={session} pad={pad} innerWrapStyle={innerWrapStyle} />}

      {onCapture && (
        <SelectionCaptureToolbar
          theme={theme} entries={entries}
          onCapture={(entry, kind, text) => onCapture(entry, kind, text)}
        />
      )}

      {proposalsOpen && proposals && proposals.length > 0
        && onAcceptProposal && onAcceptAllProposals && onDismissProposals && (
        <ProposalSheet
          floating
          // Sit above the SendBox when the session is live, otherwise hug bottom.
          floatingBottom={session.live ? 92 : 20}
          theme={theme} proposals={proposals}
          projectKey={session.cwd}
          onAccept={onAcceptProposal}
          onAcceptAll={onAcceptAllProposals}
          onDismiss={onDismissProposals}
          onClose={onToggleProposalsPanel}
        />
      )}
    </div>
  );
}

interface TabButtonProps {
  theme: ThemeMode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}
function TabButton({ theme, active, onClick, children }: TabButtonProps) {
  const t = themes[theme];
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', fontSize: 12, fontFamily: monoFont,
      background: 'transparent', border: 'none',
      color: active ? t.fg : t.dim,
      borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
      marginBottom: -1, cursor: 'pointer',
      letterSpacing: '0.01em',
    }}>{children}</button>
  );
}

function headerBtnStyle(t: Theme, active?: boolean) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 8px', borderRadius: 4,
    background: active ? t.panel2 : t.panel,
    border: `1px solid ${active ? t.accent : t.border}`,
    color: active ? t.fg : t.dim,
    fontFamily: monoFont, fontSize: 11, cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  };
}

interface SendBoxProps { theme: ThemeMode; session: Session; pad: number; innerWrapStyle: React.CSSProperties; }
function SendBox({ theme, session, pad, innerWrapStyle }: SendBoxProps) {
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
      <div style={innerWrapStyle}>
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
    </div>
  );
}

interface ChatViewProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  entries: Entry[];
  session: Session;
  readerMode: boolean;
  selectedEntryId: string | undefined;
  setSelectedEntryId: (id: string) => void;
  onCapture?: (entry: Entry, kind: JournalKind) => void;
}

function isReadable(e: Entry): boolean {
  if (e.role !== 'user' && e.role !== 'assistant') return false;
  if (e.text && e.text.trim().length > 0) return true;
  if (e.images && e.images.length > 0) return true;
  return false;
}

function ChatView({ theme, treatment, entries, session, readerMode, selectedEntryId, setSelectedEntryId, onCapture }: ChatViewProps) {
  const t = themes[theme];
  const visible = readerMode ? entries.filter(isReadable) : entries;
  const hidden = readerMode ? entries.length - visible.length : 0;
  // EntryBlock is memoized — keep this callback identity stable per (entry, kind).
  const onEntryCapture = onCapture
    ? (entryId: string, kind: JournalKind) => {
        const entry = visible.find((x) => x.id === entryId);
        if (entry) onCapture(entry, kind);
      }
    : undefined;
  return (
    <div>
      {readerMode && hidden > 0 && (
        <div style={{
          fontFamily: monoFont, fontSize: 11, color: t.dim2,
          padding: '6px 4px 10px', letterSpacing: '0.04em',
        }}>
          reader mode · {hidden} tool / thinking {hidden === 1 ? 'entry' : 'entries'} hidden
        </div>
      )}
      {visible.map((e, i) => (
        <EntryBlock key={e.id} entry={e} theme={theme} session={session}
                    compact={false} treatment={treatment}
                    readable={readerMode}
                    isNew={i === visible.length - 1}
                    selected={e.id === selectedEntryId}
                    onSelect={setSelectedEntryId}
                    onCapture={onEntryCapture} />
      ))}
    </div>
  );
}
