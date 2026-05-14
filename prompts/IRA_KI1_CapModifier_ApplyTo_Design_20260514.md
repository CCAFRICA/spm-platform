# IRA Invocation -- KI-1 Cap-Modifier ApplyTo Design

work_scope: Architectural option evaluation for IntentModifier input-vs-output scope discrimination across LLM emission, type system, and executor layers
output_class: options_based
task_class: architectural_option_evaluation

## Substrate binding hints

IGF-T1-E910, IGF-T1-E907, IGF-T1-E905, IGF-T1-E904, IGF-T1-E903, IGF-T1-E902, IGF-T1-E906, IGF-T1-E952, IGF-T1-E953, IGF-T1-E947, IGF-T2-E01, IGF-T2-E08, IGF-Decision-151, IGF-Decision-153, IGF-Decision-122, IGF-Decision-127, IGF-Decision-154

## Empirical constraints (code-justified, not inferred)

C1: The IntentModifier type has no applyTo field. All modifiers are structurally outcome-scoped. Source: DIAG-041 Phase 3.6 (zero hits for applyTo in codebase).

C2: The applyModifiers function in intent-executor.ts:540-578 runs AFTER executeOperation returns. Cap dispatch is:
```typescript
case 'cap': {
  const cap = toDecimal(mod.maxValue);
  result = result.gt(cap) ? cap : result;
}
```
Source: AUD-005 live code extraction at commit 5314c365.

C3: The LLM emits cap modifier blobs via the plan_interpretation prompt at anthropic-adapter.ts:600-611. Zero deterministic emission sites exist in ai-plan-interpreter.ts. Cap values originate entirely from LLM output. Source: DIAG-041 Phase 5.2.

C4: The Meridian plan PPTX Slide 5 states "Tope maximo: 150% (utilizacion superior se limita a 1.5x)." The cap is ratio-space (clamp the utilization ratio before multiplying by base bonus), not payout-space (clamp the dollar output after multiplying). Source: architect-channel plan document read.

C5: The intent-transformer (intent-transformer.ts, 222 lines, 8 existing transformations) rewrites intent shapes. The conditional_gate primitive exists in the executor and can express min(ratio, 1.5) as a nested operation. Source: DIAG-041 Phase 3.7, Phase 4.2.

C6: CRP Plan 2 uses modifiers: [{ maxValue: 5000, modifier: 'cap' }] on piecewise_linear components. This cap IS payout-space (correctly outcome-scoped). Any fix must preserve this existing correct behavior.

C7: The calculation processing path is: LLM emission -> intent-transformer normalization -> intent-executor operation -> applyModifiers -> roundComponentOutput. This is a single unified path per Decision 151. Source: AUD-005 route.ts execution flow.

C8: The execution trace records modifiers: [{ modifier: 'cap', before: X, after: Y }]. Any architectural change that alters how caps are applied changes the trace shape visible to reconciliation, dispute, and explanation surfaces.

## Options under evaluation

Option A -- Intent-transformer conditional_gate rewrite (single-layer fix at transformer).

Add a 9th transformation to intent-transformer.ts. Detect scalar_multiply with ratio input and cap modifier. Rewrite cap to conditional_gate wrapping the ratio input; remove the modifier from the modifiers array. No type system change. No executor change. LLM continues emitting the same shape; transformer silently corrects it.

Unexamined implications: (a) Detection heuristic must distinguish ratio-space caps from payout-space caps without Korean Test violation. (b) Creates a permanent compensating control for LLM emission deficiency. (c) Trace shape changes (no cap modifier in trace; conditional_gate appears in input tree instead). (d) Persisted vs transient rewrite has audit-trail implications. (e) Does not close the schema gap; future modifier scoping needs remain unaddressable.

Option B -- IntentModifier applyTo discriminant (three-layer fix at type + executor + prompt).

Add optional applyTo: 'input' | 'output' field to IntentModifier type. Default 'output' preserves all existing behavior. When 'input', applyModifiers runs the modifier against the resolved input value before the operation. LLM prompt amended to emit applyTo when plan semantics indicate input-scoped modifier. Existing payout-space caps (CRP) unaffected by default.

Unexamined implications: (a) Cross-cutting type change touches IntentModifier consumers across executor, transformer, validator, trace emitter. (b) LLM must learn to emit applyTo correctly -- non-deterministic. (c) Trace shape gains applyTo field -- additive, not breaking. (d) Schema expressiveness gap closed permanently. (e) Any future modifier type (floor, proration) also gains input/output discrimination without further type changes.

Option C -- LLM prompt amendment only (emission-layer fix at anthropic-adapter.ts).

Amend the plan_interpretation prompt to instruct the LLM to emit conditional_gate-wrapped intent shapes when the plan indicates input-scoped caps. No type system change. No executor change. No transformer change. LLM produces the correct shape directly.

Unexamined implications: (a) Non-deterministic -- LLM may emit the old shape for some plans. (b) Does not fix existing Meridian rule_set data (requires plan re-interpretation). (c) Does not close the schema gap (IntentModifier still structurally outcome-only). (d) No compensating control if LLM regresses. (e) Reinforces unified processing path (no transformer rewrite layer).

## Question

Given constraints C1-C8, rank Options A/B/C per:
- Adherence to E910 (Korean Test -- no language-specific or numeric-range heuristics for detection)
- Adherence to E907 (Fix Logic Not Data -- structural code fix, not data backfill)
- Adherence to E952 (Adjacent-Arm Drift -- closure at structural class, not instance)
- Adherence to E953 (Decision-Implementation Gap -- schema expresses what the plan means)
- Adherence to Decision 151 (intent executor sole authority -- single unified processing path)
- Adherence to Decision 153 (plan intelligence forward -- comprehension flows through signal surface)
- Regression safety (CRP payout-space caps and BCL calculations unchanged)
- Trace-shape coherence (reconciliation, dispute, explanation surfaces remain interpretable)
- Processing-path unity (one path from emission to execution, no compensating-control branches)

Return option_recommendations with rank and alignment_reasoning per axis.

T0-E09 v7 schema contract: required array fields -- emit as [] if no entries:
- applicable_entries
- excluded_candidates
- option_recommendations (one entry per option: A, B, C)
- supersession_candidates (existing entries needing modification)
- possible_gaps (no existing entry governs this dimension; new substrate candidate)

Disambiguation:
- "IntentModifier type needs applyTo field extension" -> supersession_candidates (type definition exists, needs extension)
- "No substrate entry governs modifier-scope discrimination as an architectural primitive" -> possible_gaps (no entry exists for this concept)

Pre-conclusion emission-completeness verification: confirm every required array field emitted before output.
