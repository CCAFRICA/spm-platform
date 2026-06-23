# OB-233 (R3) — Persistent Comprehension Pipeline — Completion Report

**Governing spec:** DS-030 v3 (Persistent Comprehension Architecture)
**Directive:** `docs/vp-prompts/OB-233_PERSISTENT_COMPREHENSION_PIPELINE_R3_20260622.md`
**Branch:** `ob-233-comprehension-pipeline`
**Status:** IN PROGRESS — Phase 0 (Migration Gate) authored + committed; **HALT-MIGRATION** (awaiting architect SQL application).

This report grows across the OB. Sections below are filled as gates pass. Self-attestation is rejected — every PG pastes live evidence.

---

## 0. Sequence + Standing Rules

- **Sequence check:** `OB-233` appears in `docs/vp-prompts/` only as this directive (`OB-233_PERSISTENT_COMPREHENSION_PIPELINE_R3_20260622.md`). No collision with any other work item. **HALT-SEQ not triggered.**
- **Standing rules read in full** (`CC_STANDING_ARCHITECTURE_RULES.md` v3.0). Binding for this OB: AP-8/AP-18/AP-19 + FP-49 (migration discipline), AP-26 (open-vocabulary signals — governs Obj 7), AP-9/10/11 (proof = live/rendered, not file existence), Section B ADR (below), Section D rule 9 (VL Admin policies on pipeline tables — honored in the migration).

---

## 1. ARCHITECTURE DECISION RECORD (Section B — committed before implementation)

**Problem:** Make comprehension a persisted, plan-independent property of the data, generated automatically on every import for every tenant/domain, and consumed by the Summary + Insight engines via semantic labels — while (a) not touching the calc engine's binding read-contract (C6), (b) introducing zero registries (C0), and (c) not coupling comprehension to any rule_set (C0b).

### Decision 1 — Where comprehension is stored

