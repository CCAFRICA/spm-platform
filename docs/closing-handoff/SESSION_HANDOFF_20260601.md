# SESSION HANDOFF — 2026-06-01

**Session window:** 2026-06-01, approximately a full working day of continuous architect-channel work.
**Primary outcome:** Meridian fleet (C5) defect fully diagnosed to a code-justified root cause via line-item ground-truth comparison + DIAG-58 (Condition A: reference-row→member projection is an additive capability gap, not a regression); fix directive HF-262 drafted and ready, gated on SR-42 disposition.
**TO THE NEXT CONVERSATION: Read this ENTIRE document before responding. Every section is load-bearing.**

**Reader orientation:** read Sections -1, 0, 19, and 20 first. The rest fills in detail. This handoff is intentionally dense — paste it directly into the opening directive of the next conversation per the corrected handoff workflow (Meta-66). Section -1 (strategic frame) is read BEFORE Section 0 per Correction 19.

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE

**1. What we are building.** vialuce.ai is a B2B Incentive Compensation Management / Sales Performance Management (ICM/SPM) platform. It ingests sales data and compensation-plan documents (PPTX/PDF/DOCX/XLSX/CSV) through a Synaptic Content Ingestion (SCI) pipeline, uses AI to comprehend each plan's structure, calculates commissions automatically, and produces auditable, explainable results. The architecturally distinguishing feature is a multi-agent adaptive-intelligence engine: a prime-DAG calculation engine (10 structural primitives, domain-agnostic) fed by a convergence layer that maps any tenant's columns to plan metrics with no per-tenant code, riding a decreasing-cost recognition curve (a re-imported file is recognized at near-zero cost).

**2. Why it matters.** Comp teams today reconcile commissions in fragile spreadsheets; errors erode rep trust and consume finance cycles. vialuce centralizes complex comp rules, automates calculation, makes every payout auditable and explainable (a rep can see exactly why they were paid), and handles clawbacks/reversals/retroactive adjustments natively — at scale, across any plan structure, without bespoke engineering per customer.

**3. Current commercial gate / next user-facing milestone.** User-Ready: a first user runs end-to-end through the browser, and customer demos run on proof tenants whose results are exact against ground truth. Per the User-Ready exit-criteria framework, B3 (dev/prod substrate separation) and C2 are hard blockers before test users / demos.

**4. Binding constraint.** Proof-tenant calculation correctness is the gate that demos depend on. State at session close: **BCL = verified PASS** (line-item exact to $312,033 anchor). **Meridian = one open defect**, now fully diagnosed: the fleet component (C5) pays zero because the engine has no reference-row→member projection capability (DIAG-58 Condition A); **HF-262** is the drafted fix. **CRP Plans 2+4 = open** (Plan 4 does not currently exist as a live rule_set; if reintroduced it uses the complete peer-entity path). The binding constraint to "Meridian demo-ready" is **HF-262 shipping and reconciling Meridian Q1 to 185,063 / 175,585 / 196,337 line-item.**

**5. Frame of reference for next session.** Every proposed action filters through: *does this advance proof-tenant correctness toward User-Ready, or is it local optimization?* Specifically — HF-262 (Meridian fleet projection) is on the critical path; the `undefined===undefined` scope guard rides inside it (same code site); variant-explainability, AUD refreshes, branch hygiene, and the `scale_annotation` warnings are **deferrable** unless they block HF-262. Do not expand HF-262 beyond the fleet projection + hub-payee exclusion + the guard (DD-7 / AP-D6 smuggled-expansion discipline).

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

