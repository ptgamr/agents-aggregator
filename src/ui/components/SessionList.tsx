import type { Session, Source } from '../../shared/types';
import type { BlurredProjects } from '../hooks/useBlurredProjects';
import { AgentChip, LivePip } from './AgentChip';
import { lastPathSegment, relativeTime } from '../format';
import { monoFont, themes, type AgentTreatment, type ThemeMode } from '../theme';

interface SessionListProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  sessions: Session[];
  sources: Source[];
  activeId: string;
  setActiveId: (id: string) => void;
  loud: boolean;
  blurred: BlurredProjects;
}

export function SessionList({ theme, treatment, dense, sessions, sources, activeId, setActiveId, loud, blurred }: SessionListProps) {
  const t = themes[theme];

  return (
    <div style={{
      borderRight: `1px solid ${t.border}`, background: t.bg,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px 10px', borderBottom: `1px solid ${t.border}`,
      }}>
        <span style={{ color: t.dim2, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Sessions
        </span>
        <span style={{ color: t.dim2, fontSize: 12, fontFamily: monoFont }}>{sessions.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontSize: 12, color: t.dim, fontFamily: monoFont }}>
          <span style={{ padding: '2px 7px', background: t.panel2, borderRadius: 3 }}>recent</span>
          <span style={{ padding: '2px 7px', color: t.dim2 }}>cost</span>
          <span style={{ padding: '2px 7px', color: t.dim2 }}>cwd</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sessions.map((s) => (
          <SessionRow key={s.id}
            theme={theme} treatment={treatment} dense={dense} loud={loud}
            session={s} sources={sources} active={s.id === activeId}
            onClick={() => setActiveId(s.id)}
            isBlurred={blurred.has(s.cwd)}
          />
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: 24, color: t.dim, fontSize: 13, textAlign: 'center' }}>
            No matching sessions.
          </div>
        )}
      </div>
    </div>
  );
}

interface SessionRowProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
  loud: boolean;
  session: Session;
  sources: Source[];
  active: boolean;
  onClick: () => void;
  isBlurred: boolean;
}

function SessionRow({ theme, treatment, dense, loud, session: s, sources, active, onClick, isBlurred }: SessionRowProps) {
  const t = themes[theme];
  const padY = dense ? 9 : 12;
  const sourceLabel = (sources.find((x) => x.id === s.sourceId) || { label: '' }).label;
  const shortSource = sourceLabel.match(/\((.+?)\)/)?.[1] || sourceLabel;

  return (
    <div onClick={onClick} style={{
      padding: `${padY}px 14px`,
      borderBottom: `1px solid ${t.border2}`,
      borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
      paddingLeft: 12,
      background: active ? (theme === 'dark' ? 'rgba(124,140,255,0.06)' : 'rgba(79,93,214,0.06)') : 'transparent',
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <AgentChip agent={s.agent} label={treatment === 'chip' ? shortSource : null}
                   theme={theme} treatment={treatment} dense={dense} />
        {s.live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
            color: t.green, fontFamily: monoFont }}>
            <LivePip theme={theme} loud={loud} size={5} />
            {s.status === 'streaming' ? 'streaming' : s.status === 'tool' ? 'tool' : 'live'}
          </span>
        )}
        <span title={s.updatedAt} style={{ marginLeft: 'auto', color: t.dim2, fontSize: 12, fontFamily: monoFont }}>
          {relativeTime(s.updatedAt)}
        </span>
      </div>
      <div
        className={isBlurred ? 'blur-text' : undefined}
        style={{
          color: t.fg, fontSize: dense ? 13.5 : 14, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: dense ? 2 : 4,
        }}
      >
        {s.name || <span style={{ color: t.dim2, fontWeight: 400, fontStyle: 'italic' }}>Untitled</span>}
      </div>
      <div style={{
        display: 'flex', gap: 8, fontSize: 12, color: t.dim, fontFamily: monoFont,
        alignItems: 'center',
      }}>
        <span
          title={isBlurred ? undefined : s.cwd}
          className={isBlurred ? 'blur-text' : undefined}
          style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{lastPathSegment(s.cwd)}</span>
        <span>{s.messageCount}</span>
        {s.costUsd != null && <span>${s.costUsd.toFixed(2)}</span>}
        {s.branches > 0 && <span style={{ color: t.amber }}>⌥{s.branches}</span>}
      </div>
    </div>
  );
}
