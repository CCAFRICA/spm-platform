# E5.3a — phase4/cluster_b_evidence.md (truncated per Section 0 200-line rule)

**File:** `docs/audit-evidence/phase4/cluster_b_evidence.md`
**Total lines:** 349 (head 100 + tail 100 surfaced; 149 elided)

## First 100 lines

```markdown
# Phase 4 Audit — Cluster B (Processing Boundary Discipline) Evidence

**Audit:** DS-021 v1.0 / DIAG-DS021-Phase4 / Plan v1.1
**Branch:** `ds021-substrate-audit`
**Scope:** Code-and-Schema. Runtime probes deferred per environment scope.
**Date:** 2026-04-30

---

## 6.B.1 — PF-03 Probes (G5 Canonical Primitive Registry)

### Probe ID: S-CODE-G5-01 (dispatch sites)

**Subject:** Identify dispatch sites operating on primitive identifiers. Verify identifier vocabulary derives from canonical registry.

**Execution:**
```bash
grep -rn "primitive-registry\|primitive_registry\|primitiveRegistry\|PRIMITIVE_REGISTRY" web/src/
grep -rn "isRegisteredPrimitive\|lookupPrimitive\|getRegistry\|getOperationPrimitives\|FoundationalPrimitive\|FOUNDATIONAL_PRIMITIVES" web/src/lib/calculation/ web/src/lib/ai/ web/src/lib/compensation/
grep -nE "case '(bounded_lookup|scalar_multiply|conditional_gate|aggregate|ratio|constant|weighted_blend|temporal_window|linear_function|piecewise_linear|scope_aggregate)" web/src/lib/calculation/{intent-executor,run-calculation,intent-transformer}.ts
```

**Output:**

**Canonical registry (single source of truth):** `web/src/lib/calculation/primitive-registry.ts:45-58`
```typescript
export const FOUNDATIONAL_PRIMITIVES = [
  'bounded_lookup_1d','bounded_lookup_2d','scalar_multiply','conditional_gate',
  'aggregate','ratio','constant','weighted_blend','temporal_window',
  'linear_function','piecewise_linear','scope_aggregate',
] as const;
export type FoundationalPrimitive = (typeof FOUNDATIONAL_PRIMITIVES)[number];
```
12 primitives (11 `kind: 'operation'` + 1 `kind: 'source_only'`). Frozen at module load. Public API: `isRegisteredPrimitive`, `lookupPrimitive`, `getRegistry`, `getOperationPrimitives`, `registerDomainPrimitive` (NotImplementedError stub per Decision 154 v1).

**Dispatch sites identified (3):**

1. **`web/src/lib/calculation/intent-executor.ts:444-471`** — `executeOperation(op: IntentOperation, ...)`:
   ```typescript
   switch (op.operation) {
     case 'bounded_lookup_1d': return executeBoundedLookup1D(...);
     case 'bounded_lookup_2d': return executeBoundedLookup2D(...);
     case 'scalar_multiply':   return executeScalarMultiply(...);
     case 'conditional_gate':  return executeConditionalGate(...);
     case 'aggregate':         return executeAggregateOp(...);
     case 'ratio':             return executeRatioOp(...);
     case 'constant':          return executeConstantOp(...);
     case 'weighted_blend':    return executeWeightedBlend(...);
     case 'temporal_window':   return executeTemporalWindow(...);
     case 'linear_function':   return executeLinearFunction(...);
     case 'piecewise_linear':  return executePiecewiseLinear(...);
     default: { throw new IntentExecutorUnknownOperationError(...); }
   }
   ```
   11 `case` statements + structured-failure `default`. Cases are string literals; type discrimination via `IntentOperation` discriminated union (intent-types.ts), whose tag types derive from `FoundationalPrimitive`. Default branch comment: "Foundational IntentOperation union admits only registered primitives." `scope_aggregate` correctly absent (registry kind='source_only').

2. **`web/src/lib/calculation/run-calculation.ts:255-280`** — `evaluateComponent`:
   ```typescript
   switch (component.componentType) {
     case 'bounded_lookup_1d':
     case 'bounded_lookup_2d':
     case 'scalar_multiply':
     case 'conditional_gate':
     case 'linear_function':
     case 'piecewise_linear':
     case 'scope_aggregate':
     case 'aggregate':
     case 'ratio':
     case 'constant':
     case 'weighted_blend':
     case 'temporal_window':
       break;
     default:
       throw new LegacyEngineUnknownComponentTypeError(...);
   }
   ```
   12 cases (all registry primitives, including `scope_aggregate` as top-level component). Default throws structured failure citing "ComponentType union admits only registered primitives post-Phase-1.7."

3. **`web/src/lib/calculation/intent-transformer.ts:34-46`** — `transformComponent`:
   ```typescript
   switch (component.componentType) {
     case 'linear_function':
     case 'piecewise_linear':
     case 'scope_aggregate':
     case 'scalar_multiply':
     case 'conditional_gate':
       return transformFromMetadata(component, componentIndex);
     default:
       return transformFromMetadata(component, componentIndex);
   }
   ```
   5 named cases all route to the same function as the default. Switch is decorative — no behavioral differentiation per branch. Does not derive from registry; does not assert exhaustiveness.

**Vocabulary-derivation summary:**
| Site | Vocabulary derivation | Structured failure on unknown |
|---|---|---|
| intent-executor.ts | Type-level (IntentOperation discriminated union from FoundationalPrimitive) | YES (`IntentExecutorUnknownOperationError`) |
| run-calculation.ts | Type-level (ComponentType union, post-Phase-1.7 = FoundationalPrimitive) | YES (`LegacyEngineUnknownComponentTypeError`) |
| intent-transformer.ts | Literal-string match; no behavioral differentiation; no exhaustiveness assertion | NO (default routes to same fn as named cases) |

```

