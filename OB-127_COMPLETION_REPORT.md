# OB-127: Synaptic Content Ingestion Foundation — Completion Report

## Date: 2026-03-01
## Status: COMPLETE
## Branch: dev
## Decision: 77 — Unified Agent-Based Content Ingestion

---

## What Was Built

Implemented the foundation of Synaptic Content Ingestion (SCI), replacing the two-path import model with a unified agent-based intake system.

### New Infrastructure

| File | Purpose |
|------|---------|
| `web/src/lib/sci/sci-types.ts` | 196 lines — All SCI type definitions (ContentProfile, AgentScore, SemanticBinding, SCIProposal, etc.) |
| `web/src/lib/sci/content-profile.ts` | 236 lines — Structural observation engine, field type detection, pattern recognition |
| `web/src/lib/sci/agents.ts` | 243 lines — Four specialist agent scoring models with exact weight tables |
| `web/src/app/api/import/sci/analyze/route.ts` | 155 lines — POST /api/import/sci/analyze — proposal generation |
| `web/src/app/api/import/sci/execute/route.ts` | 490 lines — POST /api/import/sci/execute — classification-specific pipelines |

### Key Capabilities

1. **Content Profile Generator** — Observes structure (sparsity, header quality, row count), detects field types (integer, decimal, currency, percentage, date, text, boolean, mixed), identifies patterns (entity identifiers, date columns, currency columns), generates multilingual name signals
2. **Four Specialist Agents** — Plan, Entity, Target, Transaction — each with exact weight tables scoring structural signals. Highest score wins FULL claim.
3. **SCI Analyze API** — Accepts parsed file data, returns classified proposal with confidence scores, processing order, semantic bindings, and human review flags
4. **SCI Execute API** — Processes confirmed proposals: Target pipeline (NEW — commits with semantic_roles, triggers convergence), Transaction pipeline, Entity pipeline (with dedup), Plan pipeline (stub)
5. **Semantic Bindings** — Preserve customer vocabulary alongside platform types (17 semantic roles)

---

## Proof Gates — Hard

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| PG-01 | Build exits 0 | PASS | `npm run build` clean, 189 pages |
| PG-02 | Content Profile generates correctly | PASS | 6 test cases, 24/24 assertions pass |
| PG-03 | Plan Agent scores DG Tab 1 highest | PASS | Plan Agent confidence 0.67 for sparse/descriptive tab |
| PG-04 | Target Agent scores DG Tab 2 highest | PASS | Target Agent confidence 0.85 for entity+target tab |
| PG-05 | Transaction Agent scores CSV data highest | PASS | Transaction Agent confidence 0.80 for dated transaction data |
| PG-06 | Entity Agent scores roster highest | PASS | Entity Agent confidence 0.70 for personnel data |
| PG-07 | SCI analyze API returns valid proposal | PASS | 10/10 API tests pass — 2-tab file, transaction, ambiguous, error |
| PG-08 | SCI execute API commits target data | PASS | 11/11 tests — rows in committed_data with semantic_roles |
| PG-09 | Convergence re-run for DG | DOCUMENTED | Convergence ran but no NEW derivation — existing metric already covered |
| PG-10 | DG results after recalculation | DOCUMENTED | 48 results, uniform $30,000 — F-04 STILL OPEN |
| PG-11 | CL unchanged | PASS | 100 results, $6,540,774.36 |
| PG-12 | Mortgage unchanged | PASS | 56 results, $989,937.41 |
| PG-13 | IR unchanged | PASS | 64 results, $366,600.00 |
| PG-14 | MBC regression | PASS | 240 results, $3,245,212.66 |
| PG-15 | Korean Test | PASS | 0 domain vocabulary matches in web/src/lib/sci/ |
| PG-16 | Middleware update minimal | PASS | Only added `/api/import/sci` to PUBLIC_PATHS |

