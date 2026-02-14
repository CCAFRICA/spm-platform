# ViaLuce TMR Addendum 4 — February 2026

**New Entry: Adaptive Depth Reconciliation**

*Extends: ViaLuce_TMR_Addendum3_Feb2026.md*

---

## Adaptive Depth Reconciliation

*Compare at every layer the data supports. Discover the common ground between two independent datasets. The most dangerous discrepancy is the one that hides behind a matching total.*

### What It Is

A reconciliation methodology that does not prescribe what to compare. Instead, it **discovers** what is comparable between two structurally independent datasets, reports the available comparison depth, runs all discoverable layers simultaneously, and surfaces false greens as the highest-priority finding.

The two datasets are structurally independent. The ViaLuce calculation run has a shape dictated by the active plan: components, tiers, variants, per-employee traces with formula-level detail. The benchmark file uploaded for comparison has its own shape dictated by its source: a payroll export, a prior system, a manual spreadsheet. Column names, granularity, aggregation level, language, and format can be completely different. They share one semantic truth: for Employee X, the total compensation should be $Y. Everything else is discoverable depth.

### Why It Matters

Total-to-total reconciliation is necessary but insufficient. An employee can receive the correct total payout while qualifying through the wrong components. Example: Employee 97678074 receives MX$500 in both ViaLuce and the benchmark. Total reconciliation reports an exact match. But ViaLuce calculated MX$300 Store Sales + MX$200 New Customers, while the benchmark shows MX$500 Optical Sales. The plan interpretation is wrong, the metric mapping is wrong, and you would never know.

This is the **false green** problem: a matching total that conceals a structural error. False greens are more dangerous than red flags because they pass validation and enter payroll unchallenged. A reconciliation methodology that only validates totals creates a false sense of accuracy.

### How It Works

The engine follows four steps:

**Step 1 — Discover Common Ground.** AI reads the uploaded file's columns and the calculation run's component structure. It identifies which dimensions exist in both: Employee ID (almost always), total payout (usually), component-level payouts (maybe), store-level breakdowns (maybe), attainment/tier data (maybe). The AI's role is not to map column-to-column. It is to assess: "What layers of comparison does this file support?"

**Step 2 — Report Comparison Depth.** Before running comparison, the platform communicates the discoverable depth: "Your uploaded file supports comparison at 3 levels: Employee total, Component payout (6 matching columns, 85% confidence), and Attainment (2 columns, 72% confidence). The deeper the comparison, the stronger the proof." The user confirms or adjusts before execution.

**Step 3 — Compare at Every Available Layer.** Run all confirmed levels simultaneously:
- **Level 1 (Total):** Employee total payout match
- **Level 2 (Component):** Per-component payout match for mapped components
- **Level 3 (Metric):** Per-component attainment/amount/goal match if file contains metric-level data

Each level produces its own match statistics. Discrepancies at deeper levels are flagged even when the total matches.

**Step 4 — Surface False Greens.** The most critical output is not the red flags — those are obvious. The most critical output is the false greens: employees whose totals match but whose component distributions differ. These are flagged distinctly and reported as the highest-priority finding.

### The Comparison Depth Assessment

The AI mapping output is a structured assessment, not a flat column mapping:

```json
{
  "employeeId": { "column": "num_empleado", "confidence": 0.95 },
  "totalPayout": { "column": "Pago_Total_Incentivo", "confidence": 0.92 },
  "components": [
    { "fileColumn": "Incentivo_Venta_Tienda", "planComponent": "Store Sales", "confidence": 0.88 },
    { "fileColumn": "Incentivo_Venta_Individual", "planComponent": "Optical Sales", "confidence": 0.85 }
  ],
  "metrics": [
    { "fileColumn": "Cumplimiento", "semanticType": "attainment", "confidence": 0.78 }
  ],
  "comparisonDepth": "component",
  "coverageWarning": "6 plan components, 4 mapped from file. Collections and Warranty not found."
}
```

