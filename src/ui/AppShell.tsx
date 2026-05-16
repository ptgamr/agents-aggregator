import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { composeSessionId, type Entry, type Session } from '../shared/types';
import {
  TWEAK_DEFAULTS,
  backendModelLabel,
  monoFont,
  sansFont,
  themes,
  type AgentTreatment,
  type Density,
  type SummarizeBackend,
  type ThemeMode,
} from './theme';
import { useTweaks } from './hooks/useTweaks';
import { useBreakpoint } from './hooks/useBreakpoint';
import { useBlurredProjects } from './hooks/useBlurredProjects';
import { useEntries, useEventStream, useProjects, useSessions, useSources } from './api';
import { JournalView } from './journal/JournalView';
import { JournalToast, type ToastState } from './journal/JournalToast';
import {
  projectKeyFor,
  type JournalKind,
  type JournalProposal,
} from './journal/types';
import { useJournal } from './journal/useJournal';
import { TopBar } from './components/TopBar';
import { SourcesRail } from './components/SourcesRail';
import { SessionList } from './components/SessionList';
import { SessionDetail } from './components/SessionDetail';
import { TabBar, type TabSession } from './components/TabBar';
import { MemorySearchPanel } from './components/MemorySearchPanel';
import { MemoryProjectsPanel } from './components/MemoryProjectsPanel';
import { LightboxProvider } from './components/Lightbox';
import { FilePreviewProvider } from './components/FilePreview';
import {
  TweakRadio,
  TweakSection,
  TweakSelect,
  TweakToggle,
  TweaksPanel,
} from './components/TweaksPanel';
import { indexRoute, sessionRoute } from './router';

const THEME_OPTS = ['dark', 'light'] as const satisfies readonly ThemeMode[];
const DENSITY_OPTS = ['compact', 'comfy'] as const satisfies readonly Density[];
const TREATMENT_OPTS = ['chip', 'letter', 'text'] as const satisfies readonly AgentTreatment[];
const BACKEND_OPTS = ['claude', 'codex'] as const satisfies readonly SummarizeBackend[];

const HOME_TAB = 'home';
const JOURNAL_TAB = 'journal';
const PINNED_KEY = 'aa.pinnedSessionIds';
const ACTIVE_TAB_KEY = 'aa.activeTab';
const TOAST_MS = 5000;

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function loadActiveTab(): string {
  try { return localStorage.getItem(ACTIVE_TAB_KEY) || HOME_TAB; } catch { return HOME_TAB; }
}

/**
 * Reads `activeId` from the URL path and `source`/`q` from the search params.
 * Both routes render this same shell.
 */
