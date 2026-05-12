# HF-217 — Revert HF-216 + fix ratio-write defect in `resolveMetricsFromConvergenceBindings`

**Date:** 2026-05-11
**Base branch:** `dev` (from `b6d8c774 DIAG-040: post-HF-216 full intentTraces extraction`)
**Defect anchors:**
- DIAG-039 — Meridian Logistics, c4 Fleet Utilization, $2 vs expected $610
- DIAG-040 — post-HF-216 full intentTrace extraction confirmed cross-hub summing empirically
**HF-216 status:** fully reverted (7 git revert commits + 1 data revert)

CC pastes verbatim evidence at every section. No interpretation. No PASS/FAIL. Architect reconciles in architect-channel per SR-44.

---

## Phase 0 — Mandatory reads + state confirmation

Phase 0 reads complete.

**Function & line location (verbatim from current code):**
- Function `resolveMetricsFromConvergenceBindings` in `web/src/app/api/calculation/run/route.ts`.
- Ratio branch occupies lines 1258–1284 of the pre-HF-217 (== post-HF-216) version of the file. After Phase 1 revert, the ratio branch defect text `metrics[expectedMetrics[0]] = numValue / denValue;` sits at line **1222** (line drift caused only by removal of HF-216 additions further up the file).

**HF-216 commit SHAs (verbatim from `git log --oneline dev ^main | grep "HF-216"`, chronological descending):**
```
48ffd8d8 HF-216 Phase 7: PR description document
6d9bcbb0 HF-216 Phase 6: localhost calc re-run evidence
c475e485 HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence
6200011d HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings
575bfc59 HF-216 Phase 2: roster join index pre-computation
7b80eb16 HF-216 Phase 1: ConvergenceBindingEntry.via type definition
51394381 HF-216 Phase 0: Architecture Decision Record + Phase 0 reads
```

**Ratio-branch pre-fix grep (verbatim):**
```
$ grep -n "metrics\[expectedMetrics\[0\]\] = numValue / denValue" web/src/app/api/calculation/run/route.ts
1277:        metrics[expectedMetrics[0]] = numValue / denValue;
```

Defect text confirmed present at line 1277 pre-revert. After Phase 1 revert it shifts to line 1222.

---

## Phase 1 — Revert HF-216 commits (SR-41 — `git revert`)

Seven `git revert --no-edit <SHA>` in reverse chronological order (latest first). All clean — no merge conflicts.

**Revert commit chain (verbatim from `git log --oneline -10` post-revert):**
```
d59f65af Revert "HF-216 Phase 0: Architecture Decision Record + Phase 0 reads"
1a240bb2 Revert "HF-216 Phase 1: ConvergenceBindingEntry.via type definition"
3d6c52c6 Revert "HF-216 Phase 2: roster join index pre-computation"
a732eb6e Revert "HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings"
4009370e Revert "HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence"
e59fc442 Revert "HF-216 Phase 6: localhost calc re-run evidence"
31615dea Revert "HF-216 Phase 7: PR description document"
b6d8c774 DIAG-040: post-HF-216 full intentTraces extraction
48ffd8d8 HF-216 Phase 7: PR description document
6d9bcbb0 HF-216 Phase 6: localhost calc re-run evidence
```

**Verification — HF-216 files absent (verbatim `ls` output):**
```
$ ls -la web/src/types/convergence-bindings.ts web/scripts/HF-216_backfill_meridian_via.ts web/scripts/HF-216_phase6_recalc.ts docs/hotfixes/HF-216_DESCRIPTION.md docs/hotfixes/HF-216_Phase6_evidence.md docs/architecture-decisions/HF-216_ADR.md 2>&1
ls: docs/architecture-decisions/HF-216_ADR.md: No such file or directory
ls: docs/hotfixes/HF-216_DESCRIPTION.md: No such file or directory
ls: docs/hotfixes/HF-216_Phase6_evidence.md: No such file or directory
ls: web/scripts/HF-216_backfill_meridian_via.ts: No such file or directory
ls: web/scripts/HF-216_phase6_recalc.ts: No such file or directory
ls: web/src/types/convergence-bindings.ts: No such file or directory
```

All 6 HF-216 files absent post-revert.

**Verification — zero HF-216 references in route.ts (verbatim grep output):**
```
$ grep -n "rosterJoinIndex\|HF-216" web/src/app/api/calculation/run/route.ts
(empty — zero matches; exit code 1)
```

---

## Phase 2 — Data-side revert (Meridian via clauses removed)

Created `web/scripts/HF-217_revert_meridian_via.ts` (mirror-image of HF-216 Phase 4 backfill). Executed against tenant `5035b1e8-…` / rule_set `939cf576-…`.

