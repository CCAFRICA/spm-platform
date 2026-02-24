# OB-87: RECONCILIATION INTELLIGENCE
## Discoverable Depth. Period Awareness. False Green Detection.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. `RECONCILIATION_INTELLIGENCE_SPECIFICATION.md` — the design specification driving this OB

---

## CONTEXT — WHY THIS EXISTS

The current reconciliation compares VL calculation results against an uploaded benchmark file. It has three critical gaps that have cost multiple development rounds:

1. **Multi-Period Blindness:** The benchmark file `RetailCo data results.xlsx` has 2,157 rows = 719 employees × 3 months. The current reconciliation sums ALL rows, producing a phantom 48.73% delta against VL's 1-month calculation. We wasted R5 debugging a "calculation accuracy problem" that was actually a reconciliation problem.

2. **Two-Field Only:** Current mapping is Employee ID + Total. This misses the false green: Employee 97678074 gets $500 from VL ($300 Store + $200 New Customers) and $500 from benchmark ($500 Optical). Total matches. Components don't. Plan interpretation is wrong. Nobody knows.

3. **Rigid Column Mapping:** Dropdown lists mix English and Spanish calculated field names with Spanish source columns. The benchmark file's structure is independent from the plan's component structure. Forcing structural alignment is the wrong abstraction.

### What This OB Builds

An AI-driven reconciliation engine that:
- Discovers what's comparable between two independent datasets
- Identifies and filters by period (multi-period benchmark files)
- Compares at every discoverable layer (total, component, population)
- Surfaces false greens as highest priority
- Uses classification signals (OB-86) for AI mapping quality measurement

---

## FIRST PRINCIPLES (override everything else)

1. **KOREAN TEST** — Zero hardcoded column names, field patterns, or language-specific matching. If a Korean company uploads 사번/총보상/월 columns, it must work.
2. **THREE MINIMUM MAPPINGS** — Entity ID + Total Payout + Period. Two is not enough. Period is mandatory.
3. **AI-FIRST, NEVER HARDCODED** — All field classification through AI. Deterministic fallback only when AI fails. User has final authority (Three-Tier Resolution Chain, C-38).
4. **FIX LOGIC NOT DATA** — No hardcoded field names from the Óptica Luminar benchmark file.
5. **CARRY EVERYTHING** — Parse all columns from the benchmark file. Express contextually during comparison.
6. **CLASSIFICATION SIGNALS** — Every AI mapping prediction for benchmark fields generates a classification signal (OB-86 infrastructure).

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. Supabase batch ≤200 for all `.in()` calls
7. Build EXACTLY what this prompt specifies (Standing Rule 15)
8. Terminology: "Classification Signal" not "Training Signal". "LLM-Primary, Deterministic Fallback, Human Authority" not "AI-Primary, ML Fallback".

---

## PHASE 0: RECONNAISSANCE — READ CURRENT IMPLEMENTATION

Before writing any code, understand what exists:

```bash
echo "=== CURRENT RECONCILIATION PAGE ==="
find web/src -path "*reconcil*" -type f | head -20

echo ""
echo "=== CURRENT RECONCILIATION API ROUTES ==="
find web/src/app/api -path "*reconcil*" -type f | head -10

echo ""
echo "=== CURRENT RECONCILIATION SERVICES ==="
grep -rn "reconcil" web/src/lib/ --include="*.ts" -l | head -10

echo ""
echo "=== CURRENT BENCHMARK UPLOAD HANDLING ==="
grep -rn "benchmark\|uploadBenchmark\|benchmarkFile\|smartMap" web/src/ --include="*.ts" --include="*.tsx" -l | head -15

echo ""
echo "=== PERIOD VALUE RESOLVER ==="
grep -rn "resolvePeriod\|periodValue\|period.*resolver\|periodDetect" web/src/lib/ --include="*.ts" -l | head -10

echo ""
echo "=== CURRENT RECONCILIATION PAGE COLUMNS/MAPPING ==="
grep -rn "mapColumn\|fieldMapping\|columnMapping\|employeeId.*column\|totalPayout.*column" web/src/ --include="*.tsx" -l | head -10
```

