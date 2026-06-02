# HF-264 — Single-Flight Claim Recovery — COMPLETION REPORT
## HEAD SHA: bc424ccc40c4fcb1a49c1590bf7521af0f35afa8
## PR: #449 (dev -> main)
## Date: 2026-06-02

Fixes plan-import blocking when a prior interpretation stranded an `in_progress` claim (HF-260 ADR residual R1; two prod incidents BCL 2026-06-01, Meridian 2026-06-02). User-Ready blocker.

## §P1 — Diagnostic
### P1.3 — live stale-claim query
```
Stale in_progress claims: 0
All rows by status: {"completed":4}
```
=> No stranded claim live at execution time (prior incidents already cleared). The fix is **preventive + recovering**: it stops future stranding (P3) and auto-recovers any future stale claim (P2). HALT-3 note: there was no stale claim for a UI re-import to expire.

### P1.1/P1.2 — claim lifecycle (live shapes, adapted from directive assumptions)
- `claimRun(supabase, tenantId, contentHash, sourceFileName) -> { claimed: boolean }` (INSERT-first; 23505 => conflict). **No `runId`** (HALT-1).
- `completeRun(..., ruleSetId)` UPDATE status='completed'; `failRun(...)` **DELETEs** the in_progress row. Keyed by (tenant, content_hash).
- `plan_interpretation_runs` columns: id, tenant_id, content_hash, status, rule_set_id, source_file_name, created_at, updated_at. **No `completed_at`/`error`** (HALT-2) — TTL uses `updated_at` liveness; expiry = reclaim-in-place.
- plan-interpretation.ts: claimRun@173; explicit failRun on 3 failure returns; completeRun@327; success return@367.

## §P2 — Phase 2: TTL reclaim in claimRun (07a4d253)
```diff
diff --git a/web/src/lib/sci/plan-idempotency.ts b/web/src/lib/sci/plan-idempotency.ts
index b14a5135..dc9cdb14 100644
--- a/web/src/lib/sci/plan-idempotency.ts
+++ b/web/src/lib/sci/plan-idempotency.ts
@@ -50,6 +50,12 @@ export async function findCompletedRuleSet(
  * Returns { claimed:false } ONLY for a real unique-violation; degrades to { claimed:true } (execute)
  * for a missing table or any other error so the import is never blocked pre-migration.
  */
+// HF-264: a claim older than this is treated as abandoned (a prior execution crashed between
+// claim and complete/fail, stranding the in_progress row — pre-HF-264 there was no TTL, so it
+// blocked re-import forever). 5 min is ~10x the longest observed interpretation (~35s Meridian
+// Phase A+B). Numeric duration only (Korean Test — no domain/language value).
+const CLAIM_TTL_MS = 5 * 60 * 1000;
+
 export async function claimRun(
   supabase: SupabaseClient, tenantId: string, contentHash: string, sourceFileName: string,
 ): Promise<{ claimed: boolean }> {
@@ -61,13 +67,53 @@ export async function claimRun(
       source_file_name: sourceFileName,
     });
     if (!error) return { claimed: true };
-    if ((error as { code?: string }).code === '23505') return { claimed: false }; // genuine single-flight conflict
+    if ((error as { code?: string }).code === '23505') {
+      // A row already exists for (tenant, content_hash). HF-264: reclaim it only if it is a
+      // STALE in_progress claim; a completed/failed row or a fresh claim is respected.
+      return await reclaimIfStale(supabase, tenantId, contentHash, sourceFileName);
+    }
     return { claimed: true }; // table-missing / other → degrade to execute (current behavior)
   } catch {
     return { claimed: true };
   }
 }
 
+/**
+ * HF-264 single-flight recovery. On a UNIQUE conflict, inspect the existing row. Only an
+ * in_progress claim older than CLAIM_TTL_MS is reclaimable — it means the prior execution
+ * crashed between claimRun and completeRun/failRun. The UNIQUE(tenant_id, content_hash)
+ * constraint allows only one row, so the slot is reclaimed in place via UPDATE (guarded on
+ * status='in_progress'). updated_at is the liveness timestamp (set on insert-default,
+ * completeRun, and reclaim). Degrade-safe: any error → { claimed:false } (respect the row).
+ */
+async function reclaimIfStale(
+  supabase: SupabaseClient, tenantId: string, contentHash: string, sourceFileName: string,
+): Promise<{ claimed: boolean }> {
+  try {
+    const { data: existing } = await supabase
+      .from('plan_interpretation_runs')
+      .select('id, status, created_at, updated_at')
+      .eq('tenant_id', tenantId).eq('content_hash', contentHash)
+      .maybeSingle();
+    if (!existing) return { claimed: true }; // row vanished (race) → execute
+    if ((existing as { status?: string }).status !== 'in_progress') return { claimed: false }; // completed/failed
+    const liveness = (existing as { updated_at?: string | null; created_at?: string | null }).updated_at
+      ?? (existing as { created_at?: string | null }).created_at;
+    const ageMs = liveness ? Date.now() - new Date(liveness).getTime() : 0;
+    if (ageMs <= CLAIM_TTL_MS) return { claimed: false }; // recent — a real execution likely holds it
+    const id = (existing as { id: string }).id;
+    const { error: updErr } = await supabase
+      .from('plan_interpretation_runs')
+      .update({ status: 'in_progress', source_file_name: sourceFileName, updated_at: new Date().toISOString() })
+      .eq('id', id).eq('status', 'in_progress'); // guard: still in_progress (lost-update safe)
+    if (updErr) return { claimed: false };
+    console.log(`[plan-idempotency] HF-264: reclaimed stale in_progress claim ${id} (age=${Math.round(ageMs / 60000)}min) for content_hash=${contentHash.substring(0, 12)}`);
+    return { claimed: true };
+  } catch {
+    return { claimed: false };
+  }
+}
+
 /** Mark the claimed run completed and bind its rule_set_id (the reuse pointer). */
 export async function completeRun(
   supabase: SupabaseClient, tenantId: string, contentHash: string, ruleSetId: string,
```

