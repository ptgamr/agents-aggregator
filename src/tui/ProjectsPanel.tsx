import type { Project } from './api-client';
import { relTime, shortCwd } from './format';

interface Props {
  projects: Project[];
  selectedIndex: number;
  focused: boolean;
  viewportHeight: number;
}

export function ProjectsPanel({ projects, selectedIndex, focused, viewportHeight }: Props) {
  const visibleCount = Math.max(1, viewportHeight - 2);
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, projects.length - visibleCount),
      selectedIndex - Math.floor(visibleCount / 2),
    ),
  );
  const end = Math.min(projects.length, start + visibleCount);
  const visible = projects.slice(start, end);

  return (
    <box
      title={` Projects (${projects.length}) `}
      style={{
        border: true,
        borderColor: focused ? '#7dd3fc' : '#3a3a3a',
        focusedBorderColor: '#7dd3fc',
        flexDirection: 'column',
        flexGrow: 1,
        minHeight: 4,
      }}
    >
      {projects.length === 0 ? (
        <text fg="#666" style={{ paddingLeft: 1 }}>
          (no projects)
        </text>
      ) : (
        visible.map((p, i) => {
          const idx = start + i;
          const selected = idx === selectedIndex;
          const bg = selected ? (focused ? '#1e3a5f' : '#2a2a2a') : undefined;
          const fg = selected ? '#fff' : '#ddd';
          return (
            <box
              key={p.cwd}
              style={{
                backgroundColor: bg,
                paddingLeft: 1,
                paddingRight: 1,
                flexDirection: 'row',
              }}
            >
              <text fg={fg} style={{ flexGrow: 1 }}>
                {shortCwd(p.cwd)}
              </text>
              <text fg="#666">{p.count} </text>
              <text fg="#555">{relTime(p.latestAt)}</text>
            </box>
          );
        })
      )}
    </box>
  );
}
