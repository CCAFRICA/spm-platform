'use client';

// OB-230 Objective 2B — Panels 1, 2, 4, 5 of the User Detail diagnostic deep-dive.
// (Panel 3, the Event Timeline, lives in EventTimeline.tsx.)

import React, { useState } from 'react';
import type {
  AdminActionResponse, AuditEntryDTO, InferredSessionDTO, JourneyMilestoneDTO, MfaFactorDTO, UserDetailResponse,
} from '@/lib/observability/api-types';
import { HEALTH_COLOR, HEALTH_LABEL } from '@/lib/observability/auth-health';
import { humanizeEventType } from '@/lib/observability/event-classification';
import { parseUserAgent } from '@/lib/observability/ua-parser';
import { C, ConfirmAction, Dot, Panel, Pill, absTime, hexToRgba, relativeTime } from './ui';

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4 }}>{label}</span>
      <span style={{ fontSize: 13, color: color ?? C.ink0, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function PanelTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: C.ink0, fontSize: 15, fontWeight: 600 }}>{children}</div>
      {note && <div style={{ color: C.ink4, fontSize: 11, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Panel 1: Identity Card ──────────────────────────────────────────────
export function IdentityCard({ detail }: { detail: UserDetailResponse }) {
  const { profile, auth, mfaFactors, health } = detail;
  const banned = !!auth?.bannedUntil && Date.parse(auth.bannedUntil) > Date.now();
  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <PanelTitle>Identity</PanelTitle>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} title={health.reasons.join(' · ')}>
          <Dot color={HEALTH_COLOR[health.status]} />
          <span style={{ color: HEALTH_COLOR[health.status], fontSize: 12, fontWeight: 600 }}>{HEALTH_LABEL[health.status]}</span>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <KV label="Name" value={profile.displayName || '—'} />
        <KV label="Email" value={profile.email} />
        <KV label="Role" value={profile.role} />
        <KV label="Tenant" value={profile.tenantName ?? (profile.tenantId ? profile.tenantId.slice(0, 8) : 'Platform')} />
        <KV label="Profile created" value={profile.createdAt ? absTime(profile.createdAt) : '—'} />
        <KV label="Last sign-in" value={auth?.lastSignInAt ? `${absTime(auth.lastSignInAt)} (${relativeTime(auth.lastSignInAt)})` : 'Never'} />
        <KV label="Email confirmed" value={auth?.emailConfirmedAt ? absTime(auth.emailConfirmedAt) : 'Not confirmed'} color={auth?.emailConfirmedAt ? undefined : C.amber} />
        <KV label="Banned" value={banned ? `Until ${absTime(auth!.bannedUntil)}` : 'No'} color={banned ? C.red : undefined} />
        <KV label="Locale" value={profile.locale ?? '—'} />
      </div>
      {profile.capabilities.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4 }}>Capabilities</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {profile.capabilities.map((c) => <Pill key={c} color={C.indigo}>{c}</Pill>)}
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4 }}>MFA factors</span>
        {mfaFactors.length === 0 ? (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>No MFA enrolled</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {mfaFactors.map((f: MfaFactorDTO) => (
              <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.ink2 }}>
                <Pill color={f.status === 'verified' ? C.green : C.amber}>{f.status}</Pill>
                <span>{f.factorType}{f.friendlyName ? ` · ${f.friendlyName}` : ''}</span>
                <span style={{ color: C.ink4 }}>{f.createdAt ? `enrolled ${relativeTime(f.createdAt)}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── Panel 2: Session Health (HALT-1 inference) ──────────────────────────
export function SessionHealthPanel({
  detail, busy, onForceLogout,
}: { detail: UserDetailResponse; busy: boolean; onForceLogout: () => void | Promise<void> }) {
  const { inferredSessions, sessionHealthNote, mfaFactors } = detail;
  const hasMfa = mfaFactors.length > 0;
  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PanelTitle note={sessionHealthNote}>Session Health</PanelTitle>
        <ConfirmAction label="Force logout (all)" color={C.amber} busy={busy} onConfirm={onForceLogout} />
      </div>
      {inferredSessions.length === 0 ? (
        <div style={{ fontSize: 12, color: C.ink4 }}>No sessions inferred from events.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inferredSessions.slice(0, 12).map((s: InferredSessionDTO, i) => {
            const stuckMfa = hasMfa && !s.mfaStepUp; // MFA enrolled but no successful verify in this window — the "stuck at MFA" signal
            return (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.active ? C.green : C.border}` }}>
                <Dot color={s.active ? C.green : C.ink4} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: C.ink0, fontWeight: 600 }}>{s.active ? 'Active' : 'Ended'}</span>
                    <span style={{ fontSize: 12, color: C.ink2 }}>{s.ip ? parseUserAgent(s.userAgent).label : parseUserAgent(s.userAgent).label}</span>
                    {s.mfaStepUp && <Pill color={C.green}>MFA verified</Pill>}
                    {stuckMfa && <Pill color={C.red}>No MFA step-up</Pill>}
                  </div>
                  <div style={{ fontSize: 11, color: C.ink4, marginTop: 3 }}>
                    started {relativeTime(s.startedAt)} · last seen {relativeTime(s.lastSeenAt)} · {s.eventCount} event{s.eventCount === 1 ? '' : 's'}{s.ip ? ` · ${s.ip}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 4: Admin Actions ──────────────────────────────────────────────
const ACTIONS: { action: string; label: string; confirm: string; color: string; desc: string }[] = [
  { action: 'force-logout', label: 'Force Logout', confirm: 'Revoke all sessions', color: C.amber, desc: 'Revoke every active session; the user must sign in again.' },
  { action: 'reset-password', label: 'Reset Password', confirm: 'Generate recovery link', color: C.indigo, desc: 'Generate a recovery link to deliver to the user.' },
  { action: 'reset-mfa', label: 'Reset MFA', confirm: 'Remove all factors', color: C.red, desc: 'Remove all MFA factors; the user re-enrolls on next login.' },
  { action: 'resend-confirmation', label: 'Resend Confirmation', confirm: 'Generate confirm link', color: C.indigo, desc: 'Re-issue an email-confirmation (magic) link for an unconfirmed user.' },
];

export function AdminActionsPanel({
  profileId, banned, onAfterAction,
}: { profileId: string; banned: boolean; onAfterAction: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<AdminActionResponse | null>(null);

  const run = async (action: string) => {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/users/${profileId}/${action}`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as AdminActionResponse;
      setResult(body);
      onAfterAction();
    } catch (e) {
      setResult({ ok: false, action, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel>
      <PanelTitle note="Every action is audit-logged to platform_events (Decision 143 / SOC 2 CC6).">Admin Actions</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ACTIONS.map((a) => (
          <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.ink0, fontWeight: 600 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: C.ink4 }}>{a.desc}</div>
            </div>
            <ConfirmAction label={a.label} confirmLabel={a.confirm} color={a.color} size="md" busy={busy === a.action} onConfirm={() => run(a.action)} />
          </div>
        ))}
        {/* Ban / Unban — state-aware */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: C.ink0, fontWeight: 600 }}>{banned ? 'Unban User' : 'Ban User'}</div>
            <div style={{ fontSize: 11, color: C.ink4 }}>{banned ? 'Lift the ban so the user can sign in again.' : 'Block sign-in and invalidate sessions.'}</div>
          </div>
          <ConfirmAction
            label={banned ? 'Unban User' : 'Ban User'}
            confirmLabel={banned ? 'Lift ban' : 'Ban now'}
            color={banned ? C.green : C.red}
            size="md"
            busy={busy === (banned ? 'unban' : 'ban')}
            onConfirm={() => run(banned ? 'unban' : 'ban')}
          />
        </div>
      </div>

      {result && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, border: `1px solid ${result.ok ? hexToRgba(C.green, 0.4) : hexToRgba(C.red, 0.4)}`, background: result.ok ? hexToRgba(C.green, 0.08) : hexToRgba(C.red, 0.08) }}>
          <div style={{ fontSize: 12, color: result.ok ? C.green : C.red, fontWeight: 600 }}>{result.message}</div>
          {result.error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{result.error}</div>}
          {result.link && (
            <div style={{ marginTop: 8 }}>
              <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', fontSize: 11, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.deep, color: C.ink2, fontFamily: 'var(--font-dm-mono), monospace' }} />
              <div style={{ fontSize: 10, color: C.ink4, marginTop: 4 }}>Deliver this link to the user through a secure channel.</div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 5: Journey & Activity ─────────────────────────────────────────
export function JourneyActivityPanel({ journey, audit }: { journey: JourneyMilestoneDTO[]; audit: AuditEntryDTO[] }) {
  return (
    <Panel>
      <PanelTitle note="What the user has been doing in the platform (vs. the event timeline, which is what the platform did to them).">Journey & Activity</PanelTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4, marginBottom: 8 }}>Milestones</div>
          {journey.length === 0 ? <div style={{ fontSize: 12, color: C.ink4 }}>No milestones recorded.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {journey.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Dot color={C.green} />
                  <span style={{ fontSize: 12, color: C.ink0 }}>{humanizeEventType(m.milestone)}</span>
                  <span style={{ fontSize: 11, color: C.ink4 }}>{relativeTime(m.completedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4, marginBottom: 8 }}>Recent activity</div>
          {audit.length === 0 ? <div style={{ fontSize: 12, color: C.ink4 }}>No tenant activity recorded.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {audit.map((a) => (
                <div key={a.id} style={{ fontSize: 12, color: C.ink2 }}>
                  <span style={{ color: C.ink0, fontWeight: 600 }}>{a.action}</span>
                  <span style={{ color: C.ink4 }}> · {a.resourceType}{a.resourceId ? ` ${a.resourceId.slice(0, 8)}` : ''} · {relativeTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
