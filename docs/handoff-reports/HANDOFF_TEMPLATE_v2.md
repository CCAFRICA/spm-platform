# HANDOFF_TEMPLATE_v2.md

**Purpose:** canonical structure for every vialuce session handoff (both VP and VG). Supersedes `HANDOFF_TEMPLATE.md` v1.0 (governance 20-section, April 11, 2026) and legacy `HANDOFF_REQUEST_TEMPLATE.md` (VP 18-section, February 2026). Every session handoff produced for this project uses this template as its base. Corrections to this template live in `HANDOFF_TEMPLATE_CORRECTIONS.md` (append-only) and MUST be applied at drafting time.

**Version:** 2.0 (April 22, 2026 — synthesizes best of governance + VP templates with Corrections 1-21 applied)

**Pairs with:**
- `SESSION_CLOSING_REPORT_TEMPLATE.md` v1.0 (provenance archive; pair artifact)
- `CLOSING_PROMPT.md` v1.1 (drafting mechanism)
- `HANDOFF_TEMPLATE_CORRECTIONS.md` (append-only correction layer)
- `HANDOFF_DISCIPLINE_DIRECTIVE.md` (drafter discipline)
- `IRA_INVOCATION_REFERENCE.md` (IRA reference, repo only)

---

## INVARIANTS

1. **Twenty-one sections total:** Vocabulary Appendix (pre-Section-0) + Sections 0 through 20
2. **Section 0:** always five critical orientation facts, maximum, no narrative
3. **Section 19:** always the next session start script with explicit execution locus for every action
4. **Section 20:** always the forward-path detail with single recommendation across paths
5. **Vocabulary Appendix:** defined terms first, session-specific terminology if any (Correction 7)
6. **Footer block required** with session summary and forward state
7. **Closing Report pairing:** every handoff pairs with a Closing Report; the handoff references the Closing Report for full provenance, the Closing Report references the handoff for open items
8. **Load-bearing anchors in Section 0:** when a session produces defect patterns or architectural conclusions the next session must not lose, Section 0 includes explicit anchors to Closing Report sections (Correction 21)
9. **Template is the floor, not the ceiling:** sections can be longer than the template minimum when the session justifies it; sections cannot be shorter than the template minimum
10. **Governing over legacy:** this template supersedes both prior templates; on any content conflict, this template wins

---

## HEADER BLOCK (required)

```
# {VP or GOVERNANCE} SESSION HANDOFF — {Session date}

**Session window:** {date}, approximately {duration} of continuous work.
**Primary outcome:** {one sentence describing the biggest deliverable or state change}
**Companion Closing Report:** SESSION_CLOSING_REPORT_{YYYYMMDD}.md
**Reader orientation:** Read Vocabulary Appendix first, then Sections 0, 19, 20. Rest fills in detail.
This handoff is intentionally dense — paste it into the opening directive of the next conversation
per HANDOFF_DISCIPLINE_DIRECTIVE.md and Correction 4 workflow.
```

---

## VOCABULARY APPENDIX (pre-Section-0)

**Purpose:** defined terms the next session needs to understand the handoff. Session-specific terminology goes here if any was introduced this session.

**Standard entries (carry-forward across sessions):**
- **VP** — vialuce Platform (main product repo `CCAFRICA/spm-platform`)
- **VG** — vialuce Governance (governance framework repo `vialuce/governance`)
- **CC** — Claude Code (autonomous implementation agent; terminal-based)
- **IGF** — Intelligence Governance Framework
- **IRA / ICA / IVA / IMA** — IGF agents (Resolution / Capture / Verification / Maintenance)
- **HF** — Hot Fix (scoped remediation work)
- **OB** — Ops Brief (larger scoped implementation work)
- **DS** — Design Specification
- **CLT** — Complete Lifecycle Test
- **SCI** — Synaptic Content Ingestion
- **CRF / PCD / EFG / DG** — invocation protocols (Consistent Reasoning Framework / Pre-response Compliance Directive / Experience-First Gate / Design Gate)
- **CWA** — Citation Without Application (defect class: Premise / Schema / Parent / Durability / Indirection)
- **EECI** — Efficiency / Efficacy / Comprehensive / Innovate (IGF evaluation tetrad)

