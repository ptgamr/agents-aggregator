import { useMemo, useState } from 'react';
import type { Entry } from '../shared/types';
import { ENTRIES, SESSIONS, SOURCES, sampleEntriesFor } from './mockData';
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
import { useLiveStream, type EntriesMap } from './hooks/useLiveStream';
import { TopBar } from './components/TopBar';
import { SourcesRail } from './components/SourcesRail';
import { SessionList } from './components/SessionList';
import { SessionDetail } from './components/SessionDetail';
import { InspectorRail } from './components/InspectorRail';
import {
  TweakRadio,
  TweakSection,
  TweakSelect,
  TweakToggle,
  TweaksPanel,
} from './components/TweaksPanel';

const THEME_OPTS = ['dark', 'light'] as const satisfies readonly ThemeMode[];
const DENSITY_OPTS = ['compact', 'comfy'] as const satisfies readonly Density[];
const TREATMENT_OPTS = ['chip', 'letter', 'text'] as const satisfies readonly AgentTreatment[];
const SHAPE_OPTS = ['chat', 'timeline', 'inspect'] as const satisfies readonly DetailShape[];

export function App() {
  const [tw, setTw] = useTweaks(TWEAK_DEFAULTS);
  const t = themes[tw.theme];
  const dense = tw.density === 'compact';

  const [activeId, setActiveId] = useState<string>('s-01');
  const [search, setSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(undefined);
  const [tweaksOpen, setTweaksOpen] = useState<boolean>(false);

  const initialEntries = useMemo<EntriesMap>(() => {
    const m: EntriesMap = {};
    SESSIONS.forEach((s) => {
      m[s.id] = s.id === 's-01'
        ? ENTRIES.map((e: Entry) => ({ ...e }))
        : sampleEntriesFor(s);
    });
    return m;
  }, []);

  const entriesMap = useLiveStream(activeId, initialEntries, tw.liveLoud);

  const activeSession = SESSIONS.find((s) => s.id === activeId);
  const activeEntries = entriesMap[activeId] || [];
  const selectedEntry =
    activeEntries.find((e) => e.id === selectedEntryId) ||
    activeEntries[activeEntries.length - 1];

  const filteredSessions = useMemo(() => {
    let out = SESSIONS;
    if (sourceFilter) out = out.filter((s) => s.sourceId === sourceFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q),
      );
    }
    return out;
  }, [sourceFilter, search]);

  const liveCount = SESSIONS.filter((s) => s.live).length;

  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, color: t.fg,
      fontFamily: sansFont, fontSize: 13, display: 'flex', flexDirection: 'column',
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
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${t.dim2}; }
        input::placeholder { color: ${t.dim2}; }
        button { font-family: ${monoFont}; }
      `}</style>

      <TopBar
        theme={tw.theme}
        liveCount={liveCount}
        search={search}
        setSearch={setSearch}
        onToggleTheme={() => setTw('theme', tw.theme === 'dark' ? 'light' : 'dark')}
        onToggleTweaks={() => setTweaksOpen((v) => !v)}
      />

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: tw.detailShape === 'inspect'
          ? '210px 340px 1fr 340px'
          : '210px 360px 1fr',
        minHeight: 0,
      }}>
        <SourcesRail
          theme={tw.theme} treatment={tw.agentTreatment}
          sources={SOURCES} sessions={SESSIONS}
          filter={sourceFilter} setFilter={setSourceFilter}
          dense={dense}
        />
        <SessionList
          theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
          sessions={filteredSessions} sources={SOURCES}
          activeId={activeId} setActiveId={setActiveId}
          loud={tw.liveLoud}
        />
        <SessionDetail
          theme={tw.theme} treatment={tw.agentTreatment} dense={dense}
          loud={tw.liveLoud} shape={tw.detailShape}
          session={activeSession} sources={SOURCES} entries={activeEntries}
          selectedEntryId={selectedEntry?.id}
          setSelectedEntryId={setSelectedEntryId}
        />
        {tw.detailShape === 'inspect' && (
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
  );
}
