# RECONCILIATION INTELLIGENCE SPECIFICATION
## Beyond Two Fields. Beyond One Period. Beyond Matching Totals.
### Captured: February 24, 2026

---

## THE PROBLEM THIS SOLVES

The current reconciliation page assumes a simple upload → column-map → compare flow. Three architectural gaps make it unreliable for production use:

1. **False Greens:** An employee can receive the correct total payout while qualifying through the wrong components. Total-to-total reconciliation reports "exact match" when the plan interpretation is fundamentally wrong. This is more dangerous than a red flag because it passes validation unchallenged.

2. **Multi-Period Blindness:** Benchmark files routinely contain multiple periods. The current reconciliation compares against the entire file sum regardless of which periods VL has calculated. This produced a phantom 48.73% delta (3-month benchmark vs 1-month calculation) that consumed multiple development rounds before diagnosis.

3. **Structural Mapping Rigidity:** The current column-mapping UI assumes the benchmark file shares the calculation run's structure. In reality, the benchmark file is a payroll output, a prior system's results, or a manual spreadsheet — structurally independent from VL's plan-driven component model.

---

## PRINCIPLE: DISCOVERABLE DEPTH RECONCILIATION

*Discover the common ground between two independent datasets. The most dangerous discrepancy is the one that hides behind a matching total.*

The reconciliation engine does not prescribe what to compare. It **discovers** what is comparable between two structurally independent datasets, reports the available comparison depth, runs all discoverable layers simultaneously, and surfaces false greens as the highest-priority finding.

---

## MINIMUM DATA ELEMENTS — WHY TWO IS NOT ENOUGH

The February 14 TMR session established this clearly: "People were being paid the right amount but qualified for the wrong component." Two-field reconciliation (Employee ID + Total Payout) cannot detect this. 

### Required Minimum Mapping (3 elements)

| # | Element | Purpose | AI-Discoverable? |
|---|---------|---------|-------------------|
| 1 | **Entity Identifier** | Which person | Yes — AI identifies employee/ID columns with high confidence |
| 2 | **Total Payout Amount** | How much they were paid | Yes — AI identifies monetary/total columns |
| 3 | **Period Indicator** | Which time period this row represents | Yes — AI identifies date/month/period columns |

The period indicator is not optional. Without it, the engine cannot:
- Filter to the calculated period when the file contains multiple periods
- Detect that the benchmark spans different periods than the calculation
- Compare period-by-period when both sides have multiple periods

### Desired Depth Elements (AI-discovered, user-confirmed)

| # | Element | Purpose | When Available |
|---|---------|---------|----------------|
| 4 | **Component-level payouts** | Which components contributed to the total | When benchmark has per-component columns |
| 5 | **Attainment/metric values** | What inputs drove the calculation | When benchmark has performance data |
| 6 | **Store/team/region** | Organizational grouping for aggregate analysis | When benchmark has hierarchy data |

**The engine must attempt to discover all 6 levels. The user confirms or adjusts before comparison runs.**

---

## MULTI-PERIOD BENCHMARK HANDLING

### The Problem (from OB-85 R6)

`RetailCo data results.xlsx` contains 2,157 rows = 719 employees × 3 months (January, February, March 2024). Column `Mes` contains values 1, 2, 3. Each employee appears once per month with different payout values.

VL calculated January 2024 only. Previous reconciliation compared VL's MX$1,878,415 against the file's 3-month sum MX$3,665,282 — a meaningless comparison that showed a phantom 48.73% delta.

### Required Behavior

**Step 1: Period Discovery.** When the benchmark file is uploaded, the AI must identify which column(s) represent the period and what distinct period values exist:

```
Period Discovery Results:
  Column "Mes" contains period indicators: [1, 2, 3]
  Column "Año" contains: [2024]
  Detected periods: January 2024, February 2024, March 2024
  Rows per period: 719 each (2,157 total)
```

**Step 2: Period Matching.** Cross-reference discovered periods against VL's calculated periods for this tenant:

```
Period Matching:
  Benchmark periods: Jan 2024, Feb 2024, Mar 2024
  VL calculated periods: Jan 2024 only
  
  ✅ January 2024: Comparable (719 VL entities, 719 benchmark rows)
  ⚠️ February 2024: No VL calculation (719 benchmark rows, no comparison possible)
  ⚠️ March 2024: No VL calculation (719 benchmark rows, no comparison possible)
  
  Reconciliation will compare: January 2024 only
  Note: 1,438 benchmark rows excluded (Feb + Mar — no corresponding VL data)
```

**Step 3: Filtered Comparison.** Run reconciliation against ONLY the matched period(s). The UI must clearly communicate which rows are included and which are excluded, and why.

**Step 4: Multi-Period Comparison (when available).** If VL has calculated multiple periods, compare each period independently AND provide aggregate trends:

