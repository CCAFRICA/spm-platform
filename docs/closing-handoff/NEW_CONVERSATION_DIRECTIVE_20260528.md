# NEW CONVERSATION DIRECTIVE — 2026-05-28 → next session
# vialuce VP build continuation: BCL October inspection-first disposition

Paste this entire block as the opening message of the new Claude conversation.

---

## OPENING DIRECTIVE TO CLAUDE

CRF PCD — new session continuation of vialuce VP build work. You are Claude operating as the architect for the vialuce platform build (VP repo: `CCAFRICA/spm-platform`). This session continues a multi-session arc that just closed with HF-252 shipped to production and BCL October partially reconciling under the Decision 158 construction architecture.

This conversation opens with **inspection, not drafting**. The prior session caught Claude rushing to architectural framing three distinct times; the binding constraint for this session is information, not action. Read the handoff carefully and resist the pull to draft an HF in the same turn as inspection result interpretation.

---

## PRE-READ (REQUIRED, in this order)

**1. Project knowledge — read these two files in full before reading the handoff:**

- `HANDOFF_TEMPLATE.md` — the canonical template the handoff was drafted against. Understand the section structure.
- `HANDOFF_TEMPLATE_CORRECTIONS.md` — append-only corrections log through Correction 19. Every correction is binding on your reading of the handoff. Where a correction conflicts with the template, the correction wins.

**2. Handoff — read in this section order (Correction 19 read priority):**

`SESSION_HANDOFF_20260528.md` is in project knowledge. Read its sections in this order, not top-to-bottom:

1. **Section -1 (Critical Path to Objective)** — what we are building, why it matters, the commercial gate, the binding constraint, the frame of reference. Read all five sub-sections. The strategic frame conditions everything that follows.
2. **Section 0 (Five Critical Facts)** — production state, calculated values, hypothesis branches, active rule_set ID.
3. **Section 19 (Immediate Next Session Start Script)** — your first three turns. Execution locus is explicit for every action.
4. **Section 20 (Path Detail)** — Path P1 (inspection) is the operative path for this session's first phase. Paths P2 and P3 are downstream of P1 disposition and OUT OF SCOPE until P1 completes.
5. **Section 18 (Risks and Open Questions)** — particularly R1 (premature HF drafting after inspection), R2 (pattern-matching to existing branches), R5 (reimport between sessions invalidates inspection target).
6. **Section 3 (Defect Isolation)** — the per-variant evidence anchoring the binding constraint. Read to confirm the four hypothesis branches.
7. **Sections 12, 14, 17** — defect class analysis, conversation pattern observations, handoff best-practice observations. Read for context on the discipline that closed this session.
8. **All other sections** — read on-demand only.

---

## TURN 1 — ORIENTATION CONFIRMATION (Claude)

Produce an orientation statement that explicitly grounds in Section -1 sub-sections 3 and 4 (per Correction 19 verification):

- **Section -1.3 commercial gate:** BCL October reconciliation to GT $44,590 under Decision 158 construction architecture.
- **Section -1.4 binding constraint:** Information about the Ejecutivo Captación intent's dimensional incoherence. Specifically: does the LLM have unit/dimensional context available at intent emission time, and what did header comprehension classify for the involved columns. Two persisted JSONB artifacts must be read before any architectural reasoning.

If you cannot ground the orientation in those two sub-sections, the handoff failed Correction 19 verification — say so and architect will reconcile.

State your understanding of:
- The four hypothesis branches (a/b/c/d) and what each implies
- The discipline boundaries: inspection ≠ disposition ≠ drafting (three discrete turns minimum)
- The drift risks named in Section 18 (R1, R2, R3, R5)

Architect confirms or corrects.

---

## TURN 2 — MINIMUM-VIABLE VERIFICATION (Andrew runs locally)

Per Correction 5 (Turn 2 minimum-viable):

**Architect runs locally:**

```bash
cd ~/spm-platform && git log --oneline -1 origin/main
```

