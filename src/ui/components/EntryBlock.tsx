import type { CSSProperties } from 'react';
import type { Entry, Session } from '../../shared/types';
import { LivePip } from './AgentChip';
import {
  AGENT_GLYPHS, AGENT_HUES,
  monoFont, sansFont, themes,
  type AgentTreatment, type ThemeMode,
} from '../theme';

interface EntryBlockProps {
  entry: Entry;
  theme: ThemeMode;
  session: Session;
  compact: boolean;
  treatment: AgentTreatment;
  isNew: boolean;
  selected: boolean;
  onSelect: () => void;
}

export function EntryBlock({ entry: e, theme, session, compact, isNew, selected, onSelect }: EntryBlockProps) {
  const t = themes[theme];
  const isUser = e.role === 'user';
  const isThinking = e.role === 'thinking';
  const isTool = e.role === 'toolCall';
  const isResult = e.role === 'toolResult';
  const isBash = e.role === 'bash';

  const baseStyle: CSSProperties = {
    margin: compact ? '6px 0' : '10px 0',
    borderRadius: 6,
    cursor: 'pointer',
    border: selected ? `1px solid ${t.accent}` : '1px solid transparent',
    padding: selected ? '1px' : '2px',
  };

  if (isThinking) {
    return (
      <div onClick={onSelect} style={{
        ...baseStyle,
        background: t.panel,
        border: `1px solid ${selected ? t.accent : t.border2}`,
        padding: '10px 14px',
        fontStyle: 'italic',
        animation: isNew ? 'enterRow .8s ease-out' : 'none',
      }}>
        <div style={{
          fontSize: 10, color: t.dim2, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 6, fontStyle: 'normal',
          fontFamily: monoFont, fontWeight: 600,
        }}>
          ▾ thinking · {e.timestamp}
        </div>
        <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55 }}>{e.text}</div>
      </div>
    );
  }

  if (isTool) {
    return (
      <div onClick={onSelect} style={{
        ...baseStyle, border: `1px solid ${selected ? t.accent : t.border}`,
        overflow: 'hidden', fontFamily: monoFont,
        animation: isNew ? 'enterStrong 1s ease-out' : 'none',
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '7px 12px', background: t.panel2,
          fontSize: 11, color: t.dim,
        }}>
          <span style={{ color: t.accent }}>▸</span>
          <span style={{ color: t.fg, fontWeight: 500 }}>{e.tool}</span>
          <span>{e.args?.path}</span>
          <span style={{ marginLeft: 'auto', color: t.dim2 }}>{e.timestamp}</span>
        </div>
        <pre style={{
          margin: 0, padding: '10px 12px', fontSize: 11.5, color: t.fg,
          background: theme === 'dark' ? '#0a0c10' : '#fffdf7',
          whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 140,
        }}>{e.preview}</pre>
      </div>
    );
  }

  if (isResult) {
    return (
      <div onClick={onSelect} style={{
        ...baseStyle, padding: '6px 12px',
        fontFamily: monoFont, fontSize: 11.5, color: t.green,
        display: 'flex', gap: 10, alignItems: 'center',
        background: selected ? t.panel : 'transparent',
        border: `1px solid ${selected ? t.accent : 'transparent'}`,
      }}>
        <span>✓</span><span>{e.summary}</span>
        <span style={{ marginLeft: 'auto', color: t.dim2 }}>{e.timestamp}</span>
      </div>
    );
  }

  if (isBash) {
    return (
      <div onClick={onSelect} style={{
        ...baseStyle, border: `1px solid ${selected ? t.accent : t.border}`,
        overflow: 'hidden', fontFamily: monoFont,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '6px 12px', background: t.panel2,
          fontSize: 11.5, color: t.amber,
        }}>
          <span>$ {e.cmd}</span>
          <span style={{ color: t.dim2 }}>{e.timestamp}</span>
        </div>
        <pre style={{
          margin: 0, padding: '8px 12px', fontSize: 11.5, color: t.dim,
          background: theme === 'dark' ? '#0a0c10' : '#fffdf7',
          whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 140,
        }}>{e.out}</pre>
      </div>
    );
  }

  // user / assistant
  return (
    <div onClick={onSelect} style={{
      ...baseStyle, display: 'flex', gap: 10, padding: '8px',
      background: selected ? t.panel : 'transparent',
      border: `1px solid ${selected ? t.accent : 'transparent'}`,
    }}>
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: 13,
        background: isUser ? t.accent : AGENT_HUES[theme][session.agent].solid,
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, fontFamily: sansFont,
      }}>{isUser ? 'You' : AGENT_GLYPHS[session.agent]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: t.dim2, marginBottom: 4 }}>
          <span style={{ color: t.fg, fontWeight: 500 }}>
            {isUser ? 'You' : (session.agent.charAt(0).toUpperCase() + session.agent.slice(1))}
          </span>
          <span>{e.timestamp}</span>
          {e.streaming && (
            <span style={{ color: t.green, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <LivePip theme={theme} loud={true} size={5} /> streaming
            </span>
          )}
        </div>
        <div style={{ color: t.fg, fontSize: 13, lineHeight: 1.55 }}>
          {e.text}
          {e.streaming && (
            <span style={{
              display: 'inline-block', width: 7, height: 14, marginLeft: 2,
              background: t.green, verticalAlign: 'text-bottom',
              animation: 'caret 1s steps(2) infinite',
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
