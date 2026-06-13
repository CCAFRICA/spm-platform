# INF-003: CAPABILITY GOVERNANCE OPERATIONALIZATION DIRECTIVE
**Date:** 2026-06-12 · supersedes the unnumbered draft of the same date (CC-1 through CC-8 dispositions applied)
**Category:** INF (Infrastructure / process substrate)
**Sequence number:** INF-003 — third document in the numbered INF series. Provenance: INF-001 (Dev/Prod Substrate Separation, B3) and INF-002 were both established in the 2026-06-10 session that instantiated the numbered series — INF-002 is defined but not yet executed (architect-attested 2026-06-12); sequence numbers never reuse, and "not yet run" does not release a number. Phase 0 performs a live collision check (verification, not assignment).
**Repo:** VP `CCAFRICA/spm-platform` (Phases 0–3) · VG `vialuce/vialuce-governance` at `~/vialuce-governance` (Phase 4)
**Branch:** `inf-003-capability-governance`
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11); repo-root-relative commands per standing convention (no fabricated absolute paths); prose matches implementation (DD-9).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout: Phase-0 read-before-build (Mandatory Interface Verification), Architecture Decision Gate, Anti-Pattern Registry check, commit+push after every change, kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report, git from the repo root (`spm-platform`, NOT `web/`), final `gh pr create --base main --head inf-003-capability-governance`. AP-25 not exercised (documentation/process substrate only — no application code). SR-34 (no bypass), SR-41 (revert discipline), Rules 25–28 (completion-report structure). Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**First action:** write this directive verbatim to `docs/vp-prompts/INF-003_CAPABILITY_GOVERNANCE_OPERATIONALIZATION_DIRECTIVE_20260612.md` and commit (`"INF-003: directive committed"`). Rationale for CC performing this dispatch step: the architect channel holds no git surface — SR-44 enumerates architect-only operations and directive-commit is not among them; Rule 4 requires the prompt committed to git. The file is the prompt; CC reads end-to-end and executes the phase prose. Nothing is summarized elsewhere; the directive ends at §6A.

**Channel boundary (binding):** CC creates and edits only the files named in this directive. CC does NOT edit the four governance expression surfaces (Capability Status Registry .md, Capability Status Board .html, Mission Control, R1 Exit Criteria) in this or any future work item — CC emits ARTIFACT SYNC deltas; the architect applies them. No ground-truth reconciliation values appear here (reconciliation-channel separation unaffected).

---

## §1 — PROBLEM STATEMENT

The substrate→work→artifact loop was ratified by the architect on 2026-06-12 but is uncodified. Three gaps:

1. **The ratified Standing Rule exists only in the architect channel.** The capability-governance skill mandates substrate consultation at work intake and artifact synchronization at SR-43 closure, but no repo artifact carries it; CC has no binding instruction to emit sync deltas.
2. **Completion reports carry no ARTIFACT SYNC contract.** Closure currently updates code and a report; the capability registry, status board, Mission Control, and R1 gate ledger drift until a manual sweep — the disconnected-expressions failure class `MISSION_CONTROL_LIVING_SYSTEM.md` diagnosed in Queue/Cycle/Pulse and resolved by treating them as one organism.
3. **The skill artifact has no canonical version-controlled home.** Accretion-without-examination is the documented EECI failure mode (IRA prompt assessment, 2026-04-18).

Defect-class lineage: expression-surface drift; accretion-without-examination; verification-by-proxy (closure without artifact sync is closure-by-assumption).

---

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

- **E/E/C/I tetrad (Tier 0):** operationalized at three altitudes — micro-EECI per work intake, full assessment per release, unit-count budgeting for IRA invocations (April-18 finding: Pass-2 output units, not input tokens, are the binding Efficiency axis; ~25% failure threshold near 55 units).
- **IGF v0.2 agent remits:** the loop binds to the existing four agents — IRA consults at intake, ICA captures at closure, IVA verifies claims, IMA owns the surface-maintenance cadence (EECI investigation area 11). **No fifth agent is created.** Phase 4 produces entry *drafts* only; substrate insertion follows IGF write protocol under architect authority.
- **T1-E902 v2 / T1-E910 v2:** cited within the skill text as governing entries; not modified here.
- **SR-43:** extended in effect, not amended — ARTIFACT SYNC becomes part of what a complete report contains; merge + production verification + report remain the closure tripod.
- **Rule-number derivation precedent:** the mechanism in Phase 0 follows the architect-endorsed pattern established 2026-06-10 (INF-001 / OB-202 rule additions): derive from the live file, highest + 1, report the assigned number — the project-knowledge copy is stale by definition.

