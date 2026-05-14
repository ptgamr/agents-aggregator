import type { Entry, EntryRole } from '../../shared/types';
import { LivePip } from './AgentChip';
import { monoFont, sansFont, themes, type ThemeMode } from '../theme';

interface TimelineViewProps {
  theme: ThemeMode;
  entries: Entry[];
  selectedEntryId: string | undefined;
  setSelectedEntryId: (id: string) => void;
  loud: boolean;
}

const ROLE_GLYPH: Record<EntryRole, string> = {
  user: '▸',
  assistant: '◆',
  thinking: '·',
  toolCall: '⚙',
  toolResult: '✓',
  bash: '$',
  system: '•',
  summary: '•',
  custom: '•',
};

export function TimelineView({ theme, entries, selectedEntryId, setSelectedEntryId, loud }: TimelineViewProps) {
  const t = themes[theme];
  const roleColor = (role: EntryRole): string => {
    switch (role) {
      case 'user': return t.accent;
      case 'assistant': return t.fg;
      case 'thinking': return t.dim;
      case 'toolCall': return t.amber;
      case 'toolResult': return t.green;
      case 'bash': return t.amber;
      default: return t.fg;
    }
  };

  return (
    <div style={{ fontFamily: monoFont, fontSize: 12, padding: '4px 0' }}>
      {entries.map((e, i) => {
        const selected = e.id === selectedEntryId;
        return (
          <div key={e.id} onClick={() => setSelectedEntryId(e.id)} style={{
            display: 'grid', gridTemplateColumns: '90px 16px 1fr', gap: 0,
            padding: '6px 22px',
            background: selected ? t.panel : 'transparent',
            borderLeft: selected ? `2px solid ${t.accent}` : '2px solid transparent',
            paddingLeft: 20,
            cursor: 'pointer',
            animation: i === entries.length - 1 ? 'enterRow .8s ease-out' : 'none',
          }}>
            <span style={{ color: t.dim2, fontSize: 11 }}>{e.timestamp}</span>
            <span style={{ color: roleColor(e.role), fontSize: 11 }}>
              {ROLE_GLYPH[e.role] || '•'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: roleColor(e.role), fontWeight: 600, fontSize: 11 }}>{e.role}</span>
                {e.tool && <span style={{ color: t.dim2 }}>{e.tool} {e.args?.path || ''}</span>}
                {e.streaming && (
                  <span style={{ color: t.green, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                    <LivePip theme={theme} loud={loud} size={5} /> streaming
                  </span>
                )}
              </div>
              <div style={{
                color: t.fg2, fontSize: 12, marginTop: 3,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily:
                  e.role === 'thinking' || e.role === 'user' || e.role === 'assistant'
                    ? sansFont : monoFont,
                fontStyle: e.role === 'thinking' ? 'italic' : 'normal',
              }}>
                {e.text || e.cmd || e.summary || e.preview?.split('\n')[0]}
                {e.streaming && (
                  <span style={{
                    display: 'inline-block', width: 7, height: 13, marginLeft: 2,
                    background: t.green, verticalAlign: 'text-bottom',
                    animation: 'caret 1s steps(2) infinite',
                  }} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