**Session-specific (if any):**
- List any terms coined during this session not yet in substrate
- Format: **Term** — one-sentence definition, session context

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

Five facts maximum. No narrative. Designed for under-60-second cold-start absorption. Each fact should be one or two sentences.

The facts must cover:

1. **Biggest state change this session produced** (what closed, what merged, what shipped, or what was reverted)
2. **Load-bearing anchors for next session** (explicit pointer to Closing Report sections that must be read before first substantive action — per Correction 21)
3. **Any incidents or unusual events** (incident response, workflow corrections, contamination catches, emergencies)
4. **Governing workflow state at session close** (is the handoff framework intact; have rules changed; meta/CWA/correction accumulation state)
5. **Forward paths available and recommended next action** (one-line summary of Path A / Path B / etc., pointing to Section 20 for detail)

---

## SECTION 1 — SESSION GOALS AND OUTCOMES

Three paragraphs:
- **What the session set out to do** (original intent, even if session evolved away from it)
- **What the session actually did** (especially if different from the goal)
- **One-sentence summary** (forward state captured in single line)

---

## SECTION 2 — REPO STATE AND DATA DEPENDENCIES

### 2.1 — Repo state at session close

For each repo touched this session:
- Repo path and branch names
- Branch heads with SHAs
- Remote sync state
- Working directory cleanliness
- Files added/modified this session with paths (committed artifacts)
- Untracked files expected to remain untracked

### 2.2 — External system state

Supabase (dev + governance), Vercel, Cloudflare, Resend, Anthropic API, third-party services. Any state changes made this session.

### 2.3 — Substrate verification gate output (Correction 17)

If session did governance work, include the mandatory substrate-state SQL query output taken at session open. If not applicable, state "N/A — session did not touch governance substrate."

### 2.4 — Data dependencies and quick reference

Operational concreteness that prevents re-derivation next session:
- Tenant IDs (CRP, BCL, Meridian, others active)
- Baseline values (CRP $566,728.97 pre-clawback, BCL $312,033, Meridian MX$185,063)
- Key test entities / benchmark values
- Credentials paths (env vars, service keys — paths only, never values)
- Production stack references

### 2.5 — Prompt sequence counters

Next numbers for OB / HF / CLT / UAT / DS / SD / TMR / DIAG / IRA consultation / PR. Build history chain continuity.

---

## SECTION 3 — PR TIMELINE (SESSION-SCOPED)

Table format:

| PR # | Title | Base | Merge SHA | Scope |
|---|---|---|---|---|

Only PRs that opened or merged during this session. Not historical PRs. "None" acceptable.

---

## SECTION 4 — MAIN WORK SURFACE EXECUTION CYCLE

Section title and content vary per session. The main body of work — gate-by-gate or step-by-step narrative of what the session's primary deliverable produced. Include STOPs, fixups, and diagnostic cycles if any occurred.

**Cross-reference Closing Report Section 1 (Session Narrative) and Section 2 (Completed Work Products) for full provenance.** The handoff captures state; the Closing Report captures reasoning.

---

## SECTION 5 — INCIDENT OR SECONDARY WORK SURFACE

If the session included an incident response, workflow correction, contamination catch, or secondary work surface unrelated to the main deliverable, it gets its own section. Cross-reference Closing Report Section 3 (Resolved Threads) or Section 6 (Defect Classes) as applicable.

"Not applicable — no secondary work surface this session" acceptable as one line.

---

## SECTION 6 — DECISIONS LOCKED AND UNLOCKED THIS SESSION

### 6.1 — Numbered Decisions

State explicitly: "No new numbered Decisions locked" if none. If any locked, list with Decision number continuing from prior session's last number, one-sentence summary, and LOCKED/IMPLEMENTED status.

"No Decisions unlocked" if none; otherwise list with reason.

### 6.2 — Operational decisions

Path-level or operational decisions made this session. NOT numbered Decisions but worth capturing as choices that bind future work. Short bullet list acceptable.