**Output the full list of existing files.** Then read the main reconciliation page and service files. Document:
- Which page renders the reconciliation UI
- How the benchmark file is currently parsed
- How column mapping currently works
- How the comparison engine currently runs
- Where results are stored (localStorage or Supabase)
- Whether period handling exists at all

**Commit:** `OB-87 Phase 0: Reconnaissance — current reconciliation inventory`

---

## MISSION 1: BENCHMARK FILE INTELLIGENCE SERVICE

**File:** `web/src/lib/reconciliation/benchmark-intelligence.ts`

This is the core new service. It receives a parsed benchmark file and produces a structured analysis of what's in it.

### 1A: Benchmark Analysis Types

```typescript
interface BenchmarkAnalysis {
  // Minimum mappings (3 required)
  entityIdColumn: ColumnMapping | null;
  totalPayoutColumn: ColumnMapping | null;
  periodColumns: ColumnMapping[];  // May be 0 (single-period), 1 (month), or 2 (month+year)
  
  // Discovered depth
  componentColumns: ColumnMapping[];  // Component-level payouts if detected
  metricColumns: ColumnMapping[];     // Attainment/metric data if detected
  hierarchyColumns: ColumnMapping[];  // Store/team/region if detected
  
  // Period intelligence
  periodDiscovery: PeriodDiscovery;
  
  // Comparison depth assessment
  depthAssessment: DepthAssessment;
  
  // Raw data
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];  // First 5 rows
}

interface ColumnMapping {
  sourceColumn: string;        // Original column name from file
  semanticType: string;        // AI-classified type
  confidence: number;          // 0-1
  sampleValues: unknown[];     // First 5 values for user verification
}

interface PeriodDiscovery {
  hasPeriodData: boolean;
  periodColumns: string[];          // Which columns contain period info
  distinctPeriods: PeriodValue[];   // What periods exist in the file
  rowsPerPeriod: Record<string, number>;  // Period label → row count
}

interface PeriodValue {
  month: number | null;
  year: number | null;
  label: string;           // Human-readable: "January 2024"
  rawValues: unknown[];    // Original values from file
}

interface DepthAssessment {
  levels: DepthLevel[];
  maxDepth: number;  // 1-5
}

interface DepthLevel {
  level: number;
  name: string;       // "Entity Match", "Total Payout", "Period Filter", "Component Breakdown", "Attainment Data"
  available: boolean;
  confidence: number;
  detail: string;     // "719 rows found", "6 columns mapped to components"
}
```

### 1B: Benchmark Analysis Function

```typescript
async function analyzeBenchmark(
  parsedFile: { headers: string[], rows: Record<string, unknown>[] },
  calculationBatch: { entityExternalIds: string[], components: string[], periodId: string },
  tenantId: string
): Promise<BenchmarkAnalysis>
```

**Implementation:**

1. **AI Classification:** Send the file headers + sample values to the AI classification service (same one used for data import). Request semantic type classification for each column. Log classification signals via OB-86 infrastructure.

2. **Entity ID Detection:** From AI results, find column classified as `employeeId` / `entityId` / `identifier`. Verify by checking if values overlap with `calculationBatch.entityExternalIds` (try first 20 rows, normalize: trim, strip leading zeros, case-insensitive).

3. **Total Payout Detection:** From AI results, find column classified as `amount` / `total` / `payout` / `compensation`. Verify by checking if values are numeric and in reasonable range.

4. **Period Detection:** From AI results, find columns classified as `period` / `month` / `year` / `date`. Apply the Period Value Resolver to sample values to detect what periods exist.

5. **Component Detection:** From AI results, find columns that may map to plan component names. Use fuzzy matching between column names and `calculationBatch.components` (case-insensitive, accent-insensitive, language-agnostic).

6. **Build DepthAssessment:** For each of the 5 levels, report whether it's available, at what confidence, and with what detail.

### 1C: Period Value Resolver (reuse or build)

