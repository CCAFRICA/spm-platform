// HF-352 — Tenant Management deletion engine (the safety-critical heart).
//
// THE invariant (I1, tenant-scope confinement): EVERY delete here is `.eq('tenant_id', tenantId)`
// (or `.eq('id', tenantId)` for the tenant row itself). There is NO code path that issues an
// unscoped delete or derives the target from anything but the single `tenantId` argument the
// platform-capability gate authorized. A clean-slate or delete can therefore never reach a second
// tenant's rows — structurally, not by convention.
//
// FK order (I3) is VERIFIED against the live FK graph (§5.2): dependents-first, no FK-violation.
// Two graph nuances are handled explicitly (see EDGE-1 and the Delete-Tenant list).
//
// Partial-failure (I8): every delete is wrapped; results are reported per table (deleted count OR
// error); a missing table (42P01) or missing tenant_id column is skipped, not fatal. Nothing is
// silently corrupted — the caller gets an exact ledger of what was and was not deleted.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CleanSlateCategoryKey = 'calc' | 'plan' | 'entity' | 'data' | 'intelligence';

export interface CleanSlateCategory {
  key: CleanSlateCategoryKey;
  label: string;
  /** Tables in this category, in within-category dependents-first order. */
  tables: string[];
}

// The 5 categories (directive §1), in CROSS-category dependents-first order
// (calc → plan → entity → data → intelligence). Every table carries tenant_id (§5.2 probe).
// HF-370 (O5): each category now covers ALL its tenant-scoped LEAF tables (previously ~15 of the 39
// tenant-scoped tables were cleared; the rest lingered across a Clean Slate). Added tables are
// tenant-scoped leaves placed in the SAME dependents-first order as DELETE_TENANT_TABLES (the
// production-tested full-removal order), so no new FK-block hazard is introduced. The FK-hazardous
// subset (the reference_data NO-ACTION chain, `periods` with its inbound period_id FKs) and the
// deliberately-preserved `import_batches` are dispositioned in TENANT_SCOPED_DISPOSITION below and, per
// SR-44 (destructive scope = architect sign-off), are NOT auto-added to this selectable wipe here.
// OB-257: summary_rollups (the domain-agnostic MSP rollup store, summary_artifacts family) is a
// tenant-scoped leaf of DERIVED data — cleared with the calc layer and re-materialized by the next
// import finalize / activation. Not FK-hazardous (all FKs outbound ON DELETE CASCADE, no inbound).
export const CLEAN_SLATE_CATEGORIES: readonly CleanSlateCategory[] = [
  { key: 'calc', label: 'Calculation layer', tables: ['calculation_traces', 'calculation_results', 'entity_period_outcomes', 'summary_artifacts', 'summary_rollups', 'calculation_batches'] },
  { key: 'plan', label: 'Plan / assignment layer', tables: ['rule_set_assignments', 'rule_set_lifecycle_events', 'plan_interpretation_runs', 'rule_sets'] },
  { key: 'entity', label: 'Entity layer', tables: ['entity_relationships', 'entities'] },
  // OB-251 (P-D2): the Data layer also clears in-flight async ingestion state — processing_jobs
  // (the DS-016 job ledger), import_session_telemetry and ingestion_events — so a Clean Slate leaves
  // no stale "in progress"/"N imports" residue. All three are tenant-scoped leaves (no inbound FK
  // from a category table), deleted .eq('tenant_id') (I1); committed_data stays FIRST for its EDGE-1
  // calc_traces sever. import_batches (the receipt log) is intentionally preserved — the cockpit now
  // reads live committed_data, so it self-heals without wiping history.
  // HF-362: pulse_load_jobs (the HF-360 hand-off load ledger) is cleared too — a non-terminal job left
  // behind would let the pg_cron worker REPOPULATE committed_data after the wipe. Tenant-scoped leaf (no
  // inbound category FK); the worker re-reads the now-deleted job by id and stops gracefully. committed_data
  // stays FIRST (EDGE-1); pulse_load_jobs is appended.
  { key: 'data', label: 'Data layer', tables: ['committed_data', 'processing_jobs', 'import_session_telemetry', 'ingestion_events', 'pulse_load_jobs', 'ingestion_configs', 'file_objects', 'import_finalize_runs', 'import_commit_runs'] },
  { key: 'intelligence', label: 'Intelligence layer', tables: ['classification_signals', 'structural_fingerprints', 'surface_bindings', 'synaptic_density', 'comprehension_artifacts', 'intelligence_artifacts', 'ai_call_metrics', 'agent_invocations'] },
] as const;

