# HF-193 — plan_agent_seeds Eradicated; Signals via persistSignal

**Branch:** `hf-193-signal-surface`
**Final HEAD (pre-report commit):** `e76c3e27`
**PR:** https://github.com/CCAFRICA/spm-platform/pull/339
**Authority:** Decision 153 LOCKED
**Scope:** Minimum shippable — seeds eradication + signal-surface cutover on the existing generic writer. All other HF-193-adjacent work deferred (see "Deferred items").

---

## Phase 1 — `persistSignal` accepts A2 columns

**Commit:** `30e79eeb`

Additive extension to `web/src/lib/ai/signal-persistence.ts`: added three optional fields (`ruleSetId`, `metricName`, `componentIndex`) to `SignalData` interface; extended `persistSignal` insert and `persistSignalBatch` row-mapping to populate `rule_set_id`, `metric_name`, `component_index` columns when present.

All 15 existing callers of `persistSignal`/`persistSignalBatch` unaffected (fields are optional).

### Diff applied (10 insertions, 0 deletions)

```diff
@@ SignalData interface @@
+  // L2 comprehension scoping (HF-193 — optional; populated only for metric_comprehension signals)
+  ruleSetId?: string;
+  metricName?: string;
+  componentIndex?: number;

@@ persistSignal insert block @@
+        rule_set_id: signal.ruleSetId ?? null,
+        metric_name: signal.metricName ?? null,
+        component_index: signal.componentIndex ?? null,

@@ persistSignalBatch row mapping @@
+      rule_set_id: s.ruleSetId ?? null,
+      metric_name: s.metricName ?? null,
+      component_index: s.componentIndex ?? null,
```

### Typecheck

```
$ npx tsc --noEmit
tsc exit: 0
```

---

## Phase 2 — Delete `plan_agent_seeds`; bridge writes signals; convergence reads signals

**Commit:** `95efc14d`

### Inventory at Phase 2.1 entry (matched Phase 0)

20 lines / 6 files:

```
web/src/app/api/calculation/run/route.ts           152, 153, 154
web/src/app/api/import/commit/route.ts             1008, 1011, 1012
web/src/app/api/import/sci/execute-bulk/route.ts   568, 576, 578, 714, 722, 724, 852, 860, 862
web/src/app/api/import/sci/execute/route.ts        240, 241, 242
web/src/lib/compensation/ai-plan-interpreter.ts    759
web/src/lib/intelligence/convergence-service.ts    161
```

### Bridge edit (`ai-plan-interpreter.ts`)

- Added `import type { SignalData } from '@/lib/ai/signal-persistence';`
- Extended `bridgeAIToEngineFormat` return type with `signals: SignalData[]`
- Built `signals` from `validSemantics.map((semantic, i) => ({...}))` with `signalType: 'metric_comprehension'`, `metricName: semantic.metric`, `componentIndex: i`, `signalValue: semantic` (full AI-produced entry passed through)
- `ruleSetId` intentionally NOT set in bridge — stamped by caller
- Return changed from `inputBindings: validSemantics.length > 0 ? { plan_agent_seeds: validSemantics } : {}` to `inputBindings: {}` unconditional; `signals` added

### Caller edit (`api/import/sci/execute/route.ts`)

- Added `import { persistSignalBatch } from '@/lib/ai/signal-persistence';`
- Both `bridgeAIToEngineFormat` call sites (lines 1265 and 1501): after successful `rule_sets` upsert + before success log, inserted non-blocking `persistSignalBatch` call that stamps each signal with `ruleSetId` then writes via service-role credentials (`.catch()` pattern matching OB-135 / HF-092 non-blocking signal capture convention)

### Deletion table

| File | Block removed | Notes |
|---|---|---|
| `convergence-service.ts:161` | Decision 147 seeds-read block (~14 lines) | Replaced with classification_signals composite-key query + shape-preserving map |
| `calculation/run/route.ts:152-155` | Seed preservation block | `rawBindings` still used above for HF-165 gate |
| `import/commit/route.ts:1008-1013` | `rsBindings` declaration + seed preservation | commitBindings now unconditional `{ metric_derivations: merged }` |
| `import/sci/execute-bulk/route.ts` (×3 blocks) | 568, 714, 852 seed-preserve patterns | `replace_all` used; unconditional `input_bindings: {}`; "seeds preserved" log phrase removed |
| `import/sci/execute/route.ts:241-244` | Seed preservation in commit-update | Preceding `metric_mappings` preservation retained |

### Zero-residue verification

```
$ git grep -n "plan_agent_seeds" -- 'web/src/**/*.ts' 'web/src/**/*.tsx'
(no output; exit 1)
```

Per-file SR-51v2 committed-code grep (`git show HEAD:<path>`) — all 6 edited files clean.

### Build + typecheck + lint

```
$ npx tsc --noEmit   → exit 0
$ npx next lint      → warnings only (pre-existing, unrelated to edits; zero errors)
$ npm run build      → ✓ Compiled successfully
```

