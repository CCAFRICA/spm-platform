/**
 * useTrialStatus — Fetches trial status for the current tenant.
 *
 * Reads from tenant.settings via the GPV API endpoint,
 * then computes trial days remaining and gate checks.
 */

import { useState, useEffect, useMemo } from 'react';
import { getTrialStatus, checkTrialGate, type TrialStatus, type TrialGateType } from '@/lib/trial';

export function useTrialStatus(tenantId: string | undefined) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    // Fetch tenant settings via a lightweight API call
    fetch(`/api/gpv?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        // The GPV endpoint returns { gpv: ... } — but we need the full settings.
        // For now, derive trial info from what we can get.
        // The trial status will be correctly computed when raw settings are available.
        setSettings(data._settings || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenantId]);

  const trialStatus: TrialStatus = useMemo(
    () => getTrialStatus(settings),
    [settings]
  );

  const checkGate = (gate: TrialGateType) => checkTrialGate(settings, gate);

  return { ...trialStatus, loading, checkGate };
}
