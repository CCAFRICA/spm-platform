# HF-271 — Teach Compositional Grammar (Not a Pattern Catalog) + Structural-Coherence Proofreading

**Status:** 🚧 In progress
**Branch:** `dev`
**Pinned SHA (Phase 1 base):** `1d4557b599f6f81d32e6a72adec841b2f21c195e`
**Governing constraint:** AUD-009 — teach the grammar's primitives + the single composition rule; never a catalog of plan-component kinds. Decision 158 (LLM recognizes / code constructs). Korean Test (IGF-T1-E910 v2).

---

## Phase 1 — AUD (read-only): grammar sufficiency + proofread surface

### 1.1 Pinned SHA
`1d4557b599f6f81d32e6a72adec841b2f21c195e` (dev HEAD). All Phase-1 refs against it.

### 1.2 Construction grammar already builds ratio-cap-times-base — **CONFIRMED (no constructor change)**

`intent-constructor.ts` arms:
- **`buildReferenceNode` `case 'ratio'` (530-541):** emits `{ prime:'arithmetic', op:'divide', inputs:[ {prime:'reference', field: numerator_field}, {prime:'reference', field: denominator_field} ] }` — a `divide` over **two distinct reference fields**.
- **`constructArithmetic` (331-347):** exactly two operands, each via `constructOperand`; `op = desc.operation` (e.g. `multiply`).
- **`constructConditional` (353-377) + `constructBranchOrOperand` (379-394):** condition = `compare(reference, threshold)`; `then`/`else` may each be a nested structure (`shape`) or operand (`kind`).
- **`constructOperand` `case 'structure'` (497-498):** an operand `{kind:'structure', structure:…}` wraps an arbitrary nested structure.

**Encoding statement.** The CompositionalIntent
`structure: { shape:'arithmetic', operation:'multiply', operands:[ {kind:'structure', structure:{ shape:'conditional', condition:{ reference:{type:'ratio', numerator_field:'Cargas_Totales_Hub', denominator_field:'Capacidad_Total_Hub'}, operator:'gte', threshold:1.5 }, then:{kind:'constant', value:1.5}, else:{kind:'reference', source:{type:'ratio', numerator_field:'Cargas_Totales_Hub', denominator_field:'Capacidad_Total_Hub'}} }}, {kind:'constant', value:800} ] }`
constructs to the DAG `arithmetic.multiply[ conditional(compare(divide(loads,cap) ≥ 1.5) ? constant(1.5) : divide(loads,cap)), constant(800) ]` — a `divide` over two distinct reference fields wrapped in a ratio-space clamp, times the base. `constructTree` builds it **unchanged**. **HALT-1a not triggered.**

### 1.3 Current recognition catalog — enumerated

The `plan_component` system prompt's **ILLUSTRATIONS** block (lines 559-609) is the catalog to remove — three worked examples each depicting a *kind of plan component* with real field names, thresholds, and named components:
- **SC-A** — "1D 4-tier band (BCL C1 Captación de Depósitos shape)": field `cumplimiento_depositos`, breaks `[80,100,130]`, outputs `[0,120,250,400]`.
- **SC-B** — "2D matrix (BCL C0 Colocación de Crédito shape, 6×5)": fields `cumplimiento_colocacion`/`calidad_cartera`, breaks `[70,80,90,100,120]`/`[0.7,0.85,0.9,0.95]`.
- **SC-C** — "Arithmetic linear rate (CRP Plan 1 shape)": field `revenue`, constant `0.05`.

**Kept (grammar, not catalog):** the Decision-158 framing (478-503); the emission discipline + reference-type rules (484-499); the CompositionalIntent SHAPE schema (505-557 — the shape discriminants, operand kinds, ReferenceSource types, scale — the emitted contract `constructTree` consumes); the response shape (611-629). The `<<COMPONENT_TYPE_LIST>>` placeholder resolves to `buildComponentTypeListForPrompt()` = the active **foundational primitive IDs** (the permitted alphabet, Decision 154/155), and `<<PRIME_GRAMMAR>>` → `generatePromptGrammarSection()` (canonical grammar from prime-grammar.ts). Both are the primitive alphabet, not a plan catalog — they stay.