## §P3 — Phase 3: try/finally guard (5b2c06fd)
```diff
diff --git a/web/src/lib/sci/plan-interpretation.ts b/web/src/lib/sci/plan-interpretation.ts
index 05d451f8..05e1305f 100644
--- a/web/src/lib/sci/plan-interpretation.ts
+++ b/web/src/lib/sci/plan-interpretation.ts
@@ -183,6 +183,12 @@ export async function executeBatchedPlanInterpretation(
     }));
   }
 
+  // HF-264: try/finally backstop so the single-flight claim is ALWAYS released — including on an
+  // uncaught throw between claimRun and completeRun. Pre-HF-264 such a throw stranded an in_progress
+  // claim with no TTL, permanently blocking re-import of this plan (two prod incidents). The TTL in
+  // claimRun (HF-264 Phase 2) is the cross-process backstop; this finally is the in-process one.
+  let interpretationCompleted = false;
+  try {
   console.log(`[SCI plan-interp] Interpretation starting — ${documentContent.length} chars`);
 
   // HF-248 Phase 1+3: per-component two-phase interpretation. The orchestrator
@@ -325,6 +331,7 @@ export async function executeBatchedPlanInterpretation(
   // HF-259 Q3: bind the completed run to its rule_set (the reuse pointer) — a later import of the
   // same content now returns this without re-deriving. Q6: record the 'created' lifecycle event.
   await completeRun(supabase, tenantId, contentHash, ruleSetId);
+  interpretationCompleted = true; // HF-264: claim transitioned to 'completed'; finally must NOT release it
   await writeRuleSetLifecycleEvent(supabase, {
     tenantId,
     ruleSetId,
@@ -376,4 +383,17 @@ export async function executeBatchedPlanInterpretation(
     componentOutcomes: i === 0 ? orchestration.componentOutcomes : undefined,
     partialSuccess: i === 0 ? orchestration.partialSuccess : undefined,
   }));
+  } finally {
+    // HF-264: release the in_progress claim on every non-completed exit — the three explicit
+    // failure returns above AND any uncaught throw between claim and completeRun. failRun is an
+    // idempotent delete of the in_progress row, so it is safe even where a failure path already
+    // released it. Only the success path (interpretationCompleted=true) skips release, because
+    // completeRun has already transitioned the row to 'completed'.
+    if (!interpretationCompleted) {
+      try {
+        await failRun(supabase, tenantId, contentHash);
+        console.log(`[SCI plan-interp] HF-264: released in_progress claim on non-completed exit (content_hash=${contentHash.substring(0, 12)})`);
+      } catch { /* best-effort */ }
+    }
+  }
 }
```

