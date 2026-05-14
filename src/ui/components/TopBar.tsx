import { LivePip } from './AgentChip';
import { monoFont, themes, type ThemeMode } from '../theme';

interface TopBarProps {
  theme: ThemeMode;
  liveCount: number;
  search: string;
  setSearch: (s: string) => void;
  onToggleTheme: () => void;
  onToggleTweaks: () => void;
}

export function TopBar({ theme, liveCount, search, setSearch, onToggleTheme, onToggleTweaks }: TopBarProps) {
  const t = themes[theme];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 16px', borderBottom: `1px solid ${t.border}`,
      background: t.bg, position: 'relative', zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
        <span style={{ fontWeight: 600, fontSize: 13, color: t.fg, letterSpacing: '-0.005em' }}>
          Agents Aggregator
        </span>
      </div>

      <div style={{ width: 1, height: 18, background: t.border, marginLeft: 4 }} />

      <div style={{
        flex: 1, maxWidth: 460,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', background: t.panel,
        border: `1px solid ${t.border}`, borderRadius: 6,
        color: t.dim, fontSize: 12,
      }}>
        <span style={{ opacity: 0.7 }}>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions, cwd, models…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: t.fg, fontFamily: 'inherit', fontSize: 12,
          }}
        />
        <span style={{
          fontFamily: monoFont, fontSize: 10,
          padding: '1px 5px', background: t.panel2, borderRadius: 3,
          color: t.dim2,
        }}>⌘K</span>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontFamily: monoFont, fontSize: 11, color: t.dim,
        }}>
          <LivePip theme={theme} loud={true} size={6} />
          <span style={{ color: t.fg }}>{liveCount}</span> live
        </span>

        <button onClick={onToggleTweaks} style={{
          background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6,
          color: t.fg2, fontSize: 11, padding: '5px 9px', cursor: 'pointer',
          fontFamily: monoFont,
        }}>
          Tweaks
        </button>

        <button onClick={onToggleTheme} style={{
          background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6,
          color: t.fg2, fontSize: 11, padding: '5px 9px', cursor: 'pointer',
          fontFamily: monoFont,
        }}>
          {theme === 'dark' ? '☾ dark' : '☼ light'}
        </button>
      </div>
    </div>
  );
}
