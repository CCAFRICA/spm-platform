/**
 * Briefing Signal Capture — OB-163 Phase 9
 *
 * Lightweight signal capture for briefing interactions.
 * Captures view, click, expand, and navigate events.
 * Signals are batched and sent asynchronously.
 */

import { createClient } from '@/lib/supabase/client';

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
    const rows = batch.map(s => ({
      tenant_id: s.tenantId,
      signal_type: 'lifecycle:briefing',
      entity_id: s.entityId || null,
      signal_value: {
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
      calculation_run_id: s.calculationRunId ?? null,
      created_at: s.timestamp,
    }));

    await supabase.from('classification_signals').insert(rows);
  } catch {
    // Non-critical — signals are fire-and-forget
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