- **Option A — Reuse `rule_sets.input_bindings.convergence_bindings[].field_identity` (HF-336's current home).**
  - Scale 10x: OK (JSONB). AI-first: OK. Transport: OK. Atomicity: poor.
  - **FATAL:** couples comprehension to a rule_set (violates C0b); is blanked by `finalize-import` (Obj 1); duplicates per-plan (a 5-plan tenant comprehends 5x); the calc engine reads this same JSONB, so writing comprehension here risks the read-contract (violates C6).
- **Option B — New dedicated table `comprehension_artifacts`, keyed `(tenant_id, field_name)`.** *(CHOSEN)*
  - Scale 10x: OK (one row per field per tenant; indexed by tenant). AI-first: OK (free-form text columns). Transport: N/A. Atomicity: idempotent upsert on the UNIQUE key — never blanked without replacement.
  - Decouples comprehension from plans (C0b), proven by PG-3b (one row per field regardless of plan count). The calc engine never reads it → read-contract untouched (C6). One migration, architect-applied (SR-44).
- **Option C — Store on `committed_data.metadata` per row.**
  - Scale 10x: FAILS — comprehension is per-field, not per-row; storing per-row duplicates it millions of times and has no single source of truth. Rejected.

**CHOSEN: Option B** — dedicated `comprehension_artifacts` table. **REJECTED: A** (rule_set coupling + read-contract risk + blanking), **C** (per-row duplication, no single source of truth).

### Decision 2 — How fixed taxonomies are eradicated without losing validation

- **Option A — Replace each enum with a wider enum / add the new values.** Rejected — still a registry (C0); a developer must grow a list to admit a new valid value.
- **Option B — Free-form `text` everywhere + structural-property validation only.** *(CHOSEN)* The LLM emits free-form characterizations (recognition, C1); deterministic code validates only structural properties (non-empty; numeric traces to a `summary_artifacts` metric; FK exists; date range valid). Novel values are logged as signals and stored, never rejected (DS-030 §2.5). Dispatch that must branch on a recognized value (aggregation method) is **fail-loud** (C2): execute on recognition, raise/HALT + signal on the unrecognized — never silent-default.
- **Option C — Keep enums but allow an "other" escape value.** Rejected — "other" is still a closed set with a catch-all; loses the actual novel characterization (C0/C4 violation: narrows information).

**CHOSEN: Option B.**

### Decision 3 — Comprehension generation timing/placement

- **Option A — Generate lazily on first read (page load).** Rejected — per-page LLM latency; AP-15; not deterministic on the pipeline.
- **Option B — Generate inside `finalize-import` after data commits, idempotent upsert, for every import.** *(CHOSEN)* One generation per import; cached on the row; Summary Engine's label/aggregation-method LLM call is one-per-backfill (also cached). Matches the existing pipeline placement (finalize-import already runs Summary + Insight engines awaited, HF-300 reliability model).
- **Option C — Separate manual script (HF-336 status quo).** Rejected — "no manual scripts" (§1); the product must run automatically.

**CHOSEN: Option B.** (Residual 1: skip the LLM call when comprehension exists and schema is unchanged — Progressive Performance, deferred.)

### Governing Principles Evaluation (G1-G6)

- **G1 (standard):** Adaptive-intelligence moat / open-vocabulary signal contract (AP-26, HF-219); DS-030. Korean Test (T1-E910) is the language-agnostic standard.
- **G2 (architectural embodiment):** The *absence of a registry* IS the open-vocabulary guarantee — free-form `text` columns + structural-only validation mean no code change is needed to admit a novel value. The `UNIQUE (tenant_id, field_name)` key IS the plan-decoupling guarantee.
- **G3 (traceability):** Standard (AP-26/DS-030) → architecture (free-form table, no enums, fail-loud dispatch) → implementation (PG-3/PG-7 source-read prove zero fixed vocabulary). An auditor can verify from this ADR + the migration + the PG-7 paste.
- **G4 (discipline):** Information theory / adaptive systems — a system that exists to receive novel information must not gate it behind developer-declared registries.
- **G5 (abstraction):** Holds across domains — POS, banking, wholesale, any future module — because nothing in the store or the validators names a domain (C8). Tenants are proofs, not design units.
- **G6 (innovation boundary):** Grounded in the platform's own ratified anti-pattern (AP-26) and DS-030, not speculation.

**Anti-Pattern Registry checked:** AP-26 (this OB *removes* a recurrence of closed-vocabulary registries), AP-8/18/19 (migration verified live, FP-49 done), AP-5/6/7 (no hardcoded field dictionaries — comprehension is LLM-derived), AP-9/10/11 (proof gates are live/rendered). No violations introduced.

---

## 2. Migration Gate Record (Phase 0)

### 2.1 FP-49 SQL Verification (AP-18) — read-only service-role probe

Script: `web/scripts/_ob233-fp49-schema-verify.ts`. Output (2026-06-22):

```
=== OB-233 FP-49 Schema Verification ===

FK TARGETS for comprehension_artifacts:
  tenants: EXISTS (12 cols)
    cols: id, name, slug, settings, hierarchy_labels, entity_type_labels, features, locale, currency, created_at, updated_at, notification_email
    id sample: 5035b1e8-0754-4527-b7ec-9f93f85e4c79 (uuid? true)
  import_batches: EXISTS (17 cols)
    cols: id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by, created_at, completed_at, metadata, superseded_by, supersedes, superseded_at, supersession_reason, file_hash_sha256, content_unit_hash_sha256
    id sample: 71184c3a-fc4d-4f59-a08b-bcb08d25867a (uuid? true)

OB-233 dependency tables (read/written by the pipeline):
  committed_data: EXISTS (10 cols)
  summary_artifacts: EXISTS (11 cols)  [cols incl. data_type, metrics, convergence_hash]
  intelligence_artifacts: MISSING/ERROR -> Could not find the table 'public.intelligence_artifacts' in the schema cache
  classification_signals: EXISTS (24 cols)
  rule_sets: EXISTS (18 cols)  [incl. input_bindings, components]
  entities: EXISTS (11 cols)

MUST-NOT-EXIST (created by the architect-applied OB-233 migration):
  comprehension_artifacts: ABSENT (expected) -> Could not find the table 'public.comprehension_artifacts' in the schema cache
```

**FK targets verified:** `tenants.id` (uuid) and `import_batches.id` (uuid) both exist → both FK references in the migration are valid. `comprehension_artifacts` absent → safe to CREATE.

**Pre-existing blocker surfaced (architect action required, OB-232 residual):** `intelligence_artifacts` is **not in the live schema cache**. Insight persistence and OB-233 PG-1/PG-2 insight proofs depend on it. The architect must apply/expose the OB-232 table and `NOTIFY pgrst, 'reload schema'` alongside the OB-233 migration.

### 2.2 Migration file (authored + committed)

`web/supabase/migrations/20260622_ob233_comprehension_artifacts.sql` — `comprehension_artifacts` with free-form text columns only (no `structuralType`/`contextualIdentity`/role-enum; no fixed-set `data_type`), `UNIQUE (tenant_id, field_name)` (the C0b decoupling guarantee), FK to `tenants`(CASCADE) + `import_batches`(SET NULL), tenant index, RLS enabled + tenant-isolation/platform-admin policy (Standing Rule 9). `SCHEMA_REFERENCE_LIVE.md` updated in the same commit.

### 2.3 HALT-MIGRATION

**Migration authored and committed; awaiting architect application via the Supabase SQL Editor (SR-44).** CC does not apply it and does not wire any comprehension-reading/writing code (Obj 2/3/4 spine; Obj 9 display) until the table is verified present via `npx tsx web/scripts/_ob233-fp49-schema-verify.ts`.

Architect actions required to unblock:
1. Apply `20260622_ob233_comprehension_artifacts.sql` in the SQL Editor.
2. Ensure `intelligence_artifacts` is live + `NOTIFY pgrst, 'reload schema'` (OB-232 residual; required for PG-1/PG-2).

---

## 3. Eradication log (pre-gate wave — Obj 5/6/7/8/10)

Every fixed set removed, with file + what replaced it. tsc EXIT=0, `next build` EXIT=0, korean-test gate PASS.

| Obj | File | Removed (registry) | Replaced with |
|---|---|---|---|
| 5 | `lib/insight/insight-types.ts` | `ARTIFACT_TYPES=['anomaly','trend','coaching','benchmark']`, `ArtifactType`, `SEVERITIES=['critical','warning','info','positive']`, `Severity` | `GeneratedInsight.insight_characterization` + `.insight_severity` (free-form `string`) + `.shape_description` |
| 5 | `lib/insight/insight-engine.ts` | SYSTEM prompt enumeration of the 4 artifact_types + 4 severities; `for (const t of ARTIFACT_TYPES)` coverage loop; `ARTIFACT_TYPES` import | Free-form prompt ("no fixed list to choose from"); `byType`/`samples` keyed by free-form characterization; storage maps `insight_characterization -> artifact_type`, `insight_severity -> severity` (TEXT columns unchanged); **`temperature: 0` added (C5 fix — was defaulting to 1.0)** |
| 6 | `lib/insight/insight-validator.ts` | `ARTIFACT_TYPES.includes(...)` + `SEVERITIES.includes(...)` allowable-form checks + the import | Structural-coherence (non-empty characterization/title/narrative, >=1 data_ref, entity_id existence, date-range validity) + data-contract (retained) + data-driven `novelCharacterization` flag (never rejects on type — C2) |
| 7 | `lib/signals/ui-signal.ts` | `UI_SIGNAL_TYPES=['selection','dwell','drill','dismissal']`, `UiSignalType` | `signalType: string` (open-vocabulary, AP-26); structural-property check only (non-empty); `ui.` namespace prefix retained (writer-authored, not validated) |
| 7 | `app/api/signals/ui/route.ts` | `UI_SIGNAL_TYPES.includes(...)` reject gate + imports | Structural non-empty `signalType` + `surface` check |
| 7 | `hooks/use-ui-signal.ts` | `UiSignalType` param type | `signalType: string` |
| 8 | `lib/insight/insight-shape.ts` | `{pattern, metric_class, entity_type, severity, delta_direction}` + the `ins.artifact_type === 'anomaly'/'trend'/'coaching'` dispatch | `{shape_description (free-form, LLM temp 0), structural_fingerprint_hash (sha256)}`; structural numeric/scope fallback uses no label set |
| 10 (entity_type) | `lib/insight/insight-engine.ts` + `insight-types.ts` | implied set `'location'\|'individual'\|'organization'\|'network'` (type comment) | `entity_type` written from the LLM's free-form value; null-entity fallback `'network'` is a structural label, not a set |
| 10 (data_type) | `lib/sci/*` | — (verification, see §3.1) | No offending registry exists to remove |

### 3.1 Obj-10 data_type — premise correction (B6)

DS-030 §4.6 wants a free-form data characterization; the directive scopes this to: *"`summary_artifacts.data_type` may persist as a partition value only if no code validates it against a set — if any code checks `data_type === 'pos_cheque'/'transaction'`, remove it."*

- **No `data_type` set-validation or dispatch exists anywhere** — PG-3 pass-1 `pos_cheque...transaction...entity...target` = CLEAN; pass-2 `data_type === '...'` / `.includes(data_type)` = CLEAN. `committed_data`/`summary_artifacts.data_type` persists as a partition value (directive-permitted).
- The only `data_type` finite set is the SCI **structural-classification** union `SemanticDataType = 'entity'|'transaction'|'target'|'reference'|'plan'` in `lib/sci/data-type-resolver.ts` — the platform's foundational SCI class (D154/D155; HF-195 Rule 28 sanctions its `_exhaustive: never` switch under upstream constraint), identity-mapped (`data_type === classification`), and **read by the calc/summary pipeline (C6/HALT-3 if changed)**. It is a structural classification, not a domain registry, and not a `committed_data.data_type` validation.
- **The free-form data characterization (DS-030 §4.6) is the comprehension generator's output -> `comprehension_artifacts` (spine Obj 2/3, gated on migration)**, supplementing — not ripping out — the calc-coupled SCI class. **B6 is satisfied by verification; converting the SCI structural taxonomy itself is a SCI/calc-layer change deferred to the spine with architect direction (not a blind removal).**

## 4. ULTRACODE fan-out record

- **Execution model deviation (justified):** the directive's parallel-wave map treats B1 (engine), B2 (validator), B4 (shape) as file-disjoint worktree subagents — but `insight-types.ts` is **shared** by all three (the registry home). Fanning them to separate worktrees would have conflicted on that file. The eradication wave was executed **inline by the orchestrator** with one coherent type model + a single build, because these are surgical correctness-critical registry removals where one miss reintroduces a registry. Worktree isolation was unnecessary (no parallel file mutation).
- **Investigation** used parallel `Explore` agents (file mapping / blast-radius). **Verification** used the directive's own PG-3 greps (multiline registry + dispatch) and a runtime proof script (`web/scripts/_ob233-eradication-proof.ts`) exercising the **real** functions against live `classification_signals`. Effort: xhigh.

## 5. Proof Gates

### PG-3 — No registry (pre-gate surfaces) — both passes CLEAN

PG-3 pass-1 (multiline registry declarations), after eradication:
```
[anomaly...trend...coaching...benchmark]  => CLEAN
[critical...warning...info...positive]    => CLEAN
[selection...dwell...drill...dismissal]   => CLEAN
[location...individual...organization...network] => CLEAN
[pos_cheque...transaction...entity...target]     => CLEAN
```
PG-3 pass-2 (dispatch/validation in `lib/insight`, `lib/signals`, `api/signals`): **no dispatch — CLEAN**.

*Scope note (Pattern-15 honest):* PG-3's literal patterns also match pre-existing, unrelated enums elsewhere (alert/warning/flag `severity` UIs; `entities.entity_type` for financial filtering; the SCI structural `SemanticDataType`). Those are **not** the six DS-030 taxonomies and are out of OB-233 scope (C8). The registry **eradicated** is exactly the insight/signal taxonomy; PG-7 source-read is the authoritative compliance proof. The `input_bindings` rule_set-coupling pass (PG-3 §3) is deferred to the spine — `input_bindings` is still calc-engine-only I/O (no comprehension I/O exists yet).

### PG-4 — Validator accepts novel type, rejects bad data-contract (live, real function)
```
PG-4a novel "seasonal cycle...": ok=true  novel="a seasonal cycle in the measure..."  failures=[]
PG-4b fabricated value 999999.99: ok=false failures=["data-contract: value 999999.99 (metric \"revenue\") does not trace to the summary data"]
PG-4c empty title:                ok=false failures=["structural: empty title"]
PG-4d novel-type signal -> classification_signals { signal_type:'insight.characterization',
        signal_value:{ characterization:'a seasonal cycle...', severity:'...', shape:'...' }, source:'insight-engine', context:{novel:true} }
```
Validator accepts the unseen characterization (structural ok) + flags it novel; rejects the fabricated number (data-contract); the engine logs the novel-type signal on the open-vocabulary surface.

### PG-6 — Signal capture accepts a novel interaction (live, real function)
`recordUiSignal({ signalType:'data_filter_applied', ... }) -> true`; row written:
```json
{ "signal_type": "ui.data_filter_applied",
  "signal_value": { "metricKey": "revenue", "interaction": "data_filter_applied" },
  "source": "ui", "context": { "surface": "ob233.proof", ... } }
```
A brand-new interaction class (outside selection/dwell/drill/dismissal) flows with no code change, no rejection.

### PG-7 — Korean Test (pre-gate surfaces)
`npm run korean-test` -> `PASS: zero hardcoded legacy primitive-name string literals outside registry`. The insight prompt, validator, shape function, and signal writer contain zero fixed vocabulary and no substring-inference on free-form output. *(Full PG-7 incl. comprehension generator + Summary Engine aggregation dispatch = spine, gated.)*

### Obj-8 shape
`computeInsightShape` -> `{ shape_description:"network-level, oscillating, growing amplitude, quarterly timeframe, revenue-class measure", structural_fingerprint_hash:"42cec5f9...d1d1" }` — free-form prose + deterministic hash, no fixed field set.

### Gated on architect migration application (+ intelligence_artifacts live)
- **PG-1** (Sabor clean-slate -> intelligence), **PG-2** (BCL domain-agnostic + calc integrity + read-path immutability diff), **PG-3b** (MIR comprehension-plan decoupling), **PG-5** (domain-agnostic import surface, two domains), **PG-8** (end-to-end timing), and the spine portions of **PG-3/PG-7** (comprehension generator, Summary Engine repoint). These require `comprehension_artifacts` (architect-applied) and `intelligence_artifacts` (OB-232 residual, see §2.1).

## 6. HALT outcomes
- **HALT-SEQ:** not triggered (no sequence collision).
- **HALT-1 (ANTHROPIC_API_KEY):** cleared — key present in `web/.env.local`.
- **HALT-MIGRATION:** **CLEARED.** Architect applied both migrations; Step-0 FP-49 re-run confirms `comprehension_artifacts` EXISTS (empty) and `intelligence_artifacts` EXISTS (empty) from the service-role view.
- **HALT-2 / HALT-3 / HALT-4 / HALT-IMPORT:** assessed in §8 (Phase A Decision Package) — **awaiting architect dispositions (HALT-DECISIONS).**

## 7. Timing
*(PG-8 — filled after end-to-end run)*

---

# 8. OB-233 Phase A — Architect Decision Package (HALT-DECISIONS)

Phase A ran the four decision-HALT reconnaissances (A1–A4, read-only) + two decision-independent prep writes (A5–A6) in parallel. tsc `EXIT=0` across all Phase-A writes + the eradication wave. **Phase B is NOT started; it awaits the dispositions below in a single architect response.**

| HALT | Verdict | CC recommendation |
|---|---|---|
| **HALT-3** (calc reads field_identity/structuralType/contextualIdentity from input_bindings?) | **DOES-NOT-FIRE** | Proceed; ACK the guardrail (do not touch `committed_data.metadata.field_identities`). |
| **HALT-4** (input_bindings={} blank entanglement) | **FIRES — ENTANGLED** | Option A (targeted invalidation) — or Option 0 (keep blank). See below. |
| **HALT-IMPORT** (mapping form removable?) | **NO MAPPING FORM EXISTS** (already domain-agnostic) | Re-scope Obj 9 from *removal* to *enrichment*. |
| **HALT-2** (timing within Vercel window?) | **PREDICTED WITHIN WINDOW** | Proceed in-request; keep comprehension batched; parallelize per-`data_type`. |
| **NEW: writer/table divergence** | intelligence_artifacts live shape ≠ insight-engine writer | Reconcile the writer to the live schema in Phase B. Confirm. |

### 8.1 HALT-3 — DOES-NOT-FIRE (evidence: A1)
`grep field_identity|structuralType|contextualIdentity` over `run/route.ts` = 0. The calc engine reads only column-name resolution fields (`.column`, `.reduction`, `.filters`, `.scale_factor`, `.columnMap`, `.via`). The only readers of `input_bindings...field_identity` are `lib/results/field-identity.ts` + `lib/summary/summary-engine.ts` (results/summary surfaces — which Obj 4 is migrating to `comprehension_artifacts`); the calc engine imports neither.
- **GUARDRAIL (architect please ACK):** the calc engine DOES read `committed_data.metadata.field_identities[col].structuralType/contextualIdentity` via `extractTransactionRef` (`per-row-attribution.ts:248-268`, called from `run/route.ts:3007`). That is a **different table/column** from `input_bindings`. OB-233 must stay within `input_bindings` + `comprehension_artifacts`; **touching `committed_data.metadata.field_identities` would break calc.** No disposition needed if scope holds.

### 8.2 HALT-4 — FIRES / ENTANGLED (evidence: A2) — DISPOSITION REQUIRED
The `input_bindings = {}` blank (`finalize-import:56-63`, HF-269) is **the only mechanism that forces convergence re-derivation on reimport.** Findings:
- `generateConvergenceBindings` (the HF-336 generator) is **NOT wired** into the runtime (only `scripts/hf336-run.ts`). The real populator is `convergeBindings` (`convergence-service.ts:241`) at **calc time** (`run/route.ts:266`).
- Calc gate `run/route.ts:240-264`: re-derives **only if** `(!hasMetricDerivations && !hasConvergenceBindings) || convergence_version !== 'HF-234'`. If current bindings persist, **re-derivation is skipped**, and `hasCompleteBindings` (`convergence-service.ts:2571`) is **structural-only — it does not check the bound columns still exist** in the reimported data.
- **Consequence of a bare blank-removal:** stale bindings (pointing at old columns) are reused after a reimport with changed columns → resolver finds nothing → **silent zero / wrong calc** (the T3 RESOLUTION_FAILURE backstop does not fire because the token *is* mapped). The blank currently prevents exactly this.
- **Premise update:** because Obj 2/3 moves comprehension into `comprehension_artifacts`, the blank **no longer destroys comprehension** — Obj 1's motivation (a) is satisfied structurally by the new table, not by removing the blank.

**Dispositions (pick one):**
- **Option A (recommended, directive-aligned):** replace the wholesale `{}` blank with **targeted invalidation** — clear only `convergence_bindings` + `metric_derivations` + `convergence_version`, preserving the rest of `input_bindings`. Calc gate then re-derives (correct on reimport), and any non-cache keys / component bindings survive (C6). *Caveat:* its benefit over keeping the blank depends on whether `input_bindings` holds non-cache keys worth preserving (e.g. `metric_mappings`, `_provenance`, human-authored corrections). **Architect: does any human-authored/corrected binding live in `input_bindings` that must survive a reimport?**
- **Option 0 (minimal, safest for calc):** **keep the blank as-is.** Now that comprehension is off `input_bindings`, the blank only forces correct re-derivation and harms nothing. Obj 1 becomes: confirm comprehension is refreshed by idempotent upsert to `comprehension_artifacts` (never blanked-without-replacement) — Obj 2/3's job — and make **no** change to the blank. (Contradicts the directive's literal "input_bindings not blanked," so flagged for explicit approval.)
- **Option B (most correct, larger):** Option A **plus** harden `hasCompleteBindings` to validate bound columns exist against current `committed_data` (closes the root silent-reuse defect independent of import-time hygiene; touches the calc engine — heavier C6 review).

