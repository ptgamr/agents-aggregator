import { useState, useEffect, useMemo } from 'react';
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react';
import { SourcesPanel } from './SourcesPanel';
import { SessionsPanel } from './SessionsPanel';
import { ProjectsPanel } from './ProjectsPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { useSources, useSessions, useEntries, useProjects } from './hooks';

type PanelId = 'sessions' | 'sources' | 'projects' | 'transcript';

const LEFT_WIDTH = 36;
const FOCUS_LABELS: Record<PanelId, string> = {
  sessions: '[sessions]  ',
  sources: '[sources]   ',
  projects: '[projects]  ',
  transcript: '[detail]    ',
};

export function App() {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const sources = useSources();
  const [focus, setFocus] = useState<PanelId>('sessions');
  const [sourceIdx, setSourceIdx] = useState<number>(-1); // -1 = no source filter
  const [projectIdx, setProjectIdx] = useState<number>(-1); // -1 = no project filter
  const [sessionIdx, setSessionIdx] = useState(0);

  const selectedSource = sourceIdx >= 0 ? sources[sourceIdx] : null;
  const projects = useProjects(selectedSource?.id ?? null);
  const selectedProject = projectIdx >= 0 ? projects[projectIdx] : null;

  const filter = useMemo(
    () => ({
      sourceId: selectedSource?.id ?? null,
      project: selectedProject?.cwd ?? null,
    }),
    [selectedSource?.id, selectedProject?.cwd],
  );
  const sessions = useSessions(filter);
  const selectedSession = sessions[sessionIdx] ?? null;
  const { entries, loading, error } = useEntries(selectedSession);

  useEffect(() => { setSessionIdx(0); }, [filter.sourceId, filter.project]);
  useEffect(() => {
    if (sourceIdx >= sources.length) setSourceIdx(sources.length - 1);
  }, [sources.length, sourceIdx]);
  useEffect(() => {
    if (projectIdx >= projects.length) setProjectIdx(projects.length - 1);
  }, [projects.length, projectIdx]);
  useEffect(() => {
    if (sessionIdx >= sessions.length) setSessionIdx(Math.max(0, sessions.length - 1));
  }, [sessions.length, sessionIdx]);

  useKeyboard((e) => {
    const name = e.name;
    if (name === 'q' || (e.ctrl && name === 'c')) {
      renderer.destroy();
      process.exit(0);
    }
    if (name === '1') { setFocus('sessions'); return; }
    if (name === '2') { setFocus('sources'); return; }
    if (name === '3') { setFocus('projects'); return; }
    if (name === '4') { setFocus('transcript'); return; }
    if (name === 'tab') {
      setFocus((f) =>
        f === 'sessions' ? 'sources'
        : f === 'sources' ? 'projects'
        : f === 'projects' ? 'transcript'
        : 'sessions',
      );
      return;
    }
    if (name === 'c') {
      // Clear filters.
      setSourceIdx(-1);
      setProjectIdx(-1);
      return;
    }

    const enter = name === 'return' || name === 'linefeed';
    const left = name === 'left';
    const right = name === 'right';

    if (focus === 'transcript' && left) {
      e.preventDefault();
      e.stopPropagation();
      setFocus('sessions');
      return;
    }
    if (focus !== 'transcript' && selectedSession && (enter || right)) {
      e.preventDefault();
      e.stopPropagation();
      setFocus('transcript');
      return;
    }

    const up = name === 'k' || name === 'up';
    const down = name === 'j' || name === 'down';
    const top = name === 'g' && !e.shift;
    const bottom = name === 'g' && e.shift;

    if (focus === 'sessions') {
      if (up) setSessionIdx((i) => Math.max(0, i - 1));
      else if (down) setSessionIdx((i) => Math.min(sessions.length - 1, i + 1));
      else if (top) setSessionIdx(0);
      else if (bottom) setSessionIdx(Math.max(0, sessions.length - 1));
    } else if (focus === 'sources') {
      // Allow stepping back to "no source filter" with up at index 0.
      if (up) setSourceIdx((i) => Math.max(-1, i - 1));
      else if (down) setSourceIdx((i) => Math.min(sources.length - 1, i + 1));
      else if (top) setSourceIdx(-1);
      else if (bottom) setSourceIdx(sources.length - 1);
    } else if (focus === 'projects') {
      if (up) setProjectIdx((i) => Math.max(-1, i - 1));
      else if (down) setProjectIdx((i) => Math.min(projects.length - 1, i + 1));
      else if (top) setProjectIdx(-1);
      else if (bottom) setProjectIdx(projects.length - 1);
    }
    // Transcript focus: scrolling is handled by <scrollbox focused>.
  });

  // Body height = total − status bar (1).
  const bodyH = Math.max(8, height - 1);

  return (
    <box style={{ flexDirection: 'column', width, height }}>
      <box style={{ flexDirection: 'row', height: bodyH }}>
        <box
          style={{
            flexDirection: 'column',
            width: LEFT_WIDTH,
            flexShrink: 0,
            height: bodyH,
          }}
        >
          <SessionsPanel
            sessions={sessions}
            selectedIndex={sessionIdx}
            focused={focus === 'sessions'}
            viewportHeight={Math.floor(bodyH * 0.55)}
          />
          <SourcesPanel
            sources={sources}
            selectedIndex={sourceIdx}
            focused={focus === 'sources'}
          />
          <ProjectsPanel
            projects={projects}
            selectedIndex={projectIdx}
            focused={focus === 'projects'}
            viewportHeight={Math.floor(bodyH * 0.3)}
          />
        </box>
        <TranscriptPanel
          session={selectedSession}
          entries={entries}
          loading={loading}
          error={error}
          focused={focus === 'transcript'}
        />
      </box>
      <StatusBar
        focus={focus}
        filterLabel={describeFilter(selectedSource?.label ?? null, selectedProject?.cwd ?? null)}
      />
    </box>
  );
}

function describeFilter(source: string | null, project: string | null): string {
  const parts: string[] = [];
  if (source) parts.push(`source:${source}`);
  if (project) {
    const home = process.env.HOME ?? '';
    parts.push(`project:${home && project.startsWith(home) ? '~' + project.slice(home.length) : project}`);
  }
  return parts.join(' · ');
}

function StatusBar({ focus, filterLabel }: { focus: PanelId; filterLabel: string }) {
  return (
    <box
      style={{
        flexDirection: 'row',
        backgroundColor: '#1a1a1a',
        paddingLeft: 1,
        paddingRight: 1,
        height: 1,
      }}
    >
      <text fg="#7dd3fc" content={FOCUS_LABELS[focus]} style={{ width: 12, flexShrink: 0 }} />
      {filterLabel ? <text fg="#10b981">  {filterLabel}</text> : null}
      <text fg="#555" style={{ flexGrow: 1 }}>
        {'  '}1/2/3/4 panels · j/k · enter/right detail · left sessions · tab · g/G · c clear · q quit
      </text>
    </box>
  );
}
