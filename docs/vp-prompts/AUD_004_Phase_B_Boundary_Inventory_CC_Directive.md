# CC DIRECTIVE — AUD-004 Phase B: Boundary Inventory

**Repo:** `CCAFRICA/spm-platform`
**Substrate:** `origin/main` HEAD `6bc005e6...` (post-CLN-001, post-DIAG-024)
**Branch:** `dev`
**Output file:** `docs/audits/AUD_004_Phase_B_Boundary_Inventory.md`
**Mode:** READ-ONLY inventory. No source-code modifications. No SQL. No schema changes.
**Scope authority:** AUD-004 Remediation Design Document v3 §9 Deliverable 1 + §2 code-path enumeration.
**Estimated time:** 1–2 hours.

---

## STANDING RULES IN EFFECT

Read `CC_STANDING_ARCHITECTURE_RULES.md` (v3.0) before starting. Rules applying to this directive:

- **Rule 6** — git from repo root (`spm-platform`), NOT `web/`.
- **Rule 27** — evidence means PASTE (grep output, file path + line range, code excerpt). Not description.
- **Rule 28** — one commit per phase; no collapsing.
- **Rule 29** — this directive committed to git in Phase 0.
- **Rule 51v2** — at end of sweep, `git stash && npx tsc --noEmit && npx next lint && git stash pop` from `web/` to confirm zero regressions on committed code.
- **Korean Test (AP-25 / Decision 154)** — every boundary inventory row evaluated against the structural form: *if a new structural primitive appeared, would this boundary still work?*
- **Decision 155** — canonical declaration is a SURFACE (registry), not a string. Inventory rows distinguish private-copy-of-vocabulary from registry-derived behavior.
- **SR-34 (No Bypass)** — if a boundary cannot be classified against the schema below, surface as `OUT_OF_SCHEMA`. Do not invent a category.

---

## OBJECTIVE

Produce a complete inventory of every dispatch boundary, switch, and vocabulary-naming surface in the platform substrate. Single-source artifact that grounds Deliverable 2 (Mechanism Specification) and Deliverable 3 (Vertical Slice CC Directive).

The inventory must:

1. Cover every code path named in AUD-004 v3 §2 for E1–E6.
2. Map every audit finding (F-001…F-012) onto specific boundary rows so closure is traceable.
3. Surface boundaries the audit's twelve findings missed (Limiting Factor L7).
4. Be readable as a checklist — Deliverable 3 returns to this inventory and checks off boundaries as the dispatch-surface refactor lands.

---

## SCOPE — CODE PATHS TO SWEEP

### E1 — Canonical declaration surface

- `web/src/lib/calculation/intent-types.ts` — union of operation types.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — plan-agent system prompt + user prompt builder.
- `web/src/lib/compensation/ai-plan-interpreter.ts` — `convertComponent`, `normalizeComponentType`, `normalizeCalculationMethod`.
- `web/src/lib/calculation/intent-executor.ts` — executor switch.
- `web/src/lib/calculation/run-calculation.ts` — legacy switch.

### E2 — Dispatch surface integrity

- `web/src/lib/calculation/intent-executor.ts:438-450` — executor switch (F-002 cascade origin).
- `web/src/lib/calculation/intent-executor.ts:61-140` — `resolveSource` (F-002b).
- `web/src/lib/calculation/intent-executor.ts:591-603` — `noMatchBehavior` switch (F-002c, F-002d).
- `web/src/lib/calculation/run-calculation.ts:362-408` — legacy switch (F-003).
- `web/src/lib/compensation/ai-plan-interpreter.ts:681-708` — `convertComponent` default (F-004).
- `web/src/app/api/calculate/run/route.ts:61` — POST function.

### E3 — Read-before-derive obligation (signal surface)

- `web/src/lib/intelligence/convergence-service.ts` (~1,751 lines).
- `web/src/app/api/calculate/run/route.ts:1840-1862` — `training:dual_path_concordance` write (F-011).
- `web/supabase/migrations/` — `classification_signals` table schema (read-only schema inspection).

### E4 — Round-trip closure

- `web/src/lib/compensation/ai-plan-interpreter.ts:667-679` — `convertComponent` 5-tuple.
- `web/src/lib/calculation/intent-transformer.ts` — `transformFromMetadata`.
- All `metadata.intent` consumers.

