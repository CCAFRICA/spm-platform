# HF-124: OB-164 COMPLETION REPORT + PIPELINE EVIDENCE + KOREAN TEST REVIEW
## Produce the Missing Evidentiary Record. Review metric-resolver Regex for Korean Test Compliance.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules, anti-patterns, Governing Principles
2. `SCHEMA_REFERENCE_LIVE.md` — live database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

OB-164 delivered PR #229 with BCL pipeline proof ($321,381 exact, 0 mismatches). But no completion report was produced. Per Standing Rule and Evidentiary Gate requirements (memory slot 25), every OB/HF completion report must include pasted evidence for every gate. Self-attestation is not accepted.

Additionally, OB-164 added `/cantidad/i` and `/infracci/i` regex patterns to `metric-resolver.ts` (lines 61-62). These are Spanish-language substring matches in the semantic fallback path. This must be reviewed against the Korean Test (AP-25, memory slot 5).

This HF has two jobs:
1. Produce the completion report with pipeline evidence
2. Review and resolve the Korean Test question on the metric-resolver fix

---

## PHASE 1: PIPELINE EVIDENCE COLLECTION

Query the BCL tenant and paste ALL results. Do not summarize. Do not paraphrase. Paste the actual query output.

### 1A: Ingestion Events

```sql
SELECT COUNT(*) as total, 
       MIN(created_at) as first_event,
       MAX(created_at) as last_event
FROM ingestion_events 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. If count = 0, the pipeline was NOT exercised — flag as CRITICAL.**

### 1B: Classification Signals from SCI

```sql
SELECT signal_type, COUNT(*) as count
FROM classification_signals 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
GROUP BY signal_type
ORDER BY count DESC;
```

**Paste result. SCI processing should show classification-type signals (NOT just briefing_interaction).**

### 1C: Convergence Mappings

```sql
SELECT COUNT(*) as total
FROM convergence_mappings 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. If count = 0, AI column mapping did not run — investigate.**

Also show the actual bindings:

```sql
SELECT component_name, input_role, mapped_column, confidence
FROM convergence_mappings 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY component_name, input_role;
```

**Paste result. Verify bindings match expected:**
- C1 row → Cumplimiento_Colocacion
- C1 column → Indice_Calidad_Cartera
- C2 actual → Pct_Meta_Depositos
- C3 actual → Cantidad_Productos_Cruzados
- C4 actual → Infracciones_Regulatorias

### 1D: Committed Data

```sql
SELECT COUNT(*) as total_rows,
       COUNT(DISTINCT source_date) as distinct_dates,
       MIN(source_date) as earliest,
       MAX(source_date) as latest
FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. Expected: 510 rows, 6 dates, 2025-10-01 to 2026-03-01.**

### 1E: Entities

```sql
SELECT COUNT(*) as total,
       COUNT(DISTINCT entity_type) as types
FROM entities 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. Expected: 85 entities.**

### 1F: Entity Relationships

```sql
SELECT COUNT(*) as total,
       COUNT(DISTINCT relationship_type) as types
FROM entity_relationships 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. Document whether hierarchy exists.**

### 1G: Calculation Results

```sql
SELECT p.name as period, 
       COUNT(cr.id) as entity_count,
       SUM(cr.total_payout) as period_total
FROM calculation_results cr
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
GROUP BY p.name, p.start_date
ORDER BY p.start_date;
```

**Paste result. This is the GT verification table.**

### 1H: Grand Total

```sql
SELECT SUM(total_payout) as grand_total
FROM calculation_results 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Paste result. Expected: $321,381.00**

### 1I: Anchor Entities — March 2026

```sql
SELECT e.external_id, e.display_name,
       cr.total_payout,
       cr.components
FROM calculation_results cr
JOIN entities e ON cr.entity_id = e.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND p.start_date = '2026-03-01'
  AND e.external_id IN ('BCL-5012', 'BCL-5063', 'BCL-5003')
ORDER BY e.external_id;
```

**Paste result. Verify:**
- BCL-5012 (Valentina): C4 should be non-zero (zero infractions)
- BCL-5063 (Diego): C4 should be $0 (always has infractions)
- BCL-5003 (Gabriela): Highest payout, C4 = $150 (Senior, zero infractions)

### 1J: Meridian Regression

