import { useCallback, useEffect, useState } from 'react';

interface ProjectItem {
  cwd: string;
  sessionCount: number;
  latestAt: string;
  slug: string | null;
  status: 'pending' | 'mining' | 'ready' | 'failed' | null;
  lastMinedAt: string | null;
  lastMineError: string | null;
}

interface JobState {
  slug: string;
  cwd: string;
  phase: 'queued' | 'project' | 'sessions' | 'ready' | 'failed' | 'cancelled';
  sessionsTotal: number;
  sessionsDone: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface MempalaceStatus {
  installed: boolean;
  version: string | null;
  initialised: boolean;
  palaceConfigPath: string;
  unavailableReason: string | null;
}

interface Props {
  theme: 'dark' | 'light';
  open: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 2_000;

export function MemoryProjectsPanel({ theme, open, onClose }: Props) {
  const [status, setStatus] = useState<MempalaceStatus | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [current, setCurrent] = useState<JobState | null>(null);
  const [queue, setQueue] = useState<JobState[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCwd, setBusyCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, p, j] = await Promise.all([
        fetch('/api/memory/status').then((r) => r.json()),
        fetch('/api/memory/projects').then((r) => r.json()),
        fetch('/api/memory/jobs').then((r) => r.json()),
      ]);
      setStatus(s);
      setProjects(p.projects ?? []);
      setCurrent(j.current ?? null);
      setQueue(j.queue ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Initial load when the panel opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [open, refresh]);

  // Poll while any job is in flight (or queued).
  useEffect(() => {
    if (!open) return;
    if (!current && queue.length === 0) return;
    const id = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [open, current, queue.length, refresh]);

  const onAdd = useCallback(async (cwd: string) => {
    setBusyCwd(cwd);
    setError(null);
    try {
      const res = await fetch('/api/memory/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `add failed (${res.status})`);
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyCwd(null);
    }
  }, [refresh]);

  const onRemove = useCallback(async (slug: string, cwd: string) => {
    if (!window.confirm(`Remove ${cwd} from MemPalace? This prunes its drawers.`)) return;
    setBusyCwd(cwd);
    setError(null);
    try {
      const res = await fetch(`/api/memory/projects/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `remove failed (${res.status})`);
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyCwd(null);
    }
  }, [refresh]);

  if (!open) return null;

  const dark = theme === 'dark';
  const palette = {
    bg: dark ? '#1a1a1a' : '#fff',
    fg: dark ? '#e6e6e6' : '#111',
    dim: dark ? '#888' : '#666',
    border: dark ? '#333' : '#ccc',
    rowBorder: dark ? '#2a2a2a' : '#eee',
    rowHover: dark ? '#252525' : '#f5f5f5',
    badgeBg: dark ? '#0d0d0d' : '#f0f0f0',
    accent: dark ? '#7c8cff' : '#4659e6',
    error: '#e57373',
  };

  const renderStatus = (p: ProjectItem) => {
    // Overlay job state if this cwd is currently being processed.
    const matchedJob =
      (current && current.cwd === p.cwd ? current : null) ??
      queue.find((q) => q.cwd === p.cwd) ?? null;
    if (matchedJob) {
      const total = matchedJob.sessionsTotal;
      const done = matchedJob.sessionsDone;
      const label =
        matchedJob.phase === 'queued' ? 'queued'
        : matchedJob.phase === 'project' ? 'mining project'
        : matchedJob.phase === 'sessions' ? `sessions ${done}/${total}`
        : matchedJob.phase;
      return <Badge color={palette.accent} bg={palette.badgeBg}>{label}</Badge>;
    }
    if (!p.status) return <Badge color={palette.dim} bg={palette.badgeBg}>not added</Badge>;
    if (p.status === 'ready') return <Badge color="#4caf50" bg={palette.badgeBg}>ready</Badge>;
    if (p.status === 'failed') return <Badge color={palette.error} bg={palette.badgeBg} title={p.lastMineError ?? ''}>failed</Badge>;
    if (p.status === 'mining') return <Badge color={palette.accent} bg={palette.badgeBg}>mining</Badge>;
    return <Badge color={palette.dim} bg={palette.badgeBg}>{p.status}</Badge>;
  };

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      role="dialog"
      style={{
        position: 'fixed', inset: 0,
        background: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
        zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '8vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(820px, 94vw)',
          maxHeight: '84vh',
          display: 'flex', flexDirection: 'column',
          background: palette.bg, color: palette.fg,
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
          boxShadow: dark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${palette.rowBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>MemPalace projects</h2>
            <span style={{ fontSize: 11, color: palette.dim }}>
              {status?.installed && status.initialised
                ? `${status.version} · ${status.palaceConfigPath}`
                : status?.unavailableReason ?? '…'}
            </span>
          </div>
          <p style={{ fontSize: 12, color: palette.dim, margin: '6px 0 0 0' }}>
            Adding a project mines its code + every session that ran in it, then keeps it live as new sessions land. Remove prunes the palace's drawers for that project.
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', color: palette.error, fontSize: 13 }}>{error}</div>
        )}
        {status && !status.installed && (
          <div style={{ padding: '10px 16px', fontSize: 13, color: palette.error }}>
            MemPalace not installed. <code>uv tool install mempalace</code>, then restart.
          </div>
        )}
        {status && status.installed && !status.initialised && (
          <div style={{ padding: '10px 16px', fontSize: 13, color: palette.error }}>
            Palace not initialised. Run <code>mempalace init &lt;some-dir&gt; --yes --no-llm</code>, then restart.
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && projects.length === 0 && (
            <div style={{ padding: '16px', fontSize: 13, color: palette.dim }}>Loading…</div>
          )}
          {!loading && projects.length === 0 && (
            <div style={{ padding: '16px', fontSize: 13, color: palette.dim }}>
              No projects yet — sessions need a <code>cwd</code> to show up here.
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.cwd}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                borderTop: `1px solid ${palette.rowBorder}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13, fontFamily: 'ui-monospace, monospace',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                  title={p.cwd}
                >
                  {p.cwd}
                </div>
                <div style={{ fontSize: 11, color: palette.dim, marginTop: 3 }}>
                  {p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}
                  {p.lastMinedAt && ` · mined ${new Date(p.lastMinedAt).toLocaleDateString()}`}
                </div>
                {p.lastMineError && (
                  <div style={{ fontSize: 11, color: palette.error, marginTop: 3 }} title={p.lastMineError}>
                    {p.lastMineError.slice(0, 120)}
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>{renderStatus(p)}</div>
              <div style={{ flexShrink: 0 }}>
                {p.slug ? (
                  <button
                    onClick={() => onRemove(p.slug!, p.cwd)}
                    disabled={busyCwd === p.cwd}
                    style={btnStyle(palette, 'danger')}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => onAdd(p.cwd)}
                    disabled={busyCwd === p.cwd || !status?.installed || !status?.initialised}
                    style={btnStyle(palette, 'default')}
                  >
                    Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '6px 16px',
          borderTop: `1px solid ${palette.rowBorder}`,
          fontSize: 11, color: palette.dim,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Esc to close</span>
          <span>
            {current && `mining ${current.slug}`}
            {queue.length > 0 && ` · ${queue.length} queued`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, bg, title, children }: { color: string; bg: string; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      style={{
        fontSize: 11, fontFamily: 'ui-monospace, monospace',
        padding: '2px 7px', borderRadius: 999,
        background: bg, color,
        border: `1px solid ${color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function btnStyle(
  p: { fg: string; border: string; rowHover: string; error: string },
  variant: 'default' | 'danger',
): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${variant === 'danger' ? p.error + '88' : p.border}`,
    color: variant === 'danger' ? p.error : p.fg,
    fontSize: 12, padding: '5px 10px', borderRadius: 5,
    cursor: 'pointer', minWidth: 70,
  };
}
