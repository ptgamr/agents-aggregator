import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { monoFont, themes, type ThemeMode } from '../theme';
import { useLightbox } from './Lightbox';

interface MarkdownProps {
  theme: ThemeMode;
  content: string;
  /** Compact mode for thinking blocks (smaller text, tighter spacing). */
  compact?: boolean;
}

export function Markdown({ theme, content, compact }: MarkdownProps) {
  const t = themes[theme];
  const fg = compact ? t.dim : t.fg;
  const fg2 = compact ? t.dim2 : t.fg2;
  const { open: openLightbox } = useLightbox();

  const components: Components = {
    p: ({ children }) => (
      <p style={{ margin: '0 0 0.6em', lineHeight: 1.55 }}>{children}</p>
    ),
    h1: ({ children }) => <h2 style={headingStyle(1.25)}>{children}</h2>,
    h2: ({ children }) => <h3 style={headingStyle(1.15)}>{children}</h3>,
    h3: ({ children }) => <h4 style={headingStyle(1.05)}>{children}</h4>,
    h4: ({ children }) => <h5 style={headingStyle(1.0)}>{children}</h5>,
    h5: ({ children }) => <h6 style={headingStyle(0.95)}>{children}</h6>,
    h6: ({ children }) => <h6 style={headingStyle(0.9)}>{children}</h6>,
    ul: ({ children }) => (
      <ul style={{ margin: '0 0 0.6em', paddingLeft: 22, lineHeight: 1.55 }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: '0 0 0.6em', paddingLeft: 22, lineHeight: 1.55 }}>{children}</ol>
    ),
    li: ({ children }) => <li style={{ margin: '0.15em 0' }}>{children}</li>,
    strong: ({ children }) => <strong style={{ fontWeight: 600, color: t.fg }}>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    del: ({ children }) => <del style={{ color: fg2 }}>{children}</del>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer"
         style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote style={{
        margin: '0 0 0.6em', padding: '4px 12px',
        borderLeft: `2px solid ${t.border}`,
        color: fg2,
      }}>{children}</blockquote>
    ),
    hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${t.border2}`, margin: '0.8em 0' }} />,
    // react-markdown v10 dropped the `inline` flag. `pre` wraps block code,
    // so we only style `code` for the inline case here; the `pre` override
    // renders the block wrapper.
    code: ({ className, children, ...rest }: CodeProps) => {
      const text = String(children).replace(/\n$/, '');
      // If the code has a fenced language class OR contains a newline, the
      // `pre` override will own the chrome and we just emit a bare <code>.
      const isBlock = /language-/.test(className ?? '') || /\n/.test(text);
      if (isBlock) {
        return (
          <code className={className}
                style={{ color: t.fg, background: 'transparent', padding: 0, fontFamily: monoFont }}
                {...rest}>{text}</code>
        );
      }
      return (
        <code style={{
          fontFamily: monoFont, fontSize: '0.9em',
          padding: '1px 5px', borderRadius: 3,
          background: t.panel2, color: t.fg,
        }} {...rest}>{text}</code>
      );
    },
    pre: ({ children }) => (
      <pre style={{
        margin: '0 0 0.6em', padding: '10px 12px', borderRadius: 6,
        background: theme === 'dark' ? '#0a0c10' : '#fffdf7',
        border: `1px solid ${t.border2}`,
        fontFamily: monoFont, fontSize: 13,
        overflow: 'auto', lineHeight: 1.45,
      }}>{children}</pre>
    ),
    img: ({ src, alt, title }) => {
      if (!src) return null;
      const safeSrc = typeof src === 'string' ? src : '';
      if (!safeSrc) return null;
      return (
        <img
          src={safeSrc} alt={alt ?? ''} title={title} loading="lazy"
          onClick={(e) => { e.stopPropagation(); openLightbox([{ src: safeSrc, alt: alt ?? '' }], 0); }}
          style={{
            maxWidth: '100%', maxHeight: 320, height: 'auto',
            borderRadius: 6, border: `1px solid ${t.border2}`,
            background: t.panel2, display: 'block', margin: '6px 0',
            cursor: 'zoom-in',
          }}
        />
      );
    },
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', margin: '0 0 0.6em' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.95em' }}>{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{
        textAlign: 'left', padding: '4px 8px',
        borderBottom: `1px solid ${t.border}`, color: fg, fontWeight: 600,
      }}>{children}</th>
    ),
    td: ({ children }) => (
      <td style={{ padding: '4px 8px', borderBottom: `1px solid ${t.border2}`, color: fg2 }}>{children}</td>
    ),
  };

  return (
    <div style={{
      color: fg, fontSize: compact ? 13.5 : 14,
      // Long URLs, JSON, identifiers must wrap or they push the column wide.
      overflowWrap: 'anywhere', wordBreak: 'break-word',
      minWidth: 0,
    }} className="md">
      <style>{`.md > *:last-child { margin-bottom: 0 !important; }`}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}

function headingStyle(scale: number) {
  return {
    margin: '0.6em 0 0.3em',
    fontSize: `${scale}em`,
    fontWeight: 600,
    lineHeight: 1.3,
  } as const;
}

type CodeProps = ComponentPropsWithoutRef<'code'> & { children?: ReactNode };
