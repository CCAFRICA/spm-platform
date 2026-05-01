# DIAG-019: Primitive Vocabulary Boundary Inventory — AI-to-Engine Path

## Purpose

Enumerate every boundary along the AI-to-engine path that names, dispatches on, validates, or documents structural primitives. Assess each boundary's compliance with substrate coherence as committed by Decisions 154 + 155 and the platform's Synaptic Surface + SCI architecture. Drive a bounded closure scope for residual private-vocabulary copies, rather than continuing the empirical iteration pattern revealed by OB-196 Phase 1.5.1's three-test trajectory.

## Trajectory context

OB-196 Phase 1.5.1's empirical test arc (three BCL plan-import attempts, 2026-04-29) revealed that the AI-to-engine path carries multiple sequential boundaries, each historically authored with its own private vocabulary copy. Each test's failure surfaced *after* the upstream boundary closed cleanly:

| Test | Closed prior to test | Throw boundary | Surfaced narrowing |
|------|---------------------|----------------|--------------------|
| 1 | (baseline) | `normalizeComponentType` first gate | Prompt teaches AI to emit `matrix_lookup` (legacy vocabulary in prompt body) |
| 2 | Prompt refactor (P1.5.1.2) | `normalizeComponentType` second gate | Hardcoded 5-element importable Set rejecting 7 of 12 foundational primitives |
| 3 | Importer narrow-5 fold-in (P1.5.1.4) | `convertComponent` switch default | Identical 5-element switch arm allow-list at the bridge-to-engine conversion boundary |

CC's parallel-site survey at Test 3 surfaced four additional possible narrowing sites (`intent-validator.ts`, `convergence-service.ts` multiple, `forensics/trace-builder.ts`) that were not empirically failing in the current scope.

The trajectory pattern is not three independent defects; it is **systematic per-boundary narrowing in defiance of Decision 155's surface-derivation commitment.** Closing each boundary as it surfaces is point-solution; the substrate architecture (Synaptic Surface + SCI + foundational primitive registry) was designed to make every boundary structurally coherent with one canonical surface.

This diagnostic surfaces every boundary, assesses compliance, and drives bounded closure rather than empirical iteration.

## Substrate basis (binding context)

**Decision 154 (LOCKED 2026-04-27):** *Korean Test extends to operation, primitive, and dispatch-surface identifiers. Structural primitives shall exist in exactly one canonical declaration. Every boundary that names, dispatches on, validates, or documents these primitives shall derive from that declaration without maintaining a private copy. Every dispatch boundary shall produce observable, named, structured failure on unrecognized identifiers — never silent fallback. If a new structural primitive appears, would the platform still work? — and the operative answer shall be yes, by virtue of canonical declaration, round-trip closure, and structured failure as substrate-binding obligations.*

**Decision 155 (LOCKED 2026-04-27):** *The canonical declaration of structural primitives required by Decision 154 is a surface (registry), not a string. The surface admits per-domain declaration entries. The surface enforces uniqueness, structural validity, and Korean Test compliance across all entries. Every boundary that names, dispatches on, validates, or documents structural primitives derives from the surface — not from any private copy.*

**Synaptic Surface + SCI architectural commitment:** The Structural Classification Intelligence layer produces emissions (`componentType`, `calculationMethod`, `calculationIntent`) per the foundational primitive registry. Every boundary downstream of SCI consumes these emissions. Substrate coherence requires every consumer to derive from the same canonical surface; per-boundary narrowing breaks coherence by introducing layer-specific vocabulary that is not the registry's vocabulary.

## Scope

Enumerate sites in:

- `web/src/lib/calculation/`
- `web/src/lib/compensation/`
- `web/src/lib/ai/`
- `web/src/lib/orchestration/`
- `web/src/lib/intelligence/`
- `web/src/lib/forensics/`
- `web/src/app/api/import/`
- `web/src/app/api/ai/`
- `web/src/app/data/import/` (UI consumers naming primitives)

Halt and surface to architect if a site discovered falls outside these directories, before continuing.

A site qualifies for inventory if any of:

- A primitive identifier appears as a string literal, enum value, switch arm, or type union member
- A function dispatches on a primitive identifier (switch, if-chain, lookup table, allow-list)
- A function validates a primitive identifier or its emitted shape
- A function documents primitive vocabulary to a consumer (AI prompt, UI label, error message, telemetry event)

## Inventory deliverable

For every site, produce one entry in the inventory table with these nine fields:

| Field | Description |
|-------|-------------|
| `file_path` | Absolute path from repo root, e.g. `web/src/lib/compensation/ai-plan-interpreter.ts` |
| `line_range` | Inclusive line range, e.g. `424–476` |
| `boundary_description` | Single sentence — what the boundary does. E.g. *"Switch dispatching plan components to per-componentType conversion"* |
| `vocabulary_scope` | Enumerate exactly which primitives the boundary admits / names / dispatches on / validates / documents. E.g. *"5 of 12: linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate"* |
| `surface_derivation_status` | One of: `registry_derived` (uses `getRegistry()` / `getOperationPrimitives()` / `isRegisteredPrimitive()` / `lookupPrimitive()` / `FoundationalPrimitive` type), `private_copy` (hardcoded literals), `partial` (mixed pattern — describe) |
| `dispatch_behavior_on_unspecified_registered` | What happens when a registered primitive without specific handling reaches this boundary. E.g. *"throws Error"*, *"silent fallback to default arm"*, *"passthrough"* |
| `structured_failure_pattern_on_unrecognized` | What happens on unrecognized identifier. E.g. *"throws IntentExecutorUnknownOperationError"*, *"throws generic Error"*, *"silent default"*, *"no failure surface"* |
| `decision_155_verdict` | One of: `compliant` (surface-derived), `private_copy_violation`, `partial` (describe) |
| `decision_154_verdict` | One of: `compliant` (foundational identifiers only, no domain language), `legacy_identifiers_present`, `domain_vocabulary_present`, `language_specific_keywords_present`, `partial` (describe) |

Plus, optionally, an audit-trail attribution column noting if the site carries a Phase-1.5 attribution comment, other phase attribution, or pre-Phase-1.5 origin.

The inventory output is grouped by file path, with sites within each file listed in line order.

## Substrate coherence assessment

After site-by-site inventory, the diagnostic produces a substrate coherence section assessing five questions.

### Coherence Question 1 — Vocabulary uniformity along the path

Trace one primitive identifier (suggested: `bounded_lookup_2d`, since BCL surfaced it empirically; CC may select another structurally if `bounded_lookup_2d` does not traverse all boundaries surfaced in the inventory). Build a sequence diagram showing the primitive's traversal: SCI emission → bridge type-normalization → bridge calculationMethod-construction → bridge component-conversion → engine validator → engine executor.

For each boundary the primitive traverses, surface: does it pass through, get rejected, get translated to a different identifier, get silently fallback'd to a default? The trace exposes whether the path is structurally coherent for that primitive end-to-end.

### Coherence Question 2 — Boundary count by type

Count the inventoried sites by category:

- How many name primitives?
- How many dispatch on primitives?
- How many validate primitives or emitted shapes?
- How many document primitive vocabulary to a consumer?

For each category, count surface-derived vs private-copy. The counts surface the magnitude of the surface-derivation gap.

### Coherence Question 3 — Failure mode uniformity

Decision 154 mandates structured failure on unrecognized identifiers at every dispatch boundary. At each dispatch site in the inventory, identify the failure mode on unrecognized identifier. Surface the variance — is structured-failure-on-unrecognized uniformly enforced via named error classes, or is it boundary-by-boundary inconsistent (some throw, some silent fallback, some swallow the unknown identifier)?

### Coherence Question 4 — Registry consumption pattern

For each inventoried file:

- Does it import from `@/lib/calculation/primitive-registry`?
- Which symbols does it import? (`FoundationalPrimitive` type? `getRegistry`? `lookupPrimitive`? `isRegisteredPrimitive`? `getOperationPrimitives`? `InvalidPrimitiveShapeError`?)
- Does it call `primitiveEntry.validate(emission)` for shape validation?

The consumption pattern surfaces how thoroughly the registry's canonical-declaration role is realized in practice. Files that import nothing from the registry but still name primitives are private-copy violations by definition.

### Coherence Question 5 — SCI integration assessment

SCI's structural-classification-intelligence layer produces emissions (`componentType` strings, `calculationMethod` payloads, `calculationIntent` payloads). The boundaries downstream of SCI consume these emissions.

- Are the consumption boundaries structurally aligned with SCI's emission contract?
- SCI emits per the registry's foundational vocabulary; do downstream boundaries accept the same vocabulary, or narrow further?
- Where downstream boundaries narrow, does the narrowing reflect a deliberate architectural decision (e.g., engine has handlers for X but not Y) or a private-copy artifact?

This question's answer drives the most important closure-scope disposition: which narrowings are structural and intentional vs which are accidental private copies that should close to surface-derivation.

## Halt-and-surface conditions

