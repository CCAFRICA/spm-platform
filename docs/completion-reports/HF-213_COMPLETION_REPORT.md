# HF-213 — Content Unit Hash SHA-256 — Supersession Identity Primitive Closure — Completion Report

**Date:** 2026-05-07
**Branch:** `hf-213-atomic-supersession-resolver-closure`
**Baseline SHA (main):** `86c0477b1ae31edaeb57f95166cdc4d90d5b1e77` (post-HF-212 merge)
**Phase 0 baseline commit:** `dc99c8f56b5965171cd7dcdb4dd76265d50a3350`
**Substrate citations:** Decision 77, Decision 92, Decision 152, HF-196 Phase 1E + 1F, T1-E902, T1-E904, T1-E905, T1-E910, T1-E912, T1-E931.
**Predecessor IRA invocations:** HF-213 Synthesis (cost $1.56, ira_request_hash `6a68392c...`), HF-213 Enforcement (cost $1.89, Option A ranked 1, ira_request_hash `ee93894d...`).

---

## Commits

| Phase | SHA | Message |
|---|---|---|
| 0 (baseline) | `dc99c8f5` | HF-213 Phase 0: read-only probe report (architect-channel disposition pending) |
| 1 (schema) | `7caa0021` | HF-213 Phase 1: Schema migration for content_unit_hash_sha256 (supersedes HF-196 Phase 1F file-level supersession scope) |
| 2 (hash module) | `62b4534d` | HF-213 Phase 2: Content unit hash computation module + unit tests (Korean Test compliant; 9/9 PASS via node:test + tsx) |
| 3 (supersession refactor) | `e89d5ebf` | HF-213 Phase 3: Supersession primitive scope refactor — content_unit_hash_sha256 supersedes file_hash_sha256 as supersession identity |
| 4 (integration) | `c6e90207` | HF-213 Phase 4: Execute-bulk + execute integration — content_unit_hash_sha256 computed at all ingestion entry points |
| 5 (build/lint/test) | `e5a44e74` | HF-213 Phase 5: Build + lint + test + typecheck — all gates PASS |
| 6.5 (regression evidence) | `f3fb277b` | HF-213 Phase 6: Regression evidence captured (Meridian). Architect-channel reconciliation: PASS per scope. |

---

## Files

| File | Operation | Lines |
|---|---|---|
| `web/supabase/migrations/20260507134700_hf213_content_unit_hash_sha256.sql` | CREATE | +23 |
| `web/src/lib/sci/content-unit-hash.ts` | CREATE | +53 |
| `web/src/lib/sci/__tests__/content-unit-hash.test.ts` | CREATE | +95 |
| `web/src/lib/sci/import-batch-supersession.ts` | MODIFY | +43/-41 |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | MODIFY | +18/-9 |
| `web/src/app/api/import/sci/execute/route.ts` | MODIFY | +29/-10 |
| `web/package.json` | MODIFY | +2 (test script + tsx devDep) |
| `web/package-lock.json` | MODIFY | (lockfile) |
| `docs/CC-artifacts/HF-213_Phase0_PROBE_REPORT.md` | CREATE | +935 |
| `docs/CC-artifacts/HF-213_Phase6_REGRESSION_EVIDENCE.md` | CREATE | +175 |

---

## Hard Gates

### Gate 1 — Schema migration (verbatim)

Migration file `web/supabase/migrations/20260507134700_hf213_content_unit_hash_sha256.sql`:
```sql
ALTER TABLE import_batches ADD COLUMN content_unit_hash_sha256 text;
UPDATE import_batches SET content_unit_hash_sha256 = '<legacy_uncomputable>' WHERE content_unit_hash_sha256 IS NULL;
ALTER TABLE import_batches ALTER COLUMN content_unit_hash_sha256 SET NOT NULL;
CREATE INDEX idx_import_batches_content_unit_hash ON import_batches(tenant_id, content_unit_hash_sha256);
```

Architect applied via Supabase Dashboard SQL Editor 2026-05-07. Post-migration verification (architect-channel surfaced): `import_batches.content_unit_hash_sha256` text NOT NULL at column position 17. All HF-196 Phase 1E + 1F columns preserved.

### Gate 2 — Hash module unit tests (verbatim, 9/9 PASS)

```
> @vialuce/platform@0.1.0 test
> node --test --import tsx 'src/**/__tests__/**/*.test.ts'

✔ empty rows produces stable hash (0.607834ms)
✔ column order independence (0.125667ms)
✔ row order independence (0.06325ms)
✔ whitespace normalization (trim) (0.071417ms)
✔ null/undefined/empty-string equivalence (0.063125ms)
✔ different content produces different hashes (0.057583ms)
✔ Korean Test compliance (0.069708ms)
✔ CSV escape disambiguation (0.06175ms)
✔ Manifestation 2 — cross-container content identity (0.071917ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 312.908291
```

