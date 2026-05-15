import type { Session } from '../shared/types';
import { relTime, shortCwd } from './format';

interface Props {
  sessions: Session[];
  selectedIndex: number;
  focused: boolean;
  viewportHeight: number;
}

const AGENT_BADGE: Record<string, { text: string; fg: string }> = {
  claude: { text: 'C', fg: '#d97757' },
  codex: { text: 'O', fg: '#10a37f' },
  opencode: { text: 'K', fg: '#f59e0b' },
  pi: { text: 'P', fg: '#8b5cf6' },
};

export function SessionsPanel({ sessions, selectedIndex, focused, viewportHeight }: Props) {
  const visibleCount = Math.max(1, viewportHeight - 2);
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, sessions.length - visibleCount),
      selectedIndex - Math.floor(visibleCount / 2),
    ),
  );
  const end = Math.min(sessions.length, start + visibleCount);
  const visible = sessions.slice(start, end);

  return (
    <box
      title={` Sessions (${sessions.length}) `}
      style={{
        border: true,
        borderColor: focused ? '#7dd3fc' : '#3a3a3a',
        focusedBorderColor: '#7dd3fc',
        flexDirection: 'column',
        flexGrow: 2,
        minHeight: 6,
      }}
    >
      {sessions.length === 0 ? (
        <text fg="#666" style={{ paddingLeft: 1 }}>
          (no sessions)
        </text>
      ) : (
        visible.map((s, i) => {
          const idx = start + i;
          const selected = idx === selectedIndex;
          const bg = selected ? (focused ? '#1e3a5f' : '#2a2a2a') : undefined;
          const fg = selected ? '#fff' : '#ddd';
          const badge = AGENT_BADGE[s.agent] ?? { text: '?', fg: '#888' };
          const title = s.name || shortCwd(s.cwd) || s.id;
          return (
            <box
              key={`${s.sourceId}:${s.id}`}
              style={{
                backgroundColor: bg,
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'row',
              }}
            >
              <text fg={s.live ? '#10b981' : '#3a3a3a'}>{s.live ? '● ' : '  '}</text>
              <text fg={badge.fg}>{badge.text} </text>
              <text fg={fg} style={{ flexGrow: 1 }}>
                {title}
              </text>
              <text fg="#666"> {relTime(s.updatedAt)}</text>
            </box>
          );
        })
      )}
    </box>
  );
}