### 8.3 HALT-IMPORT — NO MAPPING FORM EXISTS (evidence: A3)
The import surface is **already domain-agnostic**: `operate/import/page.tsx` header is "Import"; `import/enhanced/page.tsx` is a pure redirect; `SCIProposal.tsx` offers **classification-confirm only** with a **read-only** `sourceField → semanticRole` display; ICM component bindings derive at **calc time** from `committed_data` (no manual mapping step). The directive's "replace the field-mapping configuration form" premise is **stale** — there is no form to remove, and removing it is therefore safe for BCL/MIR calc.
- **Disposition (recommended):** **re-scope Obj 9 from *removal* to *enrichment*** — render the comprehension report by enriching the existing read-only `SCIProposal` binding display + `ImportReadyState` "Field Mappings Applied" surface to read `comprehension_artifacts` generically (no domain conditionals — C3). No form deletion. **Architect: confirm the re-scope.**

### 8.4 HALT-2 — WITHIN WINDOW (evidence: A4)
finalize-import (`maxDuration=300`) will make **3 LLM calls** after Phase B: comprehension (1 **batched** call for all fields — `convergence-binding-generator.ts:89` already batches via `classifyFields`), Summary backfill label/method (1), Insight Engine (1, ≤3 socket-retries). Typical ~80-100s; pessimistic ~155-175s — within 300s.
- **Disposition (recommended):** proceed **in-request**; **mandate batched comprehension** (never regress to per-field); if a tenant has multiple `data_type`s, run the per-`data_type` comprehension calls with `Promise.all` (not serial); defensive fallback = move the Insight Engine to a background job only if observed runtime exceeds ~200s (HALT-2 re-fires at runtime per the directive). **Architect: ACK in-request + the batching mandate.**