---

## §3 — PHASE 0: VERIFICATION READS (READ-ONLY)

From the VP repo root:

**0a — INF collision check.** `ls docs/vp-prompts/ | grep -i "INF-"` — paste output. INF-001 and INF-002 may legitimately appear (both established 2026-06-10; INF-002 not yet executed). If any existing `INF-003` artifact appears, **HALT-1** (collision; architect re-sequences).

**0b — Standing-rule register read.** Enumerate both numbering registers in the live repo:
```bash
grep -rhoE "SR-[0-9]+" CC_STANDING_ARCHITECTURE_RULES.md docs/ --include="*.md" | sort -V | uniq -c
grep -rhoE "Rule[ -]?[0-9]+" CC_STANDING_ARCHITECTURE_RULES.md | sort -V | uniq -c
```
Paste both outputs. Identify the file location where SR-register entries (SR-34…SR-44 series) are recorded and the highest existing SR number. **The new rule's number = highest existing SR + 1.** Refer to it as **SR-{derived}** below and substitute the actual value at every write. If no repo file records the SR register (zero SR-pattern hits outside directive citations), **HALT-2** — the register location is architect-channel knowledge; report and stop.

---

## §3.1 — PHASE 1: COMMIT THE RATIFIED SKILL (VP)

Create `docs/governance/skills/vialuce-capability-governance/SKILL.md` (create directories as needed). Content: everything between the `===BEGIN-SKILL===` and `===END-SKILL===` sentinel lines below, exclusive of the sentinels, byte-for-byte, with exactly one substitution: the literal token `SR-DERIVED` becomes the Phase-0 derived number (e.g., `SR-45`).

===BEGIN-SKILL===
---
name: vialuce-capability-governance
description: Operates the closed loop between the Vialuce governance artifacts (Capability Status Registry .md, Capability Status Board .html, Mission Control, R1 Exit Criteria) and the IGF substrate. MUST be used whenever a work-item seed is pasted or formed (HF/OB/DIAG/AUD/DS/INF), whenever a CC completion report or SR-43 closure arrives, whenever CLT findings are triaged, whenever Mission Control / the board / the registry are edited or referenced, whenever capability status or "what does this block" is asked, and whenever an EECI assessment is requested. Trigger even on indirect phrasings like "log this", "update the board", "what governs this work", "did anything change after that PR", or "run the tetrad on this."
---

# Vialuce Capability Governance — the Living Loop

## The organism (one state, four expressions)

Per the Mission Control Living System principle ("one service with three views"), capability state is **one organism with four expressions**. None forks the others; each has a ledger-of-record role:

| Surface | Role of record | Never |
|---|---|---|
| `VIALUCE_CAPABILITY_STATUS_REGISTRY_RN.md` | Evidence + status taxonomy (L0–L4, ⚠/🔒) per Capability Map row | States status without an evidence line |
| `capability-status-board_RN.html` | Render: lanes, R1 tags, GOV substrate, seeds, exec SAY-TODAY | Forks MC item status — it cites MC# |
| Mission Control (vN) | Item ledger: every defect/build item, status, priority | Carries capability-level verdicts |
| `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` | Gate ledger (Tiers A–E) | Passes on substrate citation alone — empirical only |
| VG IGF substrate (igf schema) | The law: T0–T7 entries, Decisions, SRs, APs | Is edited from the VP channel |

Evidence standard everywhere: **browser-verified on production (SR-43)**. Unverified code is not shipped and never moves a status, a lane, or a SAY-TODAY line.

## INTAKE — when work is proposed (seed → directive)

A seed (copied from a board drawer or formed ad hoc) triggers this checklist, in order:

1. **Parse the seed.** Expected shape: `PREFIX — title / Cite: CLT·MC·refs / Class constraint / Gate hint / IGF substrate: …`. If the substrate line is missing, derive it before anything else.
2. **Substrate consult (mandatory).** (a) Read the board row's GOV chips. (b) For entries only nameable in VG (T1-E906 v2, T2-E06 v2, T2-E47, post-Wave-2 entries), have CC query the live substrate via the VG repo's scripts — VP-side psql is prohibited; VG uses psql+DATABASE_URL. (c) If the work is architectural (new invariant, cross-layer, supersession risk) → draft an **IRA invocation** instead of proceeding; honor the unit-count budget below.
3. **Micro-EECI on the proposed work** (one line each — the tetrad applied at intake, not the full assessment):
   - **Efficiency** — is this the minimal general invariant, not an enumerated-shape patch? (AUD-009 test)
   - **Efficacy** — if shipped, does the row's WHEN-COMPLETE statement become literally true in a browser?
   - **Comprehensive** — were substrate + CLT registry + MC + R1 criteria all consulted? Name what each contributed.
   - **Innovate** — does it advance a flywheel/principle (Progressive Performance, Synaptic Surface, Korean Test) or merely restore parity?
