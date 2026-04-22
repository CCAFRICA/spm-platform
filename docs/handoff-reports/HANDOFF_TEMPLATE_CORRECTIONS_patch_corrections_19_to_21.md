# HANDOFF_TEMPLATE_CORRECTIONS — PATCH 20260422

**Append to:** `HANDOFF_TEMPLATE_CORRECTIONS.md` (existing append-only log)
**Source session:** 2026-04-22 close
**Status:** binding on all subsequent sessions

This patch adds Corrections 19 through 21, drawn from defects observed during the HF-193-A Phase 2.2b contamination + closing protocol restart session arc. All corrections are binding immediately upon merge of this patch.

---

## Correction 19 — Unified HANDOFF_TEMPLATE_v2.md supersedes prior templates

**Origin:** 2026-04-22 session close. Template selection ambiguity between `HANDOFF_TEMPLATE.md` v1.0 (governance 20-section, April 11) and `HANDOFF_REQUEST_TEMPLATE.md` (VP 18-section, February) caused drafting drift. Each template had complementary strengths — governance invariants (Section 0 five-facts, Section 19 minimum-viable) vs. VP operational content (Data Dependencies, Prompt Sequence Counters, Pipeline Status, CC Failure Patterns). Forced a choice between two incomplete templates.

**Rule:** `HANDOFF_TEMPLATE_v2.md` (version 2.0, 2026-04-22) is the unified governing template for all vialuce session handoffs (VP and VG). It supersedes both prior templates. Every handoff produced going forward uses v2 as its drafting base.

Legacy templates preserved as archives:
- `HANDOFF_TEMPLATE.md` v1.0 (kept as historical reference)
- `HANDOFF_REQUEST_TEMPLATE.md` (kept with supersession header added at top of file)

Content synthesis captured in v2 template's SUPERSESSION NOTE section: governance invariants + VP-essential content + three new structural elements (Vocabulary Appendix, Substrate Verification Gate, Load-bearing Anchors).

**Verification:** Every handoff drafted after 2026-04-22 references v2 in its header block: "Template: `HANDOFF_TEMPLATE_v2.md` v2.0." Any handoff referencing v1 or the legacy template is non-compliant and must be re-drafted.

**Applies to:** every handoff drafter, every session, both VP and VG.

---

## Correction 20 — Closing Protocol substrate read mandatory before closing work

**Origin:** 2026-04-22 session close. Claude drafted closing artifacts from memory summary of "VP 18-section handoff" pattern without reading `CLOSING_PROMPT.md`, `SESSION_CLOSING_REPORT_TEMPLATE.md`, or either handoff template from project knowledge. The result was a single 18-section improvised artifact that conflated Closing Report content (provenance archive) with Handoff content (forward-facing execution), and skipped the Closing Prompt's 5-step execution sequence entirely.

Architect CRF caught: *"Where is the Closing report? Did you follow the CLOSE REPORT PROTOCOL as your foundation?"*

This is a structural recurrence of CWA-Premise at framing layer — the same defect class that caused the session's primary contamination (Decision 153 additive-policy fabrication). Reasoning from memory summary instead of primary substrate.

**Rule:** Before drafting any closing artifact (Closing Report, Handoff, or New Conversation Directive), the drafter MUST read the following in full from project knowledge:

1. `CLOSING_PROMPT.md` — the 5-step execution mechanism and 7-category inventory
2. `SESSION_CLOSING_REPORT_TEMPLATE.md` — the 8-section past-tense structure
3. `HANDOFF_TEMPLATE_v2.md` — the governing handoff template
4. `HANDOFF_TEMPLATE_CORRECTIONS.md` — all corrections in full (plus any patch files like this one)

Reading search-result excerpts is not sufficient; full-text reads required. The Closing Prompt 5-step sequence is non-negotiable (Step 1 inventory, Step 2 Closing Report, Step 3 Handoff, Step 4 Directive, Step 5 present_files).

**Verification:** Closing artifact drafter's first action on invocation is project_knowledge_search or equivalent to load the four substrate artifacts. The session chat shows the reads happening before any artifact production begins.

**Applies to:** any session where closing work is invoked via recognized phrase ("Create Final Closing Report" / "Final closing" / "Close the session" / equivalent).

---

## Correction 21 — Load-bearing anchors in Section 0

**Origin:** 2026-04-22 session close. The session's primary contamination pattern (Decision 153 additive-policy fabrication) was the third recurrence of the same drift across three sessions. Each prior session produced a handoff; none prevented recurrence because the critical anchor ("before drafting HF-193 work, read Decision 153 LOCKED primary artifact") was scattered across handoff sections rather than surfaced in the cold-start five-facts.

Section 0 by design captures five orientation facts for under-60-second absorption. Without a dedicated anchor pattern, load-bearing next-session guidance gets buried in Section 19 start script or Section 18 risks. Next session's new-Claude reads Section 0 first; anchors there have maximum discoverability.

**Rule:** When a session produces a defect pattern or architectural conclusion that the next session must not lose, Section 0 includes an explicit anchor pointing at the Closing Report section where the pattern is documented. Format:

> **Load-bearing for next session:** Before [specific upcoming work], read [Closing Report Section X.Y] — [one-phrase reason]. Pattern has recurred [N] times; next recurrence blocked by substrate-anchored reads.

This is fact #2 of Section 0 by default — positioned after "biggest state change" so the next session sees state first, then the discipline required to act on state.

Not every session has load-bearing anchors. If none, fact #2 covers incidents or framework state per Section 0's standard content.

**Rationale:** Defect patterns that have recurred once are candidates for anchors. Patterns that have recurred twice or more require anchors. Section 0 placement is non-negotiable for recurred-twice-or-more patterns.

**Verification:** Section 0 of every handoff is scanned by drafter for anchor-worthy content. If a session's Closing Report Section 6 (Defect Classes) identifies a defect as "recurred" (not "first occurrence"), Section 0 must include an anchor.

**Applies to:** every handoff drafter, but specifically binding when Closing Report identifies any recurred defect class.

---

## CHANGE LOG

- **2026-04-22:** Patch added Corrections 19-21 from session 2026-04-22 close. Correction 19 is template synthesis establishing v2 as governing template. Corrections 20 and 21 are structural learnings from the session's closing-protocol restart: closing substrate must be read before closing work, and load-bearing anchors earn Section 0 placement.
- **2026-04-14:** Patch added Corrections 8-18 from OB-IGF-17/18/19 arc. Corrections 17 and 18 are session-defining structural changes closing the EECI gap.
- **2026-04-13:** Patch added Correction 7 (Vocabulary Appendix first read of handoff).
- **2026-04-12:** Patch added Corrections 5 and 6 (substrate state verification, no ceremonial verification).
- **Earlier:** Corrections 1-4.

---

*End of patch. Append to `HANDOFF_TEMPLATE_CORRECTIONS.md` after existing Correction 18.*
