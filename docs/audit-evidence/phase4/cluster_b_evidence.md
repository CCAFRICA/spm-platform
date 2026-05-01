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

Three callers DO use the registry API directly at runtime:
- `web/src/lib/calculation/intent-validator.ts:64` — `isRegisteredPrimitive(operation)` (validator surface)
- `web/src/lib/ai/providers/anthropic-adapter.ts:32,810` — `getOperationPrimitives()` for `<<FOUNDATIONAL_PRIMITIVES>>` placeholder substitution at AI invocation time
- `web/src/lib/compensation/ai-plan-interpreter.ts:9,236` — `isRegisteredPrimitive(typeStr)` Phase 1.5 cleanup check

**CC observation:** The three dispatch sites carry literal-string `case` clauses; vocabulary derivation is type-system-level (compile-time enforcement that only `FoundationalPrimitive` union members match). Runtime registry consumption is present at the AI-invocation boundary and the validator surface but not at the dispatch sites themselves. Two of three dispatch sites have structured-failure defaults; one (intent-transformer) does not.

---

### Probe ID: S-CODE-G5-02 (validation surfaces)

**Subject:** Identify primitive-identifier validation surfaces. Verify reference to canonical registry.

**Execution:** Read `web/src/lib/calculation/intent-validator.ts`.

**Output:**

**Operation validation (intent-validator.ts:64-70):**
```typescript
if (!isRegisteredPrimitive(operation)) {
  const validOps = getOperationPrimitives()
    .map((p) => p.id)
    .join(', ');
  errors.push(`Invalid operation: "${operation}". Must be one of: ${validOps}`);
  return { valid: false, errors, warnings };
}
```
Operation membership check imports directly from `primitive-registry.ts`. Error message lists registry contents. Comment lines 9-13 explicitly cite "Decision 155: operation vocabulary derives from the canonical primitive registry; the prior `VALID_OPERATIONS` private array (9 strings, stale relative to the registry's 12) is replaced by `isRegisteredPrimitive` + `getOperationPrimitives` from the registry. Closes one of the F-005 declaration sites."

**Source validation (intent-validator.ts:30-37, 181):**
```typescript
const VALID_SOURCES = [
  'metric',
  'ratio',
  'aggregate',
  'constant',
  'entity_attribute',
  'prior_component',
] as const;
// ...
if (!source || !VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
  errors.push(`${label}: invalid source type "${source}"`);
  return false;
}
```
Source vocabulary is **a private const, not registry-derived**. Six entries.

**Source dispatch (intent-executor.ts:66-138, `resolveSource`):**
```
case 'metric':           ...
case 'ratio':            ...
case 'aggregate':        ...
case 'constant':         ...
case 'entity_attribute': ...
case 'prior_component':  ...
case 'cross_data':       ...   // NOT in VALID_SOURCES
case 'scope_aggregate':  ...   // NOT in VALID_SOURCES
```
Eight source kinds resolved by the executor.

**CC observation:** A divergence exists between the validator's `VALID_SOURCES` const (6 entries) and the executor's `resolveSource` switch (8 entries). The source kinds `cross_data` and `scope_aggregate` are handled by the executor but would be rejected by the validator. The validator surface is therefore not synchronized with the executor surface. There is no canonical "source registry" parallel to the primitive registry; source vocabulary is duplicated across two private declarations that have drifted.

---

### Probe ID: S-SCHEMA-G5-01 (canonical registry table)

**Subject:** Find migration that creates the registry table.

**Execution:**
```bash
grep -rn "primitive" web/supabase/migrations/*.sql
```

**Output:** `(no output — zero matches)`

**CC observation:** No migration creates a primitive-registry table. The canonical registry is **code-resident only** at `web/src/lib/calculation/primitive-registry.ts`. Per the registry file header (lines 13-15) and Decision 155 cited therein: "the canonical declaration is a SURFACE (this registry), not a string. Consumers import a typed reference; the TypeScript compiler enforces single-source-of-truth at every consumer." The intent is code-resident-by-design, with TypeScript type-system enforcement substituting for database-level constraint enforcement. Per audit scope CC reports the absence; CC does NOT disposition whether code-resident is sufficient enforcement.

---

## 6.B.2 — PF-04 Probes (G8 Korean Test)

