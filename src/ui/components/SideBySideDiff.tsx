import type { CSSProperties } from 'react';
import { diffLines } from 'diff';
import { monoFont, themes, type ThemeMode } from '../theme';

interface SideBySideDiffProps {
  theme: ThemeMode;
  oldText: string;
  newText: string;
  /** Cap rendered rows so a huge diff doesn't explode the DOM. */
  maxLines?: number;
  /** Override the default scroll viewport. */
  maxHeight?: number | string;
}

type Side = { kind: 'ctx' | 'add' | 'del' | 'pad'; text: string; n: number | null };
type Row = { left: Side; right: Side };

/**
 * Split-view diff. Removed lines on the left, added on the right.
 * Consecutive del+add runs are paired line-by-line; the longer side gets the
 * remainder paired against blank padding rows.
 */
export function SideBySideDiff({
  theme, oldText, newText, maxLines = 5000, maxHeight = 320,
}: SideBySideDiffProps) {
  const t = themes[theme];
  const isDark = theme === 'dark';
  const rows = buildRows(oldText, newText);

  const truncated = rows.length > maxLines;
  const shown = truncated ? rows.slice(0, maxLines) : rows;

  const addBg = isDark ? 'rgba(94,224,180,0.10)' : 'rgba(63,138,94,0.10)';
  const addFg = isDark ? '#9ce8c5' : '#2a8d68';
  const delBg = isDark ? 'rgba(240,138,138,0.10)' : 'rgba(196,83,83,0.10)';
  const delFg = isDark ? '#f5a3a3' : '#a44545';
  const padBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';

  const cellStyle = (s: Side): CSSProperties => ({
    background: s.kind === 'add' ? addBg
              : s.kind === 'del' ? delBg
              : s.kind === 'pad' ? padBg
              : 'transparent',
    color: s.kind === 'add' ? addFg
         : s.kind === 'del' ? delFg
         : s.kind === 'pad' ? 'transparent'
         : t.fg2,
    padding: '0 10px',
    whiteSpace: 'pre',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  const gutterStyle: CSSProperties = {
    color: t.dim2, opacity: 0.7,
    padding: '0 8px', textAlign: 'right',
    userSelect: 'none', whiteSpace: 'pre',
    fontVariantNumeric: 'tabular-nums',
    background: isDark ? '#0c0e13' : '#fbf8f2',
    borderRight: `1px solid ${t.border2}`,
  };

  const signStyle = (kind: Side['kind']): CSSProperties => ({
    color: kind === 'add' ? addFg : kind === 'del' ? delFg : t.dim2,
    opacity: kind === 'pad' ? 0 : 0.7,
    width: 12, display: 'inline-block', textAlign: 'center',
    userSelect: 'none',
  });

  return (
    <div style={{
      overflow: 'auto', maxHeight,
      background: isDark ? '#0a0c10' : '#fffdf7',
      fontFamily: monoFont, fontSize: 12.5, lineHeight: 1.5,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto 1fr',
        columnGap: 0,
      }}>
        {shown.map((r, i) => (
          <Row key={i}
            left={r.left} right={r.right}
            cellStyle={cellStyle} gutterStyle={gutterStyle} signStyle={signStyle}
            borderColor={t.border2}
          />
        ))}
      </div>
      {truncated && (
        <div style={{ padding: '6px 12px', color: t.dim2, fontStyle: 'italic' }}>
          … {rows.length - maxLines} more rows
        </div>
      )}
    </div>
  );
}

interface RowProps {
  left: Side; right: Side;
  cellStyle: (s: Side) => CSSProperties;
  gutterStyle: CSSProperties;
  signStyle: (k: Side['kind']) => CSSProperties;
  borderColor: string;
}

function Row({ left, right, cellStyle, gutterStyle, signStyle, borderColor }: RowProps) {
  const center: CSSProperties = {
    ...gutterStyle,
    borderLeft: `1px solid ${borderColor}`,
  };
  return (
    <>
      <div style={gutterStyle}>{left.n ?? ''}</div>
      <div style={cellStyle(left)}>
        <span style={signStyle(left.kind)}>{glyph(left.kind)}</span>
        {left.text || ' '}
      </div>
      <div style={center}>{right.n ?? ''}</div>
      <div style={cellStyle(right)}>
        <span style={signStyle(right.kind)}>{glyph(right.kind)}</span>
        {right.text || ' '}
      </div>
    </>
  );
}

function glyph(kind: Side['kind']): string {
  if (kind === 'add') return '+';
  if (kind === 'del') return '−';
  return ' ';
}

function buildRows(oldText: string, newText: string): Row[] {
  const parts = diffLines(oldText, newText);
  const rows: Row[] = [];

  let leftLine = 1; // 1-based original line counter
  let rightLine = 1; // 1-based new line counter
  let pendingDels: string[] = [];
  let pendingDelStart = 0;

  const flushPendingDels = () => {
    if (pendingDels.length === 0) return;
    for (let i = 0; i < pendingDels.length; i++) {
      rows.push({
        left: { kind: 'del', text: pendingDels[i], n: pendingDelStart + i },
        right: { kind: 'pad', text: '', n: null },
      });
    }
    leftLine = pendingDelStart + pendingDels.length;
    pendingDels = [];
  };

  for (const p of parts) {
    const lines = p.value.replace(/\n$/, '').split('\n');
    if (p.added) {
      // Pair with any pending dels first
      const pairCount = Math.min(pendingDels.length, lines.length);
      for (let i = 0; i < pairCount; i++) {
        rows.push({
          left: { kind: 'del', text: pendingDels[i], n: pendingDelStart + i },
          right: { kind: 'add', text: lines[i], n: rightLine + i },
        });
      }
      const leftover = pendingDels.slice(pairCount);
      const leftoverAdds = lines.slice(pairCount);
      // Remaining dels become left-only rows
      for (let i = 0; i < leftover.length; i++) {
        rows.push({
          left: { kind: 'del', text: leftover[i], n: pendingDelStart + pairCount + i },
          right: { kind: 'pad', text: '', n: null },
        });
      }
      // Remaining adds become right-only rows
      for (let i = 0; i < leftoverAdds.length; i++) {
        rows.push({
          left: { kind: 'pad', text: '', n: null },
          right: { kind: 'add', text: leftoverAdds[i], n: rightLine + pairCount + i },
        });
      }
      leftLine = pendingDelStart + pendingDels.length;
      rightLine = rightLine + lines.length;
      pendingDels = [];
    } else if (p.removed) {
      // Flush any leftover from a previous round before starting new dels —
      // shouldn't happen given diffLines output, but defensive.
      if (pendingDels.length > 0) flushPendingDels();
      pendingDels = lines;
      pendingDelStart = leftLine;
    } else {
      // Context: flush any pending dels as pure removals first
      flushPendingDels();
      for (let i = 0; i < lines.length; i++) {
        rows.push({
          left: { kind: 'ctx', text: lines[i], n: leftLine + i },
          right: { kind: 'ctx', text: lines[i], n: rightLine + i },
        });
      }
      leftLine += lines.length;
      rightLine += lines.length;
    }
  }
  // Tail: anything still pending is a removal
  flushPendingDels();

  return rows;
}
