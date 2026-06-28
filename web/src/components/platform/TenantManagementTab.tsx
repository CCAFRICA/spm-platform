'use client';

/**
 * OB-252 — Tenant Admin (Observatory-confined tenant-management surface).
 *
 * ONE surface, three sections, opened from the Observatory fleet card "Manage tenant" (or the
 * Tenant Admin tab directly). Platform-admin only (the Observatory host is isVLAdmin-gated and every
 * API gates on authorizePlatformObservability → platform.system_config; PG-12).
 *
 *   Section A — Tenant Identity   : name / country / industry / currency / locale / logo (+ read-only
 *               slug & id). Save persists to `tenants` columns + `settings` JSONB; audited (I4).
 *   Section B — Agent Entitlement : toggles DERIVED structurally from the workspaces that declare a
 *               featureFlag (getToggleableAgents — no hardcoded list). Each toggle writes
 *               `tenants.features` (single source of truth, I3). Platform Core is shown locked
 *               (always-on, cannot toggle — PG-7). Reads from tenants.features.
 *   Section C — Tenant Admin Users: this tenant's users (from `profiles` — shared SSOT with the
 *               cross-tenant Users tab, PG-15) + create-user (single-door createUser; honest failure).
 *   Danger Zone — Clean Slate + Delete Tenant (the HF-352 destructive ops, consolidated here).
 *
 * Every section has explicit Save/Cancel; the surface always offers "Back to Observatory" (I5).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Save, X, Loader2, ChevronLeft, UserPlus, Users as UsersIcon,
  Database, Trash2, ShieldAlert, CheckCircle2, AlertCircle, Lock, RefreshCw,
} from 'lucide-react';
import { getToggleableAgents } from '@/lib/navigation/workspace-config';
import { isFeatureEnabled } from '@/lib/tenant/feature-flags';
import { DestructiveConfirmModal } from './DestructiveConfirmModal';

interface Props {
  tenantId: string | null;
  onSelectTenant: (id: string | null) => void;
  onExit: () => void;
}

interface TenantRow { id: string; name: string; slug: string }
interface TenantIdentity {
  id: string; name: string; slug: string; locale: string; currency: string;
  country: string; industry: string; logo: string;
}
interface TenantUser { id: string; auth_user_id: string; display_name: string; email: string; role: string; created_at: string }

const CURRENCY_OPTIONS = ['USD', 'MXN', 'PEN', 'EUR', 'GBP', 'CAD'];
const LOCALE_OPTIONS = ['en', 'es', 'en-US', 'es-MX', 'es-PE', 'en-GB', 'fr-FR'];
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin (tenant administrator)' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

const CARD = 'rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-5';
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-zinc-400';
const INPUT = 'mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60 disabled:opacity-50';

function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export function TenantManagementTab({ tenantId, onSelectTenant, onExit }: Props) {
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    fetch('/api/platform/tenants')
      .then((r) => r.json())
      .then((d: { tenants?: TenantRow[] }) => setTenants(d.tenants ?? []))
      .catch(() => setTenants([]));
  }, []);

  if (!tenantId) {
    return (
      <div className="max-w-3xl">
        <Header onExit={onExit} title="Tenant Admin" subtitle="Select a tenant to manage its identity, agent entitlement, and admin users." />
        <div className={CARD}>
          <label className={LABEL}>Tenant</label>
          <select
            value=""
            onChange={(e) => onSelectTenant(e.target.value || null)}
            className={INPUT}
          >
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <TenantManagementDetail
      key={tenantId}
      tenantId={tenantId}
      onSwitchTenant={onSelectTenant}
      onExit={onExit}
      onDeleted={(deletedId) => { setTenants((p) => p.filter((t) => t.id !== deletedId)); onSelectTenant(null); }}
    />
  );
}

function Header({ onExit, title, subtitle, onBack }: { onExit: () => void; title: string; subtitle: string; onBack?: () => void }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'rgba(123,127,212,0.15)', border: '1px solid rgba(123,127,212,0.4)' }}>
          <Building2 className="h-5 w-5" style={{ color: '#C7D2FE' }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            <ChevronLeft className="h-4 w-4" /> Tenants
          </button>
        )}
        <button onClick={onExit} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
          Back to Observatory
        </button>
      </div>
    </div>
  );
}

function Banner({ kind, children, onClose }: { kind: 'ok' | 'err'; children: React.ReactNode; onClose?: () => void }) {
  const ok = kind === 'ok';
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
      style={{
        borderColor: ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
        background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        color: ok ? '#86efac' : '#fca5a5',
      }}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>}
    </div>
  );
}

function TenantManagementDetail({
  tenantId, onSwitchTenant, onExit, onDeleted,
}: {
  tenantId: string;
  onSwitchTenant: (id: string | null) => void;
  onExit: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<TenantIdentity | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/platform/tenants/${tenantId}`)
      .then((r) => r.json())
      .then((d: { identity?: TenantIdentity; features?: Record<string, boolean>; error?: string }) => {
        if (d.identity) setIdentity(d.identity);
        setFeatures(d.features ?? {});
      })
      .catch(() => setIdentity(null))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="max-w-3xl">
        <Header onExit={onExit} title="Tenant Admin" subtitle="Loading…" onBack={() => onSwitchTenant(null)} />
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading tenant…</div>
      </div>
    );
  }
  if (!identity) {
    return (
      <div className="max-w-3xl">
        <Header onExit={onExit} title="Tenant Admin" subtitle="Could not load this tenant." onBack={() => onSwitchTenant(null)} />
        <Banner kind="err">Tenant not found or failed to load. <button onClick={reload} className="underline">Retry</button></Banner>
      </div>
    );
  }

  const tenantName = identity.name;

  return (
    <div className="max-w-3xl space-y-6">
      <Header
        onExit={onExit}
        title={tenantName || 'Tenant Admin'}
        subtitle={`Manage identity, agent entitlement, and admin users · ${identity.slug}`}
        onBack={() => onSwitchTenant(null)}
      />

      <IdentitySection tenantId={tenantId} identity={identity} onSaved={(next) => setIdentity(next)} />

      <EntitlementSection tenantId={tenantId} features={features} onChange={setFeatures} />

      <UsersSection tenantId={tenantId} />

      <DangerZone
        tenantId={tenantId}
        tenantName={tenantName}
        onDeleted={() => onDeleted(tenantId)}
      />
    </div>
  );
}

/* ─────────────────────────── Section A — Identity ─────────────────────────── */

