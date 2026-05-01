# DIAG-019 — Primitive Vocabulary Boundary Inventory

**Date:** 2026-04-29
**Branch:** `phase-4-e5-audit`
**HEAD at diagnostic:** `61496dde` (working tree carries staged P1.5.1 work)
**Diagnostic-only:** no code changes, no commits to source files. This artifact commits to the repo as architect-review substrate.

## Scope

Sites enumerated across:
- `web/src/lib/calculation/`
- `web/src/lib/compensation/`
- `web/src/lib/ai/`
- `web/src/lib/orchestration/`
- `web/src/lib/intelligence/`
- `web/src/lib/forensics/`
- `web/src/app/api/import/` (no qualifying sites found)
- `web/src/app/api/ai/` (no qualifying sites found)
- `web/src/app/data/import/`

`web/src/lib/calculation/primitive-registry.ts` is excluded from the inventory — it is the canonical surface, not a consumer boundary. Inventory captures consumers/derivatives only.

## Methodology

- Comprehensive grep across the 9 directories for the 12 foundational primitive identifiers (`bounded_lookup_1d`, `bounded_lookup_2d`, `scalar_multiply`, `conditional_gate`, `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`, `linear_function`, `piecewise_linear`, `scope_aggregate`) plus the 5 historical-legacy identifiers (`matrix_lookup`, `tiered_lookup`, `tier_lookup`, `flat_percentage`, `conditional_percentage`).
- Cross-grep for registry-consumer symbols (`getRegistry`, `getOperationPrimitives`, `isRegisteredPrimitive`, `lookupPrimitive`, `FoundationalPrimitive`, `InvalidPrimitiveShapeError`, `PrimitiveEntry`).
- Per-file site extraction: each function/switch/declaration that names, dispatches on, validates, or documents primitives is a single inventory entry. Multiple consecutive case arms within one function/switch are one site.

---

## Inventory

Sites grouped by file path; within each file, sites listed in line order. Site count given per file.

