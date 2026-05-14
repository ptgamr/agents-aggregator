import type { ReactNode } from 'react';
import type { Entry, Session } from '../../shared/types';
import { monoFont, themes, type Theme, type ThemeMode } from '../theme';

interface InspectorRailProps {
  theme: ThemeMode;
  entry: Entry | undefined;
  session: Session | undefined;
}

export function InspectorRail({ theme, entry, session }: InspectorRailProps) {
  const t = themes[theme];
  if (!entry) return <div style={{ background: t.panel, borderLeft: `1px solid ${t.border}` }} />;

  const raw = entryToRaw(entry, session);
  return (
    <div style={{
      background: t.panel, borderLeft: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ color: t.dim2, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Inspector
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: t.fg, fontFamily: monoFont, fontSize: 11 }}>{entry.id}</span>
          <span style={{ marginLeft: 'auto', color: t.dim, fontFamily: monoFont, fontSize: 11 }}>
            {entry.role}
          </span>
        </div>
      </div>

      <div style={{
        display: 'flex', borderBottom: `1px solid ${t.border}`,
        fontFamily: monoFont, fontSize: 11, color: t.dim2,
      }}>
        {(['raw', 'meta', 'usage'] as const).map((tab, i) => (
          <div key={tab} style={{
            padding: '8px 14px',
            color: i === 0 ? t.fg : t.dim2,
            borderBottom: i === 0 ? `2px solid ${t.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{tab}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <pre style={{
          margin: 0, padding: '12px 16px',
          fontFamily: monoFont, fontSize: 11, color: t.fg2, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{syntaxColor(raw, t)}</pre>
      </div>

      <div style={{
        padding: '10px 16px', borderTop: `1px solid ${t.border}`,
        display: 'flex', gap: 8, fontFamily: monoFont, fontSize: 11, color: t.dim,
      }}>
        <span style={{ padding: '3px 8px', background: t.panel2, borderRadius: 4 }}>copy</span>
        <span style={{ padding: '3px 8px', background: t.panel2, borderRadius: 4 }}>open file</span>
      </div>
    </div>
  );
}

function entryToRaw(e: Entry, session: Session | undefined): string {
  const obj: Record<string, unknown> = {
    id: e.id,
    parentId: null,
    role: e.role,
    timestamp: e.timestamp,
    session: session?.id,
    source: session?.sourceId,
    agent: session?.agent,
  };
  if (e.text) obj.text = e.text;
  if (e.tool) obj.tool = e.tool;
  if (e.args) obj.args = e.args;
  if (e.preview) obj.preview = e.preview.length > 80 ? e.preview.slice(0, 80) + '…' : e.preview;
  if (e.cmd) obj.cmd = e.cmd;
  if (e.out) obj.out = e.out.length > 200 ? e.out.slice(0, 200) + '…' : e.out;
  if (e.ok != null) obj.ok = e.ok;
  if (e.summary) obj.summary = e.summary;
  if (session?.model) obj.model = session.model;
  return JSON.stringify(obj, null, 2);
}

function syntaxColor(jsonStr: string, t: Theme): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jsonStr)) !== null) {
    if (m.index > i) parts.push(jsonStr.slice(i, m.index));
    if (m[1]) {
      parts.push(<span key={`k${m.index}`} style={{ color: t.accent }}>{m[1]}</span>, ':');
    } else if (m[2]) {
      parts.push(<span key={`s${m.index}`} style={{ color: t.green }}>{m[2]}</span>);
    } else if (m[3]) {
      parts.push(<span key={`l${m.index}`} style={{ color: t.amber }}>{m[3]}</span>);
    } else if (m[4]) {
      parts.push(<span key={`n${m.index}`} style={{ color: t.amber }}>{m[4]}</span>);
    }
    i = re.lastIndex;
  }
  if (i < jsonStr.length) parts.push(jsonStr.slice(i));
  return parts;
}