### TMR Alignment

| TMR Principle | How ADR Embodies It |
|---|---|
| Prove, Don't Describe | A total match without component proof is describing, not proving. ADR proves at every discoverable layer. |
| Five Layers of Proof | Total-only reconciliation validates Layer 1 (Outcome). ADR extends to Layer 3 (Component) and Layer 4 (Metric) when the data supports it. |
| AI-First, Never Hardcoded | The engine discovers what is comparable through AI. No predetermined column expectations. Korean Test applies. |
| Thermostat, Not Thermometer | Step 2 recommends depth. Step 4 surfaces false greens with diagnosis. Acts, not just displays. |
| Carry Everything, Express Contextually | Both datasets preserved completely. Comparison expresses only what is discoverable between them. |
| Bidirectional Data Intelligence | Forward: which employees have discrepancies? Reverse: which employees are missing from benchmark? |
| Closed-Loop Intelligence | Every confirmed/overridden mapping is a training signal. Every false green improves future interpretation. |

### Key Design Constraint

The reconciliation file is structurally independent from the calculation run. The same DPI file could be associated with multiple plans, or a single plan could be associated with multiple DPI files. The benchmark file may not have the same fields but is ultimately expected to yield the same result. The engine must never assume structural correspondence — it must discover semantic correspondence through AI classification and user confirmation.

### Origin

*Discovered during CLT-19 browser testing (February 13, 2026). The initial HF-021 implementation attempted column-to-column structural mapping between the uploaded file and the calculation run. Testing revealed mixed-language dropdown options because "Mapped to" fields were drawn from the calculation run's plan-derived structure. This exposed the fundamental flaw: the two datasets are structurally independent. The benchmark file's columns bear no guaranteed relationship to the calculation run's component structure. The methodology name "Adaptive Depth" reflects the key insight: the reconciliation adapts to whatever depth the data supports rather than prescribing a fixed comparison structure.*

---

## Updated Quick Reference

| Methodology | One-Line Summary | Category | Key OB Refs |
|---|---|---|---|
| Adaptive Depth Reconciliation | Discover what is comparable between two independent datasets; compare at every supported layer; surface false greens as highest priority | Engineering | OB-37, CLT-19, HF-021 |

---

## Next Prompt Integration

The following context block should be included in any prompt that touches the reconciliation page:

```
### ADAPTIVE DEPTH RECONCILIATION (TMR)

The reconciliation engine compares two STRUCTURALLY INDEPENDENT datasets:
- The VL calculation run (shape dictated by plan: components, tiers, variants)  
- The uploaded benchmark file (shape dictated by its source: any format, any language, any columns)

These two datasets share ONE guaranteed semantic truth: Employee X should receive $Y total.
Everything deeper is DISCOVERABLE, not ASSUMABLE.

The engine:
1. DISCOVERS what is comparable (AI reads both structures, assesses overlap)
2. REPORTS comparison depth to user before running ("your file supports 3 levels")
3. COMPARES at every confirmed level simultaneously (total, component, metric)
4. SURFACES FALSE GREENS as highest priority (matching totals with mismatched components)

The AI output is a Comparison Depth Assessment, not a column mapping:
- employeeId + confidence
- totalPayout + confidence  
- components[] (fileColumn → planComponent mappings with confidence)
- metrics[] (optional deeper layer)
- comparisonDepth (total | component | metric)
- coverageWarning (which plan components have no file match)

FALSE GREENS are more dangerous than red flags. An employee with correct total but wrong 
component qualification passes total-only validation and enters payroll unchallenged.

CRITICAL CONSTRAINTS:
- Same DPI file can be associated with multiple plans
- Same plan can be associated with multiple DPI files
- Benchmark file may have completely different fields than calculation run
- NEVER assume structural correspondence — discover semantic correspondence
- Korean Test: would this work if both files were in different languages?
```

*ViaLuce.ai — The Way of Light*