1. **Biggest state change:** Meridian fleet (C5) defect root-caused to a code-justified, additive capability gap. DIAG-58 (committed `2473868e`, dev) determined **Condition A** — reference-row→member projection was never implemented (not a HF-238 regression). **HF-262** (the fix directive) is drafted and ready.
2. **Incidents / unusual events:** No production incident. Heavy SOP-discipline correction throughout (the session's defect class — see Section 12). A multi-artifact **number-drift** event: a DIAG was drafted as 050, CC self-renumbered to 053, architect corrected to the true next-unused **58**; the fix HF was mis-stamped 261 then corrected to **262** (HF-261 had already been run as an ADR). All resolved.
3. **Governing workflow state:** Handoff framework intact (this handoff applies Correction 19 Section -1 + Corrections 1/2/5). One new operating rule was added to the CRF protocol this session (Search-Before-Claiming-Unknown — see Section 11).
4. **Meta candidate state:** No new numbered Decisions locked. Operating-rule additions captured in memory (CRF Search-Before-Unknown). Held items for ICA Mode 1 disposition unchanged.
5. **Forward paths + recommended next action:** Primary path = **dispatch HF-262** after the SR-42 disposition (IRA Class A on the convergence-touch, or broken-path-repair + ADR-isolation). Recommended next action: architect dispositions SR-42, assigns/confirms HF-262, commits the directive to `docs/vp-prompts/`, pastes to CC.

---

## SECTION 1 — SESSION GOALS AND OUTCOMES

The session opened continuing the locked 1C ingestion→interpretation remediation arc and moved into proof-tenant verification. The intent was to verify BCL and Meridian calculation results and resolve the Meridian fleet anomaly.

What the session actually did: it established (the hard way, under repeated architect correction) the discipline of comparing live results against ground-truth files that were in the project the whole time. BCL was verified PASS line-item. Meridian's fleet defect was diagnosed via ground-truth diff + conversation-history retrieval + reading the calc audit — culminating in DIAG-58, which corrected a stale-audit error (the fix had been reasoned against AUD-005 SHA `5314c365`, which predated the HF-238 prime-DAG rebuild) and determined Condition A. HF-262 was drafted as the fix.

Summary: BCL verified, Meridian root-caused and fix-drafted (HF-262), DIAG-58 filed correctly after a number-drift correction.

## SECTION 2 — REPO STATE AT SESSION CLOSE

- **Repo:** VP `CCAFRICA/spm-platform`; branch `dev`. (VG `vialuce-governance` not touched this session.)
- **dev HEAD:** `e85a7678` (post the DIAG-58 relocation commit `2473868e`; reference-refresh and relocation landed here).
- **Files added/modified this session (committed to dev):**
  - `docs/diagnostics/DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md` (findings)
  - `docs/completion-reports/DIAG-58_COMPLETION_REPORT_20260601.md` (wrapper)
  - `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md` (refreshed calc-execution reference; supersedes `5314c365` for citation)
  - `docs/completion-reports/HF-261_ADR.md` (the run ADR; HALT-3 + Condition-A)
- **Untracked / session-output (NOT committed):** this handoff; the new-conversation-starter; the HF-262 directive draft (lives in session output until architect commits it to `docs/vp-prompts/`).
- **External systems:** Vercel/Supabase unchanged by this session (read-only diagnostics; no migration applied). Meridian persisted results = batch `e1098ffa` (2026-06-01, three periods, fleet still zero — pre-fix state).

## SECTION 3 — PR TIMELINE (SESSION-SCOPED)

| PR | Title | Base | Merge SHA | Scope |
|---|---|---|---|---|
| — | (none) | — | — | No PRs opened or merged this session. DIAG-58 + ADR committed directly to `dev` (read-only diagnostics, no mergeable PR per diagnostic discipline). HF-262 not yet dispatched. |

## SECTION 4 — MERIDIAN FLEET DIAGNOSIS EXECUTION CYCLE (main work surface)

The diagnostic arc, in order:
1. **BCL verified PASS** — live per-period grand totals compared line-item to `BCL_Resultados_Esperados.xlsx`: Oct 44,590 / Nov 46,291 / Dec 61,986 / Jan 47,545 / Feb 53,215, six periods summing to the **$312,033** anchor. Component-level exact (BCL-5001 all periods; Feb spot-checks).
2. **Meridian diagnosed via GT diff** — against `Meridian_Resultados_Esperados.xlsx`: c1–c4 exact to the dollar per employee; **C5 (fleet) = 0** where it should be nonzero; expected Jan = **185,063** (the anchor, full-fleet-included); live Jan = 155,950 (−29,113). Two defects: fleet zero + phantom hub payees (11 hubs each paid the safety base ≈ 5,500, which masked the c1–c4 totals as "off" at the aggregate).
3. **Reverse-derivation** — expected C5 per employee proved the fleet ratio is **per-hub** (identical within a hub, two values per hub = the senior/coordinador variant rate split, constant 1.778 ratio across all 12 hubs; senior rate 800, coordinador ~450). This killed the "re-target binding to denormalized columns" option and confirmed the aggregate-projection shape.
4. **History retrieval** — the hub/fleet "ratio+aggregate" resolution was documented since March 2026 (HF-089/OB-158, HF213, the March-10 AI-column-mapping chat naming Component 5 as hub-level aggregate, $185,063 benchmark).
5. **Calc-audit read → stale-audit catch** — the fix was being reasoned against AUD-005 `5314c365` (May 6), which **predates HF-238** (prime-DAG rebuild, ~May 20). The HF-261 ADR run caught this (HALT-3): the recommended `scopeAggregates` fix targeted **deleted code**.
6. **DIAG-58** — refreshed the calc-execution reference to `e85a7678` and determined **Condition A**: peer-entity aggregation (CRP-Plan-4 class) is complete; reference-row→member projection (Meridian fleet class) was never implemented; HF-238 refactored the peer-entity path, did not delete a fleet capability. Runtime-confirmed via a non-mutating engine harness (peer-entity = 300 nonzero; fleet = 0; fleet formula sound at 960 with hub metrics present → C5=0 is input-resolution starvation).
7. **HF-262 drafted** — extend the one scope mechanism for reference-row projection (AP-17), exclude hubs as payees (provenance-based), guard the `undefined===undefined` scope-match footgun.

## SECTION 5 — SECONDARY WORK SURFACE

Not applicable as a separate surface — the number-drift correction (DIAG 050→053→58; HF 261→262) and the DIAG artifact relocation (findings split into `docs/diagnostics/` `_OUTPUT.md` + thin completion-report wrapper) were corrections within the main arc, covered in Sections 4, 12, and 13.

## SECTION 6 — CC FAILURE PATTERNS + META CANDIDATES (carry-forward + new)

**CC failure patterns — carried forward (unchanged this session):** FP-49 (SQL schema fabrication — mandatory SQL Verification Gate), FP-80 (false PASS without browser evidence), FP-81 (single-layer fix for multi-layer bug), registry/cherry-pick pattern (AUD-009, 19 functions), phase-deferral-as-completion, completion-report≠working, SR-34 No-Bypass + Adjacent-Arm Drift. No new CC failure patterns this session — CC behavior was above baseline (Section 15).

**New process/meta candidates this session:**

| Meta | Title (short) | Domain |
|---|---|---|
| (mem) | Search-Before-Claiming-Unknown (added to CRF protocol, memory #19) | Process discipline |
| (cand) | DIAG artifact two-file convention (`docs/diagnostics/DIAG-NNN_*_OUTPUT.md` findings + `docs/completion-reports/` thin wrapper) | Drafting SOP |
| (cand) | DIAG/HF numbers never originate in Claude drafts; architect sequences (reinforces memory #26) | Drafting SOP |
| (cand) | `undefined===undefined` scope-prime match guard | Engine hardening (folded into HF-262) |

Three held candidates are **not binding standing rules** until ICA Mode 1 disposition.

## SECTION 7 — DECISIONS LOCKED AND UNLOCKED THIS SESSION

No new numbered Decisions locked. No Decisions unlocked.

Path-level / operational decisions made this session (bind future work, not numbered): (a) **DIAG-58 Condition A** — the aggregate-scope gap is additive, not a regression; the fix extends the one scope mechanism. (b) **HF-262 fix shape** — reference-row→member projection via the existing scope prime (lever L1/L2 to be ADR-selected), hub-payee exclusion by provenance (lever c-i/c-ii), `undefined` guard in-scope. (c) **AUD-005 citation** moves to `e85a7678`; `5314c365` historical.

## SECTION 8 — TMR CANDIDATES

Zero direct TMR candidates this session.

Indirect relevance: the reference-row→member projection capability, once built, is the second aggregate shape in the aggregate-scope family (peer-entity being the first); if a TMR-equivalent capability reference exists, this shape migrates there. Defer to ICA.

## SECTION 9 — CLT ENTRIES

Zero CLT entries created this session.

Informal verification artifacts produced: line-item diffs of BCL and Meridian live results against ground-truth files (architect-channel reconciliation); the DIAG-58 non-mutating engine harness output. None are CLT-registry entries.

## SECTION 10 — SR-39 COMPLIANCE GATE STATE

N/A for the session's diagnostic work (read-only; no auth/session/access/storage/encryption touched). **Forward note:** HF-262 §3.2(ii) may include hub-entity metadata backfill / phantom-result cleanup; if that touches data-access or assignment, the HF's SR-39 / AP-13 gates apply at that point (already specified in the HF-262 directive).

## SECTION 11 — STANDING RULES STATE

`CC_STANDING_ARCHITECTURE_RULES.md`: no version change this session (no CC build executed; HF-262 not yet run). **CRF protocol amended (memory #19):** added **Search-Before-Claiming-Unknown** — Claude must not present a question/unknown or HALT-for-architect-input without first listing the conversation chats and project files searched + read completely to derive it. Promotion candidates queued: the DIAG two-file convention and the no-number-leak rule (Section 6).

## SECTION 12 — DEFECT CLASS ANALYSIS

**Root failure pattern (session-defining):** assessing/asserting instead of comparing-against-available-evidence. Distinct surfaces:
- Assessed Meridian results by eye ("round multiples of 50") while BCL/Meridian/CRP ground-truth files sat unopened in the project.
- Concluded "there is no Meridian ground-truth file" instead of checking (architect then placed it; it was always derivable).
- Declared the `*_Flota_Hub` semantics "architect-channel only" without checking that the expected-results file answered it.
- Reasoned the fix against a **stale audit** (AUD-005 `5314c365`, pre-HF-238) as if it were live code.
- Pontificated ("here is the one thing I won't assert…") instead of setting concrete actions.
- Number drift: leaked a DIAG number from a draft (050), then over-corrected an HF number (re-stamped 261 when it should advance to 262).

**Why the catches worked:** the architect forced ground-truth comparison ("HAVE YOU COMPARED LINE ITEMS"), forced search-before-conclusion ("SEARCH CONVERSATION HISTORY"), forced reading the available audit ("YOU HAVE A COMPLETE RECENT AUDIT — READ IT NOW"), and forced the new operating rule into the CRF protocol. The DIAG-58 stale-audit catch came specifically from the HF-261 ADR run's HALT-3 — the ADR gate did its job. **Prevention now encoded:** CRF Search-Before-Unknown (memory); AUD refresh-on-engine-change discipline (DIAG-58 §6A); no-number-leak (reinforced).

## SECTION 13 — FILES CREATED OR MODIFIED THIS SESSION

- **Created (documentation, committed to dev):** `docs/diagnostics/DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md`; `docs/completion-reports/DIAG-58_COMPLETION_REPORT_20260601.md`; `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md`; `docs/completion-reports/HF-261_ADR.md`.
- **Created (session output, NOT committed):** this handoff; the new-conversation-starter; `HF-262_DIRECTIVE_20260601.md` (architect to commit to `docs/vp-prompts/` on dispatch).
- **Code modified:** none this session (diagnostics read-only; HF-262 not yet run).
- **Modified (configuration, external):** none.
- **To be created next batch:** HF-262 ADR (`docs/completion-reports/HF-262_ADR.md`) as CC's first deliverable when HF-262 runs.

## SECTION 14 — CONVERSATION PATTERN OBSERVATIONS

Productive: ground-truth diff as the verification primitive; conversation-history retrieval before re-deriving; reading the audit in full rather than describing a read; ADR-gate catching the stale-audit error.

Unproductive, caught and corrected mid-session: assess-by-eye; conclude-from-absence; punt-to-architect-channel without searching; pontification; number leaks. All corrected; the recurring root is "assert instead of compare/search," now CRF-encoded.

Drift risk not fully closed: verbosity. Architect flagged "pompous pontification that is not actionable." Mitigation in flight — density tracks ambiguity, lead with actions.

## SECTION 15 — CC EXECUTION OBSERVATIONS

CC was involved (DIAG-58 execution, ADR, DIAG relocation). Specific catches: the **HF-261 ADR HALT-3** (CC correctly refused the recommended `scopeAggregates` fix because the code was deleted by HF-238 R2 — the single most valuable catch of the session); CC's renumber of the DIAG to next-unused when it detected 050 was taken (direction correct even though its count was stale at 053 vs the true 58); CC's step-5 deviation in the relocation (correctly applied the global DIAG-053→58 rename to the reference's internal strings rather than leave a dangling cite, and flagged it). No false stops. CC behavior **above baseline** — the ADR gate and the deviation-with-flag are exactly the discipline intended.

## SECTION 16 — GOVERNANCE ENGINE POSITION + VP PROMPT-SEQUENCE TRACKING + PIPELINE STATUS

**Governance engine:** IGF substrate unchanged this session (VG not touched). Wave 1 locked (VG `e2fbcc4`); Wave 2 (T2-E09, T2-E30) pending. No FINDING-GOV movement. This session was VP calc-correctness work, orthogonal to the IGF substrate arc.

**VP prompt-sequence tracking (carry forward; confirm against repo at session open — numbers drift):** Next HF = **HF-262** (drafted; the fleet projection fix). DIAG sequence advanced to **DIAG-58** this session (true next-unused after the 050→053→58 correction). HF-261 = run (ADR only, HALT-3). Other counters (OB, DS, CLT, SD) to be confirmed from current repo state — do NOT assert from memory.

**AI/ML reality vs claims (honest, VP):** The prime-DAG engine (10 primes) + convergence layer is operative and domain-agnostic; the fingerprint decreasing-cost curve is demonstrated (Tier-1 re-import at ~$0). Honest gap surfaced this session: the engine had **no reference-row→member projection** (DIAG-58 Condition A) — peer-entity aggregation works, hub-reference projection was never built. Not a claimed-but-absent capability misrepresentation; an additive gap now scoped in HF-262.

**Pipeline status (component-by-component, proof tenants):** Ingestion (SCI, PPTX/PDF/DOCX/XLSX/CSV) — operative. Convergence binding — operative (employee-keyed metrics correct; hub-keyed fleet binding cross-keys → the HF-262 target). Calc engine (prime-DAG) — operative; **BCL PASS** ($312,033 line-item), **Meridian** 4/5 components exact, C5 fleet=0 (HF-262), **CRP** Plans 1+3 prior-PASS, Plan 2 open, Plan 4 not a live rule_set. Reconciliation/explainability — operative except Meridian variant-label cosmetic defect (deferred).

## SECTION 17 — HANDOFF BEST-PRACTICE + DOCUMENTATION DEBT + PK HYGIENE + EFFICIENCY + VALUE PROP

### 17.1 — Handoff best-practice observations
Corrections applied during drafting (corrections file read in full this session): **Correction 19** (Section -1 Critical Path, five sub-sections, fresh-agent framing, read before Section 0); **Correction 1** (explicit execution locus); **Corrections 2 + 5** (Section 19 Turn 2 = zero verification commands by default). Structure is the v2 synthesis (sections −1…20 + VP content folded as subsections), titled `SESSION_HANDOFF` per VP convention — corrected this turn from a mis-titled `GOVERNANCE_SESSION_HANDOFF` first pass.

### 17.2 — Documentation debt
- Refresh `AUD-005` calc-execution reference to post-HF-262 SHA after merge (this session refreshed to `e85a7678` for HF-238; HF-262 will move it again).
- Refresh `AUD-0015` ingestion-interpretation trace (`dede922b`) separately after any ingestion change (not this session).
- Reference-row→member projection capability → candidate for Architecture Reference + TMR addendum once HF-262 ships.
- DIAG-58 artifacts cite directive as `DIAG-050_DIRECTIVE` (never committed under corrected name); if committed, must be `DIAG-58_DIRECTIVE`.

### 17.3 — Project-knowledge hygiene (add / remove / update)
- **Add:** `docs/diagnostics/DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md`, `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md`, `HF-262_DIRECTIVE_20260601.md` (on dispatch), this handoff + the new-conversation directive.
- **Update:** AUD-005 citation pointer moves to `e85a7678` (retire `5314c365` as historical).
- **Remove:** none.

### 17.4 — Efficiency recommendations
- Session-opening protocol: read Section -1 → 0 → 19 → 20 first (fresh-agent-first per Correction 19).
- Highest-risk context: proof-tenant ground-truth files and the refreshed calc reference — keep in project knowledge.
- Pattern to replicate: **compare against ground-truth before assessing** and **search history/files before claiming an unknown** (both were the session's recurring failures; now CRF-encoded).

### 17.5 — Value proposition text (VP)
Unchanged this session. Authoritative reference: `Vialuce_Claude_Context_Marketing.md` / `Vialuce_Claude_Context_Sales.md`. Core: complex comp rules centralized + automated, errors and reprocessing eliminated, every calculation auditable and explainable, t-1 data for reps/managers, native clawbacks/reversals/retroactive recalculation, real-time manager visibility.

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

**Risks:**
1. **SR-42 convergence-touch (HF-262).** The fleet fix may require convergence to emit a `scope_aggregate` (vs the current plain `reference` tree) — a convergence-touch. Mitigation: the SR-42 disposition (IRA Class A vs broken-path-repair + ADR-isolation) is the first gate; the HF-262 ADR confirms isolation before any edit. Do not dispatch HF-262 until this is dispositioned.
2. **HF-262 scope creep.** The hub-metadata fix may incidentally touch entity metadata adjacent to the variant-label defect; DD-7 / AP-D6 guard against expanding into variant-explainability repair under HF-262.
3. **Dangling DIAG directive cite.** The DIAG-58 artifacts cite the directive as `DIAG-050_DIRECTIVE` (the directive was never committed under a corrected name). If that directive is ever committed it must be `DIAG-58_DIRECTIVE` with the two cites updated. Orthogonal to HF-262; low priority.
4. **CRP Plans 2+4 still open.** Plan 4 does not exist as a live rule_set; if reintroduced it uses the complete peer-entity path. Not on the immediate critical path but a User-Ready gate.

**Open questions:**
1. **SR-42 disposition for HF-262** — IRA Class A first, or broken-path-repair + ADR-isolation? (Pending architect.)
2. **HF-262 number confirmation** — confirmed HF-262 this turn; ensure it is next-unused against the repo at session open (numbers drift; architect holds the sequence).

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

**Turn 1 — orientation (Claude reads, in project knowledge + pasted handoff).** New-Conversation Claude reads Section -1 (strategic frame) then Section 0, and states a one-paragraph orientation explicitly grounding in Section -1 sub-sections 3 (milestone: Meridian demo-ready via fleet correctness) and 4 (binding constraint: HF-262 ships and reconciles Meridian Q1 to 185,063/175,585/196,337). **Andrew confirms or corrects.**

**Turn 2 — verification (default: ZERO verification commands).** Per Corrections 2 + 5, the handoff body is the source of truth. Turn 2 is a single verbal confirmation: **"Any manual state changes to git, Supabase, Vercel, or credentials since session close (dev HEAD `e85a7678`)? If none, proceed."** (No git/ls/status commands — none would change the next action. Section 18 names no risk requiring a fresh check.)

**Turn 3 — first action (Andrew dispositions, then Claude acts).** Andrew dispositions **SR-42 for HF-262** (IRA Class A first, or broken-path-repair + ADR-isolation). Then:
- If IRA Class A: Claude drafts the IRA Class A prompt (VG `prompts/`), Andrew dispatches per the IRA atomic-capture SOP.
- If repair-suffices: Andrew confirms HF-262 is next-unused, commits `HF-262_DIRECTIVE_20260601.md` to `docs/vp-prompts/`, and pastes it to CC. CC's first deliverable is `docs/completion-reports/HF-262_ADR.md` (lever selection, HALT-1).

## SECTION 20 — PATH DETAIL

**Path A — HF-262 (Meridian fleet projection + hub exclusion).** *Recommended primary.*
- Identifier: HF-262.
- Scope: extend the one scope mechanism for reference-row→member projection (AP-17); exclude hubs as payees by provenance; guard `undefined===undefined` scope match.
- Dependencies: SR-42 disposition (the convergence-touch gate). DIAG-58 (done) is the cause-establishment prerequisite; cite reference `e85a7678`.
- Gates: Phase 1 lever-selection ADR (HALT-1); Phase 2 fix; Phase 3 evidentiary verification (per-hub aggregate self-consistency, DD-7 c0–c3 preservation, hub-exclusion footer, `undefined` guard proof) against the Meridian anchors line-item.
- Meta rules baked in: DD-7 (c1–c4 unchanged), AP-17 (one path), AP-25/Korean Test (no literals), AP-D6 (no smuggled variant-label expansion), SR-42 (convergence-touch).
- Estimated: one focused session (ADR + fix + verification).
- Sequencing: first; it is the binding constraint to Meridian demo-readiness.

**Path B — CRP Plans 2+4.** Deferred. Plan 4 not a live rule_set; reintroduction uses the complete peer-entity path. Sequence after HF-262.

**Path C — deferrable hygiene/hardening.** `undefined` guard (folded into HF-262), variant explainability, AUD-005/AUD-0015 refresh post-HF-262, branch hygiene, `scale_annotation` warnings. None on the critical path; do only if blocking.

**Recommendation across paths:** Path A (HF-262), gated on the SR-42 disposition in Turn 3. It is the single binding constraint to Meridian demo-readiness; everything else defers until it ships and reconciles.

### DATA DEPENDENCIES / QUICK REFERENCE
- **Tenants:** BCL `b1c2d3e4-aaaa-bbbb-cccc-111111111111` (anchor $312,033, PASS); Meridian `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (anchors Jan 185,063 / Feb 175,585 / Mar 196,337; rule_set `2fb555d4-53fe-42e8-9662-cae3d07da4f4`; latest batch `e1098ffa`); CRP `e44bbcb1-2710-4880-8c7d-a1bd902720b7` (Plans 1+3 PASS $364,457.84; pre-clawback ref $561,317.05; Plans 2+4 open).
- **VL Admin:** `platform@vialuce.com` / UUID `9c179b53-c5ee-4af7-a36b-09f5db3e35f2`.
- **Refreshed calc reference:** `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md` (supersedes `5314c365`).
- **Ground-truth files (architect-channel; reconciliation only):** `BCL_Resultados_Esperados.xlsx`, `Meridian_Resultados_Esperados.xlsx`, `CRP_Resultados_Esperados.xlsx`.
- **Stack:** Next.js · Supabase · Vercel Pro · Cloudflare · Resend · Anthropic API. VP repo `CCAFRICA/spm-platform` (branch `dev`, HEAD `e85a7678`).
- **Reconciliation-channel separation:** anchors above are architect-channel; they do NOT appear in HF directives or CC paste blocks.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*SESSION_HANDOFF_20260601.md — Session close 2026-06-01*
*BCL verified PASS; Meridian fleet root-caused to Condition A (DIAG-58) and fix drafted (HF-262); 4 Meta candidates in flight; forward state = disposition SR-42, then dispatch HF-262.*
