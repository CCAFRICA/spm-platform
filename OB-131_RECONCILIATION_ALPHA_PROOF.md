# OB-131: RECONCILIATION VIA UI — THE ALPHA PROOF
## Benchmark Upload Through SCI + Comparison Engine + Per-Entity Verification
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 18-22 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `RECONCILIATION_INTELLIGENCE_SPECIFICATION.md` — the full reconciliation architecture
4. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI and two-vocabulary architecture
5. `web/src/lib/sci/sci-types.ts` — SCI type definitions
6. `web/src/lib/sci/agents.ts` — agent scoring models
7. `web/src/app/api/import/sci/analyze/route.ts` — SCI analyze API
8. `OB-128_COMPLETION_REPORT.md` — current LAB state (4/4 plans, exact totals)
9. `OB-129_COMPLETION_REPORT.md` — SCI import UI components
10. Existing reconciliation page — find it via `find web/src -path "*reconcil*"`

---

## WHY THIS OB EXISTS

This is the Alpha proof gate. Everything we've built — SCI agents, convergence, composed intents, customer vocabulary, plan-centric calculation — culminates in one question:

**Can a customer upload a benchmark file and see 100% accuracy verified in the browser?**

Not through scripts. Not through Supabase queries. Through the UI.

The reconciliation experience completes the customer journey: Import → Calculate → Verify. After OB-131, a customer can:
1. Upload their data through SCI (OB-129)
2. Calculate results per plan (OB-130)
3. Upload their expected/benchmark results
4. See every entity compared: Vialuce total vs expected total
5. Confirm the platform produces the right answers

This is the experience that earns trust. This is what closes sales. This is Alpha.

---

## DESIGN VISION

### Reconciliation as Confidence Builder

Reconciliation is not an error-finding exercise. It's a confidence-building exercise. The customer uploads their known-good numbers, and the platform proves it matches.

**The Bloodwork Principle applies directly:** The default view is a clean summary. "All 12 entities matched exactly. Total: $601,000. 0 discrepancies." If everything passes, the customer sees green and confidence. If there are mismatches, they're surfaced with context — not blame.

**IAP Application:**

**Intelligence:** The comparison doesn't just say "match" or "mismatch." For mismatches, it explains: "Ana Lopez: Vialuce $5,000 vs Expected $12,000 — attainment 77.8% placed in Base tier (60-80%), expected tier appears to be Target (80-100%)." The platform diagnoses the difference.

**Acceleration:** Upload → Auto-map → Compare → Results. No manual column mapping. SCI's field classification identifies the entity ID column and payout column automatically. The customer confirms, the comparison runs.

**Performance:** The match rate is visible in 3 seconds. "12/12 entities exact match. 100%." That's the number that closes the deal.

### The Experience

The reconciliation page lives at `/operate/reconciliation` (Standing Rule 24 — one canonical location). It connects to the Operate lifecycle: Import → Calculate → Reconcile → Approve.

The flow:
1. Customer selects which calculation to verify (plan + period)
2. Customer uploads their benchmark file (expected results)
3. SCI classifies the benchmark columns (entity ID, payout amounts)
4. Platform proposes the column mapping
5. Customer confirms (or adjusts)
6. Comparison runs instantly
7. Results display: match rate, per-entity comparison, drill-down

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-131: Reconciliation via UI — Alpha Proof" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary in component code.** Korean Test applies.
8. **IAP Gate on every component.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — CURRENT RECONCILIATION STATE

### 0A: Existing reconciliation infrastructure

```bash
echo "=== RECONCILIATION PAGES ==="
find web/src/app -path "*reconcil*" | sort

echo ""
echo "=== RECONCILIATION COMPONENTS ==="
find web/src/components -name "*reconcil*" -o -name "*Reconcil*" | sort

echo ""
echo "=== RECONCILIATION LIB ==="
find web/src/lib -path "*reconcil*" | sort
ls web/src/lib/reconciliation/ 2>/dev/null

echo ""
echo "=== RECONCILIATION API ==="
find web/src/app/api -path "*reconcil*" | sort
```

### 0B: Existing comparison engine

