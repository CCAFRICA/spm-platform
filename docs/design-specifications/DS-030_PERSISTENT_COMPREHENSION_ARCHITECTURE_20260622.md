# DS-030: Persistent Comprehension Architecture

**Vialuce Platform Design Specification**
**Date:** 2026-06-22 (v3)
**Author:** Architect Channel
**Status:** DRAFT — Governing Design Specification
**Provenance:** OB-231 → HF-333 → HF-336 → OB-232 → Korean Test / OB-214 audit across all layers → this specification
**Lineage:** OB-231 established the subtraction pattern. HF-333 extends it. This DS completes it across every layer and establishes the intelligence loop.
**Related:** Decision 158, Decision 154, Decision 64, OB-214, AUD-009, DS-028, DS-013, Synaptic State Specification

---

## 1. THE GOVERNING PRINCIPLE THIS SPECIFICATION ADDS

### 1.1 The distinction that resolves every case

Two kinds of validation exist in the platform. One is correct. One is a violation. They look similar. The difference:

**Structural property validation — CORRECT.** A check that verifies a universal, structural property of the output. "Does every numeric value in the insight trace to a `summary_artifacts` metric for the referenced entity and date range?" This property is universal — it holds for any insight type, any domain, any language. It doesn't check what the output IS. It checks whether the output is GROUNDED. Adding a new insight type, a new domain, a new language doesn't require changing the validator. The check is comprehensive by construction.

**Set membership validation — VIOLATION.** A check that verifies the output belongs to a developer-maintained finite set. "Is `artifact_type` one of {anomaly, trend, coaching, benchmark}?" This rejects any valid output the developer didn't anticipate. The LLM discovers a seasonal cycle pattern. The validator kills it. The output is only as good as the test is comprehensive. The test is not comprehensive — it is an enumeration. This is OB-214's prohibited pattern regardless of which layer it sits on.

**The principle:** Validation checks structural properties, never set membership. If a validator contains a finite list of allowed values, that list is a fixed enumeration requiring developer maintenance. The layer (recognition, construction, validation, rendering) does not change the violation class.

---

## 2. WHAT IS BROKEN — FULL AUDIT

### 2.1 The import pipeline erases comprehension

`finalize-import` step 2 sets `input_bindings = {}` on every import (HF-269). HF-336 populated Sabor's convergence bindings. The next reimport erases them. The pipeline destroys the comprehension it produces. This is the most operationally urgent defect.

### 2.2 The convergence layer uses a fixed taxonomy eradicated one layer up

`field_identity.structuralType`: 3-value enum (`measure`, `identifier`, `temporal`). Same violation class as the `ColumnRole` enum OB-231 removed at HC. HF-336 created new instances of this pattern for Sabor.

### 2.3 Comprehension is not universal

Two import paths. ICM produces convergence bindings. Financial Agent produces nothing. The next Financial tenant hits the same gap.

### 2.4 Fixed sets introduced in OB-232

Six fixed enumerations were introduced or endorsed across OB-232's architecture without being flagged as violations:

| Fixed set | Location | Values | Violation |
|---|---|---|---|
| `artifact_type` | `intelligence_artifacts.artifact_type`, EP-2 validator | anomaly, trend, coaching, benchmark | LLM discovers a `correlation`, `seasonal_cycle`, `forecast`, or `phase_shift` → validator kills it. Developer must add new types. OB-214 prohibited. |
| `severity` | `intelligence_artifacts.severity`, EP-2 validator | critical, warning, info, positive | LLM assesses `uncertain`, `emerging`, `deteriorating`, `resolved` → rejected. Same violation. |
| `entity_type` | `intelligence_artifacts.entity_type` | location, individual, organization, network | A team, department, vehicle, product line, region, shift, account segment → forced into wrong box or rejected. Cherry-pick (AUD-009). |
| `signal_type` | EP-1 signal capture | selection, dwell, drill, dismissal | Hover, scroll, zoom, share, bookmark, annotate, compare, filter, sort, pin, flag → unrepresented. Developer must maintain. |
| `insight_shape` fields | EP-3 structural signature | `{pattern, metric_class, entity_type, severity, delta_direction}` with implied value sets | `delta_direction`: increase/decrease — excludes volatile, stable, cyclical, converging. `pattern`: implies a closed set. Each field is a sub-registry. |
| `data_type` | `committed_data.data_type`, `summary_artifacts.data_type` | pos_cheque, transaction, entity, target | SCI assigns from a finite set. New data shapes not matching these labels have no classification path. |