### Probe ID: S-CODE-G8-01 (foundational code field-name literals)

**Subject:** Grep foundational code for natural-language field-name string literals.

**Execution:**
```bash
grep -rnE "(['\"]([Nn]ombre|[Aa]pellido|[Cc]omisi[oó]n|[Mm]onto|[Ff]echa|[Cc]liente|[Vv]endedor|[Tt]erritorio|[Pp]roducto)['\"])" web/src/lib/sci/ web/src/lib/calculation/ web/src/lib/intelligence/
grep -rnE "(['\"]([Nn]ame|[Aa]mount|[Dd]ate|[Cc]ustomer|[Ss]alesperson|[Tt]erritory|[Pp]roduct|[Cc]ommission)['\"])" web/src/lib/sci/
```

**Output (Spanish word list — directive-specified):**

```
web/src/lib/sci/content-profile.ts:17: const NAME_SIGNALS = ['name', 'nombre', '이름', 'display', 'label'];
web/src/lib/sci/content-profile.ts:19: const DATE_SIGNALS = ['date', 'period', 'month', 'year', 'fecha', '날짜', 'time', 'day'];
web/src/lib/sci/content-profile.ts:20: const AMOUNT_SIGNALS = ['amount', 'total', 'balance', 'monto', 'sum', '금액', 'value', 'price'];
```

Hits limited to `content-profile.ts`. The directive-specified words **apellido, comisión, cliente, vendedor, territorio, producto** have ZERO occurrences in foundational SCI code, calculation engine, or intelligence services.

**Output (English word list — directive-specified):**

```
web/src/lib/sci/agents.ts:482:    const ENTITY_TYPES = ['person', 'employee', 'organization', 'account', 'customer', 'client', 'member'];
web/src/lib/sci/negotiation.ts:296:  const ENTITY_TYPES = ['person', 'employee', 'organization', 'account', 'customer', 'client', 'member'];
```

Hits limited to identical `ENTITY_TYPES` declaration in `agents.ts` and `negotiation.ts`. The directive-specified words **salesperson, territory, commission** have ZERO occurrences in foundational code. The word **customer** appears only inside `ENTITY_TYPES` (used to match against AI-output `identifiesWhat` values, not raw header names).

**Additional finding — full SIGNAL inventory in content-profile.ts (lines 16-21):**
```typescript
const ID_SIGNALS     = ['id', 'no', 'number', 'code', 'código', 'codigo', '번호', 'num', 'identifier'];
const NAME_SIGNALS   = ['name', 'nombre', '이름', 'display', 'label'];
const TARGET_SIGNALS = ['target', 'goal', 'quota', 'meta', 'objetivo', '목표', 'benchmark'];
const DATE_SIGNALS   = ['date', 'period', 'month', 'year', 'fecha', '날짜', 'time', 'day'];
const AMOUNT_SIGNALS = ['amount', 'total', 'balance', 'monto', 'sum', '금액', 'value', 'price'];
const RATE_SIGNALS   = ['rate', '%', 'percentage', 'tasa', '비율', 'percent', 'ratio'];
```

Six multilingual SIGNAL lists carrying English + Spanish + Korean substrings. File header line 4: "Zero domain vocabulary. Korean Test applies." Comment lines 12-13: "Used for OBSERVATION TEXT and SEMANTIC BINDING only — NOT for scoring."

**Usage of SIGNAL lists in content-profile.ts:**

Line 135 (inside `scorePercentagePlausibility`):
```typescript
if (headerContains(headerName, RATE_SIGNALS)) {
  const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
  if (nums.length / nonNull.length > 0.80) return 0.80;
}
```

Line 163 (inside `scoreCurrencyPlausibility`):
```typescript
if (headerContains(headerName, AMOUNT_SIGNALS)) return 0.85;
```

Lines 443-449 (per-field FieldProfile observation):
```typescript
nameSignals: {
  containsId:     headerContains(col, ID_SIGNALS),
  containsName:   headerContains(col, NAME_SIGNALS),
  containsTarget: headerContains(col, TARGET_SIGNALS),
  containsDate:   headerContains(col, DATE_SIGNALS),
  containsAmount: headerContains(col, AMOUNT_SIGNALS),
  containsRate:   headerContains(col, RATE_SIGNALS),
  looksLikePersonName: false,
},
```

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
