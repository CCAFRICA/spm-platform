# Conversation Starter — AUD-004: Universal Identification Engine Audit

**Purpose:** Establish the architectural audit and design framework for a universal calculation-primitive identification engine — one that is data-agnostic in what it identifies, but deterministic in how it prepares data for calculation.

**Type:** Architectural audit + design framework. Not a fix. Not an implementation. The output of this conversation is a finding-set, a set of governing principles, and a forward design — not code.

**Predecessor work (read first, in this order):**
1. `docs/diagnostics/DIAG-024_FINDINGS.md` (PR #344, merged) — Structural verdict that BCL C1/C2 = $0 is downstream of importer→engine mapping. Importer-engine structural plumbing is internally consistent; intent executor reads shape importer writes. Mismatch lives in runtime behavior, not structure.
2. `docs/audits/AUD-002_SIGNAL_SURFACE_INTEGRITY.md` — The seeds violation audit. Establishes the audit pattern: inventory writers/readers/preservers, classify findings by category and severity.
3. `Decision_153_LOCKED_20260420.md` — The architectural correction that mandated signal-surface intelligence flow. AUD-004 builds on the same architectural lens: intelligence flows through shared surfaces; private channels and silent defaults are violations.
4. `INF_GOVERNANCE_INDEX_20260406.md` — Routes the audit's findings to governing documents.

**Standing prerequisites the architect upholds:**
- Korean Test (AP-25)
- Carry Everything, Express Contextually (Decision 111)
- Decision 95 (100% reconciliation only)
- Decision 151 (Intent Executor sole authority)
- Decision 152 (Import sequence independence)
- Decision 153 (Signal-surface intelligence flow)
- HF-188 (Intent executor authoritative; legacy concordance shadow)

---

## STATE-OF-PLATFORM CONTEXT (the architect provides this; AI must not relitigate)

The platform has accumulated proof at three tenants: BCL ($312,033), Meridian (MX$185,063), CRP ($566,728.97 pre-clawback across 4 primitive types — linear_function, piecewise_linear, conditional_gate, scope_aggregate).

Each proof was achieved on a substrate state where the *specific calculation primitives* used by that tenant happened to be supported by switch cases at every translation boundary in the import-to-engine pipeline. When a new tenant arrives whose plan uses a primitive the AI now expresses with a different operation name (e.g., `bounded_lookup_2d` instead of `matrix_lookup`), the pipeline fails silently — every default branch returns $0 with no error.

**The architect's framing:** This is not a BCL fix. This is a fundamental architectural question about whether vialuce can claim to be a domain-agnostic adaptive intelligence platform when the mechanism for adding a new calculation pattern requires hand-editing 4-5 source files across 4-5 functions, each of which has a default fallback that silently produces $0.

The Korean Test asks: if domain vocabulary changed, would the platform still work? The implicit complement: if a new structural primitive appears, would the platform still work? The answer today is **no**. Every new primitive requires hand-coded switch cases at multiple boundaries. Miss any one, and the primitive silently fails through a default branch.

This audit establishes whether that's a structural defect we accept, a structural defect we remediate, or a fundamental design principle we have not yet articulated and committed to.

---

## SCOPE OF AUD-004

### IN SCOPE

The complete import-to-engine pipeline and every translation boundary along it:

**Plan agent boundary:**
- AI plan interpretation prompt vocabulary (what operations is the AI asked to produce?)
- AI plan interpretation output (what operations does the AI actually return?)
- The plan-agent → `metadata.intent` contract

**Plan interpretation translation layer (`web/src/lib/compensation/ai-plan-interpreter.ts`):**
- `normalizeComponentType` — every case + the default
- `normalizeCalculationMethod` — every case + the default
- `convertComponent` — every case + the default (HF-156 fallback branch)
- `interpretationToPlanConfig`
- `bridgeAIToEngineFormat`

**Engine dispatch boundaries:**
- Legacy engine (`web/src/lib/calculation/run-calculation.ts`) — every case in the `componentType` switch + the default
- Intent executor (`web/src/lib/calculation/intent-executor.ts`) — every case in the `op.operation` switch + the default
- Authority routing (`web/src/app/api/calculation/run/route.ts` HF-188 boundary)

**Convergence boundary (`web/src/lib/intelligence/convergence-service.ts`):**
- Metric derivation generation (Pass 1 → Pass 4)
- Convergence binding generation
- Signal write paths (what convergence emits)
- Signal read paths (what convergence consumes — and the V-003 / V-006 known one-way-door issue)

**Signal surface (`classification_signals` table):**
- Every signal_type currently written
- Every signal_type currently read
- The plan-comprehension signal flow established by Decision 153 / HF-193

### OUT OF SCOPE

- BCL specific remediation (the C1/C2 = $0 issue; that follows from AUD-004's findings, not the other way around)
- Frontend / UX work
- Authentication / access control
- Database schema redesign (signal surface schema may evolve as a finding, but is not the focus)
- Pricing, billing, MCP work

---

## CORE QUESTIONS THE AUDIT MUST ANSWER

These are the questions whose answers, taken together, define the universal identification engine's design space. Answer each with evidence; do not extrapolate.

### Question 1 — The primitive vocabulary universe

What is the complete set of operation names that:
- (a) the AI can produce in `calculationIntent.operation`
- (b) `normalizeComponentType` recognizes as cases
- (c) `normalizeCalculationMethod` recognizes as cases
- (d) `convertComponent` recognizes as cases
- (e) the legacy engine's switch recognizes as cases
- (f) the intent executor's switch recognizes as cases

The intersection of all six is the set of primitives that work correctly. The union minus the intersection is the set that silently fails somewhere.

### Question 2 — The default-branch behavior taxonomy

For each switch in scope, what does the default branch do when an unrecognized operation arrives?
- Does it preserve the operation and pass through?
- Does it overwrite the operation with a default ('tier_lookup')?
- Does it return zero?
- Does it throw an error?
- Does it log?

The taxonomy of default behaviors is the taxonomy of silent-failure modes. Each silent-failure mode is a HIGH-severity finding by definition — silent failure violates the operational principle "act on data, don't just display it."

### Question 3 — The shape contract per primitive

For each primitive in the working set, what is the shape contract?
- What fields does the importer write into `metadata.intent`?
- What fields does the legacy engine read from `tierConfig` / `matrixConfig`?
- What fields does the intent executor read from `op.*`?
- What fields does convergence write into `convergence_bindings`?
- What scaling, normalization, or coercion happens at each boundary?

Where the shape contract differs across boundaries, that's a finding. Where the same primitive has two contracts (one for legacy, one for intent), that's debt.

### Question 4 — The signal-surface boundaries

Is convergence still a one-way door (V-003) on the rebuilt substrate?
- Does convergence read prior `convergence_calculation_validation` signals at run start?
- Does plan-comprehension signal flow (Decision 153) actually exist on the rebuilt substrate, or is it documented but not implemented?
- What signal types does the foundational flywheel currently aggregate? Domain flywheel?

The signal surface is the architecture's substrate for adaptive intelligence. If signals are written but not read, the platform is not adaptive — it is observing itself without acting on the observations.

### Question 5 — The plan-agent prompt

What does the plan agent's system prompt say about operation vocabulary?
- Does it constrain the AI to a known set of operation names?
- Does it allow the AI to invent new operation names?
- Does it provide examples that bias the AI toward specific names?
- Does the prompt drift over time (per HF-156, HF-158, HF-159 history) cause the AI's output vocabulary to drift?

A determinstic identification engine cannot be downstream of a non-deterministic vocabulary generator. Either the prompt locks the vocabulary, or the engine accommodates any vocabulary.

### Question 6 — The structural identification mechanism

Today's mechanism is "match operation name strings against switch cases." This is brittle, not deterministic — it works only when names align across boundaries.

What would a structural identification engine look like? Possible patterns to evaluate:
- Operation grammar registry (single source of truth; switches generate from registry)
- Capability negotiation (importer declares "this primitive needs row+column boundaries"; engine confirms it can handle that capability shape)
- Adapter pattern (each primitive is an adapter object with declared inputs/outputs/dispatch)
- Universal lookup interpreter (any "looks up output from input bands" operation routes to one handler that reads boundary metadata)

The audit's design output proposes a pattern; the architect disposes.

### Question 7 — The Korean Test's structural complement

The Korean Test asks: "If domain vocabulary changed, would the platform still work?" The implicit complement: "If a new structural primitive appears, would the platform still work?"

What is the architectural principle that should govern the answer to the second question? Articulate it as a candidate Decision (Decision 154 or successor), with the same authority as the Korean Test.

---

## STANDING RULES THIS CONVERSATION OBSERVES

The architect upholds Standing Rules in full. The AI must observe:

- **PCD before every artifact.** Visible compliance checklist (memory review, Rule 29, locked decisions, schema verification when applicable, per-row verdict).
- **CRF on architect call.** Step back, full memory and schema review.
- **CC paste block last.** When a CC directive is drafted, the directive's CC paste block is the final block of the AI's message — no architect commentary follows.
- **Architect does not perform CC functions.** Capability-first routing; CC handles all `gh`, `git`, DB queries, and code inspection. Architect's work is browser actions (SR-44), diff review, PROCEED signals at gates, and architectural disposition.
- **No bypass recommendations (Rule 34).** When a finding surfaces a violation, the AI does not propose convenience workarounds.
- **No code citations as evidence.** Code paths must be opened and read; quoted file:line references are evidence, descriptions are not.
- **Speed is a warning signal, not an efficiency signal.** Analytical rigor degrades into production momentum within a single conversation. The architect reserves CRF / STEP BACK / PCD as hard pauses.
- **Korean Test enforced.** Structural identifiers only in foundational code.
- **Decision 95 informational.** AUD-004 is read-only; reconciliation gate references the eventual remediation, not this audit.
- **Standing Rule 41 (revert discipline) deferred.** No commits to main from this conversation; all CC work goes through PR per branch protection.
- **PR-from-feature-branch pattern.** Every artifact landing on `main` follows: feature branch → push → `gh pr create` → architect PROCEED → `gh pr merge`.

---

## OPENING DELIVERABLE

The AI's first task in this conversation is **not** to begin the audit. It is to:

1. Read the four predecessor documents listed above.
2. Read the three reference rule_set shapes from conversation history (proven March BCL substrate, current rebuilt-substrate BCL shape, proven CRP substrate at $566,728.97 pre-clawback).
3. Search conversation history for the historical primitive-pipeline failure pattern (HF-130, HF-156, HF-158, HF-159, HF-167, HF-188, HF-191, Decision 147, Decision 153) — confirm the pattern of "primitive support gated by switch case + silent default fallback" as a recurring theme.
4. Restate the audit scope, core questions, and the seven primitives the audit must reason about (linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate, bounded_lookup_1d, bounded_lookup_2d) — plus any others surfaced from conversation history that the architect missed.
5. Propose the audit's Phase 0 — the inventory pass that AUD-002 used as its evidence-gathering structure. CC executes Phase 0 as a read-only inspection across the in-scope files, producing pasted evidence.

The architect approves Phase 0 design before any CC work begins.

---

## TENANT IDS AND PRODUCTION SUBSTRATE STATE

For reference; the audit may need to query production for the current rule_set shapes:

| Tenant | tenant_id | Status |
|---|---|---|
| BCL | `b1c2d3e4-aaaa-bbbb-cccc-111111111111` | Re-imported; calculates $19,280 vs ~$44,590 expected for October |
| CRP | `e44bbcb1-2710-4880-8c7d-a1bd902720b7` | $566,728.97 pre-clawback proved April 9-10 (rule_set state pre-cutover; current state post-revert unknown) |
| Meridian | `0e6e3a09-7c92-4ff5-9d68-4e2f6e0a1b8d` (verify in current DB) | MX$185,063 proved March (rule_set state post-revert unknown) |

`origin/main` HEAD: `6504b7cf` (post-CLN-001) — confirm via `git rev-parse origin/main` at conversation start.

---

## WHAT THIS CONVERSATION DELIVERS

By the time this conversation closes, the architect should have:

1. **A finding-set** — every primitive-support gap, default-branch silent-failure mode, signal-surface read/write asymmetry, and shape-contract divergence, classified by severity and tied to architectural principles.
2. **A candidate architectural principle** (Decision 154 or successor) articulating the structural complement to the Korean Test.
3. **A design framework** for the universal identification engine — the pattern, the boundaries, the migration shape from current substrate to new architecture.
4. **A remediation roadmap** — sequenced HFs/OBs/SDs that move the platform from current state to architectural compliance, with named pre-conditions and dependencies.

The conversation does **not** deliver:
- Implementation code
- Merged PRs that change behavior
- BCL operational fix (that follows from the roadmap, not this conversation)

The audit informs the next architectural decision. Implementation conversations follow.

---

## ARCHITECT'S OPENING POSTURE

The architect has been through this audit's predecessor (AUD-002). The pattern is familiar: comprehensive inventory → classified findings → architectural principle articulation → remediation sequence. The architect upholds the discipline of letting evidence accumulate before drafting principles, and letting principles settle before drafting remediation.

The architect will reject premature recommendations, premature dispositions, and premature drafts.

This audit lives or dies on the rigor of its evidence pass. Begin there.