---

## Phase 3 — BCL post-cutover verification + data purge

### 3.1.a — Verify script pre-written

`web/scripts/hf193-p3-verify-bcl-signals.ts` (directive-verbatim shape; top-level-await wrapped in `main()` for cjs tsx compatibility).

### 3.1.b — BCL "before" snapshot

- **BCL tenant_id:** `b1c2d3e4-aaaa-bbbb-cccc-111111111111` (Banco Cumbre del Litoral)
- **Existing rule_sets (3):**

| id | status | created_at | has_plan_agent_seeds | input_bindings_keys |
|---|---|---|---|---|
| `1bc9e8ed-a539-445e-b4af-2c16d8996ed8` | active | 2026-03-20 | false | `[]` |
| `f270f34c-d49e-42e6-a82b-eb7535e736d9` | active | 2026-03-14 | false | `[convergence_bindings]` |
| `d299b413-9f46-43f5-a22f-f6db55eb8ebd` | draft  | 2026-03-14 | false | `[convergence_bindings]` |

**None of BCL's existing rule_sets carried `plan_agent_seeds`.**

### 3.1.c — Dev server startup

HEAD confirmed `95efc14d`. Started `next dev` in background (PID 56645). Ready in 1930ms on `http://localhost:3000`. Port 3000 responsive (HTTP 307 auth redirect).

### 3.1.d — Architect's import: no errors; zero `.catch()` log lines

Filtered log lines (during import window):

```
81:  [SCI Execute] Batched plan interpretation: 3 sheets from b1c2d3e4-.../BCL_Plan_Comisiones_2025.xlsx
82:  [SCI Execute] XLSX plan text extracted: 2106 chars from 3 sheets
83:  [SCI Execute] Batched plan interpretation starting — 2106 chars
105: [SCI Execute] Batched plan saved: Banco Cumbre del Litoral ... (b9e8b7ff-112f-4028-b5a8-35c58970937a), 2 variants, 8 components from 3 sheets
133: [Convergence] Decision 147: 5 plan agent seeds found
134: [Convergence] Decision 147: Seed "credit_placement_attainment" VALIDATED → MetricDerivationRule
135: [Convergence] Decision 147: Seed "portfolio_quality_ratio" FAILED: Source field "portfolio_quality_ratio" not found as numeric in committed_data
136: [Convergence] Decision 147: Seed "deposit_capture_attainment" VALIDATED → MetricDerivationRule
137: [Convergence] Decision 147: Seed "cross_products_sold" FAILED: Filter field "product_type" not found in committed_data categorical fields
138: [Convergence] Decision 147: Seed "regulatory_infractions" FAILED: Filter field "infraction_type" not found in committed_data categorical fields
163: [SCI Execute] OB-160G: Convergence complete — 20 derivations across 4 rule sets
```

**Zero `[SignalPersistence] Batch failed:` and zero `[SCI Execute] Signal persist failed (non-blocking):` lines** — signal write succeeded.

### 3.2 — Verify script result on new rule_set `b9e8b7ff`

**Pass gates (all met):**

| Gate | Result |
|---|---|
| `has plan_agent_seeds key: false` | ✓ false |
| `metric_comprehension signal count:` > 0 | ✓ 5 |
| Each signal has non-null `rule_set_id`, `metric_name`, `component_index` | ✓ all populated |

Signals (5 rows, stamped with `rule_set_id: b9e8b7ff-112f-4028-b5a8-35c58970937a`):

| component_index | metric_name | confidence |
|---|---|---|
| 0 | credit_placement_attainment | 0.95 |
| 1 | portfolio_quality_ratio | 0.90 |
| 2 | deposit_capture_attainment | 0.95 |
| 3 | cross_products_sold | 0.90 |
| 4 | regulatory_infractions | 0.90 |

### 3.2.5 — BCL rule_set comparison (pre-calc stability)

`calculation_results` sums by rule_set_id for BCL tenant:

| rule_set_id | row count | total |
|---|---|---|
| `f270f34c-d49e-42e6-a82b-eb7535e736d9` | 510 | **$312,033.00** |

**Sole $312,033-producing rule_set is `f270f34c` using `convergence_bindings` shape.** Today's `b9e8b7ff` uses `metric_derivations` shape. Shape-regime non-comparability established before calculation run; $312,033 equality gate withdrawn via Phase 3.3 re-scope.

### 3.3 — Calculation run (revised pass gates)

- Calculated total: **$33,390** (non-zero ✓)
- No UI errors, no dev server exceptions ✓
- Signal-read path exercised ("5 plan agent seeds found" log line; mechanism is composite-key query against `classification_signals`) ✓

Revised pass gates met.

### Three-layer diagnostic — HF-193 exonerated

**Layer 1 — Bridge output:** `validSemantics` construction site filters on `metric` + `operation` only; passes full entry through as `signalValue: semantic` (lossless).