```bash
echo "=== COMPARISON ENGINE ==="
cat web/src/lib/reconciliation/comparison-engine.ts 2>/dev/null | head -60

echo ""
echo "=== BENCHMARK ANALYSIS ==="
cat web/src/lib/reconciliation/benchmark-intelligence.ts 2>/dev/null | head -60
grep -rn "analyzeBenchmark\|BenchmarkAnalysis\|matchEntities" web/src/lib/reconciliation/ --include="*.ts" | head -15
```

### 0C: Current reconciliation page

```bash
echo "=== RECONCILIATION PAGE ==="
cat web/src/app/operate/reconciliation/page.tsx 2>/dev/null | head -80

echo ""
echo "=== RECONCILIATION ROUTE ==="
find web/src/app -path "*operate/reconcil*" | sort
```

### 0D: LAB calculation results (what we'll reconcile against)

```bash
echo "=== LAB RESULTS BY PLAN ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await sb.rpc('', {}).catch(() => null);
  // Direct query
  const { data: results } = await sb
    .from('calculation_results')
    .select('rule_set_id, total_payout, entity_id')
    .eq('tenant_id', 'a630404c-0777-4f6d-b760-b8a190ecd63c')
    .limit(300);
  
  // Group by rule_set
  const byPlan = {};
  for (const r of results || []) {
    byPlan[r.rule_set_id] = byPlan[r.rule_set_id] || { count: 0, total: 0 };
    byPlan[r.rule_set_id].count++;
    byPlan[r.rule_set_id].total += r.total_payout;
  }
  
  // Get plan names
  for (const rsId of Object.keys(byPlan)) {
    const { data: rs } = await sb.from('rule_sets').select('name').eq('id', rsId).single();
    console.log(rs?.name || rsId, ':', byPlan[rsId].count, 'results,', byPlan[rsId].total.toFixed(2));
  }
}
main();
"
```

### 0E: Available benchmark/reconciliation files

```bash
echo "=== RECONCILIATION FILES IN PROJECT ==="
find /mnt/project -name "*reconcil*" -o -name "*Reconcil*" -o -name "*benchmark*" | sort

echo ""
echo "=== CLT14B RECONCILIATION DETAIL ==="
# This is our benchmark file
ls -la /mnt/project/CLT14B_Reconciliation_Detail.xlsx 2>/dev/null
```

**Commit:** `OB-131 Phase 0: Diagnostic — reconciliation infrastructure, LAB results, benchmark files`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-131
=====================================

Problem: Build reconciliation experience that uses SCI intelligence for benchmark
  file classification and connects to existing comparison engine.

Option A: Full SCI pipeline for benchmark (analyze → propose → confirm → execute → compare)
  - Benchmark file flows through SCI agents
  - Agents classify columns (entity ID, payout amounts)
  - After SCI execute, comparison runs against calculation_results
  - Reuses all SCI infrastructure (OB-127/129)
  - Scale: YES. AI-first: YES.

Option B: Dedicated reconciliation upload with auto-mapping (no SCI)
  - Separate upload page for benchmarks
  - Uses existing benchmark-intelligence.ts for column mapping
  - Doesn't go through SCI
  - Scale: YES. Reuse: LOW.

Option C: SCI classification for column mapping + existing comparison engine
  - Use SCI analyze to classify benchmark columns (entity ID, amounts)
  - But DON'T execute through SCI — benchmark data doesn't need to be committed
  - Instead, use the classification to auto-map columns
  - Then feed mapped data directly to the comparison engine
  - Scale: YES. AI-first: YES. Minimal new infrastructure.

CHOSEN: Option C — SCI for intelligence, comparison engine for execution.
  A benchmark file doesn't need to be committed to committed_data. It's ephemeral —
  it exists only for the duration of the comparison. SCI's value here is column
  classification (which column is the entity ID, which is the payout), not data
  routing. The comparison engine already exists and works.

  The flow:
  1. Customer uploads benchmark file on the reconciliation page
  2. Client-side parsing (SheetJS, same as SCI import)
  3. SCI analyze API classifies columns
  4. Platform proposes mapping: entity ID column, payout column, optional period column
  5. Customer confirms
  6. Client sends benchmark rows + confirmed mappings + selected calculation batch
  7. Comparison API runs server-side, returns per-entity results
  8. Results display in UI