```
Period Reconciliation Summary:
  January 2024:  VL $1,280,465 vs BM $1,253,832 → +2.1%  ✅
  February 2024: VL $1,310,200 vs BM $1,348,400 → -2.8%  ✅
  March 2024:    VL $1,050,800 vs BM $1,063,050 → -1.2%  ✅
  
  Aggregate: VL $3,641,465 vs BM $3,665,282 → -0.6%
  Trend: Consistent across all 3 periods (no systemic drift)
```

### Period Value Resolution

The AI must handle period data in any format — this is a Korean Test requirement:

- Numeric months: 1, 2, 3 (as in `Mes`)
- Month names: "January", "Enero", "Januar", "1月"
- Date strings: "2024-01-31", "01/31/2024"
- Combined: "Jan-2024", "2024-01", "Enero 2024"
- Quarter: "Q1 2024", "FY24-P1"
- Fiscal periods: "Period 1", "P01"

The Period Value Resolver (from OB-24 R9) must be reused or extended for benchmark files, not reimplemented.

---

## DISCOVERABLE DEPTH — THE FOUR-STEP ENGINE

### Step 1: Discover Common Ground

AI reads the uploaded file's columns and the calculation run's component structure. It identifies which comparison dimensions exist in BOTH:

| Dimension | Detection Method | Confidence |
|-----------|-----------------|------------|
| Entity ID | AI column classification — `employeeId` semantic type | High |
| Total Payout | AI column classification — `amount`/`total`/`payout` semantic type | High |
| Period | AI column classification — `period`/`date`/`month`/`year` | High |
| Component Payouts | AI matches file columns to plan component names (fuzzy, multilingual) | Medium |
| Attainment/Metrics | AI identifies percentage/attainment columns | Medium |
| Hierarchy | AI identifies store/team/region columns | Low-Medium |

### Step 2: Report Comparison Depth

Before running comparison, communicate the discoverable depth to the user:

```
Comparison Depth Assessment:

✅ Level 1 — Entity Match: Employee ID column identified (719 rows)
✅ Level 2 — Total Payout: "Pago_Total_Incentivo" mapped to total (100% confidence)
✅ Level 3 — Period Filter: "Mes" + "Año" → January 2024 (719 of 2,157 rows)
🔍 Level 4 — Component Breakdown: 6 columns may map to plan components:
     "Venta_Optica_Incentivo" → Optical Sales (87% confidence)
     "Venta_Tienda_Incentivo" → Store Sales (91% confidence)
     "Clientes_Nuevos_Incentivo" → New Customers (89% confidence)
     "Cobranza_Incentivo" → Collections (92% confidence)
     "Garantia_Incentivo" → Warranty (85% confidence)
     "Seguro_Incentivo" → Insurance (78% confidence)
⚠️ Level 5 — Attainment Data: Not detected in benchmark file

[Confirm Mappings]  [Run Reconciliation]
```

### Step 3: Compare at Every Available Layer

On "Run Reconciliation," execute all confirmed layers simultaneously:

**Layer 1 — Total Match:** For each entity, compare VL total_payout vs benchmark total.
- Exact: delta < $0.01
- Tolerance: delta < 1%
- Warning: 1-5%
- Alert: >5%

**Layer 2 — Component Match (if available):** For each entity × component, compare VL component payout vs benchmark component column.
- Detect: right total, wrong components (FALSE GREEN)
- Example: VL says $300 Store + $200 New Customers = $500. Benchmark says $500 Optical = $500. Total matches. Components don't. Flag as FALSE GREEN.

**Layer 3 — Population Match:** Which entities are in VL but not benchmark? Which in benchmark but not VL?
- VL-only entities may indicate roster differences
- Benchmark-only entities may indicate import gaps

### Step 4: Surface False Greens

**Priority ordering of results:**

1. **FALSE GREENS** (highest priority) — Total matches but component breakdown doesn't. These are plan interpretation errors that would go undetected by total-only reconciliation.
2. **Red flags** — Total doesn't match, delta >5%
3. **Warnings** — Total delta 1-5%
4. **Tolerance** — Total delta <1%
5. **Exact matches** — Total delta <$0.01
6. **Population mismatches** — Entities in one set but not the other

---

## UX FLOW

### Upload and Discovery

1. User uploads benchmark file (CSV, XLSX — any language, any structure)
2. AI parses file, identifies columns, classifies semantic types
3. AI discovers period structure (single-period or multi-period)
4. Platform displays Comparison Depth Assessment (Step 2 above)
5. User confirms or adjusts the three minimum mappings (Entity ID, Total Payout, Period)
6. User optionally confirms component-level mappings for deeper comparison

### Reconciliation Execution

7. Engine filters benchmark to matching period(s)
8. Engine matches entities (normalize: trim, strip leading zeros, case-insensitive)
9. Engine compares at every confirmed layer
10. Results displayed with False Greens surfaced first

### Results Display

11. **Summary bar:** Match rate, entity count, period(s) compared, comparison depth achieved
12. **Period filter:** If multi-period, select which period to view
13. **Entity table:** Sortable by delta, filterable by match status
14. **Component drill-down:** Click entity → see per-component comparison (if Level 4 available)
15. **False green panel:** Dedicated section for "right total, wrong reason" entities
16. **Population panel:** VL-only entities, benchmark-only entities

