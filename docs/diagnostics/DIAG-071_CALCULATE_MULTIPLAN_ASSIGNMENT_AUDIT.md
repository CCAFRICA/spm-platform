# DIAG-071 — Calculate Regression: Multi-Plan Loss + Zero Entity Assignment (Code Audit)

**Date:** 2026-06-16 · **Mode:** READ-AND-AUDIT ONLY (no fix) · **Branch:** `diag-071-calc-multiplan-audit`
**Tenant:** `972c8eb0-e3ae-4e4c-ad30-8b34804c893a` · **Predecessor:** DIAG-070.
**Verdict up front:** a COMPOUND of **C1 (latent, pre-OB-203)** + **C3 (recent regression, HF-297 — mine)**. **C2 is DISPROVEN.**

---

## §1 — Ground truth (service-role queries, production DB)

### 1.1 — rule_sets: 12 total, **1 active, 11 archived**
```
2026-06-14 04:55:09 | archived | 55196755… | PLAN DE COMISIONES POR VENTA MAYORISTA
2026-06-14 04:55:35 | archived | 805a0cdd… | PLAN DE BONO POR CUOTA MENSUAL
2026-06-14 04:55:57 | archived | 1a3cb4e0… | PLAN DE INCENTIVO POR COBRANZA
2026-06-14 04:56:13 | archived | 12535b79… | PLAN DE BONO POR CARTERA NUEVA
2026-06-14 04:56:38 | archived | b3f1186e… | PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK)
2026-06-15 12:15:32 | archived | d7242651… | PLAN DE BONO POR CUOTA MENSUAL
2026-06-15 12:15:59 | archived | b2f773f6… | PLAN DE INCENTIVO POR COBRANZA
2026-06-15 12:16:18 | archived | c3574b89… | PLAN DE BONO POR CARTERA NUEVA   ← holds ALL assignments
2026-06-16 22:33:55 | archived | 0a1b7e75… | PLAN DE BONO POR CUOTA MENSUAL
2026-06-16 22:34:21 | archived | 888fc503… | PLAN DE INCENTIVO POR COBRANZA
2026-06-16 22:34:50 | archived | a5ba7c75… | PLAN DE BONO POR CARTERA NUEVA
2026-06-16 22:35:25 | ACTIVE    | ddc4bd2a… | PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK)  ← only survivor
status tally: {"archived":11,"active":1}
```
Only the **last-imported** plan is active — exactly the symptom ("only 1 of 5 plans, PLAN DE AJUSTES Y DEVOLUCIONES").

### 1.2 — assignments: **553, ALL pointing to an ARCHIVED plan**
```
rule_set_assignments: count=553   per rule_set: { "c3574b89… (BONO CARTERA, 6-15, ARCHIVED)": 553 }
entity_plan_assignments: table does not exist
total entities: 553
```
Assignments DID write (553 = entity count) — but every one points to `c3574b89` (active during the **6-15** import, archived since). The **active** plan `ddc4bd2a` has **zero** assignments → "0 entities."