## Proof Gates — Soft

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| SPG-01 | Processing order correct | PASS | plan before target before transaction in processingOrder |
| SPG-02 | Semantic bindings generated | PASS | Every field in target content has a semantic role |
| SPG-03 | Close confidence gap detected | PASS | requiresHumanReview=true when gap < 0.10 |

---

## F-04 Status: STILL OPEN

### What SCI Achieved
- Tab 1 correctly classified as `plan` (67% confidence)
- Tab 2 correctly classified as `target` (85% confidence)
- Target data committed to `committed_data` with `semantic_roles` in metadata
- data_type: `deposit_growth_incentive__growth_targets`

### Why F-04 Remains Open
The DG plan component ("Deposit Growth Bonus") uses `bounded_lookup_1d` with metric `deposit_growth_attainment`. The existing derivation maps this to `sum on deposit_balances.amount`. Convergence ran after SCI target commit but did NOT produce a new derivation because:

1. The `deposit_growth_attainment` metric already has a derivation (from deposit_balances)
2. The convergence merge logic skips duplicate metrics: `!merged.some(e => e.metric === d.metric)`
3. What's ACTUALLY needed is a **separate goal metric** for comparison (e.g., `deposit_growth_target`), not a replacement of the existing actuals metric

### Resolution Path (OB-128+)
SCI-aware convergence that understands semantic roles:
- Target data with `performance_target` semantic role should produce a goal/benchmark metric
- The engine needs a `ratio` or `comparison` operation: actual (deposit_balances) vs target (growth_targets)
- This requires plan component modification to reference both actuals and targets

---

## Agent Scoring Results

| Input Data | Winner | Confidence | Runner-up | Gap |
|------------|--------|-----------|-----------|-----|
| DG Tab 1 (sparse, %, __EMPTY) | Plan | 0.67 | Target 0.00 | 0.67 |
| DG Tab 2 (entity+target) | Target | 0.85 | Entity 0.60 | 0.25 |
| Transaction CSV (600 rows, dates) | Transaction | 0.80 | Entity 0.25 | 0.55 |
| Personnel Roster | Entity | 0.70 | Target 0.30 | 0.40 |
| Ambiguous (3 cols, 5 rows) | Plan | 0.30 | Transaction 0.00 | 0.30 |

---

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | 192dba4 | Diagnostic — read standing rules, explore infrastructure |
| 1 | 324dbbd | Architecture Decision Record |
| 2 | 5d09e6a | SCI type definitions (196 lines, zero domain vocab) |
| 3 | 647891f | Content Profile generator (236 lines, 24/24 tests) |
| 4 | 9ffe391 | Agent scoring models (243 lines, 15/15 tests) |
| 5 | dd11315 | SCI analyze API (10/10 tests) |
| 6 | c0fcf05 | SCI execute API (11/11 tests) |
| 7 | ef9d746 | F-04 proof — DG end-to-end via SCI |
| 8 | 982bf77 | Korean Test PASS + build clean |
| 9 | (this) | Completion report + PR |

---

## Test Scripts

| Script | Tests | Status |
|--------|-------|--------|
| `ob127-test-content-profile.ts` | 6 cases, 24 assertions | ALL PASS |
| `ob127-test-agents.ts` | 8 cases, 15 assertions | ALL PASS |
| `ob127-test-analyze-api.ts` | 5 cases, 10 assertions | ALL PASS |
| `ob127-test-execute-api.ts` | 5 cases, 11 assertions | ALL PASS |
| `ob127-phase7-f04-proof.ts` | End-to-end DG proof | COMPLETE |

---

## What This Does NOT Do (Deferred to OB-128+)

- Round 2 negotiation (spatial intelligence between agents)
- Field-level PARTIAL claims (agents claim full tabs only in Phase 1)
- The proposal UI (API-only in this OB)
- Flywheel signal capture and weight evolution
- PDF plan document parsing through SCI
- SCI-aware convergence with semantic role matching (F-04 resolution)