### 1.4 Proofread surface — located
`extractReferencesFromDAG` (`src/lib/intelligence/convergence-service.ts:1451`, matches `obj.prime === 'reference'|'aggregate'`) is already imported into `plan-orchestration.ts` (added in HF-270). The post-`constructTree(ci)` seam in `callPlanComponentWithRetry` is where the HF-270 field-resolution check already attaches; the HF-271 coherence proofread attaches at the same seam, reading the emitted `ci` (the recognized structure) and walking `constructedTree` (the built structure) for `divide` arity. **HALT-1b not triggered.**

### 1.5 AUD finding
Grammar sufficiency confirmed (1.2 — ratio-cap-times-base constructs unchanged); catalog enumerated (1.3 — ILLUSTRATIONS SC-A/B/C); proofread surface located (1.4 — post-`constructTree` seam, `extractReferencesFromDAG` available). No HALT → proceed.

---

## Phase 2 — Recognition-prompt rewrite (grammar description, not pattern catalog)
**Commit:** `f6ffd88e` — _HF-271 Phase 2: replace plan_component pattern-catalog…_
**Recovery note:** a socket dropped mid-Phase-2; diagnosis (`git log`/`status`/`diff --stat`) showed Case C (nothing landed — adapter unmodified, no Phase-2 commit). Re-applied clean per the recovery protocol's Step 2C.