## [...149 lines elided per directive Section 0 truncation rule...]

## Last 100 lines

```markdown

**CC observation:**
- Line 135 and line 163 use `headerContains` to influence type-classification scoring (return values 0.80 / 0.85). This contradicts the file's own comment claim ("NOT for scoring") and the file's own header claim ("Zero domain vocabulary. Korean Test applies.").
- Line 163's `if (headerContains(headerName, AMOUNT_SIGNALS)) return 0.85;` short-circuits BEFORE the structural value-distribution check (twoDecimal/magnitude on line 164). Header substring takes precedence over value structure for currency type assignment.
- The `nameSignals` object is stored on every FieldProfile and consumed downstream (negotiation.ts:39, agents.ts:539, proposal-intelligence.ts:75) for routing decisions. Downstream tests are typically `hcRole === 'name' || f.nameSignals.looksLikePersonName` form — structural-OR-name pattern, not structural-only.
- The lists carry Spanish ('nombre', 'fecha', 'monto', 'tasa', 'meta', 'objetivo', 'código', 'codigo') and Korean ('이름', '날짜', '금액', '비율', '목표', '번호') tokens. Korean Test claim per DS-021 G8: "If you replaced every field name with Korean equivalents, would the platform still produce correct results? All field identification must use structural heuristics, never field-name matching in any language." A Hindi or Arabic header file (not in the encoded substrings) would not benefit from these lists; the multilingual encoding is a developer-pre-encoded set, not a structural method.

---

### Probe ID: S-CODE-G8-02 (SCI field-identification logic per agent)

**Subject:** Inspect SCI field-identification methodology per agent.

**Execution:** Read `web/src/lib/sci/agents.ts:1-110` (agent weight definitions and scoring entry).

**Output (relevant excerpt — agents.ts header + weight tables):**

agents.ts header (lines 1-4):
```
// Synaptic Content Ingestion — Agent Scoring Models
// Decision 77 — OB-127, OB-159 Unified Scoring Overhaul
// Five specialist agents with structural heuristic scoring.
// Korean Test: scoring uses structural properties only. Zero field-name matching.
```

`PLAN_WEIGHTS` (lines 25-36) — 10 weight rules, all referencing `p.structure.headerQuality`, `p.structure.sparsity`, `p.patterns.hasPercentageValues`, `p.patterns.hasDescriptiveLabels`, `p.patterns.rowCountCategory`, `p.patterns.hasEntityIdentifier`, `p.patterns.hasCurrencyColumns`, `p.patterns.hasDateColumn`. Zero direct field-name string literals.

`ENTITY_WEIGHTS` (lines 38-50) — 10 rules. Line 40 comment: "OB-160C: Korean Test compliant — structural name detection only (no nameSignals in scoring)". Uses `p.patterns.hasStructuralNameColumn` (structural — identifier-relative cardinality), not nameSignals.

`TARGET_WEIGHTS` (lines 52-66) — 11 rules. Lines 54-55 explicit cleanup comment: "OB-159: REMOVED containsTarget (+0.25) — Korean Test violation. Target agent now relies on structural signals: numeric fields + low repeat + no temporal." Uses `p.structure.numericFieldRatio`, `p.patterns.volumePattern`, `p.patterns.hasCurrencyColumns` etc.

`TRANSACTION_WEIGHTS` (lines 68-80) — 11 rules. References `p.patterns.hasDateColumn`, `p.patterns.hasEntityIdentifier`, `p.patterns.hasCurrencyColumns`, `p.patterns.volumePattern`, `p.structure.numericFieldRatio`, `p.structure.headerQuality`, `p.structure.sparsity`. No nameSignals.

REFERENCE_WEIGHTS — (not shown but per same pattern; consistent structure).

**CC observation:** The SCI agent scoring layer (agents.ts) carries explicit Korean Test cleanup commentary (OB-159 / OB-160C) and uses structural ContentProfile properties only — `structure.*` and `patterns.*`. nameSignals are NOT consumed in agent weight rules. Korean Test compliance at this layer.

However, the upstream layer (content-profile.ts that *produces* the ContentProfile) influences `patterns.hasCurrencyColumns` and `patterns.hasPercentageValues` via headerName-based scoring (lines 135, 163). The structural patterns the agents consume are therefore **not purely structural** at the source: the dataType assignment (which feeds into `hasCurrencyColumns` / `hasPercentageValues` aggregations downstream) is influenced by header-substring matching. The Korean Test compliance claim at the agents layer is partially undermined by the content-profile layer's name-influenced type scoring.

---

### Probe ID: S-CODE-G8-03 (AI prompt construction)

**Subject:** Inspect AI prompt construction. Verify structural classification request, not name-based.

**Execution:** Read `web/src/lib/ai/providers/anthropic-adapter.ts` system prompts (`plan_interpretation`, `convergence_mapping`, `document_analysis`) and runtime substitution logic.

**Output:**

**Runtime registry-derived vocabulary substitution (lines 804-811):**
```typescript
// OB-196 E1: registry-derived vocabulary substitution at call time. The
// placeholder `<<FOUNDATIONAL_PRIMITIVES>>` (only present in plan_interpretation)
// is replaced with `buildPrimitiveVocabularyForPrompt()`'s output sourced
// from the canonical primitive registry. Closes F-005 (prompt vocabulary drift).
const rawPrompt = SYSTEM_PROMPTS[request.task];
const systemPrompt = rawPrompt.includes('<<FOUNDATIONAL_PRIMITIVES>>')
  ? rawPrompt.replace('<<FOUNDATIONAL_PRIMITIVES>>', buildPrimitiveVocabularyForPrompt())
  : rawPrompt;