// HF-370 (O5): the AUTHORITATIVE disposition of EVERY tenant-scoped table (a table carrying a
// tenant_id column). The drift guard (hf370-clean-slate-coverage.test.ts) reconciles this against the
// live migration schema and FAILS if any tenant-scoped table is undispositioned — so the delete set
// "cannot drift" (directive §5). Foundational / cross-tenant stores (no tenant_id: foundational_patterns,
// domain_patterns, promoted_patterns, platform_settings, tenants) appear in NONE of these sets and are
// NEVER touched.
//   • CLEARED here  = the tenant's data/import/calc/plan/intelligence footprint (the CLEAN_SLATE_CATEGORIES
//     above + the entity-cascade collateral reassignment_events / period_entity_state).
//   • KEEP          = tenant IDENTITY / ACCESS / BILLING / AUDIT that must survive a data reset (a Clean
//     Slate keeps the tenant usable). Never wiped by Clean Slate; removed only by Delete Tenant.
//   • ARCHITECT_REVIEW = tenant-scoped but FK-hazardous (reference_data NO-ACTION chain; `periods` inbound
//     period_id FKs) or a deliberate preservation (`import_batches` — the cockpit reads live committed_data)
//     or workflow state whose wipe is a destructive-scope judgment. These are cleared by Delete Tenant
//     (DELETE_TENANT_TABLES) and are flagged for architect sign-off before joining the selectable Clean Slate.
export const CLEAN_SLATE_KEEP: readonly string[] = ['profiles', 'profile_scope', 'usage_metering', 'audit_logs'];
export const CLEAN_SLATE_CASCADE_CLEARED: readonly string[] = ['reassignment_events', 'period_entity_state'];
export const CLEAN_SLATE_ARCHITECT_REVIEW: readonly string[] = [
  'reference_data', 'reference_items', 'alias_registry', // NO-ACTION FK chain (delete alias→items→data)
  'periods',                                              // inbound period_id FKs from calc/data/entity
  'import_batches',                                       // deliberately preserved (cockpit reads live committed_data)
  'reconciliation_sessions', 'approval_requests', 'disputes', 'agent_inbox', 'user_journey', // workflow/user state
];

// B1 (cross-category CASCADE): deleting `entities` fires ON DELETE CASCADE into other tables that the
// TS code did not .delete() — Postgres cascades cannot be stopped by the application. The full entity
// cascade-closure (live FK graph, §5.2) is:
//   • CASCADE-delete into CATEGORY tables: calculation_results / entity_period_outcomes / summary_artifacts
//     (Calc) + rule_set_assignments (Plan) → handled by CATEGORY_REQUIRES (entity ⇒ calc + plan), so the
//     order deletes those FIRST and the entity cascade lands on already-empty category tables.
//   • CASCADE-delete into NON-category tables: reassignment_events, period_entity_state (both
//     entity_id NOT NULL CASCADE — they CANNOT be preserved once the entity is gone). These are
//     unavoidable; they are pre-counted and surfaced as collateralEffects so the I8 ledger is truthful.
//   • SET NULL on PRESERVED rows: committed_data.entity_id, classification_signals.entity_id — rows kept,
//     entity_id nulled when those categories are not also selected; reported as collateralEffects.
// So a clean-slate of the Entity layer is never a silent partial: every cascaded delete / set-null is
// reported even though Postgres, not this code, performs it.
export const CATEGORY_REQUIRES: Partial<Record<CleanSlateCategoryKey, CleanSlateCategoryKey[]>> = {
  entity: ['calc', 'plan'],
};

// Tables a category's DELETE cascades into OUTSIDE the selectable categories (FK-forced, unavoidable),
// + the preserved-row columns it SET-NULLs. Reported (never silent) — I8.
const ENTITY_COLLATERAL_CASCADE = ['reassignment_events', 'period_entity_state']; // entity_id NOT NULL CASCADE
const ENTITY_COLLATERAL_SETNULL: { table: string; ifCategoryAbsent: CleanSlateCategoryKey }[] = [
  { table: 'committed_data', ifCategoryAbsent: 'data' },          // committed_data.entity_id SET NULL
  { table: 'classification_signals', ifCategoryAbsent: 'intelligence' }, // classification_signals.entity_id SET NULL
];