### Gate 3 — Build PASS (verbatim, last 15 lines)

```
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Full route table emitted, no errors. Korean Test gate (`bash scripts/verify-korean-test.sh` via prebuild) implicitly PASS — build succeeded.

### Gate 4 — Lint PASS (verbatim, last 10 lines)

```
./src/contexts/period-context.tsx
108:6  Warning: React Hook useEffect has a missing dependency: 'currentTenant'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./src/contexts/tenant-context.tsx
203:6  Warning: React Hook useCallback has an unnecessary dependency: 'user'. Either exclude it or remove the dependency array.  react-hooks/exhaustive-deps

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
```

Only pre-existing warnings; no errors; no warnings on modified files.

### Gate 5 — Typecheck PASS (verbatim)

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
```

Single pre-existing TS2345 in test infrastructure (HF-198 γ origin per HF-205-212 completion reports). No new errors from HF-213 additions.

### Gate 6 — Single canonical hash invocation grep

```
$ grep -rnE "createHash.*sha256|sha256.*createHash" web/src/lib/sci/ web/src/app/api/import/
web/src/lib/sci/file-content-hash.ts:23:  return createHash('sha256').update(buf).digest('hex');
web/src/lib/sci/structural-fingerprint.ts:167:  return nodeCrypto.createHash('sha256').update(composite).digest('hex');
web/src/lib/sci/content-unit-hash.ts:25:    return createHash('sha256').update('').digest('hex');
web/src/lib/sci/content-unit-hash.ts:52:  return createHash('sha256').update(canonical, 'utf8').digest('hex');
```

4 matches accounted for: file_hash (HF-196 audit, retained), structural_fingerprint (DS-017, unrelated), content-unit-hash (new HF-213 canonical, both internal calls within content-unit-hash.ts itself).

### Gate 7 — Korean Test grep (build gate via prebuild)

`bash scripts/verify-korean-test.sh` invoked via `npm run prebuild`; build succeeded → Korean Test gate PASS.

Directive's auxiliary §4.4 grep finding: 2 pre-existing comment-only references to "Plantilla" in `entity-resolution.ts:138, 170` (HF-199 D3 era documentation, NOT introduced by HF-213). Code logic uses `fi.structuralType === 'attribute'` heuristic. Out of HF-213 scope to remediate pre-existing comments.

### Gate 8 — Hash regression check on existing tenants (Critical HALT Condition 4)

NOT TRIGGERED. Pre-existing rows backfilled with sentinel `<legacy_uncomputable>` (per migration). New rows compute `content_unit_hash_sha256` from canonical normalization. No existing supersession chains orphaned.

---

## Soft Gates

| Gate | Status | Notes |
|---|---|---|
| Meridian regression PASS per scope | PASS | Architect-channel reconciliation (T2-E46). Phase 1E exclusion fired (5 superseded), 3 operative batches, 158 committed_data rows, 67 entities calculated. |
| BCL regression | SKIPPED per architect | Single-content-unit-per-file tenant; not at risk for HF-213 defect class. |
| CRP regression | SKIPPED per architect | Single-content-unit-per-file tenant; not at risk for HF-213 defect class. |
| Critical HALT Condition 5 (reconciliation mismatch) | NOT TRIGGERED | Calc output IS explained by HF-213's supersession-scope correction. C4 magnitude divergence is downstream defect class unblocked by HF-213, not caused by HF-213. |
| Manifestation 1 closure | CLOSED EMPIRICALLY | Multi-content-unit single-file imports no longer supersession-chain each other. |
| Manifestation 2 closure | CLOSED STRUCTURALLY | Hash module Test 9 PASS (cross-container content identity). |

---

## Compliance

| Standing rule | Status | Notes |
|---|---|---|
| SR-34 (no bypass) | HONORED | Diagnosed structurally throughout; no workarounds. |
| SR-39 (SOC 2 CC7.2 audit chain integrity) | PRESERVED | `file_hash_sha256` retained on import_batches for file-level audit. HF-196 Phase 1F audit intent preserved. New `content_unit_hash_sha256` adds content-unit-level audit. Append-only discipline preserved (superseded_by, supersedes, superseded_at, supersession_reason — HF-196 Phase 1E architecture unchanged). |
| SR-41 (revert via git revert) | NOT INVOKED | No phase required revert. |
| SR-42 (locked-rule halt) | NOT INVOKED | No locked-rule conflicts surfaced. |
| Rule 14 (prompts in git) | N/A | Architect-channel directive. |
| Rule 25 (completion report first deliverable) | PASS | This report written before PR creation. |
| Rule 26 (CR structure: Commits/Files/Hard/Soft/Compliance/Issues/Verification) | PASS | This report follows the structure. |
| Rule 27 (evidence = paste, self-attestation rejected) | PASS | All gates pasted verbatim. |
| Rule 28 (one commit per phase) | PASS | 7 commits across phases 0-6.5. |
| Rule 29 (CC paste-block discipline) | PASS | Directive paste-block honored verbatim at Phase 0. |
| Korean Test compliance | PASS | content_unit_hash_sha256 hash uses structural inputs only. Test 7 (Korean column names produce identical hash for identical content) PASS. |
| Append-only discipline | PASS | No data destroyed. Supersession via link columns; original batches retained as historical. file_hash_sha256 preserved as audit column. |

