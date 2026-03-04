# OB-155: Browser Pipeline Diagnostic

## 1. Plan Import Failure

**File**: `web/src/lib/ai/providers/anthropic-adapter.ts` line 592
**Call path**: SCI Execute route → `getAIService()` → `aiService.interpretPlan()` → `anthropic-adapter.execute()` → `fetch(ANTHROPIC_API_URL)`

**Test result**: Anthropic API call via `fetch()` from Node.js returns 200 in 1.2s. The "fetch failed" reported in OB-154 was **transient** — not a permanent code bug.

**Risk factors for browser path**:
- Route `maxDuration = 300` (5 min) — sufficient
- Body size limit `20mb` — sufficient for PPTX base64
- No AbortController/timeout on the fetch call itself
- PPTX text extraction (JSZip) runs before AI call, adding latency
- No retry logic on transient network failures

**Conclusion**: The fetch path is correct. The failure was transient. No code change needed for the fetch itself, but the component format problem downstream is the real blocker.

## 2. Component Format Gap

**AI output shape** (from `interpretPlan()`):
```json
{
  "calculationType": "matrix_lookup",
  "calculationIntent": { "description": "...", "formula": "..." },
  "tiers": [...],
  "metrics": [...]
}
```

**Engine input shape** (expected by `evaluateComponent()` in `run-calculation.ts:328`):
```json
{
  "componentType": "matrix_lookup",
  "matrixConfig": { "rowMetric": "...", "columnMetric": "...", "rowBands": [...], "columnBands": [...], "values": [[...]] },
  "tierConfig": { "metric": "...", "tiers": [{ "min": 0, "max": 100, "label": "...", "value": 500 }] }
}
```

**Key mismatches**:
| AI field | Engine field | Impact |
|----------|-------------|--------|
| `calculationType` | `componentType` | Evaluator dispatch fails (undefined switch) |
| `calculationIntent` | Not used (no `operation` field) | Intent fallback fails `isIntentOperation()` check |
| `tiers` (flat array) | `tierConfig.tiers` (nested) | Tier lookup returns no match |
| No `matrixConfig` | `matrixConfig` required | Matrix lookup returns $0 |
| No `percentageConfig` | `percentageConfig` required | Percentage evaluator skipped |

**Fix location**: Post-AI interpretation in SCI execute route, before saving to `rule_sets`. Transform AI output to PlanComponent format. Reference implementation: `web/scripts/ob154-fix-components.ts`.

## 3. Entity Creation / Dedup

**File**: `web/src/app/api/import/sci/execute/route.ts` lines 630-764

**Dedup logic**: Present and correct.
- `executeEntityPipeline()` collects unique `external_id` values via `Map<string, entity>`
- Queries existing entities, skips duplicates
- Batch inserts in groups of 5000
- `postCommitConstruction()` creates missing entities from committed_data, binds entity_id

**OB-153 19,578 entity count**: Likely caused by entity creation from ALL content units (not just roster), or incorrect entity_identifier field detection from AI classification. The dedup code itself is sound.

**Risk**: If AI classifies multiple sheets with different `entity_identifier` fields, the same person could appear under different keys. Need to verify AI classification signals produce consistent entity_identifier for the Óptica dataset.

## 4. Óptica Clean State

Nuclear clear executed. Engine Contract verification:

| Table | Count |
|-------|-------|
| rule_sets | 0 |
| entities | 0 |
| periods | 0 |
| committed_data | 0 |
| rule_set_assignments | 0 |
| calculation_results | 0 |
| calculation_batches | 0 |
| entity_period_outcomes | 0 |
| import_batches | 0 |
| classification_signals | 0 |

Tenant preserved: Optica Luminar (a1b2c3d4-e5f6-7890-abcd-ef1234567890)
Personas preserved: Laura Mendez (admin), Roberto Castillo (manager), Sofia Navarro (viewer)

## Phase 0 Proof Gates

| Gate | Status |
|------|--------|
| PG-0A: Plan import failure diagnosed | PASS — transient fetch, component format is real blocker |
| PG-0B: Component format gap documented | PASS — 5 field mismatches identified |
| PG-0C: Entity dedup logic traced | PASS — dedup present in executeEntityPipeline() |
| PG-0D: Clean state verified | PASS — all 10 tables at zero |