export function AppShell() {
  const navigate = useNavigate();

  // Either the session route is active and supplies an id, or we're on '/'.
  const sessionMatch = useMatch({ from: sessionRoute.id, shouldThrow: false });
  const indexMatch = useMatch({ from: indexRoute.id, shouldThrow: false });
  const activeId = sessionMatch?.params.id;
  const search = (sessionMatch?.search ?? indexMatch?.search ?? {}) as { source?: string; q?: string; project?: string };
  const sourceFilter = search.source ?? null;
  const projectFilter = search.project ?? null;
  const searchQ = search.q ?? '';

  const [tw, setTw] = useTweaks(TWEAK_DEFAULTS);
  const t = themes[tw.theme];
  const dense = tw.density === 'compact';
  const bp = useBreakpoint();
  const blurred = useBlurredProjects();

  // ── Tabs state (persisted) ─────────────────────────────────────────────
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinned);
  const [activeTab, setActiveTab] = useState<string>(loadActiveTab);
  useEffect(() => {
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds)); } catch { /* ignore */ }
  }, [pinnedIds]);
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_TAB_KEY, activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [tweaksOpen, setTweaksOpen] = useState<boolean>(false);
  const [memorySearchOpen, setMemorySearchOpen] = useState<boolean>(false);
  const [memoryProjectsOpen, setMemoryProjectsOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [streamRefreshKey, setStreamRefreshKey] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>(searchQ);

  // Keep input synced when the URL changes (e.g. back/forward).
  useEffect(() => { setSearchInput(searchQ); }, [searchQ]);

  // Debounce committing the search input to the URL so we don't push history on every keystroke.
  useEffect(() => {
    if (searchInput === searchQ) return;
    const id = setTimeout(() => {
      void navigate({
        to: '.',
        search: (prev) => ({ ...prev, q: searchInput || undefined }),
        replace: true,
      });
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput, searchQ, navigate]);

  const { data: sources } = useSources({ project: projectFilter, q: searchQ || undefined }, refreshKey);
  const { data: projects } = useProjects({ sourceId: sourceFilter, q: searchQ || undefined }, refreshKey);
  const { data: sessions } = useSessions({ sourceId: sourceFilter, project: projectFilter, q: searchQ || undefined }, refreshKey);

  // The live-stream subscription follows whichever session is being shown:
  // pinned tab's session if in tab view, else Home's selected session.
  // (No stream needed for the Journal tab — pass undefined.)
  const streamId = activeTab === HOME_TAB
    ? activeId
    : (activeTab === JOURNAL_TAB ? undefined : activeTab);
  const { data: entries, loading: entriesLoading } = useEntries(streamId, streamRefreshKey);

  // ── Journal state ───────────────────────────────────────────────────────
  const journal = useJournal();
  interface ProposalsState { proposals: JournalProposal[]; open: boolean; }
  const [proposalsBySession, setProposalsBySession] = useState<Record<string, ProposalsState>>({});
  const [journalProjectKey, setJournalProjectKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Cache session metadata for pinned ids so a filtered list doesn't blank out tabs.
  const pinnedMetaRef = useRef<Map<string, TabSession>>(new Map());
  useEffect(() => {
    for (const s of sessions) {
      if (pinnedIds.includes(s.id)) {
        pinnedMetaRef.current.set(s.id, { id: s.id, name: s.name, agent: s.agent, live: s.live });
      }
    }
  }, [sessions, pinnedIds]);

  // Default-navigate to the first session once the list loads — but never on
  // narrow screens, where the list itself is the landing view, and never when
  // we're in a tab view (pinned or journal).
  useEffect(() => {
    if (bp === 'sm') return;
    if (activeTab !== HOME_TAB) return;
    if (!activeId && sessions.length > 0) {
      void navigate({
        to: '/session/$id',
        params: { id: sessions[0].id },
        search: (prev) => prev,
        replace: true,
      });
    }
  }, [activeId, sessions, navigate, bp, activeTab]);

  const goToList = useCallback(() => {
    void navigate({ to: '/', search: (prev) => prev, replace: true });
  }, [navigate]);

  const setActiveId = useCallback((id: string) => {
    setSelectedEntryId(undefined);
    void navigate({ to: '/session/$id', params: { id }, search: (prev) => prev });
  }, [navigate]);

  // Cmd/Ctrl+K opens the memory search overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMemorySearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setSourceFilter = useCallback((id: string | null) => {
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, source: id ?? undefined }),
      replace: true,
    });
  }, [navigate]);

  const setProjectFilter = useCallback((cwd: string | null) => {
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, project: cwd ?? undefined }),
      replace: true,
    });
  }, [navigate]);

  // ── Tab helpers ─────────────────────────────────────────────────────────
  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);
  const togglePin = useCallback((id: string) => {
    setPinnedIds((arr) => {
      if (arr.includes(id)) {
        setActiveTab((cur) => (cur === id ? HOME_TAB : cur));
        return arr.filter((x) => x !== id);
      }
      return [...arr, id];
    });
  }, []);
  const openInTab = useCallback((id: string) => {
    setPinnedIds((arr) => (arr.includes(id) ? arr : [...arr, id]));
    setActiveTab(id);
  }, []);
  const goHomeTab = useCallback(() => setActiveTab(HOME_TAB), []);

  // ── Journal handlers ────────────────────────────────────────────────────
  const jumpToJournal = useCallback((projectKey: string) => {
    setJournalProjectKey(projectKey);
    setActiveTab(JOURNAL_TAB);
  }, []);

  const jumpToSession = useCallback((sessionId: string) => {
    setActiveTab(HOME_TAB);
    void navigate({ to: '/session/$id', params: { id: sessionId }, search: (prev) => prev });
  }, [navigate]);

  const handleCapture = useCallback((entry: Entry, kind: JournalKind, session: Session, overrideText?: string) => {
    const projectKey = projectKeyFor(session.cwd);
    const body = (overrideText ?? entry.text ?? '').slice(0, 8000).trim() || '(no text)';
    const created = journal.add({
      kind, text: body,
      projectKey,
      agent: session.agent,
      sourceSessionId: session.id,
      sourceEntryId: entry.id,
    });
    // Default to landing on the just-captured project when the user opens
    // the Journal tab.
    setJournalProjectKey(projectKey);
    setToast({
      kind, projectKey,
      onView: () => { jumpToJournal(projectKey); setToast(null); },
      onUndo: () => { journal.remove(created.id); setToast(null); },
    });
  }, [journal, jumpToJournal]);

  /** Set proposals + auto-open the floating panel (fresh model results). */
  const setProposalsFor = useCallback((sessionId: string, proposals: JournalProposal[]) => {
    setProposalsBySession((prev) => ({ ...prev, [sessionId]: { proposals, open: true } }));
  }, []);
  const clearProposalsFor = useCallback((sessionId: string) => {
    setProposalsBySession((prev) => {
      if (!(sessionId in prev)) return prev;
      const { [sessionId]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);
  /** Toggle the floating panel without dropping the cached proposals. */
  const toggleProposalsPanel = useCallback((sessionId: string) => {
    setProposalsBySession((prev) => {
      const cur = prev[sessionId];
      if (!cur) return prev;
      return { ...prev, [sessionId]: { ...cur, open: !cur.open } };
    });
  }, []);
  const acceptProposal = useCallback((sessionId: string, p: JournalProposal) => {
    journal.add(p);
    setProposalsBySession((prev) => {
      const cur = prev[sessionId];
      if (!cur) return prev;
      const next = cur.proposals.filter((x) => x !== p);
      if (next.length === 0) {
        const { [sessionId]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [sessionId]: { ...cur, proposals: next } };
    });
    setJournalProjectKey(p.projectKey);
  }, [journal]);
  const acceptAllProposals = useCallback((sessionId: string, ps: JournalProposal[]) => {
    if (ps.length === 0) return;
    journal.addMany(ps);
    setJournalProjectKey(ps[0].projectKey);
    clearProposalsFor(sessionId);
  }, [journal, clearProposalsFor]);

  // Live updates: any session change → bump list; if it matches the stream, bump entries too.
  const onEvent = useCallback((e: { type: string; sourceId?: string; sessionId?: string }) => {
    if (e.type === 'session_updated') {
      setRefreshKey((k) => k + 1);
      const id = composeSessionId(e.sourceId ?? '', e.sessionId ?? '');
      if (id === streamId) setStreamRefreshKey((k) => k + 1);
    }
  }, [streamId]);
  useEventStream(onEvent);

  // Which session is in focus (right pane on Home, or the tab view)?
  const homeSession = sessions.find((s) => s.id === activeId);
  const tabSession = activeTab === HOME_TAB || activeTab === JOURNAL_TAB
    ? undefined
    : sessions.find((s) => s.id === activeTab);
  const focusedSession = activeTab === HOME_TAB ? homeSession : tabSession;
  const selectedEntry =
    entries.find((e) => e.id === selectedEntryId) || entries[entries.length - 1];

  const liveCount = useMemo(() => sessions.filter((s) => s.live).length, [sessions]);

  // Pinned sessions for the tab bar: use freshest data from `sessions`, fall back to cached metadata.
  const pinnedSessions: TabSession[] = useMemo(() => {
    return pinnedIds.map((id) => {
      const fresh = sessions.find((s) => s.id === id);
      if (fresh) return { id: fresh.id, name: fresh.name, agent: fresh.agent, live: fresh.live };
      return pinnedMetaRef.current.get(id) ?? { id, name: null, agent: 'claude' as Session['agent'], live: false };
    });
  }, [pinnedIds, sessions]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // ⌘1..9 — switch tabs by index (1 = Home)
      if (!ev.shiftKey && !ev.altKey && /^[1-9]$/.test(ev.key)) {
        const idx = Number(ev.key) - 1;
        if (idx === 0) { ev.preventDefault(); setActiveTab(HOME_TAB); return; }
        const target = pinnedIds[idx - 1];
        if (target) { ev.preventDefault(); setActiveTab(target); }
        return;
      }
      // ⌘W on a session tab — unpin + back to Home. (Journal tab is fixed.)
      if (!ev.shiftKey && !ev.altKey && (ev.key === 'w' || ev.key === 'W')) {
        if (activeTab !== HOME_TAB && activeTab !== JOURNAL_TAB) {
          ev.preventDefault();
          togglePin(activeTab);
        }
        return;
      }
      // ⌘⇧P — toggle pin on focused session
      if (ev.shiftKey && (ev.key === 'p' || ev.key === 'P')) {
        const target = focusedSession?.id;
        if (target) { ev.preventDefault(); togglePin(target); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinnedIds, activeTab, togglePin, focusedSession?.id]);

  const inSessionTab = activeTab !== HOME_TAB && activeTab !== JOURNAL_TAB;
  const inJournalTab = activeTab === JOURNAL_TAB;

  // Pick which session's proposals to show in the SessionDetail. On Home that's
  // the focused session; in a pinned tab it's the tab session.
  const detailSessionId = inSessionTab ? activeTab : (focusedSession?.id ?? null);
  const detailProposalsState = detailSessionId ? proposalsBySession[detailSessionId] : undefined;
  const detailProposals = detailProposalsState?.proposals;
  const detailProposalsOpen = !!detailProposalsState?.open;

  return (
    <LightboxProvider>
    <FilePreviewProvider theme={tw.theme}>
    <div style={{
      width: '100%', height: '100%', background: t.bg, color: t.fg,
      fontFamily: sansFont, fontSize: 14, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pip { 0%,100%{opacity:.55} 50%{opacity:1} }
        @keyframes caret { 50% { opacity: 0; } }
        @keyframes enterRow {
          from { background: ${t.green}22; transform: translateY(-2px); opacity:.5; }
          to   { background: transparent; transform: translateY(0); opacity:1; }
        }
        @keyframes enterStrong {
          from { background: ${t.green}44; }
          to   { background: transparent; }
        }
        ::-webkit-scrollbar { width: 12px; height: 12px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${t.dim2};
          border-radius: 6px;
          border: 3px solid transparent;
          background-clip: padding-box;
          min-height: 40px;
          min-width: 40px;
        }
        ::-webkit-scrollbar-thumb:hover { background: ${t.dim}; background-clip: padding-box; }
        ::-webkit-scrollbar-corner { background: transparent; }
        * { scrollbar-width: thin; scrollbar-color: ${t.dim2} transparent; }
        input::placeholder { color: ${t.dim2}; }
        button { font-family: ${monoFont}; }
        .blur-text { filter: blur(5px); user-select: none; }
        .journal-entry-host .journal-capture-row { opacity: 0; }
        .journal-entry-host:hover .journal-capture-row { opacity: 1; }
      `}</style>

      <TopBar
        theme={tw.theme}
        liveCount={liveCount}
        search={searchInput}
        setSearch={setSearchInput}
        onToggleTheme={() => setTw('theme', tw.theme === 'dark' ? 'light' : 'dark')}
        onToggleTweaks={() => setTweaksOpen((v) => !v)}
        onOpenMemory={() => setMemoryProjectsOpen(true)}
        compact={bp === 'sm'}
      />

      <TabBar
        theme={tw.theme}
        pinnedSessions={pinnedSessions}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onUnpin={togglePin}
        loud={tw.liveLoud}
      />

      {inJournalTab ? (
        <JournalView
          theme={tw.theme}
          journal={journal}
          projectKey={journalProjectKey}
          setProjectKey={setJournalProjectKey}
          sessions={sessions}
          onJumpToSession={jumpToSession}
        />
      ) : inSessionTab ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <SessionDetail
            theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
            loud={tw.liveLoud}
            session={focusedSession} sources={sources} entries={entries}
            selectedEntryId={selectedEntry?.id}
            setSelectedEntryId={setSelectedEntryId}
            loading={entriesLoading}
            blurred={blurred}
            inTab
            isPinned
            onTogglePin={() => focusedSession && togglePin(focusedSession.id)}
            onOpenInTab={() => focusedSession && openInTab(focusedSession.id)}
            onBackHome={goHomeTab}
            onCapture={focusedSession && tw.journalCapture ? (entry, kind, text) => handleCapture(entry, kind, focusedSession, text) : undefined}
            proposals={detailProposals}
            proposalsOpen={detailProposalsOpen}
            onToggleProposalsPanel={focusedSession ? () => toggleProposalsPanel(focusedSession.id) : undefined}
            onProposals={focusedSession ? (ps) => setProposalsFor(focusedSession.id, ps) : undefined}
            onAcceptProposal={focusedSession ? (p) => acceptProposal(focusedSession.id, p) : undefined}
            onAcceptAllProposals={focusedSession ? (ps) => acceptAllProposals(focusedSession.id, ps) : undefined}
            onDismissProposals={focusedSession ? () => clearProposalsFor(focusedSession.id) : undefined}
            summarizeBackend={tw.summarizeBackend}
          />
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: gridColumns({ bp, hasActive: !!activeId }),
          gridTemplateRows: 'minmax(0, 1fr)',
          minHeight: 0,
        }}>
          {bp === 'lg' && (
            <SourcesRail
              theme={tw.theme} treatment={tw.agentTreatment}
              sources={sources}
              filter={sourceFilter} setFilter={setSourceFilter}
              projects={projects}
              projectFilter={projectFilter} setProjectFilter={setProjectFilter}
              dense={dense}
              blurred={blurred}
            />
          )}

          {(bp !== 'sm' || !activeId) && (
            <SessionList
              theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
              sessions={sessions} sources={sources}
              activeId={activeId ?? ''} setActiveId={setActiveId}
              loud={tw.liveLoud}
              blurred={blurred}
              isPinned={isPinned}
              onTogglePin={togglePin}
              onOpenInTab={openInTab}
            />
          )}

          {(bp !== 'sm' || activeId) && (
            <SessionDetail
              theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
              loud={tw.liveLoud}
              session={focusedSession} sources={sources} entries={entries}
              selectedEntryId={selectedEntry?.id}
              setSelectedEntryId={setSelectedEntryId}
              loading={entriesLoading}
              onBack={bp === 'sm' ? goToList : undefined}
              blurred={blurred}
              inTab={false}
              isPinned={focusedSession ? isPinned(focusedSession.id) : false}
              onTogglePin={() => focusedSession && togglePin(focusedSession.id)}
              onOpenInTab={() => focusedSession && openInTab(focusedSession.id)}
              onCapture={focusedSession && tw.journalCapture ? (entry, kind, text) => handleCapture(entry, kind, focusedSession, text) : undefined}
              proposals={detailProposals}
              proposalsOpen={detailProposalsOpen}
              onToggleProposalsPanel={focusedSession ? () => toggleProposalsPanel(focusedSession.id) : undefined}
              onProposals={focusedSession ? (ps) => setProposalsFor(focusedSession.id, ps) : undefined}
              onAcceptProposal={focusedSession ? (p) => acceptProposal(focusedSession.id, p) : undefined}
              onAcceptAllProposals={focusedSession ? (ps) => acceptAllProposals(focusedSession.id, ps) : undefined}
              onDismissProposals={focusedSession ? () => clearProposalsFor(focusedSession.id) : undefined}
              summarizeBackend={tw.summarizeBackend}
            />
          )}
        </div>
      )}

      <JournalToast theme={tw.theme} toast={toast} onDismiss={() => setToast(null)} />

      <TweaksPanel title="Tweaks" open={tweaksOpen} onClose={() => setTweaksOpen(false)}>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={tw.theme} options={THEME_OPTS}
                    onChange={(v) => setTw('theme', v)} />
        <TweakRadio label="Density" value={tw.density} options={DENSITY_OPTS}
                    onChange={(v) => setTw('density', v)} />

        <TweakSection label="Agent treatment" />
        <TweakSelect label="Style" value={tw.agentTreatment} options={TREATMENT_OPTS}
                     onChange={(v) => setTw('agentTreatment', v)} />

        <TweakSection label="Live activity" />
        <TweakToggle label="Loud (glow + highlight)" value={tw.liveLoud}
                     onChange={(v) => setTw('liveLoud', v)} />

        <TweakSection label="Summarization" />
        <TweakRadio label="Backend" value={tw.summarizeBackend} options={BACKEND_OPTS}
                    onChange={(v) => setTw('summarizeBackend', v)} />
        <div className="twk-row twk-row-h">
          <div className="twk-lbl"><span style={{ opacity: 0.7 }}>Model</span></div>
          <span style={{
            fontFamily: monoFont, fontSize: 11,
            color: tw.theme === 'dark' ? 'rgba(230,232,238,0.55)' : 'rgba(41,38,27,0.55)',
          }}>{backendModelLabel(tw.summarizeBackend)}</span>
        </div>

        <TweakSection label="Journal" />
        <TweakToggle label="Inline capture buttons" value={tw.journalCapture}
                     onChange={(v) => setTw('journalCapture', v)} />
        <div className="twk-row twk-row-h">
          <div className="twk-lbl"><span>Reset journal</span></div>
          <button
            type="button"
            className="twk-field"
            style={{ width: 'auto', padding: '0 10px', cursor: 'pointer' }}
            onClick={() => {
              if (typeof window === 'undefined' || window.confirm('Clear all journal items? This cannot be undone.')) {
                journal.reset();
              }
            }}
          >Reset</button>
        </div>
      </TweaksPanel>

      <MemorySearchPanel
        theme={tw.theme}
        open={memorySearchOpen}
        onClose={() => setMemorySearchOpen(false)}
        onJumpToSession={(id) => { setActiveTab(HOME_TAB); setActiveId(id); }}
      />

      <MemoryProjectsPanel
        theme={tw.theme}
        open={memoryProjectsOpen}
        onClose={() => setMemoryProjectsOpen(false)}
      />
    </div>
    </FilePreviewProvider>
    </LightboxProvider>
  );
}

function gridColumns(opts: { bp: 'sm' | 'md' | 'lg'; hasActive: boolean }): string {
  if (opts.bp === 'sm') return 'minmax(0, 1fr)';
  if (opts.bp === 'md') return '300px minmax(0, 1fr)';
  return '210px 360px minmax(0, 1fr)';
}
