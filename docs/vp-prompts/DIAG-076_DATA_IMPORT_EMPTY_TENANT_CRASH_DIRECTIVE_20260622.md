# DIAG-076 — Data Import Empty-Tenant Critical-Error Crash

**Date:** 2026-06-22
**Repo:** VP (`CCAFRICA/spm-platform`)
**Class:** UI render crash on the import path for a tenant with no prior import — recurrence of **CLT167-F03** (`/operate/import/enhanced` crash), prescribed fix never completed/regressed
**CLT source:** CLT-227 — architect browser-verification session (same pass that produced DIAG-075); this defect observed at `app.vialuce.ai/data/import`
**Mode:** DIAG → structural fix in one work item (ULTRACODE; HARD HALT after root-cause confirmation if out-of-class)
**Directive path (this file):** `docs/vp-prompts/DIAG-076_DATA_IMPORT_EMPTY_TENANT_CRASH_DIRECTIVE_20260622.md`
**Root-cause + completion report path:** `docs/diagnostics/` (NOT `docs/completion-reports/`, NOT project root)

> **Dispatch note (architect-channel — the only non-CC line):** Number assigned by architect under CRF, 2026-06-22: **DIAG-076** (075 is occupied by the 2026-06-21 financial-page / persona-switching performance profile). Everything from §0 onward is the prompt; the file is the prompt and is pasted to CC verbatim.

---

## §0 — CC Standing Rules header

This directive binds to **`CC_STANDING_ARCHITECTURE_RULES.md`** (live copy in the repo — **read it from the repo, do not rely on any cached/older copy**). The following are binding throughout and are the spine of this work item:

- **AP-17** — Two (or more) code paths for the same feature → **single pipeline, one entry point**. This is the named anti-pattern at the center of this defect (three import routes exist).
- **SR-34 (No Bypass)** — Diagnose and fix **structurally at the class layer**, not the instance. Instance closure that leaves sibling surfaces defective is provisional. (DS-014 Phase 1 named this as **FP-69 "fix one route, leave others"** and **FP-72 "sidebar fix ≠ in-page button fix."** Do not repeat them.)
- **Decision 158 (LOCKED)** — Every fix is a **subtraction**: remove the divergent/redundant path; do not add an enumerated guard at one site and call the class closed.
- **Decision 77** — SCI is the canonical import. The CLT167-F03 resolution is literally *"Route consolidation per Decision 77."* **Read Decision 77 from the live decision registry** (`INF_DECISION_REGISTRY` / governance index) and confirm its consolidation scope before acting on it.
- **SR-43 (Ship = merge + production verification + report with SHA)** and **SR-44 (browser verification, SQL Editor migrations, PR merges are architect-only)** — **CC opens the PR; CC does NOT merge; CC does NOT self-attest browser state.** Final browser confirmation of the fix is performed by the architect.
- **`CC_DIAGNOSTIC_PROTOCOL.md` RULEs 19–24** — RULE 21 (trace the **actual** code path before any fix), RULE 22 (headless/static-first; browser is last resort and is the architect's, per SR-44), RULE 23 (diagnostic cleanup mandatory), RULE 24 (max diagnostic rounds → failure analysis, not a 4th attempt).
- **Korean Test** and **AI-First/No-Hardcoding** — no language-specific or field-name literals introduced anywhere in the fix.

Drafting-discipline source for this directive: **`INF_Structured_Compliant_Drafting_Reference_20260513.md`** (file-is-the-prompt; the file ends at §6A; no tail summary / no separate CC execution block).

---

## §1 — Problem Statement

### 1.1 The defect (production, reproducible)

On `app.vialuce.ai`, a fresh-session admin who selects a tenant **with no previously-imported data** and then begins an import receives a **full-page error-boundary crash**: a centered red triangle, *"Something went wrong / A critical error occurred. Please refresh the page,"* and a **"Try Again"** button — rendered **without page chrome** (no sidebar, no "Import" header).

**Exact reproduction (architect, incognito):**
1. New login (fresh session, no cached client state).
2. Select a tenant.
3. The tenant has **zero prior imports** (empty state).
4. Land on the import screen (URL bar observed: `app.vialuce.ai/data/import`).
5. **Select an import action.**
6. → Crash.

**Workaround that proves it is a first-mount / empty-state condition:** browser refresh **+** back button → the path then works. The crash does not reproduce on the second mount.

### 1.2 Why the visible message is not the real error

The full-page *"A critical error occurred"* with a *"Try Again"* (reset) control is a **top-level error boundary** catching a **thrown exception during render** (or a render triggered by an event handler). It is **distinct** from the in-page SCI `error` phase (which renders *inside* the page chrome with an `AlertCircle` and an indigo "Try Again"). The boundary **swallows the real stack** — the digest, the throwing component, and the line. **Capturing that real throw is Phase 1's first job.** Nothing downstream is asserted as root cause until it is captured.

### 1.3 Known lineage — this is a recurrence, not a new defect

The import surface has a documented **three-route divergence** (the original consolidation intent is **CLT72-F27**, *"Duplicate import paths (3 → should be 1)"*). Routes observed in the AUD-001 code snapshot (current state **must be re-verified per RULE 21** — the snapshot may be stale):

| Route | File (per AUD-001 snapshot) | Apparent behavior |
|---|---|---|
| `/operate/import` | `web/src/app/operate/import/page.tsx` | Canonical **SCI state machine** (upload→analyzing→processing→proposal→executing→complete→error). Handles empty tenants. |
| `/data/import/enhanced` | `web/src/app/data/import/enhanced/page.tsx` (~4,359 lines) | **Legacy "Data Package Import."** Derives target fields **from the tenant's compensation plan** (`extractTargetFieldsFromPlan(plan)`). |
| `/data/import` (the screenshot URL) | `web/src/app/data/import/page.tsx` (~11 lines) | **Redirect stub.** Header comment: *"Superseded by Enhanced Import at /data/import/enhanced."* **The actual `redirect()` target is ambiguous in the snapshot** (one extract shows `'/operate/import'`; the comment points at `/data/import/enhanced`). **Resolve this in Phase 1.** |
| `/data/imports` (plural) | `web/src/app/data/imports/page.tsx` (~11 lines) | Redirect → `/operate/import`. |
| `/operate/import/enhanced` | `web/src/app/operate/import/enhanced/page.tsx` (~10 lines) | Redirect → `/operate/import`. |
| `/admin/launch/plan-import` | redirect → `/operate/import` | |

Critically, **`DS-014_Access_Control_Architecture` already logged this exact crash as CLT167-F03 — "/operate/import/enhanced crash" — with the resolution "Route consolidation per Decision 77," assigned to DS-014 Phase 1.** It is still live in production. The consolidation is **half-done**: several stubs redirect to `/operate/import`, but the **plan-assuming legacy page still exists and is reachable**.

### 1.4 Leading hypothesis (to confirm or refute in Phase 1 — NOT yet a conclusion)

An **empty tenant has no compensation plan**. A surface that derives its fields from `plan` (the legacy `/data/import/enhanced` page) will **dereference null** when there is no plan, throwing at render → caught by the top-level boundary → full-page "critical error." The empty-tenant import path appears to route (directly, via the `/data/import` redirect, or via the operate landing logic in `web/src/app/operate/page.tsx`) onto this plan-assuming surface. The second mount succeeds because re-entry resolves to the empty-safe `/operate/import`, or because context is warmed.

**This is the most probable class. It is not confirmed.** Phase 1 confirms it against the **current** code and the **captured** throw, or refutes it and HALTs.

---

## §2 — Discipline applications (substrate-bound)

- **Reconciliation-channel separation:** **N/A for this work item.** No ground-truth payout values, no reconciliation targets, no verification anchors are involved. This is a render/routing defect. No GT content enters this directive or any report it produces.
- **Schema / SQL surface:** **N/A.** No DDL, no migration, no DB write. Phase 1 may *read* routing-decision counts (e.g., `committed_data`, `calculation_batches`) only to trace the path; it writes nothing. The **SQL Verification Gate / FP-49** therefore do not apply (there is no SQL to verify). State this explicitly in the report rather than omitting it.
- **Decision 158 (subtraction):** the structural fix, if the hypothesis holds, **removes** a code path (the divergent route + the reachable legacy surface), it does not add an enumerated null-guard at one render site. Removing the path closes the class; guarding one site does not.
- **AP-D2 (instance-vs-class) / SR-34:** DS-014 Phase 1 was supposed to close CLT167-F03 and did not. **Do not let an instance fix masquerade as class closure again.** Class-closure proof = **every** import route resolves to the single empty-safe entry point, and **no** route (direct, redirect, or landing-derived) can deliver an empty tenant to a plan-assuming surface.
- **Vertical slice:** one work item, one PR — routing → page render → empty-tenant state. No engine change is expected; do not split.

---

## §3 — Phase prose (the executable)

### §3.1 — Phase 1: Reproduce, capture the real throw, trace the path, classify  *(DIAG core)*

**Objective:** produce the **actual** thrown error and the **actual** route resolution for an empty tenant in the **current** code — not the AUD-001 snapshot, not this hypothesis.

Sub-steps:

1. **Re-verify the import routes in current code (RULE 21).** Enumerate every import entry point and its behavior. Minimum:
   - `grep -rn "redirect(" web/src/app/data/import web/src/app/data/imports web/src/app/operate/import` — capture each stub's **actual** target.
   - Read `web/src/app/data/import/page.tsx` end-to-end and record the **real** `redirect()` target (resolves the §1.3 ambiguity).
   - Read `web/src/app/operate/page.tsx` (operate landing routing). Record **where an ICM tenant with NO data and NO calculations is routed** (the empty-tenant branch). Confirm whether that branch can deliver the user to `/data/import/enhanced`.
   - Confirm whether `web/src/app/data/import/enhanced/page.tsx` is still the ~4,359-line legacy page or has been changed/retired.
   - Paste all grep/read output into the report.

2. **Identify the top-level error boundary** rendering *"A critical error occurred. Please refresh the page"* + *"Try Again."* (`grep -rn "critical error occurred"` / `"Something went wrong"` / `error.tsx` / `global-error.tsx` / any custom `ErrorBoundary` wrapping the authenticated shell.) Record the file.

3. **Capture the swallowed throw.** Use the highest-fidelity source available without making the architect a debugger (RULE 22), in this order:
   - Read the boundary component; if it has access to the `error` object / `digest`, **temporarily** surface it to a server log or a single file-based diagnostic (`/tmp/vialuce-diagnostic.json`) — **not** a console flood (RULE 20), and **removed before final commit** (RULE 23).
   - Reproduce the empty-tenant import path locally against an empty tenant (or a tenant fixture with **no plan and no committed_data**) and read the **source-mapped** component stack from the dev overlay / server logs.
   - If a production-only capture is needed, read the **Vercel runtime logs** for the digest and correlate.
   - **Deliverable:** the throwing **component + file + line**, and the **exact** error (e.g., the property dereferenced on the null/absent plan, or whatever it actually is).

4. **Classify against the leading hypothesis.** State plainly: is the confirmed throw the **empty-tenant-reaches-plan-assuming-surface** class (§1.4), or something else (e.g., the SCI page itself throwing on empty state; an auth/tenant-context **hydration race** where `tenantId` is null on first mount and an action handler dereferences it; a Next.js redirect-in-render error)?

**Phase-1 proof gate (paste, do not self-attest):**
- Pasted route map (grep + the real `/data/import` target + the operate-landing empty-tenant branch).
- Pasted identification of the error-boundary file.
- Pasted **real** throw: component, file, line, and the exact error message/dereference.
- One-sentence class verdict.

**→ HALT-1 (mandatory decision point).** If the confirmed class is **NOT** §1.4 (empty-tenant → plan-assuming surface / route divergence), **STOP. Do not implement any fix.** Write the root-cause analysis to `docs/diagnostics/` and surface to the architect for disposition (SR-42 / RULE 24). Proceed to §3.2 **only** if the confirmed class is §1.4.

### §3.2 — Phase 2: Architecture Decision (Section B gate — committed before any fix)

Commit an `ARCHITECTURE DECISION RECORD` to `docs/diagnostics/` weighing at least:

- **Option A — Route consolidation (subtraction; CLT167-F03 / Decision 77 prescription).** Collapse every import entry point to the single empty-safe SCI page (`/operate/import`). Retire the legacy `/data/import/enhanced` page from the live path (redirect it; or remove it if Phase-1 confirms no unique reachable capability). Fix the operate-landing empty-tenant branch so it never targets a plan-assuming surface. **This removes the divergence — closes the class.**
- **Option B — Make the legacy `/data/import/enhanced` page empty-safe** (guard the null-plan path). *Note explicitly:* this is an **instance** fix (AP-D2 risk) and **preserves the AP-17 / CLT72-F27 divergence** — it does not close the class. Reject unless Phase 1 shows the legacy page carries unique, currently-required capability that `/operate/import` lacks.
- **Option C — Route guard** so empty tenants are deflected from any plan-assuming surface to `/operate/import`, without yet retiring the legacy page.

For each: scale test (10x) / AI-first (any hardcoding?) / atomicity / **does it close the class or only the instance?** Choose, with the rejection rationale. The default, per Decision 158 + AP-17 + CLT167-F03, is **Option A** — but only after Phase 1 confirms `/operate/import` itself renders cleanly for an empty tenant (otherwise consolidating onto it just relocates the crash; verify it first).

### §3.3 — Phase 3: Implement the structural fix

Implement the chosen option. Constraints:
- **Subtraction over addition** (Decision 158): prefer removing/redirecting the divergent path over adding guards.
- **Korean Test / AI-First:** no field-name or language literals introduced.
- If Option A: ensure **every** route in the §3.1 map resolves to `/operate/import`, and the operate-landing empty-tenant branch targets `/operate/import` (or a safe empty-state surface), not the legacy page.
- Commit + push after the change (feature branch off `main`; `main` is PR-protected — **do not push to main, do not merge**).
- Rebuild clean: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000`.

**Phase-3 proof gate (paste):**
- `git diff` of the consolidation/redirect/removal.
- Re-run the §3.1 route grep → paste output proving **a single import entry point** remains and **zero** reachable plan-assuming import surfaces for an empty tenant (class-closure evidence — AP-D2 / SR-34).
- Pasted clean `npm run build` output.
- RULE 23 cleanup confirmation: zero residual `[DIAG]`/`[TRACE]` logging; the Phase-1 diagnostic instrumentation removed; any `/tmp/vialuce-diagnostic*` not committed.

### §3.4 — Phase 4: Verification handoff (architect-only browser, SR-44)

This is a UI render crash; final verification is a browser action and is **the architect's** (RULE 22 Level 5 + SR-44). CC does **not** self-attest the browser outcome.

CC delivers to the architect, in the report, the **exact** verification script for the architect to run:
- Incognito → new login → select an empty tenant (no plan, no committed_data) → import → **select an import action** → **expected: the import surface renders, no full-page "critical error."**
- Plus the second-mount and back-button checks (to confirm the asymmetry is gone).

CC opens the PR (`gh pr create --base main --head <branch>` with descriptive title + body). **The architect merges and performs the browser verification** (SR-44). SR-43 closure (status move) happens **only** on the architect's production-verified browser confirmation + the report SHA.

---

## §4 — HALT Conditions

- **HALT-1 (§3.1):** Confirmed root-cause class ≠ §1.4 → stop before any fix; write root-cause analysis to `docs/diagnostics/`; surface for architect disposition. (Do not attempt a speculative fix; RULE 24.)
- **HALT-2:** Phase 1 shows the legacy `/data/import/enhanced` page carries unique, currently-reachable, currently-required capability not present in `/operate/import` → stop before retiring it; surface the capability gap so the architect decides Option A-with-port vs Option C.
- **HALT-3 (RULE 24):** If, after **3** diagnostic rounds, the real throw has not been captured, stop and write the failure analysis (what was tried each round; what the data shows; where the model of the code diverges from runtime; a *different* recommended approach) — not a 4th attempt.
- **HALT-4:** Any step would require pushing to `main`, merging a PR, running a SQL migration, or asserting a browser result → stop; these are architect-only (SR-44).

## §5 — Reporting Discipline

- **Root-cause analysis + completion report:** `docs/diagnostics/DIAG-076_<slug>_REPORT_20260622.md` (DIAG artifacts live in `docs/diagnostics/` — **NOT** `docs/completion-reports/`, **NOT** project root).
- **Mandatory contents:** the Phase-1 route map; the error-boundary file; the captured real throw (component/file/line/message); the class verdict; the Architecture Decision Record; the Phase-3 `git diff` + class-closure grep + clean build; the RULE 23 cleanup attestation; the architect verification script; the PR URL + branch + final SHA.
- **Evidentiary standard:** pasted code, pasted terminal output, pasted grep results for every gate. **PASS/FAIL self-attestation is not accepted** (AP-9/AP-10).
- **ARTIFACT SYNC block** (channel separation — CC emits deltas; CC does not edit governance artifacts) appended to the report:
  ```
  ARTIFACT SYNC
  MC: [item id for this crash → status; any new items discovered]
  REGISTRY: [import-route row → evidence; legacy-page retirement to record]
  R1: [any user-ready criterion this unblocks → status evidence]
  BOARD: [CAPS field deltas]
  SUBSTRATE: [CLT167-F03 recurrence; FP-69/FP-72 exercised; Decision 77 / AP-17 / Decision 158 applied]
  ```

## §6 — Out of Scope

- **Excessive session-state polling (~1 request/second)** on the import/empty-tenant surface — a separate pathology (a looping fetch, not a render throw). **Not fixed here.** Named in §6A.
- **Empty-tenant guidance UX** (CLT166-F02/F03: empty surfaces with no "import your first file →" action). Out of scope; this DIAG fixes the **crash**, not the empty-state guidance.
- **Console flood on empty tenant** (CLT166-F04 — intelligence loader looping when no data exists). Out of scope; possibly shares an empty-tenant root with the polling item; named in §6A.
- Any change to the SCI import pipeline behavior itself (classification, fingerprinting, commitment).

## §6A — Residuals

- If Phase 1 reveals the crash is an **auth/tenant-context hydration race** (`tenantId` null on first mount) rather than the route-divergence class, that is a **different defect** requiring its own work item (context-readiness gating) — route consolidation alone would not close it. (This is why HALT-1 exists.)
- **Polling (~1/s)** and **empty-tenant console flood** (CLT166-F04) remain open after this DIAG; recommend a follow-on work item scoped to empty-tenant loop suppression (they may share a root and close together).
- If Option B or C is chosen over Option A (legacy page kept), the **AP-17 / CLT72-F27 route divergence remains an open class** and must carry a forward reference to a consolidation OB — record it so the class is not silently considered closed.
