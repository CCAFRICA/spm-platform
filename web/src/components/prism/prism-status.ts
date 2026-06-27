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

export type NodeStatus = 'done' | 'active' | 'pending' | 'attention' | 'warning' | 'forthcoming' | 'blocked';

/**
 * A held file (state = infected_held) carries one of two verdicts that mean very
 * different things and MUST read differently (HF-348, Decision 123):
 *   - 'error'    → the scanner was unavailable/timed out (OUR side, temporary). The
 *                  file is fine; it goes to "Under review" (calm), no rejection.
 *   - 'infected' → the FILE contains a threat (rejected). "Not accepted" + an action.
 */
export type HoldKind = 'error' | 'infected';
export function holdKind(verdict: string | null | undefined): HoldKind {
  // Only a KNOWN-infected verdict reads as "Not accepted". Anything else — a scan error,
  // an unrecorded or raced verdict — reads as "Under review": never falsely reject a good
  // file (the HF-348 invariant). The bytes are quarantined regardless, so this is UX-only.
  return verdict === 'infected' ? 'infected' : 'error';
}

export interface SpineNode {
  key: string;
  label: string;
  status: NodeStatus;
  forthcoming?: boolean;
}

const NEUTRAL = 'var(--vl-text-soft, #8A90A6)';

/** The journey nodes for a file, with each node's status given the current state + verdict. */
export function spineNodes(state: FileObjectState, verdict?: string | null): SpineNode[] {
  const held = state === 'infected_held';
  const kind = held ? holdKind(verdict) : null;
  // A held file lights amber (under review, our side) or red (not accepted, the file).
  const heldStatus: NodeStatus = kind === 'error' ? 'warning' : 'attention';
  const past = (target: FileObjectState[]) => target.includes(state);

  const receivedDone = state !== 'received';
  const quarantinedStatus: NodeStatus = state === 'received' ? 'pending' : state === 'quarantined' ? 'active' : 'done';
  const scanStatus: NodeStatus = held
    ? heldStatus
    : state === 'scanning'
      ? 'active'
      : past(['clean', 'promoted'])
        ? 'done'
        : 'pending';
  const promotedStatus: NodeStatus = state === 'promoted' ? 'done' : held ? 'blocked' : 'pending';

  return [
    { key: 'received', label: 'Received', status: receivedDone ? 'done' : 'active' },
    { key: 'quarantined', label: 'Quarantined', status: quarantinedStatus },
    { key: 'scanned', label: held ? (kind === 'error' ? 'Scan paused' : 'Threat found') : 'Scanned', status: scanStatus },
    // Inert seam (§3.1/§4): the forthcoming conditioning step. Always present, never lit in Slice 1.
    { key: 'condition', label: 'Condition', status: held ? 'blocked' : 'forthcoming', forthcoming: true },
    {
      key: 'promoted',
      label: held ? (kind === 'error' ? 'Under review' : 'Not accepted') : 'Promoted',
      status: held ? heldStatus : promotedStatus,
    },
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
    case 'warning':
      return SEMANTIC.amber;
    default:
      return NEUTRAL;
  }
}

export interface StateSummary {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning';
  message: string;
}

/** Audience for the confirmation voice (DS-032 §3.4): operator surfaces vs the CDA portal. */
export type Audience = 'operator' | 'customer';

// Customer-facing voice for the focused portal (DS-032 §3.3): warmer ("secure your
// data", not "scanning"). Same recorded state → both renders (verified confirmation §6A).
const CUSTOMER_MESSAGE: Partial<Record<FileObjectState, string>> = {
  received: 'Arrived safely — securing your data now',
  quarantined: 'Arrived safely — securing your data now',
  scanning: 'Securing your data now',
  clean: 'Cleared — finishing up',
  promoted: 'Cleared and ready',
  // infected_held is verdict-aware → handled by heldSummary, never a flat string here.
};

/**
 * Chip label + user-facing message, backed by the recorded state AND verdict.
 * Held files split by verdict (HF-348): 'error' → "Under review" (calm); else "Not accepted".
 */
export function stateSummary(
  state: FileObjectState,
  audience: Audience = 'operator',
  verdict?: string | null,
): StateSummary {
  if (state === 'infected_held') {
    return heldSummary(holdKind(verdict), audience);
  }
  const base = operatorSummary(state);
  if (audience === 'customer' && CUSTOMER_MESSAGE[state]) {
    return { ...base, message: CUSTOMER_MESSAGE[state] };
  }
  return base;
}

/** The two held verdicts read very differently — honest, never conflated (Decision 123). */
function heldSummary(kind: HoldKind, audience: Audience): StateSummary {
  if (kind === 'error') {
    return {
      label: 'Under review',
      tone: 'warning',
      message:
        audience === 'customer'
          ? "We're taking a closer look — a Vialuce data expert will review this and follow up with you. Your file is encrypted and safely kept; there's nothing you need to do right now."
          : 'Scan error — held for review (scanner unavailable). The file is retained and can be re-scanned.',
    };
  }
  return {
    label: 'Not accepted',
    tone: 'danger',
    message:
      audience === 'customer'
        ? "This file looks like it contains a security threat, so we couldn't accept it. Please check the file on your device and upload a clean copy."
        : 'Held — scan verdict: infected. Bytes retained in quarantine, not promoted.',
  };
}

function operatorSummary(state: FileObjectState): StateSummary {
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
    default:
      // The DB `state` column is open text; an out-of-union value renders neutrally.
      return { label: 'Processing', tone: 'neutral', message: 'In progress' };
  }
}

export interface RingSpec {
  value: number; // 0..1 fill
  color: string;
  indeterminate: boolean;
}

/** Quality ring = scan / integrity outcome. Held splits amber (under review) vs red (not accepted). */
export function ringFor(state: FileObjectState, verdict?: string | null): RingSpec {
  switch (state) {
    case 'promoted':
    case 'clean':
      return { value: 1, color: SEMANTIC.green, indeterminate: false };
    case 'infected_held':
      return { value: 1, color: holdKind(verdict) === 'error' ? SEMANTIC.amber : SEMANTIC.red, indeterminate: false };
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
    case 'warning':
      return 'text-amber-700 dark:text-amber-400'; // amber-700 clears WCAG AA on the light card
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
