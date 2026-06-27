# OB-249 — Agentic Data Intelligence: the Remediation Stage + the Normalizer (Slice A)

**Status:** ready to merge (CC authored/committed/PR'd; **architect merges — SR-44**).
**Branch:** `ob-249-agentic-remediation` (off `origin/main`).
**Mode:** ULTRACODE. CC owned the architecture; the directive's invariants/gates are the contract.
**Migrations:** **ZERO** — the stage rides entirely on existing surfaces (`classification_signals` open vocabulary + `committed_data.metadata` JSONB). I4 (subtraction over addition) by construction.

---

## §0 — CRF + PCD checklist

- [x] **Seed:** `OB-249 / Cite: remediation-stage objective + the atom layer + Decision 158 / Class: OB / Mode: ULTRACODE`.
- [x] **Collision gate:** `OB-249` had ZERO references in source/docs, no branch, no PR (latest PR #611). HALT-free.
- [x] **Architecture Decision Gate:** recorded below (§A), reviewed by a 3-lens adversarial design panel BEFORE build (4 blockers + majors caught and folded in).
- [x] **Anti-Pattern Registry** (§6A): pass — see §C.
- [x] **Prerequisite Gate 0 (§5.1):** atom layer live + queryable — see §B1.
- [x] **Schema Verification Gate (§5.2 / FP-49):** live schema of every touched table queried + pasted — see §B2.
- [x] Build clean, dev confirmed on `localhost:3000` — see §D.

---

## §A — Architecture Decision (the recorded HOW)

**The organ.** A new module `web/src/lib/remediation/` implements PRISM's remediation stage: a fleet of **agents**, each running the Decision-158 contract **propose (express) → construct (apply) → audit (signal)**, with the stage handling audit uniformly. This slice ships exactly **one** agent — the **Normalizer** — and proves the framework end to end.

**Placement (I7) — two-phase across the two existing import stages** (the design-review fix that keeps the LLM off the atomic write path and enables before-commit rendering):
- **EXPRESS (`propose`)** runs in **`process-job`** (proposal time): reads prior remediation signals (read-before-express), the LLM groups variant OBSERVED values, the proposal is persisted to the canonical signal surface (durable memory + P5 + the P7 render source). Off the 300s execute-bulk atomic path.
- **CONSTRUCT (`construct`)** runs **inside `commitContentUnit`** — the sole live `committed_data` writer (HF-231). Deterministic, no LLM. This makes the stage **mandatory by construction**: every promoted row passes through it; clean data is an identity pass and is still stamped.

**The Decision-158 split (I1/P2) — the load-bearing decision.** The LLM proposes ONLY the *equivalence grouping* of values it actually observed. `construct()` **selects the canonical deterministically from the observed values** (`chooseCanonical`: highest frequency → shortest → lexicographic) and **asserts the canonical is an observed value** (fail-loud). The LLM never authors a committed value; no fabricated value can reach `committed_data`.

**Identifier protection by NATURE, not cardinality (the substrate blocker fix).** A transaction foreign key is *low* cardinality, so cardinality cannot protect the calc join. `computeRemediationExclusions` excludes the resolved `entity_id_field` + every identifier / reference-key / measure / temporal column, read from the already-computed `field_identities`/`semantic_roles` (reusing the existing `IDENTIFIER_NATURE` predicate — I4). The Normalizer only ever sees text-attribute columns.

**Provenance (I3).** `row_data[col]` receives the canonical (so every raw-key reader gets congruent data); the original is retained per-cell in `metadata.remediation.changes[col] = {original, canonical, basis, agent}`. Nothing is destructively overwritten.

**Signals (I5/G7/G11).** One canonical surface (`writeSignalWithClient`), distinguished by provenance (`source='remediation'`, `signal_type='remediation:normalization'|'remediation:stage_run'|'remediation:degraded'`). Reads use a dedicated-column query filtered to the exact `signal_type` (NOT `getTrainingSignals`, which drops dedicated columns — the G11 hazard). Every write is non-throwing; a blocked write emits a degraded signal (never a silent dead-end).

**Progressive performance (I6).** Read-before-express keys on a value-set fingerprint + value-level recall; a **negative cache** (empty-group signal for clean columns) means the 2nd encounter of the same data — variant OR clean — costs **zero** LLM.

**Agent-opacity (I8).** The stage depends only on `identify / propose / toSignals / fromSignals / construct`; it never inspects an agent's proposal shape. Proven by a fixture 2nd agent with a different proposal shape running through the unchanged stage (unit test).

**Ordering (I3/HF-213).** The stage runs AFTER `computeContentUnitHashSha256` (raw-row supersession identity preserved) and `source_date` is extracted over the ORIGINAL row — re-import idempotency and date extraction are untouched.

**Rendered remediation (P7).** `web/src/components/remediation/RemediationReview.tsx` renders before→after→why from `GET /api/remediation/review` (session-tenant-bound via `resolveCallerTenant`; aggregates the actual applied changes from `committed_data.metadata.remediation`). Wired into the import complete phase (`operate/import`). Architect verifies the screenshot (SR-44).

### Design-review blockers folded in (3-lens adversarial panel, pre-build)
1. **I1/P2** — canonical must be observed, not LLM text → `chooseCanonical` + observed-assertion.
2. **Identifier protection by nature, not cardinality** → `computeRemediationExclusions`.
3. **Express off the atomic path + degrade-not-throw** → express in process-job; stage never throws.
4. **P8 provability** → per-row `_stageRan` stamp + per-unit `remediation:stage_run` signal on every commit.

---

## §B — Prerequisite & Schema gates (run BEFORE building)

### §B1 — Prerequisite Gate 0 (atom layer live + queryable) — PASS
Live `npx tsx` probe (`web/scripts/_ob249_gate0_probe.ts`, read-only):
- `structural_fingerprints`: **108 `granularity='atom'` rows** across 6 tenants, `algorithm_version=2`, populated `column_roles` + `atom_features` (sample: role=`identifier`, identifies=`transaction`, match_count=13, conf=0.9286, atom_features buckets).
- `classification_signals`: **2,961 rows, 28 distinct `signal_type`** (open vocabulary; incl. `comprehension:atom_recognition`, `comprehension:atom_write_failed`).
- `committed_data`: **340,232 rows**.
→ All three predicates satisfied. `gate0Met = true`.

### §B2 — Schema Verification Gate (FP-49) — live columns pasted
- `committed_data`: `id, tenant_id, import_batch_id, entity_id, period_id, data_type, row_data(jsonb), metadata(jsonb), created_at, source_date`. One row = one sheet row; `row_data = {...rawRow, _sheetName, _rowIndex}` keyed by raw headers; semantics in `metadata`. `tenant_id`/`import_batch_id` REFERENCE with CASCADE/SET NULL. **Sole live writer = `commitContentUnit`** (legacy `api/import/commit` has ZERO in-repo callers — verified dead, scoped out as pre-membrane).
- `classification_signals` (24 live cols): `…, signal_value, confidence, source, context, structural_fingerprint, classification, decision_source, scope, …`. Written via the one canonical writer.
- `structural_fingerprints`: `…, column_roles, confidence, match_count, granularity, algorithm_version, scope, atom_features`.
- `file_objects` (membrane, unchanged): `…, state, scan_verdict, …` (states: `promoted`, `infected_held`).
→ **No DDL change required.** Provenance lives in `committed_data.metadata` (open JSONB, written as a nested object); remediation memory lives in `classification_signals` (open `signal_type`).

---

## §4 — Proof gates (pasted evidence)

Two harnesses, run against the REAL substrate on the `origin/main` base:
- `web/scripts/_ob249_e2e_proof.ts` — drives the REAL `commitContentUnit` + REAL `classification_signals` round-trip on a synthesized semantic-variant sheet (sandbox tenant Test#A1; pre/post self-cleanup of only its own artifacts). LLM express = injected deterministic double so the proof is reproducible offline; a best-effort LIVE Anthropic probe confirms the real path.
- `web/scripts/_ob249_casadiaz_realdata.ts` — READ-ONLY on real Casa Diaz production data (Casa Diaz `committed_data` not modified).

### P1 — End-to-end remediation — PASS
Input `Producto` distinct: `"Coca-Cola 600ml"×6, "Coke 600"×3, "CocaCola .6L"×2, "Pepsi 600ml"×4, "Pepsi-Cola 600"×2, "Agua Cielo 1L"×3`.
```
committed Producto distinct (CANONICAL): ["Coca-Cola 600ml","Pepsi 600ml","Agua Cielo 1L"]
commit result: success=true inserted=20 entity_id_field=Codigo
```

### P2 — Construction is deterministic (no LLM text committed) — PASS
The applying path is `normalizer.ts construct()` — pure, no LLM. The committed canonical is selected by `chooseCanonical` from OBSERVED values and asserted observed:
```
P1/P4 sample CHANGED row:
  row_data.Producto (committed CANONICAL) = "Coca-Cola 600ml"
  metadata.remediation.changes.Producto   = {"agent":"normalizer","basis":"llm","original":"Coke 600","canonical":"Coca-Cola 600ml"}
  canonical ∈ observed input values? true  (no fabricated value committed)
```
The proposal carries only `groups[].variants` (no `canonical` field — verified by unit test: `'canonical' in group === false`).

### P3 — Korean Test — PASS
`identify()` has **zero** string literals; `structuralKey` uses only NFKC + Unicode-escape punctuation (no `\p`/`/u` per repo target) + technical literals; exclusion uses regexes over the platform's OWN nature/role vocabulary (the existing `IDENTIFIER_NATURE` predicate), never field names. Unit test proves identify selects a **Korean** variant column (`서울특별시`/`서울특별시 `) with no literals.

### P4 — Provenance retained — PASS
`metadata.remediation.changes.<col> = {original, canonical, basis, agent}` on every changed cell; `row_data` holds the canonical. Casa Diaz real-data: `every canonical is an OBSERVED value (no fabrication, I3): true`.

### P5 — Signal write + read — PASS
```
remediation signals written: {"remediation:stage_run":1,"remediation:normalization":2}
remediation:normalization (Producto) — source=remediation decision_source=normalizer scope=tenant
   structural_fingerprint={"fingerprintHash":"9cf3b142…85a"}
   signal_value.proposal.groups=[{"basis":"llm","variants":["Coca-Cola 600ml","Coke 600","CocaCola .6L"]},
                                  {"basis":"llm","variants":["Pepsi 600ml","Pepsi-Cola 600"]}]
```
Read path (`readPriorNormalizationSignals`, `remediation-signals.ts`) is consulted before expressing (proven by P6).

### P6 — Progressive Performance — PASS (real round-trip)
```
run-1 expresser calls (cold): 2
run-2 expresser calls (warm): 0  → ZERO LLM (read prior signal) ✓
run-2 produced new expressions to persist: false (everything already cached)
```
Second run reads the actual `classification_signals` rows written by run 1 (real DB round-trip, not a stub).

### P7 — Rendered remediation — component + data provided (architect verifies screenshot, SR-44)
`RemediationReview.tsx` + `GET /api/remediation/review` (built ✓). Renders per-column `before → after`, basis (structural vs LLM-expressed), affected-row counts; on a clean import it confirms the stage ran with no changes (visualizing no-bypass). Live LLM probe in the harness: `LIVE Anthropic call SUCCEEDED → {"groups":[["Coca-Cola 600ml","Coke 600"],["Pepsi 600"]]}`.

### P8 — Mandatory placement (clean cannot bypass) — PASS
```
P8: every committed row carries metadata.remediation._stageRan=true → true
P8 clean (unchanged) row STILL stamped: _stageRan=true, has-changes=false (clean data cannot bypass)
remediation:stage_run present (P8 per-unit marker): true
```
`commitContentUnit` (sole live writer) runs `runRemediationConstruct` unconditionally; the stage stamps every row and emits a per-unit signal — query-provable, not asserted.

### Real-data corroboration (Casa Diaz, READ-ONLY, live LLM)
The live LLM expressed genuine production variance on the non-key `Nombre` column (entity key is `No.`, excluded): status suffixes (`"…JESUS ALBERTO BAJA"→"…JESUS ALBERTO"`, `"LOPEZ TEOFILO Jubilación"→"LOPEZ TEOFILO"`), accent variants (`"LÓPEZ"→"LOPEZ"`), and whitespace padding (structural). `every canonical is an OBSERVED value: true`.

---

## §C — Anti-Pattern Registry (§6A) — PASS
- **No registry / set-membership validation** — exclusion validates structural NATURE via regex over open vocabulary; the agent list is a plugin array, not an allowed-value set.
- **No destructive narrowing** — original retained in `metadata.remediation` (I3).
- **No private signal channel** — one canonical surface, distinguished by `source`/`signal_type`.
- **No "LLM chose/applied"** — express (proposal) and construct (deterministic apply) are separate, inspectable functions.
- **No field-name string matching** — P3 grep clean.
- **No parallel comprehension engine** — reads `field_identities`/`semantic_roles`/prior signals; builds nothing new.
- **No horizontal build** — one agent (Normalizer); agents 2–N are out of scope (a fixture-only 2nd agent appears solely in a unit test to prove I8).
- **No cold-start-every-time** — read-before-express + negative cache → P6 zero LLM.
- **No bypass** — `commitContentUnit` is the sole live writer; stage runs unconditionally.

---

## §D — Build / test / dev
- `npx tsc --noEmit`: clean for OB-249 (the one remaining error is pre-existing in `hf350-hc-column-batching.test.ts`, untouched by this slice).
- `node --test` (remediation suite): **21/21 pass** (P2, P3, P6, I8, exclusion, degrade-not-throw).
- `rm -rf .next && npm run build`: **success** (`/api/remediation/review` compiled; BUILD_ID present).
- `npm run dev`: `localhost:3000 → HTTP 307` (up).

---

## §E — Files
**New** (`web/src/lib/remediation/`): `text-normalization.ts`, `remediation-types.ts`, `remediation-signals.ts`, `remediation-stage.ts`, `remediation-agents.ts`, `agents/normalizer.ts`, `__tests__/{text-normalization,normalizer,remediation-stage}.test.ts`; `web/src/app/api/remediation/review/route.ts`; `web/src/components/remediation/RemediationReview.tsx`; proof scripts `web/scripts/_ob249_{gate0_probe,e2e_proof,casadiaz_realdata}.ts`.
**Edited** (extensions only): `web/src/lib/sci/commit-content-unit.ts` (construct hook + provenance + stage-run), `web/src/app/api/import/sci/process-job/route.ts` (express hook), `web/src/app/operate/import/page.tsx` (P7 wire-in).

## §G — Post-build adversarial code review (5-agent, find→verify) — fixes applied
A 3-lens review of the BUILT code + adversarial verification of each blocker/major confirmed **2 real issues + 1 minor**, all fixed and re-verified (23/23 tests, tsc clean, e2e green, build clean):

1. **BLOCKER — express could strand a job in `'classifying'`.** The express ran (LLM, unbounded, sequential) BEFORE the `status:'classified'` write; a wide first import × intermittent Anthropic could exceed `maxDuration=300` → SIGKILL before the status write → job stuck forever. **Fix:** persist `status:'classified'` FIRST; run express AFTER, before the response, **bounded** by a 90s wall-clock budget (degrade remaining units to identity, re-expressed next import) + the live expresser capped to `retries:2`. A timeout can now only lose remediation signals for one import, never strand it; CONSTRUCT re-reads whatever was expressed. (`process-job/route.ts`, `normalizer.ts`.)
2. **MAJOR — P8 enforced at one writer only.** The legacy `/api/import/commit` (product-orphaned, auth-only) + the dead `data-service` helper insert `committed_data` without the stage. **Fix:** a build-time guard test (`__tests__/p8-sole-writer.test.ts`) asserts the SCI pipeline's sole committed_data writer is `commitContentUnit` and fails on ANY new writer; the 2 pre-existing non-SCI writers are documented + flagged for the architect to 410/route-through (OB-249 does not modify routes it did not author — out of scope). The over-claim in the `commitContentUnit` comment was softened to "the membrane/SCI path writer."
3. **MINOR — construct keyed proposals newest-per-column.** Could *miss* an older value-set's grouping (never a wrong/fabricated value — construct's observed-filter guaranteed safety). **Fix:** `parsePrior` now UNIONs groups per column across all signals and collects every prior fingerprint (better cross-import recall), construct's observed-filter keeps stale groups safe.

## §F — SR-39 note
Touches data persistence + the signal surface. `GET /api/remediation/review` is session-tenant-bound via `resolveCallerTenant` (no cross-tenant read; platform roles may target a requested tenant, everyone else pinned) — consistent with SOC 2 CC6 / DS-014. No new access-control or storage-policy surface introduced.