export interface CollateralEffect {
  table: string;
  effect: 'cascade_delete' | 'set_null';
  column?: string;
  rows: number; // pre-count of rows the entity delete will cascade-delete / set-null for this tenant
}

export interface TableDeleteResult {
  table: string;
  // HF-359 (Part C): rows present BEFORE the delete (tenant-scoped count), so the audit answers
  // "present-before → deleted" per table. null when the pre-count could not be read.
  rowsBefore: number | null;
  deleted: number | null; // rows deleted, or null when skipped/errored
  status: 'deleted' | 'skipped_missing' | 'skipped_no_tenant_id' | 'error';
  error?: string;
}

const SKIP_CODES_MISSING = ['42P01']; // undefined_table

function classifyError(err: { code?: string; message?: string }): TableDeleteResult['status'] {
  if (err.code && SKIP_CODES_MISSING.includes(err.code)) return 'skipped_missing';
  if ((err.message || '').includes('does not exist') && (err.message || '').includes('relation')) return 'skipped_missing';
  if ((err.message || '').includes('tenant_id')) return 'skipped_no_tenant_id';
  return 'error';
}

/** ALWAYS tenant-scoped delete of one table (I1). Returns a per-table result; never throws.
 *  HF-359 (Part C): captures rowsBefore (a tenant-scoped pre-count) so the audit records what was cleared. */
