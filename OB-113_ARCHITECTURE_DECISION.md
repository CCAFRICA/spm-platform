ARCHITECTURE DECISION RECORD — OB-113
======================================
Problem: Import UI shows duplicate/contradictory information due to legacy + new code coexisting.

DIAGNOSTIC FINDINGS:
- Sheet Analysis rendering flow: Two parallel rendering paths coexist
  - OB-111 per-file cards: lines 2760-2832, gated on parsedFiles.length > 1
  - Legacy classification cards: lines 2978-3039, gated on analysis.sheets existing
  - NO mutual exclusion — both render simultaneously in multi-file mode
- Legacy card source: enhanced/page.tsx:2978-3039 (4 category groups: component_data, roster, reference, unrelated)
- New card source: enhanced/page.tsx:2760-2832 (per-file grid with badges)
- Confidence value source:
  - Per-file: pf.analysisConfidence (from API response.confidence * 100)
  - Per-sheet: sheet.classificationConfidence (from AI classification)
  - Approve page: line 4060 uses hardcoded `>= 50` threshold
- Sheet1 phantom source: Not a hardcoded string — comes from CSV files defaulting to "Sheet1" in XLSX.js
- Validate metrics source:
  - Completeness: lines 1728-1730 (ratio of required fields mapped / total required)
  - Validity: lines 1754-1756 (non-null cell percentage)
  - Consistency: line 1771 — HARDCODED to 95%
  - Overall: 0.3*completeness + 0.4*validity + 0.3*consistency
  - Calculation preview: lines 1944-1993 (uses activePlan components — may be wrong plan)
- Approve rendering source: THREE representations:
  1. Workflow progress nodes (lines 3950-4001)
  2. Multi-file batch summary (lines 4045-4088, uses 50% threshold)
  3. Data package card (lines 4091-4186, 4-column summary + sheet breakdown)

APPROACH:
Option A: Conditional hide — show OB-111 cards in multi-file mode, legacy in single-file mode
  - Scale test: Works at 10x? Yes — no data volume impact
  - AI-first: Any hardcoding? Removing hardcoding (50%, consistency 95%)
  - Transport: Data through HTTP bodies? No — display only
  - Atomicity: Clean state on failure? Yes — pure JSX rendering

CHOSEN: Option A because the legacy rendering is superseded by OB-111's per-file architecture
for multi-file imports, but single-file Optica flow still needs the legacy classification display.
