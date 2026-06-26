/**
 * Prism status mapping — the single translation from recorded file_objects.state
 * to spine illumination, chip label, quality-ring, and user-facing confirmation
 * copy. Every surface renders FROM this map, so the spine, the chip, the ring,
 * and the audit row are all renders of one fact (verified confirmation, §6A).
 *
 * Illumination (DS-031 §3.4): received → low-emphasis; scanning → info (blue);
 * clean/promoted → success (green); infected_held → danger (red). --vl-info /
 * --vl-warning do NOT exist — state colors come from the centralized SEMANTIC
 * map (consumed by name; theme-agnostic indicators, HF-327-compliant).
 */

import { SEMANTIC } from '@/components/insights/ds003/ds003-tokens';
import type { FileObjectState } from '@/lib/prism/types';

export interface FileRow {
  id: string;
  original_filename: string;
  mime_detected: string | null;
  byte_size: number | null;
  state: FileObjectState;
  scan_verdict: string | null;
  scan_engine_version: string | null;
  scanned_at: string | null;
  promoted_at: string | null;
  content_sha256: string;
  classification: string | null;
  created_at: string;
}

export type NodeStatus = 'done' | 'active' | 'pending' | 'attention' | 'forthcoming' | 'blocked';

export interface SpineNode {
  key: string;
  label: string;
  status: NodeStatus;
  forthcoming?: boolean;
}

const NEUTRAL = 'var(--vl-text-soft, #8A90A6)';

/** The journey nodes for a file, with each node's status given the current state. */
export function spineNodes(state: FileObjectState): SpineNode[] {
  const held = state === 'infected_held';
  const past = (target: FileObjectState[]) => target.includes(state);

  const receivedDone = state !== 'received';
  const quarantinedStatus: NodeStatus = state === 'received' ? 'pending' : state === 'quarantined' ? 'active' : 'done';
  const scanStatus: NodeStatus = held
    ? 'attention'
    : state === 'scanning'
      ? 'active'
      : past(['clean', 'promoted'])
        ? 'done'
        : 'pending';
  const promotedStatus: NodeStatus = state === 'promoted' ? 'done' : held ? 'blocked' : 'pending';

  return [
    { key: 'received', label: 'Received', status: receivedDone ? 'done' : 'active' },
    { key: 'quarantined', label: 'Quarantined', status: quarantinedStatus },
    { key: 'scanned', label: held ? 'Scan failed' : 'Scanned', status: scanStatus },
    // Inert seam (§3.1/§4): the forthcoming conditioning step. Always present, never lit in Slice 1.
    { key: 'condition', label: 'Condition', status: held ? 'blocked' : 'forthcoming', forthcoming: true },
    { key: 'promoted', label: held ? 'Held' : 'Promoted', status: held ? 'attention' : promotedStatus },
  ];
}

/** The illumination color for a node status (theme-agnostic state indicator). */
export function nodeColor(status: NodeStatus): string {
  switch (status) {
    case 'done':
      return SEMANTIC.green;
    case 'active':
      return SEMANTIC.blue;
    case 'attention':
      return SEMANTIC.red;
    default:
      return NEUTRAL;
  }
}

export interface StateSummary {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'danger';
  message: string;
}

/** Chip label + user-facing confirmation message, backed by the recorded state. */
export function stateSummary(state: FileObjectState): StateSummary {
  switch (state) {
    case 'received':
    case 'quarantined':
      return { label: 'Scanning', tone: 'info', message: 'Arrived safely — scanning now' };
    case 'scanning':
      return { label: 'Scanning', tone: 'info', message: 'Scanning now' };
    case 'clean':
      return { label: 'Clean', tone: 'success', message: 'Cleared — landing on the platform' };
    case 'promoted':
      return { label: 'Promoted', tone: 'success', message: 'Cleared and ready for the platform' };
    case 'infected_held':
      return { label: 'Held', tone: 'danger', message: "Held for review — here's why" };
  }
}

export interface RingSpec {
  value: number; // 0..1 fill
  color: string;
  indeterminate: boolean;
}

/** Quality ring = scan / integrity outcome (binary in Slice 1; no agent driver). */
export function ringFor(state: FileObjectState): RingSpec {
  switch (state) {
    case 'promoted':
    case 'clean':
      return { value: 1, color: SEMANTIC.green, indeterminate: false };
    case 'infected_held':
      return { value: 1, color: SEMANTIC.red, indeterminate: false };
    case 'scanning':
      return { value: 0.66, color: SEMANTIC.blue, indeterminate: true };
    default:
      return { value: 0, color: NEUTRAL, indeterminate: false };
  }
}

export function toneTextClass(tone: StateSummary['tone']): string {
  switch (tone) {
    case 'success':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'danger':
      return 'text-red-600 dark:text-red-400';
    case 'info':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-muted-foreground';
  }
}

export function formatBytes(n: number | null): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
