# DIAG-023 FINDINGS REPORT
## Date: 2026-04-26
## Predecessor chain: DIAG-020 → DIAG-020-A → DIAG-021 R1 → DIAG-022 → HF-194 (merged via PR #340)

## 1. ANCHOR COMMITS

| Anchor | SHA | Date (committer) | Subject |
|--------|-----|------------------|---------|
| `origin/main` HEAD | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` | 2026-04-25 20:15:47 -0700 | Merge pull request #340 from CCAFRICA/hf-193-signal-surface |
| `origin/hf-193-signal-surface` HEAD | `c9f2015a4c8f2e502a0c7b4386cca5caa6804aad` | 2026-04-25 20:10:45 -0700 | HF-194 Phase 5: verification specs + completion report |
| HF-193 cutover commit | `95efc14d` | 2026-04-24 11:31:28 -0700 | HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals |
| HF-193 BCL purge commit | `e76c3e27` | 2026-04-24 12:47:16 -0700 | HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets |
| HF-193 PR #339 merge | `3a3351eb` | 2026-04-24 14:51:14 -0700 | Merge pull request #339 (PR title: "HF-193: plan_agent_seeds eradicated; signals via persistSignal") |
| HF-194 PR #340 merge | `a2921fbb` | 2026-04-25 20:15:47 -0700 | Merge pull request #340 |

## 2. APRIL 22–26 MERGE INVENTORY

| SHA | Date | Type | Subject |
|-----|------|------|---------|
| a2921fbb | 2026-04-25 20:15 | merge | PR #340 (HF-194) — parents 3a3351eb + c9f2015a |
| c9f2015a | 2026-04-25 20:10 | non-merge | HF-194 Phase 5: verification specs + completion report |
| 2665b264 | 2026-04-25 20:08 | non-merge | HF-194 Phase 4: register AP-17 parallel metadata construction tech debt |
| b784291c | 2026-04-25 20:07 | non-merge | HF-194 Phase 3: add field_identities to execute-bulk metadata |
| 34f2c42d | 2026-04-25 20:05 | non-merge | HF-194 Phase 2: migrate execute/route.ts to import from lib/sci |
| d56f3e66 | 2026-04-25 20:03 | non-merge | HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci |
| cf84ee4e | 2026-04-25 19:22 | non-merge | DIAG-022: pipeline architecture read |
| 966c2abe | 2026-04-25 18:08 | non-merge | DIAG-021 R1: caller-writer + matcher path + data_type drift diagnostic |
| 4750e857 | 2026-04-25 17:27 | non-merge | DIAG-020-A: field_identities absence confirmation |
| 882bc94c | 2026-04-25 17:15 | non-merge | DIAG-020: component bindings drift diagnostic |
| 3a3351eb | 2026-04-24 14:51 | merge | PR #339 (HF-193 cutover) — parents 1277becc + 445fcb00 |
| 445fcb00 | 2026-04-24 14:45 | non-merge | HF-193 Phase 4: completion report |
| e76c3e27 | 2026-04-24 12:47 | non-merge | HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets |
| 95efc14d | 2026-04-24 11:31 | non-merge | HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals |
| 30e79eeb | 2026-04-24 08:44 | non-merge | HF-193 Phase 1: persistSignal accepts A2 columns (ruleSetId, metricName, componentIndex) |
| 8fae55e9 | 2026-04-23 16:08 | non-merge | HF-193 Gate B preflight: Decision 30 v1 violation investigation directive |
| 3c07a126 | 2026-04-23 10:32 | non-merge | HF-193: design artifact + Gate A directive |
| ed7c70d7 | 2026-04-22 10:54 | non-merge | Session close 2026-04-22: Closing Report + Handoff per HANDOFF_TEMPLATE_v2 |

## 3. HF-193 MARKER PRESENCE ON MAIN

| Marker | Search | Verdict |
|--------|--------|---------|
| HF-193 (loose grep on commit subjects) | 20 commits returned (HF-193 Phases 1–4 + HF-193 design artifact + Gate B preflight + HF-193-A Phases 1.2/1.3/2.2a/2.2b + HF-193-A 2.2b revert + 2 merge commits) | **PRESENT** |
| HF-193-A (specific) | 9 commits returned (Phases 1.2, 1.3, 2.2a, 2.2a refinement, 2.2b, 2.2b revert) | **PRESENT** |
| HF-193-B (specific) | 0 commits returned | **ABSENT** |
| "atomic cutover" | 0 commits returned | **ABSENT in subject lines** |
| "Decision 153" | 0 commits returned in subject lines | **ABSENT in subject lines** |
| "eradicate" / "seeds removal" / "signal surface" | 1 commit returned (3c07a126 "HF-193: design artifact + Gate A directive") | **PRESENT** (design-artifact-only mention) |

PR #339 title is `HF-193: plan_agent_seeds eradicated; signals via persistSignal` (per `gh pr list`); the title explicitly claims eradication despite "eradicated" not appearing in any subject line.

## 4. SEED WRITE PATH ON MAIN

| File | Path | `plan_agent_seeds` matches | `planAgentSeeds` matches | Verdict |
|------|------|---------------------------|--------------------------|---------|
| Production source | `web/src/lib/intelligence/convergence-service.ts` | string `plan_agent_seed` (singular, line 245 — `dataType` value tag in matchReport per DIAG-020) | 4 occurrences (lines 169, 185, 186, 188 — in-memory variable + log strings) | **PRESENT** |
| Production source | `web/src/lib/compensation/ai-plan-interpreter.ts` | none | none | ABSENT (snake_case key absent from this file; metricSemantics-bridge logic at line 745 references `metricSemantics`, not `plan_agent_seeds`) |
| Production source | `web/src/lib/ai/providers/anthropic-adapter.ts` | none | none | ABSENT (only `metricSemantics` references — these are the AI prompt template strings) |
| Production source | any other `web/src/**/*.{ts,tsx}` | none | none | ABSENT |
| Audit/migration artifact | `docs/evidence/hf193-p3-purge-seeds.ts` | 5 matches | n/a | PRESENT (HF-193 Phase 3 audit script) |
| Audit/migration artifact | `docs/evidence/hf193-p3-verify-bcl-signals.ts` | 1 match | n/a | PRESENT (HF-193 Phase 3 verify script) |
| Audit/migration artifact | `web/scripts/hf193-p3-{bcl-before-snapshot,purge-seeds,verify-bcl-signals}.ts` | 3 files (audit-only) | n/a | PRESENT (HF-193 Phase 3 audit scripts) |

**Production-source verdict:** the snake_case JSONB key name `plan_agent_seeds` is **absent** from production source on main (only the singular `plan_agent_seed` appears once as a `dataType` value tag at convergence-service.ts:245). The camelCase variable name `planAgentSeeds` and the in-memory seed-validation flow (convergence-service.ts:169–253) are **present** on main.

## 5. SEED READ PATH ON MAIN

| Marker | File:line on main | Verdict |
|--------|------------------|---------|
| `planAgentSeeds = (signalRows ?? []).map(...)` | `web/src/lib/intelligence/convergence-service.ts:169` | **PRESENT** — signalRows source is `classification_signals` filtered by `signal_type='metric_comprehension'` (verified in DIAG-020 Section 1) |
| `console.log("[Convergence] Decision 147: ${planAgentSeeds.length} plan agent seeds found")` | convergence-service.ts:186 | **PRESENT** |
| `[Convergence] Decision 147: Seed "${seed.metric}" VALIDATED → MetricDerivationRule` | convergence-service.ts:249 | **PRESENT** |
| `[Convergence] Decision 147: Seed "${seed.metric}" FAILED: ${validationReasons.join('; ')}` | convergence-service.ts:251 | **PRESENT** |
| `Decision 147: Component "${comp.name}" fully covered by seeds — no gaps` | convergence-service.ts:555 | **PRESENT** |
| HF-112 AI column mapping (`Requesting AI column mapping`) | convergence-service.ts:1745, 1747, 1782, 1807, 1846 | **PRESENT** |
| OB-185 Pass 4 (`AI Semantic Derivation`) | convergence-service.ts:486, 513, 522, 532, 537, 1921, 2122, 2127 | **PRESENT** |

Every Vercel-log emission string the architect cited in the directive's meta-content is **present** in main's `convergence-service.ts` and emitted on every convergence run:
- "Decision 147: 5 plan agent seeds found" → line 186
- 'Seed "credit_placement_attainment" VALIDATED → MetricDerivationRule' → line 249
- "HF-112 Requesting AI column mapping" → line 1745
- "OB-185 Pass 4: 4 unresolved metrics — invoking AI semantic derivation" → line 513

## 6. SIGNAL SURFACE WRITE PATH ON MAIN

| File | Verdict |
|------|---------|
| `web/src/lib/ai/signal-persistence.ts` | **PRESENT** — `persistSignalBatch` writes to `classification_signals` (per DIAG-022 + earlier diagnostics) |
| `web/src/lib/compensation/ai-plan-interpreter.ts` (line 745+) | **PRESENT** — `bridgeAIToEngineFormat` constructs `SignalData[]` with `signalType: 'metric_comprehension'` (per DIAG-022 Section 11) |
| `web/src/app/api/import/sci/execute/route.ts` | **PRESENT** — calls `persistSignalBatch(engineFormat.signals)` for plan units |
| `web/src/lib/intelligence/convergence-service.ts:163-167` | **PRESENT** — reads `classification_signals` filtered by `signal_type='metric_comprehension'` and `rule_set_id` |
| `web/src/lib/signals/{briefing,stream}-signals.ts` | **PRESENT** — additional signal writers (other signal_type values) |

The signal surface is installed. metric_comprehension reads/writes are wired between `bridgeAIToEngineFormat` (writer side, via `persistSignalBatch`) and `convergeBindings` (reader side, line 163). HF-193 Phase 1 added persistSignal A2 columns; Phase 2 connected the new path; Phase 3 purged the old JSONB data.

## 7. HF-193-A BRANCH STATE

| Property | Value |
|----------|-------|
| `origin/hf-193-signal-surface` HEAD | `c9f2015a` (2026-04-25 20:10) |
| `origin/main` HEAD | `a2921fbb` (2026-04-25 20:15) |
| Ahead/behind (main_only / branch_only) | **2 / 0** — branch is fully merged into main; main has 2 merge commits (PR #339 and PR #340) that the branch does not have. |
| `docs/completion-reports/HF_193_A_COMPLETION_REPORT.md` on branch | **FILE_NOT_FOUND** |
| `docs/completion-reports/HF_193_A_COMPLETION_REPORT.md` on main | **FILE_NOT_FOUND** |
| Existing HF-193-A artifacts on both refs | `docs/completion-reports/HF_193_A_Phase_2_2a_COMPLETION_REPORT.md` (sub-phase only); 2 verification scripts; 3 SQL migrations (`20260421_*`) |
| PR #339 (HF-193) | MERGED 2026-04-24T21:51:14Z, base=main, head=hf-193-signal-surface, title `HF-193: plan_agent_seeds eradicated; signals via persistSignal` |
| PR #340 (HF-194) | MERGED 2026-04-26T03:15:48Z, base=main, head=hf-193-signal-surface, title `HF-194: Restore field_identities in execute-bulk pipeline` |

**Branch state interpretation:** `hf-193-signal-surface` was the long-lived feature branch for both HF-193 and HF-194. It was merged to main via PR #339 (HF-193 cutover, 2026-04-24) and again via PR #340 (HF-194 patches, 2026-04-26). No commits on the branch are unmerged. **HF-193-B as a distinct task is not present in the commit history of main or the branch** (zero matching commits across multiple grep variants).

## 8. CLASSIFICATION

**Classification: SUBSTRATE_DOES_NOT_MATCH_LOCK — confidence MEDIUM.**

Section 4 shows the snake_case JSONB key `plan_agent_seeds` is absent from production source on main (HF-193 Phase 2 deleted the JSONB read path; HF-193 Phase 3 purged the JSONB data from `rule_sets`). To that narrow extent, the substrate matches the eradication mandate.

Section 5, however, shows the seed-as-concept is fully retained in production code: the in-memory variable name `planAgentSeeds` (4 occurrences in `convergence-service.ts`), the log strings the architect cited from Vercel ("Decision 147: 5 plan agent seeds found", "Seed VALIDATED → MetricDerivationRule", "Seed FAILED"), and the validate-then-promote logic at convergence-service.ts:185–253 all remain active on main. PR #339's title claims `plan_agent_seeds eradicated`, yet the cited Vercel runtime logs from 2026-04-26 03:49 UTC emit those exact strings — those emissions originate from the code at lines 186, 247, 249, 251 of `convergence-service.ts` on main HEAD. The lock disposition cited in the architect's meta-content (Decision 153, B-E4 atomic cutover, F7 scope mandating eradication "not preservation") implies the seeds-as-concept eradication, but DIAG-023 cannot read the lock document under Rule 36 scope discipline; classification confidence is therefore MEDIUM rather than HIGH. The mismatch between PR #339's title-claim (`eradicated`) and the live production-log evidence is, however, observable purely from substrate inspection: the data-storage half of eradication is achieved; the conceptual-and-emission half is not.

**Hypothesis (NOT a fix proposal).** If `SUBSTRATE_DOES_NOT_MATCH_LOCK`: HF-193 cutover is incomplete at the level mandated by Decision 153's F7 scope — the JSONB storage was eradicated but the in-memory representation, variable naming, log emissions, and Decision 147 validation flow on `convergence-service.ts:163–253` were preserved; HF-193-B (or equivalent) was not authored as a distinct phase, leaving the architect-defined "additive-policy contamination" intact in the substrate.
