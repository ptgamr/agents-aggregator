import type { Source } from '../shared/types';

interface Props {
  sources: Source[];
  selectedIndex: number;
  focused: boolean;
}

const AGENT_COLOR: Record<string, string> = {
  claude: '#d97757',
  codex: '#10a37f',
  opencode: '#f59e0b',
  pi: '#8b5cf6',
};

export function SourcesPanel({ sources, selectedIndex, focused }: Props) {
  // Fixed height: header(1) + each source(1) + borders(2). Capped to a sensible max.
  const rows = sources.length;
  const desiredHeight = Math.min(10, rows + 2);

  return (
    <box
      title=" Sources "
      style={{
        border: true,
        borderColor: focused ? '#7dd3fc' : '#3a3a3a',
        focusedBorderColor: '#7dd3fc',
        flexDirection: 'column',
        height: Math.max(4, desiredHeight),
        flexShrink: 0,
      }}
    >
      {sources.length === 0 ? (
        <text fg="#666" style={{ paddingLeft: 1 }}>
          (no sources)
        </text>
      ) : (
        sources.map((s, i) => {
          const selected = i === selectedIndex;
          const bg = selected ? (focused ? '#1e3a5f' : '#2a2a2a') : undefined;
          const fg = selected ? '#fff' : AGENT_COLOR[s.agent] ?? '#ddd';
          return (
            <box
              key={s.id}
              style={{
                backgroundColor: bg,
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'row',
              }}
            >
              <text fg={fg} style={{ flexGrow: 1 }}>
                {s.label}
              </text>
              <text fg="#666"> {typeof s.count === 'number' ? `${s.count}` : ''}</text>
            </box>
          );
        })
      )}
    </box>
  );
}