**Verbatim stdout:**
```
HF-217 revert: tenant=5035b1e8-0754-4527-b7ec-9f93f85e4c79 rule_set=939cf576-4096-4ceb-a142-539a486868b3
Removed via clause from component_0.entity_identifier
Removed via clause from component_1.entity_identifier
Removed via clause from component_2.entity_identifier
Removed via clause from component_3.entity_identifier
Removed via clause from component_4.entity_identifier
HF-217 revert: 5 via clauses removed

=== VERIFY ===
VERIFY component_0.entity_identifier.via: absent (ok)
VERIFY component_1.entity_identifier.via: absent (ok)
VERIFY component_2.entity_identifier.via: absent (ok)
VERIFY component_3.entity_identifier.via: absent (ok)
VERIFY component_4.entity_identifier.via: absent (ok)
```

All 5 components verified absent.

---

## Phase 3 — Code fix: route.ts ratio-write defect

**Verbatim diff of `web/src/app/api/calculation/run/route.ts` (commit `8c565207`):**

```diff
@@ -1218,8 +1218,30 @@ export async function POST(request: NextRequest) {
         bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=ratio | rawNum=${rawNumValue} | numScale=${numBinding.scale_factor ?? 'undefined'} | postNum=${numValue} | rawDen=${rawDenValue} | denScale=${denBinding.scale_factor ?? 'undefined'} | postDen=${denValue}`);
       }