### 2.5 The IRA's "allowable-form registry" endorsement

IRA Invocation 1 validated EP-2 as: "every form/primitive checked against a canonical allowable-form registry, failing loud on unrecognized forms (Decision 154 dispatch-surface rule)." This was cited as architectural justification for `artifact_type` and `severity` checks.

The endorsement was wrong. Decision 154's dispatch-surface rule says: structured failure on unrecognized identifiers — never silent fallback. The intent is: if you don't recognize something, fail loud rather than silently ignoring it. The implementation should be: if the validator encounters a type it hasn't seen, it flags it for review rather than rejecting it. Structured failure means "I don't recognize this — escalate," not "I don't recognize this — delete."

The correction: the validator logs unrecognized types as novel (a signal for the architect and the flywheel), stores the insight with the novel type, and flags it for human review. It does not reject. The LLM's recognition is authoritative. The validator guarantees structural properties (data traceability), not vocabulary membership.

---

## 3. THE SUBTRACTION LINEAGE

| Layer | What was eradicated | Status |
|---|---|---|
| **HC producer** | `ColumnRole` enum → free-form characterization | OB-231 SHIPPED |
| **HC consumers** | Type-consistency gate, attribute admission gate, entity_id_field selection | HF-333 RUNNING |
| **Entity resolution** | `structuralType === 'identifier'` → value-overlap | OB-232 RUNNING |
| **Convergence bindings** | `field_identity.structuralType` / `contextualIdentity` → free-form comprehension artifact | THIS DS — not started |
| **Import pipeline** | `finalize-import` erasure of `input_bindings` | THIS DS — not started |
| **Insight validator** | `artifact_type ∈ {fixed set}`, `severity ∈ {fixed set}` → structural property checks only | THIS DS — not started |
| **Intelligence schema** | `entity_type` fixed set → free-form from comprehension | THIS DS — not started |
| **Signal capture** | `signal_type ∈ {fixed set}` → free-form structural interaction characterization | THIS DS — not started |
| **Insight shapes** | Fixed-field fingerprint with implied value sets → free-form structural description | THIS DS — not started |
| **Data classification** | `data_type` fixed set → free-form data characterization | THIS DS — not started |

---

## 4. THE ARCHITECTURAL CORRECTION

### 4.1 Comprehension replaces convergence

The convergence layer's fixed taxonomy (`field_identity`) is replaced with free-form comprehension artifacts following the OB-231 pattern. Per field:

```json
{
  "characterization": "the total monetary amount of loans placed by this employee in the reporting period",
  "data_nature": "cumulative currency amount; increases monotonically within a period",
  "relationships": "compared against Meta_Colocacion to determine attainment",
  "aggregation_behavior": "sum across entities gives branch total; sum across periods is meaningless",
  "identifies": null
}
```

Structured channels the LLM fills freely. No enum. No fixed vocabulary. The OB-231 characterization structure extended with `aggregation_behavior` for the derivation layer.

### 4.2 Validation checks structural properties, not set membership

The EP-2 validator is corrected. What it checks:

**Data-contract (RETAINED — structural property):** every numeric value in `data_references` traces to a specific `summary_artifacts` metric for the referenced entity and date range. The LLM cannot introduce values not present in the summary data. This is a universal structural property. It works for any insight type, any domain, any language. No fixed set.