### E5 — Convergence ↔ plan-agent comprehension

- `web/src/lib/intelligence/convergence-service.ts` — Pass 4 AI semantic derivation.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — plan-agent comprehension generation.
- `classification_signals` schema — L2 Comprehension signal write surface.

### E6 — Korean Test extended

Every code path E1, E2, E4 touches. Plus any additional boundary surfaced during sweep that names primitives by string literal.

### Beyond §2 — L7 widening

Sweep these directories in full and identify any dispatch boundary not already named above:

- `web/src/lib/calculation/`
- `web/src/lib/compensation/`
- `web/src/lib/intelligence/`
- `web/src/lib/sci/`
- `web/src/lib/ai/`
- `web/src/lib/domain/`
- `web/src/lib/forensics/`
- `web/src/lib/reconciliation/`
- `web/src/app/api/calculate/`
- `web/src/app/api/import/sci/`

**A "dispatch boundary" is any code site that:**

- has a `switch` statement on a primitive identifier, or
- has an `if/else` chain selecting behavior by string-typed identifier, or
- has a `Record<...>`/`Map<...>` keyed by primitive identifier with behavior values, or
- emits a primitive identifier into persistence (DB write, signal write, JSONB write), or
- consumes a primitive identifier from persistence (DB read, signal read, JSONB read), or
- declares a TypeScript union, enum, or const-array of primitive identifiers, or
- contains a string literal of a known primitive identifier (`linear_function`, `piecewise_linear`, `tiered_lookup`, `tier_lookup`, `conditional_gate`, `scope_aggregate`, `scalar_multiply`, `ratio`, `aggregate`, `constant`, `bounded_lookup_1d`, `bounded_lookup_2d`, `weighted_blend`, `temporal_window`, `conditional_percentage`).

---

## INVENTORY SCHEMA — one row per boundary

| Column | Description |
|---|---|
| `BID` | Boundary ID. Sequential `B-001`, `B-002`, … in sweep order. |
| `File` | Repo-root-relative path. |
| `Line range` | Start–end line numbers. |
| `Boundary kind` | One of: `union_decl`, `enum_decl`, `const_array_decl`, `switch`, `if_chain`, `record_keyed`, `map_keyed`, `prompt_literal`, `string_literal`, `db_write`, `db_read`, `signal_write`, `signal_read`, `jsonb_write`, `jsonb_read`, `OUT_OF_SCHEMA`. |
| `Vocabulary used` | Comma-separated primitive identifiers named at this boundary. If the boundary names ALL primitives by reference to a declaration, write `derives from <decl path>`. |
| `Dispatch form` | Free-text description of how the boundary uses the vocabulary. |
| `No-match behavior` | One of: `throws`, `returns_undefined`, `returns_zero`, `silent_fallback_to_<X>`, `silent_skip`, `not_applicable`, `unknown_requires_inspection`. |
| `Current writers` | Code paths that write to this boundary (for read boundaries) / call sites (for declaration/switch boundaries). |
| `Current readers` | Code paths that read from this boundary (for write boundaries) / call sites (for declaration/switch boundaries). |
| `Audit findings (F-NNN)` | Comma-separated F-finding IDs from AUD-004 mapping to this boundary. Empty if none. |
| `Extension closure (E1–E6)` | Comma-separated extensions from AUD-004 v3 §2 affecting this boundary. |
| `Korean Test verdict` | One of: `PASS`, `FAIL`, `EXEMPT_DOMAIN_AGENT_PROMPT`, `INSPECT`. |
| `Decision 155 surface compliance` | One of: `derives_from_registry`, `private_copy_of_registry`, `not_applicable`, `inspect`. |
| `Notes` | Anything not fitting above. |

---

## PHASES

### Phase 0 — Branch + scaffold

```
git checkout dev
git pull origin dev
mkdir -p docs/audits
```

Commit this directive to git per Rule 29:
```
git add <directive-path>
git commit -m "Phase 0 — AUD-004 Phase B directive committed (Rule 29)"
```

Create `docs/audits/AUD_004_Phase_B_Boundary_Inventory.md` skeleton:

```markdown
# AUD-004 Phase B — Boundary Inventory

**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...`
**Sweep date:** YYYY-MM-DD
**Mode:** READ-ONLY (no source-code changes)
**Scope:** AUD-004 v3 §2 + widened sweep per §9 Deliverable 1
**Produced by:** AUD-004 Phase B CC Directive

## 1. Method
## 2. Boundary inventory table
## 3. Audit-finding closure map (F-001…F-012 → BID)
## 4. Boundaries beyond §2 (L7 widening)
## 5. Korean Test compliance summary
## 6. Decision 155 registry-derivation summary
## 7. Open questions for Deliverable 2
## 8. Sweep evidence (commands run, file counts, grep outputs)
```

Commit: `Phase 0 — Phase B inventory scaffold`

### Phase 1 — §2 sweep, E1 boundaries

For each E1 file, identify every boundary matching the schema's `Boundary kind` definitions. Inventory ALL boundaries in the file regardless of which extension they relate to (one file may host E1 + E2 + E4 boundaries).

Evidence to paste in §8:
- For each file: `grep -n -E '(linear_function|piecewise_linear|tiered_lookup|tier_lookup|conditional_gate|scope_aggregate|scalar_multiply|ratio|aggregate|constant|bounded_lookup_1d|bounded_lookup_2d|weighted_blend|temporal_window|conditional_percentage)' <file>`.
- For each row: 3–10 lines of code excerpt surrounding the boundary.

Commit: `Phase 1 — E1 code-path boundaries`

### Phase 2 — §2 sweep, E2 boundaries

E2 boundaries are predominantly `switch` and `if_chain` on `op.type` / `intent.operation`. Pay attention to `noMatchBehavior` semantics and any silent fallback to `tier_lookup`.

Evidence:
- `noMatchBehavior` switch verbatim with line numbers.
- Executor's primary dispatch switch verbatim.
- `convertComponent` default branch verbatim.

Commit: `Phase 2 — E2 code-path boundaries`

### Phase 3 — §2 sweep, E3 boundaries

For convergence-service.ts and the calculate/run route's signal writes, inventory every signal-write and signal-read site. Per site:

- The `signal_type` literal written or read.
- Whether the signal has a defined reader (search codebase for matching reads).
- Any L1/L2/L3 level designation.

For `web/supabase/migrations/`, identify the migration file(s) defining `classification_signals` and paste the CREATE TABLE / ALTER TABLE statements (read-only).

Commit: `Phase 3 — E3 signal-surface boundaries`

### Phase 4 — §2 sweep, E4 boundaries

`grep -rn 'metadata\.intent' web/src` — every read site is a boundary. `grep -rn 'metadata: { intent' web/src` and `metadata:.*intent` patterns — every write site is a boundary. Also sweep `convertComponent` 5-tuple (lines 667-679) and `transformFromMetadata`.

Per boundary: does the site preserve every primitive identifier from its source, or project / discard?

Commit: `Phase 4 — E4 round-trip boundaries`

### Phase 5 — §2 sweep, E5 boundaries

Re-visit convergence-service.ts and anthropic-adapter.ts with E5's lens:

- Where does plan-agent comprehension exit anthropic-adapter.ts?
- Where does convergence-service.ts read context before invoking AI semantic derivation?
- For each AI call in convergence, list what context it reads from `classification_signals` (if any) before the call.

Flag explicitly: signals written but never read back.

Commit: `Phase 5 — E5 convergence ↔ plan-agent boundaries`

### Phase 6 — Korean Test verdict pass (E6)

Re-walk every boundary inventoried in Phases 1–5 and assign `Korean Test verdict`:

- `PASS` — boundary references the canonical declaration without naming primitives by string.
- `FAIL` — boundary maintains a private copy OR uses string literals to dispatch / validate / document.
- `EXEMPT_DOMAIN_AGENT_PROMPT` — Domain Agent translation surface ONLY (per Decision 154's narrow exemption; do not extend to plan-agent prompt).
- `INSPECT` — verdict requires architect disposition.

Also assign `Decision 155 surface compliance`:

- `derives_from_registry` — boundary reads from a single canonical source.
- `private_copy_of_registry` — boundary maintains its own copy of vocabulary.
- `not_applicable` — boundary doesn't reference vocabulary in a way Decision 155 governs.
- `inspect` — verdict requires architect disposition.

Commit: `Phase 6 — Korean Test + Decision 155 verdicts`

### Phase 7 — Widened sweep (L7)

Run the directory-wide sweep in "Beyond §2" above. For each `.ts` file, grep for primitive identifiers and switch/if patterns. Add new boundary rows for anything not already inventoried.

Evidence:
- `find` command output enumerating files swept.
- For each newly-discovered boundary: same evidence as Phase 1.
- End of phase: summary count — Section 2 boundaries vs. newly surfaced.

Commit: `Phase 7 — Widened sweep beyond §2`

### Phase 8 — Audit finding closure map

Produce §3 of the output file: table mapping every F-finding (F-001…F-012) to one or more BIDs. If any F-finding cannot be mapped to a BID, surface as an open question for Deliverable 2 (do not invent a mapping).

Per AUD-004 v3 §2 closure map:
- F-001 → E1 + E4 boundaries
- F-002 / F-002b / F-002c / F-002d → E2 boundaries
- F-003 → E2 boundaries (legacy switch)
- F-004 → E2 boundaries (`convertComponent` default)
- F-005 → E1 boundaries (six declaration sites)
- F-006 → E3 + E5 boundaries
- F-007 → E1 boundaries (tier_lookup ↔ tiered_lookup)
- F-008 → E4 boundaries (weighted_blend / temporal_window unreachable)
- F-009 → E2 boundaries
- F-010 → out of structural scope; record as `OUT_OF_SCOPE_PER_DESIGN_V3`
- F-011 → E3 boundaries
- F-012 → reference pattern (positive control); record as `Korean Test verdict = PASS` reference

Commit: `Phase 8 — Audit finding closure map`

### Phase 9 — Korean Test + Decision 155 summaries

§5 (Korean Test summary): total boundary count, count by verdict (PASS / FAIL / EXEMPT / INSPECT), top 10 FAIL boundaries by criticality (mapped F-findings as priority signal).

§6 (Decision 155 summary): total boundary count, count by compliance (derives_from_registry / private_copy_of_registry / not_applicable / inspect), top 10 private-copy boundaries.

Commit: `Phase 9 — Korean Test + Decision 155 summaries`

### Phase 10 — Open questions for Deliverable 2

§7 of the output file. Surface every question the inventory raised that Mechanism Specification must resolve. Each question references at least one BID.

Commit: `Phase 10 — Open questions for Mechanism Specification`

### Phase 11 — Compliance gates

From `web/`:
```
git stash
npx tsc --noEmit 2>&1 | tee /tmp/tsc.out
npx next lint 2>&1 | tee /tmp/lint.out
git stash pop
```

Paste both outputs into §8.

From repo root:
```
git status
git log --oneline origin/main..HEAD
```

Paste outputs into §8.

Commit: `Phase 11 — Compliance gate evidence`

### Phase 12 — Push and PR

```
git push origin dev
gh pr create --base main --head dev \
  --title "AUD-004 Phase B — Boundary Inventory (read-only)" \
  --body "Implements AUD-004 Remediation Design Document v3 §9 Deliverable 1.

