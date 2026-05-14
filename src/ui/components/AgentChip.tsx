import type { CSSProperties } from 'react';
import type { AgentType } from '../../shared/types';
import {
  AGENT_GLYPHS,
  AGENT_HUES,
  type AgentTreatment,
  type ThemeMode,
  monoFont,
  sansFont,
  themes,
} from '../theme';

interface AgentChipProps {
  agent: AgentType;
  label?: string | null;
  theme: ThemeMode;
  treatment: AgentTreatment;
  dense: boolean;
}

export function AgentChip({ agent, label, theme, treatment, dense }: AgentChipProps) {
  const t = themes[theme];
  const h = AGENT_HUES[theme][agent];

  if (treatment === 'text') {
    return (
      <span style={{
        color: h.fg, fontFamily: monoFont, fontSize: dense ? 10.5 : 11,
        letterSpacing: '0.02em',
      }}>
        [{agent}]{label ? ` · ${label}` : ''}
      </span>
    );
  }
  if (treatment === 'letter') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: dense ? 16 : 18, height: dense ? 16 : 18, borderRadius: 4,
          background: h.solid, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: dense ? 10 : 11, fontWeight: 700, fontFamily: sansFont,
        }}>{AGENT_GLYPHS[agent]}</span>
        {label && <span style={{ color: t.fg, fontSize: dense ? 11 : 12 }}>{label}</span>}
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: dense ? '1px 7px' : '2px 8px', borderRadius: 4,
      background: h.bg, color: h.fg,
      fontSize: dense ? 10.5 : 11, fontWeight: 500, fontFamily: sansFont,
      letterSpacing: '0.01em', whiteSpace: 'nowrap',
    } satisfies CSSProperties}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: h.fg }} />
      {label || agent}
    </span>
  );
}

interface LivePipProps {
  theme: ThemeMode;
  loud: boolean;
  size?: number;
  color?: string;
}

export function LivePip({ theme, loud, size = 7, color }: LivePipProps) {
  const t = themes[theme];
  const c = color || t.green;
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: c,
      boxShadow: loud ? `0 0 0 3px ${c}33, 0 0 8px ${c}66` : 'none',
      animation: 'pip 1.4s ease-in-out infinite',
    }} />
  );
}
