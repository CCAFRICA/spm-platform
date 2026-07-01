// HF-371 (Root 1) — deterministic single finalize. The post-commit finalize (entity resolution,
// linking, assignments) is dispatched by up to THREE triggers for one import: the client, the
// execute-bulk server-side waitUntil, and the finalize-sweep cron. On the SYNCHRONOUS path the client
// AND the execute-bulk fire run CONCURRENTLY with no coalescing — two passes disagree (one reports
// entities_created=0 while the other creates the entities), and because entity creation was a plain
// INSERT, the loser conflicts on the unique (tenant_id, external_id) and links fewer rows (the observed
// 425↔0 swing). This module coalesces to EXACTLY ONE effective pass per (tenant, proposal): the first
// caller atomically claims `import_finalize_runs` (unique PK); concurrent callers get a duplicate-key and
// COALESCE (no-op). A stale claim (a crashed pass) or a failed claim is retryable. It degrades gracefully
// if the claim table is absent (migration pending) — proceeding on the function-level idempotency, which
// the upsert entity creation now makes race-safe. Korean Test: pure structural keys, no language strings.

export const FINALIZE_CLAIM_TABLE = 'import_finalize_runs';
// A claim older than this is presumed crashed (finalize maxDuration is 300s) → a new caller may take over.
export const STALE_CLAIM_MS = 15 * 60_000;

export interface FinalizeClaimDecision {
  granted: boolean;
  reason: string;
}

// The claim key coalesces the concurrent DOUBLE-FIRE for ONE import (same proposalId). A finalize with no
// proposalId falls back to the tenant (a whole-tenant reconcile). Never a language-specific string.
export function finalizeClaimKey(proposalId: string | null | undefined): string {
  const p = (proposalId ?? '').trim();
  return p.length > 0 ? p : '__tenant__';
}

// PURE decision core (unit-tested): given the outcome of the atomic INSERT claim, decide whether THIS
// caller runs the finalize or coalesces. `insertErrorCode`: undefined = insert succeeded (I claimed);
// '23505' = duplicate (someone holds it); '42P01' = table missing (migration pending). `prior` is the
// existing claim row when duplicate. `nowMs` is the current time.
export function decideFinalizeClaim(
  insertErrorCode: string | undefined,
  prior: { status?: string | null; claimed_at?: string | null } | null,
  nowMs: number,
): FinalizeClaimDecision {
  if (insertErrorCode === undefined) return { granted: true, reason: 'claimed (first caller)' };
  if (insertErrorCode === '42P01') return { granted: true, reason: 'claim table absent (migration pending) — proceeding on idempotency' };
  if (insertErrorCode === '23505') {
    if (!prior) return { granted: true, reason: 'claim row vanished — proceeding' };
    const claimedMs = prior.claimed_at ? new Date(prior.claimed_at).getTime() : 0;
    const ageMs = Number.isFinite(claimedMs) && claimedMs > 0 ? nowMs - claimedMs : Infinity;
    if (prior.status === 'failed') return { granted: true, reason: 'prior claim failed — retrying' };
    if (prior.status === 'done') return { granted: false, reason: 'coalesced — this import was already finalized' };
    if (ageMs > STALE_CLAIM_MS) return { granted: true, reason: `prior claim stale (${Math.round(ageMs / 1000)}s) — taking over` };
    return { granted: false, reason: 'coalesced — another finalize pass is in flight for this import' };
  }
  // any other insert error → don't block the import; proceed on idempotency
  return { granted: true, reason: `claim insert error ${insertErrorCode} — proceeding on idempotency` };
}

// The claim ledger is not in the generated schema types; access it through a minimal PromiseLike surface
// (the runtime client is a service-role createClient with no Database generic).
type PL<T> = { then(onf: (v: T) => unknown): unknown };
interface ClaimTable {
  insert(row: Record<string, unknown>): PL<{ error: { code?: string } | null }>;
  select(cols: string): { eq(c: string, v: string): { eq(c: string, v: string): { maybeSingle(): PL<{ data: { status?: string | null; claimed_at?: string | null } | null }> } } };
  update(row: Record<string, unknown>): { eq(c: string, v: string): { eq(c: string, v: string): PL<unknown> } };
}
type ClaimClient = { from(table: string): unknown };
const claimTable = (sb: ClaimClient): ClaimTable => sb.from(FINALIZE_CLAIM_TABLE) as ClaimTable;

// Acquire the finalize claim. Returns whether THIS caller should run the finalize.
export async function claimFinalize(sb: ClaimClient, tenantId: string, proposalId: string | null | undefined, nowMs = Date.now()): Promise<FinalizeClaimDecision> {
  const key = finalizeClaimKey(proposalId);
  try {
    const { error } = await claimTable(sb).insert({ tenant_id: tenantId, proposal_id: key, status: 'running', claimed_at: new Date(nowMs).toISOString() });
    if (!error) return decideFinalizeClaim(undefined, null, nowMs);
    let prior: { status?: string | null; claimed_at?: string | null } | null = null;
    if (error.code === '23505') {
      const { data } = await claimTable(sb).select('status, claimed_at').eq('tenant_id', tenantId).eq('proposal_id', key).maybeSingle();
      prior = data;
    }
    const decision = decideFinalizeClaim(error.code, prior, nowMs);
    // On a stale/failed take-over, re-stamp the claim as running (best-effort).
    if (decision.granted && error.code === '23505') {
      try { await claimTable(sb).update({ status: 'running', claimed_at: new Date(nowMs).toISOString() }).eq('tenant_id', tenantId).eq('proposal_id', key); } catch { /* best-effort */ }
    }
    return decision;
  } catch {
    return { granted: true, reason: 'claim threw — proceeding on idempotency' };
  }
}

// Mark the claim done/failed after the finalize runs (so a failed pass is retryable, a done pass coalesces).
export async function completeFinalize(sb: ClaimClient, tenantId: string, proposalId: string | null | undefined, ok: boolean): Promise<void> {
  const key = finalizeClaimKey(proposalId);
  try { await claimTable(sb).update({ status: ok ? 'done' : 'failed', claimed_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('proposal_id', key); } catch { /* best-effort; table may be absent */ }
}