REJECTED: Option A — over-engineered. Benchmark data doesn't need persistence.
REJECTED: Option B — misses the opportunity to reuse SCI intelligence.
```

**Commit:** `OB-131 Phase 1: Architecture decision — SCI classification for mapping + direct comparison`

---

## PHASE 2: BENCHMARK MAPPING SERVICE

### File: `web/src/lib/reconciliation/benchmark-mapper.ts` (NEW or MODIFY existing)

Takes SCI's content classification and extracts the three minimum reconciliation mappings:

```typescript
interface BenchmarkMapping {
  entityIdColumn: string;         // which column contains entity identifiers
  totalPayoutColumn: string;      // which column contains expected total payout
  periodColumn?: string;          // optional: which column contains period info
  componentColumns?: {            // optional: per-component columns
    columnName: string;
    componentName: string;
  }[];
  confidence: number;             // overall mapping confidence
}
```

**Extraction logic from SCI semantic bindings:**

1. **Entity ID column:** Find the field with `semanticRole === 'entity_identifier'`. If multiple, prefer the one with highest confidence. If none found, look for fields whose names contain ID/identifier signals (from SCI's `nameSignals`).

2. **Total payout column:** Find currency fields. If only one currency column exists, that's the total. If multiple currency columns exist:
   - Look for field names containing "total", "payout", "incentive", "compensation" (multilingual)
   - If one field's sum is close to the known calculation total for the batch, prefer it
   - If still ambiguous, present all currency columns for customer selection

3. **Period column:** Find date fields or fields with `semanticRole === 'period_marker'`. If the benchmark has exactly one period of data (all rows same period), period mapping isn't needed — auto-detect.

4. **Component columns:** After entity ID, total payout, and period are mapped, remaining currency columns may be per-component breakdowns. Match by name similarity to plan component names (token overlap). This is Level 4 depth — optional, enhances diagnostic quality.

**This service does NOT call SCI analyze API directly.** It receives the SCI proposal (already generated) and extracts the mapping. The page calls SCI analyze, then passes the proposal to this mapper.

**Tests:** Create `web/scripts/ob131-test-benchmark-mapper.ts`:
- Test 1: Single-entity-ID + single-payout benchmark → clean mapping
- Test 2: Multiple currency columns → total identified by sum proximity to batch total
- Test 3: No entity ID found → confidence low, human review required
- Test 4: Period column detected from date field
- Test 5: Component columns matched by name similarity

**Commit:** `OB-131 Phase 2: Benchmark mapping service — SCI classification to reconciliation mapping`

---

## PHASE 3: COMPARISON API

### File: `web/src/app/api/reconciliation/compare/route.ts` (NEW or MODIFY existing)

Server-side comparison endpoint that receives benchmark data and mapping, runs the comparison against calculation results.

**Request:**
```typescript
{
  tenantId: string;
  ruleSetId: string;                  // which plan to compare
  periodId?: string;                  // optional: specific period (or all)
  mapping: BenchmarkMapping;
  benchmarkRows: Record<string, unknown>[];  // the parsed benchmark data
}
```

**Response:**
```typescript
{
  summary: {
    totalEntities: number;
    matchedEntities: number;
    exactMatches: number;
    toleranceMatches: number;       // delta < 1%
    mismatches: number;             // delta >= 1%
    matchRate: number;              // exactMatches / matchedEntities
    vlTotal: number;
    benchmarkTotal: number;
    totalDelta: number;
    totalDeltaPercent: number;
    vlOnlyEntities: number;
    benchmarkOnlyEntities: number;
  };
  
  entityResults: EntityComparison[];
  
  populationMismatch: {
    vlOnly: { entityId: string; payout: number }[];
    benchmarkOnly: { entityId: string; expectedPayout: number }[];
  };
}