Removed the `ILLUSTRATIONS` catalog (SC-A 1D band / SC-B 2D matrix / SC-C linear rate — each a worked example of a *kind* of plan with real fields/thresholds/named components). Installed grammar description (adapter lines 559-579): REFERENCE TYPES (metric / **ratio names BOTH fields, never collapse a divided quantity to one field, even when a pre-computed column exists** / aggregate / prior_component), STRUCTURAL SHAPES (arithmetic / conditional / clamp-in-the-bound's-space / banded_lookup / composed), THE COMPOSITION RULE (primitives nest freely and recursively; describe the plan, do not match a known shape), and three SINGLE-PRIMITIVE FORMS with abstract placeholders. The emitted `compositional_intent` schema (505-557) is unchanged (DD-7).

### Phase 2 EPG — literal enumeration (HALT-3 clear)
The rewritten block's literals are exclusively: prose section headers/descriptions; grammar primitive/token names (`metric`, `ratio`, `aggregate`, `scope_aggregate`, `prior_component`, `arithmetic`, `conditional`, `banded_lookup`, `composed`, `sum`/`max`/`min`/`first_match`, `multiply`, `gte`); JSON schema keys (`type`, `numerator_field`, `denominator_field`, `shape`, `condition`, `reference`, `operator`, `threshold`, `then`, `else`, `kind`, `constant`, `value`, `operation`, `operands`); and abstract placeholders (`<numerator>`, `<denominator>`, `<V's source>`, `<L>`, `<V as an operand>`, `<operand A>`, `<operand B>`). **No plan-component-kind name, no data-field literal, no real threshold value.** The removed catalog's `cumplimiento_depositos`/`calidad_cartera`/`revenue`, `80,100,130`/`0.05`/`70,80,90,100,120`, and `Captación de Depósitos`/`Colocación de Crédito`/`Linear Commission` are all gone.

## Phase 3 — Structural-coherence proofread
**Commit:** `41dd2241` — _HF-271 Phase 3: structural-coherence proofread…_

After `constructTree(ci)` in `callPlanComponentWithRetry` (`plan-orchestration.ts`, same seam as the HF-270 check), two pure traversals run:
- `collectDeclaredRatios(ci)` — every `ReferenceSource` with `type === 'ratio'` in the **recognized** intent → `{num, denom}`.
- `collectTwoFieldDivides(constructedTree)` — every `arithmetic`/`op:'divide'` over two `reference` leaves in the **built** DAG → `[fieldA, fieldB]`.

Assertion: if any ratio was declared, (a) none may have a missing/identical numerator-denominator, and (b) the count of two-distinct-field divides must be ≥ the count of declared ratios. A violation raises `StructuralCoherenceError` (new class in `compositional-intent.ts`) → mapped to `cognition_violation` in the existing catch → retry → `failed` ComponentOutcome on exhaustion (never persists an incoherent component). Arithmetic operand-arity is already constructor-guaranteed (`constructArithmetic` throws on ≠2 operands), so the ratio assertion is the substantive first coherence assertion — append-only by design (§6A).

### Phase 3.3 EPG — proofread body (HALT-3 clear)
Literals are exclusively: grammar tokens (`'ratio'`, `'arithmetic'`, `'divide'`, `'reference'`); schema keys (`'type'`, `'numerator_field'`, `'denominator_field'`, `'prime'`, `'op'`, `'inputs'`, `'field'`); and `StructuralCoherenceError` message text. **No data-field literal, no shape/plan-component-kind name, no catalog comparison** — the check is structure-to-structure (recognized intent vs built DAG).

### Deterministic enforcement proof — `scripts/hf271-coherence-check.ts`
```
PASS  c4 CORRECT (ratio→two-field divide × base): coherent=true
PASS  c4 COLLAPSED (THE DEFECT: ratio→single rate field): coherent=false (2 ratio(s) declared, 0 two-field divide(s) built — collapse)
PASS  DEGENERATE (numerator==denominator): coherent=false (degenerate ratio num="X" denom="X")
PASS  NO-RATIO (banded_lookup): coherent=true (no ratio declared → skips, DD-7 untouched)
PROOF: 4/4 assertions pass.
```

## Phase 4 — Build + verification

### 4.1 Build gate — **PASS**
`rm -rf .next && npm run build` → `✓ Compiled successfully`; full route table; dev returns on `localhost:3000` (the `Dynamic server usage` lines are the expected cookie/`request.url` API-route behavior).

### 4.2–4.4 Cold import + Meridian GT reconciliation + BCL regression — **ARCHITECT'S LIVE GATE (not self-attested)**
The cold-cycle determinism runs require the architect's clean-slate + import procedure: a `structural_fingerprints`-inclusive wipe, a live SCI import of the Meridian plan + data (exercising the modified live-AI `plan_component` **recognition** path), and recalculation of M1/M2/M3. This is live AI + tenant-data runtime in the architect's reconciliation channel; per the directive's evidentiary discipline it is **not self-attested here**. The branch is ready. Expected per §4.3: `component_4` surfaces the loads÷capacity ratio (two fields, NOT a single rate field); c4 totals 34,913 / 35,135 / 36,287; **C1 holds 44,000 / 40,950 / 48,900** (HF-270 must not regress); grand 185,063 / 175,585 / 196,337; a ~92%-utilization Senior ≈ 0.92 × 800 ≈ 736. BCL (4.4) byte-identical to pre-HF-271. The deterministic enforcement proof above confirms the proofread mechanism that backs the recognition fix.

### SR-38 line (mechanism)
The proofread guarantees a declared ratio cannot persist as a single-field collapse (proof: c4-COLLAPSED rejected); the grammar-description prompt steers recognition to declare the loads÷capacity ratio for c4 in the first place. The variable-per-entity, base-scaled c4 values and the C1=44,000/40,950/48,900 hold are confirmed by the architect's live 4.2/4.3 run.

---

## Commits
- `f6ffd88e` Phase 2 — replace pattern-catalog with compositional-grammar description
- `41dd2241` Phase 3 — structural-coherence proofread (declared-ratio-must-be-two-field)
- (report + PR follow)

## Status
Phases 1–3 complete, committed, pushed, build-gated, EPG-clean (AUD-009 / Korean Test verified for both surfaces). Phase 4.1 build gate PASS; deterministic enforcement proof 4/4. Phase 4.2–4.4 cold-cycle Meridian GT reconciliation + BCL regression is the architect's live clean-slate gate (not self-attested). PR opened for that verification.
