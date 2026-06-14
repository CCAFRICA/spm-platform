# HF-291 — Carrier Expression Design Correction — Completion Report

**Date:** 2026-06-14 · **Branch:** `hf/291-carrier-expression-design-correction` → `main`
**Type:** HF (design-layer regression correction on OB-205) · **Governing spec:** DS-029 (RATIFIED)
**CLT source:** production screenshots (Admin + Manager), 2026-06-14
**Status:** SHIPPED — build exit 0. DS-029 §6 persona matrix + Bloodwork + Cognitive Fit restored.

**Collision gate:** `ls docs/.../HF-291*` → none · `git log --all | grep -i HF-291` → none. Number retained.

---

## Commit structure (one atomic structural fix)

The directive frames the four findings as **one structural fix** (§1.3 — shared root cause). The
page (persona-gate F-1 + reorder F-2) and the components (redesign F-3/F-4) are **mutually
dependent**: the redesigned `CarrierImportHealth` API and the persona-gated render must change in
lockstep. Splitting into the §3.4/§4.3/§5.4 commits would produce **non-building intermediate
trees** (the old page references the deleted `CarrierEntityLandscape` and the old card props). So
the fix lands as one atomic commit enumerating all four findings, rather than three partial commits
that don't compile.

| SHA | Scope |
|---|---|
| `765df1f2` | F-1..F-4 structural fix (page + components + types + route) |
| _(this commit)_ | completion report |

### Files
- **Modified:** `web/src/app/stream/page.tsx` (persona-gate + reorder + persona no-calc messages),
  `web/src/components/stream/CarrierImportHealth.tsx` (→ Data Health Bloodwork card),
  `web/src/components/stream/CarrierPipelineReadiness.tsx` (→ Next Step card),
  `web/src/components/stream/index.ts`, `web/src/lib/carrier/types.ts` (+`imports.priorBatch`),
  `web/src/app/api/carrier-intelligence/route.ts` (fetch 2 latest batches)
- **Deleted:** `web/src/components/stream/CarrierEntityLandscape.tsx` (folded into Data Health)

---

## HALT dispositions

- **HALT-1 (no persona context):** NOT triggered. `/stream` uses `usePersona()` → `persona`
  (`admin`|`manager`|`rep`); gating matches the existing `persona === '...'` pattern (Korean Test:
  structural persona identifiers, not domain terms).
- **HALT-2 (intelligence elements unidentifiable):** NOT triggered. `AdminStream`/`ManagerStream`/
  `IndividualStream` render `SystemHealthCard`, `TrajectoryCard`, `TeamHealthCard`, etc. — carrier
  cards reorder relative to these.
- **HALT-3 (carrier hook/route broken):** NOT triggered. Route builds, registers (`ƒ
  /api/carrier-intelligence`), auth-gates (401), and the `priorBatch` extension returns real data.

---

## The four findings — how each was fixed

**F-1 Persona scoping (§3).** Carrier cards are gated `carrier && isAdmin` (`isAdmin = persona ===
'admin'`). Manager and Rep never render Data Health, entity info, or Next Step. DS-029 §6 honored.

**F-2 Real estate priority (§4).** In the calculated view, carrier cards moved from *above* the
persona streams to *below* them (`{carrierAdminStack && <div className="mt-4">…</div>}` after
`AdminStream`). Payout/lifecycle/trajectory are the headline; carrier is supplementary. No-calc
branch is persona-scoped: admin → carrier; manager/rep → one waiting message (no import metrics).

**F-3 Contextual collapse (§3.3/§5.3).** `CarrierPipelineReadiness` no longer renders a five-step
stepper. It is gated `!pipelineReadiness.hasCalculation` at the call site AND returns `null`
internally when nothing blocks — a healthy pipeline shows **no card** (Bloodwork: passing checks
silent). When blocked it shows ONE next step + one action (Cognitive Fit / TMR-8).

**F-4 Intelligence test (§5.1/§5.2).** `CarrierImportHealth` → **Data Health**: a single
green/amber/red status dot (named thresholds `CONFIDENCE_GREEN=70`/`CONFIDENCE_AMBER=50`, R3), two
compact lines, a **"vs prior import" reference frame** (R2), entity info folded in ("85 entities
(all bound)"), `Review Data →` + `View Entities →` inline. Healthy = muted (`status` tier); a
problem takes the accent border (`action` tier) — problems get visibility.

---

## §6 — Verification evidence

**Build (§6.1):** `rm -rf .next && npm run build` → **exit 0**. No errors/warnings in any touched
file; the deleted `CarrierEntityLandscape` left no dangling reference. Route still registers.

**Dev serve:** `npm run dev` → `GET /` 307 (→ login); `GET /api/carrier-intelligence` (no session)
401 (auth-gated).

**R2 reference-frame data** (`hf291-priorbatch.ts`, live):
```
Meridian: totalBatches=3 latest=36 prior=201  → vs prior: -165 rows
BCL:      totalBatches=7 latest=85 prior=85    → vs prior: no change
```

**Persona-gating (code trace, §6.2 #1–4):** the gating is deterministic and visible in source —
`carrierAdminStack = carrier && isAdmin ? … : null`; manager/rep no-calc → single waiting card;
carrier rendered after the persona streams. The **four authenticated persona-switch UI items**
(Admin sees Data Health below intelligence with green dot + Next Step hidden for BCL; Manager/Rep
see no carrier cards; no-calc personas) require a logged-in `/stream` session and persona switching
— per **SR-44 (browser verification = architect)**, that is the architect's step. No fabricated
screenshots.

---

## Residuals

- **R1 (static no-calc messages):** Manager/Rep waiting copy is static; the entity count is
  tenant-wide, not yet scoped by `visible_entity_ids`. Persona-scoped carrier queries await DS-027
  (RBAC entity↔user linking). Documented inline.
- **R2 (reference frame):** RESOLVED via a minimal payload extension — `imports.priorBatch`
  ({rowCount, createdAt}) from the two most recent batches; the card shows `+N rows` / `no change` /
  omits on first import. **Entity-delta** is not shown (no per-batch entity count exists); row-delta
  only. Future: per-batch entity tracking for an entity reference frame.
- **R3 (status thresholds):** `CONFIDENCE_GREEN=70` / `CONFIDENCE_AMBER=50` are named constants at
  the top of `CarrierImportHealth`, to be calibrated as onboarding widens — not magic numbers.

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: OB-205 CLT finding → CLOSED by HF-291 (pending SR-44 production verification)
REGISTRY: Carrier Expression → persona-gated (admin-only), Bloodwork-compliant, reference-framed; build exit 0
R1: no criterion change
BOARD: Carrier Expression row unchanged — L1 SPECIFIED holds until SR-44 verifies HF-291 on production
SUBSTRATE: TMR-7 persona scoping exercised; Bloodwork principle applied (passing checks silent); Cognitive Fit (TMR-8) enforced; Reference Frame requirement (CLT-100 A.70-A.74) satisfied via imports.priorBatch
```

---

*HF-291 · Carrier Expression Design Correction · 2026-06-14 · vialuce.ai*