- Inventory site count exceeds approximately 30 sites — halt; surface; architect dispositions whether scope expands beyond the directories listed above.
- A site discovered is structurally ambiguous (e.g., a function that simultaneously dispatches AND validates AND documents — multiple categories collapsed into one site) — halt; surface; architect dispositions categorization.
- An inventoried site reveals a substrate-architecture-level divergence the trajectory analysis did not anticipate (e.g., a boundary that does not fit any of the four scope categories cleanly, or a boundary using a primitive vocabulary surface other than the registry) — halt; surface for architect interpretation before continuing.
- The Coherence Question 5 SCI integration assessment surfaces a SCI-side narrowing or transformation that wasn't apparent from the boundary inventory alone — halt; surface; this is potentially a more substantial finding than the boundary survey itself contemplated.

## Audit Findings Report (required at close)

When inventory and substrate coherence assessment complete, append an Audit Findings Report section to this document with the following structure:

### Findings summary

A short prose summary (3–6 sentences) characterizing the substrate coherence state revealed by the inventory. Decision 155 compliance overall: substantively met / partially met / substantively failed. Trajectory pattern interpretation: was the three-test arc indicative of further sites or did it surface the full inventory?

### Site count

| Category | Total sites | Registry-derived | Private-copy violation | Partial |
|----------|-------------|------------------|------------------------|---------|
| Names primitives | (count) | (count) | (count) | (count) |
| Dispatches on primitives | (count) | (count) | (count) | (count) |
| Validates primitives/shapes | (count) | (count) | (count) | (count) |
| Documents primitive vocabulary | (count) | (count) | (count) | (count) |
| **Total unique sites** | (count) | (count) | (count) | (count) |

### Critical findings

Numbered findings, each carrying:

- **F-NN identifier** (sequential within DIAG-019)
- **File path + line range**
- **Severity** (CRITICAL = empirically blocks current functionality / HIGH = empirically discoverable defect / MEDIUM = compliance violation without empirical surface yet / LOW = audit-trail attribution issue)
- **Description** (one paragraph — what the finding is, why it matters)
- **Decision 154/155 verdict applicable**
- **Closure recommendation** (close in current OB / close in named follow-up workstream / accept as documented exception)

### Closure scope recommendation

Final disposition section recommending one of the following:

- **(a) Single coherent closure unit** — all surfaced sites close together as one workstream (named OB or HF). Recommended when the inventory reveals the closure work is bounded, interdependent, and best handled atomically.
- **(b) Phased closure across multiple workstreams** — sites partition into N workstreams (named). Recommended when inventory reveals genuinely separable concerns (e.g., bridge-side fixes are atomic; convergence-side fixes depend on other architectural work).
- **(c) Architectural escalation** — the inventory surfaces a substrate-architecture problem beyond per-site fixes. Recommended when Coherence Question 5 (SCI integration) reveals SCI-level narrowing, or when the registry surface itself proves insufficient to drive coherence at every boundary.

The recommendation includes:

- Workstream name(s)
- Site mapping (which sites close in which workstream)
- Proposed verification gate confirming no further sites exist post-closure (typically: registry-grep or substrate-coherence check that future regression cannot land silently)
- Any architectural questions raised by the inventory that require their own diagnostic or design work before closure can proceed

### Architectural observations

Free-form section for findings that are not site-specific but emerged from the inventory pattern. Examples:

- The trajectory pattern (three sequential narrowings discovered empirically) suggests a documentation gap: the platform has no boundary inventory itself, so per-boundary cleanup proceeds without coordination.
- The convertComponent finding's structural identity to the importer narrow-5 finding suggests the original Phase 1.5 cleanup was driven by file-grep matches rather than a path traversal — same defect copy-pasted at multiple locations was deleted at some, retained at others.
- The Coherence Question 5 finding (SCI integration) may reveal the registry's role as canonical declaration is realized at the bridge boundary but not at the SCI boundary itself — a higher-priority architectural question than the boundary fixes.

These observations are non-blocking for closure but are valuable for substrate-level documentation and future architectural decisions.

---

## Completion criteria

DIAG-019 is complete when:

1. Inventory table is populated for every site in the scoped directories per the qualification rules.
2. The five substrate coherence questions are answered with reference to the inventory.
3. The Audit Findings Report is filled in: findings summary, site count table, numbered findings (F-01, F-02, ...), closure scope recommendation, architectural observations.
4. All halt-and-surface conditions either did not trigger or were dispositioned by architect with the disposition recorded inline in the relevant inventory entry or coherence section.
5. No code edits, no commits, no remediation. Inventory + coherence assessment + audit findings report only.

After DIAG-019 closes, architect reads the audit findings report and dispositions closure scope per recommendation (a), (b), or (c). Closure work proceeds as a separate directive against a separate workstream identifier.

---

*DIAG-019 — Diagnostic only. No code changes. No data fixes. No commits to source files. The inventory artifact itself commits to the repo as architect-review substrate.*