---

## Issues

### 1. C4 (Fleet Utilization) magnitude carry-forward — HF-214 candidate

Per architect-channel disposition (2026-05-07): C4 magnitude divergence is a separate defect class, downstream of HF-213, not caused by HF-213. The c4 data was filtered from operative reads pre-HF-213 (under file-level supersession scope); HF-213 unblocked data flow to c4, surfacing the latent c4 magnitude divergence. Per Vertical Slice Rule, c4 is its own vertical slice (HF-214 candidate). Architect carries forward as separate work.

### 2. Test framework adoption (Phase 2.3 finding)

`web/package.json` lacked a `test` script; no test framework configured. Adopted Node 20+ built-in `node:test` runner with `tsx` as devDependency (one-line addition). 9/9 hash module tests PASS. Future test work can extend the `src/**/__tests__/**/*.test.ts` glob pattern.

### 3. Pre-existing comment references to "Plantilla" in entity-resolution.ts

Directive §4.4 Korean Test grep flagged 2 pre-existing COMMENT references to "Plantilla" in `entity-resolution.ts:138, 170` (HF-199 D3 era documentation context). Code logic uses `fi.structuralType === 'attribute'` structural heuristic — Korean Test compliant. Out of HF-213 scope to remediate pre-existing comments. Actual Korean Test build gate (`bash scripts/verify-korean-test.sh`) PASS.

### 4. flags=NaN in Tier 1 footer (cosmetic)

Phase 6 calc log shows `flags={diag003Fallback:0/NaN boundaryFallback:0 ob118MergeGuardFired:0/NaN}` — `NaN` denominator surfaces when `ruleSet.components` length resolves to NaN in `t1FooterTotalLookups` calculation (HF-212-introduced surface, not HF-213). Counter values are correct (0 for all three flags). Cosmetic-only; does not affect calc semantics. Carry-forward for HF-212 follow-up if architect dispositions.

### 5. NaN denominator analysis post-HF-213 (informational)

HF-213 did not introduce `flags=NaN`; the NaN appears for Meridian's calc because `ruleSet.components` may resolve as a JSON value type (not array) at the `(ruleSet.components as unknown[])?.length` site. Pre-existing HF-212 surface; out of HF-213 scope.

---

## Verification

### Verbatim hash module test output (Phase 2.3 — Gate 2 above)

See Gate 2 above. 9/9 PASS.

### Verbatim build output (Phase 5 — Gate 3 above)

See Gate 3 above. Full route table emitted, no errors.

### Verbatim lint output (Phase 5 — Gate 4 above)

See Gate 4 above. Only pre-existing warnings, none on modified files.

### Verbatim Meridian regression evidence (Phase 6.5)

See `docs/CC-artifacts/HF-213_Phase6_REGRESSION_EVIDENCE.md` (commit `f3fb277b`). Section 2 contains verbatim calc log block. Sections 3-4 contain structural verification markers. Section 6 documents c4 magnitude carry-forward.

---

## Carry-forward (post-merge substrate work)

Per HF-213 Enforcement supersession_candidates and architect direction:

1. **Substrate promotion of content_unit_hash_sha256** — lock as Tier 2 Decision in `igf.entries`. Cross-reference Decision 77.
2. **Decision 77 extension** — cross-reference new identity primitive in IGF-T2-E30.
3. **Decision 51 extension** — cross-reference Carry Everything instantiation in IGF-T2-E09.
4. **HF-214 candidate** — c4 (Fleet Utilization) magnitude defect closure. Independent vertical slice.
5. **Adjacent-Arm Drift HFs** — calculation_batches (HF-198 candidate), plan_rule_sets, structural_fingerprints (DS-017), ingestion_events (HF-199 candidate).
6. **Substrate-maintenance focused effort** — SCI specification → substrate gap; Decision 152 / 51 / 117 escalation from identifier_only to full body fidelity.
7. **HF-212 NaN denominator cosmetic fix** — flags={...:N/NaN} in Tier 1 footer (informational only, not blocking).

These items are NOT shipped by HF-213. Per architect direction: future focused effort.