4. **Standing protocol.** Sequence number read from the repo directory (never memory). CRF+PCD visible checklist. Draft per `INF_Structured_Compliant_Drafting_Reference` (§0–§6A, file IS the prompt, standing rules cited in §0, evidentiary gates, HALT conditions).
5. **Cross-link forward.** The directive's §0 cites: board row id, MC#s, R1 criteria, lane. This is what lets CLOSURE be mechanical.

**IRA unit-count budget (April-18 EECI lesson):** broad invocations fail at the Pass-2 output-unit threshold (~25% failure above ~55 units), not at input tokens. Budget `questions × options × axes × contracts`; split into passes when the product approaches the bound. Efficiency in EECI for invocations = output units first, tokens second.

## CLOSURE — when development completes (SR-43 → artifact sync)

On a CC completion report (merge + production verification + report with SHA):

1. **Demand the ARTIFACT SYNC block** (CC emits deltas; CC never edits governance artifacts — channel separation):

```
ARTIFACT SYNC
MC: [item #id → status change; new items discovered, each with source citation]
REGISTRY: [capability row → evidence to add / efforts to retire / proposed L-level change]
R1: [exit criterion → status evidence]
BOARD: [capability data deltas: now / gap / evidence / efforts / flags / lane]
SUBSTRATE: [IGF entries exercised; candidate captures for ICA]
```

2. **Architect applies, with ratchets:**
   - L-level changes require a pasted-evidence line; ⚠/🔒 flags clear only on browser proof.
   - **Exec SAY-TODAY is a one-way ratchet** — claim language strengthens only on production-verified evidence; never from designs, merges, or localhost.
   - Lanes re-derive from R1: if a gate criterion flips, every row tagged with it re-evaluates.
   - Board revision bumps (R5, R6…); registry status edits are inline to R1 unless taxonomy changes.
3. **Capture upward (ICA-pattern).** New invariants, principles exercised in new ways, or drift observed → log as VG capture candidates; never silently fold into prose.
4. **MC discipline.** New items discovered during work enter MC immediately with source citation; the board references them next render. MC remains the only place an item's status lives.

## CADENCE — EECI as the audit instrument

- **Per release (alpha.X):** full E/E/C/I assessment of the four surfaces — Efficiency (each surface still minimal for its role, no duplicated ledgers), Efficacy (each still changes decisions — name the last decision it changed), Comprehensive (MC↔board↔registry↔R1 cross-references intact; staleness deltas listed), Innovate (what should each surface do next that it cannot today). Output: a short assessment note + sync edits.
- **Ownership:** architect-triggered now; transfers to **IMA** when online (IGF investigation area 11). This skill is the architect-channel mirror of that IMA maintenance contract until then.
- **Per MC sweep (vN):** apply staleness deltas, add registry/board-discovered items, verify every board MC# resolves.

## Guardrails (always)

- No invented sequence numbers; no enumerated-shape fixes (one invariant per layer); no status from self-attestation; reconciliation-channel separation holds (GT values never enter CC directives).
- The board/registry never soften a NOT-MET gate for presentation; the Executive view inherits truth from the Architect view, never the reverse.
- This skill does not create a fifth IGF agent. The loop binds to the existing four: **IRA** consults at intake, **ICA** captures at closure, **IMA** owns the cadence, **IVA** verifies claims — the four surfaces are registered expression surfaces under their remit.

## Adoption (RATIFIED 2026-06-12)

- **Status: RATIFIED by architect 2026-06-12. Operative in the architect channel immediately.** Codified as Standing Rule SR-DERIVED (number derived from the live registry at INF-003 Phase 0 per the 2026-06-10 derivation mechanism; recorded in the INF-003 completion report).
- Canonical repo home: `docs/governance/skills/vialuce-capability-governance/SKILL.md` (VP). Architect-side installs: project knowledge (claude.ai) and `/mnt/skills/user/vialuce-capability-governance/` (Cowork / Claude Code).
- The ARTIFACT SYNC section is codified into the CC completion-report contract via `CC_STANDING_ARCHITECTURE_RULES.md` (SR-DERIVED, clause 1).
===END-SKILL===

