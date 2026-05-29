# ARCHITECTURE DECISION RECORD — HF-254

*Ingestion Flywheel — Single Skip Authority, Role-Bearing Caches, Lexical Prior*
*Standing Rules Section B — committed BEFORE any implementation code.*

```
ARCHITECTURE DECISION RECORD — HF-254
=====================================
Problem: Two uncoordinated import-time LLM-skip caches. Cache B (vocabulary
bindings) is unfinished (strings without roles), fabricates columnRole='unknown'
+ confidence=0.85 + confirmationCount=2 to pass its own skip gate, and (since
HF-239 enabled bulk emission) corrupts every warm import to entity. Cache A
(fingerprint flywheel) is correct but its warm replay is diverted by an HF-236
compensation because the fingerprint write does not reliably carry native
columnRole.

Decision: ONE LLM-skip authority = the fingerprint flywheel, carrying real
columnRole. The lexical (vocabulary) cache is demoted from gate to additive
classification prior and completed to carry full interpretation. No fabricated
value survives.

Option A (CHOSEN): (1) delete vocabulary-binding skip gate; (2) enrich
fingerprint write with native columnRole server-side + delete HF-236 divert;
(3) persist role-bearing vocabulary_bindings + consume as additive prior.
  - Scale 10x: per-file/per-sheet loops, unaffected by row count. PASS.
  - AI-first: removes fabrication; all roles from LLM. PASS (closes Principle 1/AP-7).
  - Single pipeline: one skip authority; prior is non-gating. PASS (AP-17).
  - Atomicity: in-memory classification; no partial DB state. PASS.

Option B (REJECTED): keep Cache B as a skip but make it carry roles
(heavier — schema-shape change to gate path; still two skip authorities → AP-17
unresolved; precedence model undefined).

Option C (REJECTED): only delete the skip gate, leave Cache B unused
(abandons the lexical moat the vision requires; leaves dead scaffolding).
```

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

```
G1 - Standard: platform AI-First principle (Section A.1) + Korean Test invariant
     (AP-25 / IGF-T1-E910 v2) govern. No numeric/financial standard touched (engine
     out of scope).
G2 - Architectural Embodiment: a single LLM-skip authority (the fingerprint flywheel,
     carrying native columnRole) structurally guarantees that warm reuse only skips
     when there is a real, role-bearing prior classification. No fabricated value can
     arm a skip because the fabrication is deleted (the values literally no longer
     exist in the code). The lexical cache is structurally non-gating (additive prior),
     so it cannot, by construction, short-circuit the LLM.
G3 - Traceability: skip authority = fingerprint flywheel tier-1 match; native role
     sourced from HC interpretations persisted on the fingerprint row + the trace.
     Auditable from structural_fingerprints + classification_signals JSONB.
G4 - Discipline: cache coherence / single-writer-of-truth. Two warm-skip caches with
     no precedence model is the defect; one authority + one non-gating prior resolves it.
G5 - Abstraction: "a derived cache must carry the full decision it claims to accelerate,
     or it must not gate" is domain-universal.
G6 - Innovation Boundary: no new concept; reuses fingerprint flywheel + the existing
     prior-signal additive mechanism (extractClassificationSignals → prior_signal →
     Bayesian posterior). The lexical prior is a sibling of the structural prior.

Relevant gates G2,G3,G4,G5 passed; G1/G6 identified as not-numeric-standard-bound.
```

## SCALE ANALYSIS (Standing Rule 25)

All changes operate on per-file / per-sheet / per-column loops (variant/column counts),
never per-row. The lexical prior recall is one indexed query per content unit. No HTTP-
body row transport (AP-1), no per-row DB calls (AP-4). Unchanged at 10x/100x row volume.

## ANTI-PATTERN CHECK

- AP-5/AP-6/AP-7: Phase 3 deletes the fabricated columnRole='unknown'/confidence=0.85/
  confirmationCount=2. Only LLM-emitted role/confidence flow. Lexical prior contributes
  via columnRole distribution, never column-name string matching (Korean Test).
- AP-13: native-columnRole source confirmed by Phase 2 read (trace HC at analyze;
  trace HC / round-trip at emit) — see completion report.
- AP-17: one skip authority after this HF; lexical prior is non-gating. (Residual: two
  fingerprint WRITE sites reconciled to identical enriched shape; full single-writer is §6A.)
- SR-34: HF-236 compensation removed by fixing the write structurally, not worked around.

## SCOPE BOUNDARY (DD-7 / SR-38)

In scope: the three changes in §1.5. Out of scope: convergence/engine (HF-253),
multi-file upload, HF-247 read-surface gate, the column_roles vs fieldBindings.columnRole
dual-vocabulary, lookupPriorSignals structural behavior. Cache A behavior + reconciled
tenants (BCL Oct, Meridian, CRP) must not regress (EPG-7).
```
