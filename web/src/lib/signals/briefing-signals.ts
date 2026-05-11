/**
 * Briefing Signal Capture — OB-163 Phase 9
 *
 * Lightweight signal capture for briefing interactions.
 * Captures view, click, expand, and navigate events.
 * Signals are batched and sent asynchronously.
 */

import { createClient } from '@/lib/supabase/client';
// OB-199 Phase 4: bypass writer removed; routes through canonical writer per DS-023 §5.1.
// Client-side (browser) variant uses writeSignalBatchWithClient with the browser-
// authenticated Supabase session; RLS gates writes per the authenticated user.
import { writeSignalBatchWithClient, CanonicalWriteError, type CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type BriefingSignalType = 'view' | 'click' | 'expand' | 'navigate';

export interface BriefingSignal {
  signalType: BriefingSignalType;
  persona: 'admin' | 'manager' | 'rep';
  section: string;       // e.g., 'hero', 'leaderboard', 'component_stack'
  entityId?: string;     // The entity being viewed
  periodId?: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  calculationRunId?: string;  // OB-197 G11: NULL outside a calculation run
}

// ──────────────────────────────────────────────
// Signal Buffer
// ──────────────────────────────────────────────

const BUFFER_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000;

let signalBuffer: BriefingSignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushSignals(): Promise<void> {
  if (signalBuffer.length === 0) return;

  const batch = [...signalBuffer];
  signalBuffer = [];

  try {
    const supabase = createClient();
    const signals: CanonicalSignalInput[] = batch.map(s => ({
      tenantId: s.tenantId,
      signalType: 'lifecycle:briefing',
      entityId: s.entityId || null,
      signalValue: {
        action: s.signalType,
        persona: s.persona,
        section: s.section,
        period_id: s.periodId || null,
        ...s.metadata,
      },
      context: {
        persona: s.persona,
        section: s.section,
        ...s.metadata,
      },
      calculationRunId: s.calculationRunId ?? null,
      // Note: created_at column not exposed in CanonicalSignalInput; Postgres
      // default (now()) applies. Pre-OB-199 passed s.timestamp; this is a minor
      // semantic change (server-time vs client-time) acceptable for telemetry.
    }));

    await writeSignalBatchWithClient(signals, supabase);
  } catch (err) {
    // OB-199 Phase 4 + AUD-001 F-003 closure: structured error surfacing.
    // lifecycle:briefing is confidence_required:false; failures are still
    // surfaced for observability rather than swallowed silently.
    if (err instanceof CanonicalWriteError) {
      console.warn(`[BriefingSignals] CanonicalWriteError (${err.cause}): ${err.message}`);
    } else {
      console.warn('[BriefingSignals] flush error:', err instanceof Error ? err.message : String(err));
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushSignals();
  }, FLUSH_INTERVAL_MS);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function captureBriefingSignal(signal: Omit<BriefingSignal, 'timestamp'>): void {
  signalBuffer.push({
    ...signal,
    timestamp: new Date().toISOString(),
  });

  if (signalBuffer.length >= BUFFER_SIZE) {
    flushSignals();
  } else {
    scheduleFlush();
  }
}

/**
 * Flush any pending signals immediately (call on unmount).
 */
export function flushPendingSignals(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushSignals();
}
