# E1.3 — Canonical Writer Insert Column List

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts:buildInsertRow` (lines 187–211)

The row passed to `.insert()` is constructed by `buildInsertRow(signal, confidenceToPersist)`. Verbatim columns:

| DB column | Source from CanonicalSignalInput | Default if absent | Type |
|---|---|---|---|
| `tenant_id` | `signal.tenantId` | (required; no fallback) | string |
| `entity_id` | `signal.entityId` | `null` | `string \| null` |
| `signal_type` | `signal.signalType` | (required; no fallback) | string |
| `signal_value` | `signal.signalValue` | `{}` (cast `as Json`) | `Record<string, unknown>` |
| `confidence` | `confidenceToPersist` parameter (validated; nulled by §5.2 outcome) | (parameter required) | `number \| null` |
| `source` | `signal.source` | `'ai_prediction'` | string |
| `context` | `signal.context` | `{}` (cast `as Json`) | `Record<string, unknown>` |
| `calculation_run_id` | `signal.calculationRunId` | `null` | `string \| null` |
| `rule_set_id` | `signal.ruleSetId` | `null` | `string \| null` |
| `source_file_name` | `signal.sourceFileName` | `null` | `string \| null` |
| `sheet_name` | `signal.sheetName` | `null` | `string \| null` |
| `structural_fingerprint` | `signal.structuralFingerprint` | `null` (cast `as Json \| null`) | `Record<string, unknown> \| null` |
| `classification` | `signal.classification` | `null` | `string \| null` |
| `decision_source` | `signal.decisionSource` | `null` | `string \| null` |
| `classification_trace` | `signal.classificationTrace` | `null` (cast `as Json \| null`) | `Record<string, unknown> \| null` |
| `vocabulary_bindings` | `signal.vocabularyBindings` | `null` (cast `as Json \| null`) | `Record<string, unknown> \| null` |
| `agent_scores` | `signal.agentScores` | `null` (cast `as Json \| null`) | `Record<string, unknown> \| null` |
| `human_correction_from` | `signal.humanCorrectionFrom` | `null` | `string \| null` |
| `scope` | `signal.scope` | `null` | `string \| null` |

Total: **19 columns** the canonical writer constructs in every insert.

## Verbatim source (lines 187–212)

```typescript
function buildInsertRow(signal: CanonicalSignalInput, confidenceToPersist: number | null): Record<string, unknown> {
  return {
    tenant_id: signal.tenantId,
    entity_id: signal.entityId ?? null,
    signal_type: signal.signalType,
    signal_value: (signal.signalValue ?? {}) as Json,
    confidence: confidenceToPersist,
    source: signal.source ?? 'ai_prediction',
    context: (signal.context ?? {}) as Json,
    calculation_run_id: signal.calculationRunId ?? null,
    rule_set_id: signal.ruleSetId ?? null,
    // Dedicated columns (AUD-001 F-002 collapse; nullable when not provided)
    source_file_name: signal.sourceFileName ?? null,
    sheet_name: signal.sheetName ?? null,
    structural_fingerprint: (signal.structuralFingerprint ?? null) as Json | null,
    classification: signal.classification ?? null,
    decision_source: signal.decisionSource ?? null,
    classification_trace: (signal.classificationTrace ?? null) as Json | null,
    vocabulary_bindings: (signal.vocabularyBindings ?? null) as Json | null,
    agent_scores: (signal.agentScores ?? null) as Json | null,
    human_correction_from: signal.humanCorrectionFrom ?? null,
    scope: signal.scope ?? null,
  };
}
```
