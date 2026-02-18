/**
 * useGPV — Guided Proof of Value state hook
 *
 * Tracks and advances tenant GPV progress through the activation wizard.
 * Returns current step (1-4), loading state, and advanceStep function.
 */

import { useState, useEffect, useCallback } from 'react';

export interface GPVState {
  plan_uploaded: boolean;
  plan_confirmed: boolean;
  data_uploaded: boolean;
  data_confirmed: boolean;
  first_calculation: boolean;
  completed_at: string | null;
}

const DEFAULT_GPV: GPVState = {
  plan_uploaded: false,
  plan_confirmed: false,
  data_uploaded: false,
  data_confirmed: false,
  first_calculation: false,
  completed_at: null,
};

export function useGPV(tenantId: string | undefined) {
  const [gpv, setGPV] = useState<GPVState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    fetch(`/api/gpv?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        setGPV(data.gpv || DEFAULT_GPV);
        setLoading(false);
      })
      .catch(() => {
        setGPV(DEFAULT_GPV);
        setLoading(false);
      });
  }, [tenantId]);

  const advanceStep = useCallback(async (step: string) => {
    if (!tenantId) return;
    const res = await fetch('/api/gpv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, step }),
    });
    const data = await res.json();
    if (data.gpv) setGPV(data.gpv);
    return data;
  }, [tenantId]);

  const isComplete = gpv?.completed_at !== null && gpv?.completed_at !== undefined;

  // Step progression: 1=upload plan, 2=upload data, 3=see results, 4=complete
  const currentStep = !gpv ? 0
    : !gpv.plan_confirmed ? 1
    : !gpv.data_confirmed ? 2
    : !gpv.first_calculation ? 3
    : 4;

  return { gpv, loading, advanceStep, isComplete, currentStep };
}