---

## SECTION 7 — META CANDIDATES CAPTURED THIS SESSION

Table format: Meta number (if assigned) | title (short) | domain | disposition (held / binding / deferred).

Group by source (e.g., "From Phase X substrate work," "From incident response," "From architect drafting defects"). Include summary line at bottom stating total count and disposition status.

Cross-reference Closing Report Section 4 (Architectural Conclusions) for full provenance of any architectural meta.

---

## SECTION 8 — TMR + CLT ENTRIES

### 8.1 — TMR candidates

State "Zero direct TMR candidates this session" if none. List indirect relevance (patterns that may migrate to TMR-equivalent) under separate heading.

### 8.2 — CLT entries

State "Zero CLT entries created this session" if none. List informal browser/runtime verification artifacts under separate heading.

### 8.3 — Registry updates pending

CLT Registry additions that need drafting. Carry-forward if deferred.

---

## SECTION 9 — OPEN FINDINGS REGISTRY

P0 and P1 findings from CLTs with current status (fixed / open / carry-forward). Carry-forward discipline: every previously open P0/P1 must appear here with updated status; dropping items silently is forbidden.

Cross-reference `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` + addenda for authoritative registry state.

---

## SECTION 10 — PIPELINE STATUS

Component-by-component status for critical pipeline elements. Format:

| Component | Status | Known gaps | Notes |
|---|---|---|---|

Covers calculation engine, SCI pipeline, signal surface, convergence, gate behavior, caller sites, and any other component-scoped work surface. "N/A" acceptable for governance-only sessions.

---

## SECTION 11 — SR-39 COMPLIANCE GATE STATE

Reference the session's main completion report Section covering SR-39 if applicable. State N/A with explicit reasoning if the session's work did not touch auth/session/access control/data access/storage/encryption.

---

## SECTION 12 — STANDING RULES STATE

### 12.1 — CC_STANDING_ARCHITECTURE_RULES.md

Version at session close. Any amendments made this session. Any promotion candidates queued for future amendments.

### 12.2 — Memory edits

Table format: Edit # | action (added / modified / removed / compressed) | rationale.

### 12.3 — Pending standing rules or corrections

Items surfaced this session that warrant future promotion. Not yet codified, but flagged for disposition.

---

## SECTION 13 — DEFECT CLASS ANALYSIS (REQUIRED)

This section is required. Every session has a defect class analysis, even if defects were caught early or prevented entirely.

### 13.1 — Root failure pattern

Name the session's root defect pattern (if any). One paragraph.

### 13.2 — Distinct manifestation surfaces

List where the pattern manifested. One paragraph per distinct surface.

### 13.3 — Catch mechanism

