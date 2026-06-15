/**
 * Intelligence Stream Signal Capture — OB-165 Phase 5
 *
 * Lightweight signal capture for stream interactions.
 * Reuses the buffered async write pattern from OB-163 briefing-signals.
 * Signals are batched and sent asynchronously.
 *
 * Signal type (OB-197): 'lifecycle:stream' (distinct from 'lifecycle:briefing')
 */

import { createClient } from '@/lib/supabase/client';
// OB-199 Phase 4: bypass writer removed per DS-023 §5.1 coverage-trust.
import { writeSignalBatchWithClient, CanonicalWriteError, type CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface StreamSignal {
  persona: 'admin' | 'manager' | 'rep';
  elementId: string;    // 'system_health' | 'coaching_priority' | 'results:anomaly_summary' | etc.
  // OB-209: 'collapse'/'drill' extend the existing action set (still one canonical writeSignal path,
  // HF-219 open-vocabulary signalValue.action) — for the Decide-surface capture-and-react loop.
  action: 'view' | 'click' | 'expand' | 'collapse' | 'drill' | 'act';
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

let signalBuffer: StreamSignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Dedup: one write per session per element per action type
const emittedKeys = new Set<string>();

async function flushSignals(): Promise<void> {
  if (signalBuffer.length === 0) return;

  const batch = [...signalBuffer];
  signalBuffer = [];

  try {
    const supabase = createClient();
    const signals: CanonicalSignalInput[] = batch.map(s => ({
      tenantId: s.tenantId,
      signalType: 'lifecycle:stream',
      signalValue: {
        persona: s.persona,
        element_id: s.elementId,
        action: s.action,
        ...s.metadata,
      },
      context: {
        persona: s.persona,
        element_id: s.elementId,
        action: s.action,
      },
      calculationRunId: s.calculationRunId ?? null,
      // created_at column omitted; Postgres default (now()) applies.
    }));

    await writeSignalBatchWithClient(signals, supabase);
  } catch (err) {
    // OB-199 Phase 4 + AUD-001 F-003 closure: structured error surfacing.
    if (err instanceof CanonicalWriteError) {
      console.warn(`[StreamSignals] CanonicalWriteError (${err.cause}): ${err.message}`);
    } else {
      console.warn('[StreamSignals] flush error:', err instanceof Error ? err.message : String(err));
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

export function captureStreamSignal(signal: Omit<StreamSignal, 'timestamp'>): void {
  // Dedup: one signal per element per action per session
  const key = `${signal.elementId}:${signal.action}`;
  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);

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
export function flushPendingStreamSignals(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushSignals();
}
