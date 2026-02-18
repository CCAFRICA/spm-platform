'use client';

/**
 * useUserJourney — Hook for tracking user milestone completions
 *
 * Fetches completed milestones from /api/platform/journey.
 * Provides completeMilestone() to mark milestones as done.
 */

import { useState, useEffect, useCallback } from 'react';

export function useUserJourney(userId: string | undefined, tenantId: string | undefined) {
  const [completedMilestones, setCompletedMilestones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!userId || !tenantId) {
      setCompletedMilestones([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/platform/journey?userId=${userId}&tenantId=${tenantId}`,
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCompletedMilestones((data.milestones || []).map((m: { milestone: string }) => m.milestone));
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [userId, tenantId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const completeMilestone = useCallback(async (milestone: string) => {
    if (!userId || !tenantId) return;

    // Optimistic update
    setCompletedMilestones(prev => {
      if (prev.includes(milestone)) return prev;
      return [...prev, milestone];
    });

    try {
      await fetch('/api/platform/journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tenantId, milestone }),
      });
    } catch (err) {
      console.error('Failed to complete milestone:', err);
    }
  }, [userId, tenantId]);

  const hasCompleted = useCallback(
    (milestone: string) => completedMilestones.includes(milestone),
    [completedMilestones],
  );

  return { completedMilestones, loading, completeMilestone, hasCompleted };
}
