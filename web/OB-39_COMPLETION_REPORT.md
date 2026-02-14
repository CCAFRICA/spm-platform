# OB-39 Completion Report
## Reconciliation Intelligence, Lifecycle Surfacing, and Platform Truth
## Date: February 14, 2026

---

## PHASE 0: RECONCILIATION INTELLIGENCE AUDIT

### Classification Pipeline Entry Point
- **Primary**: `mapColumns()` in `src/lib/reconciliation/ai-column-mapper.ts:59-109`
  - Accepts: ParsedFile (headers, sample rows, fileName), tenantId, userId
  - Returns: MappingResult with ColumnMapping[] (sourceColumn, mappedTo, confidence, reasoning)
- **AI Core**: `classifySheet()` in `src/lib/ai/ai-service.ts:146-163`
  - Full AI classification with plan context
- **File Classification**: `classifyFile()` in `src/lib/ai/file-classifier.ts:29-82`

### Classification Signals Storage
- **Training Signals**: `src/lib/ai/training-signal-service.ts`
  - localStorage key: `vialuce_training_signals_{tenantId}`
  - Max 10,000 signals per tenant
  - TrainingSignal: signalId, requestId, task, tenantId, aiOutput, aiConfidence, userAction, userCorrection, outcome
  - Methods: captureAIResponse(), recordUserAction(), recordOutcome(), getAccuracyByTask()
- **Mapping History**: `src/lib/import-pipeline/smart-mapper.ts`
  - localStorage key: `import_mapping_history`
  - Max 500 mappings, LRU pruned
  - HistoricalMapping: sourceField, targetField, sourceSystem, tenantId, usageCount, lastUsed
  - Confidence boost: 70 + (usageCount * 5), max 90%

### Plan Component Access
- `getPlans(tenantId)` from `src/lib/compensation/plan-storage.ts:23-26`
- Plan -> configuration.variants[].components[] -> PlanComponent {id, name, componentType, measurementLevel, enabled}
- `buildMappingTargets(tenantId)` in `ai-column-mapper.ts:140-172` already extracts active plan components as mapping targets

### OB-38 Engines
- **Comparison Depth Engine**: `src/lib/reconciliation/comparison-depth-engine.ts`
  - `assessComparisonDepth(input)` -> DepthAssessment with 5 layers (L0-L4), false green risk
  - Input: vlResults, fileRows, mappings, employeeIdField, totalAmountField
- **Adaptive Comparison Engine**: `src/lib/reconciliation/adaptive-comparison-engine.ts`
  - `runAdaptiveComparison(fileRows, vlResults, mappings, empIdField, amtField)` -> AdaptiveComparisonResult
  - Runs depth assessment, then compares at each layer, detects false greens

### HF-022 Result Retrieval Path
- Reads from forensics traces via `getTraces(tenantId, runId)` from `src/lib/forensics/forensics-service.ts`
- CalculationTrace is structurally compatible with CalculationResult (employeeId, totalIncentive, components[].outputValue)
- IndexedDB saveResults exists but is never called by orchestrator

### Per-Tenant Classification History
- EXISTS via two mechanisms:
  1. Training signals per tenant (`vialuce_training_signals_{tenantId}`)
  2. Mapping history per tenant (filtered by tenantId in `import_mapping_history`)

### Lifecycle Service
- `src/lib/calculation/calculation-lifecycle-service.ts`
- States: DRAFT -> PREVIEW -> OFFICIAL -> PENDING_APPROVAL -> APPROVED -> REJECTED -> PAID
- Methods: loadCycle, saveCycle, createCycle, transitionCycle, canViewResults, getStateLabel
- Storage: `vialuce_cycle_{tenantId}_{period}`
- Separation of duties enforced: approver != submitter

### Entity B References
- 9 file header comments + 1 UI element (select-tenant page title)
- UI: `src/app/select-tenant/page.tsx:178`

### Current Reconciliation Page UI Structure
- Upload Benchmark Card (lines 725-910): drag-drop, sheet selector, Employee ID + Amount field dropdowns
- Upload Another button (line 895-906)
- Select Batch Card (lines 913-967): batch dropdown + Run Reconciliation button
- Preview Table (lines 971-1014)
- Confirm Column Mapping (lines 1017-1129): 30-row AI mapping table -- REDUNDANT with top dropdowns
- Results: Export bar, Summary cards, Totals comparison, Employee table, Detail dialog

### Architecture Decisions
1. **Reuse import classifier for reconciliation**: Already done -- `mapColumns()` calls `classifySheet()`. Need to add signal boosting from prior mappings.
2. **Plan component access for comparison layers**: Use `buildMappingTargets(tenantId)` + `assessComparisonDepth()` + `runAdaptiveComparison()` from OB-38.
3. **Classification signal flow**: Training signals already persist. Need new ClassificationSignalService as a focused facade over TrainingSignalService for reconciliation-specific signal queries.
4. **UI consolidation**: Remove "Confirm Column Mapping" 30-row table and "Upload Another" button. Keep top field mapping section enhanced with confidence badges and auto-population.

---

## COMMITS

| Phase | Commit | Hash |
|-------|--------|------|
| Phase 0 | OB-39-0: Reconciliation intelligence audit | TBD |

## FILES CREATED

(To be filled per phase)

## FILES MODIFIED

(To be filled per phase)

## HARD GATES

(To be filled after all phases)

## SOFT GATES

(To be filled after all phases)
