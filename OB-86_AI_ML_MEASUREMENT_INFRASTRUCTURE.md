# OB-86: AI/ML MEASUREMENT INFRASTRUCTURE
## If you can't measure it, you can't prove it. If you can't prove it, it's a story.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. `Vialuce_AI_ML_Measurement_Framework.md` — design spec for what we're building

---

## CONTEXT — WHY NOW

The calculation engine is proven: 97.9% accuracy, 6/6 components, 719 entities, MX$1,280,465 vs MX$1,253,832 benchmark. The pipeline works. Now we need to prove that the AI improves over time.

Currently, every AI prediction (field mapping, sheet classification, plan interpretation) is fire-and-forget. The AI suggests, the user accepts or overrides, and the outcome is lost. No metrics. No flywheel. No proof that the platform learns.

This OB builds the measurement layer that captures AI predictions, records user outcomes, computes accuracy metrics, and visualizes intelligence trends in the Observatory.

### What Exists (from SCHEMA_REFERENCE.md)

```sql
-- classification_signals table EXISTS but may not be used
classification_signals:
  id, tenant_id, entity_id, signal_type, signal_value (jsonb),
  confidence, source, context (jsonb), created_at
```

### Terminology (Locked — Decision 30)

- **Classification Signal** — NOT "Training Signal"
- **LLM-Primary, Deterministic Fallback, Human Authority** — NOT "AI-Primary, ML Fallback"
- We enrich prompts, not retrain models

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Mitigation |
|---------|------|------------|
| Building UI before data | Pretty dashboard with no real data behind it | Mission 1 (data) must complete before Mission 4 (UI) |
| Hardcoded metrics | Display "94.2% accuracy" as a constant | Every metric computed from actual classification_signals rows |
| Mock data in production | Seed fake signals to make dashboard look good | Zero mock data. Empty states are honest states. |
| Overbuilding | 8 chart types and 15 metrics nobody uses | 4 core metrics, 2 visualizations. Minimum viable measurement. |

---

## PHASE 0: AUDIT CURRENT SIGNAL CAPTURE

### 0A: Does classification_signals have any data?

```sql
SELECT COUNT(*) as total_signals,
  COUNT(DISTINCT signal_type) as signal_types,
  COUNT(DISTINCT tenant_id) as tenants
FROM classification_signals;

-- What signal types exist?
SELECT signal_type, COUNT(*) as count
FROM classification_signals
GROUP BY signal_type
ORDER BY count DESC;
```

### 0B: Where does the AI make predictions in the codebase?

```bash
echo "=== IMPORT: Field mapping AI calls ==="
grep -rn "classify\|predict\|fieldMapping\|mapField\|semanticType\|smart.*map" \
  src/lib/import/ src/lib/ingestion/ src/lib/data-architecture/ 2>/dev/null | \
  grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== IMPORT: Sheet classification AI calls ==="
grep -rn "classifySheet\|sheetType\|matchedComponent\|componentMatch" \
  src/lib/import/ src/lib/ingestion/ src/lib/data-architecture/ 2>/dev/null | \
  grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== PLAN: Plan interpretation AI calls ==="
grep -rn "interpretPlan\|extractComponent\|planInterpret\|parsePlan" \
  src/lib/compensation/ src/lib/orchestration/ 2>/dev/null | \
  grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== Signal capture: Where are signals written? ==="
grep -rn "classification_signal\|classificationSignal\|captureSignal\|logSignal\|writeSignal" \
  src/ --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== API route: Does import API log signals? ==="
grep -rn "signal\|prediction\|confidence\|override" \
  src/app/api/import/ src/app/api/ingestion/ 2>/dev/null | \
  grep -v node_modules | head -15
```

### 0C: Where does the user accept or override AI suggestions?

```bash
echo "=== Field mapping UI: Accept/Override flow ==="
grep -rn "override\|accept\|confirm\|userSelect\|onChange.*field\|setMapping" \
  src/components/*import* src/components/*mapping* src/components/*ingestion* 2>/dev/null | \
  grep -v node_modules | head -20

echo ""
echo "=== Sheet classification UI: Accept/Override flow ==="
grep -rn "componentAssign\|sheetConfirm\|classificationConfirm" \
  src/components/ 2>/dev/null | \
  grep -v node_modules | head -10
```

### Phase 0 Output — MANDATORY

```
// PHASE 0 AUDIT — OB-86
//
// CLASSIFICATION_SIGNALS TABLE:
//   Row count: [N]
//   Signal types: [list]
//   Currently written from: [file:function or "NOWHERE"]
//
// AI PREDICTION POINTS:
//   1. Field mapping: [file:line] — confidence captured? [Y/N]
//   2. Sheet classification: [file:line] — confidence captured? [Y/N]
//   3. Plan interpretation: [file:line] — confidence captured? [Y/N]
//
// USER OUTCOME CAPTURE POINTS:
//   1. Field mapping override: [file:line or "NOT CAPTURED"]
//   2. Sheet classification override: [file:line or "NOT CAPTURED"]
//
// GAP SUMMARY:
//   Predictions logged: [Y/N for each]
//   Outcomes logged: [Y/N for each]
//   Signals in DB: [N rows]
```

