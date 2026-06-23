# OB-235 (R2) — The Learning Loop: Role 4 (Learn) across the substrate, now including the Expression layer

**Directive file:** `docs/vp-prompts/OB-235_DIRECTIVE_20260623.md` (VP, `CCAFRICA/spm-platform`) — **first action: write this file and commit.**
**Work item:** OB-235 — multi-phase, **ULTRACODE `/effort`**. **Revision R2.1** (R2 folded in the expression-layer scope, the Multiplier-of-five, the HF-337 re-sync, and the measurement refinement; **R2.1 corrects the execution topology** — two fan-out tiers not one, the P6 dependency moved to Tier-2, the P-EXP/P9 merge-order declared, and the max-reasoning phases named — so the directive does ULTRACODE's scheduling work rather than leaving CC to discover the dependency graph at runtime). Phase content is unchanged from R2; only the orchestration is corrected.
**Branch:** `ob-235-learning-loop` (new — branch from main **after** #593 merges).
**Sequence:** OB-235 — collision check `ls docs/vp-prompts/OB-235*`; if a non-R1 file collides → HALT-SEQ.
**Drafting discipline:** STRUCTURED AND COMPLIANT per `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1…DD-12). The file IS the prompt; no tail summary.

---

## §0 — CC Standing Rules header

Read `CC_STANDING_ARCHITECTURE_RULES.md` end-to-end and bind throughout. Load-bearing, named for the audit trail: **AP-25 / T1-E910 (Korean Test)**, **No Fixed Taxonomy (Decision 154/158, AUD-009)**, **SR-2 (Scale by Design — no per-entity AI call, no per-entity synchronous DB write, batched I/O only)**, **SR-34 (No Bypass — structural fix at the class layer)**, **SR-43 / SR-44 (ship = merge + prod verify + report; architect-only: migrations, browser verification, PR merges)**, **T1-E905 (Prove Don't Describe)**, **T1-E952 (Adjacent-Arm Drift — closure sweeps every consumer)**, **C2 (fail-loud)**, **C6 (calc read-contract immutable — additive only)**, **Rules 25–28 (completion-report discipline)**.

**Sequence/ledger discipline.** Board row id, Mission Control item numbers, R1 criteria ids, lane — read from the live governance registry at execution time. Never invent; report the gap if unreadable.

**Governance framing.** OB-235 is **materialization of already-locked substrate** — no new architectural invariant, no supersession. It implements **DS-021 v1.0 LOCKED** (Role 4 / Immune Memory at Multiple Scopes; G7 Single Canonical Signal Surface; G11 Read-Path Coherence — DS-021 §6 states G11 is derivable from T1-E906 + T1-E924 and needs no new locked decision; this OB is its enforcement mechanism), **Decision 64 v2** (three signal levels; three flywheel scopes; the Multiplier), **Decision 92** (Reference Intelligence additive), **`Vialuce_Synaptic_State_Specification.md` v1** (density, execution modes, pattern signatures, Progressive Performance T₁ > T₂ > T₃ > T₅), **DS-022 v2 Phase 1** (canonical signal-write surface). **No IRA gate applies.**

**R2 scope addition (the expression layer).** HF-337 established a **fourth signal source and learning surface**: `surface_binding_recognition` — surfaces recognize which comprehended field(s) satisfy a free-form purpose, emit a signal, and persist the binding in `surface_bindings` keyed `(tenant_id, structural_fingerprint_hash, surface_id)`. HF-337 built the **same-tenant** read-back (recognize once, read forever). OB-235 R2 adds the **cross-tenant** layer — a new tenant whose comprehension fingerprint matches an established binding inherits it at cold-start — **guarded** (discounted prior + verification against the receiving tenant's own comprehension; §3.X). This is the expression-layer flywheel; it is **(B) layer over HF-337**: the recognizer stays the producer, OB-235 extends its miss-path additively and re-proves HF-337's behavior.

**Preconditions.**
- **#593 (OB-233 + HF-337) merged to main and live.** OB-235 reads `comprehension_artifacts`, `surface_bindings`, the HF-337-changed paths, and `structural_fingerprint_hash` emission. If #593 is not merged/live → **HALT-PRECOND**.
- **HALT-233:** `comprehension_artifacts` exists/populated for ≥1 tenant and `structural_fingerprint_hash` is emitted. If not → HALT.
- **HALT-337:** `surface_bindings` is live with the HF-337 shape, the recognizer (`surface-binding-recognition.ts`) is present, and `classification_signals` carries `signal_type='surface_binding_recognition'` rows. If not → HALT.
- The accumulation substrate is provisioned live (HF-337 P0.3 confirmed shapes): `classification_signals` (`structural_fingerprint`, `classification_trace`, `vocabulary_bindings`, `human_correction_from`, `scope`); `structural_fingerprints` (fingerprint_hash, column_roles, scope, atom_features); `foundational_patterns`/`domain_patterns` (pattern_signature, learned_behaviors); `synaptic_density`; `surface_bindings` (the expression-binding store). **The work is to close the loops, not to design the stores.**

**Execution topology (ULTRACODE `/effort` — orchestration is explicit; CC schedules within it).**
ULTRACODE leverage is two-fold: file-disjoint worktree subagents running concurrently, and xhigh/max reasoning per subagent. The fan-out is **two tiers, not one** — the dependency graph forbids a single concurrent wave, because P6 operates on the stores P5 and P-EXP create and cannot be proven until they land. The directive declares the tiers, the decision gate, the merge-order, and the max-effort phases so CC does not have to discover the dependency graph at runtime.

- **Sequential foundation (no fan-out; each gates the next):** P0 (state verify + **HF-337 re-sync**) → P1 (canonical signal-write surface) → P2 (learner core + fingerprint matcher — the shared contracts every later phase codes against).
- **Tier-1 fan-out (five concurrent file-disjoint worktrees, against the P2 contracts):** **P3** (comprehension), **P4** (calculation), **P5** (cross-tenant **data** flywheel), **P7** (convergence), **P-EXP** (cross-tenant **expression-binding** inheritance). They share only the P2 learner-core, read-only to them; none edits the live import or calculation route (wired in P9). **Weight is unbalanced — pack the critical path accordingly:** P4 (possible density-loop rebuild) and P5 (two aggregations + cold-start + privacy firewall) are **heavy**; P7 (one module) is **light**; P3 and P-EXP are **medium**. **Max-reasoning phases (xhigh/max — genuine design-in-implementation): P4** (the reconnect-vs-rebuild judgment) **and P-EXP** (the receiving-comprehension verification threshold). Spend the reasoning budget there, not uniformly.
- **Decision gate (resolves before Tier-1 closes / before P9):** P4's reconnect-vs-rebuild disposition (**HALT-REBUILD**) must be settled before P9 can wire the calc loop.
- **Merge-order constraint (declared, not discovered):** **P-EXP makes an additive miss-path edit to `surface-binding-recognition.ts`** — a file **P9 also touches**. P-EXP's worktree **merges before P9**; P9 confirms the additive edit survived the merge and the live call sites use it. No other Tier-1 phase touches that file, so Tier-1 has no internal merge conflict.
- **Tier-2 (sequential, after Tier-1 merges — depends on P5 + P-EXP stores):** **P6** (correction propagation — the **Multiplier-of-five**). P6 invalidates `surface_bindings` (P-EXP) and emits into `foundational_patterns` (P5); it is **not** a Tier-1 wave member and cannot run concurrently with them — PG-6 measures their outputs. It is a short sequential phase, not a subagent in the wave.
- **Sequential integration:** P8 (recognition-curve surface) → P9 (wire into live routes + end-to-end non-amnesiac proof on Sabor + BCL).
Commit + push after every change; the single PR is created in P9.

---

## §1 — Problem Statement

The platform has built the **capture** half of the closed loop and, with HF-337, has **proven the recall/consolidate pattern at one layer** — but the learning loop is otherwise unmaterialized on the live path. Signals are written; comprehension is generated every import; calculation runs cold every time; convergence writes signals it never reads. **Role 4 (Learn) is materialized only at the expression layer (HF-337, same-tenant); G11 (Read-Path Coherence) is violated everywhere else** — the signal surface is write-only at the comprehension, calculation, and convergence layers, and the expression layer has no cross-tenant memory.

This is TMR-C90 (Dead Intelligence), TMR-C93 (Convergence writes but never reads), the 24% Decision-155 compliance AUD-002 v2 quantified — and now, additionally, the **un-inherited expression binding**: HF-337's `surface_bindings` accumulate per tenant but no new tenant benefits from them.

**Objective and measurable outcome.** When OB-235 is complete, the platform exhibits **non-amnesiac behavior** — empirically measured, on two structurally different proof tenants (Sabor, POS/Financial; BCL, banking/ICM), at **four** layers:

1. **Comprehension.** A second import of structurally-similar data matches a stored fingerprint, reuses the stored comprehension, **skips the LLM comprehension call** (call count → 0 for matched fields, including zero salvage-retries — retries occur only on a cold miss), byte-identical, lower latency.
2. **Calculation.** A second identical calculation reads accumulated `synaptic_density`, shifts execution mode toward silent, completes at **T₂ < T₁**, preserves results **bit-identically** (internal consistency; reconciliation anchors unchanged).
3. **Cross-tenant data flywheel.** A fresh tenant whose data carries a known structural pattern loads **cold-start priors** (first-encounter confidence > 0.5, fewer full_trace ops than a true cold tenant), **zero tenant-identifying data** crossing the boundary.
4. **Expression-binding flywheel (R2).** A fresh tenant whose comprehension fingerprint matches an established `surface_bindings` entry **inherits the binding at cold-start** — as a **discounted prior (×0.6) verified against the new tenant's own comprehension**, fewer recognition LLM calls than a true cold surface, with the receiving tenant's own recognition able to override.
5. **Multiplier (of five).** A single Level-2 comprehension correction produces **five** measurable updates: the tenant's comprehension artifact, the foundational pattern, the domain pattern, the next convergence outcome, **and the invalidation/refresh of the `surface_bindings` that resolved against the corrected field**.

These five measurements, with pasted numbers, are the OB's pass condition.

---

## §2 — Substrate-Bound Discipline Applications

- **DS-021 G7 (Single Canonical Signal Surface).** All signal writes — including HF-337's `surface_binding_recognition` — converge on one canonical writer (P1). The `plan_agent_seeds` private-JSONB anti-pattern is neither introduced nor extended.
- **DS-021 G11 (Read-Path Coherence).** Every expensive interpretive step consults accumulated learning first: P3 comprehension, P4 calculation, P7 convergence, **P-EXP expression-binding**. Writing signals is not learning; reading them is.
- **DS-021 Role 4 (Learn) — now four-layer.** The consolidation/learner stage turns this run's signals into the artifact the next run reads, keyed three ways (Tenant → Foundational → Domain) for data, and **(tenant, fingerprint, surface) → (fingerprint, surface)** for expression bindings.
- **Decision 64 v2 (Multiplier).** P5 + P6 + P-EXP realize the Multiplier-of-five: one correction improves Tenant, Foundational, Domain, Convergence, **and Expression bindings**.
- **Synaptic State Specification.** P4 reconnects/rebuilds the density loop per P0; consolidation formula and execution-mode thresholds are spec-verbatim (DD-5 structural constants).
- **DS-022 (Canonical Signal-Write Surface).** P1 implements Phase 1 (producer-side single-site normalization; registered signal-type set with structured failure on unregistered — G6). **The registered set now includes `surface_binding_recognition`** (HF-337's expression-layer kind), alongside the Synaptic-Spec kinds and the three Decision-64 levels. The 15+-writer migration (Phases 2–5) is §6 follow-on.
- **T1-E910 (Korean Test) + No Fixed Taxonomy.** Fingerprints use structural-feature extraction (column count, type distribution, value-range/cardinality buckets) → hash → similarity; never field names in any language. No phase introduces an enum/array/Set of permitted values to gate an artifact. **The expression-binding inheritance keys strictly on `(structural_fingerprint_hash, surface_id)` — never an intent/role/property string** (that is HF-337's HALT-REGISTRY line, carried). Grep-verified per phase.
- **The "recognized, not reconciled" guard (R2, load-bearing).** A binding is an LLM judgment. **Cross-tenant inheritance must not assert it.** P-EXP inherits as a discounted prior, **verifies the inherited field's characterization against the receiving tenant's own `comprehension_artifacts`**, and yields to the receiving tenant's own recognition on mismatch. Structural-fingerprint similarity is not semantic identity; the verification step is what prevents a confidently-wrong inherited binding.
- **T1-E905 (Prove Don't Describe).** The recognition curve is rendered on a real surface (P8); every loop is proven by measurement.
- **T1-E952 (Adjacent-Arm Drift).** Loops closed at the class layer across every interpretive surface in scope (comprehension, calculation, convergence, expression), not at a single instance.
- **SR-2 (Scale by Design).** All learning reads/writes batched; pattern lookups on indexed columns; no per-entity AI call and no per-entity synchronous DB write in the calculation loop; the expression-binding cross-tenant read is a single indexed lookup, not per-render (HF-337's memoization holds — cross-tenant prior is fetched once on a cold miss).
- **Reconciliation-channel separation.** Ground-truth payouts (BCL $312,033; Meridian $556,985; all anchors) are architect-channel. CC reports calculated values verbatim and asserts **internal consistency** (run-2 == run-1), never correctness against an external number.

---

## §3 — Phase prose

### §3.0 — P0: State verification + HF-337 re-sync (sequential; read-only; no behavior change)

Establish the exact current state of every loop element on the live path, **re-synced against HF-337's landed deltas**, with pasted evidence. No behavior change.

1. **Precondition re-sync (HF-337).** Confirm #593 merged/live; `comprehension_artifacts` populated; `structural_fingerprint_hash` emitted; `surface_bindings` live with the HF-337 shape; `surface_binding_recognition` signals present. Read HF-337's completion-report **Forward-Validation for OB-235** (§8b) and confirm the five changed files (`anthropic-stream.ts`, `insight-engine.ts`, `comprehension-generator.ts`, `surface-binding-recognition.ts`, `api/financial/data/route.ts`) and "calc path: zero changes." Any mismatch with the live tree → **HALT-RESYNC**.
2. **Salvage-retry accounting (HF-337 delta).** Read `comprehension-generator.ts`'s coverage-retry and `anthropic-stream.ts`'s salvage path. Confirm and document: a **cold (miss)** comprehension pass may fire one call + retries for missing fields; a **warm (hit)** pass must fire **zero** calls. The P3 call-count instrumentation must count total calls including retries (so `hit = 0` is provable and not masked).
3. **Calculation-layer density wiring (live calc route).** With pasted code/grep-absence, determine whether the live calc route (a) loads `synaptic_density` before the entity loop, (b) selects an execution mode, (c) consolidates density after, (d) fires flywheel aggregation. Record which of (a)–(d) are present/absent/dead.
4. **Signal read-path presence.** Determine whether any consumer reads `classification_signals` before an independent AI call (convergence, comprehension, SCI). Record the reader count (expected near zero per AUD-002 v2).
5. **Write-site inventory (DS-022 baseline).** Enumerate every site that writes `classification_signals` — **including HF-337's recognizer write** (`source='surface-binding-recognition'`). This is the P1 retirement/registration set.
6. **Empirical baselines (T₁).** For one plan-bearing proof tenant: (i) wall-clock + LLM-call count for an import comprehension pass (noting cold-retry behavior); (ii) wall-clock + execution-mode distribution for one calculation run; (iii) **recognition LLM-call count for a surface on first encounter** (the expression-binding T₁). These are what P9 measures the second encounter against.

**PG-0.** Report includes: the HF-337 re-sync result; the salvage-retry accounting; the (a)–(d) calc-wiring findings; the reader count; the write-site inventory (incl. the recognizer write); the T₁ baselines (incl. expression-binding). CC states the **reconnect-vs-rebuild disposition** for the calculation-layer density loop. If rebuild is the only path because the density loop is entangled in the byte-identical metrics-resolution path → **HALT-REBUILD**.
**Commit:** `OB-235 P0: state verification + HF-337 re-sync — loop wiring, salvage-retry accounting, write-site inventory, T1 baselines`

### §3.1 — P1: Canonical Signal-Write Surface (sequential foundation; DS-022 Phase 1)

Implement the single canonical writer so the surface the learner consumes is clean. Closes AUD-006 P0 (B2 dead code; writer-side clamp bypassed by four writers; the 100× consumer asymmetry) by routing every writer through one producer-side normalization site.

Per DD-6 verify with pre-SHA + `git diff` (not chained grep). Per DD-3 classify every write site: **canonical-write / provenance-only / retire**.

Mechanism:
1. **Pre-SHA.** `cd "$(git rev-parse --show-toplevel)" && git rev-parse HEAD | tee /tmp/ob235_p1_presha.txt`
2. **Canonical writer module** (new): one function accepting `signal_type`, `signal_value`, optional `confidence`/`source`/`scope` + structural columns; normalizes confidence to `[0.0, 1.0]` at this one site (inclusive 1.0 per the DS-022 IRA disposition); **validates `signal_type` against the registered set and raises a named, observable, structured failure on an unregistered type (G6 — no silent default)**; writes through one path. **The registered set is a registry of structural *signal kinds*** — confidence, anomaly, correction, pattern, boundary_behavior, data_quality, resolution_hint, performance (Synaptic-Spec) + the three Decision-64 levels + **`surface_binding_recognition` (HF-337 expression-layer)** — **not** a domain vocabulary; structured failure on an unrecognized *structural kind* is correct (not a Korean-Test violation).
3. **Repoint every retire-class write site** — **including the HF-337 recognizer's signal write** — to the canonical writer, preserving each call's semantics exactly (DD-7; routing change, not behavior change). The recognizer continues to emit `surface_binding_recognition`, now via the canonical writer.
4. **Verify.** `git diff` shows normalization at one site; bypass grep shows **zero** direct `classification_signals` inserts outside the canonical module.

**Files owned by P1:** `web/src/lib/signals/canonical-signal-writer.ts`, `web/src/lib/signals/signal-type-registry.ts`. (Repointed call sites are one-line routing changes.)

**PG-1.** Per-site classification table (DD-3); `git diff` evidence of single-site normalization (DD-6); bypass grep = 0; a pasted test of structured failure on an unregistered type; confirmation that `surface_binding_recognition` is registered and the recognizer routes through the canonical writer.
**Commit:** `OB-235 P1: canonical signal-write surface — single writer, producer-side normalization, expression-layer kind registered`

### §3.2 — P2: Learner Core + Structural Fingerprint Matcher (sequential foundation; the shared spine)

Build the two shared contracts every fan-out phase codes against — domain-agnostic, Korean-Test-clean, storage-pluggable. **Anchor to HF-337's recognizer as the reference implementation of the recall/consolidate loop**; the learner-core generalizes its read-path-first → hit/deterministic → miss/recognize+persist+signal shape to every scope.

Mechanism:
1. **Structural fingerprint matcher** (new). Input: structural features extracted from carried data (column count; type distribution; value-range buckets; cardinality buckets) — never field names/values. Output: a stable hash + a similarity comparison against stored fingerprints. Consumes OB-233's `structural_fingerprint_hash` where present; computes the feature set where similarity is needed. **Match scope parameterized** (within `tenant_id` for Tenant; `tenant_id`-dropped for Foundational/Domain **and for expression-binding cross-tenant** — the `(structural_fingerprint_hash, surface_id)` key HF-337 built the index for).
2. **Learner core** (new). A scope- and store-generic read/consolidate contract; the store adapter is supplied per layer, so one core drives `comprehension_artifacts` (comprehension), `synaptic_density` (calculation), `foundational_patterns`/`domain_patterns` (data flywheel), **and `surface_bindings` (expression-binding flywheel)**. `consolidate` both persists the learned artifact **and emits a signal via the P1 canonical writer** (the HF-337 dual-write pattern, generalized).
3. **No fixed taxonomy.** Neither module enumerates a permitted-value set to gate an artifact. Grep-verify; any match must be a non-gating structural literal, enumerated (DD-5). A permitted-value gate → **HALT-TAXONOMY**.

**Files owned by P2:** `web/src/lib/learning/structural-fingerprint-matcher.ts`, `web/src/lib/learning/learner-core.ts`, `web/src/lib/learning/learn-store.ts` (the adapter interface). No layer store *implementations* here.

**PG-2.** The matcher source (architect verifies zero field-name literals); a unit proof of match-on-similar / miss-on-dissimilar; the learner-core signature showing it is scope- and store-generic and emits via the canonical writer; the Korean-Test grep with every match enumerated as non-gating.
**Commit:** `OB-235 P2: learner core + fingerprint matcher — shared scope/store-generic spine, dual-write generalized from HF-337`

### §3.3 — P3: Comprehension-layer Tenant loop (Tier-1 fan-out · medium)

Close the first data loop on the clean comprehension path. Before the LLM comprehension call, recall a stored comprehension for a matching fingerprint within the tenant; hit → reuse, skip the call; miss → comprehend, write fingerprint + comprehension for next time.

Mechanism: comprehension-layer **store adapter** (backed by `structural_fingerprints` + `comprehension_artifacts`); in the comprehension **service** (not the import route — wired in P9) insert `recallOrNull('tenant', hash, tenantId)` → hit above threshold returns stored comprehension + records an LLM-call-skip; miss runs the existing LLM comprehension then `consolidate(...)`. Add the minimal timing + **call-count (including salvage-retries)** instrumentation per P0.2.

**Files owned by P3:** `web/src/lib/learning/stores/comprehension-store.ts`, `web/src/lib/learning/comprehension-recall.ts`, `web/src/lib/learning/instrumentation/comprehension-timing.ts`. P3 inserts one call into the comprehension service; it does not edit the import route.

**PG-3.** For one tenant, two imports of structurally-similar data: the **second** matched the fingerprint and the LLM comprehension **call count for matched fields is 0** (incl. zero retries); the two comprehension outputs are **byte-identical**; the second latency is lower. Paste all.
**Commit:** `OB-235 P3: comprehension-layer tenant loop — fingerprint recall, LLM-skip (incl. retry=0), byte-identical reuse`

### §3.4 — P4: Calculation-layer Tenant loop (Tier-1 fan-out · heavy · MAX-EFFORT — reconnect-vs-rebuild judgment)

Reconnect (or rebuild per PG-0) the cross-run synaptic density loop so a second identical calculation reads density, shifts execution mode, runs faster — reconciliation bit-identical.

Mechanism: calculation-layer **store adapter** (backed by `synaptic_density`, keyed `(tenant_id, signature)`, Synaptic-Spec `pattern_signature`); **load before the loop**; **select execution mode** per spec thresholds — full_trace < 0.70, light_trace 0.70–0.95, silent ≥ 0.95 (DD-5 structural constants); **consolidate after** via the spec formula — newConfidence = 0.7·prev + 0.2·runConfidenceMean + 0.1·(1 − runAnomalyRate) (DD-5) — single batched upsert (SR-2). **Reconciliation preservation is absolute:** execution-mode selection alters no computed value; silent skips *tracing*, not *math*. Touching the byte-identical metrics-resolution path → **HALT-CALC** / **HALT-REBUILD**.

**Files owned by P4:** `web/src/lib/learning/stores/synaptic-density-store.ts`, `web/src/lib/learning/density-recall.ts`, and `web/src/lib/learning/pattern-signature.ts` if none reusable (P0). P4 does not edit the live calc route.

**PG-4.** For one tenant, two identical runs: the execution-mode distribution shows the **second shifts toward silent**; T₂ < T₁; the **two result sets are identical** (row-count + checksum of `entity_period_outcomes`, or zero-value diff). Internal consistency only; no external reconciliation.
**Commit:** `OB-235 P4: calculation-layer tenant loop — density recall, execution-mode shift, reconciliation-preserving`

### §3.5 — P5: Cross-tenant DATA flywheel — Foundational + Domain (Tier-1 fan-out · heavy)

Aggregate structural pattern signatures across tenants into `foundational_patterns`/`domain_patterns`; load cold-start priors for new tenants. The compound moat for the data layer.

Mechanism: **Foundational aggregation** (after tenant consolidation, aggregate the tenant's pattern signatures — running confidence_mean/variance, total_executions, tenant_count, anomaly_rate_mean, structural learned_behaviors — batched, fire-and-forget, never blocks the calc response); **Domain aggregation** (same, scoped by structural domain tag into `domain_patterns`); **cold-start priors** (no tenant density for a pattern → load from `domain_patterns` then `foundational_patterns` at **discounted confidence ×0.6**, DD-5, so priors inform not assert). **Privacy firewall (absolute):** the cross-tenant write path carries **structural data only** — pattern_signature, aggregate confidence/variance/counts, structural learned_behaviors; **zero** `tenant_id`/`entity_id`/raw values/source-file names/display names. Any tenant-identifying field on a cross-tenant **write** path → **HALT-CROSSFLOW**.

**Files owned by P5:** `web/src/lib/learning/flywheel/foundational-aggregation.ts`, `web/src/lib/learning/flywheel/domain-aggregation.ts`, `web/src/lib/learning/flywheel/cold-start-priors.ts`.

**PG-5.** Aggregation writes structural rows to `foundational_patterns`/`domain_patterns`; the crossflow grep shows **zero** tenant-identifying fields on the write path; cold-start demonstrated (a fresh/Nuclear-Cleared pattern loads a prior at first encounter, confidence > 0.5, fewer full_trace ops than a true cold baseline).
**Commit:** `OB-235 P5: cross-tenant DATA flywheel — foundational + domain aggregation, cold-start priors, privacy firewall`

### §3.X — P-EXP: Cross-tenant EXPRESSION-BINDING inheritance (Tier-1 fan-out · medium · MAX-EFFORT · R2; the guarded layer)

Extend HF-337's recognizer so a fresh tenant whose comprehension fingerprint matches an established binding **inherits it at cold-start** — as a **discounted, verified prior**, never an assertion. **(B) layer:** the recognizer's existing same-tenant read-back and persist are unchanged; this adds one step to the **miss** path and must re-prove HF-337's PG-PATHA.

Mechanism (additive edit to `surface-binding-recognition.ts`, plus a primer module):
1. **Cross-tenant prior on miss.** When the tenant-scoped `surface_bindings` lookup misses, **before** the LLM recognition call, query `surface_bindings` by `(structural_fingerprint_hash, surface_id)` with `tenant_id` dropped (the HF-337 cross-tenant index). If a cross-tenant binding exists:
   - **Verify against the receiving tenant's own comprehension (load-bearing guard):** confirm the inherited field's characterization in the *receiving* tenant's `comprehension_artifacts` actually satisfies the surface's free-form purpose (a structural-similarity check between the inherited binding's purpose and the receiving field's characterization). **Pass → use the inherited binding as a discounted prior (confidence ×0.6, DD-5)**, skipping the cold LLM recognition (the expression-layer Progressive-Performance win). **Fail → discard the prior and fall through to the normal LLM recognition** (the receiving tenant's own recognition overrides — structural-fingerprint similarity is not semantic identity).
2. **Persist the resulting binding** for the receiving tenant (its own row, full confidence once self-recognized; discounted if inherited-and-verified), and **emit the `surface_binding_recognition` signal via the canonical writer** (the consolidation feeds the flywheel further).
3. **No assertion, no registry:** the inheritance keys strictly on `(structural_fingerprint_hash, surface_id)`; it introduces no intent/role/property vocabulary. A binding is never applied without the receiving-comprehension verification. Grep-verify no permitted-value gate → else **HALT-REGISTRY**.

**Files owned by P-EXP:** `web/src/lib/learning/expression/binding-inheritance.ts` (the cross-tenant primer + verification), and the **single additive miss-path edit** to `web/src/lib/comprehension/surface-binding-recognition.ts` (insert the prior step before the LLM call; do not alter the existing read-back, persist, or graceful-degradation paths). **Merge-order (declared): P-EXP merges before P9** — `surface-binding-recognition.ts` is also touched by P9, and no other Tier-1 phase touches it, so the only sequencing constraint is P-EXP-before-P9; P9 confirms the additive edit survived the merge and the live call sites use it.

**PG-EXP.** Paste: (i) a fresh tenant whose fingerprint matches an established binding **inherits it at cold-start** with **fewer recognition LLM calls** than a true cold surface, at discounted confidence; (ii) the **verification guard firing** — an inherited prior that **fails** the receiving-comprehension check is discarded and the tenant's own recognition runs instead (the "recognized-not-reconciled" guard, proven); (iii) **HF-337 PG-PATHA re-proven** — same-tenant read-back (`fromCache=true`, no LLM), memoization, graceful degradation all still pass (the additive edit didn't regress the producer); (iv) the no-registry grep clean.
**Commit:** `OB-235 P-EXP: cross-tenant expression-binding inheritance — discounted + receiving-comprehension-verified prior, HF-337 behavior preserved`

### §3.6 — P6: Signal-level feedback — corrections refine comprehension AND invalidate stale bindings (Tier-2 — sequential, after Tier-1 merges; the Multiplier-of-five)

**Tier-2 — runs sequentially after the Tier-1 wave merges.** P6 operates on the stores P5 (`foundational_patterns`) and P-EXP (`surface_bindings`) create; it cannot run concurrently with them, and PG-6 measures their outputs. Realize the loop DS-030 §5.1 specifies and OB-233 deferred — **extended to the expression layer (R2)**: a Level-2 correction updates the tenant's comprehension, propagates anonymously to foundational/domain, **and invalidates/refreshes the `surface_bindings` that resolved against the corrected field** (so a corrected comprehension never leaves a confidently-stale binding).

Mechanism: a **correction consumer** reads `correction`/Level-2 comprehension-correction signals from the canonical surface and (i) updates the relevant `comprehension_artifacts` row; (ii) emits structural deltas into P5 foundational/domain aggregation (subject to HALT-CROSSFLOW); **(iii) identifies every `surface_bindings` entry whose `resolved_fields` reference the corrected field for the tenant, and invalidates/refreshes them** — the next recognition re-resolves against the corrected comprehension. The next comprehension recall and the next binding recall both reflect the correction.

**Files owned by P6:** `web/src/lib/learning/correction-consumer.ts`.

**PG-6.** Inject one Level-2 correction; paste the updated `comprehension_artifacts` row; the shifted `foundational_patterns` confidence; **the invalidated/refreshed `surface_bindings` row(s)**; evidence that the next comprehension recall **and** the next binding recall both reflect the correction. Together with P3/P4/P5/P-EXP this demonstrates the **Multiplier-of-five**: one correction → tenant comprehension + foundational + domain + convergence (P7) + expression bindings.
**Commit:** `OB-235 P6: signal-level feedback — corrections refine comprehension, propagate, and invalidate stale bindings (Multiplier-of-five)`

### §3.7 — P7: Convergence as consumer (Tier-1 fan-out · light; TMR-C93)

Close the convergence one-way door: convergence reads Level-2 comprehension signals from the canonical surface before independent AI calls.

Mechanism: in the convergence **service** (not the import route — wired in P9) insert a read-path querying `classification_signals` for prior Level-2 comprehension on the relevant fields, used to inform/short-circuit the independent AI call (the write→recall pattern the SCI pipeline already demonstrates).

**Files owned by P7:** `web/src/lib/learning/convergence-recall.ts`.

**PG-7.** Evidence a convergence run consumed prior Level-2 signals (higher confidence, fewer independent AI calls, or a cheaper outcome versus a cold run with signals absent).
**Commit:** `OB-235 P7: convergence as signal consumer — read-path before independent AI call`

### §3.8 — P8: The Visible Recognition Curve (sequential integration; Prove Don't Describe)

Render non-amnesiac behavior on a real surface (T1-E905). An Observatory panel showing, per tenant, the recognition curve: per-pattern density progression + execution-mode distribution; comprehension LLM-call-skip rate; **expression-binding cold-start inheritance rate**; the T₁ → T₂ → Tₙ timing series.

Mechanism: a read-only API aggregating from `synaptic_density`, `structural_fingerprints`/`comprehension_artifacts`, **`surface_bindings`**, and the timing instrumentation; an Observatory panel rendering the curve (no new fixed vocabulary; renders whatever structural patterns exist).

**Files owned by P8:** `web/src/app/api/observatory/recognition-curve/route.ts`; `web/src/components/observatory/RecognitionCurvePanel.tsx` + its Observatory registration.

**PG-8.** A browser screenshot of the recognition-curve panel for a tenant that ran twice, showing density progression, the timing decrease, and the expression-binding inheritance indicator. (SR-44: architect performs the browser verification; CC provides the panel + the localhost confirmation.)
**Commit:** `OB-235 P8: recognition-curve Observatory surface — Prove Don't Describe`

### §3.9 — P9: Integration + End-to-End Non-Amnesiac Proof (sequential integration; the measurable outcome)

Wire the P3–P7 + P-EXP modules into the live import and calculation routes; run the full proof on two structurally different tenants.

Mechanism:
1. **Wire the read-paths and consolidations into the live routes** — the only phase that edits the live import + calculation route files. Integrate the service-local hooks from P3 (comprehension), P4 (calculation), P6 (correction), P7 (convergence), **the P-EXP recognizer edit (already in `surface-binding-recognition.ts`, called from the consuming surfaces — confirm the live call sites use it)**, and the P5 flywheel fire-and-forget. Preserve all existing behavior (DD-7); add recall-before-expensive-work and consolidate-after without altering computed values (HALT-CALC in force).
2. **Build + restart discipline:** kill dev server → `rm -rf web/.next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the report.
3. **End-to-end proof on Sabor + BCL.** For each tenant, cold first encounter then warm second, at all layers, recording: **Comprehension** (second-import LLM-call count → 0 for matched fields incl. retries; byte-identical; latency drop); **Calculation** (execution-mode shift toward silent; T₂ < T₁; identical result set; reconciliation anchors unchanged); **Data flywheel** (cold-start prior loaded for a fresh/Nuclear-Cleared pattern, confidence > 0.5); **Expression-binding flywheel** (a fingerprint-matching surface inherits a binding at cold-start, verified, fewer recognition calls; and the verification guard discards a non-matching prior); **Multiplier-of-five** (one correction → five updates incl. the invalidated binding).

**Files owned by P9:** the live import route file; the live calculation route file (integration edits only). Sequential, after the fan-out merges.

**PG-9.** The headline table: for Sabor and BCL, the five measurements above with pasted numbers. This is the pass condition. Final step: create the PR.

**Commit + PR (final step):**
```bash
cd "$(git rev-parse --show-toplevel)" && \
gh pr create --base main --head ob-235-learning-loop \
  --title "OB-235 R2: The Learning Loop — Role 4 across comprehension, calculation, convergence, and expression; G11 closed; Multiplier-of-five" \
  --body "Closes the signal-capture loop: read-paths + consolidation + three-scope data flywheel + cross-tenant expression-binding inheritance (guarded) + Multiplier-of-five. Non-amnesiac behavior proven on Sabor and BCL at four layers. See docs/completion-reports/OB-235_COMPLETION_REPORT.md."
```

---

## §4 — HALT Conditions

On any HALT, report surrounding code/evidence and stop; never work around (SR-34).

- **HALT-PRECOND.** #593 (OB-233 + HF-337) not merged/live.
- **HALT-233 / HALT-337.** `comprehension_artifacts` + fingerprint emission not live (233); `surface_bindings` + recognizer + `surface_binding_recognition` signals not live (337).
- **HALT-RESYNC.** HF-337's recorded path deltas do not match the live tree (the foundation moved under OB-235).
- **HALT-REBUILD.** The calc-layer density loop cannot be reconnected because it is entangled in the byte-identical metrics-resolution path. Architect dispositions reconnect-shim vs full rebuild.
- **HALT-CALC.** Any phase would change a reconciled value. BCL ($312,033), Meridian ($556,985), and every anchor preserve bit-identically. Execution mode skips tracing, never math.
- **HALT-CROSSFLOW.** Any cross-tenant **write** path (`foundational_patterns`/`domain_patterns`) would carry `tenant_id`/`entity_id`/raw value/source-file name/display name. The firewall is absolute.
- **HALT-REGISTRY.** Any phase — **especially P-EXP** — would introduce an enum/array/Set of permitted values to gate an artifact, key the expression-binding inheritance on an intent/role/property string rather than the structural fingerprint, or apply a cross-tenant binding **without** the receiving-comprehension verification. The Korean Test, No-Fixed-Taxonomy, and the recognized-not-reconciled guard forbid all three.
- **HALT-TAXONOMY.** Any phase would introduce a permitted-value gate or match identifiers by field-name string in any language.
- **HALT-FORK.** Implementation reveals a contradiction with locked design (DS-021, Decision 64 v2, Synaptic Spec, DS-022, **or HF-337's recognizer contract**) requiring *supersession* rather than implementation. A genuine supersession fork, not an implementation choice. Architect disposition (may route to an IRA).
- **HALT-API.** `ANTHROPIC_API_KEY` unavailable where the comprehension/recognition path requires it.
- **HALT-SCALE.** Any step would introduce a per-entity AI call or per-entity synchronous DB write into the calculation loop, or a per-render LLM call at the expression layer (SR-2 / Synaptic-Spec litmus).

---

## §5 — Reporting Discipline

Completion report `docs/completion-reports/OB-235_COMPLETION_REPORT.md` (Rules 25–28). Mandatory structure:
1. **ADR (Section B)** — decisions per phase, grounded to the substrate entry each materializes; the (B)-layer relationship to HF-337's recognizer.
2. **PG-0 … PG-9 + PG-EXP** — each with **pasted evidence** (code/terminal/grep/screenshot); PASS/FAIL self-attestation rejected.
3. **HF-337 re-sync findings (P0)** — path-delta confirmation; salvage-retry accounting; the reconnect-vs-rebuild disposition; the write-site inventory (incl. the recognizer write).
4. **DS-022 Phase 1 per-site classification table** (DD-3) and the canonical-writer `git diff` (DD-6); confirmation `surface_binding_recognition` is registered.
5. **Korean Test / No Fixed Taxonomy log** — every grep across the new modules, each match enumerated as non-gating; the P-EXP no-registry + verification-guard evidence.
6. **Privacy-firewall verification** — HALT-CROSSFLOW grep.
7. **The end-to-end non-amnesiac proof table** — Sabor + BCL, **five** measurements each, with numbers. The headline.
8. **ULTRACODE fan-out record** — subagents spawned **per tier (Tier-1 wave vs Tier-2 sequential)**; files owned per phase; effort level per phase (the max-effort phases P4/P-EXP called out); the **P-EXP-before-P9 merge-order outcome** (did the additive recognizer edit survive the merge); the P4 reconnect-vs-rebuild decision-gate disposition; worktree outcomes; merge conflicts + resolutions.
9. **HALT outcomes.**
10. **ARTIFACT SYNC block** (MC / REGISTRY / R1 / BOARD / SUBSTRATE — esp. the Learn-role and **expression-binding flywheel** capability rows; the dead-loop-to-live-loop closure pattern and the recognized-not-reconciled guard as ICA captures).
11. **PR number and URL.**

---

## §6 — Out of Scope

- **The Performance / thermostat agent** (anomaly detection, forecasting, coaching — paid tier). Gated on reporting read-path unification + End-State A (Performance consumes Calculation, never re-derives); a flywheel cannot sit on a surface that fabricates inputs (OB-322). Follow-on.
- **Reporting read-path unification (the TMB coverage gap).** `/insights/*` + ICM reporting on `calculation_results` with re-derivation — separate OB (OB-322 territory).
- **DS-022 Phases 2–5** — the full 15+-writer migration beyond Phase 1. Follow-on.
- **Adaptive surface composition per-user** (DS-013 Phases D/E) — per-user signal-density aggregation requires the IRA Gap 2 privacy analysis. Follow-on.
- **Embedding-based fingerprint similarity** — P2 uses structural-feature extraction; semantic/embedding similarity is a future refinement (§6A).
- **OB-234 (Performance viz)** — consumes OB-235's confidence (DS-013 confidence disclosure) and the recognizer for measure-binding; branches after OB-235. Not built here.
- **Nuclear Clear operator UI** — used by the proof (P5/P-EXP); exposing it as an operator control is out of scope.

---

## §6A — Residuals

1. **Structural-feature fingerprint robustness (DS-030 §9.5).** Tuning the feature set + similarity threshold across more tenant shapes is iterative; thresholds used are recorded in PG-2/PG-3/PG-EXP.
2. **Reconnect-shim vs rebuild for the calc density loop.** If HALT-REBUILD fired, the disposition applied is recorded; the non-chosen path is a residual.
3. **Expression-binding inheritance threshold.** The receiving-comprehension verification threshold (when an inherited binding is "close enough" to apply as a prior vs. re-recognize) is recorded in PG-EXP for tuning; conservative default (re-recognize on doubt) preferred.
4. **Cross-domain comprehension (DS-030 §9.4).** ICM + Financial agents sharing a tenant's comprehension — not addressed.
5. **Field-name collision across sheets.** `(tenant_id, field_name)` + the fingerprint key assume a field name means one thing per tenant — multi-meaning fields per tenant are a residual.
6. **Per-user density (privacy-gated).** Waits on the IRA Gap 2 privacy analysis.
7. **Embedding-based similarity** — the concrete next refinement of P2.

*OB-235 R2.1 — Role 4 (Learn) materialized across comprehension, calculation, convergence, and (new) expression; G11 closed; the Multiplier is five. HF-337's recognizer is the proven pattern and stays the producer; OB-235 inherits bindings across tenants only as verified, discounted priors — recognition by structural complementarity, memory across the population, never assertion. Two fan-out tiers, the P6 dependency in Tier-2, the P-EXP/P9 merge-order declared, the reasoning budget spent on P4 and P-EXP. The file IS the prompt. Ends here.*
