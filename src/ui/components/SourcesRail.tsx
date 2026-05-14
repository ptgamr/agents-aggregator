import type { Source } from '../../shared/types';
import type { Project } from '../api';
import type { BlurredProjects } from '../hooks/useBlurredProjects';
import { lastPathSegment } from '../format';
import { AgentChip } from './AgentChip';
import { monoFont, sansFont, themes, type AgentTreatment, type ThemeMode } from '../theme';

interface SourcesRailProps {
  theme: ThemeMode;
  treatment: AgentTreatment;
  sources: Source[];
  filter: string | null;
  setFilter: (id: string | null) => void;
  projects: Project[];
  projectFilter: string | null;
  setProjectFilter: (cwd: string | null) => void;
  dense: boolean;
  blurred: BlurredProjects;
}

const RAIL_STYLE = `
  .proj-row { position: relative; }
  .proj-row .proj-blur-btn {
    appearance: none; border: 0; background: transparent;
    width: 18px; height: 18px; padding: 0; border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; opacity: 0; transition: opacity .12s, background .12s;
    color: inherit;
  }
  .proj-row:hover .proj-blur-btn { opacity: 0.55; }
  .proj-row .proj-blur-btn[data-on="1"] { opacity: 0.9; }
  .proj-row .proj-blur-btn:hover { background: rgba(127,127,127,.18); opacity: 1; }
`;

export function SourcesRail({
  theme, treatment, sources, filter, setFilter,
  projects, projectFilter, setProjectFilter, dense, blurred,
}: SourcesRailProps) {
  const t = themes[theme];
  const totalSourceCount = sources.reduce((n, s) => n + (s.count ?? 0), 0);
  const totalProjectCount = projects.reduce((n, p) => n + p.count, 0);

  return (
    <div style={{
      borderRight: `1px solid ${t.border}`, background: t.panel,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
    }}>
      <style>{RAIL_STYLE}</style>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 8px' }}>
        <div style={{ padding: '14px 8px 6px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: t.dim2, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Sources
          </span>
          <span style={{ marginLeft: 'auto', color: t.dim2, fontSize: 12, fontFamily: monoFont }}>
            {sources.filter((s) => s.enabled).length}/{sources.length}
          </span>
        </div>
        <SourceRow
          theme={theme} treatment={treatment} dense={dense}
          label="All sources" agent={null} count={totalSourceCount}
          active={filter === null} onClick={() => setFilter(null)}
        />
        {sources.map((src) => (
          <SourceRow key={src.id}
            theme={theme} treatment={treatment} dense={dense}
            label={src.label} agent={src.agent}
            count={src.count ?? 0} enabled={src.enabled}
            active={filter === src.id}
            onClick={() => setFilter(filter === src.id ? null : src.id)}
          />
        ))}

        <div style={{ padding: '14px 8px 6px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: t.dim2, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            Projects
          </span>
          <span style={{ marginLeft: 'auto', color: t.dim2, fontSize: 12, fontFamily: monoFont }}>
            {projects.length}
          </span>
        </div>
        {projectFilter && (
          <ProjectRow
            theme={theme} dense={dense}
            cwd="" label="All projects" count={totalProjectCount}
            active={false} onClick={() => setProjectFilter(null)}
            isBlurred={false}
          />
        )}
        {projects.map((p) => (
          <ProjectRow key={p.cwd}
            theme={theme} dense={dense}
            cwd={p.cwd} label={lastPathSegment(p.cwd) || p.cwd}
            count={p.count}
            active={projectFilter === p.cwd}
            onClick={() => setProjectFilter(projectFilter === p.cwd ? null : p.cwd)}
            isBlurred={blurred.has(p.cwd)}
            onToggleBlur={() => blurred.toggle(p.cwd)}
          />
        ))}
      </div>

      <div style={{ padding: '8px 12px 14px', borderTop: `1px solid ${t.border}` }}>
        <button style={{
          width: '100%',
          padding: '7px 10px', borderRadius: 6,
          background: 'transparent', border: `1px dashed ${t.border}`,
          color: t.dim, fontSize: 12.5, fontFamily: sansFont, cursor: 'default',
          textAlign: 'left',
        }}>
          + Add source…
        </button>
        <div style={{ color: t.dim2, fontSize: 11, fontFamily: monoFont, marginTop: 8, padding: '0 2px' }}>
          $12.34 today · 306 total
        </div>
      </div>
    </div>
  );
}

interface ProjectRowProps {
  theme: ThemeMode;
  dense: boolean;
  cwd: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  isBlurred: boolean;
  onToggleBlur?: () => void;
}

function ProjectRow({ theme, dense, cwd, label, count, active, onClick, isBlurred, onToggleBlur }: ProjectRowProps) {
  const t = themes[theme];
  const isClear = label === 'All projects';
  return (
    <div className="proj-row" onClick={onClick} title={cwd || undefined} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: dense ? '6px 8px' : '8px 10px',
      margin: '1px 0', borderRadius: 5,
      background: active ? t.panel2 : 'transparent',
      borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
      paddingLeft: dense ? 8 : 10,
      cursor: 'pointer',
    }}>
      <span style={{
        width: 18, color: isClear ? t.dim : t.dim, fontSize: 12, textAlign: 'center',
      }}>{isClear ? '✕' : '▸'}</span>
      <span
        className={isBlurred ? 'blur-text' : undefined}
        style={{
          color: t.fg, fontSize: dense ? 13 : 13.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0, fontFamily: isClear ? sansFont : monoFont,
        }}
      >{label}</span>
      {onToggleBlur && (
        <button
          className="proj-blur-btn"
          data-on={isBlurred ? '1' : '0'}
          aria-label={isBlurred ? 'Unblur project' : 'Blur project for recording'}
          title={isBlurred ? 'Click to show again' : 'Hide for recording'}
          onClick={(e) => { e.stopPropagation(); onToggleBlur(); }}
        >
          <BlurIcon on={isBlurred} />
        </button>
      )}
      <span style={{ color: t.dim2, fontSize: 12, fontFamily: monoFont }}>{count}</span>
    </div>
  );
}

function BlurIcon({ on }: { on: boolean }) {
  // Eye / eye-with-slash.
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {on && <line x1="2" y1="14" x2="14" y2="2" />}
    </svg>
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
        : <span style={{ width: 18, color: t.dim, fontSize: 12, textAlign: 'center' }}>⛶</span>}
      <span style={{
        color: t.fg, fontSize: dense ? 13 : 13.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
      }}>{displayLabel}</span>
      <span style={{ color: t.dim2, fontSize: 12, fontFamily: monoFont }}>{count}</span>
    </div>
  );
}