**Commit:** `OB-86 Phase 0: AI signal capture audit`

---

## MISSION 1: SIGNAL CAPTURE SERVICE

Build a reusable service that logs classification signals to Supabase.

### 1A: Create the Classification Signal Service

Create `src/lib/ai/classification-signal-service.ts`:

```typescript
// Interface — what every signal must contain
interface ClassificationSignal {
  tenantId: string;
  signalType: 'field_mapping' | 'sheet_classification' | 'plan_interpretation' | 'entity_resolution';
  prediction: {
    value: string;       // What the AI predicted
    confidence: number;  // 0-1
    model?: string;      // Which model/version
  };
  outcome?: {
    value: string;       // What the user selected (if different = override)
    source: 'user_accepted' | 'user_override' | 'auto_confirmed';
  };
  context: Record<string, unknown>; // Input data that led to prediction
}

// Service methods:
// captureSignal(signal: ClassificationSignal): Promise<void>
// captureFieldMapping(tenantId, fieldName, sampleValues, prediction, confidence): Promise<string>
// recordOutcome(signalId, userValue, source): Promise<void>
// getSignalsByTenant(tenantId, type?, limit?): Promise<Signal[]>
```

### Key Requirements

1. **Use existing `classification_signals` table** — do NOT create a new table. Map to existing schema:
   - `signal_type` → the signal type
   - `signal_value` → `{ prediction, outcome }` as JSONB
   - `confidence` → prediction confidence (0-1)
   - `source` → prediction model/version
   - `context` → input data context

2. **Two-phase capture**: First call logs prediction (at AI suggestion time). Second call updates with outcome (at user accept/override time). Use the signal `id` returned from first call.

3. **Supabase service role** for writes (signals are system data, not user data). Standard RLS for reads.

4. **No mock data.** If no signals exist, the service returns empty arrays. The UI shows "No data yet — import data to begin intelligence measurement."

5. **Tenant isolation.** Signals scoped by tenant_id. Cross-tenant queries only for VL Admin (foundational flywheel).

**Commit:** `OB-86 Mission 1A: Classification signal service`

### 1B: Wire Signal Capture Into Import Pipeline

Find every location where the AI makes a prediction during import and add signal capture:

**Field Mapping:**
- When AI suggests a semantic type for a column → `captureFieldMapping()`
- When user accepts or changes the mapping → `recordOutcome()`

**Sheet Classification:**
- When AI classifies a sheet as a component type → `captureSignal({ type: 'sheet_classification' })`
- When user confirms or changes assignment → `recordOutcome()`

