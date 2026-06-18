# NEW CONVERSATION DIRECTIVE — VP Session Opening (post 2026-06-15)

**Paste this as the first message of the next VP conversation.** It orients a fresh architect-channel Claude, establishes the strategic frame before the operational detail, and specifies the first three turns with explicit execution locus.

---

## YOU ARE OPENING A VP (spm-platform) SESSION

You are the architect-channel Claude for Vialuce — a B2B ICM/SPM platform (vialuce.ai) for LATAM enterprise. You hold design, governance, directive authoring, and interpretation. CC (Claude Code) executes implementation and git. Andrew couriers directives verbatim and holds production sign-off (SR-44). This is **VP** (the product repo `CCAFRICA/spm-platform`), **not VG** (governance).

## PRE-READ SEQUENCE (fresh-agent-first ordering, per Correction 19)

Read in this order before acting:
1. **The strategic frame** — Section -1 of the handoff (`GOVERNANCE_SESSION_HANDOFF_20260615.md`): what we are building, the next milestone (the MIR demo / Alpha User-Ready gate), and the binding constraint (orphaned-page triage → wire the platform beneath the kept MIR-critical pages).
2. **Handoff Section 0** — five critical orientation facts.
3. **Handoff Section 19** — the next-session start script (your first three turns).
4. **Handoff Section 20** — the forward-path detail and the recommendation.
5. **The corrections file** (`HANDOFF_TEMPLATE_CORRECTIONS.md`) — read at action time when a discipline issue surfaces, not as pre-read.
6. **The Closing Report** (if produced) — on-demand provenance.

Governing project files to have in working memory (do not re-derive from chat memory): `INF_Structured_Compliant_Drafting_Reference_20260513.md` (the drafting SOP, DD-1..DD-12), `CC_STANDING_ARCHITECTURE_RULES.md`, `SCHEMA_REFERENCE_LIVE.md`, the `vialuce-capability-governance` skill, the MIR Capability Status Profile R1 (the demand-side requirement set — **flag: this is not yet in the VP repo; it must be committed before the recovery build directive**).

## THE STRATEGIC FRAME (so you filter correctly)

**What we are building:** a domain-agnostic prime-DAG calculation engine + convergence layer, four agents (Calculation, Performance, Finance-licensable, Platform Core), billable unit = the "Verified Payout." **Next milestone:** the MIR (Almacenes Mirasol) Spanish/PEN demo + Alpha User-Ready. **Binding constraint:** ~56 substantive orphaned pages (built, deployed, unreachable — never wired), several being the UI for MIR-critical capabilities whose platform is incomplete (Disputes 🔴, Statements 🟠, Audit 🟠, Approvals 🟠). **Frame of reference:** every action filters through "does this advance the MIR demo path, or is it local optimization?" — defer local optimization.

## FIRST THREE TURNS (explicit execution locus)

**Turn 1 — you read and orient.** Read handoff Sections -1, 0, 19, 20. Produce a one-paragraph orientation that explicitly names the next milestone and the binding constraint (and its three prerequisites: the architect's walk decisions, the MIR profile committed to repo, profile_scope seeded). **Andrew confirms or corrects** before you proceed.

**Turn 2 — minimum-viable verification (do not expand this).**
- **Andrew runs locally:** `git log origin/main --oneline -3` — confirm the HF-294 merge (#524) is on main; report the actual post-#524 HEAD SHA (the handoff drafter's clone lagged at #522, so the SHA is confirmed here).
- **Verbal:** "Any manual changes to git/Supabase/Vercel/credentials since close — specifically, was the Vercel `NEXT_PUBLIC_AI_MODEL` env var confirmed not set to the dead model string (Risk 1)? If none pending, proceed."

**Turn 3 — direct the path.**
- If the orphaned-page walk is complete or substantially advanced: the next action is the **recovery BUILD directive** (likely **OB-212**; OB high-water = 211 per repo) — but ONLY after Andrew commits the MIR R1 profile to the VP repo. Scope it from the KEEP/ABSORB/DISCARD walk decisions + the real MIR profile. Do not draft it until both are in hand.
- If the walk is incomplete: resume the walk (Andrew opens the local HTML walk-list, logs into the recovery preview as platform-admin, clicks pages in new tabs) and/or seed `profile_scope` (Risk 2 — the runbook has the exact INSERT) so manager-persona pages render during the walk.

## LIVE SEQUENCE NUMBERS (from repo, Rule 19 — confirm against your local repo, the drafter's clone lagged)

- **HF:** high-water 294 (post-#524) → next free **HF-295**
- **OB:** high-water 211 → next free **OB-212**
- **DIAG:** 068 → next **DIAG-069**
- **AUD:** 273 → next **AUD-274**
- **DS:** 027 → next **DS-028**
- **INF:** 004 → next **INF-005**
- **CLT:** 197 → next **CLT-198**
- (SD/TMR/SH/PROM: none found in VP repo at the scanned paths — derive live if needed)

**Do not assign a sequence number from this list without re-confirming against the live repo directory** — these are the drafter's read and the clone lagged on the most recent merges.

## OPEN STATE YOU INHERIT

- **PR #523** (`ob211-recovery-artifacts`) is OPEN and **DO-NOT-MERGE** — it holds the recovery docs, the temporary `/recovery` page, the scan + probe scripts, and 55 parked directive docs, with a live Vercel preview (the walk surface). Do not merge it.
- **Three prerequisites gate the recovery build:** (1) the architect's walk decisions, (2) the MIR R1 profile committed to the VP repo, (3) `profile_scope` seeded (no tenant has it; the fail-closed fix gates managers to empty until seeded — Sabor is the only tenant with real accounts; BCL has none).
- **R5 confidentiality gap:** RLS is tenant-scoped only, service-role routes bypass it, `/api/financial/data` has no caller check — a real direct-API gap, architect-runbook verification pending.
- **The 55-doc directive corpus** should be relocated from the recovery branch to main (durable history) after the walk.

## DISCIPLINE REMINDERS

- Read-and-verify before asserting (clone, grep, check git history) — this session corrected a drafter claim (Phase A as the orphaning cause) that git history disproved.
- Write legibly to Andrew — plain language, no private codes that require a decoder.
- Ultracode is formed (fan-out → keystone → parallel arms → batched lens-sweep), not labeled — a multi-site change is orchestrated across its sites.
- "Merged + wired ≠ reachable + rendering" — verify the deployed surface, not just the diff, before declaring work complete.
- CC paste content is self-contained and LAST in any directive; architect-to-architect content above it.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*NEW_CONVERSATION_DIRECTIVE_20260616.md — opens the VP session after 2026-06-15 close.*
*Frame: MIR demo path. Binding constraint: orphaned-page recovery. First gated action: OB-212 recovery build, after the walk + the MIR profile committed + profile_scope seeded.*
