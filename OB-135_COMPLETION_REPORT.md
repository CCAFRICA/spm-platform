# OB-135: Flywheel Signal Capture — Completion Report

**Status:** COMPLETE
**Branch:** dev
**Build:** Clean (exit 0)
**Phases:** 10/10 (Phase 0-9)

---

## What Was Built

Every SCI classification, user confirmation, reconciliation outcome, and AI API call now becomes a classification signal. The weight evolution foundation reads accumulated signals and proposes adjustments. The Observatory renders real metrics from real signals.

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/sci/sci-signal-types.ts` | 126 | 7 signal types with typed payloads |
| `lib/sci/signal-capture-service.ts` | 272 | Fire-and-forget writes + read/analytics |
| `lib/sci/weight-evolution.ts` | 294 | Analytical-only weight adjustment proposals |

### Modified Files

| File | Change |
|------|--------|
| `api/import/sci/analyze/route.ts` | +content_classification + field_binding signals after proposal |
| `api/import/sci/execute/route.ts` | +content_classification_outcome signals after execution |
| `components/sci/SCIExecution.tsx` | Pass originalClassification/originalConfidence for override detection |
| `lib/sci/sci-types.ts` | +originalClassification, originalConfidence on ContentUnitExecution |
| `lib/ai/ai-service.ts` | +cost_event signal capture on every AI API call |
| `api/reconciliation/compare/route.ts` | +convergence_outcome signal after comparison |
| `api/reconciliation/run/route.ts` | +convergence_outcome signal after agent reconciliation |
| `api/platform/observatory/route.ts` | +SCI metrics (accuracy, flywheel, cost curve, weight evolution) |
| `lib/data/platform-queries.ts` | +sciAccuracy, sciFlywheel, sciCostCurve, sciWeightEvolution types |

---

## Signal Architecture

### 7 Signal Types

1. **content_classification** — Agent scored a content unit (analyze)
2. **content_classification_outcome** — User confirmed/overrode (execute)
3. **field_binding** — Semantic role assignments per content unit (grouped)
4. **field_binding_outcome** — User changed a field binding
5. **negotiation_round** — Round 2 score adjustment
6. **convergence_outcome** — Reconciliation match rate as plan interpretation proxy
7. **cost_event** — AI API call tokens + estimated cost

### Storage

- All signals stored in existing `classification_signals` table
- SCI signals prefixed with `sci:` in signal_type column (namespace separation)
- Fire-and-forget pattern: import/reconciliation NEVER blocked by signal failure

### Volume Budget

- ~2 signals per tab during analyze (1 classification + 1 field_binding)
- 1 outcome signal per content unit during execute
- 1 cost signal per AI API call
- 1 convergence signal per reconciliation comparison

---

## Weight Evolution

Analytical-only service (`weight-evolution.ts`):
- Reads content_classification + outcome signals
- Tracks which agent signals fired and whether prediction was correct
- Computes proposed weight adjustments with learning rate (0.3) and max cap (0.05)
- Minimum 5 outcomes before proposals are generated
- Confidence scales with sample size (sigmoid to 50 outcomes)
- NEVER auto-applies — Observatory displays proposals, human decides

---

## Observatory Integration

`GET /api/platform/observatory?tab=ai` now returns:
- `sciAccuracy` — classification accuracy from SCI outcome signals
- `sciFlywheel` — confidence and accuracy trend by ISO week
- `sciCostCurve` — AI API costs by week (totalCostUSD, apiCalls, avgTokens)
- `sciWeightEvolution` — proposed weight adjustments with evidence counts

All metrics computed from real signals. Zero hardcoded values. Empty states are honest states.

---

## Proof Gates

| # | Gate | Result |
|---|------|--------|
| PG-01 | npm run build exits 0 | PASS |
| PG-02 | Signal type definitions exist | PASS — 7 types in sci-signal-types.ts |
| PG-03 | Signal capture service exists | PASS — captureSCISignal() + captureSCISignalBatch() |
| PG-04 | Fire-and-forget proven | PASS — all writes wrapped in try/catch, never throw |
| PG-05 | SCI analyze writes signals | PASS — content_classification + field_binding per unit |
| PG-06 | SCI execute writes outcome signals | PASS — content_classification_outcome per unit |
| PG-07 | Cost events captured | PASS — cost_event on every AI API call via ai-service.ts |
| PG-08 | Reconciliation writes convergence signals | PASS — convergence_outcome in compare + run |
| PG-09 | computeSCIAccuracy returns real data | PASS — reads outcome signals, computes accuracy |
| PG-10 | computeSCIFlywheelTrend works | PASS — groups by ISO week, needs 2+ data points |
| PG-11 | computeSCICostCurve works | PASS — groups cost events by week |
| PG-12 | Weight evolution respects minimum threshold | PASS — returns hasEnoughData: false < 5 outcomes |
| PG-13 | Observatory shows real SCI metrics | PASS — wired into fetchAIIntelligence() |
| PG-14 | No auth files modified by OB-135 | PASS — auth changes from OB-127/128/129 only |
| PG-15 | Classification Signal terminology | PASS — Decision 30 applied throughout |
| PG-16 | Korean Test | PASS — zero domain vocabulary in new SCI signal files |

---

## Commits

```
c5e6522 Phase 0: Diagnostic — signal capture infrastructure audit
203b909 Phase 1: Architecture decision — extend OB-86 signal-persistence for SCI
68c2db0 Phase 2: SCI signal type definitions — 7 signal types
8d0f44e Phase 3: Signal capture service — fire-and-forget writes
325d9aa Phase 4: Wire signal capture into SCI analyze API
3b2595e Phase 5: Wire signal capture into SCI execute — outcome recording
29aca3e Phase 6: Wire cost event signals into AI API calls
3b67727 Phase 7: Wire convergence outcome signals into reconciliation
bc3bba0 Phase 8: Weight evolution foundation — analytical-only service
649d412 Phase 9: Observatory wiring — real SCI metrics from real signals
```

---

*OB-135 — March 2026*
*"The flywheel starts with the first signal."*
