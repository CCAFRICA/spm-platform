# FIX & CLT REGISTER — 2026-06-13 session

**Purpose:** single-page actionable register of every fix, work item, and CLT verification identified in the 2026-06-13 session, for direct hand-off to the next conversation.

**Relationship to the handoff:** this is an **index + delta**, not a replacement. Most items below are already in `SESSION_HANDOFF_20260613.md` (section pointer given). Two items were under-captured there and are flagged **NET-NEW**. Use this register as the working checklist; use the handoff for full context, provenance, and discipline.

**Status legend:** `HANDOFF §X` = already captured, see that section · `NET-NEW` = surfaced only here · `[ ]` = open task.

---

## A — FIXES / WORK ITEMS (priority order)

| ID | Type | Item | Priority | Status |
|---|---|---|---|---|
| F1 | DIAG | **Meridian convergence regression.** Previously-CLOSED tenant aborts at convergence post-OB-203/HF-285. `Utilización de Flota [coordinador]` component_9 missing `cargas_totales_hub`; HF-222 rejected the n=9 coordinador-population binding for `Cargas_Flota_Hub`; HF-281 aborts. Root cause UNESTABLISHED. DIAG only — no code change until cause proven. Read HF-222/HF-281/convergence impl + the original `cac8c391`-era closure; `conversation_search` the original closure first. | **P0 (binding — correctness)** | HANDOFF Path A, §-1.4A, §0#2, R1/R2 |
| F2 | DS | **DS-028 experience layer** — three deliverables: (a) completion screen reflects operation type (plan shows plan name / variant count / component names / per-component status, NOT zeroed data-import metrics); (b) post-import data surfacing (data explorer / entity browser / transaction viewer, no calc dependency); (c) operational feedback (processing indicator during settle-audit/enrichment tail; stop polling; SSE). Design Gate: deliver spec, recommend separate implementation conversation. | **P0 (binding — experience)** | HANDOFF Path C, §-1.4B, §0#3 |
| F3 | HF | **HF-286 polling fix — RE-AUTHOR AS A FILE.** Stop polling `/api/import/sci/session-state` at terminal state and when the analyze proposal awaits user action; telemetry variant same discipline; do NOT change active-processing cadence. The prior-session inline version is **VOID**. Must be a repo MD file with explicit `--- BEGIN/END CC PASTE ---` boundaries. Live production defect (logs unusable). | **P0 (tactical — live)** | HANDOFF Path B, §0#4, D2 |
| F4 | HF/AUD | **Variant-structured components UI-consumer audit.** Suspected root cause of "Meridian: no plan to calculate against." Plan `components` is a `{variants:[…]}` object, not a flat array; any UI/route consumer reading `components.length` or iterating it as an array reads a variant plan as empty (naive top-level key count = 1 while the real plan has 10 components). Audit ALL consumers of `rule_set.components` for flat-array assumptions; handle the variants wrapper. (Note: after clean-slate reimport the plan did become calculable, so this is a LATENT/SUSPECTED bug, not confirmed — but it is the leading explanation for the original symptom and overlaps DS-028(a).) | **P1** | **NET-NEW** (handoff only in §15 + folded into DS-028(a)) |
| F5 | HF | **Entity-resolution index false-positive.** Sheets/batches skipped because "identifier column looks like row indices" (sequential 1–N IDs trip the heuristic; observed on `location_id`/`cantidad`, and on Meridian-shaped `Datos_Flota_Hub`/`Sucursales`/`Resumen_Sucursal`). Needs a min-cardinality threshold or classification-aware override so real low-cardinality identifiers are not discarded. | **P1** | HANDOFF §20 post-arc (one line) |
| F6 | HF | **Flywheel correction from execution-failure evidence.** The fingerprint flywheel increments matchCount on every encounter regardless of execution success/failure, so a misclassification (e.g. Portada cover-page → plan@80%) entrenches with repetition even after the execution correctly refuses it. Add a post-execute correction loop that demotes a stored classification on execution-failure evidence. | **P2 (post-arc)** | HANDOFF M-A §6, §20 |
| F7 | HF | **Single-flight resume-lease.** DIAG-066 Q2: the single-flight lease (360s) is shorter than a legitimate large commit (~371s on 160k rows), so a valid long commit can lose its lease. HF-213 supersession preserved correctness, not efficiency. | **P2 (post-arc)** | HANDOFF §20 |
| F8 | HF | **Parse-once companion cleanup TTL.** HF-285-D companion artifacts (gzipped parsed workbooks, content-hash keyed) accumulate with no expiry. Add a TTL/cleanup. | **P2 (post-arc)** | HANDOFF §20 |
| F9 | INF | **INF-001 R3 dev/prod substrate separation.** All testing runs on production (shared Supabase). The Next.js "Failed to find Server Action" warning is a benign symptom (stale tab → new deployment). Already-tracked infra blocker for User-Ready. | **P1 (tracked infra)** | HANDOFF §0#5, R5 |