Check if the existing Period Value Resolver from OB-24 R9 exists. If yes, import and reuse it. If no, build one:

```typescript
function resolvePeriodValues(values: unknown[]): { month: number | null, year: number | null }
```

The resolver takes an array of values from period-mapped columns for one row and produces normalized `{ month, year }`. Strategies in order:
1. Date object or ISO date string → extract month and year
2. 4-digit number 1900-2100 → year
3. Number 1-12 → month
4. Month name in any language (use Intl.DateTimeFormat) → month
5. Pattern: "Q1 2024", "Jan-2024", "2024-01" → parse
6. Full date string parseable by `new Date()` → extract

### 1D: Period Matching

```typescript
function matchPeriods(
  benchmarkPeriods: PeriodValue[],
  vlCalculatedPeriods: { id: string, startDate: string, endDate: string, label: string }[]
): PeriodMatchResult
```

Cross-reference discovered benchmark periods against VL's calculated periods. Report which periods are comparable and which are excluded.

**Commit:** `OB-87 Mission 1: Benchmark Intelligence Service — analysis, period discovery, depth assessment`

---

## MISSION 2: MULTI-LAYER COMPARISON ENGINE

**File:** `web/src/lib/reconciliation/comparison-engine.ts`

This replaces the current total-only comparison with multi-layer comparison.

### 2A: Comparison Types

```typescript
interface ComparisonConfig {
  benchmarkAnalysis: BenchmarkAnalysis;
  calculationBatchId: string;
  confirmedMappings: {
    entityIdColumn: string;
    totalPayoutColumn: string;
    periodColumns: string[];
    componentMappings: { benchmarkColumn: string, vlComponent: string }[];
  };
  periodFilter: PeriodValue[];  // Which periods to compare
}

interface ComparisonResult {
  summary: {
    totalEntities: number;
    matchedEntities: number;
    matchRate: number;
    vlTotal: number;
    benchmarkTotal: number;
    deltaPercent: number;
    periodsCompared: string[];
    depthAchieved: number;
    falseGreenCount: number;
  };
  
  entityResults: EntityComparison[];
  populationMismatch: {
    vlOnly: string[];        // Entity IDs in VL but not benchmark
    benchmarkOnly: string[];  // Entity IDs in benchmark but not VL
  };
  
  // Priority-ordered findings
  findings: Finding[];
}

interface EntityComparison {
  entityId: string;
  vlTotal: number;
  benchmarkTotal: number;
  totalDelta: number;
  totalDeltaPercent: number;
  matchStatus: 'exact' | 'tolerance' | 'warning' | 'alert' | 'false_green';
  
  // Component-level (if depth >= 4)
  componentComparisons?: {
    componentName: string;
    vlAmount: number;
    benchmarkAmount: number;
    delta: number;
  }[];
  
  // False green detection
  isFalseGreen: boolean;
  falseGreenDetail?: string;
}

interface Finding {
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  type: 'false_green' | 'red_flag' | 'warning' | 'tolerance' | 'exact' | 'population';
  entityId?: string;
  message: string;
  detail: string;
}
```

### 2B: Comparison Execution

```typescript
async function executeComparison(config: ComparisonConfig, tenantId: string): Promise<ComparisonResult>
```

**Steps:**

1. **Load VL calculation results** for the specified batch from `calculation_results` table. Batch ≤200 for `.in()` calls.

2. **Filter benchmark rows by period.** If period columns exist, use Period Value Resolver to filter benchmark rows to only the matching period(s).

3. **Match entities.** Normalize both sides (trim, strip leading zeros, case-insensitive). Build lookup maps. Track VL-only and benchmark-only entities.

4. **Layer 1 — Total comparison.** For each matched entity, compare VL `total_payout` vs benchmark total column value.
   - Exact: |delta| < 0.01
   - Tolerance: |delta%| < 1%
   - Warning: 1-5%
   - Alert: >5%

