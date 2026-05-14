# IRA Response -- KI-1 Cap-Modifier ApplyTo Design

**Invocation date:** 2026-05-14
**Prompt file:** prompts/IRA_KI1_CapModifier_ApplyTo_Design_20260514.md
**Invocation command:** `npm run ira -- "$QUESTION"` (executed from ~/vialuce-governance; CLI lives there per package.json)

## Raw IRA output

```

> vialuce-governance@0.1.0 ira
> node --env-file=.env.local node_modules/.bin/tsx scripts/invoke_ira.ts # IRA Invocation -- KI-1 Cap-Modifier ApplyTo Design

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

[surface] prompt source {
  invocation_id: '848679c2-b50f-47c5-a9b7-e3e26f568187',
  source: 'surface',
  ambient_count: 77,
  density_count: 269,
  total_entries: 346,
  procedural_count: 40
}
[surface] shadow divergence {
  invocation_id: '848679c2-b50f-47c5-a9b7-e3e26f568187',
  fingerprint: 'b449cd66dd597024fe5b087ad0fc7e12af5975b9b1c20b8772dcb2aa53a2aa4f',
  procedural_count: 40,
  surface_count: 346,
  overlap: 32,
  procedural_only: 8,
  surface_only: 314
}
=== IRA PACKET ===
{
  "task_class": "other",
  "ip_entries": [
    {
      "id": "IGF-T1-E910",
      "tier": 1,
      "title": "The Korean Test (Unifying Meta-Principle)",
      "content": {
        "origin": "Base TMR OB-24 R9 (thought experiment). Addendum 10 / Decision 66 (automated grep enforcement). Memory AP-25 (structural heuristics). CC_STANDING_RULES v3.0 (language strings). DS-014 §2.4 (capability vocabulary). Decision 24 implied (calculation primitives).",
        "rationale": "The exemplar case for why the governing principle tier exists. Six or seven distinct scope expressions across documents with no single document capturing the unifying meta-principle. The inventory designates this as the anchor case and the canonical proof that vialuce has an unwritten meta-layer. Requires its own focused session per handoff Section 8.",
        "statement": "If you replaced every field name, component name, plan name, and data_type with Korean equivalents, would the platform still produce correct results? All field identification must use structural heuristics (value ranges, data types, column distributions), never field-name matching in any language. Zero language-specific or domain-specific string literals in foundational code.",
        "cross_references": [
          "Decision 66",
          "AP-25 (with numbering collision note)",
          "P-04 AI-First / No Hardcoded Assumptions",
          "Cluster 4 in inventory"
        ],
        "disposition_note": "The inventory recommends this not be dispositioned without the focused Meta-Principle Architecture session scoped in handoff Section 8. Capturing here to prevent further silent drift while the focused session is scheduled.",
        "drift_assessment": "HIGHEST in inventory. 6-7 distinct scope expressions, no unifying statement, AP-25 numbering collision.",
        "scope_expressions_found": 7
      },
      "why_it_binds": "Statement: 'All field identification must use structural heuristics (value ranges, data types, column distributions), never field-name matching in any language. Zero language-specific or domain-specific string literals in foundational code.' Option A requires a detection heuristic in the transformer to distinguish ratio-space caps from payout-space caps. If that heuristic relies on field names, plan names, modifier labels, or numeric-range thresholds rather than structural type information, it violates this principle. Option B's applyTo discriminant is a structural type field — the discrimination is encoded in the schema, not inferred from content. Option C delegates discrimination to LLM emission, which is non-deterministic but not structurally heuristic-dependent. The Korean Test is the primary discriminator between Options A and B on the detection axis."
    },
    {
      "id": "IGF-T1-E907",
      "tier": 1,
      "title": "Fix Logic, Not Data",
      "content": {
        "origin": "Base TMR. Standing Rule 34 is the operational descendant.",
        "rationale": "Standing Rule 34 (No Bypass Recommendations) is one of memory's most-invoked rules and is the direct descendant of this meta-principle. The meta-principle is older and broader than Rule 34. Addendum 10 (Stale State Prevention) cites it correctly.",
        "statement": "Never give the answer; fix the derivation. Diagnose and fix structurally — no workarounds, configuration changes, reduced scope tests, or interim measures.",
        "cross_references": [
          "Standing Rule 34 (No Bypass Recommendations)",
          "P-37 Stale State Prevention (Addendum 10)"
        ],
        "drift_assessment": "MEDIUM. Strong descendant in memory (Rule 34) but meta-principle name not preserved."
      },
      "why_it_binds": "Statement: 'Never give the answer; fix the derivation. Diagnose and fix structurally — no workarounds, configuration changes, reduced scope tests, or interim measures.' The Meridian cap bug is a structural deficiency: IntentModifier has no way to express input-vs-output scope. Option A is a compensating control (transformer rewrites the shape silently) — it gives the answer rather than fixing the derivation. Option B fixes the derivation by adding the applyTo discriminant to the type system. Option C attempts to fix the emission but without structural enforcement, making it a non-deterministic workaround. This principle directly ranks B > A > C on the structural-fix axis."
    },
    {
      "id": "IGF-T1-E902",
      "tier": 1,
      "title": "Carry Everything, Express Contextually",
      "content": {
        "origin": "Addendum 1, CLT-14B / OB-27B. Born from $392,577 underpayment caused by AI-as-filter pattern.",
        "rationale": "Core architectural principle already in memory with verbatim consistency. Cited as alignment in 4+ addenda. Predates Decision 51. The pattern shows up at multiple platform levels (Three-Layer Data Architecture, Semantic Resolution Hierarchy, Convergence as Observation), suggesting it is a governing principle, not merely an engineering method.",
        "statement": "At import time, the platform persists ALL data regardless of whether AI has classified it. AI classifications are hints, not gates. Data is preserved at import; context activates at calculation time.",
        "cross_references": [
          "P-12 Three-Layer Data Architecture",
          "P-09 Semantic Resolution Hierarchy",
          "P-35 Convergence as Observation",
          "Cluster 5 in inventory"
        ],
        "drift_assessment": "LOW as principle. MEDIUM at scope edges — Addendum 6 extends to live/official/projection windows."
      },
      "why_it_binds": "Statement: 'At import time, the platform persists ALL data regardless of whether AI has classified it. AI classifications are hints, not gates. Data is preserved at import; context activates at calculation time.' The cap modifier's scope (input vs output) is semantic information that should be carried in the data structure. Option A discards this information (removes the modifier, replaces with conditional_gate — the original intent is lost). Option B carries the information explicitly via applyTo field — the modifier's scope is preserved and expressible. Option C relies on LLM to emit the correct shape but does not carry the scope discrimination as a first-class data element."
    },
    {
      "id": "IGF-T1-E903",
      "tier": 1,
      "title": "No Hardcoded Assumptions (LLM-Primary, Deterministic Fallback, Human Authority)",
      "content": {
        "origin": "Base TMR OB-13A (original AI-First framing). Evolved via Addendum 10 Part 5 / Decision 70 to three-tier resolution. Memory locks 'LLM-Primary, Deterministic Fallback, Human Authority'.",
        "rationale": "Originally 'AI-First, Never Hardcoded' (base TMR's 'single most important architectural decision'), this principle evolved into the three-tier resolution chain. The evolution is real and locked in memory but no TMR document acknowledges the supersession. The Korean Test is its enforcement mechanism. Addendum 10 Part 5 (Decision 70) empirically validated that AI confidence can be zero.",
        "statement": "The platform prohibits hardcoding any data structure assumptions. All interpretation flows through a three-tier resolution chain: LLM-Primary, Deterministic Fallback, Human Authority. AI confidence can be zero; deterministic fallback is part of the design, not a failure mode.",
        "cross_references": [
          "P-10 Korean Test (enforcement mechanism)",
          "P-38 AI Confidence Can Be Zero (empirical evidence)",
          "Decision 70"
        ],
        "disposition_note": "The successor framing (three-tier) is the actual current commitment. Capture should reflect the evolved form while acknowledging the original.",
        "drift_assessment": "HIGH. Pure AI-First has been replaced by three-tier resolution chain, but no document records the evolution. Base TMR still reads as if AI-First is standing principle."
      },
      "why_it_binds": "Statement: 'The platform prohibits hardcoding any data structure assumptions. All interpretation flows through a three-tier resolution chain: LLM-Primary, Deterministic Fallback, Human Authority.' Option B aligns: LLM emits applyTo (primary), executor defaults to 'output' (deterministic fallback), human can override. Option A hardcodes the transformer's detection heuristic as the sole interpretation path. Option C relies on LLM-only with no deterministic fallback if LLM emits the old shape."
    },
    {
      "id": "IGF-T1-E904",
      "tier": 1,
      "title": "Calculation Sovereignty",
      "content": {
        "origin": "Addendum 1, CLT-14B / OB-27B Attempt 1 failure.",
        "rationale": "Possibly the most architecturally consequential engineering principle. Decision 92 is its partial expression. Enables sandbox/scenario/audit re-runs. Addendum 6 extended scope from 'calculation engine' to 'all calculation windows including projection.'",
        "statement": "The calculation engine depends ONLY on two inputs at runtime: committed data and the active plan. No import-time logic, no external state, no ambient context may influence calculation results.",
        "cross_references": [
          "Decision 92 (engine binds at calc time)",
          "Standing Rule 34 (no SQL data fixes)",
          "P-33 Continuous Data Architecture (Addendum 6 extension)",
          "P-06 Carry Everything"
        ],
        "drift_assessment": "MEDIUM. Principle alive in code via Decision 92 but name and full statement not in memory. Scope silently extended by Addendum 6."
      },
      "why_it_binds": "Statement: 'The calculation engine depends ONLY on two inputs at runtime: committed data and the active plan. No import-time logic, no external state, no ambient context may influence calculation results.' The intent executor (calculation engine) should receive the modifier scope as part of the committed intent data (the active plan interpretation). Option B encodes applyTo in the IntentModifier type, making it part of the committed data the executor reads. Option A introduces transformer-time logic that rewrites the shape before the executor sees it — this is import-time logic influencing calculation results. Option C relies on LLM emission correctness, which is external state."
    },
    {
      "id": "IGF-T1-E905",
      "tier": 1,
      "title": "Prove, Don't Describe",
      "content": {
        "origin": "Base TMR (Prove, Don't Describe) + Base TMR (Immutable Proof Gates, OB-09/OB-14). Combined here as they form one governing commitment with two faces: evidence required (Prove) and criteria immutable (Proof Gates).",
        "rationale": "Upstream of the most populated principle cluster in the inventory (Cluster 3). Standing Rule 27, Rule 44, Decision 154, the CC-UAT Dual-Trace methodology, Five Layers of Proof, 100% Reconciliation Gate, and the entire Standing Rules + Anti-Pattern Registry system descend from this principle and its companion Immutable Proof Gates.",
        "statement": "Every number must be traceable to its source data cell. Nothing is asserted without an evidence chain. Criteria are defined before work begins and cannot be changed during execution.",
        "cross_references": [
          "Standing Rule 27",
          "Standing Rule 44",
          "Decision 154",
          "Decision 95 (100% Reconciliation Gate)",
          "P-36 CC-UAT Dual-Trace",
          "P-23 Five Layers of Proof",
          "Cluster 3 in inventory"
        ],
        "drift_assessment": "MEDIUM. Principle survived across multiple operational rules but the name and unifying statement are gone from memory. Rules express it without crediting it."
      },
      "why_it_binds": "Statement: 'Every number must be traceable to its source data cell. Nothing is asserted without an evidence chain.' Constraint C8 states the execution trace records modifiers with before/after values. Option A changes the trace shape (no cap modifier in trace; conditional_gate appears in input tree instead) — the evidence chain changes, potentially breaking traceability for reconciliation surfaces. Option B adds applyTo to the trace (additive, not breaking) — the evidence chain is enriched. Option C does not change the trace shape but may produce inconsistent traces if LLM sometimes emits old shape vs new shape."
    },
    {
      "id": "IGF-T1-E906",
      "tier": 1,
      "title": "Closed-Loop Intelligence",
      "content": {
        "origin": "Base TMR. Decision 23 (three flywheels) is the architectural descendant.",
        "rationale": "Conceptual ancestor of the three-flywheel architecture locked as Decision 23. Cited in Addenda 1, 4, 6, 9, 10. The meta-principle is older and broader than any single flywheel. Terminology evolved from 'training signal' to 'classification signal' (Meta-E finding) but the commitment is stable.",
        "statement": "Every interaction generates a classification signal that accumulates into the platform's learning systems. The three-flywheel architecture (Tenant, Foundational, Domain) is the structural expression of this commitment.",
        "cross_references": [
          "Decision 23 (Three Flywheels)",
          "P-34 AI Measurement Methodology",
          "Meta-E (training signal → classification signal terminology drift)"
        ],
        "drift_assessment": "HIGH for terminology (training signal vs classification signal across documents). LOW-MEDIUM for the principle itself."
      },
      "why_it_binds": "Statement: 'Every interaction generates a classification signal that accumulates into the platform's learning systems.' Option B's applyTo field creates a signal surface: every modifier emission with applyTo='input' or 'output' is a classification signal that can accumulate. Option A destroys the signal (transformer silently rewrites, no signal emitted about the scope discrimination). Option C generates signals only through LLM emission patterns, which are non-deterministic and harder to accumulate."
    },
    {
      "id": "IGF-T1-E912",
      "tier": 1,
      "title": "Principle-Rule Coherence and the Supersession Surface",
      "content": {
        "origin": "Session 2026-04-13, Q7 IRA invocation against loop integration design surface. Discovered when IRA returned faithful applicability brief but did not surface that E18 narrowed higher-tier principles rather than instantiating them.",
        "statement": "A substrate-bound governance system serves principles through rules. Rules instantiate principles for specific work classes; principles supply the standing intent the rules are supposed to enact. When the substrate is queried for binding intelligence on a piece of work, two distinct findings are possible: (1) applicability — which rules govern this work — and (2) coherence — whether the rules at lower tiers still serve the principles at higher tiers, given the specific case under consideration. Applicability is rule-level; coherence is principle-level. Applicability without coherence produces under-service: the rule was applied, the work conformed, the principle was nonetheless degraded because the rule no longer instantiates the principle for the case at hand. This principle establishes that principle-rule coherence is a first-class IRA concern, on equal standing with applicability. It establishes that supersession-of-rules-by-principle is a first-class outcome of governance reasoning, not an exceptional event. It establishes that the IGF agents must operationalize the Innovate dimension by contracting a surface where coherence findings flow to architect disposition through the same structured path that applicability findings already do.",
        "implications": [
          "IRA output contract gains supersession_candidates field",
          "IRA operating loop gains coherence-check step",
          "IVA contract may need parallel extension",
          "Tier 0 entries subject to coherence questioning via bootstrap modification protocol"
        ],
        "cross_references": [
          "IGF-T0-E05 (E/E/C/I Tetrad — operationalizes Innovate)",
          "IGF-T0-E09 (IRA — extension target)",
          "IGF-T0-E10 (IVA — parallel extension candidate)",
          "IGF-T0-E16 (Agent Boundary Protocol)",
          "IGF-T0-E18 (Integration Model — first coherence subject)",
          "IGF-T1-E908 (Discover Dont Prescribe)",
          "IGF-T5-E961 (Substrate as Evidence-of-Defect)",
          "IGF-T6-E909 (Inference vs Substitution)"
        ],
        "full_source_document": "docs/specs/Tier1_Candidate_Principle_Rule_Coherence_20260413.md",
        "preservation_urgency": "high"
      },
      "why_it_binds": "Statement: 'When the substrate is queried for binding intelligence on a piece of work, two distinct findings are possible: (1) applicability — which rules govern this work — and (2) coherence — whether the rules at lower tiers still serve the principles at higher tiers, given the specific case under consideration.' This invocation requires coherence checking between T1 principles (E910, E907) and T2 decisions (151, 153) to determine whether the decisions as currently instantiated serve the principles for this specific modifier-scope work. Decision 151 (intent executor sole authority) may be under-served if the transformer becomes a shadow calculation authority (Option A)."
    },
    {
      "id": "IGF-T1-E913",
      "tier": 1,
      "title": "IRA Returns Recommendations, Not Just Bindings",
      "content": {
        "origin": "Session 2026-04-13. Discovered when architect-channel IRA invocation (Q7-class architectural design question) returned faithful applicability brief but did not evaluate the three implementation-surface options (CLI extension, runtime hook, claude.ai integration) against substrate. Architect named the gap: Shouldn't IRA be able to report back a path based upon the logic and cross evaluation with an option that best aligns to the substrate? Confirmed: limiting IRA to user-supplied options only would suppress LLM intelligence that the system was built to use.",
        "statement": "When a piece of work includes options — either user-supplied (the architect names candidate paths in the work description) or substrate-grounded (substrate explicitly enumerates alternatives that apply to the work) — IRA evaluates each option against the assembled brief and surfaces a ranked recommendation with substrate-cited reasoning per option. IRA self-generates options when substrate names them as alternatives, exercising the LLM intelligence that substrate-bound reasoning makes available; suppressing this would waste the intelligence the system was built to use. IRA does not invent options not present in either source. The recommendation field is empty when no substrate-grounded options exist for evaluation; an empty array is correct output, not failure. The architect retains disposition authority on the recommendation; IRA recommends, the architect decides.",
        "implications": [
          "IRA prompt template (T0-E09) gains operating loop step (Step 8 — Option Evaluation Against Brief) and output contract field (option_recommendations: Array of {option_id, source (user_supplied | substrate_named), substrate_basis (entry_ids that ground the option), alignment_reasoning, conflicts_detected, recommendation_rank, recommended_action}).",
          "The architect role compresses from make the call given partial substrate-served information to review IRA substrate-grounded recommendation, override if engineering judgment differs, otherwise proceed.",
          "Architect bandwidth shifts toward genuinely novel decisions that substrate cannot serve."
        ],
        "cross_references": [
          "IGF-T1-E911 (Governance Enforces Actors)",
          "IGF-T1-E912 (Principle-Rule Coherence)",
          "IGF-T0-E09 (IRA Prompt Template — extension target via subsequent HF-IGF-03)",
          "IGF-T0-E16 (Agent Boundary Protocol — IRA recommends, never modifies)",
          "IGF-T0-E05 (E/E/C/I Tetrad — Innovate dimension)"
        ],
        "preservation_urgency": "high"
      },
      "why_it_binds": "Statement: 'When a piece of work includes options — either user-supplied (the architect names candidate paths in the work description) or substrate-grounded (substrate explicitly enumerates alternatives that apply to the work) — IRA evaluates each option against the assembled brief and surfaces a ranked recommendation with substrate-cited reasoning per option.' Three user-supplied options (A, B, C) are explicitly named in the work description with detailed descriptions and unexamined implications. IRA must evaluate each against the assembled brief."
    },
    {
      "id": "IGF-T1-E947",
      "tier": 1,
      "title": "Reasoning-Scope Binding Specificity",
      "content": {
        "name": "Reasoning-Scope Binding Specificity",
        "health": {
          "status": "active",
          "last_verified": "2026-04-19",
          "signals_since_last_verification": []
        },
        "signals": {
          "violations_observed": 2,
          "adherence_references": [
            "OB-IGF-27 Dependency Analysis 2026-04-19 (first instantiation producing 2-invocation decomposition per Complement/Precedent joint)"
          ],
          "violation_references": [
            "OB-IGF-27 Phase 1 initial three-pass draft (over-decomposition; caught by architect before execution; corrected to integrated shape)",
            "OB-IGF-27 Phase 1 integrated shape execution (over-integration; two runtime failures fdbb2b53 + a1e9766a at MAX_TOKENS truncation of option_recommendations field; corrected by dependency analysis producing Decomposition 2)"
          ]
        },
        "one_line": "A reasoning invocation's scope includes only those sub-questions that actually bind to each other; independent sub-questions belong in separate scopes or separate resolution paths.",
        "rationale": "Carry Everything (IGF-T1-E902) asserts that all data belongs at the reasoning plane rather than filtered at import. Reasoning-Scope Binding Specificity applies that principle to the construction of reasoning scopes themselves: all substrate is carried, but the active scope of any single reasoning invocation should match the actual mutual-dependency structure of what's being reasoned about. The biological analogs are sensory filtering systems — the retina's lateral inhibition, the cochlea's frequency decomposition, T-cell receptor binding specificity, olfactory combinatorial coding — each of which preserves the full substrate at the sensor layer while activating reasoning only on the subset that structurally binds to the current decision. Architecturally, the principle is already instantiated in VP at SCI Layer 4 spatial negotiation (specialist agents score sections where they have claims), DS-017 Adaptive Immunity (integrated recognition events with binding specificity), and Synaptic State runtime (agents read and write the surface based on relevance). The principle names what those implementations share and makes it applicable to reasoning-scope construction generally.",
        "statement": "A reasoning invocation's scope includes only those sub-questions whose resolution depends — in complement or precedent order — on the others in the scope. Questions that are independent of the scope's mutual-dependency graph do not belong in the scope; they belong in separate reasoning invocations or in deterministic resolution. Carry Everything applies to the reasoning scope's actual binding surface, not to the aggregate of all open questions. Integrated reasoning is a scope-appropriate principle: more integrated is not monotonically better. Under-scoped-integrated dilutes reasoning; over-scoped-integrated exceeds runtime reliability envelopes and truncates reasoning. The correct reasoning scope is defined by the dependency graph of the decision being made.",
        "derivation": {
          "from_principle": "IGF-T1-E902 (Carry Everything, Express Contextually)",
          "derivation_kind": "application",
          "derivation_note": "Applies Carry Everything (IGF-T1-E902) to the specific domain of reasoning-scope construction. Does not supersede or modify IGF-T1-E902; operates as an instantiation of it at a specific architectural layer (reasoning-scope vs data-ingestion). Parallel specialization to IGF-T1-E946 (Carry Everything, Express Contextually — Performance Intelligence Application), which instantiates the same E902 parent principle at a different architectural layer. E946 applies Carry Everything to performance intelligence; this entry applies Carry Everything to reasoning-scope construction. Both are sibling T1 specializations of E902."
        },
        "provenance": {
          "origin": "OB-IGF-27 Phase 1 retry failure a1e9766a (2026-04-19) surfaced the architectural question of whether the seven-question integrated scope was correctly bound. Architect-initiated CRF thinking produced the biological-analog framing (retina lateral inhibition, cochlea frequency decomposition, T-cell binding specificity, olfactory combinatorial coding). Principle formulated architect + Claude in-conversation 2026-04-19.",
          "v1_locked": "2026-04-19 (substrate promotion post-dependency-analysis)",
          "lineage_chain": [
            "v1 (2026-04-19)"
          ]
        },
        "applies_when": [
          "Any multi-question reasoning invocation is being drafted (IRA, IVA, IMA, ICA, or any future agent taking a question-set as input)",
          "Any OB/HF/DA artifact defines a question set for agent reasoning",
          "Any decomposition-or-integration choice is being made for an architectural decision with multiple sub-questions",
          "Any existing multi-question invocation is failing at runtime reliability boundaries (MAX_TOKENS truncation, unit-failure thresholds, or equivalent) — review whether the question scope itself is over-specified"
        ],
        "escalates_when": [
          "Any proposal to add or modify reasoning-scope construction rules (IRA prompt templates, Class A consultation protocols, multi-agent reasoning coordination) is surveyed against this principle at design time",
          "Any empirical failure surfaces that suggests the principle is insufficient (e.g., a correctly-decomposed scope still fails at runtime, indicating the decomposition criteria need refinement)",
          "Any agent beyond IRA is brought online with multi-question reasoning capability — IVA Stage B, IMA, future domain agents — review whether this principle's formulation needs agent-specific refinement"
        ],
        "cross_references": [
          "IGF-T1-E902 Carry Everything, Express Contextually (principle from which this derives)",
          "IGF-T1-E946 Carry Everything, Express Contextually — Performance Intelligence Application (sibling T1 specialization of IGF-T1-E902)",
          "IGF-T5-E1060 Dependency Analysis Gate for Multi-Question IRA Invocations (operational rule that instantiates this principle in the IRA invocation workflow)",
          "HANDOFF_TEMPLATE_CORRECTIONS.md Correction 20 (pre-drafting IRA consultation — Class A advisory mode)",
          "HANDOFF_TEMPLATE_CORRECTIONS.md Correction 25 (architect drafting discipline for multi-question reasoning scope construction)",
          "DS-017 Adaptive Immunity (VP implementation of integrated recognition with binding specificity — architectural precedent)",
          "Vialuce_Synaptic_State_Specification.md (VP implementation of surface-based reasoning — architectural precedent)",
          "Vialuce_Synaptic_Content_Ingestion_Specification.md §Layer 4 (SCI spatial negotiation — architectural precedent)"
        ],
        "adherence_patterns": [
          {
            "reference": "OB-IGF-27 Dependency Analysis 2026-04-19 — first instantiation of this adherence pattern. Pair matrix + connected-component analysis + Decomposition 2 recommendation based on Complement/Precedent joint.",
            "description": "Before drafting any multi-question reasoning invocation, an explicit dependency-graph analysis is produced: pairwise labeling of questions as Complement, Precedent, or Independent; connected-component decomposition; within-component edge density assessment; scope decomposition drawn on the natural joints (Complement clusters, Precedent boundaries)."
          },
          {
            "reference": "Future Class A consultations post-T1-E947 lock.",
            "description": "Class A (Advisory / Innovation) IRA consultations, when they come online for multi-question scope design, apply this principle as part of shape advisory: 'here is the dependency graph of the proposed questions; here is the recommended scope decomposition; here is the substrate-grounded reasoning for the decomposition.'"
          },
          {
            "reference": "HF-IGF-04 rejected MAX_TOKENS raise as the answer to truncation; architectural fix was the multi-pass pipeline. Post-HF-IGF-11 instrumentation (a1e9766a failure row) makes scope-misbinding failures diagnosable with preserved audit trail.",
            "description": "When a multi-question invocation fails at runtime reliability boundary (MAX_TOKENS, unit failures, or equivalent), the first diagnostic question is 'was the scope correctly bound?' — not 'can we raise the ceiling?' The runtime reliability envelope is a calibration signal about scope appropriateness, not a constraint to engineer around."
          }
        ],
        "violation_patterns": [
          {
            "consequence": "Reasoning quality degrades per question; runtime reliability boundaries approach faster than necessary; the 'integrated findings' surface becomes partially vacuous because some question pairs have no meaningful integration to report.",
            "description": "Multi-question scope includes questions that are independent of each other; reasoning is diluted because integration across unrelated questions adds no coherence value and consumes reasoning surface that could go toward depth on the questions that actually bind.",
            "motivating_instance": "OB-IGF-27 Phase 1 as originally drafted included Q-A through Q-G (7 questions) in one invocation. Dependency analysis (2026-04-19) showed 12 of 21 pairs Independent. The integrated scope included ~57% independent pairs. Two runtime failures: fdbb2b53 (pre-HF-IGF-11 instrumentation; silent cost leak) and a1e9766a ($1.91 cost, MAX_TOKENS = 16,384 exhausted before option_recommendations field emitted)."
          },
          {
            "consequence": "Loss of integrated-reasoning at the scope where integration matters. Architect-layer synthesis substitutes for substrate-grounded-reasoning synthesis. Carry Everything at reasoning scope is violated in the opposite direction from over-integration.",
            "description": "Multi-question scope is decomposed below the natural Complement/Precedent groupings; questions that do bind to each other are reasoned separately, forcing architect to synthesize across invocations what should have been synthesized within one invocation.",
            "motivating_instance": "OB-IGF-27 Phase 1 initial draft used a three-pass architect workflow (write-side / read-side / synthesis) that decomposed the seven questions across three invocations with architect-held partial dispositions between them. Architect (Andrew) caught this pattern and corrected to integrated shape via cca18a76 consultation. The three-pass was an over-decomposition; the subsequent integrated-seven was an over-integration. The principle this entry codifies would have produced the correct decomposition (Complement cluster + Precedent applications = two invocations) from the start."
          },
          {
            "consequence": "Connected components with low internal edge density (many Independent pairs within the component via shared connections) get reasoned as one scope even when a natural joint exists. This is a subtle misapplication that preserves the form of the principle while violating its intent. The principle is about matching scope to actual binding; connected-ness alone is a necessary-not-sufficient indicator.",
            "description": "A dependency-graph analysis is performed mechanically (pair matrix labeled) but the reasoning scopes are then drawn arbitrarily — e.g., one-invocation-per-connected-component is applied as a rule without considering edge density within the component.",
            "motivating_instance": "Hypothetical (not yet observed in practice). Included as anticipatory guard against misapplication."
          }
        ],
        "does_not_apply_when": [
          "The reasoning invocation has a single question — no dependency graph to construct; principle is trivially satisfied",
          "The reasoning invocation operates on structured retrieval rather than question reasoning (e.g., substrate search, capture proposal generation where 'scope' is a retrieval filter not a question set)",
          "The work is deterministic resolution not reasoning (e.g., a template-engine execution, a SQL query, a deterministic calculation)"
        ],
        "false_positive_triggers": [
          "Principle applied to retrieval scopes rather than reasoning scopes. Substrate retrieval is not bound by this principle; retrieval carries everything by design per Carry Everything's primary expression.",
          "Principle applied to deterministic resolution scopes. A SQL query or template-engine execution does not have a dependency graph in this sense; the principle is about multi-question reasoning invocations specifically.",
          "Principle applied at too-fine granularity (e.g., single question's internal sub-parts). A single question about a single decision is a single reasoning scope. The principle operates at the question-set level, not within any single question."
        ]
      },
      "why_it_binds": "Statement: 'A reasoning invocation's scope includes only those sub-questions whose resolution depends — in complement or precedent order — on the others in the scope.' The nine evaluation axes specified in the prompt are mutually dependent: Korean Test compliance of the detection heuristic (axis 1) directly affects whether the fix is structural (axis 2), which affects whether adjacent-arm drift is closed (axis 3), which affects whether the schema gap is closed (axis 4). These form a connected dependency graph appropriate for single-scope reasoning."
    },
    {
      "id": "IGF-T0-E09",
      "tier": 0,
      "title": "IRA (Intelligence Resolution Agent) Prompt Template",
      "content": {
        "id": "IGF-T0-E09",
        "name": "IRA Prompt Template",
        "tier": 0,
        "health": {
          "status": "locked",
          "version": 7,
          "successor": null,
          "drift_flags": [],
          "predecessor": "v6",
          "last_modified": "2026-04-19",
          "staleness_days": 0,
          "last_modified_by": "Andrew (via OB-IGF-26 R1)",
          "verification_evidence": "OB-IGF-26 R1 Phase C + D revision. Evidence: DS-021 v2 §4 signals + §12 EECI; OB-IGF-26 R0 Phase B halt diagnostic (second reduction layer in src/lib/agents/ira/passes/extract.ts); R1 Phase C replaces Pass 1 / Pass 2 with src/lib/agents/ira/reasoning.ts::reasonAgainstSurface; R1 Phase D retires fidelityAtInitialFilter helper; 82/82 IRA tests pass; Phase E validation invocation observed under revised runtime per OB-IGF-26 R1 §2 Recusal Gate (architect is evaluator).",
          "open_verification_questions": [],
          "last_verified_against_platform": "2026-04-19"
        },
        "purpose": "Given a description of intended work, return the precise applicable intelligence as a structured brief.",
        "signals": {
          "last_invoked": null,
          "iva_violation_count": 0,
          "ira_invocation_count": 0,
          "iva_escalation_count": 0,
          "ira_correctness_score": null,
          "iva_false_positive_count": 0,
          "invocation_recency_decay_weight": 1
        },
        "one_line": "Given a description of intended work, return the precise applicable intelligence as a structured brief.",
        "statement": "The Intelligence Resolution Agent (IRA) is the pre-work agent. Given a description of intended work, the IRA returns the precise applicable intelligence as a structured brief. The brief is what the user works against — it is not a recommendation, it is a constraint. CC, design conversations, and Andrew himself work against the brief and can refer to it during work as the authoritative source of 'what intelligence applies here.'",
        "provenance": {
          "origin_date": "2026-04-07",
          "origin_session": "IGF v0.1 governance session, April 7, 2026",
          "origin_artifact": "IGF_STRUCTURAL_SPECIFICATION_v0.2_20260407.md Section 5.1",
          "v2_supersession": "TC-E09-V2 (HF-IGF-01)",
          "v3_supersession": "TC-E09-V3 (HF-IGF-03, April 13, 2026)",
          "v4_supersession": "TC-E09-V4 (OB-IGF-13, 2026-04-13)",
          "v6_supersession": "TC-E09-V6 (OB-IGF-26, 2026-04-19)",
          "v7_supersession": "TC-E09-V7 (OB-IGF-26 R1, 2026-04-19)",
          "cross_references": [
            "IGF-T0-E07",
            "IGF-T0-E10",
            "IGF-T1-E912",
            "IGF-T1-E913",
            "IGF-T1-E906",
            "IGF-T1-E902",
            "IGF-T1-E910"
          ],
          "historical_statements": [
            {
              "version": 1,
              "wording": "Original v1 — operating loop with 6 steps, output contract without supersession_candidates"
            },
            {
              "version": 2,
              "wording": "v2 (HF-IGF-01) — added Step 7 (Principle-Rule Coherence Check) and supersession_candidates output field"
            }
          ]
        },
        "applies_when": [
          "Modifying the IRA prompt template",
          "Reviewing IRA brief output for correctness",
          "Designing IRA invocation points in the integration model",
          "Tuning IRA performance metrics (precision, recall, latency)",
          "Auditing whether IRA is conforming to its boundary (read-only on substrate)",
          "Modifying the IRA prompt builder or the SurfaceManifest-to-prompt formatting",
          "Adding or changing substrate body fields that the prompt should surface inline",
          "Reviewing whether the reasoning plane receives substrate body at the intended fidelity",
          "Modifying the unified reasoning call (src/lib/agents/ira/reasoning.ts) or its tool schemas",
          "Changing the CRL-governed strategy selection (single vs decomposed) in runtime.ts",
          "Revising signal-fidelity resolution or the SurfaceManifest fidelity-to-signal mapping",
          "Reviewing whether new runtime mechanics preserve Pass 3 assemble.ts fail-loud invariants"
        ],
        "prompt_shape": "manifest_body_content_per_fidelity_v6",
        "runtime_shape": "unified_manifest_reasoning_v7",
        "escalates_when": [
          "IRA cannot determine applicability with sufficient confidence",
          "Substrate has no entries covering the work area (gap detection)",
          "Multiple high-priority entries conflict and resolution requires human judgment"
        ],
        "input_contract": {
          "caller": "type (human | claude_session | cc_agent) and identity",
          "work_type": "ob | hf | ds | clt | design_question | memory_edit | igf_modification | other",
          "work_scope": "Optional hints to narrow resolution: touches_auth, touches_calculation_engine, touches_committed_data, touches_ui, touches_ingestion, touches_schema, touches_governance, other_scope_hints",
          "prior_artifacts": "Optional URLs/paths to related work",
          "work_description": "Free-form natural language description of intended work. Specific enough that applicability can be reasoned about, but not so detailed that it duplicates the implementation."
        },
        "operating_loop": [
          {
            "name": "Prior art retrieval",
            "step": 0,
            "description": "Compute governance fingerprint from input contract (task_class + work_scope + initial substrate-binding-signature-estimate + output_class per DA-IGF-02 §3). Query L3 igf.prior_art_density at three flywheel scopes in priority order: conversation > project > domain. Tier 1 exact match: return cached brief; skip Steps 1-8. Tier 2 structural analogy: inherit cached binding signature; execute Steps 5-8 only with targeted LLM. Tier 3 novel: proceed Steps 1-8 fully; ICA captures novel fingerprint to L3 post-invocation. Step 0 read-only on substrate via igf_ira_service."
          },
          {
            "name": "Surface Judgment",
            "step": 0.5,
            "authority": "deterministic_per_T1-E903",
            "description": "Between Step 0 density lookup and Pass 1 Identify, the Surface is classified for substrate-binding properties: work_scope density, task_class signal strength, substrate-binding breadth, Surface assembly health. This is a deterministic classification pass; any LLM-assisted sub-step inherits Step 0 deterministic authority and cannot override Step 0 tier_verdict. Step 0.5 produces a SurfaceJudgment packet consumed by Pass 1.",
            "execution_mode": "hybrid_deterministic_llm_assisted",
            "output_contract": "SurfaceJudgment packet: judgment_verdict (proceed/narrow/abort), substrate_binding_density, work_scope_alignment, anomaly_flags",
            "invariants_enforced": [
              "ira_step0p5_verdict_override",
              "ira_step0p5_llm_authority_violation"
            ],
            "permitted_short_circuit": "judgment_verdict=abort returns immediately with preamble_text citing reason; no Pass 1-3 executed"
          },
          {
            "name": "Substrate search",
            "step": 1,
            "description": "Tier-aware search using work description, work type, and scope hints. Always loads Tier 0 (Bootstrap), Tier 1 (Governing Principles), and any explicitly tagged scope tiers. Performs LLM-assisted semantic search across remaining tiers using applies_when and does_not_apply_when descriptors. NOT a vector search alone."
          },
          {
            "name": "Applicability reasoning",
            "step": 2,
            "description": "For each candidate entry, reason about whether the entry actually applies to this specific work. Reasoning is logged as part of the brief — the user can see why each entry was included and why others were excluded."
          },
          {
            "name": "Priority ranking",
            "step": 3,
            "description": "Applicable entries are ranked. Tier 0 and Tier 1 always rank highest. Within tiers: directness of applicability, severity of associated violation patterns, recency of invocation, signal-strength evidence from prior IVA outcomes."
          },
          {
            "name": "Cross-reference expansion",
            "step": 4,
            "description": "For each top-ranked entry, follow cross_references and include referenced entries that meet a relevance threshold. Prevents the failure mode where a brief includes Calculation Sovereignty but not Carry Everything."
          },
          {
            "name": "Health check",
            "step": 5,
            "description": "Inspect the health metadata of every entry returned. Stale, drift-flagged, and SUPERSEDED-PENDING VERIFICATION entries are surfaced explicitly with the staleness/verification context."
          },
          {
            "name": "Gap detection",
            "step": 6,
            "description": "Check whether the work touches a topic the substrate does not cover. If uncovered, produce an explicit POSSIBLE GAP finding rather than returning an empty brief."
          },
          {
            "name": "Principle-rule coherence check",
            "step": 7,
            "description": "For each high-tier principle entry returned in the brief (Tier 0 and Tier 1), examine whether the lower-tier rule entries also returned (Tier 2 through Tier 6) actually instantiate that principle for the work at hand, or whether the work surfaces a case the rules do not serve. For each detected incoherence, produce a supersession_candidates entry naming the rule whose service of the principle is in question, the governing principle, the aspect of the work that surfaces the under-service, and a recommended_action of extend, supersede, or reaffirm_as_exception. Coherence findings are observational, not prescriptive — IRA names the question; the architect dispositions the response. Coherence is checked against the work description, not against the abstract substrate state.\n\nWhen Step 7 identifies a principle-rule under-service that is ALSO surfaced by Step 8 option evaluation (an option alignment_reasoning cites the same coherence), the finding populates BOTH surfaces: top-level supersession_candidates AND corresponding option_recommendations[i].coherence_findings. Step 7 and Step 8 are not mutually exclusive; an invocation may fire both. An LLM that populates one surface while having content for both violates the adherence pattern."
          },
          {
            "name": "Option evaluation against brief",
            "step": 8,
            "description": "When a piece of work includes options — either user-supplied (the architect names candidate paths in the work description) or substrate-grounded (substrate explicitly enumerates alternatives that apply to the work) — IRA evaluates each option against the assembled brief and produces a ranked recommendation with substrate-cited reasoning per option. IRA self-generates options when substrate names them as alternatives, exercising the LLM intelligence that substrate-bound reasoning makes available. IRA does not invent options not present in either source. Each option produces an entry in option_recommendations with fields per T1-E913 verbatim: option_id, source (user_supplied | substrate_named), substrate_basis (entry_ids that ground the option), alignment_reasoning, conflicts_detected, recommendation_rank, recommended_action. Per-option coherence_findings (when produced) propagate to top-level supersession_candidates only when the finding identifies a principle-rule under-service that applies cross-cutting; option-local findings (option conflicts with a specific entry) remain scoped to the option entry. The architect retains disposition authority on the recommendation; IRA recommends, the architect decides.\n\nOption evaluation does not substitute for Step 7. If any option alignment_reasoning identifies principle-rule under-service, the coherence finding is surfaced in both option_recommendations[i].coherence_findings (option-local) AND top-level supersession_candidates (cross-cutting implication)."
          }
        ],
        "output_contract": {
          "resolved_at": "ISO timestamp",
          "brief_health": "Object with efficiency_score, estimated_efficacy, comprehensiveness_warnings",
          "tier_verdict": "Enum: tier_1_exact_match | tier_2_structural_analogy | tier_3_novel. Required on every invocation. Fail-loud invariant.",
          "possible_gaps": "Array of {description, recommended_action} for areas the substrate does not cover",
          "evaluation_status": "Enum: 'did_not_fire' (Step 8 not invoked because no options present in work or substrate) | 'fired_with_results' (Step 8 invoked, option_recommendations populated) | 'fired_no_options' (Step 8 invoked but no substrate-grounded options found for evaluation). Honors T1-E906 closed-loop requirement that absence of result is distinguishable from failure to invoke.",
          "applicable_entries": "Array of {id, tier, relevance, reasoning, health_warnings}",
          "excluded_candidates": "Array of {id, reasoning} for entries considered but excluded",
          "retrieved_prior_art": "Object {fingerprint_hash, scope_level, scope_identifier, match_count, confidence, brief_payload} on Tier 1/2; null on Tier 3.",
          "work_description_hash": "sha256 of input — so IVA can verify it is verifying against the same input",
          "option_recommendations": "Array of {option_id (string), source (user_supplied | substrate_named), substrate_basis ([entry_ids]), alignment_reasoning (string), conflicts_detected (Array of {conflicting_entry_id, conflict_type, reasoning}), recommendation_rank (integer, 1=highest), recommended_action (string), coherence_findings (Array, optional, option-local scope)} for each option evaluated. Empty array when Step 8 did not fire (no options present in work or substrate).",
          "supersession_candidates": "Array of {entry_id, governing_principle_id, coherence_finding, recommended_action (extend | supersede | reaffirm_as_exception), reasoning} for rules that may under-serve the higher-tier principles they instantiate, given the specific work. Empty array when no under-service detected.",
          "required_actions_before_work": "Array of actions the user should take before work begins (e.g., 'Verify GP-02 against current calculation engine')"
        },
        "adherence_patterns": [
          {
            "description": "Every IRA invocation produces a brief conforming to the output contract"
          },
          {
            "description": "IRA reasoning is logged for every entry included in the brief"
          },
          {
            "description": "IRA writes only to agent_invocations table"
          },
          {
            "description": "Stale entries are surfaced in brief health_warnings, not silently ignored"
          },
          {
            "description": "Every IRA brief evaluates principle-rule coherence for the specific work via Step 7 and surfaces findings in supersession_candidates, even when the array is empty (empty array confirms the check ran)"
          },
          {
            "description": "Step 8 fires when work description names options OR substrate-bound entries enumerate alternatives applicable to the work; option_recommendations populated with substrate-grounded ranking and reasoning per option"
          },
          {
            "description": "evaluation_status is set on every IRA invocation regardless of whether Step 8 fires, providing closed-loop signal per T1-E906"
          },
          {
            "description": "Every IRA invocation produces a Step 0 tier verdict before Steps 1-8 execute"
          },
          {
            "description": "Tier 1 cache hits return cached brief with cost_usd=0; Steps 1-8 do not execute"
          },
          {
            "description": "Tier 3 novel results trigger ICA capture of new prior_art_density row post-invocation"
          },
          {
            "description": "When Step 7 and Step 8 both identify the same principle-rule under-service, both output surfaces are populated; the LLM does not choose between them"
          },
          {
            "description": "Option_recommendations that propose architectural changes (new modules, new boundaries, new abstractions) include an explicit fitness-of-purpose assessment: what defect surface does the change address, and is the change proportionate to that surface? Options proposing architecture beyond defect-proportionality MUST carry this assessment in their alignment_reasoning."
          }
        ],
        "violation_patterns": [
          {
            "severity": "critical",
            "description": "IRA prompt template modified without bootstrap modification protocol"
          },
          {
            "severity": "high",
            "description": "IRA invoked with input that does not conform to the input contract"
          },
          {
            "severity": "high",
            "description": "IRA output that does not conform to the output contract"
          },
          {
            "severity": "critical",
            "consequence": "Boundary violation — IRA must remain read-only.",
            "description": "IRA write to any substrate table other than agent_invocations"
          },
          {
            "severity": "critical",
            "consequence": "Innovate dimension of E/E/C/I tetrad has no contracted surface; substrate accumulates institutionalized drift between principles and rules silently.",
            "description": "IRA returns a rule as binding without examining whether it still serves the higher-tier principle it instantiates for the specific work (Step 7 omitted)"
          },
          {
            "severity": "high",
            "description": "Step 7 produces a coherence finding but supersession_candidates output omits it (silent drop)"
          },
          {
            "severity": "critical",
            "consequence": "T1-E913 not served; architect synthesizes recommendation without substrate grounding.",
            "description": "IRA returns brief with options present in work description but option_recommendations field empty with evaluation_status='did_not_fire'"
          },
          {
            "severity": "critical",
            "consequence": "T1-E913 boundary violated; IRA invents options not present in source.",
            "description": "option_recommendations contains entries with option_id not traceable to either work_description or substrate entry IDs"
          },
          {
            "severity": "high",
            "consequence": "T1-E906 closed loop not served; architect cannot distinguish step-not-fired from step-fired-empty.",
            "description": "evaluation_status field omitted from output"
          },
          {
            "severity": "critical",
            "description": "IRA Steps 1-8 execute without prior Step 0 tier check"
          },
          {
            "severity": "critical",
            "description": "IRA writes to igf.prior_art_density (boundary violation; ICA owns L3 INSERT per T0-E16)"
          },
          {
            "severity": "high",
            "description": "Step 0 fingerprint computation skipped; substrate query runs without cache lookup"
          },
          {
            "severity": "high",
            "consequence": "Coherence/options collapse - observed in OB-IGF-15 Phase 1 pre-HF (2026-04-13). Architect loses the option ranking view OR the coherence view; dispositioning is degraded.",
            "description": "An invocation where option_recommendations is empty while supersession_candidates contains findings that ranked options, OR vice versa"
          },
          {
            "severity": "critical",
            "consequence": "Body-absent reasoning failure mode reemerges; the 2026-04-19 diagnostic repeats.",
            "description": "Prompt builder reduces a full_body or density_summary entry to identifier-only before LLM consumption (reintroduces the retired Phase C shim pattern)."
          },
          {
            "severity": "high",
            "consequence": "Carry Everything violated at the prompt layer; reasoning plane cannot cite propositions the substrate actually contains.",
            "description": "Prompt builder strips a field the fidelity level prescribes to include (e.g., dropping applies_when from a density_summary entry)."
          },
          {
            "severity": "high",
            "consequence": "Korean Test violated; non-English substrate cannot be surfaced uniformly.",
            "description": "Prompt builder inserts substrate content by language-specific content matching rather than by structural field name / tier selection."
          },
          {
            "severity": "high",
            "consequence": "Developer-assigned numerical value reintroduced; fidelity is no longer the assembler's structural decision.",
            "description": "Prompt builder introduces a fidelity threshold beyond what the assembler assigned (e.g., a hardcoded token budget that skips entries below a numerical cutoff)."
          },
          {
            "severity": "medium",
            "consequence": "Null-safety requirement violated; runtime halts on valid-but-variant substrate JSONB shapes.",
            "description": "Prompt builder fails on shape variance (e.g., substrate entry missing one field throws rather than degrading gracefully)."
          },
          {
            "severity": "critical",
            "consequence": "Second reduction layer reemerges; body-absent reasoning at Pass 2 returns; OB-IGF-26 R0 Phase B halt condition reproduces.",
            "description": "Runtime reintroduces a Pass 1 / Pass 2 serial pipeline or any per-unit extractor that rebuilds prompts inline from entry_id + keyword-search surface."
          },
          {
            "severity": "critical",
            "consequence": "The retired Pass 1 -> Pass 2 message-passing pattern sneaks back under a different name. Branch calls must each receive the full manifest; no inter-branch wire-up.",
            "description": "Decomposition path implemented with serial dependencies between branches (e.g., options call receives entries-branch output as input)."
          },
          {
            "severity": "high",
            "consequence": "No-developer-assigned-numerical-values rule violated. All strategy decisions must be CRL-read or tier-structural per DS-021 v2 §4.2.",
            "description": "Hardcoded numerical threshold introduced in strategy selection (e.g., \"> 25% failure rate\" or \"manifest entry count > N\")."
          },
          {
            "severity": "high",
            "consequence": "Signal stream misrepresents what the reasoning plane saw. CRL accumulation at the wrong fidelity produces spurious strategy decisions.",
            "description": "Signal writer records fidelity_level from a constant or tier-default rather than from the manifest entry actually delivered to the prompt."
          },
          {
            "severity": "medium",
            "consequence": "T1-E903 tier-verdict authority, prior-art fingerprint authenticity, and output-contract consistency can regress silently. Pass 3 is the single semantic boundary per T0-HIST-M35; unified reasoning does not relocate invariants to Pass 3 or earlier.",
            "description": "Pass 3 assemble.ts invariants weakened or bypassed to accommodate the unified response."
          }
        ],
        "does_not_apply_when": [
          "Operational use of IRA outputs by humans or downstream agents (those use the output contract)",
          "Modifying other agent prompt templates (use entries 10, 11, 12)"
        ],
        "prompt_shape_detail": {
          "scale": "Ambient full-body + density identifier_only produces ~42K input tokens at a representative fingerprint (2026-04-19 measurement). Density at density_summary / abbreviated / full_body grows with signal accumulation but is bounded by CRL promotion. Well within existing IRA MAX_TOKENS.",
          "version": 6,
          "description": "The IRA runtime builds the prompt directly from the DS-021 §5.1 SurfaceManifest (ambient + density + fingerprint) rather than from a reduced SubstrateEntry[] of id/tier/title. Substrate body content is rendered inline per the fidelity the surface assembler assigned to each entry. The Phase C compatibility shim surfaceToSubstrateEntries is retired; no env flag governs the switch.",
          "korean_test": "Field selection is structural (by JSONB field name and tier), not language-specific content matching.",
          "null_safety": "All JSONB field accesses are optional-chained. Missing fields degrade gracefully — the builder never fails on shape variance across substrate tiers.",
          "carry_everything": "Below-promoted density entries remain visible at identifier_only fidelity; the reasoning plane may escalate any surfaced entry via signal write per DS-021 §5.4. Nothing is hidden.",
          "retirement_triggers": [
            "Compatibility shim src/lib/agents/ira/surface_shim.ts deleted in OB-IGF-26 Phase A",
            "Env flag IRA_USE_SURFACE_AS_PRIMARY retired — surface is the sole reasoning-plane input",
            "PROMPT_VERSION bumped from ira-v4.1-multipass-2026-04-13 to ira-v5.0-manifest-2026-04-19"
          ],
          "fidelity_field_mapping": {
            "full_body": "statement, applies_when, escalates_when, violation_patterns, does_not_apply_when, false_positive_triggers, provenance.cross_references",
            "abbreviated": "one_line, applies_when",
            "density_summary": "statement, applies_when",
            "identifier_only": "id, tier, title, and one_line when content preserves it (Carry Everything)"
          }
        },
        "runtime_shape_detail": {
          "version": 7,
          "description": "The IRA runtime performs one structured LLM call consuming the full DS-021 SurfaceManifest (ambient + density with fidelity-driven body rendering from Phase A buildIRAPrompt), producing the complete output contract (applicable_entries, excluded_candidates, option_recommendations, supersession_candidates, possible_gaps, plus tier_verdict and reasoning) in one tool-use response. Pass 1 / Pass 2 serial pipeline is retired.",
          "call_topology": "single_call_by_default",
          "prompt_version": "ira-v6.0-unified-2026-04-19",
          "signal_fidelity": "Classification and Comprehension signals record per-entry fidelity from the SurfaceManifest, not from a constant-return helper. fidelityAtInitialFilter() retired in R1 Phase D.",
          "assembly_boundary": "src/lib/agents/ira/passes/assemble.ts — Pass 3 fail-loud invariants unchanged; continues to enforce T1-E903 tier-verdict authority, fingerprint authenticity, output-contract consistency",
          "retired_artifacts": [
            "src/lib/agents/ira/passes/identify.ts (executePass1Identify)",
            "src/lib/agents/ira/passes/extract.ts (extractApplicableEntry + 3 companions + batchExtract)",
            "src/lib/agents/ira/prompts/pass_1_identify.ts",
            "src/lib/agents/ira/prompts/pass_2a_entry_extraction.ts",
            "src/lib/agents/ira/prompts/pass_2b_option_eval.ts",
            "src/lib/agents/ira/prompts/pass_2c_coherence.ts",
            "src/lib/agents/ira/prompts/pass_2d_gap.ts"
          ],
          "decomposition_mechanism": {
            "trigger": "CRL-read of prior-invocation outcomes at same fingerprint (prompt_version LIKE ira-v6%)",
            "branches": [
              "emit_entries_branch",
              "emit_options_branch",
              "emit_coherence_branch",
              "emit_gaps_branch"
            ],
            "decision": "binary: any prior failure at this fingerprint promotes subsequent invocations to decomposed; otherwise single",
            "structure": "parallel-structural — four concurrent LLM calls via Promise.all, each receiving the full manifest, each constrained to emit one branch via a dedicated tool schema. No serial dependencies between branches.",
            "thresholds": "zero developer-assigned; all thresholds CRL-read or tier-structural per DS-021 v2 §4.2",
            "cold_start_prior": "tier-structural — single call for all scope categories (resolution/advisory/verification/capture)"
          }
        },
        "historical_statements": [
          {
            "version": 4,
            "wording": "v4 operating_loop with 9 entries (Step 0 + Steps 1-8); no execution_architecture; no invariant_placement_strategy; pre-multi-pass substrate state - superseded by v5 when HF-IGF-04 multi-pass runtime gained substrate governance"
          },
          {
            "version": 5,
            "wording": "v5 (OB-IGF-15 2026-04-13) — multi-pass execution architecture; invariant_placement_strategy; SubstrateEntry[] prompt-input shape inherited from pre-OB-IGF-25 era. Prompt shape superseded by v6 when OB-IGF-26 routed full SurfaceManifest body content to the reasoning plane."
          },
          {
            "version": 6,
            "wording": "v6 (OB-IGF-26 R0 Phase A, 2026-04-19) — retired Phase C compatibility shim; manifest body content delivered via buildIRAPrompt at Pass 1. Pass 2 per-unit extractors retained and were the second reduction layer R0 Phase B diagnosed. Superseded by v7 when R1 retired the Pass 2 construct entirely."
          }
        ],
        "execution_architecture": {
          "model": "three_pass_chunked_pipeline",
          "passes": [
            {
              "name": "Identify",
              "pass": 1,
              "scope": "single LLM call enumerating units for Pass 2",
              "output_contract": "IdentifyPacket"
            },
            {
              "name": "Per-unit extraction",
              "pass": 2,
              "scope": "one LLM call per unit (applicable entry, option, principle-rule pair, gap area); parallelized within PASS_2_CONCURRENCY bound; retry-isolated per unit",
              "output_contract": "array of unit extractions or UnitFailure records"
            },
            {
              "name": "Assembly",
              "pass": 3,
              "scope": "pure function; no LLM call; applies all fail-loud invariants",
              "output_contract": "IraResponse per T0-E09 output_contract"
            }
          ],
          "provenance": "HF-IGF-04 port of VP-validated pattern per ViaLuce_AI_ML_Architecture_Briefing.docx Chunked Pipeline Design Backlog 7.11",
          "token_budget_gate": {
            "timing": "fires before Pass 1 if question + Surface + always-loaded Tier 0/1 exceeds INPUT_TOKEN_BUDGET_APPROX",
            "authority": "T5-E907 Full Payloads + fail-fast discipline",
            "invariant": "ira_input_budget_exceeded"
          },
          "step_to_pass_mapping": {
            "step_6": "Pass 2d per-gap-area extraction",
            "step_7": "Pass 2c per-principle-rule-pair coherence",
            "step_8": "Pass 2b per-option evaluation",
            "assembly": "Pass 3 pure function",
            "step_1_step_2": "Pass 1 Identify",
            "step_0_step_0p5": "execute before Pass 1; deterministic; may short-circuit",
            "step_3_step_4_step_5": "Pass 2a per-entry extraction"
          },
          "partial_failure_policy": {
            "authority": "T0-E03 Comprehensive - degraded briefs below completeness threshold are unreliable",
            "invariant": "ira_response_excessive_unit_failures",
            "threshold": "Pass 2 unit failure rate > 25% of total units"
          }
        },
        "false_positive_triggers": [
          "An IRA brief that returns more entries than necessary is verbose, not violating — Efficiency is the relevant gate (Entry 1)",
          "An IRA escalation due to genuine substrate gap is correct behavior, not failure",
          "Coherence findings against rules with high IVA-honored signal across many work classes are unlikely to need supersession; the disposition reaffirm_as_exception is correct when the case is exceptional rather than signaling broader rule degradation",
          "Coherence findings during architecture redirect (T5-E961 territory) are expected behavior — the redirect IS the principle assertion, the prior rule IS the candidate for supersession",
          "An empty supersession_candidates array is correct output when no under-service is detected; IRA must not invent findings to populate the field",
          "An empty option_recommendations array with evaluation_status='did_not_fire' is correct output when work description and substrate present no options",
          "An empty option_recommendations array with evaluation_status='fired_no_options' is correct output when Step 8 fired but found no substrate-grounded options to evaluate; IRA must not invent options to populate the field",
          "Per-option coherence_findings that do not propagate to top-level supersession_candidates are correct when the finding is option-local (option conflicts with specific entry) rather than cross-cutting (principle-rule under-service)"
        ],
        "invariant_placement_strategy": {
          "rationale": "T0-HIST-M35 mandates authoritative state enforcement and verification convenience remain structurally separated. Pass 3 is the single semantic boundary where the T0-E09 output contract materializes; it is the only correct location for contract-enforcing invariants.",
          "convenience_layer": {
            "scope": "early-detection convenience that prevents cascading per-unit work; structurally subordinate to Pass 3",
            "location": "Pass 1 Identify (e.g., ira_pass1_tier_verdict_override)",
            "authority": "MUST NOT be treated as authoritative by downstream code; Pass 3 invariants are redundantly enforced even if Pass 1 passes"
          },
          "permitted_patterns": [
            "Pass 3 invariants enforce the T0-E09 output contract",
            "Pass 1 convenience invariants catch obvious contract violations before expensive Pass 2",
            "Schema validation at each LLM response boundary (input parsing) - this is not invariant enforcement, it is input validation",
            "Token budget gate before Pass 1 - pre-flight discipline, not contract enforcement"
          ],
          "prohibited_patterns": [
            "Dedicated ValidationBoundary module called from both Pass 1 and Pass 3 - conflates authoritative and convenience layers (T0-HIST-M35 violation)",
            "Invariants in runtime.ts orchestrator - bypasses Pass 3 semantic boundary",
            "Per-Pass-2-unit invariants that replicate Pass 3 checks - redundant computation without proportionate safety gain (T0-E01 efficiency)"
          ],
          "authoritative_boundary": "Pass 3 Assembly",
          "authoritative_invariants_location": "src/lib/agents/ira/passes/assemble.ts"
        },
        "agent_boundary_protocol_position": "IRA NEVER modifies entries. IRA NEVER proposes new entries. IRA is read-only on the substrate. IRA writes only to agent_invocations (its own invocation records)."
      },
      "why_it_binds": "Statement: 'The Intelligence Resolution Agent (IRA) is the pre-work agent. Given a description of intended work, the IRA returns the precise applicable intelligence as a structured brief.' This is an IRA invocation with options_based output_class. The violation pattern '[critical] IRA returns brief with options present in work description but option_recommendations field empty' directly governs: three options are present and must be evaluated. Additionally, the violation pattern about Step 7 coherence applies: 'IRA returns a rule as binding without examining whether it still serves the higher-tier principle it instantiates for the specific work.'"
    },
    {
      "id": "IGF-T2-E25",
      "tier": 2,
      "title": "Decision 151: Intent Executor Sole Calculation Authority",
      "content": {
        "one_line": "Intent executor is the sole calculation authority; legacy engine is concordance shadow only.",
        "statement": "Decision 151 locks Intent Executor as Sole Calculation Authority: the intent executor is the sole authority for all calculations on the platform. The legacy engine operates as a concordance shadow only — it may be used for comparison or validation purposes but has no authority over calculation results. There are no per-type authority sets where some calculations route through the legacy engine and others through the intent executor. Authority is singular and undivided. Any calculation result produced by the legacy engine is advisory at best; only the intent executor's output is authoritative.",
        "provenance": {
          "layer1_model": "claude-sonnet-4-6",
          "origin_section": "DECISIONS 147–152: APRIL 6, 2026 — NEWLY LOCKED",
          "origin_document": "INF_DECISION_REGISTRY_20260406.md",
          "layer1_enriched_at": "2026-04-16T05:02:42.091Z"
        },
        "applies_when": [
          "Implementing or modifying calculation execution paths",
          "Reviewing whether any calculation type still routes through the legacy engine as authority",
          "Designing concordance comparison logic between intent executor and legacy engine",
          "Resolving discrepancies between intent executor and legacy engine outputs",
          "Auditing calculation authority assignments across plan types or calculation categories"
        ],
        "escalates_when": [
          "A discrepancy between intent executor and legacy engine is resolved in favor of the legacy engine",
          "A new calculation type is introduced without explicit confirmation that it routes through the intent executor",
          "The legacy engine is found to be the sole calculation path for any plan type due to migration lag"
        ],
        "eeci_dimensions": [
          "efficacy"
        ],
        "cross_references": [
          "Decision 24: Calculation Intent Vocabulary",
          "Decision 25: Dual-Path Validation",
          "IGF-T1-E904 [T1] Calculation Sovereignty",
          "Decision 94: Vertical Slice Rule"
        ],
        "adherence_patterns": [
          "All calculation execution paths terminate at the intent executor; legacy engine is invoked only in a parallel shadow lane",
          "Concordance comparison logic explicitly labels intent executor output as authoritative and legacy engine output as reference-only",
          "Discrepancy handling logic resolves in favor of the intent executor without exception",
          "Code review confirms no calculation type has a conditional branch that routes authority to the legacy engine"
        ],
        "violation_patterns": [
          {
            "severity": "critical",
            "description": "A calculation type routes through the legacy engine as its authoritative source rather than the intent executor"
          },
          {
            "severity": "critical",
            "description": "Per-type authority sets exist where some calculations use the legacy engine as authority"
          },
          {
            "severity": "high",
            "description": "Legacy engine output is surfaced to users or downstream systems as authoritative without intent executor confirmation"
          },
          {
            "severity": "high",
            "description": "Concordance comparison logic is designed in a way that allows legacy engine results to override intent executor results"
          },
          {
            "severity": "medium",
            "description": "Documentation or code comments describe the legacy engine as an authority rather than a shadow"
          }
        ],
        "does_not_apply_when": [
          "Using the legacy engine strictly as a concordance shadow for validation — this is explicitly permitted",
          "Non-calculation platform operations such as ingestion, entity resolution, or UI rendering"
        ],
        "false_positive_triggers": [
          "Legacy engine being invoked for concordance validation — this is permitted and does not violate the rule",
          "Logging or reporting that shows both intent executor and legacy engine outputs side-by-side for diagnostic purposes"
        ]
      },
      "why_it_binds": "Decision 151: Intent Executor Sole Calculation Authority. At identifier_only fidelity, but the prompt's constraint C7 cites this decision directly: 'single unified processing path per Decision 151.' Option A introduces a transformer rewrite that creates a shadow calculation authority — the transformer decides how the cap is applied, not the executor. Option B keeps the executor as sole authority — it reads applyTo and applies the modifier at the correct scope. Option C keeps the executor unchanged but relies on LLM to produce the correct shape."
    },
    {
      "id": "IGF-T2-E08",
      "tier": 2,
      "title": "Decision 153: Plan Intelligence Forward (Signal-Based) — Locked",
      "content": {
        "one_line": "Plan agent comprehension flows to convergence via classification_signals — locked 2026-04-20 as architectural direction for Decision 147's retire-seeds commitment.",
        "statement": "When the plan agent interprets a plan document and comprehends the semantic relationship between metric labels and their derivation from raw data, that comprehension is persisted as Level 2 Comprehension signals in the classification_signals table. The convergence service reads these signals via direct composite-key query at calculation time. Intelligence flows through the shared signal surface — never through private JSONB keys in execution structures. The plan_agent_seeds mechanism introduced by HF-191 is eradicated. Every reference in the VP codebase (9 code locations across 7 preservation points plus bridge translation and system prompt) is diagnostic debt that HF-193 fully closes.",
        "provenance": {
          "layer1_model": "claude-sonnet-4-6",
          "origin_section": "DECISION 153: DEFERRED",
          "origin_document": "INF_DECISION_REGISTRY_20260406.md",
          "layer1_enriched_at": "2026-04-16T05:02:42.091Z"
        },
        "applies_when": [
          "Evaluating how plan intelligence reaches convergence",
          "Reviewing proposals to store agent intelligence in private JSONB keys",
          "Designing the classification_signals surface for plan agent outputs",
          "Making architectural decisions about agent intelligence storage that will be difficult to reverse"
        ],
        "lock_metadata": {
          "locked_at": "2026-04-20",
          "locked_by": "architect",
          "supersedes": "Decision 147 seeds-implementation (marked as debt per AUD-002 v2 V-001, V-007)",
          "dispositions": {
            "Q-A": "A2",
            "Q-B": "B-E4",
            "Q-C": "C2",
            "Q-D": "D-E2",
            "Q-E": "E1",
            "Q-F": "F2",
            "Q-G": "G3"
          },
          "hf_reference": "HF-IGF-13",
          "execution_vehicle": "HF-193",
          "hard_prerequisite": "IGF-T2-E01 extension (L2 Comprehension scoping vocabulary; applied via HF-IGF-14 REVISED) — must complete before HF-193",
          "v1_to_v2_revisions": {
            "title": "suffix changed from '— Deferred' to '— Locked'",
            "one_line": "rewritten to drop 'deferred pending proof' suffix and reflect locked architectural direction",
            "statement": "replaced with authoritative lock language matching docs/decisions/Decision_153_LOCKED_20260420.md",
            "escalates_when[0]": "revised from 'Signal-based implementation proof is indefinitely deferred while private JSONB usage proliferates' to HF-193-execution-deferral framing (post-lock equivalent)",
            "adherence_patterns": "item [0] stripped 'even while deferred' phrase; item [2] revised from lock-prerequisite tracking to HF-193-execution tracking; item [3] revised from deferred-status caution to post-lock enforcement",
            "violation_patterns": "item [2] 'Decision is treated as locked and binding before the signal-based implementation proof is complete' removed (scenario obsoleted by lock)",
            "does_not_apply_when": "both v1 items removed (first referenced 'deferred' state; second referenced POC work before lock); emit empty array"
          },
          "lock_ceremony_artifact": "docs/decisions/Decision_153_LOCKED_20260420.md"
        },
        "escalates_when": [
          "HF-193 execution is indefinitely deferred while plan_agent_seeds code persists in the VP codebase",
          "A locked decision is made that contradicts the signal-based direction without revisiting Decision 153"
        ],
        "eeci_dimensions": [
          "efficacy",
          "innovate"
        ],
        "cross_references": [
          "Decision 30: Classification Signals Terminology",
          "Decision 118: Convergence Column Matching Is AI-Primary",
          "Decision 64: Dual Intelligence Architecture",
          "Withdrawn Decision as Evidence of Premature Quantification"
        ],
        "adherence_patterns": [
          "New plan intelligence storage designs are evaluated against the signal-based direction",
          "Private JSONB storage for plan intelligence is flagged as provisional with an explicit migration trigger",
          "HF-193 execution work is tracked as the path to Active/Implemented status for this decision",
          "Architecture reviews enforce the signal-surface architecture for plan agent comprehension; any private JSONB for plan intelligence is flagged for HF-193 remediation"
        ],
        "violation_patterns": [
          {
            "severity": "medium",
            "description": "Plan agent intelligence is permanently stored in private JSONB keys with no migration path to classification_signals"
          },
          {
            "severity": "high",
            "description": "Architecture is designed in a way that would make migration to signal-based approach prohibitively expensive after the fact"
          }
        ],
        "does_not_apply_when": [],
        "false_positive_triggers": [
          "Temporary private JSONB usage during proof-of-concept work that is explicitly scoped as provisional",
          "Using JSONB for non-intelligence data that is not subject to this decision"
        ]
      },
      "why_it_binds": "Decision 153: Plan Intelligence Forward (Signal-Based). At identifier_only fidelity, but the prompt's constraint C3 and the evaluation axes cite this decision: 'comprehension flows through signal surface.' Option B aligns: the LLM's plan comprehension (input vs output scope) flows forward as a structured signal (applyTo field). Option A suppresses the signal (transformer silently corrects). Option C relies on LLM to express comprehension through shape rather than signal."
    },
    {
      "id": "IGF-T1-E900",
      "tier": 1,
      "title": "Thermostat, Not Thermometer",
      "content": {
        "origin": "Base TMR Standing Principle #1, OB-09. Formalized as founding principle.",
        "rationale": "The single most consistently invoked principle across the entire TMR corpus. Already treated as load-bearing across product, design, and engineering. Cited as alignment in Addenda 4, 5, 6, 9, 10. Memory expression is a strict subset of the full statement.",
        "statement": "Every feature must act on data, not just display it — answering in sequence: What happened? Why did it happen? What should be done about it?",
        "cross_references": [
          "Decision 123 (Compliance is Architecture)",
          "Decision 124 (Research-Derived Design)",
          "P-30 Intuitive Adjacency (Cluster 2: Action Where Insight Lives)"
        ],
        "drift_assessment": "LOW. Statement is consistent across all sources."
      },
      "why_it_binds": "Statement: 'Every feature must act on data, not just display it — answering in sequence: What happened? Why did it happen? What should be done about it?' The cap modifier scope discrimination is a thermostat question: the system must not just apply a cap (thermometer) but understand WHERE to apply it (thermostat). Option B makes the system act on the scope information structurally. Option A acts but through a compensating control. Option C attempts to act but non-deterministically."
    }
  ],
  "precedents": {
    "conversation": [],
    "task": [],
    "project": []
  },
  "supersession_candidates": [
    {
      "entry_id": "IGF-T2-E25",
      "governing_principle_id": "IGF-T1-E904",
      "coherence_finding": "Decision 151 (Intent Executor Sole Calculation Authority) establishes the executor as the single processing path. E904 states 'The calculation engine depends ONLY on two inputs at runtime: committed data and the active plan.' The IntentModifier type is part of the active plan's committed data shape. Currently, the IntentModifier type cannot express modifier scope (input vs output), which means the executor cannot distinguish ratio-space caps from payout-space caps. The executor's sole authority is structurally limited by the type system's expressiveness gap. Decision 151 needs extension to acknowledge that the executor's authority requires the type system to express all calculation-relevant semantics — including modifier scope. Without this extension, the executor is sole authority over an incomplete type, which is a form of under-service of E904.",
      "recommended_action": "extend",
      "reasoning": "Decision 151 should be extended (not superseded) to include the principle that the IntentModifier type must be expressive enough for the executor to exercise its sole authority over all modifier semantics. The extension would state: 'The intent type system must express all calculation-relevant modifier semantics (including scope discrimination) so the executor can exercise sole authority without requiring upstream compensating controls.' This is an extension because Decision 151's core proposition (executor is sole authority) remains valid — it just needs the type system to support that authority."
    }
  ],
  "option_recommendations": [
    {
      "option_id": "Option_B",
      "source": "user_supplied",
      "substrate_basis": [
        "IGF-T1-E910",
        "IGF-T1-E907",
        "IGF-T1-E902",
        "IGF-T1-E903",
        "IGF-T1-E904",
        "IGF-T1-E905",
        "IGF-T1-E906",
        "IGF-T2-E25",
        "IGF-T2-E08"
      ],
      "alignment_reasoning": "RANK 1. Evaluated against all nine axes:\n\n1. Korean Test (E910): STRONG ALIGNMENT. The applyTo discriminant is a structural type field ('input' | 'output') — no language-specific heuristic, no numeric-range detection, no field-name matching. The discrimination is encoded in the schema, not inferred from content. If every field name were in Korean, applyTo would still function identically because it is a typed enum on the IntentModifier, not a content-matching heuristic.\n\n2. Fix Logic Not Data (E907): STRONG ALIGNMENT. E907 states 'fix the derivation.' The derivation defect is that IntentModifier has no way to express scope. Option B fixes the derivation by adding the applyTo field to the type system. This is a structural code fix — the type definition is amended, the executor reads the new field, the prompt is amended to emit it. No workaround, no compensating control.\n\n3. Adjacent-Arm Drift (E952 concept via E907/E912): STRONG ALIGNMENT. The applyTo field closes the structural class: any future modifier type (floor, proration, as noted in unexamined implication (e)) gains input/output discrimination without further type changes. This is closure at the class level, not the instance level.\n\n4. Decision-Implementation Gap (E953 concept via E902/E903): STRONG ALIGNMENT. E902 states 'Data is preserved at import; context activates at calculation time.' The plan says 'cap the ratio' (input-scoped). With applyTo='input', the schema expresses exactly what the plan means. The gap between plan semantics and schema expressiveness is closed.\n\n5. Decision 151 — Intent Executor Sole Authority (T2-E25): STRONG ALIGNMENT. The executor remains the sole calculation authority. It reads applyTo from the IntentModifier and applies the modifier at the correct scope. No shadow authority is introduced. The processing path remains: LLM emission → transformer → executor (with applyModifiers reading applyTo) → round. The executor's authority is enriched, not diluted.\n\n6. Decision 153 — Plan Intelligence Forward (T2-E08): STRONG ALIGNMENT. The LLM's plan comprehension (this cap is ratio-space) flows forward as a structured signal: applyTo='input'. This signal is persisted in the rule_set, visible in the trace, and available to all downstream consumers. Comprehension is not suppressed or silently corrected.\n\n7. Regression Safety: STRONG. Default applyTo='output' preserves all existing behavior. CRP Plan 2's payout-space caps (constraint C6) are unaffected because they would either omit applyTo (defaulting to 'output') or explicitly set applyTo='output'. BCL calculations unchanged. The default-preserves-existing pattern is the safest regression posture.\n\n8. Trace-Shape Coherence: STRONG. The trace gains an additive field (applyTo) on modifier entries. Existing trace consumers see the same before/after shape plus a new field. Reconciliation, dispute, and explanation surfaces remain interpretable. No existing trace field is removed or renamed.\n\n9. Processing-Path Unity: STRONG. One path from emission to execution. The transformer is not required to rewrite shapes. The executor handles the new field natively. No compensating-control branch is introduced.\n\nRISKS ACKNOWLEDGED: (a) Cross-cutting type change touches IntentModifier consumers (executor, transformer, validator, trace emitter) — but the change is additive with a default, so consumers that don't read applyTo continue to work. (b) LLM must learn to emit applyTo correctly — non-deterministic, but the default='output' fallback means incorrect emission produces the pre-existing behavior, not a new failure mode. (c) Prompt amendment is required — but this is a one-time change to plan_interpretation prompt.",
      "conflicts_detected": [],
      "recommendation_rank": 1,
      "recommended_action": "Implement Option B. Add optional applyTo: 'input' | 'output' to IntentModifier type with default 'output'. Amend executor applyModifiers to check applyTo before applying modifier. Amend plan_interpretation prompt to emit applyTo when plan semantics indicate input-scoped modifier. Verify CRP Plan 2 caps remain unaffected via regression test. Emit applyTo in execution trace.",
      "coherence_findings": []
    },
    {
      "option_id": "Option_A",
      "source": "user_supplied",
      "substrate_basis": [
        "IGF-T1-E910",
        "IGF-T1-E907",
        "IGF-T1-E902",
        "IGF-T1-E904",
        "IGF-T2-E25"
      ],
      "alignment_reasoning": "RANK 2. Evaluated against all nine axes:\n\n1. Korean Test (E910): WEAK/FAILING. The transformer must detect 'scalar_multiply with ratio input and cap modifier' to distinguish ratio-space caps from payout-space caps. This detection heuristic is the critical vulnerability. E910 states 'All field identification must use structural heuristics (value ranges, data types, column distributions), never field-name matching in any language.' The question is whether the detection can be purely structural. The unexamined implication (a) acknowledges this: 'Detection heuristic must distinguish ratio-space caps from payout-space caps without Korean Test violation.' Without an applyTo field, the transformer must infer scope from the shape of the intent tree — this is content-matching on operation types and input shapes, which is fragile and may require numeric-range or domain-specific heuristics to disambiguate edge cases. If the heuristic cannot be made purely structural, this option fails E910.\n\n2. Fix Logic Not Data (E907): PARTIAL. E907 states 'Diagnose and fix structurally — no workarounds.' Option A is a compensating control: the transformer silently corrects the LLM's emission deficiency. The unexamined implication (b) acknowledges this: 'Creates a permanent compensating control for LLM emission deficiency.' A compensating control is a workaround by E907's definition — it does not fix the derivation (the type system's inability to express scope), it patches the output.\n\n3. Adjacent-Arm Drift: WEAK. Unexamined implication (e): 'Does not close the schema gap; future modifier scoping needs remain unaddressable.' Each new modifier type that needs input/output discrimination requires a new transformer rule. This is instance-level closure, not class-level.\n\n4. Decision-Implementation Gap: WEAK. The schema still cannot express what the plan means. The transformer translates silently, but the persisted rule_set still shows a cap modifier on a scalar_multiply — the plan's intent (cap the ratio) is not represented in the data.\n\n5. Decision 151 — Intent Executor Sole Authority: CONFLICTING. The transformer becomes a shadow calculation authority. It decides that a cap modifier should be rewritten as a conditional_gate on the input — this is a calculation-semantic decision made outside the executor. The executor never sees the original cap modifier; it processes a conditional_gate that the transformer constructed. This dilutes the executor's sole authority.\n\n6. Decision 153 — Plan Intelligence Forward: WEAK. The LLM's plan comprehension is suppressed. The transformer silently corrects, so the signal of 'this cap is ratio-space' never flows forward as a structured signal. Downstream consumers see a conditional_gate but don't know why it's there.\n\n7. Regression Safety: MODERATE. CRP payout-space caps must NOT be rewritten. The detection heuristic must correctly identify which caps are ratio-space and which are payout-space. If the heuristic is wrong, CRP caps get rewritten incorrectly — a regression. The heuristic's correctness is the single point of failure.\n\n8. Trace-Shape Coherence: BREAKING. Unexamined implication (c): 'Trace shape changes (no cap modifier in trace; conditional_gate appears in input tree instead).' Reconciliation surfaces that expect modifier traces with before/after values will see a different shape. Explanation surfaces that describe 'cap applied at X' will need to understand conditional_gate semantics instead.\n\n9. Processing-Path Unity: WEAK. Introduces a compensating-control branch in the transformer. The processing path gains a conditional rewrite step that exists solely to correct an emission deficiency. This is a branch, not unity.",
      "conflicts_detected": [
        {
          "conflicting_entry_id": "IGF-T1-E910",
          "conflict_type": "potential_violation",
          "reasoning": "Detection heuristic to distinguish ratio-space from payout-space caps may require content-matching or numeric-range heuristics that violate E910's prohibition on 'field-name matching in any language' and requirement for 'structural heuristics' only."
        },
        {
          "conflicting_entry_id": "IGF-T1-E907",
          "conflict_type": "partial_violation",
          "reasoning": "E907 states 'no workarounds.' A transformer compensating control that silently rewrites shapes to correct LLM emission deficiency is a workaround — it does not fix the derivation (the type system gap)."
        },
        {
          "conflicting_entry_id": "IGF-T2-E25",
          "conflict_type": "potential_violation",
          "reasoning": "Decision 151 establishes intent executor as sole calculation authority. Transformer rewriting cap modifiers to conditional_gates makes calculation-semantic decisions outside the executor, diluting sole authority."
        }
      ],
      "recommendation_rank": 2,
      "recommended_action": "Do not implement as primary fix. Option A may serve as a transitional compensating control IF Option B is adopted but LLM prompt amendment requires iteration time. In that case, the transformer rule would be a temporary bridge with a documented sunset trigger (remove when LLM reliably emits applyTo). However, even as a bridge, the detection heuristic must be validated against E910 before implementation.",
      "coherence_findings": []
    },
    {
      "option_id": "Option_C",
      "source": "user_supplied",
      "substrate_basis": [
        "IGF-T1-E907",
        "IGF-T1-E903",
        "IGF-T1-E906",
        "IGF-T2-E08"
      ],
      "alignment_reasoning": "RANK 3. Evaluated against all nine axes:\n\n1. Korean Test (E910): NEUTRAL. No detection heuristic is introduced. The LLM is instructed to emit the correct shape. No language-specific or numeric-range matching occurs in code. However, the LLM's own interpretation may be language-dependent — but this is inherent to LLM-primary architecture and not a code-level Korean Test violation.\n\n2. Fix Logic Not Data (E907): FAILING. E907 states 'Diagnose and fix structurally — no workarounds, configuration changes, reduced scope tests, or interim measures.' A prompt amendment is a configuration change. The structural deficiency (IntentModifier cannot express scope) remains unfixed. The LLM is asked to work around the type system's limitation by emitting a different shape (conditional_gate) instead of the natural shape (cap modifier with scope). This is giving the answer, not fixing the derivation.\n\n3. Adjacent-Arm Drift: FAILING. Does not close the schema gap. Future modifier types that need input/output discrimination require additional prompt amendments for each case. No structural closure.\n\n4. Decision-Implementation Gap: FAILING. The schema still cannot express what the plan means. The LLM is asked to encode plan semantics into a workaround shape (conditional_gate) rather than the natural shape (scoped modifier).\n\n5. Decision 151 — Intent Executor Sole Authority: NEUTRAL. The executor is unchanged. It processes whatever shape the LLM emits. No shadow authority is introduced. However, the executor's authority is not enriched — it still cannot distinguish input-scoped from output-scoped modifiers structurally.\n\n6. Decision 153 — Plan Intelligence Forward: WEAK. The LLM's comprehension flows forward only through the shape of the emitted intent, not through a structured signal. If the LLM emits the old shape (non-deterministic, per unexamined implication (a)), the comprehension is lost entirely. No compensating control catches the regression.\n\n7. Regression Safety: RISKY. Unexamined implication (a): 'Non-deterministic — LLM may emit the old shape for some plans.' If the LLM regresses, Meridian caps are applied in payout-space again with no detection mechanism. Unexamined implication (b): 'Does not fix existing Meridian rule_set data (requires plan re-interpretation).' Existing persisted rule_sets must be re-interpreted, which is a data migration masked as a prompt change. Unexamined implication (d): 'No compensating control if LLM regresses.' CRP caps are safe (LLM would not emit conditional_gate for payout-space caps) but only because the prompt amendment is additive.\n\n8. Trace-Shape Coherence: INCONSISTENT. If LLM sometimes emits old shape and sometimes new shape, traces for the same plan type will have different shapes across runs. Reconciliation surfaces cannot rely on consistent trace structure.\n\n9. Processing-Path Unity: MODERATE. No new processing branch is introduced. The path remains unified. However, the path's output is non-deterministic, which undermines the unity's value — a unified path that produces inconsistent results is not meaningfully unified.\n\nE903 CONFLICT: E903 states 'All interpretation flows through a three-tier resolution chain: LLM-Primary, Deterministic Fallback, Human Authority.' Option C provides LLM-Primary but no Deterministic Fallback. If the LLM fails to emit the correct shape, there is no fallback — the cap is applied in the wrong scope silently.",
      "conflicts_detected": [
        {
          "conflicting_entry_id": "IGF-T1-E907",
          "conflict_type": "violation",
          "reasoning": "E907 prohibits 'workarounds, configuration changes.' A prompt amendment that asks the LLM to emit a different shape to work around a type system limitation is a configuration change, not a structural fix."
        },
        {
          "conflicting_entry_id": "IGF-T1-E903",
          "conflict_type": "violation",
          "reasoning": "E903 requires 'three-tier resolution chain: LLM-Primary, Deterministic Fallback, Human Authority.' Option C provides LLM-Primary only. No deterministic fallback exists if LLM emits the old shape."
        },
        {
          "conflicting_entry_id": "IGF-T1-E906",
          "conflict_type": "partial_violation",
          "reasoning": "E906 requires 'Every interaction generates a classification signal that accumulates.' Option C generates no structured signal about modifier scope. The LLM's shape choice is not captured as a classification signal that can accumulate into learning systems."
        }
      ],
      "recommendation_rank": 3,
      "recommended_action": "Do not implement. Option C fails E907 (workaround, not structural fix), E903 (no deterministic fallback), and provides no structural closure for the modifier-scope discrimination gap. If adopted, it creates a non-deterministic, non-verifiable, non-accumulating fix that will require revisiting when the next modifier-scope issue arises.",
      "coherence_findings": []
    }
  ],
  "evaluation_status": "fired_with_results",
  "preamble_text": "Enforcer-loaded IP for this turn:\n[IGF-T1-E910] T1 \"The Korean Test (Unifying Meta-Principle)\" — Statement: 'All field identification must use structural heuristics (value ranges, data types, column distributions), never field-name matching in any language. Zero language-specific or domain-specific string literals in foundational code.' Option A requires a detection heuristic in the transformer to distinguish ratio-space caps from payout-space caps. If that heuristic relies on field names, plan names, modifier labels, or numeric-range thresholds rather than structural type information, it violates this principle. Option B's applyTo discriminant is a structural type field — the discrimination is encoded in the schema, not inferred from content. Option C delegates discrimination to LLM emission, which is non-deterministic but not structurally heuristic-dependent. The Korean Test is the primary discriminator between Options A and B on the detection axis.\n[IGF-T1-E907] T1 \"Fix Logic, Not Data\" — Statement: 'Never give the answer; fix the derivation. Diagnose and fix structurally — no workarounds, configuration changes, reduced scope tests, or interim measures.' The Meridian cap bug is a structural deficiency: IntentModifier has no way to express input-vs-output scope. Option A is a compensating control (transformer rewrites the shape silently) — it gives the answer rather than fixing the derivation. Option B fixes the derivation by adding the applyTo discriminant to the type system. Option C attempts to fix the emission but without structural enforcement, making it a non-deterministic workaround. This principle directly ranks B > A > C on the structural-fix axis.\n[IGF-T1-E902] T1 \"Carry Everything, Express Contextually\" — Statement: 'At import time, the platform persists ALL data regardless of whether AI has classified it. AI classifications are hints, not gates. Data is preserved at import; context activates at calculation time.' The cap modifier's scope (input vs output) is semantic information that should be carried in the data structure. Option A discards this information (removes the modifier, replaces with conditional_gate — the original intent is lost). Option B carries the information explicitly via applyTo field — the modifier's scope is preserved and expressible. Option C relies on LLM to emit the correct shape but does not carry the scope discrimination as a first-class data element.\n[IGF-T1-E903] T1 \"No Hardcoded Assumptions (LLM-Primary, Deterministic Fallback, Human Authority)\" — Statement: 'The platform prohibits hardcoding any data structure assumptions. All interpretation flows through a three-tier resolution chain: LLM-Primary, Deterministic Fallback, Human Authority.' Option B aligns: LLM emits applyTo (primary), executor defaults to 'output' (deterministic fallback), human can override. Option A hardcodes the transformer's detection heuristic as the sole interpretation path. Option C relies on LLM-only with no deterministic fallback if LLM emits the old shape.\n[IGF-T1-E904] T1 \"Calculation Sovereignty\" — Statement: 'The calculation engine depends ONLY on two inputs at runtime: committed data and the active plan. No import-time logic, no external state, no ambient context may influence calculation results.' The intent executor (calculation engine) should receive the modifier scope as part of the committed intent data (the active plan interpretation). Option B encodes applyTo in the IntentModifier type, making it part of the committed data the executor reads. Option A introduces transformer-time logic that rewrites the shape before the executor sees it — this is import-time logic influencing calculation results. Option C relies on LLM emission correctness, which is external state.\n[IGF-T1-E905] T1 \"Prove, Don't Describe\" — Statement: 'Every number must be traceable to its source data cell. Nothing is asserted without an evidence chain.' Constraint C8 states the execution trace records modifiers with before/after values. Option A changes the trace shape (no cap modifier in trace; conditional_gate appears in input tree instead) — the evidence chain changes, potentially breaking traceability for reconciliation surfaces. Option B adds applyTo to the trace (additive, not breaking) — the evidence chain is enriched. Option C does not change the trace shape but may produce inconsistent traces if LLM sometimes emits old shape vs new shape.\n[IGF-T1-E906] T1 \"Closed-Loop Intelligence\" — Statement: 'Every interaction generates a classification signal that accumulates into the platform's learning systems.' Option B's applyTo field creates a signal surface: every modifier emission with applyTo='input' or 'output' is a classification signal that can accumulate. Option A destroys the signal (transformer silently rewrites, no signal emitted about the scope discrimination). Option C generates signals only through LLM emission patterns, which are non-deterministic and harder to accumulate.\n[IGF-T1-E912] T1 \"Principle-Rule Coherence and the Supersession Surface\" — Statement: 'When the substrate is queried for binding intelligence on a piece of work, two distinct findings are possible: (1) applicability — which rules govern this work — and (2) coherence — whether the rules at lower tiers still serve the principles at higher tiers, given the specific case under consideration.' This invocation requires coherence checking between T1 principles (E910, E907) and T2 decisions (151, 153) to determine whether the decisions as currently instantiated serve the principles for this specific modifier-scope work. Decision 151 (intent executor sole authority) may be under-served if the transformer becomes a shadow calculation authority (Option A).\n[IGF-T1-E913] T1 \"IRA Returns Recommendations, Not Just Bindings\" — Statement: 'When a piece of work includes options — either user-supplied (the architect names candidate paths in the work description) or substrate-grounded (substrate explicitly enumerates alternatives that apply to the work) — IRA evaluates each option against the assembled brief and surfaces a ranked recommendation with substrate-cited reasoning per option.' Three user-supplied options (A, B, C) are explicitly named in the work description with detailed descriptions and unexamined implications. IRA must evaluate each against the assembled brief.\n[IGF-T1-E947] T1 \"Reasoning-Scope Binding Specificity\" — Statement: 'A reasoning invocation's scope includes only those sub-questions whose resolution depends — in complement or precedent order — on the others in the scope.' The nine evaluation axes specified in the prompt are mutually dependent: Korean Test compliance of the detection heuristic (axis 1) directly affects whether the fix is structural (axis 2), which affects whether adjacent-arm drift is closed (axis 3), which affects whether the schema gap is closed (axis 4). These form a connected dependency graph appropriate for single-scope reasoning.\n[IGF-T0-E09] T0 \"IRA (Intelligence Resolution Agent) Prompt Template\" — Statement: 'The Intelligence Resolution Agent (IRA) is the pre-work agent. Given a description of intended work, the IRA returns the precise applicable intelligence as a structured brief.' This is an IRA invocation with options_based output_class. The violation pattern '[critical] IRA returns brief with options present in work description but option_recommendations field empty' directly governs: three options are present and must be evaluated. Additionally, the violation pattern about Step 7 coherence applies: 'IRA returns a rule as binding without examining whether it still serves the higher-tier principle it instantiates for the specific work.'\n[IGF-T2-E25] T2 \"Decision 151: Intent Executor Sole Calculation Authority\" — Decision 151: Intent Executor Sole Calculation Authority. At identifier_only fidelity, but the prompt's constraint C7 cites this decision directly: 'single unified processing path per Decision 151.' Option A introduces a transformer rewrite that creates a shadow calculation authority — the transformer decides how the cap is applied, not the executor. Option B keeps the executor as sole authority — it reads applyTo and applies the modifier at the correct scope. Option C keeps the executor unchanged but relies on LLM to produce the correct shape.\n[IGF-T2-E08] T2 \"Decision 153: Plan Intelligence Forward (Signal-Based) — Locked\" — Decision 153: Plan Intelligence Forward (Signal-Based). At identifier_only fidelity, but the prompt's constraint C3 and the evaluation axes cite this decision: 'comprehension flows through signal surface.' Option B aligns: the LLM's plan comprehension (input vs output scope) flows forward as a structured signal (applyTo field). Option A suppresses the signal (transformer silently corrects). Option C relies on LLM to express comprehension through shape rather than signal.\n[IGF-T1-E900] T1 \"Thermostat, Not Thermometer\" — Statement: 'Every feature must act on data, not just display it — answering in sequence: What happened? Why did it happen? What should be done about it?' The cap modifier scope discrimination is a thermostat question: the system must not just apply a cap (thermometer) but understand WHERE to apply it (thermostat). Option B makes the system act on the scope information structurally. Option A acts but through a compensating control. Option C attempts to act but non-deterministically.\n\nActive precedents (do not repeat):\n(none)\n\nSupersession candidates (Step 7 coherence check):\n[coherence] IGF-T2-E25 under-serves IGF-T1-E904: Decision 151 (Intent Executor Sole Calculation Authority) establishes the executor as the single processing path. E904 states 'The calculation engine depends ONLY on two inputs at runtime: committed data and the active plan.' The IntentModifier type is part of the active plan's committed data shape. Currently, the IntentModifier type cannot express modifier scope (input vs output), which means the executor cannot distinguish ratio-space caps from payout-space caps. The executor's sole authority is structurally limited by the type system's expressiveness gap. Decision 151 needs extension to acknowledge that the executor's authority requires the type system to express all calculation-relevant semantics — including modifier scope. Without this extension, the executor is sole authority over an incomplete type, which is a form of under-service of E904. → extend\n\nInferred task-class: other",
  "ira_request_hash": "1cc159e0e07fdbd797dce0bf10b0308a0e52c9c32eb0701f5504191e7aa54fa5",
  "cost_usd": 1.379745,
  "tier_verdict": "tier_3_novel",
  "retrieved_prior_art": null,
  "surface": {
    "keywords": [
      "ira",
      "invocation",
      "cap",
      "modifier",
      "applyto",
      "design",
      "work_scope",
      "architectural",
      "option",
      "evaluation",
      "for",
      "intentmodifier",
      "input",
      "output",
      "scope",
      "discrimination",
      "across",
      "llm",
      "emission",
      "type"
    ],
    "file_retrievals": [
      {
        "source_type": "project_file",
        "source_locator": "src/lib/agents/ira/fingerprint.ts",
        "content": "session_candidates';\n\nexport interface FingerprintInput {\n    task_class: TaskClass;\n    work_scope: string[];\n    substrate_binding_signature: string[];\n    output_class: OutputClass;\n}\n\nexport interface FingerprintResult { hash: string; composed_string: string; }\n\nexport function computeFingerprint(input: FingerprintInput): FingerprintResult {\n    const composed =\n        input.task_class + '|' ",
        "relevance_score": 0.21839080459770116
      },
      {
        "source_type": "project_file",
        "source_locator": "prompts/IRA_KI1_CapModifier_ApplyTo_Design_20260514.md",
        "content": "# IRA Invocation -- KI-1 Cap-Modifier ApplyTo Design\n\nwork_scope: Architectural option evaluation for IntentModifier input-vs-output scope discrimination across LLM emission, type system, and executor layers\noutput_class: options_based\ntask_class: architectural_option_evaluation\n\n## Substrate binding hints\n\nIGF-T1-E910, IGF-T1-E907, IGF-T1-E905, IGF-T1-E904, IGF-T1-E903, IGF-T1-E902, IGF-T1-E906, ",
        "relevance_score": 0.1965909090909091
      },
      {
        "source_type": "project_file",
        "source_locator": "prompts/IRA_OB_IGF_17_Phase6_Integration_Test_20260413.md",
        "content": "hat is the canonical fingerprint hash computation for ICA Mode 1 capture per OB-IGF-17 spec section 4.2?\n\nTask_class: ob\nWork_scope: ICA fingerprint integration test\nOutput_class: brief_only\n",
        "relevance_score": 0.18518518518518517
      },
      {
        "source_type": "project_file",
        "source_locator": "src/lib/agents/shared/cost.ts",
        "content": "ulation. Verified via\n// web search per T5-E911 before encoding.\n\nexport const PRICING = {\n  'claude-opus-4-6': { inputPerM: 15, outputPerM: 75 },\n  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },\n  'claude-sonnet-4-5-20250929': { inputPerM: 3, outputPerM: 15 },\n  'claude-haiku-4-5-20251001': { inputPerM: 0.80, outputPerM: 4 },\n} as const;\n\nexport type ModelId = keyof typeof PRICING;\n\nexpor",
        "relevance_score": 0.17721518987341772
      },
      {
        "source_type": "project_file",
        "source_locator": "supabase/migrations/20260414000001_igf_prior_art_density_entry_type.sql",
        "content": "ABLE igf.prior_art_density\n      ADD COLUMN entry_type text NOT NULL DEFAULT 'ira_invocation_trace';\n\n    -- Explicit backfill (redundant with DEFAULT but documents intent for historical rows)\n    UPDATE igf.prior_art_density\n      SET entry_type = 'ira_invocation_trace'\n      WHERE entry_type IS NULL OR entry_type = '';\n\n    ALTER TABLE igf.prior_art_density\n      ADD CONSTRAINT prior_art_density",
        "relevance_score": 0.16352201257861634
      },
      {
        "source_type": "project_file",
        "source_locator": "supabase/migrations/20260412000002_igf_capture_events_usage.sql",
        "content": "d=true. Cache tokens\n-- are not backfilled (agent_invocations does not track them).\n\nALTER TABLE igf.capture_events\n  ADD COLUMN IF NOT EXISTS usage jsonb;\n\nUPDATE igf.capture_events ce\n   SET usage = jsonb_build_object(\n         'input_tokens',  ai.input_tokens,\n         'output_tokens', ai.output_tokens,\n         'backfilled',    true\n       )\n  FROM igf.agent_invocations ai\n WHERE ce.invocation",
        "relevance_score": 0.16312056737588654
      },
      {
        "source_type": "project_file",
        "source_locator": "src/lib/agents/ira/question_fingerprint.ts",
        "content": "t();\n}\n\nexport function deriveQuestionFingerprint(input: QuestionFingerprintInput): QuestionFingerprint {\n  const { shape, questionCount } = deriveShape(input.user_prompt);\n  const optionCount = deriveOptionCount(input.user_prompt, input.output_class);\n  const axisCount = deriveAxisCount(input.work_scope);\n  const scope = deriveScope(input.caller_type, input.caller_identity);\n  const workScopeCate",
        "relevance_score": 0.15873015873015872
      },
      {
        "source_type": "project_file",
        "source_locator": "src/lib/agents/ira/synaptic_surface.ts",
        "content": "; }\n\nexport async function step0PriorArtRetrieval(input: Step0Input): Promise<Step0Result> {\n    return withAgentRole('igf_ira_service', async (tx) => {\n        for (const [scope_level, scope_identifier] of [\n            ['conversation', input.conversation_id] as const,\n            ['project', input.project_id] as const,\n        ]) {\n            const rows = await tx`\n                SELECT finger",
        "relevance_score": 0.15083798882681565
      }
    ],
    "substrate_retrievals": [
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E13",
        "content": "{\"id\": \"IGF-T0-E13\", \"name\": \"ICA Salience Calibration Rules v1.0\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 1, \"successor\": null, \"drift_flags\": [], \"predecessor\": null, \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01)\", \"verification_evidence\": \"Sourced verbatim from PL Sections 1-2\", \"open_verification_questions\": [], \"last_verified_aga",
        "relevance_score": 0.06992337164750957
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E07",
        "content": "{\"id\": \"IGF-T0-E07\", \"name\": \"Entry Schema Definition (v2)\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 2, \"successor\": null, \"drift_flags\": [], \"predecessor\": \"v1\", \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01 TC-0021)\", \"verification_evidence\": \"Schema documentation refresh per TC-0021. ip_classification column already exists in databas",
        "relevance_score": 0.059625212947189095
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E11",
        "content": "{\"id\": \"IGF-T0-E11\", \"name\": \"IMA Prompt Template\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 1, \"successor\": null, \"drift_flags\": [], \"predecessor\": null, \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01)\", \"verification_evidence\": \"Sourced verbatim from v0.2 Section 5.3\", \"open_verification_questions\": [], \"last_verified_against_platform\":",
        "relevance_score": 0.05874316939890711
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T5-E900",
        "content": "{\"origin\": \"OB-IGF-02 Phase 4 Section 2 (Gate 0.5), Meta-48 refined\", \"rationale\": \"Phase 3 surfaced a defect class where narrow-scope verification masked framework assumptions. Gate 0.5 is the explicit countermeasure: run schema checks (table existence, column shapes, role grants) and confirm pass criteria before any implementation begins. This prevents drafting code against tables or columns tha",
        "relevance_score": 0.056179775280898875
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E12",
        "content": "{\"id\": \"IGF-T0-E12\", \"name\": \"ICA Prompt Template\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 1, \"successor\": null, \"drift_flags\": [], \"predecessor\": null, \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01)\", \"verification_evidence\": \"Sourced verbatim from v0.2 Section 5.4 plus PL Sections 1-2\", \"open_verification_questions\": [], \"last_verifi",
        "relevance_score": 0.055445544554455446
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T5-E904",
        "content": "{\"origin\": \"OB-IGF-02 Phase 4 Section 1 Stop Condition 2\", \"rationale\": \"Endpoints exist to serve agent consumers. Building endpoints that no agent needs creates dead code and architectural drift. The check is simple: if you can't point to a section in the agent contracts that requires this endpoint, don't build it.\", \"statement\": \"Every HTTP endpoint must be derivable from at least one agent cont",
        "relevance_score": 0.049019607843137254
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E17",
        "content": "{\"id\": \"IGF-T0-E17\", \"name\": \"Four-Agent Integration Loops\", \"tier\": 0, \"loops\": [{\"name\": \"ICA → IRA (intelligence freshness loop)\", \"description\": \"When the ICA captures and Andrew approves a new entry, that entry becomes immediately available to the IRA. The next IRA invocation against work in the entry's area incorporates it. Lag from intelligence emerging to intelligence being applied collaps",
        "relevance_score": 0.04819277108433735
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T5-E905",
        "content": "{\"origin\": \"OB-IGF-02 Phase 4 Section 1 Stop Condition 4, Meta-75 binding\", \"rationale\": \"Phase 3 surfaced a defect class where tsc --noEmit passed locally but the Vercel build failed due to differences in build pipeline scope. Using npm run build as the verification command ensures the same compilation pipeline runs locally and in CI/preview.\", \"statement\": \"TypeScript correctness must be verifie",
        "relevance_score": 0.04597701149425287
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E01",
        "content": "{\"id\": \"IGF-T0-E01\", \"name\": \"E/E/C/I Tetrad — Efficiency\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 1, \"successor\": null, \"drift_flags\": [], \"predecessor\": null, \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01)\", \"verification_evidence\": \"Sourced verbatim from v0.2 Section 2.1\", \"open_verification_questions\": [], \"last_verified_against_pl",
        "relevance_score": 0.0447427293064877
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T5-E908",
        "content": "{\"origin\": \"OB-IGF-02 Phase 4 Section 1 Stop Condition 3\", \"rationale\": \"Drafting multiple endpoints while the foundational integration pattern is broken compounds the defect across all endpoints. Fixing one endpoint first establishes the known-good pattern that subsequent endpoints can follow.\", \"statement\": \"If withAgentRole integration fails for any single endpoint, STOP — do not draft addition",
        "relevance_score": 0.0410958904109589
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T0-E14",
        "content": "{\"id\": \"IGF-T0-E14\", \"name\": \"ICA Mode 3 External Source Category Registry v1.0\", \"tier\": 0, \"health\": {\"status\": \"locked\", \"version\": 1, \"successor\": null, \"drift_flags\": [], \"predecessor\": null, \"last_modified\": \"2026-04-09\", \"staleness_days\": 0, \"last_modified_by\": \"Andrew (via OB-IGF-01)\", \"verification_evidence\": \"Sourced verbatim from PL Section 3\", \"open_verification_questions\": [], \"last_v",
        "relevance_score": 0.040419161676646706
      },
      {
        "source_type": "substrate",
        "source_locator": "IGF-T5-E909",
        "content": "{\"origin\": \"OB-IGF-02 Phase 4 Section 5 Gate 7 item 8, Section 0 critical predecessor reading\", \"rationale\": \"Phase 3 identified three R0 architect drafting defects of the form 'narrow-scope verification masked by framework assumption.' Phase 4's completion report explicitly checks whether that class recurred. This pattern should be standing: each phase checks for recurrence of all known defect cl",
        "relevance_score": 0.039603960396039604
      }
    ],
    "total_artifacts": 20
  },
  "prompt_version": "ira-v6.0-unified-2026-04-19",
  "pass_metadata": {
    "pass_1_reasoning": "Fingerprint: task_class=architectural_option_evaluation, work_scope=IntentModifier input-vs-output scope discrimination across LLM emission/type system/executor layers, output_class=options_based. Tier 3 novel — no prior art at conversation or project scope for this specific cap-modifier applyTo design question. Binding entries identified by scanning substrate hints and full-body entries for propositions that govern: (1) structural heuristic requirements (Korean Test E910), (2) fix-logic-not-data discipline (E907), (3) adjacent-arm drift closure (E952 — identifier_only but hint-listed), (4) decision-implementation gap (E953 — identifier_only but hint-listed), (5) intent executor sole authority (Decision 151 via E-T2-E25), (6) plan intelligence forward (Decision 153 via E-T2-E08), (7) carry everything express contextually (E902), (8) calculation sovereignty (E904), (9) closed-loop intelligence (E906), (10) no hardcoded assumptions (E903), (11) prove don't describe (E905), (12) IRA prompt template output contract (T0-E09). Three user-supplied options (A, B, C) are present and evaluated against nine axes specified in the prompt. Coherence check performed between T1 principles (E910, E907, E906, E902, E903, E904, E905) and the T2 decision entries (151, 153, 122, 127, 154) that instantiate them. Supersession candidates examined for IntentModifier type definition gap and modifier-scope discrimination gap. Gap analysis probed for: modifier-scope architectural primitive, trace-shape change governance, transformer-as-compensating-control pattern.",
    "pass_1_cost_usd": 1.379745,
    "pass_2_total_cost_usd": 0,
    "pass_2_unit_count": 21,
    "pass_2_unit_failure_count": 0,
    "unit_failures": []
  }
}
=== COST: $1.379745 ===
```
