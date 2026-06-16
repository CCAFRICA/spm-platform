# HF-300 — Completion Report
## Plan-Identity Supersession + Post-Commit Assignment Reliability

**Date:** 2026-06-16 · **Branch:** `hf-300-supersession-assignment` · **Predecessor:** DIAG-071 (PR #532, `391e96c3`).
**Fixes:** C1 (tenant-scoped supersession) + C3 (post-commit work dying in the `waitUntil` background). C2 was DISPROVEN in DIAG-071. Build exit-0. **Awaiting architect SR-44 proof gate** (deploy-SHA verify → reimport → DB/browser checks) — I cannot deploy, reimport, or write production.

---

## 1 — Number verification (ledger)
HF-300 confirmed FREE before any commit, across all four loci (HF-297/298 were already taken, which is why the architect renumbered to 300):
```
docs/vp-prompts/        grep ^HF-300 → free   (only this directive's own save)
docs/completion-reports grep ^HF-300 → free
git log --all           grep HF-300   → free
git branch -a           grep hf-300   → free
gh pr list (all)        HF-300 in:title → none
```

---

## 2 — C1 fix: plan-identity (name-scoped) supersession

**File:** `web/src/lib/sci/plan-interpretation.ts`. **Identity field:** `name`. **Why:** `content_hash` is the *file* identity and is already handled by the HF-259 exact-duplicate **reuse** earlier in the function (same bytes → no new rule_set). A plan re-exported to a new PDF keeps its **name**; name is the plan's identity across re-imports, and using it converges a reimport of N plans to exactly N active even when bytes change (the §2.3 idempotency requirement; content_hash would leave 2 active per changed plan). The pre-fix code's own comment already claimed "idempotent on plan name" — the code just never enforced it.

```diff
+  // HF-300 (C1, DIAG-071): supersede only PRIOR VERSIONS OF THE SAME PLAN, identified by `name` …
   const { error: supersedeError, data: supersededRows } = await supabase
     .from('rule_sets')
     .update({ status: 'archived', updated_at: new Date().toISOString() })
     .eq('tenant_id', tenantId)
+    .eq('name', planName)            // ← only this plan's prior version; other plans stay active
     .neq('status', 'archived')
     .select('id, name, status');
```
DB confirms this is well-defined for MIR: **5 distinct plan names**. Scale-by-Design: holds for any N (no per-count assumption). Korean Test: matches a structural field (`name`), no hardcoded plan strings.

---

## 3 — C3 fix: post-commit reliability — **Option B (dedicated live-request endpoint)**

### Runtime evidence that drove the choice (§3.1)
DIAG-071's DB proof of the MIR tenant (service-role queries):
```
committed_data: 165,897 rows | entity_id linked: 1,641 | entity_id NULL: 164,256  (98.9% unlinked)
rule_set_assignments: 553, ALL on archived plan c3574b89; active plan ddc4bd2a: 0
```
The post-response `waitUntil` background introduced by PR #530 did **not** complete: 99% of rows never got their entity_id back-link and the active plan got no assignments (prod log: `TypeError: fetch failed` after response flush). This **disproves Option A** (a fresh client in the *same* frozen-after-response context wouldn't complete either) and **rules out Option C alone** (the calc self-heal at `run/route.ts:451-489` creates *assignments* when zero, but does NOT back-link `committed_data.entity_id` — calc would still aggregate nothing on 164k unlinked rows). The only reliable place for this work is a **live request → Option B.**

### The fix
**New endpoint `web/src/app/api/import/sci/finalize-import/route.ts`** (nodejs, maxDuration=300) runs the critical post-commit IN ITS OWN request, once, idempotent:
```ts
await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' }); // entity resolution + entity_id back-link
await supabase.from('rule_sets').update({ input_bindings: {} }).eq('tenant_id', tenantId).in('status', ['active','draft']);
const assignments = await createMissingAssignments(supabase, tenantId);          // rule_set_assignments (idempotent)
```
**`execute-bulk/route.ts`** — the three critical ops were REMOVED from the per-file `waitUntil` (which becomes best-effort flywheel + idempotent bound-reemit only) and their imports deleted:
```diff
-    const postCommitWork = (async () => {
-      await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });   // ← moved to finalize
-      … input_bindings clear …                                                            // ← moved to finalize
-      await createMissingAssignments(supabase, tenantId);                                 // ← moved to finalize
-      … flywheel … bound-reemit …
-    })();
+    // HF-300: critical post-commit MOVED to /api/import/sci/finalize-import (live request, once).
+    const bestEffortPostCommit = (async () => { … flywheel … bound-reemit … })();         // best-effort only
     try { waitUntil(bestEffortPostCommit); } catch { /* non-Vercel: detached */ }
     return NextResponse.json(response);                                                   // ← #530 speed win preserved
```
**`operate/import/page.tsx`** — the client triggers finalize ONCE on import completion (after data AND plan imports):
```diff
   const handleExecutionComplete = useCallback((result) => {
+    if (tenantId) void fetch('/api/import/sci/finalize-import', { method:'POST',
+      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tenantId, proposalId: result.proposalId }) })
+      .then(r => console.log(`[HF-300] finalize-import dispatched: HTTP ${r.status}`)).catch(()=>{});
     setState({ phase: 'complete', executionResult: result });
-  }, []);
+  }, [tenantId]);
```
Fire-and-forget is safe here: once the POST is dispatched the server runs finalize to completion in its own request/maxDuration regardless of the client; the endpoint is idempotent. **Logical proof the functions work in a live context:** the 6-15 import's `createMissingAssignments` ran *synchronously* (pre-#530) and DID write 553 assignments — moving it back into a live request restores that proven behavior. Also retires DIAG-070's per-file 15× redundancy (now once).

---

## 4 — DB proof — BEFORE (defect) + how AFTER is produced
I **cannot** produce the AFTER state (5 active + non-zero assignments) here: it requires the deployed fix + a reimport, both of which are the architect's SR-44 proof gate (I cannot deploy, drive the browser, or write production).

**BEFORE (today, service-role query — the defect this HF fixes):**
```
rule_sets: 1 active / 11 archived   (active = ddc4bd2a AJUSTES, the last imported)
rule_set_assignments: 553, ALL on archived c3574b89; active plan: 0
committed_data: 165,897 | entity_id NULL: 164,256
```
**AFTER (architect proof gate) — verification script to run post-reimport:**
```ts
// expect: 5 active rule_sets; assignments non-zero per active plan; committed_data entity_id NULL ≈ 0
const { data: active } = await c.from('rule_sets').select('id,name').eq('tenant_id',T).eq('status','active');
const { data: asg } = await c.from('rule_set_assignments').select('rule_set_id').eq('tenant_id',T);
const { count: nullEid } = await c.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id',T).is('entity_id',null);
```

---

## 5 — Build
`rm -rf .next && npm run build` → ✓ Compiled successfully, types validated, **BUILD_EXIT=0**. `finalize-import` route present in the build output (`ƒ /api/import/sci/finalize-import`).

---

## 6 — Stranded-assignment reconciliation (§3.3)
The 553 stranded assignments (on archived `c3574b89`) and the 164k NULL entity_ids are reconciled by running the now-reliable post-commit against the existing data — either:
- **(preferred) architect reimports the 5 plans** at the proof gate: C1 keeps all 5 active; the client fires `finalize-import`; entity resolution links the 165k rows and assignments are created for all 5 active plans; or
- **a one-time reconciliation:** POST `/api/import/sci/finalize-import` `{tenantId:"972c8eb0…"}` once (idempotent) — links the committed_data and assigns the currently-active plan(s).

**I did not run the production reconciliation write** (164k entity_id updates is a significant prod write; SR-44 reserves DB changes for the architect). I built the mechanism and will run the one-time finalize if you authorize it, or you can trigger it at the proof gate.

---

## 7 — Scope fence (NOT touched)
- **Engine / calc math:** untouched. The calc route is unchanged (its HF-126/HF-189 self-heal remains as the assignment backstop).
- **Schema:** no migration. Uses existing `rule_sets.name`, `rule_set_assignments`, `committed_data.entity_id`.
- **Import speed (PR #530):** preserved — per-file execute-bulk still returns immediately after the commit loop; finalize is a separate request.
- **Single-plan tenants (BCL/Meridian/CRP):** name-scoped supersession == tenant-scoped when there's one plan name → no behavior change; their already-linked data is untouched.
- **DIAG-070 `[TRACE-*]` logging:** left in place (separate cleanup residual).

---

*HF-300 · Plan-Identity Supersession + Post-Commit Assignment Reliability · 2026-06-16 · vialuce.ai*
