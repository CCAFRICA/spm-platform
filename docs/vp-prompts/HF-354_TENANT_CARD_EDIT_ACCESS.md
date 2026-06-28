# HF-354 — Tenant Fleet Card → Working Tenant Management Access

**Mode:** ULTRACODE — objective + invariants + proof gates. CC owns the HOW. **The deliverable is fixed and unconditional (§1). Scope narrowing is a HALT condition — including re-framing this build as an investigation.**

**Why.** A platform admin currently cannot reach tenant management. The tenant-management surface (HF-352: the prism_enabled toggle, Clean Slate, Delete Tenant) was built but is **not reachable** — `/admin/tenants` redirects to `/select-tenant`, and there is no entry point from the Observatory. A prior directive (HF-353) was framed verify-first; it merged and the access still does not exist, because its center of gravity was verification rather than the access itself. **This directive corrects that: the deliverable is working access, guaranteed. Verifying the current state of the surface is one early step inside this build — it is not the build, and "merged but still no access" is not an acceptable outcome.**

---

## §0 — Header & cross-links

| Field | Value |
|---|---|
| Work item | **HF-354** *(architect-assigned. CC runs a collision gate against the live repo and HALTs on collision.)* |
| Repo | `CCAFRICA/spm-platform` — app under `web/`, **git from repo root**. Branch off `main`: `hf-354-tenant-card-edit-access`. |
| Standing rules | `CC_STANDING_ARCHITECTURE_RULES.md` at top · DD-1…DD-12. Commit + push after every change. Kill dev → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report. |
| Binds | HF-352 (`/admin/tenants` surface — the destination this links to; reuse, repair if broken, never rebuild a parallel one) · the OB-250 prism toggle homed in HF-352 · the Observatory **Tenant Fleet cards** (the cards at the bottom of `/select-tenant` — Casa Diaz et al.) · DS-014 (capability-derived; `platform.system_config`; no new role, no role-string) · Decision 123 · Decision 158 (preserved — no LLM, no data-pipeline change) |
| Architect-only (SR-44) | **The browser confirmation that the access works is the proof.** `gh pr` **merge**; production sign-off. CC authors / commits / PRs; never merges; never self-attests browser truth. |

### CRF + PCD — visible checklist (CC confirms before building)
- [ ] Seed logged: `HF-354 / Cite: platform admin cannot reach tenant management; restore the edit entry point on the Tenant Fleet cards / ULTRACODE / DELIVERABLE = working access, not investigation`.
- [ ] **Collision gate:** `HF-354` unused in the live repo. HALT on collision.
- [ ] **Architecture Decision Gate** recorded (current state of the destination surface + chosen wiring).
- [ ] **SR-39 gate (§5.3)** cleared — the entry point reaches the surface only for `platform.system_config` holders.
- [ ] Anti-Pattern Registry (§6A) checked — **including the anti-narrowing clause (I0).**
- [ ] CC paste block: **this file is the prompt (DD-11).** Ends at §6A; nothing follows.

---

## §1 — Objective (the unconditional deliverable)

**When this work is done, a platform admin can:**

1. See an **Edit / Manage control on each Tenant Fleet card** on the Observatory (the cards at the bottom of `/select-tenant` — Casa Diaz and every other tenant card).
2. Click it and **land on that tenant's management surface** — the HF-352 surface, scoped to that tenant — where the **prism_enabled toggle, Clean Slate, and Delete Tenant** are present and functional.
3. Do this with the surface **actually rendering** (not redirecting to `/select-tenant`, not 404), confirmed in the browser by the architect.

**This is a guarantee, not a target.** If the destination surface does not render or the route redirects, **this directive fixes that as part of the work** — repairing the redirect/guard so the surface is reachable is in scope. There is **no** "halt and report that it's missing" branch: the access must exist when this is done. (Determining *why* it currently fails is a step toward fixing it, §5.1 — not an alternative to delivering it.)

---

## §2 — Scope

**In scope:**
1. The **Edit / Manage control on every Tenant Fleet card**, opening that tenant's management surface (the existing HF-352 surface), scoped to the tenant whose card was clicked.
2. **Whatever it takes to make that destination render** — correcting the redirect/guard that currently bounces `/admin/tenants` (or the equivalent route) to `/select-tenant`, so the surface is reachable both from the card and, where applicable, by URL for a platform admin. Repairing the destination is part of delivering the access.
3. Capability-correct gating of the entry point and the route (`platform.system_config`).

**Out of scope (named — do not expand into these):**
- **Rebuilding the HF-352 surface or its destructive engine.** The deletion logic, the two-step confirmation, and the destructive-route gates are merged and proven; reuse them, repair only the *reachability*, do not modify the destructive behavior.
- **The Operations Queue button labels** (the "View Tenant"/"Resume"/"Run Calculation" honesty fix) — a separate concern; not this directive.
- **Held-file actions, standing remediation, selective revert, the bypass writers, other-group renames** — untouched.
- **The data pipeline / engine / membrane** — untouched; no LLM (Decision 158 preserved).

---

## §3 — Invariants (the constraints CC holds; each verified in §4)

