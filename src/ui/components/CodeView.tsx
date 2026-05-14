import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { monoFont, themes, type ThemeMode } from '../theme';

const REGISTERED = new Set<string>();
function register(name: string, lang: unknown): void {
  if (REGISTERED.has(name)) return;
  // The library types are loose; cast at the boundary.
  (SyntaxHighlighter as unknown as { registerLanguage: (n: string, l: unknown) => void })
    .registerLanguage(name, lang);
  REGISTERED.add(name);
}

register('bash', bash);
register('css', css);
register('go', go);
register('java', java);
register('javascript', javascript);
register('json', json);
register('jsx', jsx);
register('markdown', markdown);
register('markup', markup);
register('php', php);
register('python', python);
register('ruby', ruby);
register('rust', rust);
register('sql', sql);
register('toml', toml);
register('tsx', tsx);
register('typescript', typescript);
register('yaml', yaml);

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx',
  js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  py: 'python', pyi: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
  md: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
};

export function languageForPath(path: string): string | null {
  // Strip query/hash, then look at extension.
  const clean = path.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = clean.slice(dot + 1).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

interface CodeViewProps {
  theme: ThemeMode;
  path: string;
  code: string;
  /** Optional override; otherwise inferred from `path`. */
  language?: string | null;
  /** Cap the rendered viewport. Defaults to the full container ('none'). */
  maxHeight?: number | string;
  showLineNumbers?: boolean;
}

export function CodeView({
  theme, path, code, language, maxHeight = 'none', showLineNumbers = true,
}: CodeViewProps) {
  const t = themes[theme];
  const isDark = theme === 'dark';
  const lang = language ?? languageForPath(path);
  const style = isDark ? oneDark : oneLight;

  // If we have no language match, fall back to a plain <pre> — prism would
  // render unchanged tokens anyway, and we avoid the syntax-highlighter overhead.
  if (!lang) {
    return (
      <pre style={{
        margin: 0, padding: '12px 14px',
        background: isDark ? '#0a0c10' : '#fffdf7',
        color: t.fg, fontFamily: monoFont, fontSize: 12.5, lineHeight: 1.5,
        overflow: 'auto', maxHeight, whiteSpace: 'pre',
      }}>{code}</pre>
    );
  }

  return (
    <div style={{
      overflow: 'auto', maxHeight,
      background: isDark ? '#0a0c10' : '#fffdf7',
    }}>
      <SyntaxHighlighter
        language={lang}
        style={style}
        showLineNumbers={showLineNumbers}
        wrapLongLines={false}
        customStyle={{
          margin: 0,
          padding: '12px 14px',
          background: 'transparent',
          fontFamily: monoFont,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
        codeTagProps={{ style: { fontFamily: monoFont, fontSize: 12.5 } }}
        lineNumberStyle={{
          color: t.dim2, opacity: 0.7,
          minWidth: '2.4em', paddingRight: '1em',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