export async function deleteTenantScoped(sb: SupabaseClient, table: string, tenantId: string): Promise<TableDeleteResult> {
  // Rows present BEFORE the delete (tenant-scoped, head-only count). Best-effort: a read failure → null
  // rowsBefore (the delete still runs + reports its own count).
  let rowsBefore: number | null = null;
  try {
    const { count: before, error: beforeErr } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (!beforeErr) rowsBefore = before ?? 0;
  } catch { /* leave rowsBefore null */ }
  try {
    const { count, error } = await sb.from(table).delete({ count: 'exact' }).eq('tenant_id', tenantId);
    if (error) {
      const status = classifyError(error);
      return { table, rowsBefore, deleted: null, status, error: status === 'error' ? error.message : undefined };
    }
    return { table, rowsBefore, deleted: count ?? 0, status: 'deleted' };
  } catch (e) {
    return { table, rowsBefore, deleted: null, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Validate a clean-slate category selection against the cascade-dependency rule (B1). Returns the
 *  missing required companions, empty if the selection is safe. */
export function validateCleanSlateSelection(selected: CleanSlateCategoryKey[]): { ok: boolean; missing: Record<string, CleanSlateCategoryKey[]> } {
  const set = new Set(selected);
  const missing: Record<string, CleanSlateCategoryKey[]> = {};
  for (const key of selected) {
    const reqs = CATEGORY_REQUIRES[key] ?? [];
    const absent = reqs.filter((r) => !set.has(r));
    if (absent.length) missing[key] = absent;
  }
  return { ok: Object.keys(missing).length === 0, missing };
}

export interface CleanSlateResult {
  results: TableDeleteResult[];
  unlinkedCalcTraces: number; // EDGE-1: calc_traces.committed_data_id null-outs (preserved-but-unlinked)
  collateralEffects: CollateralEffect[]; // FK-forced cascade-deletes / set-nulls the entity wipe causes (I8 truthful ledger)
  totalDeleted: number;
  hadError: boolean;
  // HF-358 (Part C, verify-before-success): after the deletes, every table in the SELECTED categories is
  // re-counted for the tenant. `verified` is true ONLY if all are 0; `residual` names any table that still
  // holds rows (e.g. a silent skip, an FK block, or a partial delete). The caller MUST NOT report success
  // unless `verified` is true — DIAG-078 #4 was a Clean Slate that reported success while committed_data
  // stayed populated. `committed_data` is in the `data` category, so it is re-counted when `data` is wiped.
  verified: boolean;
  residual: { table: string; count: number }[];
}

// HF-358 (Part C-4): re-count every table in the selected categories for this tenant. Tenant-scoped reads
// only (I1). A missing table (42P01) counts as empty. Used to gate "success" on an ACTUALLY-empty result.
export async function verifyCleanSlate(sb: SupabaseClient, tenantId: string, selected: CleanSlateCategoryKey[]): Promise<{ verified: boolean; residual: { table: string; count: number }[] }> {
  const selectedSet = new Set(selected);
  const tables = CLEAN_SLATE_CATEGORIES.filter((c) => selectedSet.has(c.key)).flatMap((c) => c.tables);
  const residual: { table: string; count: number }[] = [];
  for (const table of tables) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (error) {
      // A missing table is "empty"; any OTHER read error means we could not confirm empty → treat as residual.
      if (error.code === '42P01') continue;
      residual.push({ table, count: -1 }); // -1 = could not verify (read failed) — fail closed
      continue;
    }
    if ((count ?? 0) > 0) residual.push({ table, count: count ?? 0 });
  }
  return { verified: residual.length === 0, residual };
}

/** Pre-count the FK-forced collateral the entity-layer delete will cause (cascade-deletes into
 *  non-category tables + set-nulls on preserved categories). Computed BEFORE the entities delete so
 *  the counts reflect what Postgres is about to do. Tenant-scoped. */
async function computeEntityCollateral(sb: SupabaseClient, tenantId: string, selectedSet: Set<CleanSlateCategoryKey>): Promise<CollateralEffect[]> {
  const out: CollateralEffect[] = [];
  for (const table of ENTITY_COLLATERAL_CASCADE) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if ((count ?? 0) > 0) out.push({ table, effect: 'cascade_delete', rows: count ?? 0 });
  }
  for (const { table, ifCategoryAbsent } of ENTITY_COLLATERAL_SETNULL) {
    if (selectedSet.has(ifCategoryAbsent)) continue; // that category is being wiped anyway → no collateral
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('entity_id', 'is', null);
    if ((count ?? 0) > 0) out.push({ table, effect: 'set_null', column: 'entity_id', rows: count ?? 0 });
  }
  return out;
}

/**
 * Clean Slate: wipe the SELECTED categories for exactly `tenantId`, dependents-first, preserving the
 * tenant record + profiles + every unselected category (I4). Caller must have validated the selection
 * (validateCleanSlateSelection) — this re-checks defensively.
 *
 * EDGE-1 (§5.2): calculation_traces.committed_data_id → committed_data ON DELETE NO ACTION. If the Data
 * layer is wiped without the Calc layer, leftover calc_traces would BLOCK the committed_data delete. The
 * column is nullable (ob217), so we NULL those references (tenant-scoped) immediately before deleting
 * committed_data — preserving the calc_traces rows (they are an unselected category) while clearing the
 * FK block. Reported as `unlinkedCalcTraces`.
 */
export async function runCleanSlate(sb: SupabaseClient, tenantId: string, selected: CleanSlateCategoryKey[]): Promise<CleanSlateResult> {
  const selectedSet = new Set(selected);
  const results: TableDeleteResult[] = [];
  let unlinkedCalcTraces = 0;

  // I8: pre-count the FK-forced collateral the entity delete will cause (cascade-deletes into
  // non-category tables + set-nulls on preserved categories) so the ledger is truthful.
  const collateralEffects = selectedSet.has('entity') ? await computeEntityCollateral(sb, tenantId, selectedSet) : [];

  for (const category of CLEAN_SLATE_CATEGORIES) {
    if (!selectedSet.has(category.key)) continue;

    // EDGE-1: before the committed_data delete, sever any calc_traces → committed_data references for
    // THIS tenant (no-op if Calc was selected — its traces are already gone).
    if (category.key === 'data') {
      try {
        const { count } = await sb.from('calculation_traces')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .not('committed_data_id', 'is', null);
        unlinkedCalcTraces = count ?? 0;
        if (unlinkedCalcTraces > 0) {
          await sb.from('calculation_traces')
            .update({ committed_data_id: null })
            .eq('tenant_id', tenantId)
            .not('committed_data_id', 'is', null);
        }
      } catch { /* best-effort; the committed_data delete below will surface any residual block */ }
    }

    for (const table of category.tables) {
      results.push(await deleteTenantScoped(sb, table, tenantId));
    }
  }

  const totalDeleted = results.reduce((n, r) => n + (r.deleted ?? 0), 0);
  const hadError = results.some((r) => r.status === 'error');

  // HF-358 (Part C-4) — VERIFY BEFORE SUCCESS. Re-count every selected table; success is only legitimate
  // if the tenant is actually empty of them. A delete that silently returned 0 / was skipped / was
  // FK-blocked leaves residual rows that this catches — the caller fails (never silently succeeds).
  const { verified, residual } = await verifyCleanSlate(sb, tenantId, selected);
  return { results, unlinkedCalcTraces, collateralEffects, totalDeleted, hadError, verified, residual };
}

// ── DELETE TENANT (complete removal) ──────────────────────────────────────────────────────────
//
// `DELETE FROM tenants` does NOT cascade cleanly (§5.2 EDGE 2): reference_data/reference_items/
// alias_registry FK tenants with NO ACTION (BLOCK), several tables have tenant_id but NO FK (orphan),
// and some tables are live-only (manual DDL). So we delete every tenant-scoped table EXPLICITLY,
// dependents-first, then the tenant row — the production-tested remove-ghost-tenants.ts pattern, made
// exhaustive from the §5.2 enumeration. Deleting reference_data first cascades reference_items +
// alias_registry (clearing the only hard blockers). Missing/no-tenant_id tables are skipped (I8).
// audit_logs is NEVER in this engine's clean-slate categories; for Delete Tenant the whole tenant is
// being removed, so its audit_logs go too (the deletion's OWN audit is written to platform_events).
export const DELETE_TENANT_TABLES: readonly string[] = [
  // hard blockers first (NO ACTION FK to tenants) — deleting reference_data cascades its chain
  'alias_registry', 'reference_items', 'reference_data',
  // calculation layer
  'calculation_traces', 'calculation_results', 'calculation_batches',
  // intelligence / signals / AI
  'classification_signals', 'structural_fingerprints', 'intelligence_artifacts', 'comprehension_artifacts',
  'surface_bindings', 'synaptic_density', 'ai_call_metrics', 'agent_invocations', 'import_session_telemetry',
  // outcomes / per-period
  'entity_period_outcomes', 'period_entity_state',
  // plan / assignment
  'rule_set_assignments', 'rule_set_lifecycle_events', 'rule_sets', 'plan_interpretation_runs',
  // data / ingestion
  'pulse_load_jobs', 'committed_data', 'import_batches', 'ingestion_events', 'ingestion_configs', 'processing_jobs', 'file_objects',
  // reconciliation / approvals / disputes / lifecycle
  'reconciliation_sessions', 'approval_requests', 'disputes', 'reassignment_events',
  // entities
  'entity_relationships', 'entities',
  // periods
  'periods',
  // platform/usage + live-only (skip-if-missing)
  'usage_metering', 'profile_scope', 'summary_artifacts', 'summary_rollups', 'agent_inbox', 'user_journey',
  // people (deleted last among dependents — Delete Tenant removes profiles too)
  'profiles',
] as const;

export interface DeleteTenantResult {
  results: TableDeleteResult[];
  tenantDeleted: boolean;
  blockingRelation?: string; // set if the final DELETE tenants was blocked (23503)
  error?: string;
  totalDeleted: number;
}

/**
 * Delete Tenant: remove all associated data across all tables for exactly `tenantId`, then the tenant
 * row. Dependents-first (I3); per-table reporting + skip-if-missing (I8); the final DELETE is
 * 23503-guarded — on a block it reports the blocking relation and leaves a recoverable state (the
 * tenant row preserved), never a half-deleted-untracked mess. On success the tenant row is verified absent.
 */
export async function runDeleteTenant(sb: SupabaseClient, tenantId: string): Promise<DeleteTenantResult> {
  const results: TableDeleteResult[] = [];
  for (const table of DELETE_TENANT_TABLES) {
    results.push(await deleteTenantScoped(sb, table, tenantId));
  }

  // Finally, the tenant row itself (scoped by primary key — I1).
  let tenantDeleted = false;
  let blockingRelation: string | undefined;
  let error: string | undefined;
  try {
    const { error: delErr } = await sb.from('tenants').delete().eq('id', tenantId);
    if (delErr) {
      error = delErr.message;
      if (delErr.code === '23503') {
        // a residual FK still references the tenant — report which relation, leave recoverable.
        const m = /table "([^"]+)"/.exec(delErr.message);
        blockingRelation = m?.[1];
      }
    } else {
      // verify absent before claiming success (I8)
      const { data: still } = await sb.from('tenants').select('id').eq('id', tenantId).maybeSingle();
      tenantDeleted = !still;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const totalDeleted = results.reduce((n, r) => n + (r.deleted ?? 0), 0);
  return { results, tenantDeleted, blockingRelation, error, totalDeleted };
}
