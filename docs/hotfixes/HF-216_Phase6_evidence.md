# HF-216 Phase 6 — Localhost calculation re-run evidence (verbatim)

**Subject:** Meridian (`5035b1e8-…`) × rule_set `939cf576-…` × period `3c2557f4-…` (January 2025) × entity `007da35a-…` (Norma Rodríguez Rivera, external_id 70209).
**Invocation method:** direct POST handler import (`web/src/app/api/calculation/run/route.ts:POST`) executed in same Node process; middleware bypassed by design (script-only path; no auth surface exercised). Dev server running at localhost:3000 separately for Phase 5 evidence.
**Result row read after handler completion.**

## Phase 6 handler output (final lines)

```
[CalcAPI] HF-216 Roster join index: 1 via-specs indexed
…
[CalcAPI] OB-76 Dual-path: 41 match, 26 mismatch (51.9% concordance)
[CalcAPI] Grand total: 542,552
[CalcAPI] OB-194: 67 calculated, 12 excluded (no qualifying variant)
[CalcAPI] Wrote 67 calculation_results (in 1 batches)
[CalcAPI] Batch transitioned to PREVIEW
[CalcAPI] [CalcRecon-T1] entitiesCalculated=67 grandTotal=542552
[CalcAPI] [CalcRecon-T1] componentTotals=[c0:139500 | c1:0 | c2:392300 | c3:10700 | c4:52]
[CalcAPI] COMPLETE: batch=2cd5f730-142d-46f8-adf5-34456be7ea07, entities=67, total=542552
HTTP status: 200
```

## Result row identifiers

```
result_id:    5258e916-1837-4cc3-99c2-2d480712ade6
batch_id:     2cd5f730-142d-46f8-adf5-34456be7ea07
created_at:   2026-05-12T01:56:42.25842+00:00
total_payout: 8952
```

## components[].payout (verbatim)

```
components[0]: id=revenue_performance_senior name=Revenue Performance - Senior payout=3000
components[1]: id=on_time_delivery_senior   name=On-Time Delivery - Senior   payout=0
components[2]: id=new_accounts_senior       name=New Accounts - Senior       payout=5950
components[3]: id=safety_record_senior      name=Safety Record - Senior      payout=0
components[4]: id=fleet_utilization_senior  name=Fleet Utilization - Senior  payout=2
```

## metadata.intentTraces[4] (verbatim)

```
intentTraces[4].inputs.hub_total_loads.rawValue:    0.762043795620438
intentTraces[4].inputs.hub_total_capacity.rawValue: 2
intentTraces[4].modifiers:                          [{"after":1.5,"before":304.8175182481752,"modifier":"cap"}]
intentTraces[4].finalOutcome:                       1.5
```

## metadata.intentMatch / intentTotal / legacyTotal

```
metadata.intentMatch:  false
metadata.intentTotal:  8952
metadata.legacyTotal:  9255
```

## Full intentTraces[4] block

```json
{
  "inputs": {
    "hub_total_loads": {
      "source": "metric",
      "rawValue": 0.762043795620438,
      "resolvedValue": 0.762043795620438
    },
    "hub_total_capacity": {
      "source": "metric",
      "rawValue": 2,
      "resolvedValue": 2
    }
  },
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "modifiers": [
    {
      "after": 1.5,
      "before": 304.8175182481752,
      "modifier": "cap"
    }
  ],
  "confidence": 0.5,
  "finalOutcome": 1.5,
  "componentType": "scalar_multiply",
  "componentIndex": 4
}
```

CC pastes verbatim and halts. Architect reconciles.
