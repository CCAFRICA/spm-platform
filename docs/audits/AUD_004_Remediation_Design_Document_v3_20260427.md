# AUD-004 Remediation Design Document — v3 (Repo-Corrected)
## Universal Calculation Primitive Identification — Substrate-Grounded Design

**Authoring conversation:** AUD-004 Remediation Design (Phase A.2 → Design)
**Repo:** **`CCAFRICA/spm-platform`** (the platform where E1–E6 + Decisions 154 / 155 land)
**Substrate baseline:** `origin/main` HEAD `6bc005e6...`, post-CLN-001, post-DIAG-024
**Companion repo (IRA invocations only):** `vialuce-governance` — referenced exclusively for the IGF substrate, IRA prompt/response artifacts, and any T1 / Tier 0 amendments that emerge from the design. **No platform code lives there.**
**Predecessor inputs:** AUD-004 Phase 0 inventory + Phase 0G gap closure (in `CCAFRICA/spm-platform` project knowledge); IRA Inv 1 / 2 / 3 / 4 (responses captured in `vialuce-governance/docs/IRA-responses/`). Total IRA spend: $6.53 across four invocations.
**Status:** Draft for architect handoff to successor implementation conversation. **Decision 154 LOCKED 2026-04-27. Decision 155 LOCKED 2026-04-27.**
**Successor:** Implementation conversation (separate). Reads this document, completes Phase B (boundary inventory **on `spm-platform`**), then drafts CC directive(s) for **platform development execution.**

---

## Section 1 — The verbatim problem

> If a new structural primitive appears, would the platform still work? The answer today is no.

Binary, present-tense, architectural. The remediation makes the answer "yes" by binding the structural fix to existing substrate via six extensions (E1–E6, LOCKED 2026-04-27), Decision 154 (LOCKED 2026-04-27), and Decision 155 (LOCKED 2026-04-27). Removing any extension or decision re-opens a "no" path.

This problem is the structural complement to AP-25 (Korean Test): *if domain vocabulary changed, would the platform still work?* AP-25's answer is yes for the field-identification surface. The verbatim problem above asks the same question for the operation-vocabulary surface. The remediation's substrate hook is therefore E6 (Korean Test extension to operation vocabulary, captured in Decision 154). The other five extensions (E1–E5) carry the structural disciplines that make E6 enforceable end-to-end across the **platform code paths in `spm-platform`**.

---

## Section 2 — Six substrate extensions (LOCKED 2026-04-27, IRA-grounded)

Each extension is grounded in an existing locked decision or T1 principle, with IRA Invocation 1 and follow-on Invocations 2 / 3 / 4 supplying coherence findings. Each extension applies to specific code paths in `spm-platform`.

### E1 — Extend Decision 24 (Calculation Intent Vocabulary) — single canonical declaration surface

**Existing substrate.** Decision 24 names the vocabulary.

**Extension obligation.** The vocabulary shall exist in exactly one canonical declaration. Every boundary derives from that declaration without maintaining a private copy.

**Decision 155 sharpens this.** The canonical declaration is a **surface (registry)**, not a string. Federated per-domain entries; surface enforces uniqueness, structural validity, Korean Test compliance.

**Platform code paths affected (in `spm-platform`):**
- `web/src/lib/calculation/intent-types.ts` — the union of operation types.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — plan-agent system prompt + user prompt builder.
- `web/src/lib/compensation/ai-plan-interpreter.ts` — `convertComponent`, `normalizeComponentType`, `normalizeCalculationMethod`.
- `web/src/lib/calculation/intent-executor.ts` — executor switch.
- `web/src/lib/calculation/run-calculation.ts` — legacy switch.

