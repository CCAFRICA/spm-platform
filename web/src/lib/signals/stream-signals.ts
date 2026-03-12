/**
 * Intelligence Stream Signal Capture — OB-165 Phase 5
 *
 * Lightweight signal capture for stream interactions.
 * Reuses the buffered async write pattern from OB-163 briefing-signals.
 * Signals are batched and sent asynchronously.
 *
 * Signal type: 'stream_interaction' (distinct from 'briefing_interaction')
 */

import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface StreamSignal {
  persona: 'admin' | 'manager' | 'rep';
  elementId: string;    // 'system_health' | 'coaching_priority' | 'allocation' | etc.
  action: 'view' | 'click' | 'expand' | 'act';
  tenantId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
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
    const rows = batch.map(s => ({
      tenant_id: s.tenantId,
      signal_type: 'stream_interaction',
      signal_value: {
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