interface EntityComparison {
  entityId: string;
  entityName?: string;
  vlPayout: number;
  benchmarkPayout: number;
  delta: number;
  deltaPercent: number;
  status: 'exact' | 'tolerance' | 'warning' | 'mismatch';
  componentComparisons?: {
    component: string;
    vlAmount: number;
    benchmarkAmount: number;
    delta: number;
  }[];
}
```

**Comparison logic:**

1. **Load VL results:** Query `calculation_results` for the specified `ruleSetId` (and optionally `periodId`). Join with `entities` to get `external_id` and `display_name`.

2. **Normalize entity IDs:** Both VL and benchmark entity IDs are normalized: trimmed, leading zeros stripped, case-insensitive. Build lookup maps.

3. **Match entities:** For each benchmark row, find the corresponding VL entity by normalized external_id. Track unmatched on both sides.

4. **Compare payouts:** For each matched entity:
   - Exact: |delta| < $0.01
   - Tolerance: |delta%| < 1%
   - Warning: |delta%| 1-5%
   - Mismatch: |delta%| > 5%

5. **Component comparison (if mapping includes components):** For matched entities, compare per-component. VL components from `calculation_results.component_results` or `component_payouts` JSONB.

6. **Summary statistics:** Compute totals, match rate, delta distribution.

**Supabase batch limits:** If > 200 entities, batch the `.in()` queries.

**Tests:** Create `web/scripts/ob131-test-comparison.ts`:
- Test 1: LAB DG — 12 entities, variable payouts, compare against known values
- Test 2: Entity ID normalization — leading zeros, case differences
- Test 3: Population mismatch detection — extra entities in benchmark vs VL
- Test 4: Exact match calculation — delta < $0.01
- Test 5: Tolerance classification — 0.01 < delta% < 1%
- Test 6: Korean Test — zero domain vocabulary in comparison code

**Commit:** `OB-131 Phase 3: Comparison API — entity matching, delta calculation, status classification`

---

## PHASE 4: RECONCILIATION UI — BENCHMARK UPLOAD + MAPPING

### File: `web/src/components/reconciliation/BenchmarkUpload.tsx`

Reuses the SCI upload pattern (drop zone, file parsing) but in the reconciliation context.

**Flow:**
1. Customer selects which plan's results to verify (dropdown of plans with calculation results)
2. Customer uploads benchmark file
3. Client-side parsing (SheetJS)
4. SCI analyze API classifies columns
5. Benchmark mapper extracts mapping
6. Platform proposes: "I'll compare Officer ID against your team, and Total Payout against our calculated results."
7. Customer confirms or adjusts mapping

**Design:**

```
┌─────────────────────────────────────────────────────────┐
│  Verify: Deposit Growth Incentive ▼                     │
│  12 entities • $601,000 total • 4 periods               │
│                                                         │
│  Upload your expected results to compare:               │
│                                                         │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐           │
│  │                                         │           │
│  │     Drop your benchmark file here       │           │
│  │        XLSX • CSV • XLS                 │           │
│  │                                         │           │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘           │
└─────────────────────────────────────────────────────────┘
```

After classification:

```
┌─────────────────────────────────────────────────────────┐
│  I found 12 rows with entity identifiers and payouts.   │
│                                                         │
│  Mapping:                                               │
│    Officer ID → matches your team members               │
│    Total Payout → compared against calculated results    │
│                                                         │
│  ┌──────────────┐  ┌─────────────────┐                 │
│  │  Compare Now  │  │  Edit Mapping   │                 │
│  └──────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

**Edit Mapping** opens dropdowns for each mapping (entity ID, payout, period) populated with the file's column names. The SCI-suggested columns are pre-selected.

**Commit:** `OB-131 Phase 4: BenchmarkUpload component — plan selection, file upload, SCI mapping proposal`

---

## PHASE 5: RECONCILIATION UI — RESULTS DISPLAY

### File: `web/src/components/reconciliation/ReconciliationResults.tsx`

The results display follows the Bloodwork Principle: clean summary first, detail on demand.

### 5.1: Summary Bar (Bloodwork Layer 1)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Match Rate: 100%    ✓ All entities match exactly       │
│                                                         │
│  Vialuce: $601,000  •  Expected: $601,000  •  Δ $0.00  │
│  12 of 12 entities matched  •  0 discrepancies          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Visual treatment:**
- 100% match → Green confidence card, checkmark icon. "All entities match exactly."
- > 95% match → Green with amber note. "11 of 12 matched. 1 entity has a difference."
- < 95% match → Amber card. "Discrepancies found in [N] entities."
- < 80% match → Red attention card. "Significant differences detected."