**Additional dimension surfaced by IRA Inv 3 / 3c (constraints-present rank 1):** E1 carries SCI emission constraints E2 / E4 / E6 do not share. Three constraint classes:
- **C1 — Persistence-before-declaration.** SCI persists primitive identifiers before E1's canonical declaration resolves them.
- **C2 — Structural-identification.** SCI agents identify primitives structurally (T0-E28, T1-E922).
- **C3 — Resolution-chain compatibility.** SCI's Plan Agent uses three-tier resolution chain (T1-E903).

**Audit findings closed.** F-001, F-005, F-007, F-008.

---

### E2 — Extend Decision 151 (Intent Executor Sole Calculation Authority) — dispatch surface integrity

**Existing substrate.** Decision 151 establishes the executor as sole calculation authority.

**Extension obligation.** Sole authority depends on receiving structurally valid input. The dispatch surface validates every primitive against E1's surface (Decision 155) and produces observable, named, structured failure on unrecognized identifiers. No silent `undefined`, no silent `0`, no silent `tier_lookup` fallback.

**Platform code paths affected (in `spm-platform`):**
- `web/src/lib/calculation/intent-executor.ts:438-450` (executor switch — F-002 cascade origin).
- `web/src/lib/calculation/intent-executor.ts:61-140` (`resolveSource` — F-002b).
- `web/src/lib/calculation/intent-executor.ts:591-603` (`noMatchBehavior` switch — F-002c, F-002d).
- `web/src/lib/calculation/run-calculation.ts:362-408` (legacy switch — F-003).
- `web/src/lib/compensation/ai-plan-interpreter.ts:681-708` (`convertComponent` default — F-004).
- `web/src/app/api/calculate/run/route.ts:61` (POST function — outer try/catch absent).

**Audit findings closed.** F-002 / F-002b / F-002c / F-002d, F-003, F-004.

---

### E3 — Extend Decision 64 v2 (Dual Intelligence) — read-before-derive obligation, structurally partitioned

**Existing substrate.** Decision 64 v2 establishes three signal levels (L1 / L2 / L3) on shared `classification_signals`.

**Extension obligation.** Every signal type written shall have at least one defined reader before the next calculation run.

**IRA Inv 2 sharpening (Option C rank 1).** Read-coupling is **structurally derived from signal properties**, not arbitrarily scoped:
- **L1 Classification signals:** at least one reader within originating flywheel.
- **L2 Comprehension signals:** readers within originating flywheel AND at least one cross-flywheel reader (foundational flywheel default).
- **L3 Convergence signals:** readers across all three flywheels.

**Mechanism.** Signal-type registry (per N2 below) declares structural properties. Read-coupling rules derived from properties. Auto-registration when new structural primitive writes its first signal.

**Platform code paths affected (in `spm-platform`):**
- `web/src/lib/intelligence/convergence-service.ts` (~1,751 lines — current write-only behavior).
- `web/src/app/api/calculate/run/route.ts:1840-1862` (`training:dual_path_concordance` write — F-011).
- `classification_signals` table schema (Supabase migration, in `web/supabase/migrations/`).

**Audit findings closed.** F-006, F-011.

---

### E4 — Extend Carry Everything (T1-E902) — round-trip closure

**Existing substrate.** T1-E902 governs import boundary.

**Extension obligation.** Carry Everything applies through the dispatch surface. Every primitive identifier persisted at import is recognizable at every downstream boundary. Round-trip closure: prompt → importer → `metadata.intent` → executor without identifier loss.

