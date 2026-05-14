import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate } from '@tanstack/react-router';
import { composeSessionId } from '../shared/types';
import {
  TWEAK_DEFAULTS,
  monoFont,
  sansFont,
  themes,
  type AgentTreatment,
  type Density,
  type DetailShape,
  type ThemeMode,
} from './theme';
import { useTweaks } from './hooks/useTweaks';
import { useBreakpoint } from './hooks/useBreakpoint';
import { useBlurredProjects } from './hooks/useBlurredProjects';
import { useEntries, useEventStream, useProjects, useSessions, useSources } from './api';
import { TopBar } from './components/TopBar';
import { SourcesRail } from './components/SourcesRail';
import { SessionList } from './components/SessionList';
import { SessionDetail } from './components/SessionDetail';
import { InspectorRail } from './components/InspectorRail';
import { LightboxProvider } from './components/Lightbox';
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
const SHAPE_OPTS = ['chat', 'timeline', 'inspect'] as const satisfies readonly DetailShape[];

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

  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [tweaksOpen, setTweaksOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [activeRefreshKey, setActiveRefreshKey] = useState<number>(0);
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
  const { data: entries, loading: entriesLoading } = useEntries(activeId, activeRefreshKey);

  // Default-navigate to the first session once the list loads — but never on
  // narrow screens, where the list itself is the landing view.
  useEffect(() => {
    if (bp === 'sm') return;
    if (!activeId && sessions.length > 0) {
      void navigate({
        to: '/session/$id',
        params: { id: sessions[0].id },
        search: (prev) => prev,
        replace: true,
      });
    }
  }, [activeId, sessions, navigate, bp]);

  const goToList = useCallback(() => {
    void navigate({ to: '/', search: (prev) => prev, replace: true });
  }, [navigate]);

  const setActiveId = useCallback((id: string) => {
    setSelectedEntryId(undefined);
    void navigate({ to: '/session/$id', params: { id }, search: (prev) => prev });
  }, [navigate]);

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

  // Live updates: any session change → bump list; if it's the active one, bump entries too.
  const onEvent = useCallback((e: { type: string; sourceId?: string; sessionId?: string }) => {
    if (e.type === 'session_updated') {
      setRefreshKey((k) => k + 1);
      const id = composeSessionId(e.sourceId ?? '', e.sessionId ?? '');
      if (id === activeId) setActiveRefreshKey((k) => k + 1);
    }
  }, [activeId]);
  useEventStream(onEvent);

  const activeSession = sessions.find((s) => s.id === activeId);
  const selectedEntry =
    entries.find((e) => e.id === selectedEntryId) || entries[entries.length - 1];

  const liveCount = useMemo(() => sessions.filter((s) => s.live).length, [sessions]);

  return (
    <LightboxProvider>
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
      `}</style>

      <TopBar
        theme={tw.theme}
        liveCount={liveCount}
        search={searchInput}
        setSearch={setSearchInput}
        onToggleTheme={() => setTw('theme', tw.theme === 'dark' ? 'light' : 'dark')}
        onToggleTweaks={() => setTweaksOpen((v) => !v)}
        compact={bp === 'sm'}
      />

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: gridColumns({ bp, shape: tw.detailShape, hasActive: !!activeId }),
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
          />
        )}

        {(bp !== 'sm' || activeId) && (
          <SessionDetail
            theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
            loud={tw.liveLoud} shape={tw.detailShape}
            session={activeSession} sources={sources} entries={entries}
            selectedEntryId={selectedEntry?.id}
            setSelectedEntryId={setSelectedEntryId}
            loading={entriesLoading}
            onBack={bp === 'sm' ? goToList : undefined}
            blurred={blurred}
          />
        )}

        {bp === 'lg' && tw.detailShape === 'inspect' && (
          <InspectorRail theme={tw.theme} entry={selectedEntry} session={activeSession} />
        )}
      </div>

      <TweaksPanel title="Tweaks" open={tweaksOpen} onClose={() => setTweaksOpen(false)}>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={tw.theme} options={THEME_OPTS}
                    onChange={(v) => setTw('theme', v)} />
        <TweakRadio label="Density" value={tw.density} options={DENSITY_OPTS}
                    onChange={(v) => setTw('density', v)} />

        <TweakSection label="Agent treatment" />
        <TweakSelect label="Style" value={tw.agentTreatment} options={TREATMENT_OPTS}
                     onChange={(v) => setTw('agentTreatment', v)} />

        <TweakSection label="Session detail" />
        <TweakSelect label="Shape" value={tw.detailShape} options={SHAPE_OPTS}
                     onChange={(v) => setTw('detailShape', v)} />

        <TweakSection label="Live activity" />
        <TweakToggle label="Loud (glow + highlight)" value={tw.liveLoud}
                     onChange={(v) => setTw('liveLoud', v)} />
      </TweaksPanel>
    </div>
    </LightboxProvider>
  );
}

function gridColumns(opts: {
  bp: 'sm' | 'md' | 'lg';
  shape: DetailShape;
  hasActive: boolean;
}): string {
  if (opts.bp === 'sm') return 'minmax(0, 1fr)';
  if (opts.bp === 'md') return '300px minmax(0, 1fr)';
  return opts.shape === 'inspect'
    ? '210px 340px minmax(0, 1fr) 340px'
    : '210px 360px minmax(0, 1fr)';
}