The match rate badge is the hero metric. It's the first thing the customer sees. It's the number they report to their boss.

### 5.2: Entity Table (Bloodwork Layer 2)

Below the summary, a sortable table of per-entity comparisons:

| Officer ID | Name | Vialuce | Expected | Delta | Status |
|-----------|------|---------|----------|-------|--------|
| 1001 | Carlos Garcia | $12,000 | $12,000 | $0.00 | ✓ |
| 1004 | Ana Lopez | $5,000 | $5,000 | $0.00 | ✓ |
| 1016 | Elena Morales | $30,000 | $30,000 | $0.00 | ✓ |
| 1014 | Diana Diaz | $0 | $0 | $0.00 | ✓ |

**Column headers use customer vocabulary** (from SCI semantic bindings).

**Sort options:** By status (mismatches first), by delta (largest first), by entity ID, by payout.

**Filter options:** Show all / Exact matches only / Discrepancies only.

**Status icons:**
- ✓ Exact match (green) — delta < $0.01
- ≈ Tolerance (blue) — delta < 1%
- ⚠ Warning (amber) — delta 1-5%
- ✕ Mismatch (red) — delta > 5%

### 5.3: Entity Drill-Down (Bloodwork Layer 3)

Click an entity row to expand and see:
- The specific values that produced the delta
- If component-level data is available: per-component comparison
- If the entity is missing from one side: which side and why

```
  Carlos Garcia (Officer 1001)
  ┌─────────────────────────────────────────────────────────┐
  │  Vialuce:  $12,000                                      │
  │  Expected: $12,000                                      │
  │  Delta:    $0.00 (exact match)                          │
  │                                                          │
  │  Attainment: 89.4% → Target tier (80-99.99%) → $12,000  │
  └─────────────────────────────────────────────────────────┘
```

For mismatches, the drill-down attempts to explain the difference:
- "Vialuce applied tier X, expected data implies tier Y"
- "Vialuce total $X is the sum of components A+B+C, expected $Y differs by component B"

### 5.4: Population Mismatch Panel

If entities exist in one dataset but not the other, show a collapsible panel:

```
  ⚠ Population Differences
  
  In Vialuce but not in benchmark: Entity 1025 ($8,000)
  In benchmark but not in Vialuce: Entity 9999 ($15,000)
```

### 5.5: Export

"Download Comparison Report" button → exports the full comparison as CSV with columns: Entity ID, Name, VL Total, Benchmark Total, Delta, Delta%, Status, Component Details.

**IAP Gate:**
- Intelligence: Match rate + delta analysis per entity → customer knows exactly where they stand
- Acceleration: One-click export for sharing with stakeholders
- Performance: Match rate visible in 3 seconds, entity-level in 10 seconds

**Commit:** `OB-131 Phase 5: ReconciliationResults component — Bloodwork layers, entity table, drill-down`

---

## PHASE 6: RECONCILIATION PAGE ASSEMBLY

### File: `web/src/app/operate/reconciliation/page.tsx` (REPLACE or REWRITE)

Assemble the components into the reconciliation page.

**Page states:**
```typescript
type ReconciliationState =
  | { phase: 'select' }                                // choose plan
  | { phase: 'upload'; planId: string; planName: string }  // upload benchmark
  | { phase: 'mapping'; proposal: SCIProposal; mapping: BenchmarkMapping }
  | { phase: 'comparing' }                             // running comparison
  | { phase: 'results'; comparison: ComparisonResult }
  | { phase: 'error'; error: string };
```

**Navigation:**
- Route: `/operate/reconciliation` (Standing Rule 24)
- Breadcrumb: Operate → Reconciliation
- Sidebar shows "Reconcile" as active
- Accessible from OB-130's calculate page ("Verify Results →" button on plan cards)

**Integration with Operate lifecycle:**
The reconciliation page reads from the Operate context. If the customer navigated from a specific plan's results, that plan is pre-selected.