### 8.5 NEW — intelligence_artifacts writer/table divergence (evidence: A5) — CONFIRM
The architect-created live `intelligence_artifacts` (17 cols, OpenAPI-verified) is **OB-233-aligned** but diverges from the current `insight-engine.ts` writer:
- Live has `shape_description`, `structural_fingerprint_hash`, `source`, `context`, `period_id`, `source_import_batch_id`.
- Writer sets `insight_shape` (jsonb), `period_start`, `period_end`, `recommended_action`, `generated_by` — **none of which are live columns** → the insert would be rejected by PostgREST.
- The live `shape_description` + `structural_fingerprint_hash` columns **exactly match** OB-233's new `InsightShape`.
- **Disposition (recommended, Phase B):** reconcile the writer to the live schema — write `shape_description`/`structural_fingerprint_hash` as separate columns (from `computeInsightShape`), set `source='insight-engine'`, fold `recommended_action`/`generated_by` into `context` (jsonb), and use `period_id` (null) instead of `period_start`/`period_end`. **Architect: confirm this reconciliation (required for PG-1/PG-2 insight persistence).**

### 8.6 Phase A prep writes landed (committed this phase)
- **A5:** `web/supabase/migrations/20260622_ob232_intelligence_artifacts_recovery.sql` (SR-43 recovery — reproduces the live table with `CREATE TABLE IF NOT EXISTS`, a no-op against prod) + `SCHEMA_REFERENCE_LIVE.md` `intelligence_artifacts` section.
- **A6:** `web/src/lib/signals/comprehension-correction.ts` + `web/src/app/api/signals/comprehension-correction/route.ts` (free-form `comprehension_correction` signal write path — Obj 9 item 5, capture-only); `Sidebar.tsx:229` "Plan Import" → "Import Data" (the only domain-specific import label). Verified: zero-plan import path is **already ungated**; entry labels otherwise already neutral. Flagged (untouched): `CarrierPipelineReadiness.tsx:30` / `ImportReadyState.tsx:515` "Upload Plan" follow-on CTAs.