**Allowable-form (REMOVED — set membership):** the `artifact_type ∈ {anomaly, trend, coaching, benchmark}` check is removed. The `severity ∈ {critical, warning, info, positive}` check is removed. The LLM emits its characterization of the insight type and severity in free-form. The validator logs novel types as a signal (for architect review and flywheel learning). It does not reject.

**Structural coherence (ADDED — structural property):** the insight must have a non-empty title, narrative, and at least one data reference. The entity reference (if present) must exist in the `entities` table. The date range must be valid. These are structural properties — they hold for any insight type.

### 4.3 Free-form insight characterization

Instead of `artifact_type: "anomaly"`, the insight carries:

```json
{
  "insight_characterization": "an abrupt deviation from the established pattern in a single metric at a single entity over a short timeframe",
  "insight_severity": "requires attention — the deviation magnitude exceeds two standard deviations from the entity's trailing average",
  "insight_confidence": "high — the underlying data spans 6 months and the deviation is 3.4x the standard deviation"
}
```

The rendering layer reads the characterization and determines display treatment. The LLM can be asked: "given this insight characterization, what visual treatment is appropriate?" — recognition, not a hardcoded type-to-template lookup. A novel insight type that no developer anticipated gets a reasonable visual treatment because the LLM understands what it is and chooses how to present it.

### 4.4 Free-form signal characterization

Instead of `signal_type ∈ {selection, dwell, drill, dismissal}`, signals carry:

```json
{
  "interaction_characterization": "the user selected a specific entity from a list to view its detail",
  "interaction_structural_class": "entity focus narrowing",
  "surface": "financial_overview",
  "context": {"entity_id": "...", "metric_key": "revenue"}
}
```

The `interaction_structural_class` is not a fixed enum — it's the LLM's characterization of the interaction's structural nature. "Entity focus narrowing," "metric drill-through," "temporal range adjustment," "insight acknowledgment" — the vocabulary grows as the system encounters new interaction patterns. No developer maintenance.

### 4.5 Free-form insight shapes

Instead of `{pattern: "spike", metric_class: "measure", entity_type: "location", severity: "warning", delta_direction: "increase"}` with each field drawn from an implied value set, the shape is a free-form structural description:

```json
{
  "shape_description": "abrupt single-metric deviation at a single entity, positive direction, short timeframe",
  "structural_fingerprint_hash": "a]7f2c..."
}
```

The `shape_description` is the LLM's free-form characterization of the pattern's structure, stripped of all tenant content. The `structural_fingerprint_hash` is a deterministic hash of the description (or of structural features extracted from it) — enabling matching without string comparison. Two insights with structurally similar descriptions produce similar hashes. The Domain Flywheel matches on hash similarity, not on enum equality.

### 4.6 Free-form data characterization

Instead of `data_type ∈ {pos_cheque, transaction, entity, target}`, the data characterization is the comprehension agent's free-form description of what kind of data this is:

```json
{
  "data_characterization": "point-of-sale transaction records from a restaurant operation, one row per customer cheque, containing revenue, payment, service, and staff attribution fields"
}
```

The SCI pipeline's classification of sheet types follows the same principle: the LLM characterizes what the sheet contains in free-form. Downstream consumers read the characterization, not a fixed label.

### 4.7 Entity type from comprehension, not from a fixed set

Instead of `entity_type ∈ {location, individual, organization, network}`, the entity's type comes from the comprehension artifact's `identifies` field:

```json
{
  "identifies": "the individual employee — a bank sales representative who originates loans and deposits"
}
```

The rendering layer reads this to determine how to present the entity. An LLM can derive a concise label ("Employee") from the characterization. No developer-maintained type registry.

---

## 5. THE PIPELINE INVARIANT

### 5.1 No data enters derivation without comprehension

```
ARRIVAL → COMPREHENSION → RESOLUTION → DERIVATION → INTELLIGENCE → EXPERIENCE → SIGNALS
                                                                                    |
    ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←┘
```

Every stage:

**1. ARRIVAL.** Raw data → `committed_data`. No intelligence. A write.