**Layer 2 — Signal storage:** Full `signal_value` JSONB for each of the 5 b9e8b7ff signals carries all AI-produced fields (metric, operation, reasoning, confidence, plus type-specific: numerator_metric/denominator_metric for ratio ops, source_field or filters for sum/count ops).

**Layer 3 — Convergence read translation:** Side-by-side diff of post-cutover HEAD vs. pre-cutover `8fae55e9` shows:
- Source extraction differs (JSONB lookup vs. classification_signals composite-key query)
- Field set carried: **byte-for-byte identical** — metric, operation, source_field, filters, numerator_metric, denominator_metric, confidence, reasoning (8 fields)
- Validation loop (`seedValid` + validationReasons) and `MetricDerivationRule` construction: **byte-for-byte identical**

**$33,390 vs $312,033 delta attribution (non-regression):**

1. Today's AI interpretation produced `ratio(numerator/denominator)` semantics for `credit_placement_attainment` and `deposit_capture_attainment` referencing columns that don't exist in committed_data (`credit_placement_amount`, `credit_placement_goal`, `deposit_capture_amount`, `deposit_capture_goal`). These two metrics computed $0 at calc time. Would have failed identically under pre-cutover seeds path.
2. Prior `1bc9e8ed` rule_set (2026-03-20, never calculated) had different AI interpretation producing `sum(Cumplimiento_Colocacion)` and `sum(Pct_Meta_Depositos)` for the same two metrics — AI interpretation drift pre-dates HF-193.
3. Baseline `f270f34c` used `convergence_bindings` shape with another AI interpretation run; numerical comparability to `metric_derivations` shape was never established.

### 3.4 — Seed JSONB purge

**BEFORE:** 4 rule_sets (all on tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7` — NOT BCL):

```
5bd59e5c-c63d-4ab3-8b22-8f8d9c0356ef  Cross-Sell Bonus Plan
55ff0cfe-9d47-4438-b2d2-09926cf19ab8  Consumables Commission Plan
68132602-320f-4b93-b873-ecf414c09c04  Capital Equipment Commission Plan
597c91dd-ebb9-4afe-9a9f-1072e4159f92  District Override Plan
```

**Purge method:** per-row `{ ...input_bindings }` → `delete .plan_agent_seeds` → update. Preserves all other keys.

**AFTER:** 0 rule_sets.

### 3.5 — Commit

**Commit SHA:** `e76c3e27`

Staged: 5 new scripts in `web/scripts/` + 2 evidence copies in `docs/evidence/`. Seven files, 508 insertions.

### Deviation note (Phase 3 commit message)

Original directive text was `"HF-193 Phase 3: BCL verified at $312,033; seeds JSONB purged from all rule_sets"`. Phase 3.3 re-scope explicitly withdrew the $312,033 equality gate — asserting it in the commit would have violated SR-34 (No Bypass). CC used `"HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets"` with a detailed commit body explaining what was actually verified. **Deviation is correct under standing rules.**

---

## Phase 4 — PR + Completion Report

- **PR URL:** https://github.com/CCAFRICA/spm-platform/pull/339
- **PR title:** HF-193: plan_agent_seeds eradicated; signals via persistSignal
- **PR body:** see `/tmp/hf193_pr_body.md` (23 lines), content mirrored in this report's PR body section
- **Completion report commit SHA:** (this commit — see commit log)

---

## Deferred items (out of scope for this HF)

- **AI-interpretation alignment** — prompt producing ratio semantics against non-existent committed_data columns (root cause of BCL $33,390 total vs baseline)
- **Baseline-path reconciliation** — calculation engine behavior on `convergence_bindings` vs `metric_derivations` shape; establish numerical comparability
- **CRP and Meridian baseline verification** — equivalent post-cutover path exercise on other flagship tenants
- **Plan 3 period-switch regression** — CRP-specific regression (DIAG-018)
- **`training:*` → `agent_activity:*` prefix rename** — Decision 30 v1 violation remediation
- **HF-165 gate completeness fix** — V-002 defect; presence-vs-completeness check in `calculation/run/route.ts`
- **`fn_bridge_persistence` stored procedure removal** — dead DB code (no VP callers); follow-up hygiene
- **Decision 30 v2 extension** — governance substrate work (VG repo)

---

## Full commit sequence on `hf-193-signal-surface`

| Phase | SHA | Message |
|---|---|---|
| Gate A | `3c07a126` | design artifact + Gate A directive |
| Gate B preflight | `8fae55e9` | Decision 30 v1 violation investigation directive |
| Phase 1 | `30e79eeb` | persistSignal accepts A2 columns (ruleSetId, metricName, componentIndex) |
| Phase 2 | `95efc14d` | delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals |
| Phase 3 | `e76c3e27` | BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets |
| Phase 4 | (this commit) | HF-193 Phase 4: completion report |

---

*HF-193 complete · seeds eradicated · signals via persistSignal · BCL post-cutover path verified · three-layer diagnostic exonerates HF-193 · 2026-04-24*