**Implementation approach:**
- Find the existing AI prediction calls (Phase 0B identified them)
- Add `captureSignal()` AFTER the prediction is made (don't change prediction logic)
- Find the user accept/override UI handlers (Phase 0C identified them)
- Add `recordOutcome()` AFTER the user action

**CRITICAL: Do NOT modify the prediction logic.** Only ADD logging calls alongside it. The measurement layer observes — it doesn't interfere.

**Commit:** `OB-86 Mission 1B: Wire signal capture into import pipeline`

### 1C: Verify Signals Are Written

After wiring, trigger a data import (from browser or test) and verify:

```sql
-- Check that signals were written
SELECT id, signal_type, confidence,
  signal_value->>'prediction' as ai_predicted,
  signal_value->>'outcome' as user_outcome,
  created_at
FROM classification_signals
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC
LIMIT 10;
```

If 0 rows → the wiring didn't work. Trace the code path.
If >0 rows with predictions but no outcomes → the outcome capture isn't wired.
If >0 rows with both prediction and outcome → signal capture is working.

**Commit:** `OB-86 Mission 1C: Signal capture verification`

---

## MISSION 2: METRICS COMPUTATION

Build functions that compute accuracy metrics from classification_signals.

### 2A: Create the AI Metrics Service

Create `src/lib/ai/ai-metrics-service.ts`:

```typescript
interface AIMetrics {
  fieldMapping: {
    accuracy: number;         // correct / total
    overrideRate: number;     // overrides / total
    avgConfidence: number;    // mean confidence
    totalPredictions: number;
    totalOverrides: number;
  };
  sheetClassification: {
    accuracy: number;
    overrideRate: number;
    totalPredictions: number;
  };
  calibration: {
    buckets: Array<{
      range: string;           // "0-50%", "50-70%", etc.
      predictedConfidence: number;
      actualAccuracy: number;
      count: number;
    }>;
    score: number;             // 0-1, how close to diagonal
  };
  flywheel: {
    tenantTrend: Array<{
      importNumber: number;
      avgConfidence: number;
      accuracy: number;
      date: string;
    }>;
  };
}

// Service methods:
// computeMetrics(tenantId): Promise<AIMetrics>
// computeCalibration(tenantId?): Promise<CalibrationData>
// computeFlywheelTrend(tenantId): Promise<FlywheelData[]>
```

### Key Requirements

1. **All metrics computed from classification_signals rows.** Zero hardcoded values. If no signals → all metrics return null/0 with a flag indicating "insufficient data."

2. **Calibration computation:**
   - Bucket signals by confidence: 0-50%, 50-70%, 70-85%, 85-95%, 95-100%
   - For each bucket: `actual_accuracy = correct_in_bucket / total_in_bucket`
   - Calibration score: mean absolute deviation from perfect calibration (diagonal)
   - Perfect score = 0 (actual matches predicted). Bad score > 0.2.

3. **Flywheel computation:**
   - Group signals by tenant + import_batch (chronological)
   - For each import: compute avg confidence and accuracy
   - Return as time series for charting

4. **Performance:** These queries can be expensive. Cache results per `(tenant_id, period)` with a 1-hour TTL. Recompute on demand via API.

**Commit:** `OB-86 Mission 2: AI metrics computation service`

---

## MISSION 3: API ROUTES

### 3A: Create API endpoints for metrics

Create `src/app/api/ai/metrics/route.ts`:
- `GET /api/ai/metrics?tenantId=X` → returns AIMetrics
- Requires authentication (VL Admin for cross-tenant, CC Admin for own tenant)

Create `src/app/api/ai/signals/route.ts`:
- `GET /api/ai/signals?tenantId=X&type=field_mapping&limit=50` → returns signals
- Used by Observatory detail views

### 3B: Create API endpoint for calibration

Create `src/app/api/ai/calibration/route.ts`:
- `GET /api/ai/calibration?tenantId=X` → returns calibration data
- `GET /api/ai/calibration` (VL Admin only) → returns cross-tenant calibration

**Commit:** `OB-86 Mission 3: AI metrics API routes`

---

## MISSION 4: OBSERVATORY AI INTELLIGENCE PANEL

### 4A: VL Admin Observatory — AI Intelligence Section

Add to the existing Observatory page (VL Admin view) a new section: "AI Intelligence."

**Four metric cards at the top:**

| Card | Value Source | Format |
|------|-------------|--------|
| Field Mapping Accuracy | `metrics.fieldMapping.accuracy` | Percentage with trend arrow |
| Sheet Classification Accuracy | `metrics.sheetClassification.accuracy` | Percentage with trend arrow |
| Calibration Score | `metrics.calibration.score` | 0-1 with label (Good/Fair/Poor) |
| Override Rate | `metrics.fieldMapping.overrideRate` | Percentage with trend arrow (down = good) |

**Flywheel Trend Chart (below cards):**
- Line chart showing confidence trend per tenant across imports
- X axis: import sequence (1st, 2nd, 3rd...)
- Y axis: average confidence (0-100%)
- One line per tenant (selectable via dropdown)
- If only 1 import exists for a tenant → show single dot with message "More imports needed to show trend"

**Calibration Plot (below flywheel):**
- Scatter/line chart
- X axis: Predicted Confidence (0-100%)
- Y axis: Actual Accuracy (0-100%)
- Diagonal reference line = perfect calibration
- Points per confidence bucket
- If insufficient data → show placeholder with "Import data to generate calibration analysis"

### 4B: Design Principles

1. **Follow DS-001 design system.** Use existing color palette, typography, card styles.
2. **Empty states are honest.** Don't show "94.2%" if there are 0 signals. Show "No data — import data to begin measurement."
3. **Real data only.** Every number computed from `ai-metrics-service.ts`. Zero mock values.
4. **Responsive.** Cards stack on mobile. Charts scale down.
5. **Use recharts** for charts (already available in the project).

### 4C: CC Admin — AI Quality Panel (Tenant View)

On the tenant's dashboard (CC Admin persona), add a simplified panel:

```
AI QUALITY — Your Data Intelligence

Import Accuracy:    [computed]%  ([trend] from first import)
Auto-mapped Fields: [computed]   ([N] required manual review)
Confidence Level:   [High/Medium/Low]  (based on [N] imports)

[Message about learning status — computed, not hardcoded]
```

If no signals → "Your first import will begin building intelligence about your data patterns."

**Commit:** `OB-86 Mission 4: Observatory AI Intelligence Panel + CC Admin AI Quality`

---

## MISSION 5: BUILD + CLT

### 5A: Build

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 5B: Browser Verification (CC-led, Andrew will re-verify)

1. Navigate to Observatory (VL Admin)
2. AI Intelligence section visible
3. If signals exist → metrics display computed values
4. If no signals → empty states display correctly
5. Navigate to tenant dashboard (CC Admin)
6. AI Quality panel visible
7. No console errors on either page
8. Charts render (even if empty state)

**Commit:** `OB-86 Mission 5: Build verification`

---

## MISSION 6: COMPLETION REPORT + PR

### Completion Report

Save as `OB-86_COMPLETION_REPORT.md` in PROJECT ROOT:

1. **Phase 0 audit** — what signal capture existed before OB-86
2. **Signal service** — how signals are captured, where they're wired
3. **Metrics service** — what metrics are computed, from what data
4. **API routes** — endpoints created
5. **Observatory** — VL Admin AI Intelligence Panel, CC Admin AI Quality
6. **Signal count** — how many signals in DB after test import
7. **Sample signal** — one actual signal JSON from Supabase
8. **All proof gates** — PASS/FAIL with evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-86: AI/ML Measurement Infrastructure — Classification Signals + Observatory" \
  --body "## What This Builds

### Classification Signal Capture
- Signal service logs every AI prediction + user outcome
- Wired into field mapping and sheet classification flows
- Two-phase: prediction at suggestion time, outcome at accept/override time
- Uses existing classification_signals table

### Metrics Computation
- Accuracy, override rate, confidence calibration
- Flywheel trend (confidence over sequential imports)
- All metrics computed from real signals — zero hardcoded values

### Observatory AI Intelligence Panel (VL Admin)
- 4 metric cards: Field Accuracy, Sheet Accuracy, Calibration, Override Rate
- Flywheel trend chart (per-tenant confidence over time)
- Calibration plot (predicted vs actual accuracy)

### CC Admin AI Quality Panel
- Simplified intelligence summary for tenant admins
- Honest empty states when no data exists

## Proof Gates: see OB-86_COMPLETION_REPORT.md"
```

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 committed | Audit of existing signal capture with SQL evidence |
| PG-2 | Signal service exists | `classification-signal-service.ts` exports `captureSignal()` and `recordOutcome()` |
| PG-3 | Field mapping signals captured | Import → signals written to classification_signals |
| PG-4 | Sheet classification signals captured | Import → signals written with type `sheet_classification` |
| PG-5 | Outcome capture works | User accept/override → signal updated with outcome |
| PG-6 | Metrics service computes from real data | `ai-metrics-service.ts` returns non-null metrics when signals exist |
| PG-7 | Metrics return null/0 when no signals | Empty tenant → metrics indicate "no data" not fake values |
| PG-8 | Calibration computed | Confidence buckets with actual accuracy computed |
| PG-9 | Flywheel trend computed | Per-import confidence trend returned |
| PG-10 | API routes work | GET /api/ai/metrics returns JSON |
| PG-11 | Observatory AI Intelligence Panel renders | VL Admin Observatory shows 4 metric cards |
| PG-12 | Flywheel chart renders | Line chart visible (even if single dot) |
| PG-13 | Calibration chart renders | Scatter plot visible (even if empty state) |
| PG-14 | CC Admin AI Quality Panel renders | Tenant dashboard shows AI Quality section |
| PG-15 | Empty states are honest | No data → "Import data to begin measurement" not fake numbers |
| PG-16 | Zero hardcoded metric values | grep for hardcoded percentages returns 0 in AI metrics code |
| PG-17 | Classification Signal terminology | Zero instances of "Training Signal" in new code |
| PG-18 | `npm run build` exits 0 | Clean build |
| PG-19 | localhost:3000 responds | HTTP 200 |

---

## WHAT OB-86 DOES NOT BUILD

- Cross-tenant foundational flywheel aggregation (needs 2+ tenants)
- Domain flywheel metrics (needs 5+ tenants)
- Plan interpretation signals (reconciliation-based — future)
- Learned embeddings or pgvector (Stage 2 maturity)
- Automatic prompt enrichment from signals (Stage 1 enhancement — after measurement proves value)

This OB builds the **measurement layer** — the foundation that makes everything above measurable and provable.

---

## SCOPE CONTROL

**If any mission takes more than 2× its expected time, STOP and report what's blocking.**

Expected durations:
- Phase 0: 10 min (read-only audit)
- Mission 1: 30 min (service + wiring)
- Mission 2: 20 min (metrics computation)
- Mission 3: 10 min (API routes)
- Mission 4: 30 min (Observatory UI)
- Mission 5: 10 min (build + verify)
- Mission 6: 10 min (report + PR)

**Total: ~2 hours. If approaching 3 hours, something is wrong.**

---

*OB-86 — February 24, 2026*
*"If you can't measure it, you can't prove it. If you can't prove it, it's a story."*
*"The flywheel starts with the first signal."*