---

## B — CLT VERIFICATION CHECKLIST (forward — **NET-NEW as a consolidated list**)

These are the browser/runtime verifications the next conversation must run as each fix lands. The handoff embeds some of these in path detail and risks; none are enumerated as a checklist. Assign a CLT number from the registry when created.

- [ ] **CLT — Meridian calculates to targets after F1 fix.** $185,063 / $175,585 / $196,337 across Jan/Feb/Mar 2025, all 5 components, both variants. (HANDOFF R3.)
- [ ] **CLT — BCL re-proves after any convergence change.** $312,033 anchor exact, 6 periods. Any F1 fix touches convergence → BCL must re-prove. (HANDOFF R3.)
- [ ] **CLT — HF-286 proof gate.** Zero `session-state` polls in 30s of server log after an import completes. (HANDOFF Path B proof gate.)
- [ ] **CLT — Completion screen reflects operation type (DS-028a).** A plan import shows plan name + variant count + 10 component names + per-component status; a data import shows row/entity/sheet counts. No more "0 Records Imported / Components: —" for a successful plan.
- [ ] **CLT — Post-import data experience (DS-028b).** After a data import, committed_data is viewable in-tenant by sheet/entity/period with no calculation run.
- [ ] **CLT — Variant-structured plan surfaces in Calculate UI (F4).** A 2-variant / 10-component plan appears as calculable in the Calculate UI (regression guard for the original "no plan to calculate against" symptom).
- [ ] **CLT — CRP reconciles after reimport.** Against the authoritative GT (resolve Q1 first). Plans 1–4. (HANDOFF R4.)

---

## C — HOUSEKEEPING (pointers only — all in handoff)

- [ ] Merge or close open PRs **#486 / #421 / #413 / #394 / #379** (read-only diagnostics/audits; merge if clean, close if conflicts). — HANDOFF §2, §20
- [ ] Architect review of **five unknown tenants** for deletion: `07638678`, `dbe3b308`, `03d28288`, `2fdbebce`, `1b770e90` (two carry committed_data; `dbe3b308` produced calc/convergence log noise this session). — HANDOFF §2, R6
- [ ] **CRP reimport** (0 committed_data) before any CRP regression test. — HANDOFF R4, §20
- [ ] Confirm CC committed the **OB-203 Phase 6 completion report** at `docs/completion-reports/OB-203_PHASE_6_COMPLETION_REPORT.md`. — HANDOFF §13

---

## D — OPEN QUESTIONS (must resolve before dependent work)

- [ ] **Q1 — Authoritative CRP GT.** Two figures circulate (~$561,028.97 net per the May 15 handoff; ~$561,317.05 in memory). Resolve against `CRP_Resultados_Esperados.xlsx` (+ any `_CORRECTED` variant) before CRP regression. Do not assert from memory. — HANDOFF Q1
- [ ] **Q2 — Is HF-222 the locus, or is the regression upstream of it?** Determine via F1 whether HF-222's distribution behavior changed in the OB-203/HF-285 arc, or whether the upstream plan interpretation (`8affd52c` vs `cac8c391`) / column comprehension changed such that HF-222 is correctly rejecting a now-different binding. A small-population exemption to HF-222 is premature until this is answered (would risk symptom-patching the regression). — HANDOFF Q2

---

## DISCIPLINE CARRIED (apply to every item above)

- F1 is a **regression**, not "the engine getting more correct" — diagnose, never rationalize (the session's dominant defect; corrected twice by the architect).
- Author every deliverable as a **repo MD file**, never inline (the HF-286 inline-delivery defect).
- **Read the implementation + original closure record before asserting cause** (Rule 19); `conversation_search` the original closure (Correction 18).
- **CRF + PCD** before any draft. Max 3 diagnostic rounds before escalating (Rule 24). No convergence code change until F1 root cause is proven.

---

*Companion to `SESSION_HANDOFF_20260613.md` and `NEW_CONVERSATION_DIRECTIVE_20260613.md`.*
*vialuce.ai · Intelligence. Acceleration. Performance.*
