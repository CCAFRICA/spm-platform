'use client';

// OB-233 EP-1 — client hook: capture a UI interaction to the canonical signal surface (fire-and-forget).
// signalType is FREE-FORM (open-vocabulary, AP-26): any interaction characterization, never a fixed set.
import { useCallback } from 'react';

export function useUiSignal(surface: string) {
  return useCallback(
    (signalType: string, ctx: { entityId?: string | null; metricKey?: string | null } = {}) => {
      try {
        void fetch('/api/signals/ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signalType, surface, entityId: ctx.entityId ?? null, metricKey: ctx.metricKey ?? null }),
        }).catch(() => {});
      } catch { /* never block the UI */ }
    },
    [surface],
  );
}