**2. COMPREHENSION.** Domain-aware agent reads data, emits free-form comprehension artifacts per field. Persisted. NOT erased by subsequent imports. Agent selected by data characteristics — not by UI route. Comprehension is mandatory. Uncomprehended data is stored but not summarized, analyzed, or rendered with intelligence.

**3. RESOLUTION.** Construction layer reads comprehension artifacts. Fields with non-null `identifies` → entity dimension. Value-overlap matching links rows to entities (OB-232 D1). No enum check. No string pattern match.

**4. DERIVATION.** Summary Engine reads comprehension to determine what to aggregate and how. Deterministic computation. Decision 158 construct side. Output: `summary_artifacts` with comprehension-derived labels.

**5. INTELLIGENCE.** Insight Engine reads summaries + comprehension. Data is self-describing. LLM generates insights with free-form type/severity characterization. Validator checks structural properties (data traceability, entity existence, date validity) — not set membership. Logs novel types as signals. Output: `intelligence_artifacts` with free-form insight shapes.

**6. EXPERIENCE.** Rendering reads summaries + intelligence artifacts. Labels from comprehension. Insights pre-generated. LLM determines visual treatment from insight characterization — no type-to-template lookup. Deterministic validator enforces data-contract (numbers trace to summaries). IRA-validated morphological inversion enforcement points.

**7. SIGNALS.** User interactions → canonical signal surface with free-form interaction characterization. Signals flow back to: Stage 2 (corrections refine comprehension), Stage 4 (usage shapes pre-computation), Stage 5 (engagement weights insight generation), Stage 6 (density shapes surface composition). The loop closes.

### 5.2 The `finalize-import` erasure

The pipeline invariant is violated by `finalize-import` step 2 setting `input_bindings = {}`. First implementation target: `finalize-import` must not erase existing comprehension. New imports may trigger comprehension refresh. They must never blank existing comprehension without replacement.

### 5.3 UI implications

- **"Import Data"** — domain-neutral entry point
- **Comprehension display** — what the system understood, not a configuration form
- **Correction as signal** — user corrections write as synapses, refine comprehension, propagate to the Domain Flywheel
- **Intelligence preview** — insights shown after import, before navigation

---

## 6. THE INTELLIGENCE LOOP

No individual stage is the innovation. The loop is.

### 6.1 Progressive Performance at comprehension

First encounter with Mexican POS data: full inference. Classifies 25 fields. Full cost. Second Mexican restaurant tenant: Domain Flywheel fingerprint match. Higher confidence, lower cost. Fiftieth: near-instant comprehension from accumulated domain knowledge. Near-zero cost.

### 6.2 Progressive Performance at derivation

After signal accumulation: the Curation Engine reads density and adjusts what the Summary Engine pre-computes. After cross-tenant accumulation: the Foundational Flywheel feeds patterns back. A new tenant gets pre-computed summaries shaped by the collective usage of every prior tenant in the domain, before anyone logs in.

### 6.3 Progressive Performance at intelligence

Insight shapes accumulate in the Domain Flywheel. The fiftieth tenant's first matching pattern gets a deeply contextualized insight on day one — learned from the accumulated shapes of prior insights, not programmed.

### 6.4 The signal-comprehension feedback loop

User corrects a characterization → synapse → comprehension refreshes → Domain Flywheel carries the refinement → next tenant benefits. The user taught the system. The system remembered. The domain gets smarter.

---

## 7. RELATIONSHIP TO EXISTING ARCHITECTURE

### 7.1 Decision 158 — applied, not modified

Recognize/construct boundary unchanged. The LLM recognizes field semantics (comprehension), insight patterns (intelligence), interaction meaning (signals), and visual treatment (experience composition). Deterministic code constructs artifacts, stores them, validates structural properties, and executes aggregation.

### 7.2 OB-231 / HF-333 — the precedent

Remove fixed taxonomy at the producer. Remove consumer-side gates. This DS applies the same two-step pattern at the convergence layer, the insight layer, the signal layer, and the data classification layer.

