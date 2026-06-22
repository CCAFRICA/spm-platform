'use client';

// OB-230 Objective 2B — User Detail View. Fetches deep state and composes the five diagnostic panels
// in the HF-331 triage order: Identity → Session Health → Event Timeline → Admin Actions → Journey.

import React, { useCallback, useEffect, useState } from 'react';
import type { UserDetailResponse } from '@/lib/observability/api-types';
import { C, Panel, Spinner } from './ui';
import { EventTimeline } from './EventTimeline';
import { IdentityCard, SessionHealthPanel, AdminActionsPanel, JourneyActivityPanel } from './UserDetailPanels';

export function UserDetailView({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forceLogoutBusy, setForceLogoutBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${profileId}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed (${res.status})`); }
      setDetail(await res.json() as UserDetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const forceLogout = useCallback(async () => {
    setForceLogoutBusy(true);
    try {
      await fetch(`/api/admin/users/${profileId}/force-logout`, { method: 'POST' });
      await load();
    } finally {
      setForceLogoutBusy(false);
    }
  }, [profileId, load]);

  const banned = !!detail?.auth?.bannedUntil && Date.parse(detail.auth.bannedUntil) > Date.now();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        onClick={onBack}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.ink2, fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}
      >
        ← Back to users
      </button>

      {loading && !detail ? <Spinner label="Loading user…" /> : error ? (
        <Panel style={{ borderColor: C.red, color: C.red }}>{error}</Panel>
      ) : detail ? (
        <>
          {detail.indexWarning && (
            <div style={{ fontSize: 11, color: C.ink4, fontStyle: 'italic' }}>{detail.indexWarning}</div>
          )}
          <IdentityCard detail={detail} />
          <SessionHealthPanel detail={detail} busy={forceLogoutBusy} onForceLogout={forceLogout} />
          <EventTimeline events={detail.timeline} />
          <AdminActionsPanel profileId={profileId} banned={banned} onAfterAction={load} />
          <JourneyActivityPanel journey={detail.journey} audit={detail.audit} />
        </>
      ) : null}
    </div>
  );
}