Evidentiary gate (paste all, from repo root):
```bash
wc -l docs/governance/skills/vialuce-capability-governance/SKILL.md && head -8 docs/governance/skills/vialuce-capability-governance/SKILL.md && grep -c "SR-DERIVED" docs/governance/skills/vialuce-capability-governance/SKILL.md && grep -n "RATIFIED 2026-06-12" docs/governance/skills/vialuce-capability-governance/SKILL.md
```
The `SR-DERIVED` count must be **0** (token substituted everywhere); the ratification line must appear. Commit: `"INF-003 Phase 1: capability-governance skill — ratified canonical copy"`.

---

## §3.2 — PHASE 2: CODIFY SR-{derived} INTO CC_STANDING_ARCHITECTURE_RULES.md (VP)

Append the following block verbatim (single source — Phase 3 references it, never restates it) adjacent to the highest existing SR-register entry located in Phase 0b, substituting the derived number for `SR-{derived}`. **Concurrency guard:** immediately before this append, re-run the Phase 0b SR enumeration against the current working tree; the number derives at write time, not read time. If the highest SR changed since Phase 0b (a concurrent work item landed a rule), re-derive as new-highest + 1 and report both enumerations in the completion report.

```
## SR-{derived} — Capability-Governance Loop (Artifact Sync) — RATIFIED 2026-06-12

1. Every completion report for every work item (HF/OB/SD/INF/DIAG/AUD) MUST end with an
   ARTIFACT SYNC section in exactly this shape. Empty categories state "none".

   ARTIFACT SYNC
   MC: [item #id → status change; new items discovered, each with source citation]
   REGISTRY: [capability row → evidence to add / efforts to retire / proposed L-level change]
   R1: [exit criterion → status evidence]
   BOARD: [capability data deltas: now / gap / evidence / efforts / flags / lane]
   SUBSTRATE: [IGF entries exercised; candidate captures for ICA]

2. CC emits these deltas; CC NEVER edits the governance expression surfaces themselves
   (Capability Status Registry, Capability Status Board, Mission Control, R1 Exit
   Criteria). The architect applies deltas in the architect channel.

3. Proposed L-level or gate-status changes are accompanied by pasted production
   evidence (SR-43 standard). Self-attestation is not a delta.

4. Directive intake reciprocal: every directive's §0 cites the capability row, MC#s,
   R1 criteria, and governing IGF substrate entries it serves, enabling mechanical
   sync at closure. Reference: docs/governance/skills/vialuce-capability-governance/SKILL.md.
```

Evidentiary gate (paste): `grep -n "Capability-Governance Loop" CC_STANDING_ARCHITECTURE_RULES.md` plus the full appended block via `sed -n` over its line range. **HALT-3:** if any existing rule text conflicts with clause 2 (e.g., a rule instructing CC to edit MC or the registry), stop and report the conflict verbatim — no unilateral reconciliation (SR-42 pattern). Commit: `"INF-003 Phase 2: SR-{derived} capability-governance loop codified"` (actual number in the message).

---

## §3.3 — PHASE 3: COMPLETION-REPORT TEMPLATE (VP, CONDITIONAL)

Read-first, from repo root:
```bash
ls docs/completion-reports/ | head -20 && grep -rln "COMPLETION REPORT TEMPLATE\|completion-report template" docs/ CC_STANDING_ARCHITECTURE_RULES.md
```
- **IF** a template file exists: append a final section `## ARTIFACT SYNC (mandatory — per SR-{derived})` containing one line: `See SR-{derived} in CC_STANDING_ARCHITECTURE_RULES.md for the required shape.` (Reference, not restatement — no duplication drift surface.)
- **ELSE**: no action; SR-{derived} clause 1 already binds via the standing rules and Rules 25–28 govern structure. State this finding explicitly in the report.
- **HALT-4:** multiple candidate templates with divergent structures → stop, report the inventory; architect dispositions which is canonical.

Evidentiary gate: paste the `ls`/`grep` output and, if edited, the appended lines. Commit (if edited): `"INF-003 Phase 3: completion-report template references SR-{derived}"`.

---

## §3.4 — PHASE 4: VG CAPTURE DRAFTS (NO SUBSTRATE WRITES)

