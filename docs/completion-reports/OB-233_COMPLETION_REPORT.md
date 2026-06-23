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
- **HALT-1 (ANTHROPIC_API_KEY):** cleared locally — key present in `web/.env.local`.
- **HALT-MIGRATION:** ACTIVE — see §2.3.
- (Others assessed as their objectives are reached.)

## 7. Timing
*(PG-8 — filled after end-to-end run)*
