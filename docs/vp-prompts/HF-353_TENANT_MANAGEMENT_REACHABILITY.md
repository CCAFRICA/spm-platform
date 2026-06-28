# HF-353 — Tenant Management Reachability (Verify the Surface · Restore the Entry Point · Honest Labels)

**Mode:** ULTRACODE — objective + invariants + proof gates. CC owns the HOW, **but the work branches on discovery** (§1, §5.1): establish what actually exists before building on it. **Scope narrowing is a HALT condition; so is silently building past an absent surface.**

**Why.** HF-352's completion report states it built a tenant-management surface at `/admin/tenants` (Clean Slate, Delete Tenant, the relocated prism toggle). But the only browser evidence is that navigating to `/admin/tenants` **redirects to `/select-tenant`** — the surface is not reachable, and its existence cannot be taken for granted. Separately, the Observatory Operations Queue buttons ("View Tenant", "Resume", "Run Calculation") **all route to the same place** (the tenant's `/stream` or `/operate`) — the varied labels lie about what they do. And historically the **edit-Tenant entry lived on the tenant cards**, where it no longer is.

This is the third reachability failure in this arc (the prism toggle with no home; `/admin/tenants` redirecting away; now no entry point + dishonest labels). Each underlying build tested green; each missed whether a human can *reach* the surface. **This HF's deliverable is navigability, not passing tests** — and its first act is to find out what is actually there, because a completion-report claim is not ground truth.

---

## §0 — Header & cross-links

