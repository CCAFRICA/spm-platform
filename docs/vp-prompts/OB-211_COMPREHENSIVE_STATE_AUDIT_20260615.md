# OB-211 COMPREHENSIVE STATE AUDIT: every route × deployed-reachability × render — the regression test the per-PR sweeps could not run

**Repo:** `CCAFRICA/spm-platform` (VP) · deployed `vialuce.ai`
**Authored:** 2026-06-15 (architect channel)
**Type:** COMPREHENSIVE DEPLOYED-STATE AUDIT — read-only, no code change. The 15 OB-211 PRs are confirmed merged on main (`1dae916e`) and the code is wired (verified: the pages exist, the Simulate components render in the chain, the nav is agent-governed). BUT the architect reports — from platform-admin on BCL on deployed vialuce.ai — Simulate inactive and ENTIRE PAGES missing (e.g. the old Results page). A code read found the cause class: **128 page routes exist; the agent nav registers only 17.** The Phase A reorg rebuilt the nav around a curated route subset and appears to have ORPHANED the rest (`/insights/*`, `/investigate/*`, `/govern/*`, `/data/*` route families have no nav entry). This audit establishes, for EVERY route, the true deployed state — the comprehensive regression test the architect wanted to run after the build, which the per-PR sweeps structurally could not perform (each verified its own diff; none tested the whole deployed surface from a real persona).
**This is NOT a build directive.** It produces a complete state map. The FIXES (re-home orphaned routes, etc.) are SEPARATE increments scoped FROM this audit's findings.
**Gate:** main `1dae916e`. **Branch:** a docs/audit branch. No production code change.

**THE PRINCIPLE (architect-set): the per-PR sweeps verified diffs; this verifies the WHOLE deployed surface from the real persona.** "Merged + wired" ≠ "reachable + rendering." A nav reorganization sweep checks what it built, never what it DROPPED. The architect's comprehensive-test instinct was correct: holding for one whole-surface regression test is what surfaces "128 routes, 17 in nav." This audit IS that test.

---

## §0 — CC Standing Rules
Read `CC_STANDING_ARCHITECTURE_RULES.md`. Read-only audit. Binding: SR-42 (surface every gap honestly — do NOT rationalize an orphaned route as "intentional contextual depth" unless it genuinely is a drill-target/dynamic route), SR-43, SR-44 (the architect runs the deployed checks). **No fabrication:** every route's status is determined (code + where possible the deployed render) or explicitly flagged "architect must verify on deployed BCL."

**Read-before-assert:** the route inventory is 128 `page.tsx` files; the nav registers 17 paths. CC reads the FULL inventory and the FULL nav, and classifies every route — never samples.

AUTONOMY: produce the complete map. No yes/no questions.

---

