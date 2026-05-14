import { diffLines } from 'diff';
import { monoFont, themes, type ThemeMode } from '../theme';

interface DiffViewProps {
  theme: ThemeMode;
  oldText: string;
  newText: string;
  /** Cap rendered lines so a 5000-line refactor doesn't blow up the entry block. */
  maxLines?: number;
  /** Override the default 320px scroll viewport (e.g. for the focused modal). */
  maxHeight?: number | string;
}

/**
 * Unified line-level diff. Removed lines render with a red tint and "-" prefix;
 * added lines green with "+". Context lines are dim.
 */
export function DiffView({ theme, oldText, newText, maxLines = 200, maxHeight = 320 }: DiffViewProps) {
  const t = themes[theme];
  const isDark = theme === 'dark';
  const parts = diffLines(oldText, newText);

  type Row = { kind: 'add' | 'del' | 'ctx'; text: string };
  const rows: Row[] = [];
  for (const p of parts) {
    const kind: Row['kind'] = p.added ? 'add' : p.removed ? 'del' : 'ctx';
    const lines = p.value.replace(/\n$/, '').split('\n');
    for (const line of lines) rows.push({ kind, text: line });
  }

  const truncated = rows.length > maxLines;
  const shown = truncated ? rows.slice(0, maxLines) : rows;

  const addBg = isDark ? 'rgba(94,224,180,0.10)' : 'rgba(63,138,94,0.10)';
  const addFg = isDark ? '#9ce8c5' : '#2a8d68';
  const delBg = isDark ? 'rgba(240,138,138,0.10)' : 'rgba(196,83,83,0.10)';
  const delFg = isDark ? '#f5a3a3' : '#a44545';

  return (
    <pre style={{
      margin: 0, padding: '8px 0', fontFamily: monoFont, fontSize: 12.5,
      background: isDark ? '#0a0c10' : '#fffdf7',
      overflow: 'auto', maxHeight, lineHeight: 1.45,
    }}>
      {shown.map((r, i) => (
        <div key={i} style={{
          padding: '0 12px',
          background: r.kind === 'add' ? addBg : r.kind === 'del' ? delBg : 'transparent',
          color: r.kind === 'add' ? addFg : r.kind === 'del' ? delFg : t.fg2,
        }}>
          <span style={{ opacity: 0.6, marginRight: 8, display: 'inline-block', width: 10 }}>
            {r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}
          </span>
          {r.text || ' '}
        </div>
      ))}
      {truncated && (
        <div style={{ padding: '6px 12px', color: t.dim2, fontStyle: 'italic' }}>
          … {rows.length - maxLines} more lines
        </div>
      )}
    </pre>
  );
}