## §P4 — Phase 4: improved single-flight block log (bc424ccc)
```diff
diff --git a/web/src/lib/sci/plan-interpretation.ts b/web/src/lib/sci/plan-interpretation.ts
index 05e1305f..1bd12e18 100644
--- a/web/src/lib/sci/plan-interpretation.ts
+++ b/web/src/lib/sci/plan-interpretation.ts
@@ -173,7 +173,12 @@ export async function executeBatchedPlanInterpretation(
   const claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
   if (!claim.claimed) {
     const concurrent = await findCompletedRuleSet(supabase, tenantId, contentHash);
-    console.log(`[SCI plan-interp] HF-259 SINGLE-FLIGHT — another execution holds the claim for this content_hash (${concurrent ? 'returning its rule_set' : 'in-progress'}); not double-executing`);
+    console.warn(
+      `[SCI plan-interp] HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress ` +
+      `claim for content_hash=${contentHash.substring(0, 12)} (${concurrent ? 'returning its rule_set' : 'no completed rule_set yet'}); ` +
+      `not double-executing. If this persists, the claim may be stale — HF-264 TTL auto-expires claims ` +
+      `older than 5 minutes on the next import attempt.`,
+    );
     return planUnits.map((u, i) => ({
       contentUnitId: u.contentUnitId,
       classification: 'plan' as const,
```

## §P5 — Verification
No UI re-import / no live stale claim (see P1.3), so the TTL+reclaim logic was verified directly against the **real `claimRun`** with a self-cleaning synthetic claim (clearly-fake tenant UUID `00000000-...-0000000f2640`, deleted after):
```
seeded stale in_progress claim (updated_at=2026-06-02T04:25:14.204Z)   # 10 min old
[plan-idempotency] HF-264: reclaimed stale in_progress claim 0127bf6b-... (age=10min)
[STALE > TTL]  claimRun -> {"claimed":true}   row.status=in_progress updated_at_refreshed=true   PASS
[FRESH <= TTL] claimRun -> {"claimed":false}                                                     PASS
[COMPLETED]    claimRun -> {"claimed":false}                                                     PASS
cleaned up test rows
```
- **STALE > TTL** -> reclaimed (a crashed prior execution's slot is recovered).
- **FRESH <= TTL** -> respected (a genuine concurrent execution is not double-run).
- **COMPLETED** -> respected (never reclaim a finished run).
The Phase-3 try/finally is build-verified + code-reviewed (a throw mid-interpretation always hits the finally => failRun).

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
npm run dev -> Ready in 1130ms; curl localhost:3000 -> HTTP 307 (auth redirect, normal)
```

## HALT Disposition Log
- HALT-1: RESOLVED — claimRun returns { claimed } (no runId); finally guard uses failRun(supabase, tenantId, contentHash).
- HALT-2: RESOLVED — no completed_at/error columns; created_at/updated_at exist; expiry = reclaim-in-place keyed on updated_at liveness.
- HALT-3: N/A (informational) — 0 live stale claims, so no UI re-import expiry to observe; logic verified via harness instead.

## Out of Scope / Residuals
- UI notification for single-flight blocks (frontend; §6A). TTL bounds the block to <=5 min.
- CanonicalWriter retry/backoff (HF-260 ADR R2) — separate surface.
- HF-263 EPG verification (architect re-import) can resume now that plan import can't be permanently blocked.

*HF-264 — Phases 2-4 implemented + build-verified + logic-verified; PR #449.*