### 1.3 — calculation_batches: **0** · committed_data: 165,897 rows.
No calc has ever completed for this tenant. (The log's "22 batch(es) hidden" are import_batches, not calculation_batches — calc batches = 0.)

---

## §2 — Code audit

### C1 — supersession is TENANT-scoped, not plan-scoped — `plan-interpretation.ts:363-368`
```ts
// AUD-013: supersede ALL prior rule_sets for this tenant (any status)…
const { error: supersedeError, data: supersededRows } = await supabase
  .from('rule_sets')
  .update({ status: 'archived', updated_at: new Date().toISOString() })
  .eq('tenant_id', tenantId)
  .neq('status', 'archived')          // ← NO content_hash / name / plan-identity filter
  .select('id, name, status');
```
Every import archives **all** the tenant's prior rule_sets. Five sequential imports → only the last survives. Matches the per-import log `Superseded 1 prior rule_set(s)`. **History:** tenant-scoped since **HF-239 (`9484e3b5`, 2026-05-19)**, refined by HF-241 (5-20), HF-244 (5-20), HF-257 (`2077b168`, 5-31) — **all pre-OB-203 (6-11)**. AUD-013 widened the predicate (`.eq('status','active')` → `.neq('status','archived')`) but did not introduce the tenant-scope. → **LATENT single-plan assumption**, surfacing on the first 5-concurrent-plan tenant.

### C2 — assignment LIMIT-1 — `assignment-creation.ts` — **NOT PRESENT**
```ts
const { data: activeRuleSets } = await supabase
  .from('rule_sets').select('id')
  .eq('tenant_id', tenantId).eq('status', 'active');   // :41-45 — ALL active, NO limit
…
for (const rs of activeRuleSets) {                       // :90 — loops EVERY active rule_set
  for (const entityId of allEntityIds) {
    if (!assignedSet.has(`${entityId}:${rs.id}`)) {      // :92 — idempotent per (entity,rule_set) PAIR
```
There is **no `LIMIT 1` / single-plan / most-recent** logic. The function assigns every entity to every *active* rule_set. The single-plan effect is produced entirely by **C1** (only one active rule_set ever exists), not by the assignment code. **One coupling that matters:** line 45 filters to `status='active'`, so assignments can only ever be created for the currently-active plan — the 553 stranded on archived `c3574b89` can never serve the active `ddc4bd2a`.

### C3 — createMissingAssignments runs in the FAILING waitUntil background — `execute-bulk/route.ts`
```ts
const supabase = createClient(URL, SERVICE_KEY);          // :129 — request-scoped service-role client
…
const postCommitWork = (async () => {                     // :623
  await executePostCommitConstruction({ supabase, … });  // :627
  …
  await createMissingAssignments(supabase, tenantId);     // :654  ← inside the background block
  …
})();
try { waitUntil(postCommitWork); } catch { /* detached */ } // :715
```
`createMissingAssignments` (and entity resolution) run inside the `waitUntil` background block **introduced by HF-297 (`6e49db8a`, 2026-06-16 — mine, PR #530)**, using the request-scoped `supabase` client. Production logs at 22:38:14 show `TypeError: fetch failed` in this backgrounded tail (`[SCISignalCapture]`, `[TrainingSignalService]`). DB evidence confirms the consequence: the **6-15** assignments (createMissingAssignments still ran **synchronously** then) landed on `c3574b89`; the **6-16** re-imports' createMissingAssignments ran in the background and **wrote nothing** for the then-active plans, including the final active `ddc4bd2a`. **Likely mechanism:** in Next 14.2 App-Router Node runtime `waitUntil` may not be wired to a request context and throws → my `catch{}` lets `postCommitWork` run **detached** → on Vercel the lambda freezes after response flush → background fetches fail. → **RECENT REGRESSION.**

### §2.5 — Calculate "Failed to fetch"
- Plan list: `calculate/page.tsx:91` `plans.filter(p => p.status === 'active' || p.status === 'draft')` → archived plans vanish (confirms C1 → "1 of 5" on the page).
- The button: `calculate/page.tsx:252` `await fetch('/api/calculation/run', …)` (plain fetch, **no timeout**), `catch` at :265 surfaces the message. "**Failed to fetch**" is a browser TypeError = the calc function returned **no usable response** (crash / gateway timeout / platform fetch-failure). It is **NOT** the carrier-intelligence 403 (that endpoint is not called by this handler) and **NOT** the handled server-side `Failed to fetch assignments` 500 (`run/route.ts:438`, which returns JSON the handler would show as a plan-specific message). It is a **separate, downstream** failure from the assignment root cause — with 0 assigned entities the calc would be empty regardless.

---

## §3 — Verdict

| Candidate | Verdict | Evidence |
|---|---|---|
| **C1** — tenant-scoped supersession kills 4 of 5 plans | **CONFIRMED — latent** | DB §1.1 (1 active/11 archived, only last survives); code `plan-interpretation.ts:363-368` (no plan-identity filter); tenant-scoped since HF-239 5-19, pre-OB-203 |
| **C2** — assignment LIMIT-1 single-plan assumption | **DISPROVEN** | `assignment-creation.ts:41-45,90,92` — selects/loops ALL active rule_sets, idempotent per pair, no limit. Single-plan effect is C1's. |
| **C3** — createMissingAssignments fails in waitUntil background | **CONFIRMED — recent regression** | DB §1.2 (553 → archived 6-15 plan, 0 → active 6-16 plan); `execute-bulk:623-715,654` (in HF-297 `6e49db8a` waitUntil block); prod log `TypeError: fetch failed` in that tail |
| Calc "Failed to fetch" origin | **Separate / downstream** | client `calculate/page.tsx:252` fetch TypeError (no response); not carrier-intelligence, not the run/route.ts:438 handled 500 |

**Root cause (compound):** The regression is two independent defects — neither is missing functionality. **(1) "Only 1 of 5 plans" is C1, a LATENT single-plan-per-tenant assumption:** `plan-interpretation.ts:363-368` archives *every* prior rule_set for the tenant with no plan-identity (content_hash/name) filter, so importing five plans sequentially leaves only the last active (DB: 11 archived, 1 active = `ddc4bd2a`), and `calculate/page.tsx:91` shows only active/draft plans. Tenant-scoped since **HF-239 (2026-05-19)** and refined by HF-241/244/257 — all **pre-OB-203**; it surfaces now on the first tenant with five concurrent plans. **(2) "Active plan shows 0 entities" is C3, a RECENT REGRESSION I introduced in HF-297 (`6e49db8a`, 2026-06-16):** I moved `createMissingAssignments` into the `waitUntil` post-commit background (`execute-bulk:623-715`), whose Supabase writes fetch-fail in production — so the 6-16 re-imports created no assignments for their (now-active) plans, and `assignment-creation.ts:45` only assigns to `status='active'` rule_sets, stranding the 553 pre-existing assignments on the archived 6-15 plan `c3574b89`. **C2 is DISPROVEN** (no LIMIT-1 exists). **How they compound:** C1 moves the active pointer to the last-imported plan; C3 prevents that plan from ever receiving assignments; the active-only filter (`:45`) means the stranded 553 can never serve it — net: one visible plan, zero entities, nothing to calculate. The Calculate "Failed to fetch" is a separate downstream client-fetch failure (`calculate/page.tsx:252`) to be traced on its own.

**Fix scoping (separate directive):** C1 → supersede by plan identity (content_hash/name), not tenant-wide. C3 → critical post-commit work (entity resolution + assignments) must not depend on a `waitUntil`/detached background that fails on Vercel; verify whether `waitUntil` even runs in this runtime, and consider a triggered/idempotent post-commit step or making assignments re-derivable so supersession can't strand them.

---

## Deployment record
Branch `diag-071-calc-multiplan-audit`; report-only (no behavior change). PR # and HEAD SHA stated in the PR and the response.

*DIAG-071 · Calculate Multi-Plan/Assignment Audit · 2026-06-16 · vialuce.ai*
