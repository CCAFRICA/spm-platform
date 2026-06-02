// HF-259 (Q3 idempotency + Q6 lifecycle audit) — degrade-safe helpers.
//
// All functions are best-effort: if the backing tables (plan_interpretation_runs,
// rule_set_lifecycle_events; migration 20260531000000_hf259_idempotency_lifecycle.sql) are NOT yet applied, or any unexpected error
// occurs, they DEGRADE to current (pre-HF-259) behavior — never crash the import:
//   - findCompletedRuleSet → null (no reuse; proceed to derive)
//   - claimRun → { claimed: true } on table-missing/unknown (proceed to execute);
//                { claimed: false } ONLY on a genuine UNIQUE violation (real single-flight conflict)
//   - completeRun / failRun / writeRuleSetLifecycleEvent → no-op on error
// The single-flight correctness hinges on distinguishing Postgres unique-violation (23505)
// from a missing-table error — see claimRun.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Content fingerprint for plan dedup: SHA-256 of the plan file bytes (format-invariant). */
export function computePlanContentHash(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Q3 layer 1 (read-before-derive / moat reuse): return the rule_set_id of a COMPLETED run for
 * this (tenant, content_hash) whose rule_set is still live (not archived). null ⇒ re-derive.
 */
export async function findCompletedRuleSet(
  supabase: SupabaseClient, tenantId: string, contentHash: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('plan_interpretation_runs')
      .select('rule_set_id')
      .eq('tenant_id', tenantId)
      .eq('content_hash', contentHash)
      .eq('status', 'completed')
      .not('rule_set_id', 'is', null)
      .maybeSingle();
    if (error || !data?.rule_set_id) return null;
    const ruleSetId = data.rule_set_id as string;
    const { data: rs } = await supabase.from('rule_sets').select('id, status').eq('id', ruleSetId).maybeSingle();
    if (!rs || (rs as { status?: string }).status === 'archived') return null; // stale pointer → re-derive
    return ruleSetId;
  } catch {
    return null;
  }
}

/**
 * Q3 layer 2 (single-flight): try to claim the execution by inserting an in_progress run row.
 * The UNIQUE(tenant_id, content_hash) constraint makes a concurrent second claim fail with 23505.
 * Returns { claimed:false } ONLY for a real unique-violation; degrades to { claimed:true } (execute)
 * for a missing table or any other error so the import is never blocked pre-migration.
 */
// HF-264: a claim older than this is treated as abandoned (a prior execution crashed between
// claim and complete/fail, stranding the in_progress row — pre-HF-264 there was no TTL, so it
// blocked re-import forever). 5 min is ~10x the longest observed interpretation (~35s Meridian
// Phase A+B). Numeric duration only (Korean Test — no domain/language value).
const CLAIM_TTL_MS = 5 * 60 * 1000;

export async function claimRun(
  supabase: SupabaseClient, tenantId: string, contentHash: string, sourceFileName: string,
): Promise<{ claimed: boolean }> {
  try {
    const { error } = await supabase.from('plan_interpretation_runs').insert({
      tenant_id: tenantId,
      content_hash: contentHash,
      status: 'in_progress',
      source_file_name: sourceFileName,
    });
    if (!error) return { claimed: true };
    if ((error as { code?: string }).code === '23505') {
      // A row already exists for (tenant, content_hash). HF-264: reclaim it only if it is a
      // STALE in_progress claim; a completed/failed row or a fresh claim is respected.
      return await reclaimIfStale(supabase, tenantId, contentHash, sourceFileName);
    }
    return { claimed: true }; // table-missing / other → degrade to execute (current behavior)
  } catch {
    return { claimed: true };
  }
}

/**
 * HF-264 single-flight recovery. On a UNIQUE conflict, inspect the existing row. Only an
 * in_progress claim older than CLAIM_TTL_MS is reclaimable — it means the prior execution
 * crashed between claimRun and completeRun/failRun. The UNIQUE(tenant_id, content_hash)
 * constraint allows only one row, so the slot is reclaimed in place via UPDATE (guarded on
 * status='in_progress'). updated_at is the liveness timestamp (set on insert-default,
 * completeRun, and reclaim). Degrade-safe: any error → { claimed:false } (respect the row).
 */
async function reclaimIfStale(
  supabase: SupabaseClient, tenantId: string, contentHash: string, sourceFileName: string,
): Promise<{ claimed: boolean }> {
  try {
    const { data: existing } = await supabase
      .from('plan_interpretation_runs')
      .select('id, status, created_at, updated_at')
      .eq('tenant_id', tenantId).eq('content_hash', contentHash)
      .maybeSingle();
    if (!existing) return { claimed: true }; // row vanished (race) → execute
    if ((existing as { status?: string }).status !== 'in_progress') return { claimed: false }; // completed/failed
    const liveness = (existing as { updated_at?: string | null; created_at?: string | null }).updated_at
      ?? (existing as { created_at?: string | null }).created_at;
    const ageMs = liveness ? Date.now() - new Date(liveness).getTime() : 0;
    if (ageMs <= CLAIM_TTL_MS) return { claimed: false }; // recent — a real execution likely holds it
    const id = (existing as { id: string }).id;
    const { error: updErr } = await supabase
      .from('plan_interpretation_runs')
      .update({ status: 'in_progress', source_file_name: sourceFileName, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'in_progress'); // guard: still in_progress (lost-update safe)
    if (updErr) return { claimed: false };
    console.log(`[plan-idempotency] HF-264: reclaimed stale in_progress claim ${id} (age=${Math.round(ageMs / 60000)}min) for content_hash=${contentHash.substring(0, 12)}`);
    return { claimed: true };
  } catch {
    return { claimed: false };
  }
}

/** Mark the claimed run completed and bind its rule_set_id (the reuse pointer). */
export async function completeRun(
  supabase: SupabaseClient, tenantId: string, contentHash: string, ruleSetId: string,
): Promise<void> {
  try {
    await supabase.from('plan_interpretation_runs')
      .update({ status: 'completed', rule_set_id: ruleSetId, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('content_hash', contentHash);
  } catch { /* best-effort */ }
}

/** Release a failed claim (delete the in_progress row) so a legitimate retry can re-claim. */
export async function failRun(
  supabase: SupabaseClient, tenantId: string, contentHash: string,
): Promise<void> {
  try {
    await supabase.from('plan_interpretation_runs')
      .delete()
      .eq('tenant_id', tenantId).eq('content_hash', contentHash).eq('status', 'in_progress');
  } catch { /* best-effort */ }
}

export interface RuleSetLifecycleEvent {
  tenantId: string;
  ruleSetId: string;
  eventType: 'created' | 'superseded' | 'withdrawn';
  predecessorId?: string | null;
  actor?: string | null;
  reason?: string | null;
}

/** Q6: record a rule_set lifecycle transition (best-effort; the audit must never block save). */
export async function writeRuleSetLifecycleEvent(
  supabase: SupabaseClient, evt: RuleSetLifecycleEvent,
): Promise<void> {
  try {
    await supabase.from('rule_set_lifecycle_events').insert({
      tenant_id: evt.tenantId,
      rule_set_id: evt.ruleSetId,
      event_type: evt.eventType,
      predecessor_id: evt.predecessorId ?? null,
      actor: evt.actor ?? null,
      reason: evt.reason ?? null,
    });
  } catch { /* best-effort */ }
}
