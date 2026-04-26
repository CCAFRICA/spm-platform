# REVERT-001 FINDINGS — Pre-Seeds Substrate Anchor Identification

**Authored:** 2026-04-26
**Branch authored on:** `revert-pre-seeds-anchor` (head pinned at the anchor SHA)
**Predecessor evidence:** DIAG-023 FINDINGS — classification SUBSTRATE_DOES_NOT_MATCH_LOCK (commit `843aa926` on branch `diag-023-substrate-architecture-match`)
**Scope (Rule 36):** Anchor identification + branch staging only. No merge to main. No cherry-pick. No code modifications.

---

## ANCHOR IDENTIFICATION

**SEEDS_INTRODUCTION_SHA** — the merge commit on `main` that introduced seeds (HF-191 / PR #338):

| Field | Value |
|---|---|
| Hash | `1277becccb3a7b82f4b34a97fb02590a5e27ab28` |
| Date | 2026-04-05 08:59:26 -0700 |
| Subject | Merge pull request #338 from CCAFRICA/dev |
| PR title | HF-191: Decision 147 — Plan Intelligence Forward (seed derivations from plan agent to convergence) |
| Parents (first, second) | `283d4c24ec196b7f45052292367af895dbaabb1e`, `4deacb166ff536f610e1b3c51b9ae993240681a1` |

**PRE_SEEDS_ANCHOR_SHA** — first parent of SEEDS_INTRODUCTION_SHA, the substrate immediately before seeds introduction:

| Field | Value |
|---|---|
| Hash | `283d4c24ec196b7f45052292367af895dbaabb1e` |
| Date | 2026-04-03 20:55:29 -0700 |
| Subject | Merge pull request #337 from CCAFRICA/dev |
| Parents (first, second) | `f14d28f1f3667566fb3336f7960cc07e25947120`, `663ea1033dfb4a133600aeebdc3d10572ab8e300` |

---

## SEEDS INTRODUCTION EVIDENCE

Diff stat for `1277becc` (PR #338 merge) — `git show --stat`:

```
 DECISION_147_PLAN_INTELLIGENCE_FORWARD (1).md    | 156 +++++++
 DECISION_147_PLAN_INTELLIGENCE_FORWARD.md        | 156 +++++++
 HF-191_COMPLETION_REPORT.md                      |  94 +++++
 HF-191_PLAN_INTELLIGENCE_FORWARD_v2.md           | 495 +++++++++++++++++++++++
 SESSION_HANDOFF_20260405.md                      | 427 +++++++++++++++++++
 web/src/app/api/calculation/run/route.ts         |   5 +
 web/src/app/api/import/commit/route.ts           |   8 +-
 web/src/app/api/import/sci/execute-bulk/route.ts |  54 ++-
 web/src/app/api/import/sci/execute/route.ts      |   4 +
 web/src/lib/ai/providers/anthropic-adapter.ts    |  51 +++
 web/src/lib/compensation/ai-plan-interpreter.ts  |  15 +-
 web/src/lib/intelligence/convergence-service.ts  |  92 +++++
 12 files changed, 1537 insertions(+), 20 deletions(-)
```

Seed-introduction additions in the merge diff (`git diff 1277becc^1..1277becc -- '*.ts' '*.tsx' | grep '^\+.*plan_agent_seeds\|^\+.*planAgentSeeds\|^\+.*metricSemantics\|^\+.*Decision 147'` — count: **37**). Representative sample:

```
+          // Decision 147: Preserve plan_agent_seeds across convergence updates
+          if (rawBindings?.plan_agent_seeds) {
+            updatedBindings.plan_agent_seeds = rawBindings.plan_agent_seeds;
+          // Decision 147: Preserve plan_agent_seeds across convergence updates
+          if (rsBindings.plan_agent_seeds) {
+            commitBindings.plan_agent_seeds = rsBindings.plan_agent_seeds;
+  // Decision 147: Preserve plan_agent_seeds across convergence invalidation
+      const seeds = (rs.input_bindings as Record<string, unknown>)?.plan_agent_seeds;
+        input_bindings: seeds ? { plan_agent_seeds: seeds } : {},
+For each metric label used in your components (in calculationMethod or calculationIntent), output a top-level "metricSemantics" array that describes HOW each metric is derived from raw transactional data.
+  "metricSemantics": [
+RULES for metricSemantics:
+- Every metric label referenced in ANY component's calculationMethod or calculationIntent MUST have a metricSemantics entry
+  // Decision 147: Extract and validate metricSemantics from raw AI response
+  const rawSemantics = rawResult.metricSemantics as Array<Record<string, unknown>> | undefined;
+      ? { plan_agent_seeds: validSemantics }
+  const planAgentSeeds = (
+    (ruleSet.input_bindings as Record<string, unknown>)?.plan_agent_seeds ?? []
+  if (planAgentSeeds.length > 0) {
+    console.log(`[Convergence] Decision 147: ${planAgentSeeds.length} plan agent seeds found`);
```

PR #338 introduces seeds across `web/src/lib/intelligence/convergence-service.ts`, `web/src/lib/compensation/ai-plan-interpreter.ts`, `web/src/lib/ai/providers/anthropic-adapter.ts`, and four `web/src/app/api/...` route files.

---

## ANCHOR SUBSTRATE STATE

### Files present at anchor `283d4c24`

| Path | Verdict at anchor |
|---|---|
| `web/src/lib/compensation/ai-plan-interpreter.ts` | PRESENT (header comment `/** AI-Powered Plan Interpreter */`) |
| `web/src/lib/ai/ai-plan-interpreter.ts` | NOT FOUND (`fatal: path ... does not exist`) |
| `web/src/lib/intelligence/convergence-service.ts` | PRESENT — 2104 lines (header `/** OB-120/OB-162: Convergence Service — Field Identity Binding (Decision 111) */`) |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | PRESENT (header `/** Anthropic Provider Adapter */`) |
| `web/src/lib/ai/anthropic-adapter.ts` | NOT FOUND (`fatal: path ... does not exist`) |

The substrate paths at the anchor match current main (per DIAG-023): `ai-plan-interpreter.ts` resides at `compensation/`, not `ai/`; `anthropic-adapter.ts` resides at `ai/providers/`, not `ai/`.

### Symbols present and absent at anchor (in `web/src/lib/intelligence/convergence-service.ts`)

| Symbol | Verdict | Evidence |
|---|---|---|
| `extractComponents` (matcher) | PRESENT | line 492 — `function extractComponents(componentsJson: unknown): PlanComponent[]` |
| `inventoryData` (matcher) | PRESENT | line 619 — `async function inventoryData(...)` |
| `matchComponentsToData` (matcher) | PRESENT | line 819 — `function matchComponentsToData(...)` |
| `generateAllComponentBindings` (matcher) | PRESENT | line 1579 — `async function generateAllComponentBindings(...)` |
| `plan_agent_seeds` / `planAgentSeeds` | ABSENT | grep returns empty |
| `Decision 147` / `Seed.*VALIDATED` / `Seed.*FAILED` / `metricSemantics` | ABSENT | grep returns empty (verified per architect-revised H1.3 sub-criterion 3) |
| `classification_signals` (signal-surface write) | PRESENT (in-substrate) | line 253 — `await supabase.from('classification_signals').insert({...})` |

Per REVERT-001 AMENDMENT (architect-channel, 2026-04-26): the `classification_signals` reference is signal-surface infrastructure introduced at HF-115 Phase 2 (commit `7996bb2a`, 2026-03-09 — 27 days before PR #338) and is in-substrate per the architectural principle "intelligence on shared signal surface, never private JSONB." Seeds were the violation; signal surface is compliance.

### `input_bindings` shape produced at anchor

In `web/src/lib/intelligence/convergence-service.ts`:

| Line | Reference |
|---|---|
| 6 | `* AND per-component input_bindings for Decision 111 convergence.` |
| 133 | `.select('id, name, components, input_bindings')` |
| 192 | `const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as ...` |

In `web/src/lib/compensation/ai-plan-interpreter.ts`:

| Line | Reference |
|---|---|
| 209 | `* Public wrapper for validateAndNormalize (used by bridgeAIToEngineFormat)` |
| 725 | `export function bridgeAIToEngineFormat(` |
| 733 | `inputBindings: Record<string, unknown>;` |
| 747 | `inputBindings: {},` |

At the anchor, `input_bindings` is exclusively a `convergence_bindings` carrier (Decision 111 path). There is no `plan_agent_seeds` key; the bridge initializes `inputBindings` empty.

---

## DIVERGENCE FROM CURRENT MAIN

Origin main HEAD at REVERT-001 close: `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8`.

| Metric | Value |
|---|---|
| Commit count anchor → main | 34 |
| Merge commits anchor → main | 3 |
| Files changed anchor → main | 44 |
| Insertions | 7925 |
| Deletions | 66 |

Merges anchor → main (`git log 283d4c24..origin/main --merges`):

| # | Hash | Date | Subject |
|---|---|---|---|
| 1 | `1277becccb3a7b82f4b34a97fb02590a5e27ab28` | 2026-04-05 08:59:26 -0700 | Merge pull request #338 from CCAFRICA/dev *(seeds introduction — HF-191)* |
| 2 | `3a3351eb91e3d752ea77a3d02d4aa375e774ae43` | 2026-04-24 14:51:14 -0700 | Merge pull request #339 from CCAFRICA/hf-193-signal-surface |
| 3 | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` | 2026-04-25 20:15:47 -0700 | Merge pull request #340 from CCAFRICA/hf-193-signal-surface |

Top-30 files changed anchor → main (`git diff --stat`): comprises HF-191 / Decision 147 markdown artifacts, `docs/completion-reports/...`, `docs/handoff-reports/...`, `docs/prompts/...`, `docs/diagnostics/...`, `docs/evidence/...`, `docs/verification/...`, `web/scripts/hf193-...`. Production source modifications (per `git diff --stat` and the merge diffs) concentrate in `web/src/lib/intelligence/convergence-service.ts`, `web/src/lib/compensation/ai-plan-interpreter.ts`, `web/src/lib/ai/providers/anthropic-adapter.ts`, and `web/src/app/api/import/sci/execute-bulk/route.ts`.

---

## BRANCH CREATED

| Field | Value |
|---|---|
| Local branch | `revert-pre-seeds-anchor` |
| Local HEAD SHA | `283d4c24ec196b7f45052292367af895dbaabb1e` |
| Origin branch | `origin/revert-pre-seeds-anchor` |
| Origin HEAD SHA | `283d4c24ec196b7f45052292367af895dbaabb1e` |
| Push timestamp | 2026-04-26 (this session, post-amendment) |
| Push status | Successful on retry after architect disabled GitHub email-privacy push protection |

`git rev-parse origin/revert-pre-seeds-anchor` returns `283d4c24ec196b7f45052292367af895dbaabb1e` — matches anchor SHA exactly.

---

## AUDIT CANDIDATES

Every merge commit on `main` between anchor and current main HEAD. These are the architect's input list for the directive audit (architect-channel work, separate from REVERT-001):

1. `1277becccb3a7b82f4b34a97fb02590a5e27ab28` — Merge pull request #338 from CCAFRICA/dev *(HF-191: Decision 147 — Plan Intelligence Forward; seeds introduction)*
2. `3a3351eb91e3d752ea77a3d02d4aa375e774ae43` — Merge pull request #339 from CCAFRICA/hf-193-signal-surface
3. `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` — Merge pull request #340 from CCAFRICA/hf-193-signal-surface

The 31 non-merge commits between anchor and main on the merged branches are reachable from the three merge commits above; the audit may walk them as the architect sees fit.

---

## HALT CONDITIONS NOT TRIGGERED

Two HALT events fired during REVERT-001 execution and were resolved by explicit architect intervention before any phase advanced:

1. **ADG-5 (working tree dirty)** — resolved by `git stash push -u -m "REVERT-001 pre-cut stash: pre-existing local state on diag-023 branch"` per architect direction. Stash retained on `diag-023-substrate-architecture-match`.
2. **Phase 3.2 (push declined, GH007 email-privacy)** — resolved by architect disabling the GitHub email-privacy push protection. Retried `git push origin revert-pre-seeds-anchor` succeeded.

A third event — original H1.3 sub-criterion 3 (classification_signals presence at anchor) — was not a HALT in the directive's HALT-conditions block but was a partial gate failure CC reported to the architect. Architect issued **REVERT-001 AMENDMENT** revising the third sub-criterion to a seeds-specific marker check (`Decision 147 | Seed.*VALIDATED | Seed.*FAILED | metricSemantics`); revised grep against anchor returned empty, and H1.3 PASSED under revised criteria. Anchor `283d4c24` stands.

No HALT conditions remain unresolved at the close of REVERT-001.

---

## ARCHITECT NEXT STEPS

`origin/revert-pre-seeds-anchor` is staged at SHA `283d4c24ec196b7f45052292367af895dbaabb1e` awaiting the architect's directive audit. `main` is unmodified. The branch must remain pushed to origin between REVERT-001 close and REVERT-002 start; it is not merged to main during that interval. CC takes no further action on this work without an explicit architect directive (REVERT-002 or equivalent) walking forward audited directives.