## §1 — THE INVENTORY (every route, classified)
CC produces `docs/audits/OB-211_DEPLOYED_STATE_AUDIT_20260615.md` — a table of ALL 128 routes. For each route:
1. **Path** (the route).
2. **In nav?** — is there a `workspace-config.ts` entry pointing to it? (registered / NOT registered)
3. **Reachability class** — one of:
   - **NAV-REACHABLE** — a nav entry points to it.
   - **CONTEXTUAL** — legitimately reached by DRILLING (dynamic `[param]` routes like `/investigate/trace/[entityId]`, drill-targets) — correct to NOT be a menu item.
   - **AUTH/SYSTEM** — login/mfa/error — correct to not be in the main nav.
   - **ORPHANED** — a real destination page that USED to be (or should be) reachable, now has NO nav path and is NOT a drill-target → **this is the bug class.** The page exists and deploys but the user can't get to it.
   - **DEPRECATED?** — possibly a dead/old route superseded by another (CC flags as a question, doesn't assume).
4. **Persona gate** — which roles the route/nav-entry allows (does platform-admin-on-a-tenant reach it?).
5. **Render dependency** — does it need specific data/persona/tenant to render (a runtime gate that could blank it even when reached)?

## §2 — THE ORPHAN ANALYSIS (the core finding)
CC groups the ORPHANED routes and, for each family (`/insights/*`, `/investigate/*`, `/govern/*`, `/data/*`, `/admin/*`, the `/financial/*` pages not in nav, `/acceleration`, `/approvals`, `/configuration/*` vs `/configure/*`, etc.):
- **What the family IS** (what these pages do).
- **Were they reachable BEFORE the Phase A reorg?** (CC checks git history / the pre-reorg nav — were these in the old verb-nav and dropped, or always orphaned?)
- **SHOULD they be in the agent nav?** — map each to its agent (Calculation/Performance/Finance/Platform Core) per the capability map, OR flag as genuinely deprecated/contextual.
- **The duplication flag:** `/configuration/*` AND `/configure/*` both exist; `/data/*` AND `/operate/import` both exist; `/insights/*` AND `/stream`; `/investigate/*` AND `/operate/results`. CC identifies which is the CURRENT surface and which is the OLD one the reorg should have retired or which is now orphaned — this likely explains a chunk of the 111 (old surfaces stranded alongside new ones).

## §3 — THE DEPLOYED RENDER CHECK (architect-executed, CC scripts the list)
CC produces the EXACT list for the architect to walk on deployed vialuce.ai as platform-admin/BCL:
- For each NAV-REACHABLE route: the nav path to click (which agent → which section) + does it render or error.
- For each ORPHANED route the audit says SHOULD be reachable: the direct URL (`vialuce.ai/...`) to type — does the PAGE itself render (confirming it's an orphan = exists-but-unreachable, vs genuinely broken).
- **Simulate specifically:** the exact steps — as platform-admin/BCL, navigate to where Simulate should appear (the rep statement / the opportunity card), on a regime-2 component (Colocación/Captación) — does the close-the-gap what-if render? If NOT, CC gives the runtime checks (is `SelfSimulateCard` returning null because `renderable.length===0`? is the loader's gap guard `payout>0 & 0<att<100` failing on BCL's loaded period? — the Phase D HIGH was THIS class, claimed-fixed; verify it actually fixed on deployed data).
CC states, per route, what RENDER and what BLANK/ERROR mean (orphan vs broken vs data-gated).

## §4 — THE DELIVERABLE + DISPOSITION
The audit map (§1) + the orphan analysis (§2) + the architect render-checklist (§3), and a DISPOSITION summary:
- **The orphaned-but-should-be-reachable routes** → the re-homing fix (a SEPARATE increment: add them to the agent nav under the right agent). CC names them + their target agent.
- **The old/duplicate surfaces** → retire or redirect (a separate increment). CC names which is current vs old.
- **The genuinely-broken/data-gated** (Simulate if it's still dead on BCL) → the real bug, RCA'd, a separate fix.
- **The confirmed-correct** (contextual drill-targets, auth pages) → no action.
This map is what the architect runs the ONE comprehensive regression test against — and what scopes the remediation.

```
ARTIFACT SYNC (deployed-state audit)
MC: COMPREHENSIVE DEPLOYED-STATE AUDIT — the 15 OB-211 PRs are merged + wired, but the agent-nav reorg (Phase A) registered ~17 of 128 routes, ORPHANING route families (/insights, /investigate, /govern, /data) that exist + deploy but have no nav path → the architect's "entire pages missing" (Results moved; many surfaces unreachable). The per-PR sweeps verified diffs, never the whole deployed surface — this audit is the whole-surface regression test. Produces: every route classified (nav-reachable/contextual/auth/ORPHANED/deprecated), the orphan + duplicate-surface analysis, the architect deployed-render checklist (incl. Simulate-on-BCL runtime check), and the disposition (re-home / retire / fix / no-action). Remediation is SEPARATE increments scoped from this. Pending the architect's deployed run.
REGISTRY: "Navigation Coverage" → audited: nav registers a subset; orphaned families named for re-homing. "Deployed State" → mapped route-by-route. "Simulate (deployed)" → render-checked on BCL (the Phase D HIGH's data-gate class re-verified on live data).
R1: the deployed-state regression test is now executable (every route, reach + render, real persona) → pending the architect's run + the remediation increments it scopes.
SUBSTRATE: "merged + wired" ≠ "reachable + rendering" — a reorg sweep checks what it built, not what it dropped; the whole-surface audit catches the orphaned-route class the per-PR sweeps structurally could not; remediation (re-home/retire/fix) is scoped FROM the audit, not guessed.
```

---

## §5 — NOTES
- READ-ONLY. The fixes (re-homing orphaned routes into the agent nav, retiring duplicates, fixing Simulate if still dead) are SEPARATE increments scoped from this audit's findings — do NOT bundle fixes into the audit.
- The likely largest single cause: OLD surfaces (`/insights`, `/investigate`, `/configuration`, `/data`) stranded alongside the NEW agent surfaces (`/stream`, `/operate/results`, `/configure`) — the reorg built the new nav but didn't retire/redirect the old routes OR didn't carry forward the ones still needed. CC's duplicate-surface analysis (§2) is the key to sizing this.
- Simulate: the architect reports it STILL inactive. The Phase D report claimed a HIGH fix (entity-level attainment fallback) for exactly the "dead on data" class. This audit RE-VERIFIES that on deployed BCL — if still dead, the claimed fix did not hold on live data, and that's a real RCA (a separate fix), not a closed item.
