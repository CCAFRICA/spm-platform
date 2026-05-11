# E1.7 — `observability:write_failure` Signal Emission Verbatim

## Signal builder — `buildObservabilitySignal` (lines 226–254)

```typescript
function buildObservabilitySignal(
  originalSignal: CanonicalSignalInput,
  outcome: Exclude<ValidationOutcome, { kind: 'in_range' } | { kind: 'missing_optional' }>,
): CanonicalSignalInput {
  const actualValueObservable = outcome.kind === 'out_of_range'
    ? (typeof outcome.original === 'number' && !Number.isFinite(outcome.original)
        ? String(outcome.original) // 'NaN' | 'Infinity' | '-Infinity'
        : outcome.original)
    : null;
  return {
    tenantId: originalSignal.tenantId,
    signalType: 'observability:write_failure',
    signalValue: {
      offending_field: 'confidence',
      expected_range: '[0.0, 1.0]',
      actual_value: actualValueObservable as unknown,
      outcome_kind: outcome.kind,
      source_signal_type: originalSignal.signalType,
      source_entity_id: originalSignal.entityId ?? null,
      source_rule_set_id: originalSignal.ruleSetId ?? null,
      source_calculation_run_id: originalSignal.calculationRunId ?? null,
    },
    confidence: null, // observability:write_failure is confidence_required:false
    source: 'system',
    calculationRunId: originalSignal.calculationRunId ?? null,
    ruleSetId: originalSignal.ruleSetId ?? null,
    context: { producing_module: 'canonical-signal-writer' },
  };
}
```

## Single-row emission site — `writeSignalWithClient` lines 321–344

```typescript
  // Emit observability signal for contract-failure outcomes (out_of_range, missing_required)
  if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
    const obs = buildObservabilitySignal(signal, outcome);
    const obsRow = buildInsertRow(obs, null);
    try {
      const { error: obsError } = await supabase.from('classification_signals').insert(obsRow);
      if (obsError) {
        // Per DS-023 §5.2: observability emission failure does NOT swallow
        // the original row's persistence outcome. Surface via stderr so the
        // failure is observable, but the original write succeeded.
        console.error(
          `[CanonicalWriter] observability:write_failure emission failed (original row persisted) ` +
          `for source_signal_type='${signal.signalType}': ${obsError.message}`,
        );
        return { success: true, observabilitySignalEmitted: false };
      }
    } catch (err) {
      console.error(
        `[CanonicalWriter] observability:write_failure emission threw (original row persisted) ` +
        `for source_signal_type='${signal.signalType}': ${err instanceof Error ? err.message : String(err)}`,
      );
      return { success: true, observabilitySignalEmitted: false };
    }
    return { success: true, observabilitySignalEmitted: true };
  }
```

## Batch emission site — `writeSignalBatchWithClient` lines 423–447

```typescript
  // Validate each signal; build insert rows + collect observability signals
  const outcomes = signals.map(validateSignal);
  const rows = signals.map((s, i) => {
    const outcome = outcomes[i];
    const confToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
    return buildInsertRow(s, confToPersist);
  });
  const observabilitySignals: CanonicalSignalInput[] = [];
  for (let i = 0; i < signals.length; i++) {
    const outcome = outcomes[i];
    if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
      observabilitySignals.push(buildObservabilitySignal(signals[i], outcome));
    }
  }
  // ... primary insert ...
  // Observability emission (one round-trip for the whole batch)
  let observabilityEmitted = 0;
  if (observabilitySignals.length > 0) {
    const obsRows = observabilitySignals.map(s => buildInsertRow(s, null));
    try {
      const { error: obsError } = await supabase.from('classification_signals').insert(obsRows);
      if (obsError) {
        console.error(
          `[CanonicalWriter] batch observability emission failed (originals persisted; count=${observabilitySignals.length}): ${obsError.message}`,
        );
      } else {
        observabilityEmitted = observabilitySignals.length;
      }
    } catch (err) {
      console.error(
        `[CanonicalWriter] batch observability emission threw (originals persisted; count=${observabilitySignals.length}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
```

## Observability signal columns persisted (per buildInsertRow)

The observability signal is itself written through `buildInsertRow`, so it persists with these columns set:
- `tenant_id`: from `originalSignal.tenantId`
- `signal_type`: `'observability:write_failure'`
- `signal_value`: JSONB object with `{offending_field, expected_range, actual_value, outcome_kind, source_signal_type, source_entity_id, source_rule_set_id, source_calculation_run_id}`
- `confidence`: `null`
- `source`: `'system'`
- `context`: `{producing_module: 'canonical-signal-writer'}`
- `calculation_run_id`: passed through from original
- `rule_set_id`: passed through from original
- All other dedicated columns: `null` (caller did not supply on observability signal)
