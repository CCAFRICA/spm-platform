# OB-233 (R3): Persistent Comprehension Pipeline — Full DS-030 Materialization

**Mode:** ULTRACODE (custom `.claude/commands/` wrapping `effort: xhigh|max` + split-and-merge subagent fan-out)
**Date:** 2026-06-22 — **Revision R3** (supersedes R2; R2 superseded the R1 draft `OB-233_AUTONOMOUS_PIPELINE_DIRECTIVE_20260622.md`)
**Governing Specification:** DS-030 v3 (Persistent Comprehension Architecture)
**Predecessor Work (all merged to main):** OB-229 (#588), HF-336 (#589), OB-232 (#590), HF-333 (running)
**Sequence number:** OB-233 — verify against live `docs/vp-prompts/`. If collision → HALT-SEQ.

**R2 governing change:** Comprehension is a property of the **data**, not of a plan. It is stored in a dedicated, plan-independent `comprehension_artifacts` table — **never on `rule_sets.input_bindings`**. No storage, read, dispatch, or validation in this OB is keyed to, gated by, or validated against a `rule_set`, a plan, or any fixed set of values. **One migration is required** (the new table); the architect applies it via the Supabase SQL Editor (SR-44) at the Migration Gate before any code wiring proceeds.

**R3 governing change:** This OB builds **platform functionality, not tenant solutions** (C8). Two consequences: (1) the import surface is made **domain-agnostic** — *one* platform import experience for every domain, not a relabel (Objective 9); (2) the binding-stability rule is reframed as a **platform invariant** (C6), not a per-tenant accommodation. Every named tenant (Sabor / BCL / MIR) is a **proof** of a universal property, never a design unit. Platform capability is proven by tenants — not assembled from them.

---

## §0 — CC Standing Rules & Gates

1. Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: Principles 1–9, Section B (ADR), Section C (Anti-Pattern Registry), Section D (operational). **SR-2, SR-34, SR-38, SR-43, SR-44.**
2. **FP-49 SQL Verification Gate.** Before authoring the migration (§Phase 0), query the live schema for every foreign-key target you will reference (`tenants`, `import_batches`, and any others). Paste the verified column/type output into the completion report. No `CREATE TABLE` is authored against an assumed schema.
3. **SR-44 Migration discipline (VP).** No psql / CLI / `exec_sql` RPC in VP. CC **authors and commits** the migration file and the `SCHEMA_REFERENCE_LIVE.md` update; the **architect applies** the SQL via the Supabase Dashboard SQL Editor; CC then **verifies** the table exists via a `npx tsx scripts/...` service-role read. CC never applies the migration itself.
4. **Architecture Decision Gate** before implementation (Section B ADR). **Anti-Pattern Registry** checked every build — with explicit attention to Pattern 15 (grep-output-as-PASS), which §5 PG-3 is hardened against.

---

## §1 — What This OB Delivers

After this OB, a user can:

1. Clean-slate any tenant
2. Import data files (POS, banking transactions, wholesale, any domain) — **with or without any plan configured**
3. See the system's comprehension of their data — what it understood about every field
4. Correct any characterization ("that's not cancellations, that's comps")
5. Navigate to intelligence — insights generated automatically, before they asked, using semantic labels they can read

No manual scripts. No one-time binding population. No architect intervention at runtime. The pipeline runs automatically on every import, for every tenant, for every domain. **Comprehension is generated once per field and shared across every plan that tenant ever has** — a tenant with five plans comprehends each field once, not five times. The product works.

A second tenant in the same domain imports data. The system comprehends faster because it recognizes the structural fingerprint from the first tenant. The insights are richer because the insight shapes from the first tenant inform the second. The system gets smarter with every tenant. That is the intelligence product.

---

## §2 — The Pipeline (DS-030 §5.1, materialized)

```
IMPORT → COMPREHENSION → RESOLUTION → DERIVATION → INTELLIGENCE
```

All five stages run automatically within or triggered by `finalize-import`. Comprehension persists in `comprehension_artifacts` (plan-independent, `(tenant_id, field_name)`-keyed) and is **never blanked without replacement**. Each stage's components already exist in merged code. This OB stands up the comprehension store, wires the stages together, eradicates the six fixed taxonomies, adds the import UI surface, and proves the pipeline end-to-end on two structurally different tenants.

---

## §3 — Governing Constraints (these bind every objective; a violation of any is a HALT)

**C0 — NO REGISTRIES.** No array, `Set`, `enum`, union type, or `const` object of *permitted values* may gate the acceptance, storage, dispatch, or rendering of any artifact (comprehension, summary, insight, signal, shape, entity type, data type) anywhere in this OB's deliverables. If a developer would have to grow a list to admit a new valid value, it is a registry and is prohibited. The **only** permitted validation is **structural-property validation** (non-empty; numeric value traces to a `summary_artifacts` metric; referenced FK exists; date range valid). Structural-property checks are not registries.

**C0b — NO RULE_SET COUPLING.** Comprehension is stored, read, and validated **independent of any `rule_sets` row / plan**. No comprehension write is keyed to a rule_set; no comprehension read is gated by plan existence; no validation checks rule_set membership. Storage is `comprehension_artifacts`, keyed by data identity `(tenant_id, field_name)`. A tenant with zero plans still produces full comprehension on import.

**C1 — Decision 158.** LLM **recognizes** (field comprehension, insight generation, aggregation strategy, visual treatment). Deterministic code **constructs** (artifacts, summaries, validation, storage, aggregation execution). The boundary is sharp.

**C2 — Decision 154 fail-loud dispatch.** Any code that must branch on a recognized value (e.g. selecting an aggregation method) **executes on recognition and fails structurally on the unrecognized — it never silently defaults.** "Log and proceed with a default" is the prohibited silent fallback. "Log, escalate, and HALT/flag" is correct.

**C3 — Korean Test (T1-E910 v2).** Zero hardcoded field names, domain strings, tenant-specific vocabulary, or **language-specific** string literals in any code path — including no substring matching on the LLM's free-form output to infer behavior (e.g. `contains("sum")`). The comprehension generator, Summary Engine, Insight Engine, validator, signal writer, insight-shape function, and import UI contain no fixed vocabulary in any language.

**C4 — T1-E902 Carry Everything.** Comprehension **enriches**; it never narrows or filters `committed_data`. All fields are comprehended. All numeric fields are aggregated. Nothing is excluded because the system does not yet understand it.

**C5 — Determinism, scoped honestly.** Deterministic layers (calculation, summary aggregation **execution**) are byte-identical on reimport. LLM-recognition layers (comprehension text, insight characterization, shape description) run at **temperature 0** so they are **semantically stable** on reimport; they are not promised byte-identical until the structural-feature fingerprint (DS-030 §9.5) lands (Residual). "Clean-slate → reimport → identical result" applies to the deterministic layers.

**C6 — Binding read-contract stability (platform invariant).** The platform's calculation engine binds at calc time against the binding contract it already reads (component-level `input_bindings`). Introducing comprehension is **purely additive** — a separate store the engine does not read — and must not alter the engine's binding read contract or its reader **for any tenant**. Comprehension lives in `comprehension_artifacts`; the engine's input contract is unchanged. This is a platform property, **proven** by any tenant carrying existing component bindings (e.g. BCL) — not a per-tenant accommodation.

**C7 — Vertical slice.** Migration + comprehension store + pipeline wiring + six eradications + import UI + proof all ship in one PR.

**C8 — Platform functionality, not tenant solving.** Every capability in this OB is a domain-agnostic platform property. Tenants are **proofs**, not design units. No objective, constraint, code path, table key, agent selection, or UI branch is scoped to a specific tenant or domain. Where a tenant is named, it is an **instance proving a universal property** (BCL proves binding-contract stability; a Financial tenant + an ICM tenant prove the domain-agnostic import surface; a multi-plan tenant proves comprehension–plan decoupling). The property — never the tenant — is what this OB builds. "Works for tenant X" is not a passing result; "the platform property holds, and tenant X proves it" is.

---

## §Phase 0 — Migration Gate (architect-applied, blocks all code wiring)

**This phase completes before any objective that reads or writes `comprehension_artifacts`.**

1. **FP-49 verification** (per §0.2): query and paste the live schema of `tenants`, `import_batches` (and confirm whether a per-field comprehension home already exists — it must not; if any `field_identity`/`contextualIdentity` store exists in `input_bindings`, note it; it will be read only as a migration *hint*, never written).
2. **Author** `migrations/<repo-convention-timestamp>_comprehension_artifacts.sql` (follow the existing VP `migrations/` naming convention — read the directory; do not invent a format). Intended structure (adjust column/FK specifics to the verified live schema):

```sql
CREATE TABLE comprehension_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_name         text NOT NULL,                 -- the source column this comprehends
  characterization   text NOT NULL,                 -- free-form (DS-030 §4.1)
  data_nature        text,                          -- free-form
  relationships      text,                          -- free-form
  aggregation_behavior text,                        -- free-form (read by Summary Engine, never substring-matched)
  identifies         text,                          -- free-form entity description, NULL if not an identifier
  display_label      text,                          -- cached LLM-derived label (Objective 4)
  aggregation_method text,                          -- cached LLM-recognized method (Objective 4); dispatched fail-loud (C2)
  source_import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comprehension_artifacts_tenant_field_key UNIQUE (tenant_id, field_name)
);
CREATE INDEX comprehension_artifacts_tenant_idx ON comprehension_artifacts (tenant_id);
```

   - **No `structuralType` / `contextualIdentity` / role-enum columns.** No `data_type`-style fixed-set column. Every semantic field is free-form `text` (C0).
   - `UNIQUE (tenant_id, field_name)` is the decoupling guarantee (C0b): one comprehension per field per tenant, **independent of plan count** — proven by PG-3b.
3. **Commit** the migration file **and** the `SCHEMA_REFERENCE_LIVE.md` update in the same commit. **HALT-MIGRATION:** report "migration authored, awaiting architect application via SQL Editor (SR-44)."
4. **Architect** applies the SQL. CC then **verifies** via `npx tsx scripts/...` (service-role `SELECT` against `comprehension_artifacts`) and pastes the result. Only then do the comprehension-dependent objectives proceed.

---

## §4 — Ten Objectives

> Objective ↔ file-ownership map (drives the ULTRACODE fan-out in §4A). Each objective edits a disjoint file or file-region; no two parallel subagents touch the same file.

### Objective 1 — Stop the comprehension/binding erasure  *(spine; file: `finalize-import`)*
`finalize-import` step 2 sets `input_bindings = {}` on every import (HF-269 behavior). This both (a) destroyed HF-336's comprehension and (b) would wipe legitimate component bindings the engine needs. Remove the unconditional blanking. Two invariants after this objective:
- `input_bindings` is **not blanked** by `finalize-import` (BCL/ICM component bindings survive — C6).
- `comprehension_artifacts` for the tenant is **refreshed, never blanked without replacement** (DS-030 §4.2: "must never blank existing comprehension without replacement"). Generation (Objective 2) is an idempotent upsert; there is no `DELETE … ` followed by a window where comprehension is empty.

### Objective 2 — Unified, plan-independent comprehension generator  *(spine; file: comprehension generator, evolved from HF-336's `convergence-binding-generator.ts`)*
HF-336 built a Financial-data generator that reads `row_data` samples, calls the LLM, and assigned semantic roles. Evolve it into the **comprehension generator**:
- Reads `row_data` samples for **every field** in the import (C4 — all fields, no narrowing).
- Calls the LLM (temperature 0, C5) to produce the free-form artifact of Objective 3 **per field**.
- **Writes to `comprehension_artifacts`** via idempotent upsert on `(tenant_id, field_name)`. **It does not write to `input_bindings`** (C6, C0b).
- Runs inside `finalize-import` after data commits, **for every import, every tenant, regardless of whether any rule_set exists** (C0b). No "does a plan exist?" branch gates generation.
- **BCL/ICM note:** component-level bindings in `input_bindings` are **left intact** for the calc engine. The generator additionally produces field-level comprehension rows for those same fields in `comprehension_artifacts`. Component structure is untouched; the Summary/Insight engines read field-level comprehension from the new table.

### Objective 3 — Free-form comprehension artifact (DS-030 §4.1 — eradicate `field_identity`)  *(spine; same generator file + the new table rows)*
The artifact **is** a `comprehension_artifacts` row. There is no `field_identity` structure anywhere.

**Prohibited (the violation, do not write):**
```json
{ "structuralType": "measure", "contextualIdentity": "loan_placement_amount" }
```
**Produced (free-form — DS-030 §3.1):**
```json
{
  "characterization": "the total monetary amount of loans placed by this employee in the reporting period",
  "data_nature": "cumulative currency amount; increases monotonically within a period as loans close",
  "relationships": "compared against Meta_Colocacion to determine attainment; the ratio is the core performance measure",
  "aggregation_behavior": "sum across entities gives branch total; sum across periods is meaningless (resets per period)",
  "identifies": null
}
```
No `structuralType` enum. No `contextualIdentity` developer vocabulary (C0). **BCL migration of the old format:** for fields whose only prior characterization lived as `contextualIdentity` inside `input_bindings`, the generator may **read that string as a *hint* to the LLM** to produce a richer free-form characterization — it is never copied as a value and `input_bindings` is never rewritten. Migration is idempotent (re-running replaces the `comprehension_artifacts` row).

### Objective 4 — Summary Engine reads free-form comprehension  *(spine; file: Summary Engine `buildSemanticKeyMap`)*
HF-336's enrichment path read `contextualIdentity` from `input_bindings`. Repoint it:
- Read `characterization` (and `display_label` if cached) from **`comprehension_artifacts`** for the tenant's fields — not from `input_bindings`.
- One LLM call **per backfill** (not per page load — cached, C1): "given these field characterizations, produce a concise display label for each field and recognize its aggregation method" → structured `{field_name: {label, aggregation_method}}`, **written back into the comprehension row** (`display_label`, `aggregation_method`).
- Deterministic code executes the aggregation. **Dispatch is fail-loud (C2):** the executor maps the recognized `aggregation_method` to a deterministic operation; an **unrecognized** method **raises a structured error / HALT** and is logged as a novel-method signal — it does **not** default to SUM.
- **DELETED from R1:** the substring-inference fallback (`contains "sum" → SUM`, etc.). It was English-keyword matching (a C3 violation in es-PE: `"conteo"`≠`count`, `"saldo"`/`"última"`≠`last`) and a C2 silent-fallback. The cached LLM call is a one-time cost (results persist on the comprehension row), so the latency justification does not apply. There is no fallback path.

### Objective 5 — Insight Engine free-form output (DS-030 §4.3 — eradicate `artifact_type` and `severity`)  *(parallel B1; file: `insight-engine.ts`)*
The Insight Engine instructs the LLM to emit `artifact_type ∈ {anomaly, trend, coaching, benchmark}` and `severity ∈ {critical, warning, info, positive}`. Remove those instructions. The LLM emits (temperature 0, C5):
```json
{
  "insight_characterization": "an abrupt deviation from the established pattern in a single metric at a single entity over a short timeframe",
  "insight_severity": "requires attention — the deviation magnitude exceeds two standard deviations from the trailing average",
  "title": "...", "narrative": "...", "data_references": [...]
}
```
`intelligence_artifacts.artifact_type` and `.severity` remain TEXT columns storing the free-form strings (no schema change). A seasonal cycle, phase shift, or any pattern outside four boxes is emitted and stored. Nothing is rejected (C0).

### Objective 6 — Validator checks structural properties only (DS-030 §4.2 — eradicate allowable-form check)  *(parallel B2; file: `insight-validator.ts`)*
1. **Data-contract — RETAIN.** Every `data_references` value traces to a `summary_artifacts` metric. Structural property; works for any insight type, any domain, any language.
2. **Allowable-form — REMOVE.** Any check of `artifact_type`/`severity` against a set is deleted (C0). No `VALID_*`, `ALLOWED_*`, or `_TYPES` array remains in this file.

Replace allowable-form with **structural-coherence** checks: non-empty `insight_characterization`, `title`, `narrative`; ≥1 `data_references`; `entity_id` (if present) exists in `entities`; date range (if present) valid. On an unseen characterization the validator **logs a novel-type signal** (architect visibility + flywheel) and **stores** the insight. It does **not** reject (DS-030 §2.5 — "structured failure means escalate, not delete," C2).

### Objective 7 — Signal capture free-form (DS-030 §4.4 — eradicate `signal_type`)  *(parallel B3; file: `ui-signal.ts`)*
`classification_signals.signal_type` is TEXT. The writer composes a **free-form** structural characterization of the interaction from context (surface, target, what changed) — `"entity_focus_narrowing"`, `"temporal_drill_to_daily"`, etc. **No fixed list of interaction classes** (C0): the prior R1 "structural prefix + free suffix" idea is permitted **only if the prefix token is itself writer-authored free-form and no code validates it against a list.** New interactions (hover, scroll, zoom, share, bookmark, filter, sort) are described, never enumerated. No set-membership check ever rejects a signal.

### Objective 8 — Insight shapes free-form (DS-030 §4.5 — eradicate fixed-field fingerprint)  *(parallel B4; file: `insight-shape.ts`)*
Replace `{pattern, metric_class, entity_type, severity, delta_direction}` (each an implied value set) with:
```json
{ "shape_description": "abrupt single-metric deviation at a single entity, positive direction, short timeframe, revenue-class measure",
  "structural_fingerprint_hash": "a7f2c..." }
```
`shape_description` is free-form (temperature 0, C5), stripped of tenant content. `structural_fingerprint_hash` is a deterministic hash of the description **for now**; the true structural-feature-extraction hash (DS-030 §9.5) is a Residual. No fixed field set, no implied value set (C0).

### Objective 9 — Domain-agnostic import surface (DS-030 §5.3)  *(parallel B5; file: import surface)*

This objective builds **one platform import experience, identical for every domain.** It is **not a relabel** — it removes domain coupling from the import surface so the same flow serves ICM, Financial, and any net-new domain, with the **data** (not a UI route, not a plan selection) determining everything downstream. The historical import was bound to the active plan context and routed through a domain-specific ICM path with a field-**mapping configuration form**; that coupling is removed here.

**Required — the domain-agnostic structure (this is the minimum, not a stretch goal):**

1. **One domain-neutral entry point.** "Import Data" / "Import" for the entire platform. **No domain/module pre-selection. No "which plan" gate before import.** The user imports data; the system determines what it is.
2. **No domain-specific routing in the surface.** Remove any branch that routes the import by module/domain (e.g. an ICM-specific import path). The surface contains **no domain vocabulary and no domain conditionals** — the Korean Test (C3) extends to this UI layer. Comprehension-agent / path selection happens **downstream by data characteristics** (DS-030 §5.1 Stage 2: "agent selected by data characteristics — not by UI route"), never by which route the user clicked.
3. **Comprehension report replaces the configuration form.** The plan/domain-coupled field-**mapping** step is removed from the import gate. In its place: the system generates comprehension (Objective 2) and shows it as a **report** — "here's what I understood about each field" — rendered generically from `comprehension_artifacts` (no domain-specific render branches). A configuration form is inherently domain-shaped; a comprehension report is universal. **This is the domain-agnostic shift** (DS-030 §5.3: "what the system understood, not a configuration form").
4. **Import is independent of plans and domain configuration.** Data is imported and comprehended whether or not any plan or domain is configured (C0b). The mapping of data → plan metrics happens later in convergence/calculation, not as a manual import-time step. A net-new tenant with **zero plans** imports, comprehends, and sees intelligence on the **same** surface.
5. **Correction is a domain-agnostic affordance.** The only user-facing correction at import is "this characterization is wrong" → a free-form signal (`classification_signals`, characterization `"comprehension_correction"`, carrying `tenant_id` + `field_name`). **No domain-specific mapping UI.** Acting on the signal to refine the `comprehension_artifacts` row is the future feedback loop (Out of Scope).
6. **Intelligence preview.** After the pipeline completes, show generated insights before the user navigates.

**Staging rule (does NOT permit a cosmetic relabel):** items 1–5 are the domain-agnostic structure and **must ship** — a rename that leaves domain routing or the mapping form intact does **not** satisfy this objective and fails C8. The only stageable piece is item 6 (intelligence-preview *rendering*), which may depend on page-level rendering work; stage it if it blocks the pipeline (Residual), but ship the insights stored.

**HALT-IMPORT (dependency):** if removing the field-mapping configuration form would leave any domain's bindings unpopulated — i.e. the automated SCI/convergence flow does not yet fully replace what the manual mapping form populated for that domain (notably ICM component bindings) — **HALT and report the gap.** Do not silently leave a domain unable to calculate, and do not retain a domain-specific mapping form as a workaround (SR-34). Architect dispositions: gate form removal behind automated binding-population completeness, or prove automated population first and then remove the form.

### Objective 10 — Entity type and data type free-form (DS-030 §4.6, §4.7)  *(entity_type → parallel B1, `insight-engine.ts`; data_type → parallel B6, SCI)*
- **`entity_type`** (`intelligence_artifacts`): derived from the comprehension row's `identifies`. The Insight Engine writes a free-form description (`"individual bank sales representative"`, `"restaurant location"`) — TEXT, no `{location, individual, organization, network}` (C0). *(Owned by B1 since it edits `insight-engine.ts`.)*
- **`data_type`** (`committed_data`, `summary_artifacts`): the comprehension generator emits a **free-form data characterization**. `summary_artifacts.data_type` may persist as a **partition value** (grouping key) **only if no code validates it against a set** — if any code checks `data_type === 'pos_cheque'` / `'transaction'`, that check is a C0/C3 violation and is removed. *(Owned by B6, SCI-side; disjoint from B1.)*

---

## §4A — ULTRACODE Execution Plan (fan-out / fan-in)

Run the command at **`effort: xhigh` (or `max`)**. Use the **split-and-merge** pattern: spawn subagents via the Task tool, each in an **isolated worktree** (`isolation: worktree`), scoped to a **disjoint file** so parallel edits never conflict. Fan out, then fan in to integrate and prove.

**Serial spine (must complete in order — do not parallelize):**
`Phase 0 Migration Gate (architect-applied)` → `Obj 1 (finalize-import)` → `Obj 2 + Obj 3 (comprehension generator + artifact format → comprehension_artifacts)` → `Obj 4 (Summary Engine reads comprehension)`.
Rationale: each step's output is the next step's input; the comprehension store must exist and be populated before the Summary Engine can read it.

**Parallel wave (fan out the moment the Migration Gate clears — file-disjoint, one subagent each):**

| Subagent | Objective(s) | Owns file | Depends on |
|---|---|---|---|
| **B1** | Obj 5 + Obj 10 (entity_type) | `insight-engine.ts` | none (pure registry removal + free-form emit) |
| **B2** | Obj 6 | `insight-validator.ts` | none |
| **B3** | Obj 7 | `ui-signal.ts` | none |
| **B4** | Obj 8 | `insight-shape.ts` | none |
| **B5** | Obj 9 | import surface | Migration Gate (reads `comprehension_artifacts` for display) |
| **B6** | Obj 10 (data_type) | SCI pipeline | none |

Each subagent's **output contract** (for clean fan-in): the exact diff, a paste of the now-registry-free region of its file, and its slice of the PG-3/PG-7 grep for its own file. B1 and B6 both relate to Objective 10 but edit **different files** (`insight-engine.ts` vs SCI) — no conflict.

**Fan-in (orchestrator, after spine + wave complete):** merge worktrees; run the **end-to-end** gates that require the whole chain — **PG-1, PG-2** (full pipeline on two tenants), **PG-3 / PG-3b / PG-7** (codebase-wide registry + decoupling + Korean Test sweep), **PG-4, PG-5, PG-6, PG-8**. The orchestrator owns the single PR.

---

## §5 — Proof Gates (paste evidence for every gate — self-attestation is rejected)

### PG-1 — Clean-slate reimport → intelligence, on a POS/Financial tenant (Sabor proves it) (the product test)
Clean-slate Sabor. Reimport POS data. No manual steps after upload. Query and paste:
- `comprehension_artifacts` for Sabor — non-empty, free-form rows (no `structuralType`/`contextualIdentity` anywhere).
- `summary_artifacts` for Sabor — semantic labels from comprehension (keys like `revenue`/`tips`/`discount`, not raw `total`/`propina`/`descuento`). Sample row.
- `intelligence_artifacts` for Sabor — insights with free-form characterization. Count, sample title + narrative.

### PG-2 — Clean-slate reimport → intelligence + calculation integrity, on an ICM tenant (BCL proves it) (domain-agnostic + non-destructive)
Clean-slate BCL. Reimport. Same pipeline, **zero code changes** from PG-1. Paste the same three queries. Then:
- **Calculation integrity:** run a BCL calculation. **Architect verifies the result against the sealed figure** (reconciliation-channel; the figure is not in this directive). Report the calculated total verbatim for architect reconciliation.
- **Read-path immutability (C6):** paste a diff showing `input_bindings` and the calc-engine reader were **not modified** by this OB.

### PG-3 — No registry anywhere in code (hardened against Pattern 15)
Two passes — **both required**, comments/docs excluded:
1. **Multi-line fixed-set declarations** (catches prettier-split unions):
```
rg --multiline --pcre2 "anomaly[\s\S]{0,40}trend[\s\S]{0,40}coaching[\s\S]{0,40}benchmark" -g '*.ts'
rg --multiline --pcre2 "critical[\s\S]{0,40}warning[\s\S]{0,40}info[\s\S]{0,40}positive" -g '*.ts'
rg --multiline --pcre2 "selection[\s\S]{0,40}dwell[\s\S]{0,40}drill[\s\S]{0,40}dismissal" -g '*.ts'
rg --multiline --pcre2 "location[\s\S]{0,40}individual[\s\S]{0,40}organization[\s\S]{0,40}network" -g '*.ts'
rg --multiline --pcre2 "pos_cheque[\s\S]{0,40}transaction[\s\S]{0,40}entity[\s\S]{0,40}target" -g '*.ts'
rg --multiline --pcre2 "structuralType[\s\S]{0,20}(measure|identifier|temporal)" -g '*.ts'
```
2. **Dispatch / validation sites** (the registry may be split or renamed — catch where it's *used*):
```
rg "(artifact_type|severity|signal_type|entity_type|data_type)\s*===\s*['\"]" -g '*.ts'
rg "\.(includes|has)\(\s*(artifact_type|severity|signal_type|entity_type|data_type)" -g '*.ts'
rg "(VALID_|ALLOWED_|_TYPES\b|_KINDS\b).*=\s*\[" -g '*.ts'
rg "switch\s*\(\s*(artifact_type|severity|signal_type|entity_type|data_type)" -g '*.ts'
```
3. **Rule_set coupling for comprehension** (C0b): confirm comprehension is never read/written via `input_bindings`:
```
rg "input_bindings" -g '*.ts'   # every hit must be calc-engine component-binding I/O, NOT comprehension I/O — annotate each
```
All passes return zero offending hits. Paste full output. **PG-7 source-read is the authoritative compliance proof; this grep is the secondary screen.**

### PG-3b — Comprehension–plan decoupling, on a multi-plan tenant (MIR proves it) (proves C0b)
Clean-slate MIR (5 plans). Reimport. Query `comprehension_artifacts` for MIR:
- Each distinct source field appears **exactly once** (`UNIQUE (tenant_id, field_name)` holds; no per-plan duplication).
- `COUNT(*)` equals the number of distinct comprehended fields and is **independent of the plan count** (not ~5×). Paste the count, the distinct-field count, and a sample showing a field shared across plans has a single comprehension row.

### PG-4 — Validator accepts novel type, rejects bad data-contract
Generate an insight with a novel characterization (e.g. `"seasonal_cycle"`, `"correlation"`, `"phase_shift"`) → validator **accepts** (structural properties satisfied) and **logs a novel-type signal**. Then generate an insight with a fabricated numeric value not in summary data → validator **rejects** (data-contract violated). Paste both.

### PG-5 — Domain-agnostic import surface (platform property, proven by two domains)
Demonstrate the **identical** import surface and flow for tenants of two different domains, with **no domain branch**:
- A POS/Financial tenant (Sabor) and an ICM tenant (BCL or MIR) reach the **same** "Import Data" entry, the **same** steps, and the **same** comprehension-report completion screen. Paste both. The only difference is the data and the resulting comprehension — never the UI path.
- **Both** show a comprehension **report**, not a field-mapping configuration form.
- **Zero-plan proof:** a tenant with **no plan configured** completes import and sees comprehension on the same surface (proves C0b at the UX layer).
- Grep the import surface source: zero domain vocabulary, zero domain conditionals (Korean Test, C3). Paste.

### PG-6 — Signal capture accepts a novel interaction
Trigger an interaction outside selection/dwell/drill/dismissal (hover, filter, or sort). It writes to `classification_signals` with a free-form characterization, no rejection. Paste the row.

### PG-7 — Korean Test, source-read (authoritative)
Paste the source of: comprehension generator, Summary Engine enrichment + **aggregation dispatch**, Insight Engine prompt, validator, signal writer, insight-shape function. Architect verifies: zero fixed vocabulary, zero language-specific literals, **no substring-inference on free-form output**, and the aggregation dispatch is **fail-loud** (C2).

### PG-8 — End-to-end timing
Total time from import start to insight generation complete, for **both** Sabor and BCL. If any stage exceeds Vercel execution limits, report the stage and elapsed time (HALT-2).

---

## §6 — HALT Conditions

- **HALT-MIGRATION:** migration authored and committed; awaiting architect application via SQL Editor (SR-44). CC does not wire comprehension-dependent code until the table is verified present.
- **HALT-1:** `ANTHROPIC_API_KEY` not available in the `finalize-import` execution context. The comprehension generator and Insight Engine require LLM calls. Report and halt.
- **HALT-2:** the full pipeline exceeds Vercel's serverless execution time limit. Report which stage. Architect dispositions: background job, edge function, or async staging.
- **HALT-3 (narrowed by C6):** if the **calculation engine** (for any tenant) is found to read `field_identity`/`structuralType`/`contextualIdentity` from `input_bindings` — it is expected to read only component bindings — report the code path and halt; do **not** modify the engine reader. (The Summary/Insight engines reading the old format are *not* a HALT; per Objective 4/Objective 6 they are repointed to `comprehension_artifacts`.) Architect dispositions: shim vs reader migration.
- **HALT-4:** `finalize-import`'s `input_bindings = {}` erasure is entangled with logic the comprehension flow depends on. Report the surrounding code and halt.
- **HALT-C0:** any objective would introduce an array/Set/enum of permitted values to gate an artifact, or couple comprehension to a rule_set. Stop and report — this OB's own constraints forbid it.
- **HALT-IMPORT:** removing the field-mapping configuration form (Objective 9) would leave any domain's bindings unpopulated because automated SCI/convergence does not yet fully replace it. Report the gap and halt; do not retain a domain-specific mapping form as a workaround (SR-34). Architect dispositions per Objective 9.
- **HALT-TENANT (C8):** any objective, code path, table key, or UI branch would be scoped to a specific tenant or domain rather than expressing a platform property. Stop and report — platform functionality is the unit of work; tenants are only proofs.

---

## §7 — Reporting
Completion report at `docs/completion-reports/OB-233_COMPLETION_REPORT.md`. Structure: ADR (Section B); the **Migration Gate** record (FP-49 schema paste, migration file, architect-applied confirmation, tsx verification); PG-1 through PG-8 + PG-3b with pasted evidence; the **eradication log** (every fixed set removed, file/line); the **ULTRACODE fan-out record** (subagents spawned, file owned, effort level, worktree outcomes); HALT outcomes; timing; PR number and URL.
Final step: `gh pr create --base main --head ob-233-comprehension-pipeline` with a descriptive title and body.

## §8 — Out of Scope
- Signal-comprehension feedback loop (acting on correction signals to auto-refine `comprehension_artifacts`). This OB captures the correction signal only.
- Domain Flywheel engagement / cross-tenant shape transfer (DS-030 §6.1).
- Curation Engine / signal-density-shaped pre-computation (DS-030 §6.2).
- Adaptive surface composition from signal density (DS-013 Phase D/E).
- The 7 staged financial aggregate modes — separate follow-on.
- Per-user signal density aggregation (privacy analysis required per IRA Gap 2).

## §9 — Residuals
1. **Comprehension refresh optimization (Progressive Performance at the comprehension layer).** Generate-on-every-import now; later, skip the LLM call when comprehension exists and the schema is unchanged (reuse the `comprehension_artifacts` row).
2. **Structural-feature fingerprint (DS-030 §9.5).** Replace hash-of-prose with structural-feature-extraction → hash so the Domain-Flywheel match key is robust independent of prose wording.
3. **Intelligence preview rendering.** If post-import preview exceeds scope, ship insights stored and stage the preview UI.
4. **Cross-domain comprehension (DS-030 §9.4).** ICM + Financial agents sharing a tenant's `comprehension_artifacts`.
5. **Field-name collision across sheets.** The `(tenant_id, field_name)` key assumes a field name means one thing per tenant — a platform property that holds for the current proof tenants. If any tenant ever has the same column name meaning different things in different sheets, extend the key with a sheet/role discriminant. Platform property to preserve; flagged, not solved here.

---

*OB-233 R2: Persistent Comprehension Pipeline — Full DS-030 Materialization.*
*Comprehension is a property of the data, stored once per field, plan-independent. No registries. No rule_set coupling. Fail-loud dispatch. The calc engine's read path is untouched.*
*Proven by tenants as proofs of one platform pipeline: a POS/Financial tenant (Sabor), an ICM tenant (BCL, sealed figure preserved), and a multi-plan tenant (MIR, one comprehension per field). Same surface, same pipeline, zero code changes across domains.*
*The system comprehends in its own language. The loop begins.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