Read-only sweep of every dispatch / vocabulary-naming boundary in the platform substrate. Produces docs/audits/AUD_004_Phase_B_Boundary_Inventory.md.

Closes audit-finding-to-boundary mapping for F-001…F-012 per AUD-004 v3 §2.
Surfaces boundaries beyond §2 (L7 widening).

No source code modifications. Compliance gates (Rule 51v2) PASS on committed code.

Companion deliverables (separate work items):
- Deliverable 2: Mechanism Specification
- Deliverable 3: Vertical Slice CC Directive(s)
"
```

Paste PR URL into completion report.

---

## COMPLETION REPORT (Rule 25–28)

Create `AUD_004_PHASE_B_COMPLETION_REPORT.md` in repo root BEFORE Phase 11. Required structure:

```markdown
# AUD-004 PHASE B — BOUNDARY INVENTORY COMPLETION REPORT
## Date: YYYY-MM-DD
## Execution time: HH:MM

## COMMITS (in order)
| Hash | Phase | Description |
| ... | 0 | Phase B inventory scaffold |
| ... | 1 | E1 code-path boundaries |
| ... | 2 | E2 code-path boundaries |
| ... | 3 | E3 signal-surface boundaries |
| ... | 4 | E4 round-trip boundaries |
| ... | 5 | E5 convergence ↔ plan-agent boundaries |
| ... | 6 | Korean Test + Decision 155 verdicts |
| ... | 7 | Widened sweep beyond §2 |
| ... | 8 | Audit finding closure map |
| ... | 9 | Korean Test + Decision 155 summaries |
| ... | 10 | Open questions for Mechanism Specification |
| ... | 11 | Compliance gate evidence |