function IdentitySection({ tenantId, identity, onSaved }: { tenantId: string; identity: TenantIdentity; onSaved: (i: TenantIdentity) => void }) {
  const [form, setForm] = useState<TenantIdentity>(identity);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => { setForm(identity); }, [identity]);

  const dirty = (['name', 'country', 'industry', 'currency', 'locale', 'logo'] as (keyof TenantIdentity)[])
    .some((k) => form[k] !== identity[k]);

  const set = (k: keyof TenantIdentity, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setResult(null);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, country: form.country, industry: form.industry,
          currency: form.currency, locale: form.locale, logo: form.logo,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setResult({ kind: 'err', msg: d.error || `HTTP ${r.status}` }); return; }
      onSaved(d.identity as TenantIdentity);
      const changed: string[] = d.changed ?? [];
      setResult({ kind: 'ok', msg: changed.length ? `Saved: ${changed.join(', ')}.` : 'No changes to save.' });
    } catch (e) {
      setResult({ kind: 'err', msg: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={CARD}>
      <h2 className="mb-4 text-sm font-semibold text-zinc-100">Tenant Identity</h2>
      {result && <Banner kind={result.kind} onClose={() => setResult(null)}>{result.msg}</Banner>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL}>Name</label>
          <input className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Tenant name" />
        </div>
        <div>
          <label className={LABEL}>Country</label>
          <input className={INPUT} value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="e.g. MX" />
        </div>
        <div>
          <label className={LABEL}>Industry</label>
          <input className={INPUT} value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. Retail" />
        </div>
        <div>
          <label className={LABEL}>Currency</label>
          <select className={INPUT} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {withCurrent(CURRENCY_OPTIONS, form.currency).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Locale</label>
          <select className={INPUT} value={form.locale} onChange={(e) => set('locale', e.target.value)}>
            {withCurrent(LOCALE_OPTIONS, form.locale).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Logo URL</label>
          <input className={INPUT} value={form.logo} onChange={(e) => set('logo', e.target.value)} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Slug (read-only)</label>
            <input className={INPUT} value={form.slug} disabled />
          </div>
          <div>
            <label className={LABEL}>Tenant ID (read-only)</label>
            <input className={`${INPUT} font-mono text-xs`} value={form.id} disabled />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save identity
        </button>
        <button
          onClick={() => { setForm(identity); setResult(null); }}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </section>
  );
}

/* ───────────────────────── Section B — Agent Entitlement ───────────────────────── */

function EntitlementSection({ tenantId, features, onChange }: { tenantId: string; features: Record<string, boolean>; onChange: (f: Record<string, boolean>) => void }) {
  const agents = getToggleableAgents();
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const toggle = async (featureKey: string, label: string, next: boolean) => {
    setPending(featureKey); setResult(null);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}/entitlement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey, enabled: next }),
      });
      const d = await r.json();
      if (!r.ok) { setResult({ kind: 'err', msg: d.error || `HTTP ${r.status}` }); return; }
      onChange(d.features as Record<string, boolean>);
      setResult({ kind: 'ok', msg: `${label} ${next ? 'enabled' : 'disabled'}. The tenant's users see this on their next load.` });
    } catch (e) {
      setResult({ kind: 'err', msg: e instanceof Error ? e.message : 'Toggle failed' });
    } finally {
      setPending(null);
    }
  };

  return (
    <section className={CARD}>
      <h2 className="mb-1 text-sm font-semibold text-zinc-100">Agent Entitlement</h2>
      <p className="mb-4 text-xs text-zinc-400">Each agent the tenant is entitled to appears in its users&apos; navigation and capability set. Stored in <code className="text-zinc-300">tenants.features</code> — the single source of truth.</p>
      {result && <Banner kind={result.kind} onClose={() => setResult(null)}>{result.msg}</Banner>}

      <div className="space-y-2">
        {/* Platform Core — always on (PG-7). Locked, never toggleable. */}
        <div className="flex items-center justify-between rounded-md border border-zinc-700/40 bg-zinc-900/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-200">Platform Core</span>
            <span className="text-[11px] text-zinc-500">foundation — always on</span>
          </div>
          <span className="text-xs font-medium text-zinc-500">Always on</span>
        </div>

        {agents.map((agent) => {
          const on = isFeatureEnabled(features, agent.featureKey);
          const busy = pending === agent.featureKey;
          return (
            <div key={agent.featureKey} className="flex items-center justify-between rounded-md border border-zinc-700/40 bg-zinc-900/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-200">{agent.label}</span>
                <span className="text-[11px] text-zinc-500">{agent.featureKey}{agent.entitledByDefault ? ' · default on' : ' · licensable'}</span>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`${on ? 'Disable' : 'Enable'} ${agent.label}`}
                disabled={busy}
                onClick={() => toggle(agent.featureKey, agent.label, !on)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
                style={{ background: on ? '#4f46e5' : '#3f3f46' }}
              >
                {busy
                  ? <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                  : <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(22px)' : 'translateX(4px)' }} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────── Section C — Tenant Admin Users ─────────────────────── */

function UsersSection({ tenantId }: { tenantId: string }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/platform/tenants/${tenantId}/users`)
      .then((r) => r.json())
      .then((d: { users?: TenantUser[] }) => setUsers(d.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Tenant Admin Users</h2>
          <span className="text-[11px] text-zinc-500">{users.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowCreate((s) => !s)} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
            <UserPlus className="h-4 w-4" /> Create user
          </button>
        </div>
      </div>

      {showCreate && <CreateUserForm tenantId={tenantId} onCreated={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading users…</div>
      ) : users.length === 0 ? (
        <p className="text-sm text-zinc-500">No users yet for this tenant.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-700/40">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-zinc-200">{u.display_name}</td>
                  <td className="px-3 py-2 text-zinc-400">{u.email}</td>
                  <td className="px-3 py-2"><span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CreateUserForm({ tenantId, onCreated, onCancel }: { tenantId: string; onCreated: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('admin');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const submit = async () => {
    setSubmitting(true); setResult(null);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, role }),
      });
      const d = await r.json();
      if (!r.ok) { setResult({ kind: 'err', msg: d.error || `HTTP ${r.status}` }); return; }
      const delivery = d.delivery as string | null;
      const note = delivery === 'dry_run'
        ? ' Invite email was a dry-run (no mailer configured) — the account exists; resend from the Users tab.'
        : delivery === 'sent' ? ' An invite email was sent.' : '';
      setResult({ kind: 'ok', msg: `Created ${d.user?.email} as ${d.user?.role}.${note}` });
      setEmail(''); setDisplayName(''); setRole('admin');
      // Keep the success visible briefly, then refresh the list.
      setTimeout(onCreated, 900);
    } catch (e) {
      setResult({ kind: 'err', msg: e instanceof Error ? e.message : 'Create failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const valid = email.includes('@') && displayName.trim().length > 0;

  return (
    <div className="mb-4 rounded-md border border-indigo-500/30 bg-zinc-900/50 p-4">
      {result && <Banner kind={result.kind} onClose={() => setResult(null)}>{result.msg}</Banner>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL}>Email</label>
          <input className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" type="email" />
        </div>
        <div>
          <label className={LABEL}>Display name</label>
          <input className={INPUT} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <label className={LABEL}>Role</label>
          <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={submit} disabled={!valid || submitting} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create
        </button>
        <button onClick={onCancel} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Danger Zone ─────────────────────────── */

interface CategorySummary { key: string; label: string; total: number }
interface DataSummary { tenantId: string; tenantName: string; categories: CategorySummary[] }
const REQUIRES: Record<string, string[]> = { entity: ['calc', 'plan'] };

function DangerZone({ tenantId, tenantName, onDeleted }: { tenantId: string; tenantName: string; onDeleted: () => void }) {
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cleanOpen, setCleanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadSummary = useCallback(() => {
    setLoadingSummary(true); setPicked(new Set());
    fetch(`/api/platform/tenants/${tenantId}/data-summary`)
      .then((r) => r.json()).then((d: DataSummary) => setSummary(d))
      .catch(() => setSummary(null)).finally(() => setLoadingSummary(false));
  }, [tenantId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const toggleCategory = (key: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) { next.add(key); for (const r of REQUIRES[key] ?? []) next.add(r); }
      else { next.delete(key); for (const [k, reqs] of Object.entries(REQUIRES)) if (reqs.includes(key)) next.delete(k); }
      return next;
    });
  };
  const selectAll = (on: boolean) => setPicked(on ? new Set((summary?.categories ?? []).map((c) => c.key)) : new Set());

  return (
    <section className="rounded-xl border border-red-500/30 bg-zinc-800/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Danger Zone</h2>
        <span className="ml-auto text-[11px] text-zinc-500">two-step confirmed &amp; audited</span>
      </div>

      {/* Clean Slate */}
      <div className="mb-4 rounded-lg border border-amber-500/30 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Database className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-zinc-100">Clean Slate</h3>
          <span className="ml-auto text-[11px] text-zinc-500">tenant record preserved</span>
        </div>
        {loadingSummary ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading data summary…</div>
        ) : summary ? (
          <>
            <label className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={picked.size === summary.categories.length && summary.categories.length > 0} onChange={(e) => selectAll(e.target.checked)} /> Select all
            </label>
            <div className="space-y-1.5">
              {summary.categories.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded-md border border-zinc-700/40 bg-zinc-900/50 px-3 py-2 text-sm">
                  <input type="checkbox" checked={picked.has(c.key)} onChange={(e) => toggleCategory(c.key, e.target.checked)} />
                  <span className="text-zinc-200">{c.label}</span>
                  {c.key === 'entity' && <span className="text-[10px] text-amber-300/80">includes Calculation + Plan (cascade)</span>}
                  <span className="ml-auto text-[11px] text-zinc-500">{c.total} rows</span>
                </label>
              ))}
            </div>
            <button disabled={picked.size === 0} onClick={() => setCleanOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600/80 px-3 py-1.5 text-sm text-white hover:bg-amber-600 disabled:opacity-40">
              <Database className="h-3.5 w-3.5" /> Clean Slate ({picked.size})
            </button>
          </>
        ) : <p className="text-sm text-zinc-500">No data summary.</p>}
      </div>

      {/* Delete Tenant */}
      <div className="rounded-lg border border-red-500/40 bg-zinc-900/40 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Delete Tenant</h3>
        </div>
        <p className="mb-3 text-xs text-zinc-400">Removes the tenant record and ALL associated data across every table. Complete, irreversible removal.</p>
        <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500">
          <Trash2 className="h-3.5 w-3.5" /> Delete Tenant…
        </button>
      </div>

      <DestructiveConfirmModal
        open={cleanOpen} onClose={() => setCleanOpen(false)}
        tenantId={tenantId} tenantName={tenantName}
        action="clean-slate" title="Clean Slate" confirmVerb="Wipe selected data"
        warning={<span>Deletes the selected categories ({Array.from(picked).join(', ')}) for <b>{tenantName}</b>. The tenant record, users, and unselected categories are preserved.</span>}
        execute={async ({ confirmName, challenge }) => {
          const r = await fetch(`/api/platform/tenants/${tenantId}/clean-slate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories: Array.from(picked), confirmName, challenge }),
          });
          const d = await r.json();
          return r.ok ? { ok: true, summary: `${d.totalDeleted} rows deleted.` } : { ok: false, error: d.error || `HTTP ${r.status}` };
        }}
        onSuccess={loadSummary}
      />
      <DestructiveConfirmModal
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        tenantId={tenantId} tenantName={tenantName}
        action="delete-tenant" title="Delete Tenant" confirmVerb="Delete tenant permanently"
        warning={<span>Permanently removes <b>{tenantName}</b> and ALL of its data across every table. This cannot be undone.</span>}
        execute={async ({ confirmName, challenge }) => {
          const r = await fetch(`/api/platform/tenants/${tenantId}/delete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmName, challenge }),
          });
          const d = await r.json();
          return r.ok ? { ok: true, summary: `Tenant deleted (${d.totalDeleted} rows removed).` } : { ok: false, error: d.error || `HTTP ${r.status}` };
        }}
        onSuccess={onDeleted}
      />
    </section>
  );
}
