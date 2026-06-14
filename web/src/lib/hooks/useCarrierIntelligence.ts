'use client';

/**
 * OB-205 / DS-029 Phase 1 — useCarrierIntelligence.
 *
 * Fetches the CarrierIntelligence payload from /api/carrier-intelligence. Matches
 * the /stream data-fetching pattern (raw fetch + useState, not SWR/React Query).
 * Non-blocking: callers render carrier cards when `carrier` resolves; the rest of
 * the page does not wait on it.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CarrierIntelligence } from '@/lib/carrier/types';

export interface UseCarrierIntelligence {
  carrier: CarrierIntelligence | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCarrierIntelligence(tenantId: string | null | undefined): UseCarrierIntelligence {
  const [carrier, setCarrier] = useState<CarrierIntelligence | null>(null);
  const [loading, setLoading] = useState<boolean>(!!tenantId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) { setCarrier(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/carrier-intelligence?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || `carrier intelligence ${res.status}`);
      }
      setCarrier(await res.json() as CarrierIntelligence);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load carrier intelligence');
      setCarrier(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  return { carrier, loading, error, reload: load };
}