```

The `plan_interpretation` system prompt contains a `<<FOUNDATIONAL_PRIMITIVES>>` placeholder (line 375) replaced at invocation time with output of `buildPrimitiveVocabularyForPrompt()` sourced from the registry. This is Decision 155 / F-005 closure: prompt vocabulary derives from registry, not from a separate string copy.

**`plan_interpretation` prompt content (line 152 onward):** prompt asks AI to extract `metric`, `metricLabel`, `tiers`, `min`, `max`, `payout`, `rowAxis`, `columnAxis`, `ranges`, `values` — domain-agnostic structural fields. Example labels in the prompt are Spanish-language verbatim (`"% Cumplimiento de meta Optica"`, `"Venta de Optica de la tienda"`, `"Garantia Extendida"`, `"Venta de Seguros"`) but these are *example output values* the AI is told to extract verbatim from the document, not *example header names* the AI is told to detect. Programmatic name suggestions in examples (`"optical_attainment"`, `"store_optical_sales"`, `"warranty_sales"`, `"insurance_sales"`) are English snake_case which biases the AI toward that naming convention; this is a fragile area but not a direct G8 violation.

**`convergence_mapping` prompt (lines 759-764):**
```
You map compensation plan metric requirements to data columns. Given a list of metric field names (from plan interpretation) and data columns (with descriptions), return a flat JSON object mapping each metric to its best-matching column.