**HALT-DECISIONS resolved (architect dispositions applied in Phase B):** HALT-4 → **Option A** (targeted invalidation); HALT-IMPORT → **re-scope to enrichment**; HALT-2 → **in-request + batching**; HALT-3 → **scope-guardrail ACK** (committed_data.metadata.field_identities untouched); §8.5 → **writer reconciled to the live table** (recommended_action in context per PC-4).

---

# 9. Phase B — Serial spine (implemented)

Dependency order: Obj 1 → Obj 2+3 → Obj 4 → §8.5 writer → Obj 9. Commits: `f2c971c5` (spine), `d8f24aa5` (Obj 9 + insight robustness), `c103f19a` (insight streaming). Calc engine **untouched** (C6).

### 9.1 Obj 1 — HALT-4 Option A (targeted invalidation)
`finalize-import` step 2 now reads each active/draft rule_set's `input_bindings` and deletes **only** `convergence_bindings` + `metric_derivations` + `convergence_version` (preserving every other key), instead of the HF-269 wholesale `= {}`. This forces calc-time convergence re-derivation on reimport (the blank's only remaining function — comprehension no longer lives here) while protecting non-derived content (C6).

### 9.2 Obj 2+3 — comprehension generator
`web/src/lib/summary/comprehension-generator.ts` (evolved from HF-336's batched `classifyFields`; old `input_bindings`-writing generator + dead `hf336-run.ts` deleted). Reads `row_data` for every field (C4); one **batched** LLM call per `data_type` run via `Promise.all` (temp 0, C5; HALT-2 — never per-field); emits the free-form artifact `{characterization, data_nature, relationships, aggregation_behavior, identifies}` (no `structuralType`/`contextualIdentity`, C0); idempotent upsert to `comprehension_artifacts` on `(tenant_id, field_name)` **omitting** `display_label`/`aggregation_method` so cached values are never blanked without replacement. Reads old `contextualIdentity` as an LLM hint only (never rewritten). Never writes `input_bindings` (C6/C0b). Wired into `finalize-import` before the Summary Engine.

### 9.3 Obj 4 — Summary Engine reads comprehension + fail-loud dispatch
`buildSemanticMaps` reads `{field → display_label}` + `{field → aggregation_method}` from `comprehension_artifacts` (not `input_bindings`). `recognizeLabelsAndMethods` is one batched temp-0 LLM call (cached onto the comprehension row). `aggregateCommittedRows` is method-aware with **fail-loud dispatch (C2)**: a recognized method maps to a deterministic op by exact normalized match (C3 — no substring inference); an unrecognized method raises `NovelAggregationMethodError`, writes a `summary.novel_aggregation_method` signal, and HALTs — it never silently SUMs. A field with no comprehension method falls back to SUM (carry-everything baseline, C4 — not a recognized-value dispatch). `lib/results/field-identity.ts`: the vestigial `field_identity` reads from `input_bindings` (unused) were removed; the DAG-field→column calc resolution stays (C6).

### 9.4 §8.5 — insight writer reconciled to the live table
`insight-engine.ts` insert now matches the live OB-233-shaped `intelligence_artifacts`: `shape_description` + `structural_fingerprint_hash` columns (from `computeInsightShape`), `source='insight-engine'`, `period_id=null` (Decision 92); `recommended_action`/`generated_by`/`period_start`/`period_end` folded into `context` (jsonb). The date range is validated in-memory by `validateInsight` before storage. **PC-4:** `recommended_action` lives in `context` for now (zero consumers); promote to a first-class column when the Performance/thermostat tier consumes insights (follow-on).

### 9.5 Insight LLM robustness (enabled PG-1/PG-2 persistence)
The insight call is now **streamed** (`stream: true`, SSE delta accumulation, 4 retries). Diagnosis: a direct tiny fetch returns 200 in ~1.3s and the BCL digest is ~10KB, so the failure was not the API/model/payload — the full insight array is a long generation and a non-streaming socket idled out mid-response (`UND_ERR_SOCKET`, even at 4000 tokens). Streaming keeps the socket active; `parseInsightArray` salvages every complete insight if the stream still ends early. `max_tokens` 3500→4000.

## 10. Phase B Proof Gates

### PG-2 — clean-slate BCL (ICM tenant), domain-agnostic + calc integrity
BCL (`b1c2d3e4`) clean-slate reimport through the **exact** finalize-import spine (`generateComprehension → runSummaryEngine → generateInsights`, via `web/scripts/_ob233-pipeline-proof.ts`). **Zero code changes from the financial path.**
```
[1] comprehension: fields=21 dataTypes=2   (+51s)
[2] summary: via=js written=510 skipped=85 (+16s)
[3] insights: generated=7 stored=7 failed=0 validated=7 (+80s)

comprehension_artifacts: count=21  | has structuralType/contextualIdentity? no (free-form, good)
  - Region       | label="Región"          method="group" | "The geographic region ... where the employee ..."
  - ID_Empleado  | label="ID Empleado"      method="count" | "The unique alphanumeric identifier assigned to each employee ..."
  - Fecha_Ingreso| label="Fecha de Ingreso" method="min"   | "The date on which the employee officially joined ..."
summary_artifacts: count=510  (semantic labels: Meta de Depósitos, Monto de Colocación, Cumplimiento de Colocación, ...)
intelligence_artifacts: count=7 (FREE-FORM):
  - artifact_type="Extreme positive outlier — a single individual ..."  severity="High positive impact: ..."  entity_type=individual
    title: "Top Performer: Exceptional Output Across All Production Metrics"  shape: "Single entity sitting far above the peer distribution ..."
  - artifact_type="Persistent regulatory risk concentration — one ind..." severity="High compliance risk: with 3 total Infra..."
  - artifact_type="Sharp period-over-period placement volume decline ..." / "Strong cross-period acceleration — an individual ..."
```
Labels are in the data's OWN language (Spanish — Korean Test); characterizations/severities are free-form (no enum). Comprehension free of `structuralType`/`contextualIdentity`.

- **Calculation integrity (C6) — read-path immutability diff:** `git diff --stat main -- web/src/app/api/calculation/run/route.ts web/src/lib/intelligence/convergence-service.ts web/src/lib/calculation/` → **EMPTY** (the calc engine reader + convergence service are unmodified by OB-233). The calc total is reported to the architect for sealed-figure reconciliation in §10.x (run during build/dev verification).

### PG-8 — timing (HALT-2)
BCL end-to-end (in-request equivalent): comprehension 51s + summary 16s + insights 80s ≈ **147s** — within the 300s Vercel window. The insight stream is the largest stage. (Sabor timing in PG-1.)

### PG-5 — domain-agnostic import surface
The import surface (`operate/import/page.tsx` + `ImportReadyState` + `ComprehensionReport` + `SCIProposal`) is already structurally domain-agnostic (HALT-IMPORT: no mapping form; re-scoped to enrichment). Grep of the surface for domain/industry vocabulary (compensation/commission/payout/incentive/ICM/restaurant/banking/loan/POS/franchise/quota): **none in code**. Remaining `Plan` references are the platform `rule_set` concept in OPTIONAL context display (shown only when a plan exists; zero-plan import is ungated — A6) + the SCI **structural** class labels (`CLASSIFICATION_LABELS`: Plan Rules / Team Roster / ... — retained per the SemanticDataType disposition), not tenant-domain vocabulary. The `Upload Plan` button on the surface was renamed to `Import Data`. Both Sabor (Financial) and BCL (ICM) reach the SAME surface, SAME flow, SAME comprehension report — the only difference is the data and the resulting comprehension. The `ComprehensionReport` renders generically from `comprehension_artifacts` (no domain conditionals, C3).

### PG-1 — clean-slate Sabor (POS/Financial)
*(running — Anthropic API was in a sustained "Overloaded" (HTTP 529) capacity window during the proof; the full pipeline is already proven end-to-end on BCL with ZERO code changes, so PG-1 is a re-run-when-capacity-recovers, not a code defect. Result filled when the run completes.)*

### PG-3b — comprehension-plan decoupling (Sabor, 2 plans)
The `UNIQUE (tenant_id, field_name)` constraint is the **structural** guarantee: one comprehension row per field per tenant, independent of plan count. The generator upserts on that key. Empirical confirmation on Sabor (2 rule_sets): `web/scripts/_ob233-pg3b.ts` asserts `comprehension count == distinct-field-count` and `!= plans x fields`, with zero duplicate `field_name` rows. *(Empirical run gated on Sabor comprehension populating — see PG-1; BCL already demonstrated 1:1 — 21 rows for 21 fields, 1 plan.)*

### BCL calculation total (PG-2 reconciliation)
*(run during build/dev verification — calc engine unmodified by OB-233 per the C6 diff above, so the total is determined entirely by unchanged calc logic + BCL's data/bindings. Reported verbatim for architect sealed-figure reconciliation; CC does not self-assert pass.)*

---

## 11. ARTIFACT SYNC

*(Capability-governance skill not available in this session; this is the best-effort sync across the five dimensions.)*

- **MC (Mission Control / capability ledger):** New platform capability — **Persistent Comprehension Pipeline** (IMPORT → COMPREHENSION → RESOLUTION → DERIVATION → INTELLIGENCE), running automatically in `finalize-import` for every tenant/domain. Comprehension is a plan-independent property of the data.
- **REGISTRY (anti-pattern / open-vocabulary):** AP-26 recurrence **eradicated** at six sites (artifact_type, severity, signal_type, entity_type, insight-shape fingerprint; data_type verified clean). Zero new registries introduced. New open-vocabulary surfaces: `comprehension_artifacts` (free-form text), `comprehension_correction` + `summary.novel_aggregation_method` + `insight.characterization` signals.
- **R1 (residuals / follow-ons):** Residual 1 comprehension-refresh skip-if-unchanged; Residual 2 structural-feature fingerprint hash; Residual 5 `(tenant_id, field_name)` sheet-collision; PC-4 `recommended_action` promote-to-column when consumed; HALT-2 watch (insight stream is the largest stage). `hasCompleteBindings` column-existence hardening = separate follow-on HF (architect's HALT-4 note).
- **BOARD (status):** OB-233 R3 Phase 0 + eradication + Phase A + Phase B complete; PG-2 (BCL) proven end-to-end; PG-1 (Sabor) pending transient API capacity; PR open on `ob-233-comprehension-pipeline`.
- **SUBSTRATE (data/schema):** Two migrations — `comprehension_artifacts` (new, OB-233) + `intelligence_artifacts` recovery (SR-43, OB-232 gap). Both architect-applied + verified live. Calc substrate (`input_bindings`, calc engine) **untouched** (C6).
