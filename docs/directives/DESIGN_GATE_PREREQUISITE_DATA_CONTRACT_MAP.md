# DESIGN GATE PREREQUISITE: DATA CONTRACT MAP

**Status:** LOCKED  
**Effective:** 2026-05-16  
**Source:** HF-226 post-mortem — directive confused `convergence_bindings` (per-component column-role mapping) with `metric_derivations` (metric-to-data derivation rules), prescribed removal of infrastructure the platform requires, forced CC to invent a bridge (`findMetricFilters`) that instantiated the defect class the HF was closing.

---

## The Rule

**Before drafting any HF, OB, or DS that modifies a data flow between pipeline stages, the architect channel must produce and review a Data Contract Map.**

No fix design, no CC directive, no code prescription until the map is reviewed and the relationships are understood.

---

## What Triggers This Gate

Any proposed change that:

1. **Adds, removes, or restructures a persisted data structure** that is written by one stage and read by another (e.g., JSONB fields in `input_bindings`, signal payloads in `classification_signals`, batch metadata in `calculation_batches`)
2. **Eliminates or merges functions** that produce data consumed by downstream stages
3. **Adds a new field** to an interface or JSONB structure that must be populated by an upstream producer and read by a downstream consumer
4. **Changes the routing logic** that determines which data path the engine or pipeline takes

If the change is contained within a single function and does not alter what that function writes or what its consumers read, this gate does not apply.

---

## What the Map Must Contain

For every persisted data structure on the fix surface:

### A. Shape

The actual JSONB shape or TypeScript interface, not a description. Paste it from the code or schema.

```
Example:
  input_bindings.convergence_bindings = {
    component_0: {
      actual: { source_batch_id, column, scale_factor, via? },
      target: { source_batch_id, column, scale_factor },
      entity_identifier: { ... }
    }
  }

  input_bindings.metric_derivations = [
    { metric, operation, source_pattern, source_field?, filters, ... }
  ]
```

### B. Writer

Which function or pipeline stage writes this structure? At what point in the flow? Under what conditions?

```
Example:
  convergence_bindings ← written by generateAllComponentBindings()
    via resolveColumnMappingsViaAI() + column-role assignment
    Condition: field identities available

  metric_derivations ← written by generateAISemanticDerivations()
    via Pass 4 AI prompt + response parse
    Condition: unresolved metrics remain (pre-HF-226)
```

### C. Reader

Which function or pipeline stage reads this structure? What fields does it access? What happens when a field is absent?

```
Example:
  convergence_bindings → read by resolveMetricsFromConvergenceBindings()
    Accesses: .actual.column, .target.column, .entity_identifier
    Missing field behavior: falls back to metric_derivations path

  metric_derivations → read by applyMetricDerivations()
    Accesses: .metric, .operation, .source_pattern, .source_field, .filters
    Missing field behavior: rowMatchesFilters returns true (no filtering)
```

### D. Relationship

How do these structures relate to each other? Are they alternatives (engine picks one), complements (engine needs both), or independent (different consumers)?

```
Example:
  convergence_bindings and metric_derivations are COMPLEMENTS:
    - convergence_bindings provides column-role mapping (WHERE to find data)
    - metric_derivations provides derivation logic (HOW to derive the value)
    - Engine prioritizes convergence_bindings when present, falls back to
      metric_derivations — but a tenant may have BOTH, serving different
      purposes
```

### E. Impact Assessment

For each structure on the fix surface: if you remove the writer, what breaks? If you add a field, who must populate it? If you change the routing, which tenants are affected?

---

## How It Integrates with Existing Gates

The Data Contract Map is a **prerequisite to the Design Gate**, not a replacement for it. The sequence:

1. **AUD** — audit surfaces the defect class and the functions involved
2. **Data Contract Map** — map the data structures those functions produce and consume, who writes, who reads, how they relate
3. **Design Gate** — with the map in hand, design the fix at the structural-class level
4. **IRA invocation** (if applicable) — substrate evaluation of the proposed design
5. **HF directive** — code-justified, data-contract-aware prescription for CC

The HF-226 failure occurred because step 2 was skipped. The AUD-009 inventory identified 19 functions (verbs) but the directive never mapped the data structures (nouns) those functions produce. The result: a directive that prescribed removing a verb without understanding that its noun had no other producer.

---

## Anti-Patterns This Gate Prevents

**AP-DCM-1: Verb-only analysis.** Inventorying functions without mapping the data they produce and consume. Functions are verbs; data structures are nouns. You cannot redesign a sentence by analyzing only the verbs.

**AP-DCM-2: Assumed equivalence.** Treating two data structures as interchangeable because they're stored in the same JSONB column or read by the same engine. `convergence_bindings` and `metric_derivations` both live in `input_bindings` and both feed the engine, but they serve different purposes.

**AP-DCM-3: Removal without replacement.** Prescribing elimination of a function that produces a data structure without specifying what will produce that structure instead. If the writer is removed, the reader starves.

**AP-DCM-4: Bridge invention.** When a directive fails to account for a data relationship, the implementor is forced to invent a bridge between structures that should share a unified contract. Bridges are symptoms of incomplete design, not solutions.

---

## Minimum Viable Map

For simple changes (single structure, clear writer/reader):

```
STRUCTURE: [name]
SHAPE: [paste interface or JSONB shape]
WRITER: [function] in [file] at [line]
READER: [function] in [file] at [line]
RELATIONSHIP TO OTHER STRUCTURES: [complement / alternative / independent]
IMPACT IF WRITER REMOVED: [what breaks]
IMPACT IF FIELD ADDED: [who must populate]
```

For complex changes (multiple structures, multiple writers/readers): full map per section A-E above.

---

*This prerequisite is effective immediately and applies to all future HF/OB/DS directives that modify inter-stage data flows.*
