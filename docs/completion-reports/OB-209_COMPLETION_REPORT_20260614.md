# OB-209 — Make the Substrate Canonical — Completion Report

**Date:** 2026-06-14 · **Branch:** `ob-209-substrate-canonical` → `main`
**Governing:** DS-003, DS-023 §5.1, HF-219, Synaptic spec, Decision 64, SR-34 · **Builds on:** OB-208 #509
**Defining constraint:** leverage, do not create. Read-before-assume.
**Status:** SHIPPED — the canonical SIGNAL foundation extended to the Decide-Results surface (capture +
L1 react + L3 read), proven live; the read-verified audit + ADR; honest HALT dispositions on the
visualization-consolidation half. **Nothing new created** (no hook, registry, write path, or library).

**Collision gate:** no OB-209 artifacts; #509 (OB-208) on main. ✓

---

## Phase commits (SHAs)

| Phase | SHA | Scope |
|---|---|---|
| 1 — ADR + audit | `5bc2d50a` | canonical-substrate ADR + 4-agent read-verified import/usage map |
| 4 — signal extension | `3a38e0b8` | extend `captureStreamSignal` to /results + L1 capture-and-react + L3 read |

---

## Read-before-assume: the audit corrected three directive premises

The 4-agent audit workflow (paste in the ADR) established the actual code, and **three of the OB's
premises were stale** — which is the whole point of read-before-assume:

1. **BloodworkCard is ALREADY surfaced** on `/stream` (Admin + Manager, lines 526/653). The "Bloodwork
   not showing" defect (D, PG-05) is already closed. No work needed.
2. **The named removal candidates are LIVE, not dead → HALT-2.** `charts/CompensationPieChart` +
   `CompensationTrendChart` (`/insights/compensation`), `charts/goal-progress-bar` (`/insights/my-team`,
   `/compensation`), `charts/leaderboard` (`/insights/my-team`, `/compensation`, `/performance`),
   `analytics/KPICard` (`/insights/analytics`). Removing any **breaks a live non-Decide surface**. Per
   HALT-2: kept; removal requires first repointing the `/insights/*` pages (a separate non-Decide pass)
   — **R4 residual**. SR-34 honored by NOT breaking a live import; no third path added.
3. **`captureStreamSignal` is ALREADY canonical** — it writes THROUGH `writeSignalBatchWithClient`
   (signal_type `lifecycle:stream`, HF-219 open-vocabulary), not a parallel insert. So the foundation is
   leveraged, not recreated.

## §6 — Signal extension (the canonical win), proven live

The Decide-Results interactions now capture through the existing canonical path: **Verify** (drill),
**Investigate**/**Resolve** (act), anomaly **expand/collapse** — all via `captureStreamSignal`
(`writeSignal`, open-vocabulary). **No new hook, registry, or write path.**

**Capture-and-react (Observation IS Action), verified live** (`ob209-signal-loop.ts`, write THROUGH
`writeSignalWithClient`, then read, then cleanup):
```
PG-06 capture:  wrote via canonical writeSignalWithClient (signal_type lifecycle:stream) — not a parallel insert
PG-07 L1 react: actorA own history expand=2 / collapse=1 → react default = EXPANDED (the individual's habit)
PG-08 L3 read:  4 interaction signals across 2 actors for results:anomaly_summary = the insight-agent basis
```
L1 is per-actor via the open `signalValue.actorId` (`classification_signals` has no per-user column —
leverage, not a schema change). On `/results` load the surface reads THIS user's prior signals and
defaults the anomaly section expanded for habitual expanders (the react). L3 is the same store read
tenant-wide (Decision 64: one substrate, two reads). tsc 0 / build exit 0.

## §4/§5 — Visualization consolidation: read-verified HALT dispositions

The audit mapped 7 Decide cards that reimplement an existing primitive (the repoint map is in the ADR).
Honest dispositions:
- **Removals → HALT-2** (above): the inferior paths are live on `/insights/*`; not removable without a
  non-Decide repoint pass. R4.
- **AccelerationCards → AccelerationCard primitive → HALT-1:** the primitive (`{severity,title,description,
  actionLabel,onAction}`) lacks the **icon + triage-count** the current card renders; repointing as-is
  would regress the card. Per HALT-1 this needs EXTENDING the shared primitive (a canonical change) +
  SR-44 visual verification — deferred to the consolidation pass (R5) rather than shipped as a visual
  regression I cannot browser-verify.
- The other repoints (TrendArrow, StatusPill, LifecycleStepper) are visual changes on `/stream` requiring
  SR-44 and are the continuing library-adoption effort (R5; 17/128 pages on design-system today).

**Why this is the faithful outcome:** the OB's own core discipline is read-before-assume + "leverage don't
create." The audit revealed the visualization half is HALT-blocked (live dups, already-surfaced Bloodwork,
primitive-extension-needed repoints), while the SIGNAL foundation is the clean canonical win — which is
delivered and proven. Forcing the repoints/removals would break live imports (HALT-2) or ship unverifiable
visual regressions (HALT-1) — the opposite of the OB's intent.

## SR-39
Signal capture via `writeSignal` (tenant-scoped canonical path); the L1/L3 reads are tenant-scoped
(browser RLS client); no cross-tenant surface (HALT-4 not triggered). SOC2 CC6 / DS-014 / Decision 123 honored.

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: substrate-non-canonical (signal foundation not applied to Decide) → CLOSED for /results (capture+react via existing writeSignal). Visualization consolidation → read-verified HALT (removals live on /insights = HALT-2; AccelerationCards repoint needs primitive extension = HALT-1; BloodworkCard already surfaced). Built nothing new.
REGISTRY: "Signal Foundation Applied" → existing captureStreamSignal/writeSignal extended to Decide-Results; capture-and-react L1 + universal read-basis L3 (Decision 64), live-verified. "Canonical Visualization Library" → read-verified map authored; consolidation HALT-blocked, scoped.
R1: Tier C candidate "capture-and-react on the existing signal foundation; one library map" → pending SR-44.
BOARD: Decide (/results capture-and-react); Platform Core (existing signal foundation applied, nothing created).
SUBSTRATE: existing canonical signal foundation (writeSignal DS-023 §5.1, HF-219 open-vocab, captureStreamSignal) extended — Observation-IS-Action, L1 individual + L3 universal; visualization consolidation HALT-mapped (read-before-assume corrected 3 stale premises).
```

## Residuals
R4 inferior paths live on `/insights/*` (removal needs a non-Decide repoint pass) · R5 card repoints
(AccelerationCards needs primitive extension; others are SR-44 visual changes — continuing library
adoption) · R1 universal-insight agent (consumes the L3 basis) · R2 app-wide capture · R3 adaptive ordering.

---

*OB-209 — Make the substrate canonical · 2026-06-14 · vialuce.ai*