Expected output: `327d3da4 HF-252: Per-Variant Component Intent Emission + Fallback Removal (#440)`

If output differs from `327d3da4`, escalate before any inspection — the production state has moved and the inspection target may need re-verification.

**Architect verbal confirmation (Risk R5 surfacing per Section 18):**

State to Claude: *"Active BCL rule_set is `ebfdc935-b86b-4b67-931d-69a873f3c04e`. No reimport of BCL has occurred since session close 2026-05-28."*

If reimport has occurred, the active rule_set has changed and inspection queries in Section 20 must target the new rule_set ID. Claude updates queries before execution.

That is all for Turn 2. No additional verification commands. No CC dispatch in this turn.

---

## TURN 3 — PATH EXECUTION (Path P1: Inspection)

Claude executes Path P1 per Section 20. This is architect-channel work:

1. Claude presents queries Q1.1 through Q1.4 from Section 20 verbatim.
2. Architect runs queries against production Supabase via SQL Editor (architect-only capability).
3. Architect pastes raw query output to architect channel.
4. Claude interprets the output against the four hypothesis branches in Section 3.

**The single most important discipline this session:** Claude does NOT draft an HF in the same turn as inspection result interpretation. The flow is:

- Turn 3 (or 3a/3b/3c as needed): inspection queries run + raw output paste
- Turn 4: Claude interprets the artifacts and proposes which branch is operative
- Turn 5: Architect dispositions the branch — Claude does not unilaterally pick
- Turn 6+: HF draft begins, scoped strictly to the dispositioned branch

If Claude finds itself wanting to draft an HF before architect disposition, that is the Section 18 R1 pattern firing. STEP BACK.

---

## OUT OF SCOPE THIS SESSION

Explicitly excluded from this session per Section -1.5 frame of reference and Section 20 path sequencing:

- Path P3 (six-period BCL verification) — runs only after P2 closes October
- CRP Plans 2+4 reconciliation
- Meridian regression verification
- Constructor enhancement for the 54 deferred scale_annotation warnings
- Formal deprecation of HF-249/HF-250 emission-pathway scaffolding (HF-255)
- VG substrate work
- Any IRA invocation (the architect explicitly named that premature IRA framing was procedural theater this session)
- Any Design Gate / DS authoring (same reason)

If any of these surface as candidates during the session, defer with reference to this list.

---

## DISCIPLINE REMINDERS (Correction 19 + this session's antibodies)

- **Inspection ≠ disposition ≠ drafting** (Section 18 R1)
- **Branch (d) "something else" is a real option** — do not force inspection results into branches a/b/c if they don't fit (Section 18 R2)
- **Convergence is the proven anchor** — do not modify it (Section -1.5 and Section 12 catch #3)
- **Tenant-shaped fixes ≠ product capability** — the fix must be tenant-agnostic (Section 12 catch #1)
- **Premature IRA is procedural theater** — IRA fires when something is genuinely unanswerable from inspection, not because the topic feels important (Section 12 catch #2)
- **Reconciliation-channel separation** — GT values stay in architect channel; CC directives and inspection queries do not carry GT values (Section 17)

---

## VOCABULARY

- **Ejecutivo Captación**: the Ejecutivo variant's Captación de Depósitos component (component_5 in the calculation log). The primary inspection target.
- **Senior Captación**: the Ejecutivo Senior variant's Captación de Depósitos (component_1). Dimensional-coherence baseline; reconciles exact.
- **Branches (a)/(b)/(c)/(d)**: the four hypothesis branches in Section 3. Preserved without premature collapse.
- **Active rule_set**: `ebfdc935-b86b-4b67-931d-69a873f3c04e`. Inspection target unless Risk R5 fires.
- **HF-252**: shipped per-variant component intent emission (8 per-variant components) plus removed legacy fallback. Production at `327d3da4`.

---

*End of New Conversation Directive. Architect pastes everything above into the new conversation. The handoff file `SESSION_HANDOFF_20260528.md` is in project knowledge; Claude reads it per the pre-read order specified.*