5. **Layer 2 — Component comparison (if available).** For each matched entity, compare per-component. VL components come from `calculation_results.components` JSONB. Benchmark components come from confirmed component mappings.
   - **FALSE GREEN detection:** If total delta < 1% BUT any component delta > 10%, flag as false green.

6. **Layer 3 — Population.** Report VL-only and benchmark-only entities.

7. **Build findings list** ordered by priority: false greens first, then red flags, warnings, tolerance, exact, population.

**Commit:** `OB-87 Mission 2: Multi-layer comparison engine — period filter, component comparison, false green detection`

---

## MISSION 3: RECONCILIATION API ROUTE

**File:** `web/src/app/api/reconciliation/analyze/route.ts`

### 3A: POST /api/reconciliation/analyze

Accepts: multipart form data with benchmark file + calculation batch ID + tenant ID.

1. Parse file (SheetJS for XLSX, Papaparse for CSV)
2. Load calculation batch summary (entity external IDs, component names, period info)
3. Call `analyzeBenchmark()` from Mission 1
4. Return `BenchmarkAnalysis`

### 3B: POST /api/reconciliation/compare

Accepts: JSON with confirmed mappings + calculation batch ID + period filter.

1. Load confirmed mappings
2. Call `executeComparison()` from Mission 2
3. Return `ComparisonResult`

### 3C: POST /api/reconciliation/save

Accepts: JSON with comparison result + mappings + metadata.

Stores reconciliation session to Supabase. 

**NOTE:** If a `reconciliation_sessions` table does not exist in the schema, create a migration:

```sql
CREATE TABLE reconciliation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) NOT NULL,
  batch_id uuid REFERENCES calculation_batches(id) NOT NULL,
  benchmark_filename text NOT NULL,
  benchmark_row_count integer NOT NULL,
  periods_compared text[] NOT NULL,
  mapping_config jsonb NOT NULL,
  depth_achieved integer NOT NULL,
  summary jsonb NOT NULL,
  entity_results jsonb NOT NULL,
  findings jsonb NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON reconciliation_sessions
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));
```

**Execute the migration live and verify with `SELECT * FROM information_schema.tables WHERE table_name = 'reconciliation_sessions'`.**

**Commit:** `OB-87 Mission 3: Reconciliation API routes — analyze, compare, save`

---

## MISSION 4: RECONCILIATION UI — DISCOVERABLE DEPTH

**File:** Modify the existing reconciliation page (find its location in Phase 0).

### 4A: Upload + Batch Selection

Keep existing batch selection UI (human-readable labels). Keep file upload.

After file upload, replace the current column-mapping dropdown UI with:

### 4B: Comparison Depth Assessment Panel

After `analyzeBenchmark()` returns, show:

```
┌──────────────────────────────────────────────────────────────┐
│  COMPARISON DEPTH ASSESSMENT                                  │
│                                                                │
│  ✅ Level 1 — Entity Match: "num_empleado" (719 entities)     │
│  ✅ Level 2 — Total Payout: "Pago_Total_Incentivo" (100%)     │
│  ✅ Level 3 — Period: "Mes" + "Año" → Jan 2024 (719 of 2,157) │
│  🔍 Level 4 — Components: 6 columns detected (87% avg conf)   │
│  ⚠️ Level 5 — Attainment: Not detected                        │
│                                                                │
│  Period Matching:                                              │
│  ✅ Jan 2024: 719 rows (comparable)                            │
│  ⚠️ Feb 2024: 719 rows (no VL calculation)                    │
│  ⚠️ Mar 2024: 719 rows (no VL calculation)                    │
│                                                                │
│  [Edit Mappings]  [Run Reconciliation →]                       │
└──────────────────────────────────────────────────────────────┘
```

The "Edit Mappings" button shows dropdowns for each of the 3 minimum + component mappings. The user can override any AI suggestion. Overrides generate classification signals.

### 4C: Results Display

After comparison runs, show:

**Summary Bar:** Match rate badge, entity count, VL vs benchmark total, delta %, periods compared, depth achieved, false green count.

**Findings Panel (priority-ordered):**
- False greens at top with distinct visual treatment (amber highlight, "⚡ FALSE GREEN" badge)
- Red flags, warnings, tolerance, exact below

