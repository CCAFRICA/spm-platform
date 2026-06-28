'use client';

/**
 * HF-352 — Tenant Management (Platform-Core, admin-only).
 *
 * The reachable home for per-tenant destructive operations + agent/feature toggles. Gated on the
 * platform.system_config capability (RequireCapability + middleware /admin gate + every API gates
 * via authorizePlatformObservability). One tenant at a time. Clean Slate (selective per-category wipe,
 * tenant preserved), Delete Tenant (complete removal), and the relocated PRISM toggle (one
 * authoritative home). All destruction is two-step + server-confirmed; nothing is single-click.
 */

import { useCallback, useEffect, useState } from 'react';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { PrismCapabilityToggle } from '@/components/platform/PrismCapabilityToggle';
import { DestructiveConfirmModal } from '@/components/platform/DestructiveConfirmModal';
import { Database, Trash2, Loader2, ShieldAlert } from 'lucide-react';

interface TenantRow { id: string; name: string; slug: string }
interface CategorySummary { key: string; label: string; tables: { table: string; count: number | null }[]; total: number }
interface DataSummary { tenantId: string; tenantName: string; categories: CategorySummary[] }

// entity ⇒ calc + plan (the only cross-category DELETE cascade — see tenant-deletion.ts CATEGORY_REQUIRES)
const REQUIRES: Record<string, string[]> = { entity: ['calc', 'plan'] };

function TenantManagementInner() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cleanOpen, setCleanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetch('/api/platform/tenants').then((r) => r.json()).then((d: { tenants?: TenantRow[] }) => setTenants(d.tenants ?? [])).catch(() => setTenants([]));
  }, []);

  const loadSummary = useCallback((id: string) => {
    if (!id) { setSummary(null); return; }
    setLoadingSummary(true); setPicked(new Set());
    fetch(`/api/platform/tenants/${id}/data-summary`)
      .then((r) => r.json()).then((d: DataSummary) => setSummary(d))
      .catch(() => setSummary(null)).finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => { loadSummary(selectedId); }, [selectedId, loadSummary]);

  const selectedTenant = tenants.find((t) => t.id === selectedId);

  // Cascade-aware selection: checking entity auto-includes calc+plan; unchecking calc/plan unchecks entity.
  const toggleCategory = (key: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) { next.add(key); for (const r of REQUIRES[key] ?? []) next.add(r); }
      else {
        next.delete(key);
        for (const [k, reqs] of Object.entries(REQUIRES)) if (reqs.includes(key)) next.delete(k);
      }
      return next;
    });
  };
  const selectAll = (on: boolean) => setPicked(on ? new Set((summary?.categories ?? []).map((c) => c.key)) : new Set());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform Core</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Tenant Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Clean-slate a tenant&apos;s data, delete a tenant, or toggle agents/features. The most destructive surface in the platform — every action is two-step confirmed and audited.</p>
      </header>

      {/* Tenant selector */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tenant</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500/60">
          <option value="">Select a tenant…</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
        </select>
      </div>

      {selectedTenant && (
        <>
          {/* Agent/Feature toggles (relocated OB-250 prism toggle — one authoritative home) */}
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
            <PrismCapabilityToggle tenantId={selectedTenant.id} />
          </div>

          {/* Clean Slate */}
          <div className="rounded-xl border border-amber-500/30 bg-zinc-800/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-semibold text-zinc-100">Clean Slate</h2>
              <span className="ml-auto text-[11px] text-zinc-500">tenant record preserved</span>
            </div>
            {loadingSummary ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading data summary…</div>
            ) : summary ? (
              <>
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                  <input type="checkbox" checked={picked.size === summary.categories.length && summary.categories.length > 0} onChange={(e) => selectAll(e.target.checked)} /> Select all
                </label>
                <div className="space-y-1.5">
                  {summary.categories.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 rounded-md bg-zinc-900/50 border border-zinc-700/40 px-3 py-2 text-sm">
                      <input type="checkbox" checked={picked.has(c.key)} onChange={(e) => toggleCategory(c.key, e.target.checked)} />
                      <span className="text-zinc-200">{c.label}</span>
                      {c.key === 'entity' && <span className="text-[10px] text-amber-300/80">includes Calculation + Plan (cascade)</span>}
                      <span className="ml-auto text-[11px] text-zinc-500">{c.total} rows</span>
                    </label>
                  ))}
                </div>
                <button
                  disabled={picked.size === 0}
                  onClick={() => setCleanOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600/80 px-3 py-1.5 text-sm text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  <Database className="h-3.5 w-3.5" /> Clean Slate ({picked.size})
                </button>
              </>
            ) : <p className="text-sm text-zinc-500">No data summary.</p>}
          </div>

          {/* Delete Tenant */}
          <div className="rounded-xl border border-red-500/40 bg-zinc-800/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Delete Tenant</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Removes the tenant record and ALL associated data across every table. Complete, irreversible removal.</p>
            <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500">
              <Trash2 className="h-3.5 w-3.5" /> Delete Tenant…
            </button>
          </div>

          {/* Modals */}
          <DestructiveConfirmModal
            open={cleanOpen} onClose={() => setCleanOpen(false)}
            tenantId={selectedTenant.id} tenantName={selectedTenant.name}
            action="clean-slate" title="Clean Slate" confirmVerb="Wipe selected data"
            warning={<span>Deletes the selected categories ({Array.from(picked).join(', ')}) for <b>{selectedTenant.name}</b>. The tenant record, users, and unselected categories are preserved.</span>}
            execute={async ({ confirmName, challenge }) => {
              const r = await fetch(`/api/platform/tenants/${selectedTenant.id}/clean-slate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories: Array.from(picked), confirmName, challenge }),
              });
              const d = await r.json();
              return r.ok ? { ok: true, summary: `${d.totalDeleted} rows deleted across ${Object.keys(picked).length} categories.` } : { ok: false, error: d.error || `HTTP ${r.status}` };
            }}
            onSuccess={() => loadSummary(selectedId)}
          />
          <DestructiveConfirmModal
            open={deleteOpen} onClose={() => setDeleteOpen(false)}
            tenantId={selectedTenant.id} tenantName={selectedTenant.name}
            action="delete-tenant" title="Delete Tenant" confirmVerb="Delete tenant permanently"
            warning={<span>Permanently removes <b>{selectedTenant.name}</b> and ALL of its data across every table. This cannot be undone.</span>}
            execute={async ({ confirmName, challenge }) => {
              const r = await fetch(`/api/platform/tenants/${selectedTenant.id}/delete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmName, challenge }),
              });
              const d = await r.json();
              return r.ok ? { ok: true, summary: `Tenant deleted (${d.totalDeleted} rows removed).` } : { ok: false, error: d.error || `HTTP ${r.status}` };
            }}
            onSuccess={() => { setTenants((prev) => prev.filter((t) => t.id !== selectedId)); setSelectedId(''); setSummary(null); }}
          />
        </>
      )}
    </div>
  );
}

export default function TenantManagementPage() {
  return (
    <RequireCapability capability="platform.system_config">
      <TenantManagementInner />
    </RequireCapability>
  );
}