## FILES CREATED
| File | Purpose |
| docs/audits/AUD_004_Phase_B_Boundary_Inventory.md | Phase B inventory |
| AUD_004_PHASE_B_COMPLETION_REPORT.md | This report |

## FILES MODIFIED
(none — read-only sweep)

## PROOF GATES — HARD
| # | Criterion | PASS/FAIL | Evidence |
| 1 | All §2 code paths swept; every boundary in schema's Boundary-kind taxonomy has ≥1 inventory row | PASS / FAIL | <paste boundary count by file with grep evidence> |
| 2 | F-001…F-012 each map to ≥1 BID (F-010 marked OUT_OF_SCOPE_PER_DESIGN_V3) | PASS / FAIL | <paste §3 closure map verbatim> |
| 3 | Widened sweep (L7) executed across all directories listed in "Beyond §2" | PASS / FAIL | <paste find command output + new boundary count> |
| 4 | Korean Test verdict assigned to every boundary | PASS / FAIL | <paste verdict count> |
| 5 | Decision 155 compliance assigned to every boundary | PASS / FAIL | <paste compliance count> |
| 6 | Compliance gates (Rule 51v2) PASS on committed code | PASS / FAIL | <paste tsc + lint output> |
| 7 | No source-code modifications introduced | PASS / FAIL | <paste git diff origin/main..HEAD -- 'web/src/**/*.ts' showing zero source-code changes> |
| 8 | PR opened against main from dev | PASS / FAIL | <paste PR URL> |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
| 1 | ≥1 boundary surfaced beyond F-001…F-012 closure map | PASS / FAIL | <paste BIDs of newly-discovered boundaries> |
| 2 | Open questions reference ≥1 BID each | PASS / FAIL | <paste §7 verbatim> |

## STANDING RULE COMPLIANCE
- Rule 6 (git from repo root): PASS
- Rule 27 (paste evidence): PASS
- Rule 28 (one commit per phase): PASS
- Rule 29 (directive committed in Phase 0): PASS
- Rule 51v2 (tsc + lint + stash): PASS — see Hard Gate 6

## KNOWN ISSUES
<list>

## VERIFICATION SCRIPT OUTPUT
<paste>
```

Commit before Phase 11: `Completion report scaffold`. APPEND build evidence in Phase 11 commit.

---

## OUT-OF-SCOPE

Belongs to Deliverable 2 or 3, NOT Phase B:

- Designing the registry mechanism.
- Migrating `classification_signals`.
- Refactoring any switch / dispatch / convertComponent / convergence code.
- Reconstructing CRP $566,728.97 substrate.
- Reconciliation gate test execution.
- IGF amendments to T1-E910, T1-E902, T1-E906 (`vialuce-governance` work).

If during the sweep you find yourself drafting a fix or mechanism — stop. Capture as open question (§7).

---

## ESCALATION

Stop and request architect disposition if:

1. §2 line ranges do not match committed code at HEAD `6bc005e6...` (substrate drift).
2. A boundary cannot be classified against the schema and `OUT_OF_SCHEMA` does not capture it cleanly.
3. Widened sweep surfaces > 50 newly-discovered boundaries beyond §2.
4. Compliance gates (Rule 51v2) FAIL on committed code (HEAD itself doesn't compile / lint clean).

Paste exact evidence to architect channel; do NOT proceed with workarounds (SR-34).

---

*AUD-004 Phase B CC Directive · Deliverable 1 of 3 · Substrate `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...` · E1–E6 + Decision 154 + Decision 155 LOCKED 2026-04-27*
