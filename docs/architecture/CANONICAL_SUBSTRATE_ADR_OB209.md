# Canonical-Substrate ADR — OB-209

**Date:** 2026-06-14 · **Governing:** DS-003, DS-023 §5.1, HF-219, Synaptic spec, Decision 64, SR-34
**Defining constraint:** leverage, do not create. Read-verified before deciding.

---

## DECISION

ONE visualization library + ONE signal path. Apply/extend what exists; remove inferior **only** where
import-proven safe; create nothing new.

### VISUALIZATION — `design-system/` is the one library (27 primitives)
Decide-surface `intelligence/` cards COMPOSE FROM design-system primitives rather than reimplement inline.
**Read-verified repoint map** (7 of 10 cards reimplement an existing primitive):

| Card | Inline reimplementation | design-system primitive |
|---|---|---|
| AccelerationCards | custom `Card` fn (lines 54–79) | **`AccelerationCard`** (CRITICAL — compatible props) |
| SystemHealthCard / TeamHealthCard / TrajectoryCard | trend-arrow icon logic | **`TrendArrow`** |
| DistributionCard | inline `StatPill` | **`StatusPill`** |
| LifecycleCard | custom stepper | `LifecycleStepper` (patterns differ — wrapper) |

BloodworkCard, TeamHeatmapCard, OptimizationCard, ActionRequiredCard: domain-specific, no primitive collision.

### SIGNAL — the EXISTING canonical foundation is leveraged, not recreated
- **WRITE:** `writeSignal`/`writeSignalBatchWithClient` (DS-023 §5.1, dual-architecture defect already closed),
  open-vocabulary `signal_type` (HF-219, no registry). Confirmed singular path.
- **CAPTURE:** `captureStreamSignal` (`stream-signals.ts`) ALREADY writes THROUGH the canonical path
  (`writeSignalBatchWithClient`, signal_type `lifecycle:stream`, open `signalValue`). `/stream` already
  uses it (`onCardInteract`). **EXTEND it to `/results`** (Verify-drill, Investigate, Resolve, expand) —
  reuse the function, no new hook.
- **READ:** `getTrainingSignals` reads L1 (user filter) + L3 (tenant-wide, across users). One surface, two
  reads (Decision 64). `api/signals` GET for client read-back.

### CREATE NOTHING
No new signal hook (extend `captureStreamSignal`), no vocabulary/registry (HF-219), no parallel write
(`writeSignal` only), no new library (`design-system`).

---

## READ-VERIFIED CORRECTIONS to the directive's premises (read-before-assume)

1. **BloodworkCard is ALREADY surfaced** — rendered on `/stream` (Admin + Manager, lines 526/653). The
   "Bloodwork not showing" premise is stale; PG-05 is already satisfied. No work needed.
2. **The named removal candidates are LIVE, not dead (HALT-2):** `charts/CompensationPieChart` +
   `CompensationTrendChart` (imported by `/insights/compensation`), `charts/goal-progress-bar`
   (`/insights/my-team`, `/insights/compensation`), `charts/leaderboard` (`/insights/my-team`,
   `/compensation`, `/performance`), `analytics/KPICard` (`/insights/analytics`). **Removing any breaks a
   live non-Decide surface.** Per HALT-2: **keep + note as removal residual (R4)** — removal requires
   repointing the `/insights/*` pages too (a separate, non-Decide pass). SR-34 honored by NOT breaking a
   live import; no third path added.
3. The signal foundation has **no per-user column** on `classification_signals` (tenant-scoped); L1
   "individual" filtering uses the open `signalValue` (carry the actor in the JSONB) — leverage, not a
   schema change.

---

## REJECTED
A new interaction-capture hook (`captureStreamSignal` exists) · a signal registry (HF-219 eradicated it)
· a new/wrapper library (`design-system` exists) · removing live `/insights`-imported dups (HALT-2).

---

*OB-209 Canonical-Substrate ADR · 2026-06-14 · vialuce.ai*