**T1-E902 wording amendment required** (per IRA Inv 3 disposition #4). T1-E902 is a `vialuce-governance` substrate entry — the amendment is locked in IGF, not in `spm-platform`. **Implementation in `spm-platform` consumes the amended principle.**

**Platform code paths affected (in `spm-platform`):**
- `web/src/lib/compensation/ai-plan-interpreter.ts` (`convertComponent` 5-tuple lines 667-679 — HF-156 era).
- `web/src/lib/calculation/intent-transformer.ts` (`transformFromMetadata` — HF-187 era).
- `metadata.intent` shape across all consumers.

**Audit findings closed.** F-001 + F-008 structurally.

---

### E5 — Extend Closed-Loop Intelligence (T1-E906) — read-before-derive as principle-level obligation

**Existing substrate.** T1-E906: "Every interaction generates a classification signal that accumulates into the platform's learning systems."

**Extension obligation.** Any service writing to the signal surface shall read the signal surface before invoking AI semantic derivation. Plan-agent comprehension flows to convergence as Level 2 Comprehension signals; convergence reads before deriving.

**T1-E906 wording amendment required** (per IRA Inv 3 disposition #5). Amendment locked in `vialuce-governance` IGF substrate.

**IRA Inv 3 / 3b sharpening (partially-expressible rank 1).** Three comprehension dimensions need substrate beyond `classification_signals`:
- **D1 — Persistent fingerprint metadata.**
- **D2 — Structural alias registry** (Reference Agent concern, cross-references C2).
- **D3 — Durable comprehension memory.**

These are not addressed by E5 alone. Successor implementation conversation determines whether they extend E5's scope or require N4.

**Platform code paths affected (in `spm-platform`):**
- `web/src/lib/intelligence/convergence-service.ts` — Pass 4 AI semantic derivation; current isolation from plan-agent comprehension.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — plan-agent prompt where comprehension is generated.
- `classification_signals` schema for L2 Comprehension signal write surface.

**Audit findings closed.** Implements Decision 147 / 153 forward. Removes convergence non-determinism root cause.

---

### E6 — Extend Korean Test (T1-E910) — captured in Decision 154

**Existing substrate.** T1-E910 (Korean Test, AP-25): "All field identification must use structural heuristics... never field-name matching in any language."

**Extension obligation.** Korean Test applies to operation/primitive vocabulary, not only field identification.

**Captured in Decision 154 (LOCKED 2026-04-27).** See Section 3.

**T1-E910 wording amendment required** (per IRA Inv 3 disposition #3). Amendment locked in `vialuce-governance` IGF substrate.

**Platform code paths affected (in `spm-platform`):** every code path E1, E2, E4 touches (the Korean Test extension covers all of them).

**Audit findings closed.** Meta-finding (platform passed Korean Test for fields, failed for operations).

---

### Audit-finding closure map (unchanged)

| Finding | Severity | State | Closed by |
|---|---|---|---|
| F-001 | CRITICAL | latent | E1 + E4 |
| F-002 / F-002b / F-002c / F-002d | CRITICAL / HIGH / MEDIUM / MEDIUM | latent | E2 |
| F-003 | HIGH | active (compensated) | E2 |
| F-004 | HIGH | active (compensated) | E2 |
| F-005 | HIGH | active (system-wide) | E1 |
| F-006 | HIGH | active (architectural) | E3 + E5 |
| F-007 | MEDIUM | active | E1 |
| F-008 | MEDIUM | active (dead code) | E4 |
| F-009 | MEDIUM | active | E2 |
| F-010 | LOW | active | (out of structural scope) |
| F-011 | MEDIUM | active | E3 |
| F-012 | (positive control) | active | reference pattern for E6 |

All in-scope findings close.

---

## Section 3 — Decision 154 (LOCKED 2026-04-27)

> The Korean Test (AP-25 / T1-E910) applies to operation, primitive, and dispatch-surface identifiers, not only to field identification. Structural primitives — calculation operations, intent shapes, dispatch operands — shall exist in exactly one canonical declaration. Every boundary that names, dispatches on, validates, or documents these primitives shall derive from that declaration without maintaining a private copy. Every primitive recognized at any boundary shall be recognizable at every boundary it traverses. Every dispatch boundary shall produce observable, named, structured failure on unrecognized identifiers — never silent fallback. Domain Agent prompts retain the existing exemption for translating domain vocabulary into structural primitives.
>
> The platform shall pass the structural form of the Korean Test: *if a new structural primitive appears, would the platform still work?* — and the operative answer shall be yes, by virtue of canonical declaration, round-trip closure, and structured failure as substrate-binding obligations.

**Lock location:** `CCAFRICA/spm-platform` decision register (per Vialuce decision-register convention). Sequence number to verify against the live register before commit.

---

## Section 3.5 — Decision 155 (LOCKED 2026-04-27)

> The canonical declaration of structural primitives required by Decision 154 is a **surface** (registry), not a string. The surface admits per-domain declaration entries. The surface enforces uniqueness, structural validity, and Korean Test compliance across all entries. Domain Agents own their domain's entries (ICM Domain Agent owns ICM primitives; Financial Domain Agent owns Financial primitives; future Domain Agents own their domain's primitives). Foundational Agents own foundational primitives. Every boundary that names, dispatches on, validates, or documents structural primitives derives from the surface — not from any private copy.
>
> Decision 155 extends Decision 154 by clarifying its single-canonical-declaration obligation. It does not supersede Decision 154; the single-source-of-truth discipline of Decision 154 is preserved. The surface IS the single canonical declaration.

**Lock location:** `CCAFRICA/spm-platform` decision register.

---

## Section 4 — Spatial and biological frame (unchanged)

Three load-bearing analogies grounding the design:

- **Genetic code as canonical declaration** (E1, E4) — one canonical genome, every translation surface reads from it. Decision 155 extends: tissue-specific expression on the same genome is the federated-domain pattern.
- **Synaptic transmission with the dual-channel rule** (E3, E5) — write-only signaling is biologically pathological. The closed loop is constitutive of the surface, not optional.
- **Immune-system pattern recognition** (E6 / Decision 154) — recognize structural patterns, not enumerated specifics. F-012 (variant selection layer) is the proven positive control.

IRA's Inv 2 Option C and Inv 4 Option B convergence on a registry / surface is structurally consistent with the genetic-code analogy: one surface, federated entries, structural identifiers consumed by all readers.

---

## Section 5 — New substrate items surfaced

Three new substrate items the architect creates in the successor implementation conversation. **N1 is the platform decision lock; N2 and N3 are platform substrate (specifications + code).**

### N1 — Decision 155 (LOCKED above)

Extends Decision 154 with surface-interpretation clause. **Already locked** in Section 3.5. Lives in `CCAFRICA/spm-platform` decision register.

### N2 — Signal-type registry specification

**New platform-substrate entry in `spm-platform`.** Source: IRA Inv 2 Option C + Inv 4 convergence.

**Specification scope (for successor to draft as a platform spec):**
- Registry schema: signal type, originating flywheel, signal level (L1 / L2 / L3), tetrad arm (E/E/C/I), declared writer(s), declared reader(s).
- Auto-registration trigger: first write of a new structural primitive signal.
- Read-coupling rule derivation from registered structural properties.
- Validation at write time: unregistered signal types fail per E2's structured-failure obligation.
- Korean Test enforcement: registry uses structural identification, not name-matching.
- Distinguished from T1-E902's "classifications are hints, not gates" prohibition.

**Implementation location:** new module in `web/src/lib/intelligence/` (likely `signal-registry.ts` or equivalent — successor decides). Schema in `web/supabase/migrations/`.

### N3 — SCI emission constraint substrate

**New platform-substrate entry in `spm-platform`.** Source: IRA Inv 3 / 3c.

**Specification scope (for successor to draft):**
- Formalizes the three constraint classes (C1 persistence-before-declaration, C2 structural-identification, C3 resolution-chain compatibility) as obligations on E1's declaration shape.
- Names the relationship between SCI's five-agent architecture (Plan / Entity / Target / Transaction / Reference, in `web/src/lib/sci/` or equivalent) and E1's surface.
- Composes with Decision 92 (source_date binding), Decision 111 (Carry Everything), Decision 152 (Import Sequence Independence).

### Possible N4 — Comprehension dimension substrate (deferred to successor)

If three comprehension dimensions (D1 / D2 / D3) cannot be expressed on `classification_signals`, a fourth substrate item formalizes their substrate. Successor conversation determines.

---

## Section 6 — T1 wording amendments required (in `vialuce-governance` IGF substrate)

Three T1 substrate amendments required for E4 / E5 / E6 to be coherent with their parent principles. **These amendments live in the `vialuce-governance` IGF substrate, not in `spm-platform`.** They are the IRA-grounded findings that follow from Inv 3.

### T1-E910 (Korean Test) — IGF amendment

**Current scope.** "Field identification."

**Amendment.** Extend to: "field identification, operation identification, primitive identification, dispatch-surface identification."

**Source.** IRA Inv 3 disposition #3.

### T1-E902 (Carry Everything) — IGF amendment

**Current scope.** "Import time" persistence; "calculation time" context activation.

**Amendment.** Extend to round-trip closure. Address relationship between canonical declaration (E1) and "classifications are hints, not gates" mandate.

**Source.** IRA Inv 3 disposition #4.

### T1-E906 (Closed-Loop Intelligence) — IGF amendment

**Current scope.** Classification signal accumulation; three-flywheel architecture stated.

**Amendment.** Extend to: (a) classification vs. comprehension signal surface relationship; (b) read-before-derive as signal-consumer obligation; (c) flywheel-routing rules.

**Source.** IRA Inv 3 disposition #5.

**Lock workflow for these amendments.** Architect commits IGF amendments to `vialuce-governance` (separate workflow from platform code). The amendments do not block platform implementation in `spm-platform`; they ground the design in upstream substrate and can be locked in parallel with platform development.

---

## Section 7 — Substrate Bound Challenges (substantiated by IRA)

Five challenges from v1, substantiated:

1. **Read-coupling at flywheel scale: SUBSTANTIATED** (Inv 2 Option C). Three substrate extensions required before lock-confidence.
2. **Plan-agent prompt as translation surface: SUBSTANTIATED** (no IRA needed). Decision 155's surface clarifies the prompt is a consumer.
3. **Decision 154 absorbs E1/E2/E4/E6 cleanly: CONDITIONALLY SUBSTANTIATED** (Inv 3 / 3a). E1 carries an additional SCI-constraint dimension (N3) requiring separate substrate.
4. **CRP four-primitive substrate reconstruction: SUBSTANTIATED** (no IRA needed). Successor reconstructs from substrate + GT files. Reconciliation against `CRP_Resultados_Esperados.xlsx` ($566,728.97 pre-clawback).
5. **SCI architecture imposes constraints on E1: SUBSTANTIATED** (Inv 3 / 3c rank 1). N3 formalizes.

---

## Section 8 — IRA Invocations: completed

All four invocations executed in `vialuce-governance`. Total spend $6.53.

| Inv | Mode | Status | Total | Disposition |
|---|---|---|---|---|
| 1 | Advisory brief_only | fired_with_results, tier_3_novel | $1.79 | Six supersession_candidates → ACT all six |
| 2 | Innovation options-based | fired_with_results, tier_3_novel | $1.51 | Option C rank 1 (registry + structural read-coupling) → N2 |
| 3 | Advisory brief_only (composite) | fired_with_results | $1.69 | 3a one-principle / 3b partially-expressible / 3c constraints-present — all rank 1 |
| 4 | Innovation options-based | fired_with_results, tier_3_novel | $1.54 | Option B rank 1 → Decision 155 |

Eleven supersession_candidates total. All ACT-dispositioned.

---

## Section 9 — Successor Implementation Conversation: Handoff

**The successor conversation produces development execution in `CCAFRICA/spm-platform`.** Not another design pass.

### What the successor reads first (input substrate)

1. This document (AUD-004 Remediation Design Document v3) — in `spm-platform` project knowledge.
2. AUD-004 Phase 0 inventory + Phase 0G gap closure — in `spm-platform` project knowledge.
3. IRA responses Inv 1 / 2 / 3 / 4 — committed at `vialuce-governance/docs/IRA-responses/`. Successor reads these for substrate grounding only; does not modify them.
4. `CRP_Resultados_Esperados.xlsx` + `BCL_Resultados_Esperados.xlsx` — the reconciliation gate test artifacts (in `spm-platform` project knowledge or test fixtures).
5. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — in `spm-platform` repo root.
6. `SCHEMA_REFERENCE_LIVE.md` — in `spm-platform` repo root.

### What the successor produces in `spm-platform`

Three sequenced deliverables:

#### Deliverable 1 — Phase B: Boundary Inventory (in `spm-platform`)

CC dispatches read-only inventory of every dispatch boundary on the platform substrate.

**Output location:** `docs/audits/AUD_004_Phase_B_Boundary_Inventory.md` in `CCAFRICA/spm-platform` repo.

**Scope:** every switch / dispatch surface / vocabulary-naming surface across the platform code paths named in Section 2 above. Per boundary: vocabulary used, dispatch form, no-match behavior, current writers / readers. Maps F-001…F-012 onto boundaries; surfaces additional boundaries the audit's twelve findings missed (Limiting Factor L7).

**CC operating context:** standard `spm-platform` workflow per `CC_STANDING_ARCHITECTURE_RULES.md` — git from repo root (`spm-platform`) NOT `web/`, `gh pr create --base main --head dev` for final step, kill-rebuild-confirm pattern after every change. Standard PR gates (PG-01…PG-N).

**Estimated CC time:** 1–2 hour single-sweep, read-only.

#### Deliverable 2 — Mechanism Specification (in `spm-platform`)

Successor drafts platform mechanism specifications.

**Output location:** `docs/specs/AUD_004_Mechanism_Specification.md` in `CCAFRICA/spm-platform`.

**Scope:**
- N2 signal-type registry specification (schema + module structure).
- N3 SCI emission constraint substrate.
- Concrete refactor plan for the platform code paths named in Section 2.
- Migration plan for `classification_signals` schema if required.
- Decimal precision discipline preserved (Decision 122).
- Reconciliation gate test plan (Decision 95).

**The three IGF amendments (T1-E910, T1-E902, T1-E906) are locked in `vialuce-governance` separately.** They do not block platform implementation; they are the IRA-grounded principles whose mechanism the platform implements.

#### Deliverable 3 — Vertical Slice CC Directive(s) (executes in `spm-platform`)

Vertical slice scope per architect's standing rule (engine + experience evolve together):

- **Engine:** dispatch-surface refactor in `web/src/lib/calculation/`, `web/src/lib/compensation/`, `web/src/lib/intelligence/`. Implements registry (N2), structural read-coupling rules, structured-failure surface (E2), round-trip closure (E4).
- **Experience:** the surface that exposes registry state to administrators and the structured-failure surface to operators. `classification_signals` Level 2 + Level 3 readers.

**CC directive(s) drafted to:**
- Vertical slice scope: one PR or named sequence of PRs per architect's "comprehensive over fragmented" standing direction.
- Reconciliation gate test: 100% reconciliation against `CRP_Resultados_Esperados.xlsx` (Decision 95). The successor verifies the four-primitive substrate (linear_function, piecewise_linear, scope_aggregate, conditional_gate) is reachable.
- Standard CC compliance gates: Rule 27 (pasted evidence), Rule 51v2 (tsc + lint), Rule 39 (Compliance Verification Gate).
- Final step: `gh pr create --base main --head dev` from `spm-platform` repo root.

### Handoff success criteria — production code in `spm-platform`

The successor conversation succeeds when CC has:

1. Produced Phase B Boundary Inventory committed to `CCAFRICA/spm-platform`.
2. Drafted N2 + N3 specifications committed to `CCAFRICA/spm-platform`.
3. Executed vertical slice CC directive(s) with PG gates PASS in `spm-platform`.
4. Achieved 100% reconciliation against `CRP_Resultados_Esperados.xlsx` (Decision 95 gate test).
5. Closed audit findings F-001 through F-009 + F-011 in production at vialuce.ai.

**Architect lock activities (parallel to platform development, in `vialuce-governance`):**
- T1-E910 amendment.
- T1-E902 amendment.
- T1-E906 amendment.

These IGF amendments do not block platform development; the platform implements the IRA-grounded principles whether or not the IGF text is locked first.

---

## Section 10 — What is locked, what is pending

**LOCKED (2026-04-27, in `CCAFRICA/spm-platform` decision register):**
- E1, E2, E3, E4, E5, E6 (six substrate extensions).
- Decision 154 (Korean Test extension to operation vocabulary).
- Decision 155 (canonical declaration is a surface; federated per-domain entries).

**PENDING architect lock in successor conversation (IGF amendments in `vialuce-governance`):**
- T1-E910 wording amendment.
- T1-E902 wording amendment.
- T1-E906 wording amendment.

**PENDING architect lock in successor conversation (platform substrate in `CCAFRICA/spm-platform`):**
- N2 (signal-type registry specification).
- N3 (SCI emission constraint substrate).
- Possible N4 (comprehension dimension substrate, if E5 extension insufficient).

**PENDING architect verification:**
- Decision 154 + Decision 155 sequence numbers against the live decision register in `spm-platform`.
- Architect uploads design document v3 to `spm-platform` project knowledge.

---

## Section 11 — Repo separation reference

This section exists to prevent repo confusion in successor conversations.

| Concern | Lives in | Notes |
|---|---|---|
| Platform code (intent-executor, ai-plan-interpreter, run-calculation, convergence-service, anthropic-adapter) | `CCAFRICA/spm-platform` | All E1–E6 implementation work. |
| Platform decisions (Decision 154, 155, etc.) | `CCAFRICA/spm-platform` decision register | Single source of truth for platform locks. |
| Platform specifications (N2, N3, N4) | `CCAFRICA/spm-platform docs/specs/` | Mechanism specifications and platform substrate. |
| Phase B boundary inventory | `CCAFRICA/spm-platform docs/audits/` | Read-only diagnostic of platform code paths. |
| Vertical slice CC directives | `CCAFRICA/spm-platform` (PR target: `main`) | Production code. |
| Reconciliation gate test (CRP / BCL / Meridian) | `CCAFRICA/spm-platform` | Production verification. |
| | | |
| IGF substrate (Tier 0–6 entries, IGF spec) | `vialuce-governance` | IGF lives separate from platform. |
| IRA prompts | `vialuce-governance/prompts/` | IRA invocation artifacts. |
| IRA responses | `vialuce-governance/docs/IRA-responses/` | Captured for audit. |
| IGF amendments (T1-E910, T1-E902, T1-E906) | `vialuce-governance` substrate | Locked separately from platform decisions. |
| IRA CRs | `vialuce-governance/docs/completion-reports/` | Per-invocation CRs. |

CC's working directory for platform work is `~/spm-platform` (or wherever the architect's local clone of `CCAFRICA/spm-platform` lives). Do not confuse with `~/vialuce-governance`.

---

*AUD-004 Remediation Design Document v3 · 2026-04-27 · Substrate `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...` · Six extensions (E1–E6) LOCKED · Decision 154 LOCKED · Decision 155 LOCKED · Successor: implementation conversation produces Phase B inventory + Mechanism Specification + Vertical Slice CC Directive — all in `spm-platform` · IGF amendments (T1-E910 / T1-E902 / T1-E906) lock in `vialuce-governance` separately and in parallel.*