Explain why catches worked (or why they didn't). Name the disciplines that fired (CRF / PCD / STEP BACK / substrate read / etc.).

### 13.4 — CC Failure Patterns carry-forward

Accumulated CC failure patterns from prior sessions carry forward here. New patterns from this session appended. Full list preserved. Reference `CC_STANDING_ARCHITECTURE_RULES.md` Anti-Pattern Registry as authoritative.

### 13.5 — Forward mitigation

Concrete mitigation for the next session. Often maps to a specific Section 19 directive or Section 20 path guard.

Cross-reference Closing Report Section 6 (Defect Classes Named) for per-defect evidence and pattern catalog.

---

## SECTION 14 — FILES CREATED OR MODIFIED THIS SESSION

Grouped by category:
- **Created (code, committed)**
- **Modified (code, committed)**
- **Created (documentation, committed)**
- **Carried forward and committed** (from prior batches)
- **Modified (configuration, external)** — Supabase, Vercel, environment variables
- **Reverted (forensic trail preserved per SR-41)** — if any revert commits this session
- **To be created next batch** — the handoff itself, Closing Report, Directive if not yet committed

---

## SECTION 15 — CONVERSATION + CC EXECUTION OBSERVATIONS

### 15.1 — Productive patterns that held

Patterns that worked. Worth preserving.

### 15.2 — Unproductive patterns caught and corrected mid-session

What went wrong; how it was caught; what was corrected. Ties to Closing Report Section 6 defect classes.

### 15.3 — Drift risks identified but not closed

Patterns that surfaced but were not fully remediated. Handoff to next session.

### 15.4 — CC execution observations

If CC was involved: operational behavior, specific catches CC made, any false stops or incorrect diagnoses, baseline assessment (above / at / below). "CC not involved this session" acceptable as one line.

---

## SECTION 16 — GOVERNANCE ENGINE POSITION + AI/ML REALITY

### 16.1 — Governance engine position (VG context)

Where IGF substrate stands at session close. Which phases complete, in flight, next. FINDING-GOV-001 and other standing open findings. Forward position for agent runtimes.

### 16.2 — AI/ML reality vs. claims (VP context)

Honest assessment of what the platform does and doesn't do. Mechanism-precise language. Note any drift between current claims and current reality.

Both subsections may apply simultaneously in cross-arc sessions.

---

## SECTION 17 — HANDOFF BEST-PRACTICE + DOCUMENTATION DEBT

### 17.1 — Handoff best-practice observations

Improvements this handoff applies over prior handoff templates. Explicit note if any corrections from `HANDOFF_TEMPLATE_CORRECTIONS.md` were applied during drafting. Template defects caught during drafting (per Correction 3 discipline, captured at discovery-time) with cross-reference to corrections file patch.

### 17.2 — Documentation debt

- New concepts not yet in Architecture Reference
- Specs needing updates
- TMR entries needed
- Documents needing terminology/pricing updates
- Governance Index updates pending
- CLT Registry patches pending

### 17.3 — Project knowledge hygiene

Files to add / remove / update in project knowledge for next session. Explicit lists.

### 17.4 — Efficiency recommendations

Session opening protocol optimizations. Context at highest risk. Critical operational context. Patterns to replicate.

### 17.5 — Value proposition text (VP context)

Current reference text if updated this session. Cross-reference `Vialuce_Claude_Context_Marketing.md` / `Vialuce_Claude_Context_Sales.md` for authoritative content.

---

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

### 18.1 — Numbered risks

Format: **R{N}** — description. **Probability:** HIGH / MEDIUM / LOW / UNKNOWN. **Mitigation:** what reduces or prevents.

Every risk numbered (R1, R2...). Probability calibrated to evidence.

### 18.2 — Numbered open questions

Format: **Q{N}** — question. **Context:** what decision is pending. **Information needed:** what unblocks.

Every question numbered (Q1, Q2...). Architect disposition status flagged if partial.

---

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

**CRITICAL SECTION.** Corrections 1, 2, 6, 7, 8, 17, 18 from `HANDOFF_TEMPLATE_CORRECTIONS.md` apply here most directly. Read corrections before drafting.

Specify the next session's first three turns with explicit execution locus for every action. "Andrew runs locally" / "Andrew runs in Supabase SQL Editor" / "CC executes" / "Claude reads (in project knowledge)" — never leave execution locus ambiguous (Correction 1).

### Turn 1 — Orientation confirmation

**Claude reads** (in project knowledge or repo per file location):
- Vocabulary Appendix of this handoff
- Section 0 of this handoff
- Any load-bearing anchor Closing Report sections named in Section 0
- Any locked decision primary artifacts named as prerequisite reads (e.g., `Decision_153_LOCKED_20260420.md`)
- `IRA_INVOCATION_REFERENCE.md` if session will invoke IRA (Correction 8)

**Claude responds:** orientation confirmation + confirmation of first substantive action.

### Turn 2 — Minimum-viable verification (Correction 2)

**Andrew runs locally:**
```
git log origin/main --oneline -3
```

**Andrew pastes output.**

**Verbal confirmation:** "Any manual state changes to git, Supabase, Vercel, or external credentials since session close? If none, proceed."

**Additional verification commands** allowed ONLY when Section 18 explicitly flags a specific risk requiring targeted verification (Correction 6). General "double-checking" commands are forbidden defaults.

**Substrate verification gate** (Correction 17): if next session will touch governance substrate, Andrew runs the mandatory SQL query and pastes output in chat before any substrate-modifying work proceeds.

### Turn 3 — Path selection

Architect disposition on forward path (per Section 20 recommendations). If IRA response pending from prior session, architect pastes response content for Claude analysis. If blocking action pending (e.g., Decision 30 extension verification), architect signals disposition.

---

## SECTION 20 — PATH DETAIL

Each forward path gets its own subsection:

### PATH {A/B/C} — {Short name}

- **Identifier:** OB number / HF number / phase number / "no OB — strategic"
- **Scope:** what the path delivers
- **Dependencies:** what must be done before this path can execute
- **Gates structure:** if applicable (halt points, verification gates)
- **Meta rules baked in:** which standing rules and disciplines apply
- **Substrate lineage:** primary artifacts that govern this path (per Correction 18)
- **Estimated session time:** rough order of magnitude
- **Recommended sequencing:** relative to other paths

### Single recommendation across all paths

One recommendation with reasoning. Architect can disposition otherwise, but template requires a recommendation at close.

---

## FOOTER BLOCK (required)

```
---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*{VP or GOVERNANCE}_SESSION_HANDOFF_{YYYYMMDD}.md — Session close {date}*
*{One-sentence session summary. Forward state in one line. Companion: SESSION_CLOSING_REPORT_{YYYYMMDD}.md}*
```

---

## DRAFTING DISCIPLINE (applies to every handoff drafter, every session)

Before drafting any handoff using this template:

1. **Read `HANDOFF_TEMPLATE_CORRECTIONS.md` in full.** Every correction is binding. No expiration; read regardless of date.

2. **Read `CLOSING_PROMPT.md` in full** if drafting as part of closing protocol. The handoff is Step 3 of the 5-step Closing Prompt execution; do not improvise (Correction 20).

3. **Apply corrections at draft time, not at review time** (Correction 3). Do not draft ceremonial first and prune later.

4. **Section 0 and Section 19 get extra scrutiny.** These are the sections next session reads first. Template defects here cause the most waste.

5. **If during drafting you catch a new template defect, update `HANDOFF_TEMPLATE_CORRECTIONS.md` in the same turn** (Correction 3). Do not defer.

6. **The handoff is a git artifact, not a project knowledge artifact.** Lives in `docs/handoff-reports/` and commits with next batch. Next session reads by pasting text into opening directive.

7. **Produce companion Closing Report** per `SESSION_CLOSING_REPORT_TEMPLATE.md`. Both artifacts committed together.

8. **Produce companion New Conversation Directive** that wraps both for pasting into next conversation.

---

## SUPERSESSION NOTE

This template supersedes:
- `HANDOFF_TEMPLATE.md` v1.0 (April 11, 2026, governance 20-section) — preserved as archive
- `HANDOFF_REQUEST_TEMPLATE.md` (February 2026, VP 18-section) — preserved as archive with supersession header

Content synthesis:
- Governance invariants: Section 0 five-facts discipline, Section 19 minimum-viable, Section 20 path detail with recommendation
- VP-essential content folded: Data Dependencies (Section 2.4), Prompt Sequence Counters (Section 2.5), Pipeline Status (Section 10), AI/ML Reality (Section 16.2), Documentation Debt (Section 17.2), Project Knowledge Hygiene (Section 17.3), Efficiency Recommendations (Section 17.4), Value Proposition Text (Section 17.5), CC Failure Patterns (Section 13.4)
- New in v2: Vocabulary Appendix pre-Section-0, Substrate Verification Gate (Section 2.3), Load-bearing Anchors in Section 0, Closing Report cross-reference throughout, consolidated TMR+CLT (Section 8)

Corrections 1-18 carried forward and applied. Corrections 19-21 added in `HANDOFF_TEMPLATE_CORRECTIONS_patch_corrections_19_to_21.md` to document the v2 migration, closing-protocol substrate read discipline, and load-bearing anchor invariant.

---

*HANDOFF_TEMPLATE_v2.md v2.0 — 2026-04-22. Replaces v1.0 governance template and legacy VP 18-section template. Future corrections to the template live in the corrections file, not in this file.*