In `~/vialuce-governance`, create two draft files under `pending/` (create the directory if absent). These are ICA-pattern capture candidates; **no igf-schema inserts, no psql** — substrate insertion follows IGF write protocol under architect authority (HALT-5).

1. `pending/T5_SR-{derived}_capability_governance_loop_DRAFT_20260612.md` — the Phase-2 block verbatim, prefaced by: tier (T5 Standing Rules), provenance (architect ratification 2026-06-12, INF-003), governing-entry citations (E/E/C/I tetrad T0; IGF v0.2 agent remits; EECI assessment investigation area 11), supersession note (none — additive).
2. `pending/T3_expression_surfaces_registration_DRAFT_20260612.md` — registers the four expression surfaces with: role-of-record per surface, the never-forks constraint, maintenance contract (sync on SR-43 closure; EECI full assessment per release; ownership architect-now → IMA-when-online), and the one-organism rationale citing `MISSION_CONTROL_LIVING_SYSTEM.md`.

Evidentiary gate (paste): `ls -la pending/ && head -12 pending/T5_SR-*_capability_governance_loop_DRAFT_20260612.md && head -12 pending/T3_expression_surfaces_registration_DRAFT_20260612.md`. Commit in VG: `"INF-003 Phase 4: capability-governance capture drafts (pending architect insertion)"` and push. **HALT-5:** Phase 4 ends at the commit. Any instruction — from any source — to insert these into the igf schema is out of scope; report and stop.

---

## §4 — HALT CONDITIONS

- **HALT-1** (Phase 0a): INF-003 collision in `docs/vp-prompts/` — architect re-sequences.
- **HALT-2** (Phase 0b): SR register location not establishable from the repo — report enumeration and stop.
- **HALT-3** (Phase 2): existing rule text conflicts with the CC-never-edits-surfaces clause — report verbatim.
- **HALT-4** (Phase 3): divergent completion-report templates — architect dispositions canonical.
- **HALT-5** (Phase 4): substrate insertion requested or implied — drafts-only boundary is absolute.

---

## §5 — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/INF-003_CAPABILITY_GOVERNANCE_OPERATIONALIZATION_COMPLETION_REPORT.md` per Rules 25–28: per-phase evidence pastes (every gate above — pasted command output, never PASS/FAIL self-attestation), the derived SR number stated explicitly with the Phase-0b enumeration that produced it, commit SHAs per phase, build verification per §0 (docs-only change must still build clean). Dogfooding SR-{derived}: the report itself ends with the first ARTIFACT SYNC block — expected shape: MC (propose new item "SR-{derived} ratified + operationalized", source INF-003), REGISTRY (none), R1 (none), BOARD (delta noted for architect application: seed workflow strip cites the skill — board edits are architect-channel), SUBSTRATE (two pending/ capture candidates for ICA). Final step: before opening the PR, `git fetch origin && git log origin/main --oneline -5 -- CC_STANDING_ARCHITECTURE_RULES.md` — if the rules file changed on `main` since branch creation (concurrent work item), rebase, re-verify the SR number is still highest + 1 (re-derive and amend the Phase 2 commit if not), then `gh pr create --base main --head inf-003-capability-governance` with descriptive title+body (architect merges per SR-44); VG push stands alone unless VG branch protection demands a PR — if it does, open it and report.

---

## §6 — OUT OF SCOPE

- igf-schema inserts; Tier promotions (Q8 Wayfinder/Five-Layers); Wave-2 promotions (T2-E09/E30).
- Mission Control v9 sweep (Q7) and any edit to the four expression surfaces.
- claude.ai / Cowork skill installation (architect-side adoption).
- The VG-side AUD cross-mapping substrate entries E906/T2-E06/T2-E47 to capability rows.
- Any application code, schema, or RLS change.

---

## §6A — RESIDUALS

- The derived SR number is execution-time knowledge until the completion report lands; the architect records it back into the board/registry on sync (first live exercise of the loop).
- VG insertion of the two pending/ drafts pends architect execution under IGF protocol; until inserted, the rule's substrate expression is draft-state (named gap, not silent).
- EECI cadence ownership remains architect-triggered; transfers to IMA when online — no automation is claimed by this INF.
- Substrate cross-map AUD (E906/T2-E06/T2-E47, post-Wave-2 entries) remains an available seed; natural dispatch window is alongside Wave-2 promotion work.
- First post-merge completion report on any subsequent work item is the live acceptance test of SR-{derived}.
