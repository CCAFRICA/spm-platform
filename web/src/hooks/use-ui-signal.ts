'use client';

// OB-232 EP-1 — client hook: capture a UI interaction to the canonical signal surface (fire-and-forget).
import { useCallback } from 'react';
import type { UiSignalType } from '@/lib/signals/ui-signal';

export function useUiSignal(surface: string) {
  return useCallback(
    (signalType: UiSignalType, ctx: { entityId?: string | null; metricKey?: string | null } = {}) => {
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
