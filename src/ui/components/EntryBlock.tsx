import type { CSSProperties, ReactNode } from 'react';
import type { Entry, EntryImage, Session } from '../../shared/types';
import { LivePip } from './AgentChip';
import { DiffView } from './DiffView';
import { previewFromArgs, useFilePreview } from './FilePreview';
import { Markdown } from './Markdown';
import { useLightbox, type LightboxImage } from './Lightbox';
import {
  AGENT_GLYPHS, AGENT_HUES,
  monoFont, sansFont, themes,
  type AgentTreatment, type Theme, type ThemeMode,
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
  const { open: openPreview } = useFilePreview();
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
          fontSize: 11, color: t.dim2, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 6, fontStyle: 'normal',
          fontFamily: monoFont, fontWeight: 600,
        }}>
          ▾ thinking · {e.timestamp}
        </div>
        <div style={{ fontSize: 13.5, color: t.dim, lineHeight: 1.55 }}>
          <Markdown theme={theme} content={e.text ?? ''} compact />
        </div>
      </div>
    );
  }

  if (isTool) {
    const body = renderToolBody(e, theme, t);
    const preview = previewFromArgs(e.tool, e.args as Record<string, unknown> | undefined);
    const path = e.args?.path;
    const expand = (ev: { stopPropagation: () => void }) => {
      ev.stopPropagation();
      if (preview) openPreview(preview);
    };
    return (
      <div onClick={onSelect} style={{
        ...baseStyle, border: `1px solid ${selected ? t.accent : t.border}`,
        overflow: 'hidden', fontFamily: monoFont,
        animation: isNew ? 'enterStrong 1s ease-out' : 'none',
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '7px 12px', background: t.panel2,
          fontSize: 12, color: t.dim,
        }}>
          <span style={{ color: t.accent }}>▸</span>
          <span style={{ color: t.fg, fontWeight: 500 }}>{e.tool}</span>
          {path ? (
            <span
              onClick={preview ? expand : undefined}
              title={preview ? `Open ${path}` : path}
              style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: preview ? 'pointer' : 'default',
                textDecoration: preview ? 'underline' : 'none',
                textDecorationColor: t.dim2,
                textUnderlineOffset: 2,
                color: preview ? t.fg2 : t.dim,
              }}
            >{path}</span>
          ) : (
            <span style={{ flex: 1, minWidth: 0 }} />
          )}
          {preview && (
            <button
              type="button"
              onClick={expand}
              aria-label="Open full diff"
              title="Open full diff"
              style={{
                background: 'transparent', color: t.dim,
                border: `1px solid ${t.border}`, borderRadius: 4,
                padding: '2px 6px', fontSize: 11, lineHeight: 1, cursor: 'pointer',
                fontFamily: monoFont,
              }}
            >⤢</button>
          )}
          <span style={{ color: t.dim2 }}>{e.timestamp}</span>
        </div>
        {body}
      </div>
    );
  }

  if (isResult) {
    return (
      <div onClick={onSelect} style={{
        ...baseStyle, padding: '6px 12px',
        fontFamily: monoFont, fontSize: 12.5, color: t.green,
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
          fontSize: 12.5, color: t.amber,
        }}>
          <span>$ {e.cmd}</span>
          <span style={{ color: t.dim2 }}>{e.timestamp}</span>
        </div>
        <pre style={{
          margin: 0, padding: '8px 12px', fontSize: 12.5, color: t.dim,
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
        fontSize: 12, fontWeight: 700, fontFamily: sansFont,
      }}>{isUser ? 'You' : AGENT_GLYPHS[session.agent]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: t.dim2, marginBottom: 4 }}>
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
        <div style={{ color: t.fg, fontSize: 14, lineHeight: 1.55 }}>
          {e.text && <Markdown theme={theme} content={e.text} />}
          {e.images && e.images.length > 0 && <Images images={e.images} theme={theme} />}
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

// ── Inline images ───────────────────────────────────────────────────────────

function imageSrc(img: EntryImage): string {
  if (img.url) return img.url;
  if (img.data) return `data:${img.mime || 'image/png'};base64,${img.data}`;
  return '';
}

function Images({ images, theme }: { images: EntryImage[]; theme: ThemeMode }) {
  const t = themes[theme];
  const { open } = useLightbox();
  const lbImages: LightboxImage[] = images
    .map((img) => ({ src: imageSrc(img) }))
    .filter((x) => x.src);
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8,
      margin: '8px 0 4px',
    }}>
      {images.map((img, i) => {
        const src = imageSrc(img);
        if (!src) return null;
        return (
          <img
            key={i} src={src} alt="" loading="lazy"
            onClick={(e) => { e.stopPropagation(); open(lbImages, i); }}
            style={{
              maxWidth: '100%', maxHeight: 320, height: 'auto',
              borderRadius: 6, border: `1px solid ${t.border2}`,
              background: t.panel2, display: 'block', cursor: 'zoom-in',
            }}
          />
        );
      })}
    </div>
  );
}

// ── Tool-specific bodies ────────────────────────────────────────────────────

function renderToolBody(e: Entry, theme: ThemeMode, t: Theme): ReactNode {
  const args = (e.args ?? {}) as Record<string, unknown>;

  // Single-edit (Claude Edit) → old/new diff
  if (typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    return <DiffView theme={theme} oldText={args.old_string as string} newText={args.new_string as string} />;
  }

  // Multi-edit → stack of diffs, separated by hairlines
  if (Array.isArray(args.edits)) {
    return (
      <div>
        {(args.edits as Array<{ old_string?: string; new_string?: string }>).map((ed, i) => {
          if (typeof ed?.old_string !== 'string' || typeof ed?.new_string !== 'string') return null;
          return (
            <div key={i} style={{
              borderTop: i === 0 ? 'none' : `1px solid ${t.border2}`,
            }}>
              <DiffView theme={theme} oldText={ed.old_string} newText={ed.new_string} maxLines={120} />
            </div>
          );
        })}
      </div>
    );
  }

  // Write → new file content (treat as add-only diff so it gets the green tint)
  if (typeof args.content === 'string') {
    return <DiffView theme={theme} oldText="" newText={args.content as string} />;
  }

  // Default: cheap preview
  return (
    <pre style={{
      margin: 0, padding: '10px 12px', fontSize: 12.5, color: t.fg,
      background: theme === 'dark' ? '#0a0c10' : '#fffdf7',
      whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 140,
      fontFamily: monoFont,
    }}>{e.preview}</pre>
  );
}