- **I0 — No scope narrowing; the deliverable is access, not investigation.** This build's output is *working tenant-management access reached from the Tenant Fleet card*. CC may not re-frame the deliverable as "verify whether the surface exists" or substitute a discovery report for the working entry point. Confirming current state (§5.1) is a sub-step; it does not replace the deliverable. If CC finds itself about to HALT with "the surface is missing," the correct action is to **repair/route to it**, not to stop — and if a genuine blocker prevents that, HALT and surface the *specific blocker*, not a narrowed deliverable.
- **I1 — The entry point is on the Tenant Fleet card.** An Edit / Manage affordance on each tenant card on the Observatory, opening that tenant's management surface. Not buried in a submenu; on the card, where it historically lived.
- **I2 — It opens the existing surface, scoped to that tenant.** Clicking the control on tenant X's card opens the HF-352 management surface for tenant X (toggle, Clean Slate, Delete Tenant present). **Reuse the existing surface — no parallel surface, no second route.**
- **I3 — The destination actually renders.** The surface opens — it does not redirect to `/select-tenant` and does not 404 — for a `platform.system_config` admin. If a redirect/guard currently prevents this, repairing it is in scope (§2.2).
- **I4 — Capability-gated; no role-string; no new role.** The entry point and the route gate on `platform.system_config` via the existing capability model. The control does not appear for, and the route does not serve, users lacking the capability.
- **I5 — No destructive-path change.** The HF-352 deletion engine, two-step confirmation, and destructive-route gates are unmodified; their tests still pass. This directive touches **reachability and the entry point only**.
- **I6 — Constitutional set preserved.** No LLM, no data-pipeline change (Decision 158 intact).

---

## §4 — Proof gates (evidence)

**Reachability is the deliverable, so the architect browser-confirms it (SR-44). CC proves the code-level facts; the architect confirms the access works.**

- **P1 — The card control exists and is gated (I1/I4).** Each Tenant Fleet card renders an Edit / Manage control for a `platform.system_config` admin; it is absent for users without the capability. *Evidence: the wired control in code + the capability gate (grep, no role-string); **architect browser-confirms** the control on the card.*
- **P2 — The control opens the surface, scoped to the tenant (I2).** Clicking tenant X's control opens the HF-352 surface for tenant X, with the prism toggle, Clean Slate, and Delete Tenant present. *Evidence: the wiring (card → surface, tenant-scoped) in code; **architect browser-confirms** the card → surface path renders.*
- **P3 — The surface renders, no redirect/404 (I3).** The destination opens for a platform admin and does not bounce to `/select-tenant`. If a redirect/guard was the cause, the corrected cause is shown. *Evidence: the redirect/guard fix in code; **architect browser-confirms** the surface renders.*
- **P4 — Reuse, not rebuild (I2/I5).** The control opens the existing HF-352 surface; no parallel surface or route created; the destructive engine and confirmation are unmodified and their tests still pass. *Evidence: grep showing the single surface + unchanged destructive files + tests green.*
- **P5 — The prism toggle works from here (the unblock).** From the surface reached via the card, `prism_enabled` toggles (e.g., Casa Diaz disabled → enabled) via the existing route, audited. *Evidence: the toggle action + the flag state change; **architect browser-confirms** Casa Diaz can be enabled from the card path.*

---

## §5 — Discovery & compliance gates (steps inside the build, not the build)

### §5.1 — Current-state step (a means to the fix, not an alternative to it)
Early in the work, establish: does the destination surface (`app/admin/tenants` or equivalent) render, and what currently redirects it to `/select-tenant` (middleware? an `/admin` layout/route guard? a missing-context redirect?). **This is to inform the repair (§2.2), not to gate the deliverable.** Record the finding in the Architecture Decision Gate, then fix it and wire the card entry point. (Per I0: a discovery report is not a substitute for the working access.)

### §5.2 — Schema Gate (FP-49, conditional)
This directive is UI/navigation/reachability; if it touches no SQL, note that explicitly. If any route it wires touches data, query the live schema first and paste it.

### §5.3 — SR-39 Compliance Gate
The entry point and route reach the surface **only** for `platform.system_config` holders; the fix does not expose the tenant-management (destructive) surface to non-admins. Verify against SOC 2 CC6 / DS-014 / Decision 123.

---

## §6 — Completion report & PR

- Completion report at **`docs/completion-reports/HF-354_COMPLETION_REPORT.md`** (NOT the repo root). Include: the §5.1 current-state finding **and the repair applied**, each §4 proof gate with evidence, the SR-39 note, and the Anti-Pattern Registry pass. **The report must demonstrate the working access path (card → surface), not merely that a surface exists.**
- Final step: **`gh pr create --base main`** with a descriptive title + body. CC stops at "ready to merge." **The architect merges and confirms, in the browser, that the card opens the working surface (SR-44).**

---

## §6A — Anti-Pattern Registry (checked every build) + closeout

- **No scope narrowing; no investigation-as-deliverable** (I0) — the output is working access; discovery is a sub-step; repair, don't HALT-and-report-missing.
- **Entry point on the card** (I1) — on the Tenant Fleet card, not buried.
- **Reuse the existing surface; no parallel surface/route** (I2) — one destination, repaired if broken.
- **The surface actually renders** (I3) — no redirect to `/select-tenant`, no 404.
- **Capability-gated; no role-string; no new role** (I4).
- **No destructive-path change** (I5) — HF-352's deletion engine + confirmation untouched.
- **No registry / set-membership validation** — capability-gated structurally.
- **No LLM / data-pipeline change** (I6) — Decision 158 preserved.

*This file is the prompt (DD-11). It ends here. Nothing follows §6A.*
