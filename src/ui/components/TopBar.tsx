import { LivePip } from './AgentChip';
import { monoFont, themes, type ThemeMode } from '../theme';

interface TopBarProps {
  theme: ThemeMode;
  liveCount: number;
  search: string;
  setSearch: (s: string) => void;
  onToggleTheme: () => void;
  onToggleTweaks: () => void;
  onOpenMemory?: () => void;
  compact?: boolean;
}

export function TopBar({ theme, liveCount, search, setSearch, onToggleTheme, onToggleTweaks, onOpenMemory, compact = false }: TopBarProps) {
  const t = themes[theme];
  const btnStyle = {
    background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6,
    color: t.fg2, fontSize: 12, padding: '5px 9px', cursor: 'pointer',
    fontFamily: monoFont,
  } as const;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: compact ? 8 : 14,
      padding: compact ? '8px 10px' : '10px 16px',
      borderBottom: `1px solid ${t.border}`,
      background: t.bg, position: 'relative', zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'linear-gradient(135deg, #7C8CFF 0%, #5EE0B4 100%)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 5, borderRadius: 2,
            background: t.bg, opacity: 0.85,
          }} />
        </div>
        {!compact && (
          <span style={{ fontWeight: 600, fontSize: 14, color: t.fg, letterSpacing: '-0.005em' }}>
            Agents Aggregator
          </span>
        )}
      </div>

      {!compact && <div style={{ width: 1, height: 18, background: t.border, marginLeft: 4 }} />}

      <div style={{
        flex: 1, maxWidth: compact ? undefined : 460, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', background: t.panel,
        border: `1px solid ${t.border}`, borderRadius: 6,
        color: t.dim, fontSize: 13,
      }}>
        <span style={{ opacity: 0.7 }}>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={compact ? 'Search…' : 'Search sessions, cwd, models…'}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            color: t.fg, fontFamily: 'inherit', fontSize: 13,
          }}
        />
        {!compact && (
          <span style={{
            fontFamily: monoFont, fontSize: 11,
            padding: '1px 5px', background: t.panel2, borderRadius: 3,
            color: t.dim2,
          }}>⌘K</span>
        )}
      </div>

      <div style={{
        marginLeft: 'auto', display: 'flex', alignItems: 'center',
        gap: compact ? 6 : 12, flexShrink: 0,
      }}>
        {!compact && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontFamily: monoFont, fontSize: 12, color: t.dim,
          }}>
            <LivePip theme={theme} loud={true} size={6} />
            <span style={{ color: t.fg }}>{liveCount}</span> live
          </span>
        )}
        {compact && liveCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: monoFont, fontSize: 12, color: t.fg,
          }} title={`${liveCount} live`}>
            <LivePip theme={theme} loud={true} size={6} />
            {liveCount}
          </span>
        )}

        {onOpenMemory && (
          <button onClick={onOpenMemory} style={btnStyle} aria-label="MemPalace" title="MemPalace projects">
            {compact ? '◇' : 'Memory'}
          </button>
        )}

        <button onClick={onToggleTweaks} style={btnStyle} aria-label="Tweaks" title="Tweaks">
          {compact ? '⚙' : 'Tweaks'}
        </button>

        <button onClick={onToggleTheme} style={btnStyle} aria-label="Toggle theme" title="Toggle theme">
          {compact ? (theme === 'dark' ? '☾' : '☼') : (theme === 'dark' ? '☾ dark' : '☼ light')}
        </button>
      </div>
    </div>
  );
}