Each column may be used at most once. Match by semantic meaning, not by string similarity.
```
Explicit instruction to AI: "Match by semantic meaning, not by string similarity." Korean Test compliance encoded in instruction. Whether the AI complies is observable only via runtime — deferred per scope.

**`document_analysis` prompt (lines 766-786):** asks for `documentType: "plan" | "roster" | "data" | "unknown"`, `componentCount`, `calculationType: "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage"`, `language: "en" | "es" | "mixed"`. Domain-agnostic structural taxonomy; the calculationType vocabulary is a parallel pre-foundational vocabulary to the registry's primitives (tiered_lookup ≈ bounded_lookup_1d, matrix_lookup ≈ bounded_lookup_2d, flat_percentage ≈ scalar_multiply, conditional_percentage ≈ conditional_gate). Two parallel vocabularies for the same concept is a separate concern (F-007 lookalike) but not a name-based-detection violation per se.

**CC observation:** AI prompt construction has both Korean Test compliance affordances (registry-derived `<<FOUNDATIONAL_PRIMITIVES>>` substitution; explicit "not by string similarity" instruction in convergence_mapping) and concerns (Spanish example labels in plan_interpretation; English snake_case name suggestions; parallel `document_analysis` calculationType vocabulary that is not registry-derived).

---

## Summary — Cluster B factual inventory

**G5 (canonical primitive registry):**
- Single canonical registry exists (code-resident, frozen, 12 primitives).
- Registry consumed at runtime by 3 surfaces: validator, AI prompt builder, ai-plan-interpreter Phase 1.5 check.
- Dispatch sites (3): use type-system enforcement of registry membership; 2 of 3 have structured-failure defaults; 1 (intent-transformer) has decorative switch.
- Validator's source vocabulary (`VALID_SOURCES` const, 6 entries) has drifted from executor's source switch (8 entries: `cross_data` and `scope_aggregate` not in validator).
- No schema-side registry table.

**G8 (Korean Test):**
- Foundational SCI agent scoring layer (agents.ts) is Korean Test compliant per its own audit (OB-159 / OB-160C cleanup).
- Foundational ContentProfile generator (content-profile.ts) carries six multilingual SIGNAL lists (English + Spanish + Korean substrings) used at lines 135 and 163 to influence type scoring, contradicting the file's own zero-domain-vocabulary claim.
- The structural patterns SCI agents consume are therefore not purely structural at source.
- AI prompt construction has registry-derived primitive substitution (G5/G8 affordance) and explicit anti-string-similarity instructions; example labels in plan_interpretation are Spanish; programmatic name suggestions are English snake_case.
- `ENTITY_TYPES` domain-language list (in negotiation.ts and agents.ts, identical) used to match against AI-output `identifiesWhat` values; English-only.

**Directive-specified worst-case word matches:**
- Spanish (`apellido, comisión, cliente, vendedor, territorio, producto`): **ZERO occurrences** in foundational SCI / calculation / intelligence code.
- English (`salesperson, territory, commission`): **ZERO occurrences**. `customer` appears only inside `ENTITY_TYPES` matching against AI output.

CC reports findings. CC does NOT disposition magnitude.
```