### 7.3 DS-028 — enriched

Convergence → Comprehension. Summary/Insight/Curation stages unchanged in principle, enhanced in practice (richer free-form artifacts instead of fixed-taxonomy bindings).

### 7.4 DS-013 — implemented through this pipeline

Stages 6-7 are the implementation mechanism for DS-013 Phases C/D/E.

### 7.5 Synaptic State — comprehension as synapse

Comprehension artifacts are synapses. Corrections are synapses. The comprehension layer participates in the synaptic surface. Principle 2: Observation IS Action.

### 7.6 IRA Invocations 1+2 — enforcement points revised

The IRA validated three enforcement points. EP-1 (signal capture) and EP-3 (insight shapes) are revised: free-form characterization replaces fixed type sets. EP-2 (deterministic validator) is revised: data-contract retained (structural property check), allowable-form removed (set membership check). The IRA's coherence finding holds — the enforcement points exist, but their implementation is corrected to align with OB-214.

---

## 8. IMPLEMENTATION SEQUENCE (GOVERNING, NOT PRESCRIPTIVE)

Architectural dependency order:

1. **Fix `finalize-import` erasure** — immediate HF. Comprehension must persist.
2. **Comprehension artifact schema** — free-form structure replacing `field_identity`
3. **Comprehension agents** — Financial and ICM agents emit new-format artifacts
4. **Migration** — existing BCL/Sabor bindings re-expressed
5. **Validator correction** — remove set-membership checks, retain structural-property checks, add novel-type signaling
6. **Summary Engine comprehension read** — aggregation strategy and labels from comprehension
7. **Insight Engine free-form output** — characterization replaces type enum
8. **Signal capture free-form** — interaction characterization replaces type enum
9. **Rendering layer** — visual treatment from characterization, not type-to-template mapping
10. **Signal-comprehension feedback loop** — corrections → synapses → comprehension refresh
11. **Domain Flywheel engagement** — fingerprints accumulate and transfer

Each step is governed by this DS. Vertical slice rule applies. The OB-214 audit (§2.4) is a HALT condition for every step: if an implementation introduces a new fixed set, it violates this DS.

---

## 9. OPEN QUESTIONS

### 9.1 Comprehension artifact storage
`rule_sets.input_bindings` (JSONB reuse) or a dedicated `comprehension_artifacts` table (queryable, indexable). Implementation decision.

### 9.2 LLM-mediated aggregation strategy
Can the Summary Engine ask the LLM "given these comprehension artifacts, how should each field be aggregated?" — recognition call, Decision 158 compliant. Needs testing.

### 9.3 Comprehension refresh lifecycle
When to re-run: every import, on schema change, on accumulated corrections, on flywheel update. Cost vs freshness trade-off.

### 9.4 Cross-domain comprehension
ICM and Financial agents sharing comprehension within a tenant — Tenant Flywheel at full engagement. Architecturally powerful and complex.

### 9.5 Structural fingerprint hashing for insight shapes
Free-form shape descriptions need a deterministic matching mechanism for the Domain Flywheel. Semantic similarity hashing (embedding-based) or structural feature extraction → hash. Neither requires a fixed value set. Design decision for the flywheel implementation.

### 9.6 Rendering without type-to-template mapping
If the rendering layer asks the LLM "how should this insight be displayed?" for every insight, that's an LLM call at render time — the OB-53 anti-pattern. Resolution: the LLM assigns visual treatment at GENERATION time (Step 5), stored with the insight. The rendering layer reads the pre-assigned treatment. Import-time cost, not render-time cost.

---

*DS-030 v3: Persistent Comprehension Architecture.*
*Lineage: OB-231 established the pattern. HF-333 extends it. This DS completes it across every layer.*
*Governing principle: validation checks structural properties, never set membership.*
*The platform comprehends data in the LLM's own language. Every import produces comprehension. Every interaction refines it. Every tenant benefits from accumulated understanding.*
*The loop is the innovation.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
