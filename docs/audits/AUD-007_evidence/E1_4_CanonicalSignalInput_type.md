# E1.4 — `CanonicalSignalInput` Type Definition (verbatim)

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts:46–82`

```typescript
/**
 * Public input type for canonical writes. Accepts the union of fields the
 * pre-OB-199 dual-architecture inserts wrote:
 *   - JSONB path (signal-persistence.ts): tenant_id, entity_id, signal_type,
 *     signal_value, confidence, source, context, calculation_run_id, rule_set_id
 *   - Dedicated-columns path (sci/classification-signal-service.ts): adds
 *     source_file_name, sheet_name, structural_fingerprint, classification,
 *     decision_source, classification_trace, vocabulary_bindings, agent_scores,
 *     human_correction_from, scope
 *
 * Per DS-023 §5.1, the canonical writer's insert shape includes both as nullable
 * fields. Callers from either pre-canonical path migrate to the same type.
 */
export interface CanonicalSignalInput {
  tenantId: string;
  signalType: string;
  // JSONB-path fields (from signal-persistence.ts)
  signalValue?: Record<string, unknown>;
  confidence?: number | null;
  source?: string;
  entityId?: string | null;
  context?: Record<string, unknown>;
  calculationRunId?: string | null;
  ruleSetId?: string | null;
  // Dedicated-column fields (from sci/classification-signal-service.ts;
  // collapse per AUD-001 F-002 closure)
  sourceFileName?: string | null;
  sheetName?: string | null;
  structuralFingerprint?: Record<string, unknown> | null;
  classification?: string | null;
  decisionSource?: string | null;
  classificationTrace?: Record<string, unknown> | null;
  vocabularyBindings?: Record<string, unknown> | null;
  agentScores?: Record<string, unknown> | null;
  humanCorrectionFrom?: string | null;
  scope?: string | null;
}
```

## Related types in same file

```typescript
export type CanonicalWriteFailureCause =
  | 'unregistered_signal_type'
  | 'database_unreachable'
  | 'insert_failed';

export class CanonicalWriteError extends Error {
  constructor(
    public readonly cause: CanonicalWriteFailureCause,
    public readonly signalType: string,
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalWriteError';
  }
}

export interface WriteResult {
  success: boolean;
  observabilitySignalEmitted: boolean;
  error?: string;
}

export interface BatchWriteResult {
  success: boolean;
  count: number;
  observabilitySignalsEmitted: number;
  error?: string;
}
```