**Commit:** `OB-131 Phase 6: Reconciliation page assembly — state machine, navigation, Operate integration`

---

## PHASE 7: LAB RECONCILIATION PROOF — THE ALPHA TEST

This is the critical phase. We reconcile all 4 LAB plans against known expected values.

### 7.1: DG Reconciliation

Create a benchmark script that extracts known DG results and formats as a benchmark file:

```bash
npx tsx -e "
// Extract current DG results per entity per period
// These ARE the 'expected' values since we've verified them in OB-128
// For Alpha, we're proving the UI can display the comparison
// For production, the benchmark would come from the customer's legacy system

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: results } = await sb
    .from('calculation_results')
    .select('entity_id, total_payout, entities(external_id, display_name), rule_sets(name)')
    .eq('tenant_id', 'a630404c-0777-4f6d-b760-b8a190ecd63c')
    .eq('rule_sets.name', 'Deposit Growth%');  // adjust based on actual query capability
  
  // Format as CSV for benchmark upload
  console.log('Officer ID,Name,Expected Payout');
  for (const r of results || []) {
    console.log(r.entities?.external_id + ',' + r.entities?.display_name + ',' + r.total_payout);
  }
}
main();
"
```

Save as a CSV file. Then trigger reconciliation through the UI:
1. Navigate to `/operate/reconciliation`
2. Select DG plan
3. Upload the benchmark CSV
4. Verify SCI classifies columns correctly
5. Confirm mapping
6. Run comparison
7. **Verify: 100% match rate, 12/12 entities, $0.00 total delta**

### 7.2: CL Reconciliation

Repeat with CL benchmark data. Generate from known CL results. Verify 100% match.

### 7.3: Full MBC Reconciliation (if time permits)

If the existing CLT14B_Reconciliation_Detail.xlsx is available and formatted correctly, use it as the benchmark for a broader reconciliation test.

### 7.4: Document results

For each reconciliation run, record:
- Plan name
- Entity count matched
- Match rate
- Total delta
- Any discrepancies and their causes

**Commit:** `OB-131 Phase 7: LAB reconciliation proof — DG and CL verified through UI`

---

## PHASE 8: BROWSER VERIFICATION (CLT)

### 8.1: Navigation

1. Navigate to `/operate/reconciliation`
2. Verify: Page renders with plan selector
3. Verify: Plans with calculation results appear in dropdown
4. Verify: Plan summary shows entity count and total

### 8.2: Benchmark upload

5. Select DG plan
6. Upload benchmark CSV
7. Verify: File parsed, columns detected
8. Verify: SCI classification identifies entity ID and payout columns
9. Verify: Mapping proposal displayed in customer language

### 8.3: Comparison results

10. Click "Compare Now"
11. Verify: Comparison runs (loading indicator visible)
12. Verify: Summary bar shows match rate prominently
13. Verify: Entity table shows all matched entities
14. Verify: Status icons correct (✓ for exact, ⚠ for discrepancy)
15. Verify: Column headers use customer vocabulary

### 8.4: Drill-down

16. Click an entity row
17. Verify: Expansion shows VL vs expected with delta
18. Verify: No platform jargon in the drill-down

### 8.5: Error states

19. Upload empty file → clean error
20. Upload file with no entity ID column → helpful message
21. Upload file with entity IDs that don't match → population mismatch panel

**Commit:** `OB-131 Phase 8: Browser verification — full reconciliation flow`

---

## PHASE 9: KOREAN TEST + BUILD + COMPLETION REPORT + PR

### 9.1: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/components/reconciliation/ --include="*.tsx" --include="*.ts"

grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/lib/reconciliation/ --include="*.ts"

grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/app/operate/reconciliation/ --include="*.tsx" --include="*.ts"

