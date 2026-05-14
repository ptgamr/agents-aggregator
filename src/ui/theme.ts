import type { AgentType } from '../shared/types';

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  bg: string;
  panel: string;
  panel2: string;
  panel3: string;
  border: string;
  border2: string;
  dim: string;
  dim2: string;
  fg: string;
  fg2: string;
  accent: string;
  green: string;
  amber: string;
  red: string;
  overlay: string;
}

export const themes: Record<ThemeMode, Theme> = {
  dark: {
    bg: '#0b0d11',
    panel: '#0f1217',
    panel2: '#13171e',
    panel3: '#181d26',
    border: 'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.04)',
    dim: 'rgba(230,232,238,0.52)',
    dim2: 'rgba(230,232,238,0.34)',
    fg: 'rgba(230,232,238,0.94)',
    fg2: 'rgba(230,232,238,0.74)',
    accent: '#7C8CFF',
    green: '#5EE0B4',
    amber: '#F5C76A',
    red: '#F08A8A',
    overlay: 'rgba(0,0,0,0.4)',
  },
  light: {
    bg: '#faf9f5',
    panel: '#ffffff',
    panel2: '#f5f2ea',
    panel3: '#ece8dc',
    border: 'rgba(30,25,18,0.10)',
    border2: 'rgba(30,25,18,0.06)',
    dim: 'rgba(30,25,18,0.55)',
    dim2: 'rgba(30,25,18,0.36)',
    fg: '#1a1612',
    fg2: 'rgba(30,25,18,0.78)',
    accent: '#4f5dd6',
    green: '#3f8a5e',
    amber: '#b97a16',
    red: '#c45353',
    overlay: 'rgba(0,0,0,0.20)',
  },
};

export interface AgentHue {
  fg: string;
  bg: string;
  solid: string;
}

export const AGENT_HUES: Record<ThemeMode, Record<AgentType, AgentHue>> = {
  dark: {
    pi: { fg: '#5EE0B4', bg: 'rgba(94,224,180,0.10)', solid: '#2a9c75' },
    claude: { fg: '#F5A65C', bg: 'rgba(245,166,92,0.10)', solid: '#c97a30' },
    codex: { fg: '#7CC3FF', bg: 'rgba(124,195,255,0.10)', solid: '#3d7ec6' },
    opencode: { fg: '#C792EA', bg: 'rgba(199,146,234,0.10)', solid: '#8651b8' },
  },
  light: {
    pi: { fg: '#2a8d68', bg: 'rgba(63,138,94,0.12)', solid: '#3f8a5e' },
    claude: { fg: '#b9601c', bg: 'rgba(200,85,61,0.12)', solid: '#c8553d' },
    codex: { fg: '#2d56b8', bg: 'rgba(61,108,200,0.12)', solid: '#3d6cc8' },
    opencode: { fg: '#6e3eb2', bg: 'rgba(124,77,200,0.12)', solid: '#7c4dc8' },
  },
};

export const AGENT_GLYPHS: Record<AgentType, string> = {
  pi: 'π',
  claude: 'C',
  codex: '⌘',
  opencode: 'O',
};

export const sansFont = '"Inter", ui-sans-serif, system-ui, sans-serif';
export const monoFont = '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

export type AgentTreatment = 'chip' | 'letter' | 'text';
export type Density = 'compact' | 'comfy';
export type DetailShape = 'chat' | 'timeline' | 'inspect';

export interface Tweaks {
  theme: ThemeMode;
  density: Density;
  agentTreatment: AgentTreatment;
  detailShape: DetailShape;
  liveLoud: boolean;
  showRawColumn: boolean;
}

export const TWEAK_DEFAULTS: Tweaks = {
  theme: 'dark',
  density: 'compact',
  agentTreatment: 'chip',
  detailShape: 'chat',
  liveLoud: true,
  showRawColumn: false,
};