| Field | Value |
|---|---|
| Work item | **HF-353** *(architect-assigned; genuinely hotfix-shaped — reachability defects in merged work. CC runs a collision gate and HALTs on collision.)* |
| Repo | `CCAFRICA/spm-platform` — app under `web/`, **git from repo root**. Branch off `main`: `hf-353-tenant-management-reachability` (or CC's chosen name). |
| Standing rules | `CC_STANDING_ARCHITECTURE_RULES.md` at top · DD-1…DD-12. Commit + push after every change. Kill dev → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report. |
| Binds | HF-352 (`/admin/tenants` surface — **verify, reuse, do not rebuild**) · the OB-250 prism toggle (now homed in HF-352) · DS-014 (capability-derived; `platform.system_config`; **no new role, no role-string**) · the existing Observatory / tenant-card components (match + reuse) · Decision 123 · Decision 158 (preserved — no LLM, no data-pipeline change) |
| Architect-only (SR-44) | **The browser navigability walk is the proof** — from a tenant card, reach the surface; by URL, reach it; the buttons say what they do. `gh pr` **merge**; production sign-off. CC authors / commits / PRs; **never merges; never self-attests browser truth.** |

### CRF + PCD — visible checklist (CC confirms before building)
- [ ] Seed logged: `HF-353 / Cite: /admin/tenants redirects to /select-tenant — surface unreachable, existence unverified; queue labels dishonest; edit-Tenant entry missing from cards / ULTRACODE`.
- [ ] **Collision gate:** `HF-353` unused in the live repo. HALT on collision.
- [ ] **Reality Gate 0 (§5.1)** cleared — the ACTUAL state of the HF-352 surface established from the live codebase + redirect trace, recorded BEFORE any build. **If the surface does not exist / cannot render → HALT and surface (do not rebuild).**
- [ ] **Architecture Decision Gate** recorded (the branch taken + chosen fix).
- [ ] **SR-39 gate (§5.3)** cleared — reachability must not bypass the capability gate.
- [ ] Anti-Pattern Registry (§6A) checked.
- [ ] CC paste block: **this file is the prompt (DD-11).** Ends at §6A; nothing follows.

---

## §1 — Objective

**First, verify. Then, depending on the truth, fix reachability.**

1. **Establish ground truth (Reality Gate 0).** Determine — from the live codebase and a redirect trace, not from the HF-352 report — whether the `/admin/tenants` surface **exists and can render**, and **what intercepts the URL and redirects it to `/select-tenant`** (a middleware/layout guard requiring a selected tenant? a capability redirect? a missing route falling through a catch-all?). Record the finding.

2. **Branch on the finding:**
   - **If the surface EXISTS** (the page renders when its guard is satisfied): the defect is *reachability*. **(a)** Correct the redirect cause so a platform-capability admin reaches the surface **by URL** — a tenant-management/list surface must not require a pre-selected tenant. **(b)** Restore the **edit/manage-Tenant entry on the tenant cards** (its historical home), opening the existing surface for that tenant. **(c)** Fix the Operations Queue labels.
   - **If the surface DOES NOT EXIST or cannot render** (no page, a stub, or broken): **HALT and surface.** Report the true state plainly — HF-352's report overstated delivery; the surface itself needs building/repair, which is an architect decision (re-open HF-352, or expand this HF by direction). **Do not silently build a new surface.**

3. **Honest labels (independent of the branch).** The Operations Queue actions all route to the tenant's `/stream`/`/operate`; relabel them to say what they do — **"Go to tenant"** (or equivalent honest label) — so no label implies an action it does not perform. **Behavior is unchanged** (enrichment is out of scope, §2).

---

## §2 — Scope

**In scope:** establishing the true state of the HF-352 surface; **if it exists** — correcting the redirect so it's URL-reachable, restoring the edit/manage-Tenant entry point on the tenant cards (reusing the existing surface), and the capability-correct wiring of that entry; the honest relabel of the Operations Queue actions.

**Out of scope (named):**
- **Rebuilding the HF-352 surface** if discovery finds it absent — that is a HALT/architect decision, **not** silently in scope.
- **Making the Operations Queue buttons functionally richer** (a real Resume of a stalled lifecycle, a real Run Calculation) — a separate piece; this HF makes the labels *honest*, not the actions *distinct*.
- **The HF-352 destructive engine** — the deletion logic, the two-step confirmation, the destructive-route capability gates are merged and proven; **do not modify them.**
- **Broader navigation reorganization** beyond the entry point and the labels.
- **The data pipeline / engine / membrane** — untouched; no LLM (Decision 158 preserved).

---

## §3 — Invariants (the constraints CC holds; each verified in §4)

- **I1 — Reality over report (the governing principle).** CC establishes the ACTUAL live state of the HF-352 surface (route existence, render, redirect cause) from the codebase and a trace, BEFORE building entry points. The HF-352 completion report's claims are **not** assumed true; they are checked.
- **I2 — Navigability is the deliverable.** The fix is judged by whether a human reaches the surface from where they look (the tenant card) and by URL — **not** by tests passing. A surface that exists but is unreachable is **not done**.
- **I3 — Branch on truth; HALT if absent.** If the surface does not exist or cannot render, CC **HALTS and reports the true state** — it does not rebuild, assume, or paper over. (This is the honest handling the session's pattern of unreachable-but-green surfaces demands.)
- **I4 — Restore the historical entry point.** The edit/manage-Tenant affordance returns to the **tenant cards**, opening the **existing** HF-352 surface for that tenant — not a new surface, not a different location.
- **I5 — Honest labels.** The Operations Queue actions say what they do ("Go to tenant"); no label implies an action it does not perform. Behavior unchanged.
- **I6 — Capability-gated, reuse not parallel.** The entry point and the route reach the surface only for `platform.system_config` holders (the existing gate) — **no new role, no role-string, no parallel surface or route.** Reuse HF-352's surface; do not create a second one.
- **I7 — No destructive-path disturbance.** This HF touches navigation and labels only; the HF-352 deletion engine, confirmation gate, and destructive-route gates are **untouched** and their tests still pass.
- **I8 — Constitutional set preserved.** No LLM, no data-pipeline change (Decision 158 intact).

---

## §4 — Proof gates (evidence)

**Note on proof for a reachability HF:** the defect class is "tests green but the human can't get there," which unit tests structurally cannot catch. So CC proves the **code-level** facts (route present, redirect cause traced + corrected, entry point wired, label changed, surface reused not rebuilt), and the **architect** confirms the **browser navigability** (SR-44). PASS/FAIL self-attestation of reachability is not accepted from CC.

- **P0 — Reality established (I1/I3).** The true state of `/admin/tenants` is recorded: does the page file exist? what intercepts the URL → `/select-tenant`? *Evidence: grep/view of the route file (present or absent) + the traced redirect cause.* **If absent → HALT report here; the gates below apply only on the EXISTS branch.**
- **P1 — URL-reachable (I2).** The redirect cause is corrected so a `platform.system_config` admin reaches the surface by URL (no wrongful bounce to `/select-tenant`). *Evidence: the code change; **architect browser-confirms**.*
- **P2 — Entry point restored (I4).** The edit/manage-Tenant affordance on the tenant cards opens the existing surface for that tenant. *Evidence: the wired link in code; **architect browser-confirms** the card → surface path.*
- **P3 — Honest labels (I5).** The Operations Queue actions are relabeled to what they do. *Evidence: the label change; **architect browser-confirms**.*
- **P4 — Reuse, not rebuild (I6).** The entry point opens HF-352's existing surface (Clean Slate / Delete / toggle); **no parallel surface or route created**; gate is the existing capability. *Evidence: grep/view showing the single surface + the capability gate, zero role-string.*
- **P5 — Destructive path untouched (I7).** HF-352's deletion engine, confirmation, and destructive-route gates are unmodified; their tests still pass. *Evidence: grep (no changes to those files) + the HF-352/OB tests green.*

---

## §5 — Reality, schema & compliance gates (run BEFORE building)

### §5.1 — Reality Gate 0 (the verify-first gate; HALT branch)
Before any build, establish and record: **(a)** does `app/admin/tenants/page.tsx` (or the equivalent the HF-352 report named) **exist** in the codebase, and is it a real surface vs a stub? **(b)** What **intercepts** `/admin/tenants` and redirects to `/select-tenant` — trace the middleware + any `/admin` layout/route guard; identify the exact cause. **(c)** Are there **remnants** of the historical edit-Tenant card entry (removed/orphaned) to restore rather than build fresh? Record findings in the Architecture Decision Gate. **If the surface does not exist or cannot render, HALT and surface the true state — do not rebuild.**

### §5.2 — Schema Gate (FP-49, conditional)
This HF is navigation + labels; if it touches **no** SQL, note that explicitly. If any route it wires touches data, query the live schema first and paste it. No SQL ships unverified.

### §5.3 — SR-39 Compliance Gate
Reachability must not bypass access control: the corrected URL route and the card entry point reach the surface **only** for `platform.system_config` holders; the fix does not expose the destructive surface to non-admins. Verify against SOC 2 CC6 / DS-014 / Decision 123.

---

## §6 — Completion report & PR

- Completion report at **`docs/completion-reports/HF-353_COMPLETION_REPORT.md`** (NOT the repo root). Include: the **Reality Gate 0 finding** (the surface's true state + the traced redirect cause) front and center; the branch taken; each applicable §4 proof gate with evidence; the SR-39 note; the Anti-Pattern Registry pass. **If HALTED at Gate 0, the report is the finding** — the true state and the recommendation, no build.
- Final step (EXISTS branch): **`gh pr create --base main`** with a descriptive title + body. CC stops at "ready to merge." **The architect merges and performs the navigability walk (SR-44).**

---

## §6A — Anti-Pattern Registry (checked every build) + closeout

- **No building on an unverified claim** (I1) — reality established first.
- **No "tests pass" mistaken for "reachable"** (I2) — navigability is the proof.
- **No silent rebuild past an absent surface** (I3) — HALT and surface instead.
- **No parallel surface / route / role-string / new role** (I6) — reuse HF-352's surface, the existing capability gate.
- **No dishonest label** (I5) — the action says what it does.
- **No destructive-path change** (I7) — HF-352's deletion engine + confirmation untouched.
- **No registry / set-membership validation** — capability-gated structurally.
- **No LLM / data-pipeline change** (I8) — Decision 158 preserved.

*This file is the prompt (DD-11). It ends here. Nothing follows §6A.*