-      if (numValue !== null && denValue !== null && denValue !== 0) {
-        metrics[expectedMetrics[0]] = numValue / denValue;
+      // HF-217: Write raw numerator and denominator to their declared metric names.
+      // The intent-executor's source:'ratio' resolver divides them at execution time.
+      // Reads metric names from the binding-declared intent (component.calculationIntent
+      // .input.sourceSpec.{numerator,denominator}), not from expectedMetrics position,
+      // to avoid fragility against AST walk order. Pre-HF-217 the function wrote the
+      // pre-divided ratio to expectedMetrics[0] and left expectedMetrics[1] unfilled,
+      // which let the OB-118 merge guard backfill the second key from derivedMetrics
+      // (count rule) so the intent-executor's ratio resolver then divided the already-
+      // divided value by the count — producing nonsense.
+      const ratioIntent = (component.calculationIntent as Record<string, unknown> | undefined)?.input as
+        Record<string, unknown> | undefined;
+      const ratioSpec = ratioIntent?.sourceSpec as Record<string, unknown> | undefined;
+      const numMetricName = typeof ratioSpec?.numerator === 'string'
+        ? ratioSpec.numerator.replace(/^metric:/, '')
+        : null;
+      const denMetricName = typeof ratioSpec?.denominator === 'string'
+        ? ratioSpec.denominator.replace(/^metric:/, '')
+        : null;
+
+      if (numMetricName && numValue !== null) {
+        metrics[numMetricName] = numValue;
+      }
+      if (denMetricName && denValue !== null) {
+        metrics[denMetricName] = denValue;
       }
       const result = Object.keys(metrics).length > 0 ? metrics : null;
```

Stat: `1 file changed, 24 insertions(+), 2 deletions(-)`.

---

## Phase 4 — Build + dev server verification

**Build (`npm run build`, last 30 lines verbatim):**
```
├ ƒ /perform/trends                           218 B           309 kB
├ ƒ /performance                              373 B          88.5 kB
├ ƒ /performance/adjustments                  198 B           168 kB
├ ƒ /performance/approvals                    7.95 kB         187 kB
├ ƒ /performance/approvals/payouts            7.24 kB         208 kB
├ ƒ /performance/approvals/payouts/[id]       9.45 kB         199 kB
├ ƒ /performance/approvals/plans              14.2 kB         227 kB
├ ƒ /performance/goals                        1.77 kB          98 kB
├ ƒ /select-tenant                            5.04 kB         153 kB
├ ƒ /signup                                   3.38 kB         156 kB
├ ƒ /spm/alerts                               7.72 kB         204 kB
├ ƒ /stream                                   19.7 kB         304 kB
├ ƒ /test-ds                                  8.03 kB         152 kB
├ ƒ /unauthorized                             780 B          97.6 kB
├ ƒ /upgrade                                  6.82 kB         155 kB
├ ƒ /workforce/permissions                    11 kB           240 kB
├ ƒ /workforce/personnel                      212 B           214 kB
├ ƒ /workforce/roles                          13.3 kB         238 kB
└ ƒ /workforce/teams                          11.5 kB         213 kB
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB


ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

**Dev server (`npm run dev`, log tail):**
```
 ✓ Ready in 1061ms
 ✓ Compiled /src/middleware in 345ms (125 modules)
 ○ Compiling /login ...
 ✓ Compiled /login in 3.6s (2118 modules)
 HEAD /login 200 in 3908ms
```

**Curl probes (verbatim):**
```
$ curl -sI http://localhost:3000
HTTP/1.1 307 Temporary Redirect            (auth-gate → /login)
cache-control: private, no-store, no-cache, must-revalidate
pragma: no-cache

$ curl -sI http://localhost:3000/login
HTTP/1.1 200 OK
Cache-Control: no-store, must-revalidate
pragma: no-cache
```

---

## Phase 5 — Localhost calc re-run + verbatim Norma January result

Direct POST-handler import (middleware bypassed by script context — same Node process). Subject: Meridian × January 2025 × entity `007da35a-…` (Norma Rodríguez Rivera, external_id 70209).

**Handler return:**
```
HTTP status: 200
body length: 105384 chars
```

**Result row identifiers (verbatim):**
```
result_id:    601044c9-49db-4c00-a778-c8625aa1f2dc
batch_id:     f0cce1d2-6923-411b-9647-185830f492ec
total_payout: 1402
```

**components[].payout (verbatim):**
```
components[0]: id=revenue_performance_senior name=Revenue Performance - Senior payout=300
components[1]: id=on_time_delivery_senior   name=On-Time Delivery - Senior   payout=400
components[2]: id=new_accounts_senior       name=New Accounts - Senior       payout=700
components[3]: id=safety_record_senior      name=Safety Record - Senior      payout=0
components[4]: id=fleet_utilization_senior  name=Fleet Utilization - Senior  payout=2
```

**metadata.intentTraces[0..4] (verbatim, full):**

```
--- intentTraces[0] ---
inputs:       {"hub_route_volume":{"source":"metric","rawValue":116,"resolvedValue":116},"revenue_goal_attainment":{"source":"metric","rawValue":94.72,"resolvedValue":94.72}}
modifiers:    []
finalOutcome: 300
componentType: "bounded_lookup_2d"
componentIndex: 0

--- intentTraces[1] ---
inputs:       {"on_time_delivery_percentage":{"source":"metric","rawValue":94.72,"resolvedValue":94.72}}
modifiers:    []
finalOutcome: 400
componentType: "bounded_lookup_1d"
componentIndex: 1

--- intentTraces[2] ---
inputs:       {"new_accounts_count":{"source":"metric","rawValue":2,"resolvedValue":2}}
modifiers:    []
finalOutcome: 700
componentType: "scalar_multiply"
componentIndex: 2

--- intentTraces[3] ---
inputs:       {"constant:0":{"source":"constant","rawValue":0,"resolvedValue":0},"safety_incidents_count":{"source":"metric","rawValue":2,"resolvedValue":2}}
modifiers:    []
finalOutcome: 0
componentType: "conditional_gate"
componentIndex: 3

--- intentTraces[4] ---
inputs:       {"hub_total_loads":{"source":"metric","rawValue":116,"resolvedValue":116},"hub_total_capacity":{"source":"metric","rawValue":116,"resolvedValue":116}}
modifiers:    [{"after":1.5,"before":800,"modifier":"cap"}]
finalOutcome: 1.5
componentType: "scalar_multiply"
componentIndex: 4
```

**metadata.intentMatch / intentTotal / legacyTotal (verbatim):**
```
metadata.intentMatch:  false
metadata.intentTotal:  1402
metadata.legacyTotal:  2200
```

**Handler `[CalcRecon-T1]` componentTotals line (verbatim from `/tmp/hf217_phase5.out:518`):**
```
[CalcAPI] [CalcRecon-T1] componentTotals=[c0:19425 | c1:5850 | c2:18200 | c3:12300 | c4:134]
```

---

## Git log — all HF-217 commits (verbatim, `git log --oneline -10`)

```
c470cea9 HF-217 Phase 5: localhost calc re-run + verbatim recalc evidence
8c565207 HF-217 Phase 3: route.ts ratio-write defect — write raw num/den to declared metric names
9614e4db HF-217 Phase 2: revert Meridian via-clause backfill (data-side)
d59f65af Revert "HF-216 Phase 0: Architecture Decision Record + Phase 0 reads"
1a240bb2 Revert "HF-216 Phase 1: ConvergenceBindingEntry.via type definition"
3d6c52c6 Revert "HF-216 Phase 2: roster join index pre-computation"
a732eb6e Revert "HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings"
4009370e Revert "HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence"
e59fc442 Revert "HF-216 Phase 6: localhost calc re-run evidence"
31615dea Revert "HF-216 Phase 7: PR description document"
```

Plus the Phase 6 report commit (this file) appended after this report is written.

---

## File inventory

**Created by HF-217:**
- `web/scripts/HF-217_revert_meridian_via.ts`
- `web/scripts/HF-217_phase5_recalc.ts`
- `docs/completion-reports/HF-217_COMPLETION_REPORT.md` (this file)

**Modified by HF-217:**
- `web/src/app/api/calculation/run/route.ts` (Phase 3 ratio-write fix)

**Deleted by HF-217 revert chain:**
- `web/src/types/convergence-bindings.ts`
- `web/scripts/HF-216_backfill_meridian_via.ts`
- `web/scripts/HF-216_phase6_recalc.ts`
- `docs/hotfixes/HF-216_DESCRIPTION.md`
- `docs/hotfixes/HF-216_Phase6_evidence.md`
- `docs/architecture-decisions/HF-216_ADR.md`

---

## Architect-channel reconciliation (per SR-44)

CC pastes the values above verbatim. Architect verifies post-merge against production state and against `Meridian_Resultados_Esperados.xlsx` GT in architect channel. CC does not interpret. CC does not state PASS or FAIL.

Cap-modifier slot semantics (post-multiply vs pre-multiply ratio cap) remain explicitly deferred per HF-217 directive's non-scope section.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