**Entity Table:** Sortable by delta, filterable by match status. Columns: Entity ID, VL Total, Benchmark Total, Delta, Delta%, Status.

**Component Drill-down:** Click entity row → expand to show per-component VL vs benchmark comparison. Highlight mismatched components.

**Population Panel:** Collapsible section showing VL-only and benchmark-only entity lists.

### 4D: Bilingual

All labels, headings, status messages, and assessment descriptions must support en-US and es-MX.

**Commit:** `OB-87 Mission 4: Reconciliation UI — depth assessment, results with false green surfacing`

---

## MISSION 5: CLASSIFICATION SIGNAL INTEGRATION

Wire benchmark file analysis to the classification signal pipeline from OB-86.

### 5A: Signal Capture Points

| Event | Signal Type | Prediction | Outcome |
|-------|-------------|------------|---------|
| AI classifies benchmark column | `benchmark_field_mapping` | Suggested semantic type + confidence | User accepts/overrides in Edit Mappings |
| AI detects period columns | `benchmark_period_detection` | Detected period structure | Validated when comparison runs successfully |

### 5B: Implementation

In `analyzeBenchmark()`, after AI classification:
1. Log Phase 1 signals (prediction + confidence) for each column mapping
2. When user confirms or overrides mappings (in UI), log Phase 2 signals (outcome)

Use the existing `classification-signal-service.ts` — `recordSignal()` or `recordAIClassificationBatch()`.

**Commit:** `OB-87 Mission 5: Classification signals for benchmark file mapping`

---

## MISSION 6: BUILD + CLT

### 6A: Build Verification

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 6B: Reconciliation-specific Verification

After build passes, verify:

```bash
echo "=== RECONCILIATION FILES CREATED ==="
ls -la web/src/lib/reconciliation/benchmark-intelligence.ts
ls -la web/src/lib/reconciliation/comparison-engine.ts
ls -la web/src/app/api/reconciliation/analyze/route.ts
ls -la web/src/app/api/reconciliation/compare/route.ts

echo ""
echo "=== SUPABASE TABLE EXISTS ==="
# Verify reconciliation_sessions table exists
# (use whatever Supabase query method CC has available)

echo ""
echo "=== NO HARDCODED FIELD NAMES ==="
grep -rn "num_empleado\|Pago_Total\|Mes\|Año\|Cumplimiento\|No_Tienda" \
  web/src/lib/reconciliation/ \
  web/src/app/api/reconciliation/ \
  2>/dev/null | head -20
# MUST return ZERO results. Any hardcoded field names = Korean Test failure.

echo ""
echo "=== CLASSIFICATION SIGNAL WIRING ==="
grep -rn "recordSignal\|recordAIClassification\|classification.*signal" \
  web/src/lib/reconciliation/ \
  2>/dev/null | head -10
# MUST find signal capture calls.
```

**Commit:** `OB-87 Mission 6: Build verification — clean build, zero hardcoded fields`

---

## MISSION 7: COMPLETION REPORT + PR

### Completion Report

Save as `OB-87_COMPLETION_REPORT.md` in PROJECT ROOT.

Structure:
1. **Phase 0 inventory** — what existed before, what was modified
2. **Benchmark Intelligence** — BenchmarkAnalysis type, AI classification, period discovery
3. **Comparison Engine** — multi-layer comparison, false green detection
4. **API Routes** — analyze, compare, save
5. **UI** — depth assessment panel, results with findings
6. **Classification Signals** — capture points wired
7. **Migration** — reconciliation_sessions table (if created)
8. **Korean Test** — grep output confirming zero hardcoded field names
9. **All proof gates** — PASS/FAIL with evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-87: Reconciliation Intelligence — Discoverable Depth + Period Awareness + False Greens" \
  --body "## What This Builds

### Discoverable Depth Reconciliation
- AI analyzes benchmark file structure (not hardcoded column mapping)
- Reports comparison depth assessment before running comparison
- Three minimum mappings: Entity ID + Total + Period
- Component-level comparison when benchmark file supports it

