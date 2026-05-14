import { useMemo } from 'react';
import type { Session, Source } from '../../shared/types';
import { AgentChip } from './AgentChip';
import { monoFont, sansFont, themes, type AgentTreatment, type ThemeMode } from '../theme';

interface SourcesRailProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  sources: Source[];
  sessions: Session[];
  filter: string | null;
  setFilter: (id: string | null) => void;
  dense: boolean;
}

export function SourcesRail({ theme, treatment, sources, sessions, filter, setFilter, dense }: SourcesRailProps) {
  const t = themes[theme];
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    sessions.forEach((s) => { m[s.sourceId] = (m[s.sourceId] || 0) + 1; });
    return m;
  }, [sessions]);

  return (
    <div style={{
      borderRight: `1px solid ${t.border}`, background: t.panel,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
    }}>
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: t.dim2, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Sources
        </span>
        <span style={{ marginLeft: 'auto', color: t.dim2, fontSize: 11, fontFamily: monoFont }}>
          {sources.filter((s) => s.enabled).length}/{sources.length}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 8px' }}>
        <SourceRow
          theme={theme} treatment={treatment} dense={dense}
          label="All sources" agent={null} count={sessions.length}
          active={filter === null} onClick={() => setFilter(null)}
        />
        {sources.map((src) => (
          <SourceRow key={src.id}
            theme={theme} treatment={treatment} dense={dense}
            label={src.label} agent={src.agent}
            count={counts[src.id] || 0} enabled={src.enabled}
            active={filter === src.id}
            onClick={() => setFilter(filter === src.id ? null : src.id)}
          />
        ))}
      </div>

      <div style={{ padding: '8px 12px 14px', borderTop: `1px solid ${t.border}` }}>
        <button style={{
          width: '100%',
          padding: '7px 10px', borderRadius: 6,
          background: 'transparent', border: `1px dashed ${t.border}`,
          color: t.dim, fontSize: 11.5, fontFamily: sansFont, cursor: 'default',
          textAlign: 'left',
        }}>
          + Add source…
        </button>
        <div style={{ color: t.dim2, fontSize: 10, fontFamily: monoFont, marginTop: 8, padding: '0 2px' }}>
          $12.34 today · 306 total
        </div>
      </div>
    </div>
  );
}

interface SourceRowProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  label: string;
  agent: Source['agent'] | null;
  count: number;
  enabled?: boolean;
  active: boolean;
  onClick: () => void;
  dense: boolean;
}

function SourceRow({ theme, treatment, label, agent, count, enabled = true, active, onClick, dense }: SourceRowProps) {
  const t = themes[theme];
  const displayLabel = treatment === 'chip' && agent
    ? label.replace(/^[A-Z][a-z]+ \((.*?)\)/, '$1')
    : label;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: dense ? '6px 8px' : '8px 10px',
      margin: '1px 0', borderRadius: 5,
      background: active ? t.panel2 : 'transparent',
      borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
      paddingLeft: dense ? 8 : 10,
      cursor: 'pointer', opacity: enabled ? 1 : 0.45,
    }}>
      {agent
        ? <AgentChip agent={agent} theme={theme} treatment={treatment} dense={dense} />
        : <span style={{ width: 18, color: t.dim, fontSize: 11, textAlign: 'center' }}>⛶</span>}
      <span style={{
        color: t.fg, fontSize: dense ? 12 : 12.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
      }}>{displayLabel}</span>
      <span style={{ color: t.dim2, fontSize: 11, fontFamily: monoFont }}>{count}</span>
    </div>
  );
}
