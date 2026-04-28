# OB-196 Architecture Decision Record

**Date:** 2026-04-28
**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...`
**Phase:** 0 (mandatory ADR before Phase 1 per Section B of Standing Architecture Rules)

---

## Problem

BCL imports a plan and calculates wrong. C1 (`bounded_lookup_2d`) and C2 (`bounded_lookup_1d`) return $0. Total $19,280 vs $44,590 expected.

DIAG-024 + AUD-004 Phase 0/0G traced the failure to four substrate gaps:

1. Six places hand-maintain primitive vocabulary (F-005 prompt drift; F-007 `tier_lookup` ↔ `tiered_lookup`; F-008 `weighted_blend` / `temporal_window` unreachable).
2. Dispatch surface silently falls back on unrecognized identifiers (F-002 executor `default:` returns `undefined`; F-002b `resolveSource` likewise; F-002c/d `noMatchBehavior` `'error'` case is a silent zero; F-003 legacy switch falls through with `payout: 0`; F-004 `convertComponent` default writes `componentType: 'tier_lookup'` regardless of input).
3. `metadata.intent` round-trip drops fields (F-001 BCL/CRP active rule_sets exhibit `componentType: 'tier_lookup'` paired with `calculationIntent.operation: 'bounded_lookup_*'` — DIAG-024 fingerprint).
4. Convergence is isolated from plan-agent comprehension (F-006 convergence-service writes 1 signal type, reads 0; F-011 `training:dual_path_concordance` written but never read).

IRA Invocation 1 (2026-04-27, $1.78842) returned six supersession_candidates, all `extend`. Decisions 154 + 155 LOCKED 2026-04-27 ratify the structural response.

OB-196 implements the six extensions (E1–E6) 1:1 against the platform substrate.

---

## N2 mechanism alternatives — canonical primitive vocabulary declaration

The central architectural question for E1: where does the canonical declaration live, and what mechanism enforces single-source-of-truth across all dispatch and naming boundaries?

### Option A — TypeScript const + Domain Agent registration

A TypeScript module exports the foundational primitive set as a `const` array of string literals. The `IntentOperation` union derives from this array via `typeof PRIMITIVES[number]`. Every consumer imports from this module.

- **Scale test (10× volume):** PASS — registry is module-loaded once at boot; per-dispatch lookup is a constant-time array/map operation.
- **AI-first:** PASS — registry is structural; consumers don't hardcode strings; the AI's emitted strings are validated against the registry at the import boundary.
- **Transport:** in-process module import; no HTTP / network call.
- **Atomicity:** load atomic with module init; no partial-load state.
- **G1 (standards):** TypeScript type system + ECMAScript module loading are W3C/TC39-equivalent for typed compile-time vocabulary.
- **G2 (architectural embodiment):** every consumer imports from one path (`web/src/lib/calculation/primitive-registry.ts`); compile-time symbol resolution enforces single source.
- **G3 (traceability):** grep-able single source of truth; an auditor reads one file and knows the entire vocabulary.
- **G4 (discipline enforcement):** TypeScript compiler rejects strings outside the union at every consumer; no runtime check needed for compile-time consumers.
- **G5 (abstraction):** foundational primitives in one registry; future Domain Agent primitives in a separate domain registry (decoupled per Decision 154's narrow domain-agent exemption).
- **G6 (innovation evidence):** TypeScript compiler enforces compile-time exhaustiveness on the discriminated union; the architect can verify by attempting to write a string literal not in the union and observing the compile error.

### Option B — JSON resource file

A `primitives.json` resource file at known path; consumers load and parse at boot.

- **Scale test:** PASS.
- **AI-first:** PASS.
- **Transport:** filesystem read at boot.
- **Atomicity:** PASS.
- **Loses TypeScript type safety:** consumers must validate at runtime; no compile-time exhaustiveness.
- **Critical defect for this OB:** F-005 (six declaration sites with different counts) is exactly the failure mode this would re-introduce at the JSON-vs-TypeScript boundary. The TypeScript types and the JSON file would diverge over time, exactly as the prompt and the executor switch diverged in the audit findings.

### Option C — Database table

A `primitives` table; consumers query at every dispatch.

- **Scale test:** DEGRADES — DB lookup at every dispatch boundary. Calculation runs touching N components × M entities × K periods would multiply load by N×M×K dispatches.
- **AI-first:** PASS in principle.
- **Transport:** SQL at every dispatch — performance prohibitive at scale.
- **Wrong layer:** primitives are platform commitments (versioned with code), not tenant data (versioned independently). Putting them in a tenant-scoped table conflates layers (Decision 64 v2's separation of tenant from foundational scope).

### Option D — Code-generated source

A build-time codegen step generates `intent-types.ts` and the registry from a YAML/spec source.

- **Scale test:** PASS.
- **AI-first:** PASS.
- **Premature optimization for v0:** TypeScript const handles registration without code-gen complexity. Build pipeline addition introduces a new failure surface (codegen drift; CI step). When the foundational primitive set stabilizes and changes monthly+, codegen is appropriate; for the current substrate (12 primitives, ~quarterly evolution per Decision 145 CRP test), TypeScript const is sufficient.

---

## Decision

**CHOSEN: Option A** (TypeScript const + Domain Agent registration).

**REJECTED:**
- **Option B** (JSON resource file): re-introduces the F-005 failure mode at the JSON↔TypeScript boundary. The audit is precisely the failure of multiple declarations diverging; substituting one declaration form for another doesn't fix the multiplicity.
- **Option C** (Database table): wrong layer (primitives are platform code commitments, not tenant data). Performance degradation at scale. Conflates tenant-scope with foundational-scope per Decision 64 v2.
- **Option D** (Code-generated source): premature complexity for a 12-primitive vocabulary; introduces a build-pipeline failure surface. Revisit when primitive set evolution rate justifies codegen overhead.

**Rationale tied to G1–G6:** Option A satisfies all six gates without trade-off. The TypeScript compiler becomes the structural enforcement mechanism (G4) that Decisions 154 + 155 require. Decision 155's "canonical declaration is a SURFACE (registry), not a string" is satisfied at compile time: consumers import a typed reference, not a literal string.

---

## Anti-pattern alignment

This ADR avoids:

- **AP-25 (Korean Test):** the registry is structural; consumers reference by symbol, not by string literal. Decision 154's extension to operation vocabulary is satisfied.
- **AP-17 (two code paths):** Phase 2 makes the legacy switch explicitly `@deprecated` and forces it through structured failure on unrecognized componentType. The intent executor becomes the sole live path.
- **FP-49 (SQL Schema Fabrication):** Phase 5 verifies `classification_signals` schema before drafting the migration.
- **FP-21 (dual code path):** Phase 2's deprecation closes the dual-path window opened by HF-188's "concordance shadow" framing.
- **FP-69 / FP-70 (fix one, leave others / phase deferral as completion):** Phase 0–6 close every IRA Inv 1 supersession_candidate atomically before Phase 7 compliance gates.

---

## Out of scope for this ADR

- Domain Agent primitive registration mechanism: stubbed in Phase 1 (`registerDomainPrimitive` throws `NotImplementedError`). Decision 154 governs the contract; mechanism design is Phase 8 of the AUD-004 closure stack (deferred work item; CRP test exercises this surface when CRP is restored).
- Per-flywheel signal coupling enforcement at scale: per directive Assumption A3, basic coupling check at startup is sufficient for OB-196; IRA Invocation 2 (deferred) addresses scale-coupling.
- IGF amendments to T1-E910, T1-E902, T1-E906: separate work item (`vialuce-governance` repo, IRA Inv 1 supersession dispositions).

---

## Compliance — Section B Architecture Decision Gate

This ADR satisfies the Section B Architecture Decision Gate of CC_STANDING_ARCHITECTURE_RULES.md v3.0:

- Problem stated.
- Three+ options enumerated and evaluated against Scale / AI-first / Transport / Atomicity criteria.
- Governing Principles G1–G6 evaluated for the chosen option.
- Chosen option named with rationale.
- Rejected options named with rationale.

ADR is committed to git in Phase 0 before any code change in Phase 1.