---

## VARIANCE ANALYSIS WITH INTELLIGENT REASONING

When a mismatch is found, the engine should attempt to explain why, using data from the calculation trace:

- "**Tier boundary:** VL applied Tier 3 rate (10%) while benchmark shows Tier 2 rate (7.5%) — employee's sales of $25,050 is near the $25,000 boundary"
- "**Rounding:** VL rounds at the component level, difference is $0.03"
- "**Component attribution:** VL calculated $300 Store Sales + $200 New Customers. Benchmark shows $500 Optical. Total matches but components don't — possible plan interpretation difference."
- "**Period mismatch:** Benchmark row appears to include cumulative data (Jan+Feb) while VL calculated January only"
- "**Population:** Employee 93515855 appears in VL but not in benchmark for this period"

This reasoning uses the calculation trace (from the Forensics architecture) combined with the variance data. It's pattern-matching on common reconciliation discrepancy types.

---

## TECHNICAL REQUIREMENTS

### AI Classification for Benchmark Files

The same AI classification infrastructure used for data import (field mapping, sheet classification) should be reused for benchmark files. The Classification Signal Architecture (OB-86) should capture signals from benchmark file classification too — this is another AI prediction with a user outcome.

### Period Value Resolver Integration

The Period Value Resolver built for data import must be reused for benchmark period detection. Same function, different context. The resolver takes field values and produces `{ month: number, year: number }` regardless of format or language.

### Korean Test

If a Korean company uploads a benchmark file in Hangul with columns "사번" (employee number), "총보상" (total compensation), and "월" (month), the reconciliation must:
1. AI-classify these as Entity ID, Total Payout, and Period
2. Discover that "월" contains values [1, 2, 3] → months
3. Match against VL's calculated periods
4. Run reconciliation with zero manual column mapping

### Storage

Reconciliation sessions should be stored in Supabase (not localStorage) with:
- Which benchmark file was uploaded
- Which period(s) were compared
- Which calculation batch was compared against
- The mapping decisions (entity ID column, total column, period column, component columns)
- Results summary (match rate, false green count, delta distribution)
- Full entity-by-entity comparison results

This enables:
- Reconciliation history per tenant
- Accuracy trend across reconciliation runs
- Audit trail for SOC2 compliance

---

## WHAT THIS REPLACES

The current reconciliation implementation has these specific gaps:

| Current | Required |
|---------|----------|
| Maps source columns to calculated field names via dropdown | AI discovers semantic types, user confirms 3 minimum + optional depth |
| Compares against entire file (all rows) | Detects and filters by period, comparing only matching period(s) |
| Total-to-total comparison only | Multi-layer: total + component + population + false green detection |
| Mixed-language dropdown labels confuse user | AI handles any language — Korean Test compliant |
| No period awareness | Full period discovery, matching, and filtered comparison |
| No false green detection | False greens surfaced as highest-priority finding |
| localStorage persistence | Supabase persistence with audit trail |

---

## RELATIONSHIP TO OTHER WORK

| Item | Relationship |
|------|-------------|
| OB-86 (AI/ML Measurement) | Classification signals from benchmark file mapping feed the same flywheel |
| OB-85 R6 (Optical Matrix Fix) | Proved that benchmark overcounting (3 months vs 1) creates phantom deltas |
| TMR Addendum (Feb 14) | "Two Questions, One Truth" evolved to "Three Minimum, Discoverable Depth" |
| Period Value Resolver (OB-24 R9) | Reuse for benchmark period detection |
| Calculation Forensics (OB-33) | Trace data powers variance reasoning |
| Dispute Architecture (OB-68) | Reconciliation findings feed dispute workflow |

---

## BACKLOG ITEM

**ID:** RECON-01
**Title:** Reconciliation Intelligence — Discoverable Depth with Period Awareness
**Priority:** P1
**Depends on:** OB-86 (classification signal infrastructure)
**Scope:** Replace current column-mapping reconciliation with AI-driven discoverable depth engine

### Sub-items:

| # | Item | Priority |
|---|------|----------|
| RECON-01a | Period Discovery + Matching in benchmark files | P1 |
| RECON-01b | Three minimum mappings (Entity + Total + Period) with AI suggestion | P1 |
| RECON-01c | Component-level comparison depth (Level 4) | P1 |
| RECON-01d | False Green detection and surfacing | P1 |
| RECON-01e | Variance reasoning from calculation traces | P2 |
| RECON-01f | Multi-period comparison (when VL has multiple calculated periods) | P2 |
| RECON-01g | Supabase persistence for reconciliation sessions | P2 |
| RECON-01h | Population mismatch analysis (VL-only, benchmark-only entities) | P2 |

---

*"Total-to-total reconciliation is necessary but insufficient. Right total, wrong reason is more dangerous than wrong total — because it passes unchallenged."*

*"The benchmark file is not your calculation. It's structurally independent. Discover the common ground. Compare at every layer the data supports. Surface the false greens first."*
