# Conversation Starter — AUD-004 Remediation Design

**Type:** Conversation starter for a new Claude conversation.
**Purpose:** Open the remediation design conversation following AUD-004's audit closure. This conversation produces the design framework for the universal calculation-primitive identification engine. It does NOT produce implementation artifacts.
**Authored:** 2026-04-27
**Predecessor conversation:** AUD-004 audit (Phase 0 inventory + Phase 0G gap closure + analysis stage). The audit conversation has closed.

---

## How to read this starter

This starter is the anchoring context for a new conversation. The new Claude does not have access to the audit conversation's history; this document carries every load-bearing fact forward. Read it in full before producing any output.

The starter has eight sections:

1. **Problem statement (locked)** — verbatim, no reformulation
2. **Substrate truth** — what the present codebase looks like and why
3. **Findings carried forward** — F-001 through F-012 from the audit
4. **Scope and method** — comprehensive scope, forward-design, no fragmentation
5. **Governance constraints** — locked decisions binding this conversation
6. **Standing rules** — disciplines this conversation must observe
7. **Drift risks named explicitly** — eight failure modes the conversation must avoid
8. **Opening deliverable** — what the conversation produces first

---

## 1. Problem statement (locked)

> **If a new structural primitive appears, would the platform still work? The answer today is no.**

This is the verbatim problem statement. It is not "drift," not "evolution," not "extensibility," not "vocabulary divergence over time." It is a binary architectural condition. The platform either accommodates new structural primitives without hand-edits at multiple boundaries, or it does not. Today, it does not. The remediation conversation designs the structural fix.

Do not reformulate. Do not soften. Do not add modifiers like "in the long run" or "over time." The problem is present-tense and binary.

---

## 2. Substrate truth

The remediation builds against `origin/main` HEAD `6bc005e6...` (post-CLN-001, post-DIAG-024). This is the **deliberate pre-aberration baseline.** The architect chose this substrate by explicitly reverting two prior implementation attempts.

### Substrate composition

