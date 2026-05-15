import { useState } from 'react';
import { Markdown } from '../components/Markdown';
import { monoFont, themes, type ThemeMode } from '../theme';
import { kindColor, kindGlyph, kindLabel } from './kind';
import { projectLabel, type JournalProposal } from './types';

interface ProposalSheetProps {
  theme: ThemeMode;
  proposals: JournalProposal[];
  projectKey: string;
  onAccept: (p: JournalProposal) => void;
  onAcceptAll: (ps: JournalProposal[]) => void;
  onDismiss: () => void;
  /** Close button — when provided, renders an × in the header. */
  onClose?: () => void;
  /** Floating mode: absolutely positioned, drop-shadowed, internal scroll. */
  floating?: boolean;
  /** Distance from the bottom of the parent (only in floating mode). */
  floatingBottom?: number;
}

export function ProposalSheet({
  theme, proposals, projectKey, onAccept, onAcceptAll, onDismiss,
  onClose, floating, floatingBottom = 20,
}: ProposalSheetProps) {
  const t = themes[theme];
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i)),
  );

  const toggle = (i: number) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div style={floating ? {
      position: 'absolute', right: 20, bottom: floatingBottom,
      width: 'min(440px, calc(100% - 40px))',
      maxHeight: 'min(60vh, 520px)',
      display: 'flex', flexDirection: 'column',
      background: t.panel, border: `1px solid ${t.amber}55`,
      borderRadius: 8,
      boxShadow: theme === 'dark'
        ? '0 18px 60px rgba(0,0,0,0.55)'
        : '0 18px 60px rgba(30,25,18,0.18)',
      zIndex: 30,
      overflow: 'hidden',
    } : {
      margin: '8px 0 12px',
      border: `1px solid ${t.amber}55`,
      borderRadius: 6, background: t.panel,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', background: t.panel2,
        borderBottom: `1px solid ${t.border}`,
        fontFamily: monoFont, fontSize: 10.5, color: t.dim,
        flexWrap: 'nowrap',
      }}>
        <span style={{ color: t.amber, flexShrink: 0 }}>◆</span>
        <span style={{ color: t.fg, fontWeight: 600, flexShrink: 0 }}>
          Proposal
        </span>
        <span style={{ color: t.dim2, flexShrink: 0 }}>{proposals.length}</span>
        <span
          title={projectLabel(projectKey)}
          style={{
            color: t.dim2, flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>· {projectLabel(projectKey)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => onAcceptAll([...selected].map((i) => proposals[i]))}
            disabled={selected.size === 0}
            style={{
              background: selected.size === 0 ? t.panel2 : t.accent,
              border: 'none', color: selected.size === 0 ? t.dim2 : '#fff',
              padding: '3px 8px', borderRadius: 4,
              fontFamily: monoFont, fontSize: 10.5,
              cursor: selected.size === 0 ? 'default' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>Add {selected.size} →</button>
          <button onClick={onDismiss} style={{
            background: 'transparent', border: `1px solid ${t.border}`,
            color: t.dim, padding: '3px 7px', borderRadius: 4,
            fontFamily: monoFont, fontSize: 10.5, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>dismiss</button>
          {onClose && (
            <button
              onClick={onClose}
              title="Hide panel (proposals kept)"
              aria-label="Close panel"
              style={{
                background: 'transparent', border: 'none',
                color: t.dim2, padding: '0 2px',
                fontSize: 14, lineHeight: 1, cursor: 'pointer',
                flexShrink: 0,
              }}
            >×</button>
          )}
        </span>
      </div>
      <div style={floating ? { overflow: 'auto', flex: 1, minHeight: 0 } : undefined}>
        {proposals.map((p, i) => (
          <div key={i} onClick={() => toggle(i)} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '7px 10px',
            borderBottom: i === proposals.length - 1 ? 'none' : `1px solid ${t.border2}`,
            background: selected.has(i)
              ? 'transparent'
              : (theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
            opacity: selected.has(i) ? 1 : 0.5,
            cursor: 'pointer',
          }}>
            <span style={{
              width: 13, height: 13, marginTop: 2, borderRadius: 3,
              border: `1px solid ${selected.has(i) ? kindColor(theme, p.kind) : t.border}`,
              background: selected.has(i) ? kindColor(theme, p.kind) : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 9, flexShrink: 0,
            }}>{selected.has(i) ? '✓' : ''}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 5px', borderRadius: 3,
              border: `1px solid ${kindColor(theme, p.kind)}55`,
              color: kindColor(theme, p.kind),
              fontFamily: monoFont, fontSize: 9.5,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {kindGlyph(p.kind)} {kindLabel(p.kind)}
            </span>
            <span style={{ flex: 1, color: t.fg, fontSize: 11.5, lineHeight: 1.45 }}>
              <Markdown theme={theme} content={p.text} compact />
              {p.tags.length > 0 && (
                <span style={{ marginLeft: 6, color: t.dim2, fontFamily: monoFont, fontSize: 10 }}>
                  {p.tags.map((tag) => `#${tag}`).join(' ')}
                </span>
              )}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onAccept(p); }} style={{
              background: 'transparent', border: `1px solid ${t.border}`,
              color: t.dim, padding: '2px 6px', borderRadius: 4,
              fontFamily: monoFont, fontSize: 10, cursor: 'pointer',
              flexShrink: 0,
            }}>add</button>
          </div>
        ))}
      </div>
    </div>
  );
}