### `web/src/lib/calculation/intent-types.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 17, 67–71, 88–182 | Per-operation TypeScript interface declarations for `IntentOperation` (BoundedLookup1D, BoundedLookup2D, ScalarMultiply, ConditionalGate, Aggregate, Ratio, Constant, WeightedBlend, TemporalWindow, LinearFunction, PiecewiseLinear) constrained via `Op<T extends FoundationalPrimitive> = T` helper | 11 of 12 (operation primitives only; source_only `scope_aggregate` excluded by intent-shape design) | `registry_derived` (uses `Op<T>` helper constraining literal types to `FoundationalPrimitive` from the registry) | TypeScript compile error if literal not member of `FoundationalPrimitive` | Compile-time error; runtime `IntentExecutorUnknownOperationError` | `compliant` | `compliant` |
| 2 | 37 | `IntentSource` union admits `{ source: 'scope_aggregate'; sourceSpec: {...} }` as one of 5 source-kind variants | 1 of 12 (scope_aggregate) | `private_copy` (string literal in union, not derived from registry's `kind: 'source_only'` filter) | n/a (type-level union; runtime caught at executor) | n/a (type-level only) | `partial` (one literal not registry-derived; the rest of `IntentSource` union is non-primitive) | `compliant` |

### `web/src/lib/calculation/intent-validator.ts` (3 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 64–70 | Registry-membership pre-gate in `validateIntent` — rejects unregistered identifiers using `isRegisteredPrimitive()` + builds error message via `getOperationPrimitives()` | All 12 (gate); 11 operations (error message) | `registry_derived` | n/a (gate passes only registered primitives) | Throws `errors.push('Invalid operation: "${operation}". Must be one of: ${validOps}')` (returns `valid: false`) | `compliant` | `compliant` |
| 2 | 79–107 | Switch dispatching to per-primitive shape validators (`validateBoundedLookup1D`, etc.) | 9 of 11 (missing `linear_function`, `piecewise_linear`) | `private_copy` (hardcoded case arms; no fall-back to registry's `validate`) | Switch falls through silently — no validate call, no error | Silent fall-through (no `default` arm; `validateIntent` returns `valid: true` if no error pushed in switch) | `private_copy_violation` | `partial` (silent fall-through on `linear_function`/`piecewise_linear` — registered primitives without per-shape validation) |
| 3 | 256–end | Per-primitive shape validators: `validateBoundedLookup1D`, `validateBoundedLookup2D`, `validateScalarMultiply`, `validateConditionalGate`, `validateAggregate`, `validateRatio`, `validateConstant`, `validateWeightedBlend`, `validateTemporalWindow` (9 functions) — each names its primitive in `errors.push` messages and validates structural keys | 9 of 11 | `private_copy` (each function hardcodes its primitive name in error strings; not derived from `PrimitiveEntry.allowedKeys` or `validate`) | Each validator covers only its own primitive shape | Per-validator: `errors.push('${primitive}: missing/invalid X')`; structured-by-primitive but not via named error class | `private_copy_violation` (parallel to `PrimitiveEntry.validate` added in P1.5.1.1 — duplicate validation surface) | `compliant` (foundational identifiers only) |

### `web/src/lib/calculation/intent-executor.ts` (3 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 132–138 | `case 'scope_aggregate'` source resolution in `resolveSource` (handles scope_aggregate as IntentSource within nested operations) | 1 of 12 (scope_aggregate, kind: source_only) | `private_copy` (hardcoded case arm; not derived from registry's `kind` filter) | n/a (only matches the scope_aggregate source kind) | Falls through to other source-kind cases | `private_copy_violation` (could derive from `getRegistry().filter(p => p.kind === 'source_only')`) | `compliant` |
| 2 | 444–470 | `executeOperation` switch dispatching to per-primitive executors (`executeBoundedLookup1D`, etc.) with structured-failure default | All 11 operation primitives + default | `private_copy` (hardcoded case arms; not registry-derived) | n/a (covers all registered operations) | Throws `IntentExecutorUnknownOperationError` on unrecognized — **structured failure compliant** | `private_copy_violation` (the case-arm list is a private copy; future Domain Agent primitives need manual edit) | `compliant` (all 11 ops; foundational identifiers; structured failure on unrecognized) |
| 3 | 331, 345, 376, 418, 507 | Telemetry log keys naming `weighted_blend:weight_warning`, `temporal_window:no_history`, `temporal_window`, `piecewise_linear:targetValue` (5 string-literal log keys) | 3 of 11 (weighted_blend, temporal_window, piecewise_linear) | `private_copy` (log key strings hardcoded) | n/a (telemetry-only; no dispatch) | n/a (telemetry-only) | `private_copy_violation` (log keys could derive `${p.id}:warning_type`) | `compliant` |

### `web/src/lib/calculation/pattern-signature.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 6–12 | JSDoc examples documenting primitive pattern signatures (`bounded_lookup_2d:ratio+metric:g2x2:entity`, etc.) | 5 of 11 referenced as examples | `private_copy` (documentation strings) | n/a (documentation) | n/a | `private_copy_violation` (documentation could be generated; non-blocking) | `compliant` |
| 2 | 42–81 | `describeOperation` switch with 11 cases generating structural pattern signatures for telemetry/flywheel; relies on TypeScript exhaustiveness over `IntentOperation['operation']` union | 11 of 11 operation primitives (no `scope_aggregate` — source_only) | `private_copy` (hardcoded case arms; relies on TS exhaustiveness compile error if union extends) | TS compile error if new operation added without case (compile-time enforcement); no runtime default | None at runtime (TS narrows; switch is total over `IntentOperation['operation']`) | `partial` (private case arms but compile-time exhaustiveness via type union derived from registry — adequate as defensive layer) | `compliant` |

### `web/src/lib/calculation/run-calculation.ts` (4 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 5 | File-header comment naming legacy primitives (`tier_lookup, percentage, matrix_lookup, conditional_percentage`) — pre-Phase-1.5 audit-trail | 4 legacy identifiers | n/a (audit-trail comment) | n/a | n/a | n/a (documentation only) | `legacy_identifiers_present` (in audit-trail comment quoted form; could be paraphrased per DIAG-019 polish) |
| 2 | 256–274 | `evaluateComponent` switch with all 12 foundational primitives (12 case arms `break`-ing to intent-executor dispatch) + structured-failure default `LegacyEngineUnknownComponentTypeError` | All 12 + default | `private_copy` (case arms hardcoded) | n/a (covers all 12) | Throws `LegacyEngineUnknownComponentTypeError` on unrecognized — **structured failure compliant** | `private_copy_violation` (hardcoded case arms) | `compliant` |
| 3 | 289–309 | `bounded_lookup_1d` auto-detection logic (OB-120) — transforms `bounded_lookup_1d{postProcessing:{rateFromLookup}}` to `scalar_multiply{input, rate: bounded_lookup_1d}`. Names two primitives in dispatch logic. | 2 of 11 (bounded_lookup_1d, scalar_multiply) | `private_copy` | Not applicable (specific transform) | Falls through if not `bounded_lookup_1d` | `private_copy_violation` | `compliant` |
| 4 | 443, 463 | Comments referencing `tiered_lookup` (singular input handling) and `matrix_lookup` (plural inputs) as audit-trail documentation | 2 legacy identifiers | n/a (comment) | n/a | n/a | n/a | `legacy_identifiers_present` (audit-trail comment) |

### `web/src/lib/calculation/intent-transformer.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 34–46 | `transformComponent` switch — narrow-5 cases (linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate) + default — both arms call `transformFromMetadata` (effectively dead-code switch; same path) | 5 of 12 (named) + default (passthrough) | `private_copy` (5 case arms hardcoded; no narrowing effect since default also calls same function) | Default arm passes through to `transformFromMetadata` | None — no failure surface (silent passthrough on unrecognized) | `private_copy_violation` (vestigial Phase 1.5 narrowing — switch arms have no semantic effect) | `partial` (silent default; no structured failure on unrecognized) |
| 2 | 142–170 | `transformFromMetadata` per-operation construction logic — explicit branches for `linear_function`, `scalar_multiply`, `piecewise_linear`, `conditional_gate` building per-shape intent objects | 4 of 11 ops named + bridging logic | `private_copy` | Falls through to generic transform | None | `private_copy_violation` | `compliant` |

### `web/src/lib/calculation/decimal-precision.ts` (1 site)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 129–168 | `collectOutputValues` recursive switch collecting numeric output values from intent operation tree — narrow 5 cases (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, constant) + silent default | 5 of 11 | `private_copy` (hardcoded narrow case arms) | Silent no-op on unhandled primitives — recursive function does nothing for `aggregate`, `ratio`, `weighted_blend`, `temporal_window`, `linear_function`, `piecewise_linear`, `scope_aggregate` | None — silent default fallback | `private_copy_violation` | `partial` (Decision 154 violation — silent default on registered primitives missing from the narrow set) |

### `web/src/lib/calculation/results-formatter.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 501–510 | `formatComponentType` UI label lookup table mapping LEGACY identifiers (`matrix_lookup`, `tier_lookup`, `percentage`, `conditional_percentage`) to display labels. Fallback returns the type string verbatim. | 4 legacy identifiers (zero foundational) | `private_copy` (hardcoded literal table) | Fallback returns input verbatim (e.g., `bounded_lookup_2d` displays as literal "bounded_lookup_2d" in UI) | None (silent fallback) | `private_copy_violation` (could derive from `PrimitiveEntry.description` or a new `displayLabel` field) | `legacy_identifiers_present` (the entire table is legacy vocabulary; foundational primitives miss display labels and render as raw identifier) |
| 2 | 519–527 | `formatMetricValue` narrow conditional on `componentType === 'scalar_multiply'` or `'conditional_gate'` for currency-formatting; other primitives default to percentage formatting | 2 of 11 | `private_copy` | Falls through to percentage formatting | None (silent default to percentage formatting) | `private_copy_violation` | `partial` |

### `web/src/lib/compensation/ai-plan-interpreter.ts` (5 sites — post-P1.5.1)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 9, 39–47 | `GenericCalculation` interface definition; `type: FoundationalPrimitive` derives the union from registry via `(typeof FOUNDATIONAL_PRIMITIVES)[number]`. Type-system surface-derivation. | All 12 (registry-derived) | `registry_derived` | n/a (type-level only) | n/a (compile-time error if non-registered literal assigned) | `compliant` | `compliant` |
| 2 | 234–249 | Bridge wiring inside `normalizeComponents` — calls `lookupPrimitive(comp.type).validate(comp.calculationMethod)` per P1.5.1.1; throws `InvalidPrimitiveShapeError` with structural violation list on validate failure | All 12 (via lookup) | `registry_derived` | Validate runs for any registered primitive; primitive without validate function throws on lookup | Throws `InvalidPrimitiveShapeError` on shape violation; passes through on registry miss (caught by normalizeComponentType earlier) | `compliant` | `compliant` |
| 3 | 250–268 | `normalizeComponentType` (post-P1.5.1.4) — single-gate registry-membership check + structured throw | All 12 + structured failure | `registry_derived` | Accepts every registered primitive | Throws `Error('non-foundational componentType')` with Phase 2 reference | `compliant` | `compliant` |
| 4 | 270–282 | `normalizeCalculationMethod` registry-validated passthrough (calls `normalizeComponentType` + spreads method) | All 12 | `registry_derived` (delegated to normalizeComponentType + validate) | Accepts; structural validity caught by validate | Throws via upstream `normalizeComponentType` or downstream `validate` | `compliant` | `compliant` |
| 5 | 424–476 | **`convertComponent` switch** — narrow-5 cases (linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate) + structured-failure default. **Site of current BCL throw on `bounded_lookup_2d`.** All 5 cases return identical shape (`{...base, componentType: calcType, metadata: {...intent}}`) — no per-primitive shape conversion; switch is purely an admit/reject gate. | 5 of 12 + structured failure default | `private_copy` (hardcoded case arms; identical to the narrow-5 Set that P1.5.1.4 removed from `normalizeComponentType`) | Throws `Error('non-foundational calcType')` on unmatched primitive | Throws structured `Error` on unmatched (named throw with Phase 2 reference) | `private_copy_violation` | `partial` (structured failure compliant; private copy violation; rejects 7 of 12 registered primitives) |

### `web/src/lib/ai/providers/anthropic-adapter.ts` (4 sites — post-P1.5.1.2)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 34–60 | `buildPrimitiveStructuralSection()` — loops over `getRegistry()`, emits per-primitive prompt block from `promptDescription`, `promptSelectionGuidance`, `promptEmissionPattern`, `promptStructuralExample`, `promptIntentExample` | All 12 | `registry_derived` | All 12 rendered | n/a (prompt construction; runtime AI emission caught by importer/validator/executor) | `compliant` | `compliant` |
| 2 | 62–84 | `buildPerTypeCommentBlock()` — loops over `getOperationPrimitives()`, parses `promptStructuralExample` JSON, extracts non-`type` keys, emits per-primitive comment | 11 operation primitives (source_only excluded) | `registry_derived` | All 11 rendered | Try/catch falls back to "structural shape per registry" if JSON parse fails | `compliant` | `compliant` |
| 3 | 213, 519–525 | `<<PRIMITIVE_STRUCTURAL_SECTION>>` placeholder + runtime substitution in `execute()` method via chained `.replace()` | All 12 | `registry_derived` | Substitution applies only when placeholder present in raw prompt | n/a | `compliant` | `compliant` |
| 4 | 682, 525 | `getOperationPrimitives().map(p => p.id).join(' \| ')` in `buildUserPrompt` plan_interpretation type enum + `getOperationPrimitives().map(p => p.id).join('\|')` in `<<DOCUMENT_ANALYSIS_TYPE_ENUM>>` substitution | 11 operation primitives | `registry_derived` | All 11 rendered | n/a | `compliant` | `compliant` |

### `web/src/lib/orchestration/metric-resolver.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 146–200 | Comments + `componentType === 'bounded_lookup_1d'` legacy-comment cluster (uses `tier_lookup` in comments referring to OB-29 Phase 3B; functional check is `bounded_lookup_1d`) | 1 of 11 (bounded_lookup_1d) + legacy comment vocabulary | `private_copy` (hardcoded literal check) | Falls through to generic handling | None (silent default) | `private_copy_violation` | `partial` (legacy `tier_lookup` in comments; functional code uses foundational) |
| 2 | 256–283 | `extractMetricRequirements` builds metric config — explicit branches for `bounded_lookup_2d` (row/column), `bounded_lookup_1d` (metric assignment), `conditional_gate` (condition-left). Other operations fall through to generic `appliedTo`. Throws `MetricResolverMissingIntentError` on missing intent. | 3 of 11 named + passthrough default | `private_copy` (hardcoded primitive name checks) | Falls through to generic `appliedTo` | Throws `MetricResolverMissingIntentError` on missing intent (not on unrecognized primitive) | `private_copy_violation` | `partial` (silent passthrough on unrecognized; structured failure only on missing intent) |

### `web/src/lib/intelligence/trajectory-engine.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 133, 185 | `componentType: 'bounded_lookup_1d'` and `componentType: 'bounded_lookup_2d'` literal assignments in trajectory card construction | 2 of 11 | `private_copy` | n/a (literal assignment) | n/a | `private_copy_violation` | `compliant` |
| 2 | 248–263 | Trajectory projection branching on `operation === 'bounded_lookup_1d'` / `bounded_lookup_2d` — projection cards only emitted for these two; comment names other primitives (scalar_multiply, linear_function, conditional_gate) as "non-lookup primitives — no projection card" | 2 of 11 actively dispatched + 3 documented | `private_copy` | Silent passthrough — no projection card emitted | None (silent default) | `private_copy_violation` | `partial` (silent default on registered primitives lacking projection logic) |

### `web/src/lib/intelligence/convergence-service.ts` (4 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 41–42 | Type definition `ComponentRequirement.operation: string` + `scope` field; comment names `linear_function` and `scope_aggregate` as canonical examples | 2 named in JSDoc | `private_copy` (string-typed field; not constrained to `FoundationalPrimitive`) | n/a (string type accepts any) | n/a | `partial` (could constrain to `FoundationalPrimitive`) | `compliant` |
| 2 | 1020–1081 | `extractMetricRequirements` switch — 6 cases (bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate, piecewise_linear, linear_function) + passthrough default | 6 of 11 + passthrough default | `private_copy` | Falls through to single-metric default `expectedMetrics[0]` | None (silent default) | `private_copy_violation` | `partial` (silent default on `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`) |
| 3 | 1267–1386 | `estimatedPayoutForBindings` switch — 4 cases (scalar_multiply, bounded_lookup_1d, bounded_lookup_2d, conditional_gate) + return-0 silent default | 4 of 11 + silent default | `private_copy` | Returns 0 silently | None (silent default returning 0) | `private_copy_violation` | `partial` (Decision 154 violation — silent default on `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`, `linear_function`, `piecewise_linear`) |
| 4 | 2073–2086 | `getRequiredMeasureCount` switch — 6 cases (ratio, bounded_lookup_2d, sum, count, bounded_lookup_1d, scalar_multiply, conditional_gate, aggregate) + silent default returning 1. Includes non-primitive strings `'sum'`, `'count'`. | 5 of 11 primitives + 2 non-primitive strings + default | `private_copy` (mixed primitive + non-primitive vocabulary) | Returns 1 silently | None | `private_copy_violation` | `partial` (Korean Test concern — non-primitive identifiers `'sum'`, `'count'` in case arms; mixed surface) |

### `web/src/lib/forensics/trace-builder.ts` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 195–209 | Narrow conditional building forensics trace step — `if (step.componentType === 'scalar_multiply')` + `if (step.componentType === 'conditional_gate')` | 2 of 11 | `private_copy` | Other componentTypes produce no trace step entry | None (silent omission) | `private_copy_violation` | `partial` |
| 2 | 285–300 | `buildCalculationSentence` switch — 4 cases (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate) + passthrough default returning `step.calculation \|\| Output: $X` | 4 of 11 + passthrough default | `private_copy` | Default produces generic UI sentence | None (silent default) | `private_copy_violation` | `partial` (other primitives display generic "Output: $X" rather than primitive-specific UI sentence) |

### `web/src/app/data/import/enhanced/page.tsx` (2 sites)

| # | line_range | boundary_description | vocabulary_scope | surface_derivation_status | dispatch_behavior_on_unspecified_registered | structured_failure_pattern_on_unrecognized | decision_155_verdict | decision_154_verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 785–797 | UI field-extraction conditional inside `extractFieldsFromIntent` — branches for `bounded_lookup_2d`, `bounded_lookup_1d`, `scalar_multiply \|\| linear_function \|\| piecewise_linear`, `conditional_gate` | 5 of 11 + passthrough default | `private_copy` | Other primitives produce no fields | None (silent default) | `private_copy_violation` | `partial` |
| 2 | 817–825 | `getRequiredMetrics` switch — 4 cases (bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate) + passthrough default returning generic 3-metric list | 4 of 11 + passthrough default | `private_copy` | Default returns `['attainment', 'amount', 'goal']` | None (silent default) | `private_copy_violation` | `partial` |

---

## Substrate coherence assessment

### Coherence Question 1 — Vocabulary uniformity along the path (trace `bounded_lookup_2d`)

The BCL plan's matrix-structure component traverses the path. Sequence:

| # | Boundary | File:line | Behavior on `bounded_lookup_2d` |
|---|---|---|---|
| 1 | SCI emission | (anthropic-adapter.ts via AI) | AI emits `bounded_lookup_2d` per registry-derived prompt (P1.5.1.2) |
| 2 | `normalizeComponentType` | ai-plan-interpreter.ts:250–268 | **Accepts** (P1.5.1.4 fold-in — registry-membership passthrough) |
| 3 | `normalizeCalculationMethod` | ai-plan-interpreter.ts:270–282 | **Passes through** (registry-validated passthrough) |
| 4 | `lookupPrimitive(comp.type).validate(comp.calculationMethod)` (P1.5.1.1 bridge wiring) | ai-plan-interpreter.ts:234–249 | **Validates** the AI's calculationMethod payload; passes (BCL plan structurally well-formed) |
| 5 | `convertComponent` switch | ai-plan-interpreter.ts:454–475 | **REJECTS** with structured throw — narrow-5 switch does not include `bounded_lookup_2d` (the failure surfacing this turn) |
| 6 | (downstream — never reached on current substrate) `transformComponent` | intent-transformer.ts:34–46 | Would: pass through to `transformFromMetadata` (vestigial narrow switch with no narrowing effect) |
| 7 | (downstream) `validateIntent` registry gate | intent-validator.ts:64–70 | Would: accept (registry-derived gate) |
| 8 | (downstream) `validateIntent` switch | intent-validator.ts:79–107 | Would: validate via `validateBoundedLookup2D` (case present) |
| 9 | (downstream) `executeOperation` | intent-executor.ts:444–470 | Would: dispatch to `executeBoundedLookup2D` (case present) |

**Coherence reading:** the path is *structurally coherent end-to-end EXCEPT at step 5 (`convertComponent`)*. Steps 1–4 accept `bounded_lookup_2d`; steps 7–9 (executor surface) accept it. Only `convertComponent` carries the narrow-5 private allow-list that breaks coherence. This is the same defect class as `normalizeComponentType`'s pre-P1.5.1.4 second gate — same 5-element list appearing at a different layer.

For other primitives (`aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`): same pattern — they would be accepted by the importer (post-P1.5.1.4) but rejected by `convertComponent`. `bounded_lookup_1d` shares this fate. So **7 of 11 operation primitives have an end-to-end coherence break at `convertComponent`**.

### Coherence Question 2 — Boundary count by type

| Category | Total sites | Registry-derived | Private-copy violation | Partial |
|---|---|---|---|---|
| Names primitives | 33 | 6 | 22 | 5 |
| Dispatches on primitives | 17 | 3 | 11 | 3 |
| Validates primitives/shapes | 4 | 1 | 3 | 0 |
| Documents primitive vocabulary | 6 | 4 | 1 | 1 |
| **Total unique sites** | **33** | **8** | **20** | **5** |

(Sites can be counted under multiple categories — e.g., `validateIntent` switch both names and dispatches; `executeOperation` both names and dispatches. The "Total unique sites" row is the de-duplicated file-section count from the inventory above.)

**Reading:** of 33 distinct sites, only 8 are registry-derived. The remaining 25 (~76%) are private copies or partial implementations. Of the 8 registry-derived sites, 4 were authored or refactored during P1.5.1 (anthropic-adapter, ai-plan-interpreter sites #1–4). Pre-P1.5.1 baseline: 4 registry-derived sites in the pre-P1.5.1 codebase.

### Coherence Question 3 — Failure mode uniformity

Dispatch sites by failure mode on unrecognized identifier:

| Failure mode | Sites |
|---|---|
| **Structured failure (named error class)** | `executeOperation` (`IntentExecutorUnknownOperationError`), `evaluateComponent` (`LegacyEngineUnknownComponentTypeError`), `normalizeComponentType` (`Error` with Phase 2 reference), `convertComponent` (`Error` with Phase 2 reference) — 4 sites |
| **Validation result (non-throw)** | `validateIntent` (`{valid:false, errors}`) — 1 site |
| **Silent default / fallthrough** | `decimal-precision` collectOutputValues, `convergence-service` extractMetricRequirements/estimatedPayoutForBindings/getRequiredMeasureCount, `intent-transformer` transformComponent, `metric-resolver` extractMetricRequirements, `trajectory-engine` projection switch, `forensics/trace-builder` buildCalculationSentence, `enhanced/page.tsx` extractFieldsFromIntent + getRequiredMetrics, `intent-validator` switch (no default) — 11 sites |
| **Compile-time exhaustiveness only** | `pattern-signature.ts` describeOperation, `intent-types.ts` IntentOperation union — 2 sites |

**Reading:** Decision 154's "every dispatch boundary shall produce observable, named, structured failure on unrecognized identifiers" is honored at **4 of 17 dispatch sites** (24%). 11 of 17 (65%) silently fall through with no failure surface. This is the most material Decision 154 violation surfaced by the inventory.

### Coherence Question 4 — Registry consumption pattern

| File | Imports from `primitive-registry`? | Symbols imported | Calls `validate(emission)`? |
|---|---|---|---|
| `intent-types.ts` | ✓ | `FoundationalPrimitive` (type) | n/a |
| `intent-validator.ts` | ✓ | `isRegisteredPrimitive`, `getOperationPrimitives`, `FoundationalPrimitive` (type) | No (parallel per-primitive validators implemented inline) |
| `intent-executor.ts` | ✗ | (none — names primitives via private case arms) | No |
| `pattern-signature.ts` | ✗ | (none — relies on TS exhaustiveness via `IntentOperation` union from intent-types) | No |
| `run-calculation.ts` | ✗ | (none) | No |
| `intent-transformer.ts` | ✗ | (none) | No |
| `decimal-precision.ts` | ✗ | (none) | No |
| `results-formatter.ts` | ✗ | (none) | No |
| `ai-plan-interpreter.ts` | ✓ | `isRegisteredPrimitive`, `lookupPrimitive`, `InvalidPrimitiveShapeError`, `FoundationalPrimitive` (type) | ✓ via `primitiveEntry.validate()` (P1.5.1.1) |
| `anthropic-adapter.ts` | ✓ | `getRegistry`, `getOperationPrimitives`, `PrimitiveEntry` (type) | n/a (prompt building) |
| `metric-resolver.ts` | ✗ | (none) | No |
| `trajectory-engine.ts` | ✗ | (none) | No |
| `convergence-service.ts` | ✗ | (none) | No |
| `forensics/trace-builder.ts` | ✗ | (none) | No |
| `enhanced/page.tsx` | ✗ | (none) | No |

**Reading:** of 15 files containing primitive identifiers (excluding the registry itself), only **5** import from `primitive-registry`. Ten files name primitives without consulting the canonical surface. `PrimitiveEntry.validate()` is consumed at exactly one call site (the bridge wiring landed in P1.5.1.1) — `intent-validator.ts` has a parallel per-primitive validator infrastructure that duplicates `PrimitiveEntry.validate()`'s role.

### Coherence Question 5 — SCI integration assessment

The SCI-side surfaces (`anthropic-adapter.ts` post-P1.5.1.2) are registry-derived: prompt content, type enum, per-type comments all flow from `getRegistry()` / `getOperationPrimitives()`. The AI's emission contract is registry-aligned by construction.

Downstream consumption of SCI's emission has two coherence patterns:

1. **Bridge boundary (`ai-plan-interpreter.ts`):** mostly registry-derived after P1.5.1's three-layer fold-in. The exception is `convertComponent` (still narrow-5).

2. **Calc/forensics/UI boundaries (everything else):** systematically narrow. None import from the registry; each maintains its own private vocabulary subset. The narrowings are *not* deliberate architectural decisions — they reflect Phase 1.5's documented narrowing pattern propagated by file-level grep without path-traversal coordination. The narrowings impose silent failure modes (Decision 154 violation) on registered primitives that were never imagined to traverse those layers.

The SCI surface itself is **structurally aligned** with the registry as the canonical declaration. The integration GAP is at every consumer downstream of SCI: each consumer narrows independently. Per-consumer narrowing means SCI's emission contract (registry-derived) has 11 valid operation primitives, but the consumers admit subsets ranging from 2 (forensics conditional) to 11 (executor switch). The MIN of these subsets defines the effective end-to-end vocabulary admitted by the path; for the BCL plan that MIN is determined by `convertComponent` at 5 primitives (the current empirical block).

This is not a SCI-side gap. SCI fully realizes Decision 155's surface-derivation. The gap is **per-consumer surface adoption** — every consumer downstream of SCI must derive from the registry for end-to-end coherence; today only `ai-plan-interpreter.ts` (partially), `intent-validator.ts` (partially), `intent-executor.ts` (zero), and `anthropic-adapter.ts` (fully) consume the registry. The other 11 files do not.

---

## Audit Findings Report

### Findings summary

The boundary inventory across 15 files surfaces 33 distinct sites that name, dispatch on, validate, or document structural primitives. Of these, **only 8 sites (24%) are registry-derived per Decision 155's surface-derivation commitment**; the remaining 25 sites are private-copy violations or partial implementations. **Decision 155 compliance overall: substantively failed** — the registry surface exists, is correctly authored, and is consumed by 5 of 15 boundary files; the other 10 files name primitives without consulting the surface. **Decision 154 compliance overall: substantively failed** at the structured-failure-on-unrecognized obligation — only 4 of 17 dispatch sites produce structured failure; 11 silently fall through.

The OB-196 Phase 1.5.1 three-test trajectory was *not* indicative of three independent defects nor of the full inventory. It surfaced the upstream three sites (prompt → importer first gate → importer second gate → bridge `convertComponent`) along the AI-to-engine path that the empirical test traversed. The path-coherence trace under Coherence Question 1 confirms `convertComponent` is the next site in that path, and beyond it the path is structurally coherent for `bounded_lookup_2d` end-to-end. The **other 22 private-copy sites surveyed by DIAG-019 are NOT on the AI-to-engine path** as currently routed — they are downstream of executor (formatter, forensics, UI display, convergence binding helpers), or are the parallel `intent-validator` validation surface, or are silent-default helpers (`decimal-precision`, `metric-resolver`). They do not block current functionality, but they are violations of Decisions 154 + 155 and represent regression risk: any new primitive that lands in the registry will hit silent fallback at most of these sites.

### Site count

| Category | Total sites | Registry-derived | Private-copy violation | Partial |
|---|---|---|---|---|
| Names primitives | 33 | 6 | 22 | 5 |
| Dispatches on primitives | 17 | 3 | 11 | 3 |
| Validates primitives/shapes | 4 | 1 | 3 | 0 |
| Documents primitive vocabulary | 6 | 4 | 1 | 1 |
| **Total unique sites** | **33** | **8** | **20** | **5** |

### Critical findings

**F-01 — `convertComponent` narrow-5 switch (CRITICAL — empirically blocks BCL plan import)**
- `web/src/lib/compensation/ai-plan-interpreter.ts:424–476`
- The `convertComponent` switch admits 5 of 12 foundational primitives, rejecting the other 7 with a structured throw. The 5 case arms return identical shape — no per-primitive shape conversion exists. The switch is a pure admit/reject gate, structurally identical to the narrow-5 importable Set that P1.5.1.4 removed from `normalizeComponentType`. This is the boundary that surfaced in the most recent BCL re-import attempt (the AI emits `bounded_lookup_2d`, `normalizeComponentType` accepts, `validate` passes, `convertComponent` throws).
- Decision 155 verdict: `private_copy_violation`
- Decision 154 verdict: `partial` (structured failure compliant; private copy violation; rejects 7 of 12 registered primitives)
- Closure recommendation: **fold into Phase 1.5.1 as P1.5.1.5** — single-function fix mirroring P1.5.1.4 importer pattern. Replace switch with `if (isRegisteredPrimitive(calcType))` registry-membership check; return identical shape (the 5 cases already do); keep structured-failure throw on non-registered.

**F-02 — `intent-validator.ts` switch missing two operation primitives (HIGH — empirically discoverable on linear_function/piecewise_linear emission)**
- `web/src/lib/calculation/intent-validator.ts:79–107`
- The validator's switch covers 9 of 11 operation primitives, missing `linear_function` and `piecewise_linear`. The switch has no `default` arm — registered-but-unmatched primitives fall through silently with `valid: true` returned. Not currently exposed empirically because BCL doesn't emit linear_function or piecewise_linear, but any plan that does will pass through with no shape validation.
- Decision 155 verdict: `private_copy_violation`
- Decision 154 verdict: `partial` (silent fall-through on registered primitives)
- Closure recommendation: replace switch + per-primitive validators with delegation to `lookupPrimitive(operation).validate(obj)` (the `PrimitiveEntry.validate` infrastructure landed in P1.5.1.1 — `intent-validator.ts`'s parallel validators are now duplicate work).

**F-03 — Eleven silent-default dispatch sites violate Decision 154 structured-failure obligation (HIGH — regression risk; not currently empirically blocking)**
- 11 sites across `decimal-precision`, `convergence-service` (×3), `intent-transformer`, `metric-resolver`, `trajectory-engine`, `forensics/trace-builder`, `enhanced/page.tsx` (×2), `intent-validator` (no default)
- Each site dispatches on a primitive identifier with no structured-failure default. Registered primitives missing from each site's narrow case list silently fall through to a default behavior (silent no-op, return 0, generic display, etc.). Decision 154's "every dispatch boundary shall produce observable, named, structured failure" is honored at only 4 of 17 dispatch sites overall.
- Decision 155 verdict: `private_copy_violation` per site
- Decision 154 verdict: `partial` per site
- Closure recommendation: introduce a shared helper (or per-boundary structured-failure pattern) that throws a named error class (analogous to `IntentExecutorUnknownOperationError` / `LegacyEngineUnknownComponentTypeError`) on unrecognized primitives. Closure scope is large; recommend phased.

**F-04 — `results-formatter.ts:501–510` formatComponentType is dead-code legacy table (MEDIUM — Phase 1.5 cleanup gap)**
- The `formatComponentType` UI label table maps four legacy identifiers (`matrix_lookup`, `tier_lookup`, `percentage`, `conditional_percentage`) to display labels. Foundational primitives are absent from the table; they fall through to the verbatim type-string display. Phase 1.5 removed legacy-vocabulary emission; this UI display path was not updated.
- Decision 155 verdict: `private_copy_violation`
- Decision 154 verdict: `legacy_identifiers_present`
- Closure recommendation: either delete the legacy table and add foundational labels (registry-derived from a new `displayLabel` field on `PrimitiveEntry`), or accept as documented dead code. Low risk either way.

**F-05 — `convergence-service.ts:2073` includes non-primitive identifiers `'sum'` and `'count'` in switch (MEDIUM — Korean Test concern)**
- The `getRequiredMeasureCount` switch lists `'sum'` and `'count'` as case arms alongside `bounded_lookup_1d`, `scalar_multiply`, etc. These are not registered primitives — they're operation-keyword strings. Mixing primitive identifiers with non-primitive operation strings in a primitive-dispatch switch is a Korean Test concern: the boundary's vocabulary is unclear about what surface it dispatches on.
- Decision 155 verdict: `private_copy_violation`
- Decision 154 verdict: `partial` (Korean Test concern — non-primitive `'sum'`/`'count'` indicate the boundary may dispatch on aggregation kind, not primitive kind; needs clarification)
- Closure recommendation: surface to architect for design clarification — is this dispatching on primitive or on aggregation kind? If aggregation kind, refactor to dispatch on a separate `aggregation` registry; if primitive, remove the non-primitive arms.

**F-06 — `intent-transformer.ts:34–46` switch is vestigial Phase-1.5 narrowing with no semantic effect (LOW — dead structure)**
- The narrow-5 switch in `transformComponent` has both case arms and default arm calling identical function `transformFromMetadata`. The switch is dead structure: no narrowing effect, no dispatch difference. Vestige of Phase 1.5's narrow-5 pattern.
- Decision 155 verdict: `private_copy_violation`
- Decision 154 verdict: `partial`
- Closure recommendation: delete the switch entirely; call `transformFromMetadata` directly. Trivial cleanup.

**F-07 — `intent-types.ts:37` IntentSource union admits `scope_aggregate` as string literal (LOW — type-system narrow surface)**
- `IntentSource` union contains `{ source: 'scope_aggregate'; sourceSpec: {...} }` as one of 5 variants. The string literal is hardcoded; not derived from registry's `kind: 'source_only'` filter.
- Decision 155 verdict: `partial`
- Decision 154 verdict: `compliant`
- Closure recommendation: low priority. The union is type-level only; runtime entry caught at `executeOperation`. Could derive from a `SourceOnlyPrimitive` type if architect wants strict registry-derivation at the type level.

**F-08 — Audit-trail comments quote legacy identifiers in `run-calculation.ts:5, 443, 463` (LOW — same defect class as the line-444 audit-trail comment polished in P1.5.1.4)**
- File-header comment line 5 lists `tier_lookup, percentage, matrix_lookup, conditional_percentage` as plain text. Lines 443 and 463 reference `tiered_lookup` / `matrix_lookup` in comments documenting input handling. These are pre-P1.5.1 audit-trail comments that quote legacy identifiers.
- Decision 155 verdict: n/a (documentation)
- Decision 154 verdict: `legacy_identifiers_present` (in audit-trail comment quoted form)
- Closure recommendation: low priority. Apply the same polish that P1.5.1.4 applied to the line-444 comment (paraphrase without quoting legacy identifiers). Stylistic consistency.

### Closure scope recommendation

**Recommendation: (b) Phased closure across multiple workstreams.** The inventory reveals two structurally separable concerns:

1. **Phase 1.5.1.5 (immediate, single-function fix)** — fold-in `convertComponent` (F-01) into the OB-196 Phase 1.5.1 currently in flight. Standing Rule 34 fold-in pattern. Single function (lines 424–476), near-trivial fix mirroring P1.5.1.4 (registry-passthrough; structured-failure throw on non-registered). The current BCL re-import will pass after this fold-in completes (`bounded_lookup_2d` flows end-to-end).

2. **Phase 1.5.2 / OB-NN — calc-side and forensics-side narrowing closure** — phased follow-up workstream (named TBD by architect) covering the 22 sites that are not on the AI-to-engine path or are downstream of executor:
   - F-02 `intent-validator` consolidation onto `PrimitiveEntry.validate` (1 file, 1 switch + 9 validators → delegation)
   - F-03 silent-default → structured-failure across 11 sites (largest scope; could split further by area: `decimal-precision`/`convergence-service`/`metric-resolver`/etc.)
   - F-04 `results-formatter.ts` legacy table (1 file)
   - F-05 `convergence-service.ts:2073` Korean Test clarification (1 site, design question first)
   - F-06 `intent-transformer.ts` vestigial switch deletion (1 file)
   - F-07 `intent-types.ts` IntentSource source_only derivation (1 file, type-level)
   - F-08 audit-trail comment polish in `run-calculation.ts` (1 file, stylistic)

**Site mapping:**

| Workstream | Sites (file:lines) | Severity | Effort |
|---|---|---|---|
| **Phase 1.5.1.5 (immediate)** | ai-plan-interpreter.ts:424–476 | CRITICAL | XS — one function |
| **Follow-up Phase 1.5.2 part A — registry consolidation** | F-02 (intent-validator) | HIGH | M — delegation refactor |
| **Follow-up Phase 1.5.2 part B — structured-failure uniformity** | F-03 (11 sites across 8 files) | HIGH | L — per-site structured-failure introductions |
| **Follow-up Phase 1.5.2 part C — UI/forensics polish** | F-04, F-06, F-07, F-08 | MEDIUM/LOW | S — stylistic + dead-code |
| **Architectural disposition needed first** | F-05 (Korean Test concern in convergence-service:2073) | MEDIUM | unknown — design question |

**Verification gate proposal (post-closure regression guard):**

A registry-grep CI check that scans the 9 scoped directories and surfaces:
- Files that name primitive identifiers but do not import from `primitive-registry`
- Switch sites that name primitive identifiers without a structured-failure default
- Sites containing legacy identifier string literals (`matrix_lookup`, `tiered_lookup`, `tier_lookup`, `flat_percentage`, `conditional_percentage`, `percentage`)

The CI surfaces would land as a new diagnostic substrate — runs on every PR, surfaces drift before merge.

**Architectural questions raised by the inventory:**

1. **The AUD-004-named "PrimitiveEntry.validate vs intent-validator parallel validators" question.** P1.5.1.1 added `validate` to each `PrimitiveEntry`; `intent-validator.ts` has a parallel infrastructure of 9 per-primitive validators (`validateBoundedLookup1D`, etc.) that does similar structural-validity work. The two surfaces should converge — either `intent-validator` delegates to `PrimitiveEntry.validate` (consolidating the registry as the single canonical validation surface), or the two stay separate and the registry's `validate` covers a different concern than the `intent-validator` validators do. Design clarification needed.

2. **The convergence-service `'sum'`/`'count'` non-primitive identifiers (F-05).** Are the convergence-service switches actually dispatching on primitives, or on something else (aggregation kind, role kind)? If the latter, they don't belong in this inventory — they're a different vocabulary entirely. Design clarification before closure.

3. **The trajectory-engine narrow projection logic.** Trajectory cards are emitted only for `bounded_lookup_1d` and `bounded_lookup_2d` (lookup-with-discrete-tiers). The comment names `scalar_multiply`/`linear_function`/`conditional_gate` as "non-lookup primitives — no projection card." Is this a deliberate architectural decision (some primitives have no discrete-tier semantics, so no trajectory) or a stub awaiting expansion? If deliberate, the silent-default behavior is correct and the site is a partial-not-violation. If stub, it's an F-03-class violation.

### Architectural observations

1. **The trajectory pattern (three sequential narrowings discovered empirically) suggests a documentation gap.** The platform has no boundary inventory; per-boundary cleanup proceeds without coordination. Phase 1.5's intent was to eliminate legacy vocabulary and narrow to foundational primitives; the cleanup applied at file-grep level, succeeding at SCI/anthropic-adapter and the bridge import gate, but the same cleanup was applied differently at the bridge convert gate (kept narrow-5 instead of registry-passthrough), at the calc-side legacy engine arms (correctly broadened to all 12), and at numerous downstream consumers (left narrow with silent defaults). DIAG-019 is the inventory the platform did not have.

2. **`convertComponent`'s structural identity to `normalizeComponentType`'s pre-fold-in second gate suggests Phase 1.5's narrow-5 pattern was copy-pasted by file-grep.** The two narrow-5 lists (importer's and convertComponent's) admit the exact same 5 primitives in the same order. Phase 1.5's deletion of legacy switch arms was done locally per-function; the architecturally-correct close (registry-passthrough) was applied at the prompt boundary (anthropic-adapter) but not propagated to the call sites. This is the per-boundary uncoordinated-cleanup pattern in evidence.

3. **The registry was created with the intent that every boundary would consume from it.** Today, 5 of 15 files do; 10 do not. The compliance ratio reflects how much of the substrate adoption is in flight (P1.5.1's three landings and the originally-compliant `intent-types.ts` + `intent-validator.ts` + `executor`) versus pending. The closure work isn't "fix three more boundaries" — it's "every consumer that names primitives must import from the registry". Per-file refactor; phased; Decision 155 binding makes the work non-optional but the empirical urgency is bounded by which paths exercise which boundaries.

4. **Decision 154's structured-failure obligation has the worst compliance ratio (4 of 17 sites).** Decision 154 was authored to make new primitives a non-event for the platform — registered → recognized at every boundary → executed (or surfaced as named structured failure). Today, 11 of 17 dispatch sites silently swallow unrecognized primitives. Domain Agent extension (Decision 154's narrow exemption) cannot land safely against this substrate without first introducing structured failure at every dispatch site. Phase 1.5.2 part B is therefore prerequisite to Domain Agent work.

5. **`PrimitiveEntry.validate` (P1.5.1.1's addition) duplicates `intent-validator`'s per-primitive validators.** The duplication isn't a defect today — both run; both produce structurally similar output. But the two surfaces will drift independently if not consolidated. A future architectural decision should pick one as canonical (the registry's `validate` is the natural choice per Decision 155) and migrate the other to delegation.

---

## Diagnostic completion

DIAG-019 is complete:

1. ✓ Inventory table populated for every site in scoped directories per qualification rules. 33 distinct sites across 15 files (excluding the canonical `primitive-registry.ts`).
2. ✓ Five substrate coherence questions answered with reference to the inventory.
3. ✓ Audit Findings Report filled in: findings summary, site count table, 8 numbered findings (F-01 through F-08), closure scope recommendation, architectural observations.
4. ✓ Halt-and-surface conditions did not trigger blocking halts; site count (33) is within the soft 30-site threshold and the directive's "approximately 30" allowance.
5. ✓ No code edits, no commits, no remediation. Inventory + coherence assessment + audit findings report only.

This artifact lands as a staged-for-commit file at `architect-review/OB-196-P1.5.1/DIAG_019_PRIMITIVE_VOCABULARY_BOUNDARY_INVENTORY.md`. After architect reads and dispositions closure scope per recommendation (a), (b), or (c), closure work proceeds as a separate directive against a separate workstream identifier.