- Pre-HF-191 baseline (the foundation)
- HF-194 (`field_identities`, cherry-picked back via PR #340)
- DIAG-024 (read-only diagnostic, PR #344, merged)
- CLN-001 (repo housekeeping only, PR #343)

### What is NOT on the substrate

- HF-191 (`plan_agent_seeds`) was MERGED via PR #338, then REVERTED via PR #342 on 2026-04-26. Zero references to `plan_agent_seeds` in code; zero rows with that key in `rule_sets.input_bindings`.
- HF-193 (signal-surface infrastructure for Decision 153) was MERGED via PR #339, then REVERTED via PR #342 on 2026-04-26. Zero references to `metric_comprehension` or `agent_activity:plan_interpretation` signal types. The `hf-193-signal-surface` branch exists at `origin/hf-193-signal-surface` but is not the substrate baseline.

### What this means architecturally

**Decision 147 (Plan Intelligence Forward) is LOCKED but has no implementation on `main`.** Both implementation attempts have been reverted. The principle stands; the operational behavior does not exist. Convergence is a one-way door because the architecture has shipped no path to close it on this substrate.

This is not a bug to undo. It is the deliberate starting point. The architect's standing direction:

> "The purpose of the REVERT was to get to a state prior to any of the aberration path. I would rather reencounter issues solved versus trying undo the mistakes made. (We tried for two weeks to undo seeds unsuccessfully)."

The remediation builds **forward** from this substrate. It does not unrevert the reverted PRs. It does not cherry-pick HF-193 work back. It does not "look at what HF-193 was trying to do" and replicate the structure. The substrate's emptiness around plan-agent-comprehension flow is a feature, not a defect — it is the foundation on which the universal identification engine is designed.

### Active production state

- 3 tenants: BCL (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`), Cascade Revenue Partners (`e44bbcb1-2710-4880-8c7d-a1bd902720b7`, slug `cascade-revenue-partners`), Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`)
- 4 active rule_sets: 2 on BCL, 2 on Cascade Revenue Partners (both Cascade rule_sets carry the BCL plan name and shape — the proven CRP four-primitive substrate is not in production), 0 on Meridian
- Operations actually persisted in production: `bounded_lookup_2d`, `bounded_lookup_1d`, `scalar_multiply`, `conditional_gate` (4 of 17 working-set primitives)

### The missing CRP requirements substrate

The proven CRP $566,728.97 pre-clawback substrate (10 periods × 4 OB-180/181 primitives: `linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate`) is **irretrievable**. Phase 0G's HALT-C confirmed: no branch, no tag, no migration, no seed script, no fixture, no JSON dump, no git pickaxe, no DB archive carries the JSONB structure. Vocabulary is preserved in `CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md`; structure is preserved nowhere.

**Method for recovering CRP requirements (architect direction):** forward conversation search at conversation open. Search the OB-180, OB-181, HF-156, HF-159, HF-160, HF-162, OB-191, HF-187, HF-188, DIAG-016, DIAG-020 commit-message keywords (per Phase 0G.1.4 evidence). Read the conversations that drove these commits to reconstruct what CRP needed and what each remediation step was for. The requirements set is what the universal identification engine must support — not the verbatim shape.

**Architect verbatim provision is NOT the method.** Verbatim provision risks designing against a single-data-point shape rather than against the requirements the shape encoded. Conversation search captures requirements, failure modes, and principles that emerged.

---

## 3. Findings carried forward

The audit produced twelve findings. Severities, mechanism categories, and cross-finding relationships are recorded below. Each is binding context for the remediation design.

### Categories

- **VV (Vocabulary Violation):** A primitive's recognition is divergent across boundaries it must traverse.
- **DB (Default-Branch Silent Failure):** A switch's no-match path produces structurally degraded output without error or log.
- **SC (Shape Contract):** A primitive's shape contract diverges between writer and reader.
- **SF (Signal-Surface Flow):** A signal-surface read/write asymmetry impedes adaptive behavior.
- **PI (Prompt Internal Inconsistency):** The plan-agent prompt contradicts itself.

### Findings table

| ID | Category | Severity | Latent / Active | Mechanism summary |
|---|---|---|---|---|
| F-001 | VV | CRITICAL | Latent | `scope_aggregate` is named in prompt + importer 5-tuple, ABSENT from intent-executor switch. Component persists fine; calculation falls through to executor's no-default and returns `undefined`. |
| F-002 | DB | CRITICAL | Latent | Intent executor's switch (intent-executor.ts:438-450) has no `default:` keyword. Returns `undefined`. POST function at run/route.ts:61 has NO outer try/catch. Cascades through unwrapped `executeIntent` call at line 1683 → `toNumber(undefined)` TypeError → propagates through entity loop, POST function body → Next.js framework default 500 handler. **Loses entire calculation run, partial entityResults, log array.** |
| F-002b | DB | HIGH | Latent | `resolveSource` (intent-executor.ts:61-140) has same defect class as F-002 — 8 cases for IntentSource discriminator, no default, returns `undefined` for unrecognized source. Cascade is identical. |
| F-002c | VV | MEDIUM | Latent | `executeIntent`'s `noMatchBehavior: 'error'` (intent-executor.ts:600-602) does not throw, log, or signal. Behaviorally identical to `'skip'`. Vocabulary defect at type level. |
| F-002d | DB | MEDIUM | Latent | `noMatchBehavior` switch (intent-executor.ts:591-603) has no default. Unrecognized strings produce silent zero. |
| F-003 | DB | HIGH | Active (compensated) | Legacy switch (run-calculation.ts:362-408) has no default. Falls through to silent `payout = 0`. OB-117 fallback (lines 415-471) has try/catch swallowing TypeErrors. Compensated only when intent path succeeds; chained-failure with F-002 produces persisted $0. |
| F-004 | DB | HIGH | Active (compensated) | `convertComponent` default branch (ai-plan-interpreter.ts:681-708) writes `componentType: 'tier_lookup'` regardless of input `calcType`. Empty `tierConfig.tiers: []`. Intent shape preserved in `metadata.intent` only. **16 of 16 active components in production exhibit this fingerprint.** |
| F-005 | PI | HIGH | Active (system-wide) | Plan-agent prompt declares "7 PRIMITIVE OPERATIONS" at anthropic-adapter.ts:357; example blocks introduce 3 additional strings (`linear_function`, `piecewise_linear`, `scope_aggregate`) that line 539's "must be valid against the 7" instruction does not cover. `intent-types.ts` documentation claims 7-or-9 primitives; actual union has 11. `buildUserPrompt` at anthropic-adapter.ts:980 lists 10. **No single source of truth for the operation vocabulary anywhere in the codebase.** |
| F-006 | SF | HIGH | Active (architectural) | Convergence service (convergence-service.ts) writes 1 signal_type (`convergence_calculation_validation`), reads 0 from `classification_signals`. Decision 147 has no implementation on `main`. Plan agent comprehension does not flow to convergence in any form. |
| F-007 | VV | MEDIUM | Active | `tiered_lookup` (importer-side) vs `tier_lookup` (engine-side) string divergence. `convertComponent` silently bridges by re-emitting. |
| F-008 | VV | MEDIUM | Active (dead code) | `weighted_blend` and `temporal_window` are intent-executor switch cases that no importer recognizes. Unreachable from the import pipeline. |
| F-009 | SC | MEDIUM | Active | `calculationIntent` is duplicated on every persisted component: identical content in both `component.calculationIntent` (top-level) and `component.metadata.intent`. |
| F-010 | (doc) | LOW | Active | `SCHEMA_REFERENCE_LIVE.md` is stale (lists 20 columns on `classification_signals`; live schema has 23). Refresh-on-demand action; not part of structural remediation. |
| F-011 | SF | MEDIUM | Active | `training:dual_path_concordance` signal is written on every calculation run (route.ts:1840-1862) embedding match/mismatch counters, concordance rate, total payout. **Zero readers in the codebase.** Same one-way-door pattern as F-006. |
| F-012 | (positive control) | N/A | Active | Variant selection layer (run/route.ts:1175-1411 — HF-119, OB-194) implements STRUCTURAL token matching cleanly. Tokenizes entity attribute strings; matches against variant token sets; excludes entities matching no variant with logged reason. **This is a working implementation of structural identification within the existing architecture.** Reference pattern for the universal identification engine's design. |

### Cross-finding relationships

Three structural relationships among the findings:

**Relationship 1 — F-001/F-002/F-002b compose into the catastrophic-500 cascade.** Same mechanism class (default-branch silent failure on unrecognized input) at three boundaries (executor switch, helper-function switch, importer switch). They are not independent findings — they are the same defect at three layers. Fix one without the others and the cascade re-forms at adjacent surfaces.

**Relationship 2 — F-005's vocabulary documentation drift is not a documentation problem.** The system prompt, user prompt, type definitions, and code switches all maintain their own copies of the vocabulary. There is no registry. Drift is a structural inevitability when there is no single source of truth.

**Relationship 3 — F-006/F-011 are the same one-way-door pattern.** Convergence writes `convergence_calculation_validation` and never reads it. Concordance writes `training:dual_path_concordance` and no code reads it. The signal-surface architecture has an aspiration (Decision 64 v2's three-flywheel scopes) and write-only telemetry today.

**The audit's terminal observation:** the remediation conversation cannot close one finding without addressing the structural cause that produced all of the same-class findings. Fragmented remediation reproduces the seeds-undoing pattern: two weeks of work that closed individual locations while leaving the structural cause intact.

---

## 4. Scope and method

### Scope: comprehensive

Per architect direction:

> "DO not defer anything - everything is in scope and history has proven that a comprehensive approach is better than a fragmented."

Every finding F-001 through F-012 (less F-010 LOW, which is refresh-on-demand) is in this conversation's scope. No item is deferred to a later sprint, a later HF, a later OB, or a later Decision.

**Comprehensive does NOT mean "sequence the findings."** It means design ONE structural fix that addresses the structural cause shared by the same-class findings. The remediation is not "first close F-001, then F-002, then..." — it is "design the universal identification engine such that F-001/F-002/F-002b/F-002c/F-002d/F-003/F-004/F-008 are structurally impossible by construction, F-005's vocabulary drift has a single source of truth, F-006/F-011's one-way doors close, F-007's string-name divergence is reconciled, F-009's duplication is collapsed."

### Method: forward-design from substrate

The substrate is `origin/main`. The remediation builds forward, not backward. It does not unrevert HF-193 work. It does not "look at what HF-193 was trying to do" and replicate it. It designs the universal identification engine on the present substrate's foundation.

### Method: forward conversation search for CRP requirements

Before design begins, this conversation runs `conversation_search` against the OB-180, OB-181, HF-156, HF-159, HF-160, HF-162, OB-191, HF-187, HF-188 history to reconstruct what building CRP taught about the universal identification engine's requirements. The four primitives `linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate` were added because of CRP needs; the importer's HF-156/159/160 sequence extended to support them; OB-191 added `scope_aggregate` to convergence Pass 4. Reading the conversations that drove this work captures the requirements set.

The vocabulary is preserved in `CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md` (in project knowledge). The structure is gone. Conversation search captures the requirements between vocabulary and structure.

### Method: design only, per Design Gate protocol

This conversation produces a design document. It does NOT produce:

- Implementation code
- CC paste blocks or CC directives
- HF, OB, or SD drafts
- Migration files or DB DDL
- Test specifications

The design document contains:

- The structural identification engine's design pattern (whatever pattern emerges from the requirements; no candidate is preferred at the start)
- The boundaries the design touches and how each is addressed
- Decision 154's candidate wording (the structural complement to the Korean Test as a gate)
- The migration shape — which findings close, in what order, by which structural property of the design
- Open questions for subsequent implementation conversations

Implementation conversations follow this design conversation. They are separate conversations.

---

## 5. Governance constraints

The following locked decisions and principles bind this conversation. Each constrains the design space.

### Decision 64 v2 — Dual Intelligence (LOCKED)

Three signal levels: Classification (L1 — "what is this data?"), Comprehension (L2 — "how does it behave and why does it matter?"), Convergence (L3 — "what matches what?"). All on shared surface `classification_signals`. Three flywheel scopes: Tenant, Foundational, Domain. Any signal-surface design in the remediation must compose with this architecture.

### Decision 95 — 100% reconciliation gate (LOCKED)

The remediation's design must be capable of producing 100% reconciliation. Any non-exact result is wrong. Decision 95 is a calculation-correctness gate, not a remediation-design gate, but it is the eventual test of any design that ships.

### Decision 111 — Carry Everything, Express Contextually (LOCKED)

The importer carries all columns to `committed_data` (mapped + unmapped). AI classifications are hints, not gates. The remediation's design must respect this — any design that introduces gating-by-classification at the importer level violates this principle.

### Decision 122 — Decimal Precision Architecture (LOCKED)

All calculation arithmetic uses `Decimal` until the output boundary. The remediation's design must preserve this; any helper function or dispatch path that loses precision is a regression.

### Decision 147 — Plan Intelligence Forward (LOCKED, NO IMPLEMENTATION ON MAIN)

The principle stands: plan agent comprehension must flow to convergence. The remediation's design will be the implementation that makes this principle operational on the present substrate. Whether this implementation ships in the same scope as the structural identification engine is a design decision for this conversation.

### Decision 151 — Intent Executor Sole Calculation Authority (LOCKED, OPERATIONALLY CONFIRMED)

Intent executor is sole authority for all component types. No per-componentType allow-list. The remediation's design must preserve this; any design that re-introduces per-type routing logic violates Decision 151.

### Decision 152 — Import Sequence Independence (LOCKED, OPERATIONALLY CONFIRMED)

Identical results regardless of file import order. Constraint on any import-pipeline aspect of the design.

### Decision 153 — Plan Intelligence Forward Signal-Based (LOCKED 2026-04-20, IMPLEMENTATION REVERTED)

The principle is locked: plan agent comprehension flows as Level 2 Comprehension signals via `classification_signals`. HF-193 was the implementation; HF-193 was reverted. **The principle stands; the substrate has no implementation.** Decision 153 binds the remediation's design — but the remediation does not unrevert HF-193. It designs the implementation forward.

### AP-25 — Korean Test (Foundational Principle, GATE)

All field identification in foundational code uses STRUCTURAL heuristics, never field-name matching in any language. Domain Agent prompts EXEMPT (they translate domain vocabulary to structural vocabulary). The Korean Test applies as a **gate**, not as a drift mechanism — code either uses structural identifiers or it fails the gate.

The Korean Test's structural complement is the substance of this remediation conversation. The architect's framing:

> "The Korean Test asks: 'If domain vocabulary changed, would the platform still work?' The implicit complement: 'If a new structural primitive appears, would the platform still work?' The answer today is no."

Decision 154's candidate wording is the structural complement to AP-25, expressed as a gate in the same form.

---

## 6. Standing rules

This conversation observes the following disciplines.

### PCD — Pre-Condition Declaration

Every Claude turn begins with a visible PCD checklist: (1) memory review, (2) Rule 29 (full read before draft), (3) locked decisions and open items, (4) schema verification when applicable, (5) per-row verdict. The PCD is not ceremonial — it is a structural pause that prevents proposal-shaped output before evidence settles.

### CRF — Constraint Review First

When the architect invokes "CRF" or "Step back," Claude halts current line of work and re-examines assumptions against the full memory and the audit's evidence corpus.

### SR-42 — Locked-Rule Halt

When a locked rule (decision/SR/governance/IGF entry) dictates an action, Claude surfaces the rule verbatim, names the dictated action, and halts for architect disposition. FORBIDDEN: inline "supersede" options, "over-specified" framings, partial-satisfaction, cost-as-bypass.

### Standing Rule 34 — No Bypass Recommendations

Claude diagnoses and drafts the structural fix. Never recommends workarounds, interim measures, or alternative paths that avoid the blocker. The catastrophic-500 cascade has no interim patch in scope (architect's standing direction); the design addresses it structurally or it fails.

### Design Gate protocol

This conversation is a design conversation. Implementation conversations follow. No CC paste blocks. No HF/OB/SD drafts. No migration files. The deliverable is a design document for project knowledge upload.

### Architect/CC channel separation (does not apply directly here, but binds successor conversations)

Claude holds design / decision / interpretation. CC executes. All evidence to architect channel first; Claude interprets and drafts; Andrew pastes verbatim. CC never interprets ambiguous output or makes scope decisions.

### Speed as a warning signal

Analytical rigor degrades into production momentum within a single conversation. Speed is a warning signal, not an efficiency signal. The architect reserves CRF / STEP BACK / PCD as hard pauses.

---

## 7. Drift risks named explicitly

These eight failure modes have been observed in the audit conversation or in its predecessors. The remediation conversation must explicitly disarm each.

### Drift Risk 1 — Reformulating the problem statement

The problem is *"if a new structural primitive appears, would the platform still work? The answer today is no."* Verbatim. Not "drift," not "evolution," not "extensibility." The conversation does not soften, modify, or contextualize the statement. It locks the statement at the start and references it verbatim throughout.

### Drift Risk 2 — Skipping to a candidate mechanism

The audit conversation surfaced four illustrative mechanism candidates (operation grammar registry, capability negotiation, adapter pattern, universal lookup interpreter). **These are NOT the working set.** The architect explicitly rejected these as a framing bias. Mechanism candidates emerge from the requirements that conversation search reconstructs, not from architectural preference. The conversation does not name a candidate before requirements settle.

### Drift Risk 3 — Treating comprehensive scope as a sequencing exercise

Comprehensive scope means designing one structural fix. It does NOT mean "do F-001 first, then F-002, then..." That is the fragmentation pattern by another name. The remediation closes the structural cause shared by the same-class findings; the individual findings close as a consequence of the structural fix, not as separate work items.

### Drift Risk 4 — Backward-design temptation

The substrate is the deliberate pre-aberration baseline. The conversation does not "look at what HF-193 was trying to do" and design a similar structure. The architect's two-weeks-undoing-seeds context is decisive: that path produced no architectural simplification. Design forward from the present substrate.

### Drift Risk 5 — Treating CRP recall as ground truth

The proven CRP $566,728.97 substrate's JSONB structure is irretrievable. Architect verbatim recall is NOT the input. Forward conversation search at conversation open is the input. The conversation does not accept "the architect remembers the shape was..." as authoritative; it runs `conversation_search` against the OB-180/OB-181 era and reconstructs requirements from the conversations that drove the work.

### Drift Risk 6 — Design Gate slippage

This conversation produces design only. No implementation, no CC paste blocks, no HF/OB/SD drafts. Under perceived urgency the conversation may slip toward implementation-shaped output. The Design Gate protocol is locked; the conversation halts at the design boundary.

### Drift Risk 7 — Decision 154 wording rush

Decision 154 is the candidate principle (the structural complement to the Korean Test as a gate). Its wording is part of this conversation's deliverable. But wording follows design; design follows requirements. The conversation does not draft Decision 154's wording before the design framework settles.

### Drift Risk 8 — Latent-defect de-prioritization

F-002 is CRITICAL but latent today. The conversation may be tempted to de-prioritize CRITICAL latent findings in favor of MEDIUM active ones (F-009 duplication, F-007 string divergence). The architect's posture is recorded:

> "Accept the risk we are pre-production without any client obligation. We don't have much time in this state but currently we can halt all activity that is not focused on development."

CRITICAL latent findings are CRITICAL. Their latent state is the reason the remediation has urgency, not the reason to defer them.

---

## 8. Opening deliverable

The conversation's first task is **not** to begin the design. It is to:

1. Acknowledge the eight drift risks and the standing rules. State the verbatim problem statement back to the architect.
2. Confirm the substrate baseline: `origin/main` HEAD `6bc005e6...`. Confirm that the conversation does not unrevert HF-193 or HF-191.
3. Run `conversation_search` queries against the OB-180, OB-181, HF-156, HF-159, HF-160, HF-162, OB-191, HF-187, HF-188 history to reconstruct CRP requirements. Capture the requirements set in a structured form.
4. Also search for DIAG-016 (Plan 2 piecewise_linear findings) and DIAG-020 (component bindings drift) for context on what failure modes the platform encountered while building the four primitives.
5. Restate the audit's twelve findings with the architect's confirmation that scope is comprehensive (none deferred).
6. Propose the design conversation's structure — the architect approves before substantive design begins.

The conversation does not produce a design candidate, a mechanism choice, a Decision 154 draft, or any architectural proposal in its first turn. It establishes the input substrate (the CRP requirements set + the audit's findings + the substrate truth + the governance constraints) and proposes how the conversation will proceed.

The architect approves the proposal before design begins.

---

## Reference — files and artifacts

The remediation conversation references these artifacts. They are in project knowledge or on the named branches.

| Artifact | Location |
|---|---|
| AUD-004 Phase 0 inventory | `docs/audits/AUD_004_PHASE_0_INVENTORY.md` (branch `aud-004-phase-0`) |
| AUD-004 Phase 0G gap closure | `docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md` (branch `aud-004-phase-0g`) |
| AUD-002 v2 (signal surface integrity) | `docs/audits/AUD-002_SIGNAL_SURFACE_INTEGRITY_v2.md` |
| DIAG-024 (importer-engine alignment) | `docs/diagnostics/DIAG-024_FINDINGS.md` (PR #344, merged) |
| Decision 153 LOCKED | `Decision_153_LOCKED_20260420.md` (project knowledge) |
| INF Governance Index v1.1 + v1.2 patch | `INF_GOVERNANCE_INDEX_20260406.md` + `INF_GOVERNANCE_INDEX_PATCH_20260416.md` (project knowledge) |
| CRP vocabulary preserved | `CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md` (project knowledge) |
| CC standing architecture rules | `CC_STANDING_ARCHITECTURE_RULES.md` (repo root) |
| Live schema reference | `SCHEMA_REFERENCE_LIVE.md` (repo root) |

---

## Reference — tenant IDs and operation universe

| Tenant | tenant_id | Active rule_sets | Plan name (current) |
|---|---|---|---|
| BCL (Banco Cumbre del Litoral) | `b1c2d3e4-aaaa-bbbb-cccc-111111111111` | 2 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 |
| Cascade Revenue Partners | `e44bbcb1-2710-4880-8c7d-a1bd902720b7` | 2 | Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026 (BCL plan, not proven CRP plan) |
| Meridian Logistics Group | `5035b1e8-0754-4527-b7ec-9f93f85e4c79` | 0 | (none) |

### Operations actually in production rule_sets

`bounded_lookup_2d`, `bounded_lookup_1d`, `scalar_multiply`, `conditional_gate`

### Operations the audit's working set encompasses (17 total)

**Intent executor switch (11):** `bounded_lookup_1d`, `bounded_lookup_2d`, `scalar_multiply`, `conditional_gate`, `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`, `linear_function`, `piecewise_linear`

**Legacy switch (4):** `tier_lookup`, `matrix_lookup`, `percentage`, `conditional_percentage` (note: `flat_percentage` aliases to `percentage` per importer)

**Importer 5-tuple new primitives (5):** `linear_function`, `piecewise_linear`, `scope_aggregate`, `scalar_multiply`, `conditional_gate`

**Plus:** `flat_percentage` (legacy alias for `percentage`); `scope_aggregate` is in importer + prompt + IntentSource value-source switch but ABSENT from intent-executor top-level switch (F-001).

---

## Operational posture during this conversation

Per architect's standing direction (audit terminal turn):

> "Accept the risk we are pre-production without any client obligation. We don't have much time in this state but currently we can halt all activity that is not focused on development."

The platform is pre-production. No client obligation. F-002's catastrophic-500 cascade risk is accepted. All non-development activity halts. The remediation conversation has urgency from the architect's time-bounded posture, not from external pressure.

The conversation does not draft an interim containment patch. The substrate stays as-is until the comprehensive remediation lands.

---

*AUD-004 Remediation Conversation Starter · 2026-04-27 · Substrate: origin/main HEAD 6bc005e6 · Predecessor audit: AUD_004_PHASE_0_INVENTORY.md + AUD_004_PHASE_0G_GAP_CLOSURE.md · Scope: comprehensive, F-001 through F-012 (less F-010) · Method: forward conversation search → forward design from pre-aberration baseline · Drift risks: 8 named explicitly · Operational posture: pre-production halt, risk accepted · Design Gate protocol: design output only, no implementation*
