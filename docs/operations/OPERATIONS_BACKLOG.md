# Operations Backlog

Standing list of operational / future-work items recorded by the architect for later scheduling.
One entry per item. Newest at top. An entry graduates to its own OB directive when scheduled.

---

## BL-001 — Observatory atom-flywheel panel

- **Recorded:** 2026-06-11 (architect, SR-43 closure disposition)
- **Category:** Feature (Observatory)
- **Status:** Backlog — **build as a standalone OB after OB-203 Phase 4 ships**
- **Blocker:** depends on the OB-203 **Phase 4 signal vocabulary + trace queries** (the panel consumes them; cannot start until Phase 4 lands the vocabulary).
- **Scope:** an Observatory panel that renders, for the atom-flywheel / comprehension layer:
  - recognition **tier distribution** (sheet Tier-1/2/3 + atom known/novel split),
  - **atoms-known trend** (accumulation over imports),
  - **ambiguity rate** (ambiguous-atom fraction; first datapoints ~24–30% from OB-203 Phase 2),
  - **confidence calibration** (claimed roleConfidence vs realized outcome),
  - **comprehension cost curve** (LLM calls / bounded-residue size vs novelty — the DI-2 witness).
- **Design home:** Addendum-9 Observatory spec.
- **Source:** OB-203 Phase 2 EPG-2.4 / SR-43 evidence (`docs/vp-prompts/OB-203_COMPLETION_20260610.md`).
