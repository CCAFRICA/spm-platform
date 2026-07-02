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
  // HF-373 Phase D (D9): the created_at of the proposal's NEWEST import_batch, when known.
  // A 'done' claim whose completion PRECEDES the newest batch belongs to a PREMATURE pass
  // (the plan-arm finalize that ran before the data commit) — the current caller takes over
  // so the import's actual rows get their finalize (generation takeover). Pre-HF-373 the
  // first (pre-data) pass won and the real pass was suppressed forever (VLTEST2 94b838b8:
  // claim done 00:59:41.738 vs data batches 00:59:42+; Casa 5851bd78: done 01:16:50 vs
  // batches 01:20:58+, job stuck 'committed/finalizing').
  latestBatchMs: number | null = null,
): FinalizeClaimDecision {
  if (insertErrorCode === undefined) return { granted: true, reason: 'claimed (first caller)' };
  if (insertErrorCode === '42P01') return { granted: true, reason: 'claim table absent (migration pending) — proceeding on idempotency' };
  if (insertErrorCode === '23505') {
    if (!prior) return { granted: true, reason: 'claim row vanished — proceeding' };
    const claimedMs = prior.claimed_at ? new Date(prior.claimed_at).getTime() : 0;
    const ageMs = Number.isFinite(claimedMs) && claimedMs > 0 ? nowMs - claimedMs : Infinity;
    if (prior.status === 'failed') return { granted: true, reason: 'prior claim failed — retrying' };
    if (prior.status === 'done') {
      if (latestBatchMs != null && Number.isFinite(claimedMs) && claimedMs > 0 && latestBatchMs > claimedMs) {
        return { granted: true, reason: `generation takeover — import batches landed after the prior finalize completed (newest batch ${new Date(latestBatchMs).toISOString()} > claim ${prior.claimed_at}); re-finalizing for the actual rows` };
      }
      return { granted: false, reason: 'coalesced — this import was already finalized' };
    }
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

// The newest import_batch created_at for this proposal (HF-373 Phase D generation input).
// Batches carry the proposal in metadata.proposalId (the same key execute-bulk's reconcile
// queries). Best-effort: null on any error → the done-coalesce behaves as pre-HF-373.
interface BatchQueryClient {
  from(table: string): {
    select(cols: string): {
      eq(c: string, v: string): {
        eq(c: string, v: string): {
          order(c: string, o: { ascending: boolean }): {
            limit(n: number): PL<{ data: Array<{ created_at: string | null }> | null }>;
          };
        };
      };
    };
  };
}
async function latestBatchCreatedMs(sb: ClaimClient, tenantId: string, proposalId: string): Promise<number | null> {
  try {
    const { data } = await (sb as unknown as BatchQueryClient)
      .from('import_batches')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('metadata->>proposalId', proposalId)
      .order('created_at', { ascending: false })
      .limit(1);
    const iso = data?.[0]?.created_at;
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

// Acquire the finalize claim. Returns whether THIS caller should run the finalize.
export async function claimFinalize(sb: ClaimClient, tenantId: string, proposalId: string | null | undefined, nowMs = Date.now()): Promise<FinalizeClaimDecision> {
  const key = finalizeClaimKey(proposalId);
  try {
    const { error } = await claimTable(sb).insert({ tenant_id: tenantId, proposal_id: key, status: 'running', claimed_at: new Date(nowMs).toISOString() });
    if (!error) return decideFinalizeClaim(undefined, null, nowMs);
    let prior: { status?: string | null; claimed_at?: string | null } | null = null;
    let latestBatchMs: number | null = null;
    if (error.code === '23505') {
      const { data } = await claimTable(sb).select('status, claimed_at').eq('tenant_id', tenantId).eq('proposal_id', key).maybeSingle();
      prior = data;
      // HF-373 Phase D (D9): a 'done' claim only coalesces when no batch landed after it.
      if (prior?.status === 'done' && key !== '__tenant__') {
        latestBatchMs = await latestBatchCreatedMs(sb, tenantId, key);
      }
    }
    const decision = decideFinalizeClaim(error.code, prior, nowMs, latestBatchMs);
    // On a stale/failed/generation take-over, re-stamp the claim as running (best-effort).
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
