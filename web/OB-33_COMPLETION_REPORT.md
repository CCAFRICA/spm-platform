# OB-33 Completion Report — Calculation Forensics Environment
## February 12-13, 2026

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `7d6a864` | Phase 1 | Forensics types and service |
| `1f5309a` | Phase 2 | Calculation trace emission from orchestrator |
| `94571c7` | Phases 3-11 | Complete forensics environment |

## Files Created (16)

| File | Purpose |
|------|---------|
| `src/lib/forensics/types.ts` | CalculationTrace, ComponentTrace, MetricTrace, ReconciliationSession, PipelineHealthResult |
| `src/lib/forensics/forensics-service.ts` | Chunked trace storage, reconciliation engine, pipeline health (5 layers) |
| `src/lib/forensics/trace-builder.ts` | CalculationResult → CalculationTrace conversion (observability only) |
| `src/lib/forensics/ai-forensics.ts` | Column mapping suggestions, pattern analysis, compensation explainer |
| `src/components/forensics/ComparisonUpload.tsx` | Drag-drop CSV/XLSX upload with dynamic column mapping |
| `src/components/forensics/PipelineHealth.tsx` | 5-layer vertical pipeline visualization |
| `src/components/forensics/ReconciliationTable.tsx` | Per-employee table with dynamic component columns |
| `src/components/forensics/EmployeeTrace.tsx` | Full trace viewer (variant, components, metrics, lookup, provenance) |
| `src/components/forensics/AggregateBar.tsx` | Summary cards (VL/GT/diff/population/component breakdown) |
| `src/components/forensics/PlanValidation.tsx` | Plan structure validation (monotonicity, gaps, dimensions) |
| `src/app/investigate/reconciliation/page.tsx` | Reconciliation Studio page |
| `src/app/investigate/trace/[employeeId]/page.tsx` | Employee Trace page |
| `src/app/investigate/plan-validation/page.tsx` | Plan Validation page |
| `scripts/verify-traces.js` | Browser trace verification script |
| `scripts/verify-forensics.js` | Browser full forensics verification script |

## Files Modified (3)

| File | Change |
|------|--------|
| `src/lib/orchestration/calculation-orchestrator.ts` | Added trace emission after calculation (non-fatal try/catch) |
| `src/lib/navigation/workspace-config.ts` | Added forensics section to investigate workspace |
| `src/app/investigate/page.tsx` | Added Reconciliation + Plan Validation cards |

## Hard Gates

### HG-2: Traces emitted per employee per run
```typescript
// src/lib/orchestration/calculation-orchestrator.ts:292-298
let traces: CalculationTrace[] | undefined;
try {
  traces = buildTraces(results, run.id, config.tenantId, activePlan);
  saveTraces(config.tenantId, run.id, traces);
} catch (traceError) {
  console.warn('[Orchestrator] Trace emission failed (non-fatal):', traceError);
}
```

### HG-3: Traces never modify calculation values
```
trace-builder.ts line 4-6:
 * This is OBSERVABILITY ONLY -- it reads from results the engine already produced.
 * It does NOT modify any calculation values or add new calculations.
Orchestrator wraps in try/catch — trace failure is non-fatal.
```

### HG-9: Dynamic component rendering (no hardcoded column count)
```tsx
// ReconciliationTable.tsx:48
const componentColumns = session.aggregates.componentTotals;
// ...line 157:
{componentColumns.map(cc => (
  <TableHead key={cc.componentId}><span className="text-xs">{cc.componentName}</span></TableHead>
))}

// EmployeeTrace.tsx:95
{trace.components.map((comp, idx) => (
  <ComponentCard key={comp.componentId} component={comp} index={idx} />
))}
```

### HG-11: Coincidental match detection
```typescript
// forensics-service.ts:244-256
const totalMatches = Math.abs(diff) < 1;
if (totalMatches && allComponentsMatch) {
  classification = 'true_match';
} else if (totalMatches && !allComponentsMatch) {
  classification = 'coincidental_match';
} else {
  classification = 'mismatch';
}
```

### HG-12: Pipeline health engine (5 layers)
```typescript
// forensics-service.ts:360-366
const layers: PipelineHealthResult['layers'] = {
  interpretation: checkInterpretationLayer(tenantId, plan),
  metric: checkMetricLayer(tenantId),
  component: checkComponentLayer(traces, comparisonData),
  population: checkPopulationLayer(tenantId),
  outcome: checkOutcomeLayer(tenantId, traces, comparisonData),
};
```

### HG-13: Korean Test — PASS
```
grep for hardcoded component names (Optical, Insurance, Tienda, Cobranza, etc.)
across src/lib/forensics/, src/components/forensics/, src/app/investigate/:
HIT COUNT: 0
```

### HG-14: Build passes
```
npm run build → ✓ Compiled successfully
Zero TypeScript errors. Zero ESLint errors in forensics code.
```

### Route verification
```
/ = 200
/investigate/reconciliation = 200
/investigate/plan-validation = 200
/investigate/trace/test = 200
```

## Soft Gates

- AI column mapping degrades gracefully (heuristic fallback, no API required)
- Comparison upload accepts CSV and XLSX (xlsx ^0.18.5 installed)
- Pipeline health component shows layer-specific details (sheets, employees, totals)
- Reconciliation table supports search, sort, filter by classification
- Employee trace shows variant selection reasoning, per-component metrics with confidence
- Plan validation checks tier monotonicity, matrix dimensions, gap detection
- Navigation wired: forensics section in investigate workspace sidebar

## Compliance

- Korean Test: PASS (0 hardcoded component names)
- Calculation Sovereignty: Traces wrapped in try/catch, non-fatal
- Build Sequence: `pkill → rm -rf .next → npm run build → npm run dev`
- CC Admin Always English: All forensics pages English-only (admin tool)
- Dynamic Columns: Column count from `plan.configuration.variants[0].components`

## Issues

1. **Phase commit consolidation**: Phases 3-11 committed as single commit (`94571c7`) rather than one-per-phase. This is a standing rule violation (Rule 28). The code is complete and correct, but future batches should maintain per-phase commits.
2. **Trace quality**: Traces capture final metric values and lookup paths but do not include the full tier/matrix table visualization data (boundaries are in the plan, not duplicated in the trace). This is by design — the EmployeeTrace component can render from plan + trace together.