### Multi-Period Awareness
- Detects periods in benchmark file via Period Value Resolver
- Matches against VL calculated periods
- Filters to comparable periods only
- Eliminates phantom deltas from multi-period files

### False Green Detection
- Compares at component level when available
- Flags 'right total, wrong components' as highest-priority finding
- Priority-ordered findings: false greens → red flags → warnings → exact matches

### Classification Signal Integration
- Benchmark field mapping generates classification signals
- Feeds into OB-86 AI measurement infrastructure

## Technical
- New: benchmark-intelligence.ts, comparison-engine.ts
- New: /api/reconciliation/analyze, /api/reconciliation/compare
- Migration: reconciliation_sessions table with RLS
- Korean Test: zero hardcoded field names
- Supabase batch ≤200

## Proof Gates: see OB-87_COMPLETION_REPORT.md"
```

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 committed | Current reconciliation inventory documented |
| PG-2 | BenchmarkAnalysis type defined | With ColumnMapping, PeriodDiscovery, DepthAssessment |
| PG-3 | analyzeBenchmark() works | Returns structured analysis from parsed file |
| PG-4 | Period Value Resolver | Resolves numeric months (1,2,3), month names, date strings |
| PG-5 | Period matching | Cross-references benchmark periods vs VL calculated periods |
| PG-6 | Multi-layer comparison | Total + component + population layers |
| PG-7 | False green detection | Flags entities with matching total but mismatched components |
| PG-8 | Period filtering | Benchmark rows filtered to matching period(s) before comparison |
| PG-9 | POST /api/reconciliation/analyze works | Returns BenchmarkAnalysis |
| PG-10 | POST /api/reconciliation/compare works | Returns ComparisonResult with findings |
| PG-11 | Depth assessment UI | Shows levels 1-5 with availability and confidence |
| PG-12 | Period matching UI | Shows which periods are comparable and which are excluded |
| PG-13 | Results UI — findings priority | False greens shown first, then red flags, etc. |
| PG-14 | Results UI — entity table | Sortable, filterable, with component drill-down |
| PG-15 | Classification signals wired | Benchmark mapping generates signals |
| PG-16 | Korean Test | Zero hardcoded field names in reconciliation code |
| PG-17 | Supabase batch ≤200 | All .in() calls verified |
| PG-18 | reconciliation_sessions table | Migration executed and verified |
| PG-19 | Bilingual | en-US and es-MX labels |
| PG-20 | npm run build exits 0 | Clean build |
| PG-21 | localhost:3000 responds | HTTP 200/307 |
| PG-22 | Completion report committed | OB-87_COMPLETION_REPORT.md |

---

## CC FAILURE PATTERN WARNING

| Pattern | What Happened Before | What To Do Instead |
|---------|---------------------|-------------------|
| Hardcoded field names | Previous reconciliation had "num_empleado" in code | All column identification through AI. Korean Test. |
| Theory-first | Assumed reconciliation worked without testing | Phase 0 reads existing code first |
| Overcorrection | R4 killed 3 component pipes while fixing formulas | Preserve existing working features while adding new ones |
| Mixed-language dropdowns | Column mapping showed "Venta_Optica" mapped to "Optical Sales" | AI discovers semantic types; no mixed-language UI |
| Supabase silent failure | .in() with >200 returns 0 rows | Batch ≤200 everywhere |

---

## WHAT THIS OB DOES NOT BUILD

- Variance reasoning from calculation traces (P2 — future OB)
- Reconciliation history dashboard / trend view (P2)
- Automatic dispute creation from reconciliation findings (P2)
- Cross-tenant reconciliation pattern analysis (P3)

These are deliberate scope cuts. Build measurement before building automation.

---

*OB-87 — February 24, 2026*
*"Total-to-total reconciliation is necessary but insufficient. Right total, wrong reason is more dangerous than wrong total — because it passes unchallenged."*
*"The benchmark file is not your calculation. It's structurally independent. Discover the common ground."*