```sql
SELECT SUM(total_payout) as meridian_total
FROM calculation_results 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

**Paste result. Expected: MX$185,063.**

**Commit:** `HF-124 Phase 1: Pipeline evidence collected`

---

## PHASE 2: KOREAN TEST REVIEW — metric-resolver.ts

### 2A: Examine the Change

```bash
cd web
grep -n "cantidad\|infracci" src/lib/orchestration/metric-resolver.ts
```

**Paste result with surrounding context (5 lines above and below each match).**

### 2B: Determine the Resolution Path

The metric-resolver has two code paths:
1. **Structural path** — uses value ranges, data types, column distributions (Korean Test compliant)
2. **Semantic fallback path** — uses field name patterns when structural detection is ambiguous

**Question to answer:** Are `/cantidad/i` and `/infracci/i` in the structural path or the semantic fallback path?

**If STRUCTURAL path:** This is a Korean Test violation (AP-25). A Korean column meaning "quantity" would not match `/cantidad/i`. The fix must be moved to the semantic fallback path or replaced with structural heuristics.

**If SEMANTIC FALLBACK path:** This is acceptable per Decision 107 (Headers as Content). HC reads headers contextually in any language. The semantic fallback is the LLM-primary resolution path where language-specific understanding is expected. However, document that this fallback path ONLY activates when structural detection is insufficient, and that the structural path remains language-agnostic.

### 2C: Document the Finding

Write a clear assessment:

```
KOREAN TEST REVIEW — metric-resolver.ts regex patterns
===========================================================
Patterns added: /cantidad/i, /infracci/i (OB-164, PR #229)
Location: metric-resolver.ts lines 61-62
Code path: [STRUCTURAL / SEMANTIC FALLBACK]

Assessment:
- If structural: VIOLATION — must fix
- If semantic fallback: COMPLIANT per Decision 107
  Rationale: [explain]

Action required: [NONE / FIX REQUIRED]
```

### 2D: If Korean Test Violation — Fix It

If the patterns are in the structural path, move them to the semantic fallback path or replace with structural heuristics:

- "Quantity" detection should use structural signals: integer values, low cardinality, count-like distribution (small non-negative integers)
- "Infraction" detection should use structural signals: binary or near-binary values (0/1/2/3), very low mean, count distribution

Do NOT add more language-specific regex patterns. The structural path must remain language-agnostic.

**Commit:** `HF-124 Phase 2: Korean Test review — [COMPLIANT/FIXED]`

---

## PHASE 3: PRODUCE COMPLETION REPORT

### 3A: Create OB-164_COMPLETION_REPORT.md

At the repository root, create the completion report with ALL evidence from Phase 1 pasted inline. Structure:

```markdown
# OB-164 Completion Report: BCL Pipeline Proof

## Status: COMPLETE

## Pipeline Evidence

### Ingestion Events
[paste Phase 1A result]

### Classification Signals
[paste Phase 1B result]

### Convergence Mappings
[paste Phase 1C result — count AND bindings]

### Committed Data
[paste Phase 1D result]

### Entities
[paste Phase 1E result]

### Entity Relationships
[paste Phase 1F result]

## GT Verification

### Per-Period Totals
[paste Phase 1G result]

### Grand Total
[paste Phase 1H result]
Expected: $321,381.00
Delta: $[actual delta]

### Anchor Entities (March 2026)
[paste Phase 1I result]

## Meridian Regression
[paste Phase 1J result]
Expected: MX$185,063
Status: [MATCH/REGRESSION]

## Korean Test Review
[paste Phase 2C assessment]

## Production Fix Applied
- metric-resolver.ts lines 61-62: added /cantidad/i and /infracci/i to quantity patterns
- Path: [structural/semantic fallback]
- Korean Test status: [COMPLIANT/FIXED]

## Anti-Pattern Registry Check
AP-1 through AP-25: [PASS/FAIL for each relevant pattern]
```

**Commit:** `HF-124 Phase 3: OB-164 completion report with pipeline evidence`

---

## PHASE 4: BUILD + PR

```bash
cd /path/to/spm-platform
rm -rf web/.next
cd web && npm run build
# Confirm exit 0
```

```bash
cd /path/to/spm-platform
gh pr create --base main --head dev \
  --title "HF-124: OB-164 Completion Report + Korean Test Review" \
  --body "## What This Delivers

### OB-164 Completion Report
- Pipeline evidence: ingestion_events, classification_signals, convergence_mappings
- GT verification: per-period totals, grand total, anchor entities
- Meridian regression check

### Korean Test Review
- metric-resolver.ts regex patterns (/cantidad/i, /infracci/i) reviewed
- Assessment: [COMPLIANT per Decision 107 / FIXED — moved to semantic fallback]

No functional code changes unless Korean Test fix is required."
```

---

*End of prompt. Collect the evidence. Review the regex. Produce the report.*