# Expected: 0 matches in all
```

### 9.2: Build clean

```bash
cd web && rm -rf .next && npm run build
```

### 9.3: Regression

```sql
-- Verify reconciliation changes didn't affect any calculation data
SELECT rs.name, COUNT(*) as results, SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
GROUP BY rs.name;
```

Expected: CL $6,540,774.36, MO $989,937.41, IR $366,600.00, DG $601,000.00

### 9.4: Completion Report

Create `OB-131_COMPLETION_REPORT.md` at project root.

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | Reconciliation page renders | /operate/reconciliation shows plan selector |
| PG-03 | Plan dropdown populated | All 4 LAB plans with results appear |
| PG-04 | Benchmark upload works | File parsed, columns detected |
| PG-05 | SCI classification identifies columns | Entity ID and payout columns auto-mapped |
| PG-06 | Mapping proposal displayed | Customer sees proposed column mapping |
| PG-07 | Comparison executes | Loading state → results appear |
| PG-08 | Match rate displayed | Hero metric visible in summary bar |
| PG-09 | Entity table populated | Per-entity comparison with VL vs expected |
| PG-10 | Status icons correct | ✓ for exact, ⚠ for discrepancy |
| PG-11 | Customer vocabulary | Column headers from source file, not platform types |
| PG-12 | Entity drill-down works | Click row → expansion shows delta detail |
| PG-13 | **DG reconciliation: 100% match** | **12/12 entities, $601,000, $0.00 delta** |
| PG-14 | CL regression | 100 results, $6,540,774.36 |
| PG-15 | MO regression | 56 results, $989,937.41 |
| PG-16 | IR regression | 64 results, $366,600.00 |
| PG-17 | MBC regression | 240 results, $3,245,212.66 ± $0.10 |
| PG-18 | Korean Test | 0 domain vocabulary in reconciliation code |
| PG-19 | No auth files modified | Middleware unchanged (or minimal PUBLIC_PATHS addition) |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | Bloodwork Principle | Default view is summary → detail on demand |
| SPG-02 | Population mismatch panel | VL-only and benchmark-only entities shown when applicable |
| SPG-03 | Export works | CSV download of comparison results |
| SPG-04 | Navigate from Calculate | "Verify Results" link from OB-130 plan card reaches reconciliation with plan pre-selected |

**Create PR:** `gh pr create --base main --head dev --title "OB-131: Reconciliation via UI — Alpha Proof Gate" --body "Benchmark upload through SCI classification, per-entity comparison engine, Bloodwork results display. DG reconciliation: 100% match, 12/12 entities, $0.00 delta. Alpha proof gate: complete verification through the browser."`

**Commit:** `OB-131 Phase 9: Korean Test + build + completion report + PR`

---

## FILES CREATED/MODIFIED (Expected)

| File | Change |
|------|--------|
| `web/src/lib/reconciliation/benchmark-mapper.ts` | **NEW/MODIFIED** — SCI classification to reconciliation mapping |
| `web/src/app/api/reconciliation/compare/route.ts` | **NEW/MODIFIED** — server-side comparison engine |
| `web/src/components/reconciliation/BenchmarkUpload.tsx` | **NEW** — upload + SCI mapping proposal |
| `web/src/components/reconciliation/ReconciliationResults.tsx` | **NEW** — Bloodwork results display |
| `web/src/app/operate/reconciliation/page.tsx` | **REWRITTEN** — full state machine |
| `web/scripts/ob131-test-benchmark-mapper.ts` | **NEW** — mapping extraction tests |
| `web/scripts/ob131-test-comparison.ts` | **NEW** — comparison engine tests |
| `OB-131_COMPLETION_REPORT.md` | **NEW** — completion report |

---

## WHAT SUCCESS LOOKS LIKE

A customer calculates Deposit Growth results. They see 12 entities with variable payouts — $0 to $30,000 based on individual targets. They click "Verify Results." They upload their expected results spreadsheet. The platform says "I found Officer IDs and payout amounts — ready to compare." They click "Compare Now."

Three seconds later: **"100% match. All 12 entities match exactly. Total: $601,000."**

Green across the board. Every entity verified. The platform produces the same numbers as the customer's legacy system — or their manual calculations — or their audit spreadsheet.

That's Alpha. The platform works. The numbers are right. And the customer proved it themselves, through the browser, with their own data.

---

*"Import → Calculate → Verify. Three steps. One platform. Zero discrepancies."*

*"The customer didn't take our word for it. They proved it themselves."*
