/**
 * Design System Tokens — Persona-Driven Visualization Psychology
 *
 * Three layers:
 *   1. Persona Color Tokens (Wayfinder Layer 3) — WHO you are
 *   2. State Communication Tokens (Wayfinder Layer 2) — WHAT the data says
 *   3. Workspace Ambient Tokens (Wayfinder Layer 1) — WHERE you are
 *
 * TMR Addendum 7: Persona-Driven Visualization Psychology
 * DS-001: Interactive Prototype Foundation
 */

// ============================================
// PERSONA COLOR TOKENS (Wayfinder Layer 3)
// ============================================

export const PERSONA_TOKENS = {
  admin: {
    // Indigo — analytical thinking, trust, governance authority
    bg: 'from-slate-950 via-indigo-950/40 to-slate-950',
    accent: 'indigo',
    accentGrad: 'from-indigo-500 to-violet-500',
    heroGrad: 'from-indigo-600/80 to-violet-700/80',
    heroBorder: 'border-indigo-500/20',
    heroShadow: 'shadow-indigo-950/50',
    heroTextMuted: 'text-indigo-200/60',
    heroTextLabel: 'text-indigo-200/70',
    intent: 'Gobernar',
    intentDescription: 'Governance & System Health',
  },
  manager: {
    // Amber/Gold — warmth, mentorship, coaching, illumination
    bg: 'from-slate-950 via-amber-950/25 to-slate-950',
    accent: 'amber',
    accentGrad: 'from-amber-500 to-yellow-500',
    heroGrad: 'from-amber-600/70 to-yellow-700/60',
    heroBorder: 'border-amber-500/20',
    heroShadow: 'shadow-amber-950/50',
    heroTextMuted: 'text-amber-100/50',
    heroTextLabel: 'text-amber-100/60',
    intent: 'Acelerar',
    intentDescription: 'Development & Acceleration',
  },
  rep: {
    // Emerald/Lime — growth trajectory, progress, mastery
    bg: 'from-slate-950 via-emerald-950/25 to-slate-950',
    accent: 'emerald',
    accentGrad: 'from-emerald-500 to-lime-400',
    heroGrad: 'from-emerald-600/70 to-teal-700/70',
    heroBorder: 'border-emerald-500/20',
    heroShadow: 'shadow-emerald-950/50',
    heroTextMuted: 'text-emerald-100/50',
    heroTextLabel: 'text-emerald-100/60',
    intent: 'Crecer',
    intentDescription: 'Mastery & Progress',
  },
} as const;

export type PersonaKey = keyof typeof PERSONA_TOKENS;

// ============================================
// STATE COMMUNICATION TOKENS (Wayfinder Layer 2)
// ============================================

/**
 * NEVER use stoplight red/yellow/green for state communication.
 * Use completeness, opacity, and benchmark deviation.
 */
export const STATE_COMMUNICATION_TOKENS = {
  confirmed: 'opacity-100',
  proposed: 'opacity-70 border-dashed',
  attention: 'ring-1 ring-amber-500/30',
  neutral: 'opacity-50',
  // Performance states — based on benchmark deviation, not absolute color
  aboveBenchmark: 'text-emerald-400',
  atBenchmark: 'text-zinc-300',
  belowBenchmark: 'text-amber-400',
  criticallyBelow: 'text-rose-400',
} as const;

// ============================================
// WORKSPACE AMBIENT TOKENS (Wayfinder Layer 1)
// ============================================

export const WORKSPACE_TOKENS = {
  operate: { density: 'normal' as const, character: 'Control room: structured, sequential' },
  perform: { density: 'low' as const, character: 'Motivational: warm, encouraging' },
  investigate: { density: 'high' as const, character: 'Forensic lab: precise, evidence-based' },
  design: { density: 'low' as const, character: 'Creative: open, sandbox-like' },
  configure: { density: 'normal' as const, character: 'Organizational: spatial, structural' },
  govern: { density: 'high' as const, character: 'Compliance: formal, audit-oriented' },
} as const;

export type WorkspaceKey = keyof typeof WORKSPACE_TOKENS;

// ============================================
// COMPONENT PALETTE
// ============================================

/**
 * 6-color palette for stacked bar charts and part-of-whole visualizations.
 * Designed for dark backgrounds with sufficient contrast between adjacent segments.
 */
export const COMPONENT_PALETTE = [
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
] as const;

// ============================================
// SEVERITY PALETTE
// ============================================

export const SEVERITY_COLORS = {
  opportunity: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  watch: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  critical: { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400' },
} as const;

export type SeverityLevel = keyof typeof SEVERITY_COLORS;

// ============================================
// PRIORITY COLORS
// ============================================

export const PRIORITY_COLORS = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-zinc-500',
} as const;

// ============================================
// STATUS PILL COLORS
// ============================================

export const PILL_COLORS = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  gold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
} as const;

export type PillColor = keyof typeof PILL_COLORS;
