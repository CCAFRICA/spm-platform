# E1.5 — §5.2 Validation Function Body (verbatim)

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts:130–171`

## ValidationOutcome type

```typescript
type ValidationOutcome =
  | { kind: 'in_range'; confidence: number }
  | { kind: 'out_of_range'; original: unknown }
  | { kind: 'missing_required' }
  | { kind: 'missing_optional' };
```

## validateSignal function (lines 147–171)

```typescript
function validateSignal(signal: CanonicalSignalInput): ValidationOutcome {
  const decl = lookup(signal.signalType);
  if (!decl) {
    throw new CanonicalWriteError(
      'unregistered_signal_type',
      signal.signalType,
      `[CanonicalWriter] signal_type '${signal.signalType}' is not registered. ` +
      `Per Decision 154/155 + AUD-004 v3 E1/E2, every signal_type must declare ` +
      `at least one reader before write. Available identifiers: ${allRegistered().map(d => d.identifier).join(', ')}`,
    );
  }
  const conf = signal.confidence;
  const confRequired = decl.confidence_required;

  if (conf === null || conf === undefined) {
    return confRequired ? { kind: 'missing_required' } : { kind: 'missing_optional' };
  }
  if (typeof conf === 'number' && Number.isFinite(conf) && conf >= 0.0 && conf <= 1.0) {
    return { kind: 'in_range', confidence: conf };
  }
  // numeric NaN/Infinity or any value outside [0, 1] (typed as number but out
  // of range) → out_of_range. Also catches non-numeric values that slipped
  // past the TypeScript optional-number annotation.
  return { kind: 'out_of_range', original: conf };
}
```

## Four-outcome routing logic at write call sites

`writeSignalWithClient` lines 302–304:

```typescript
const outcome = validateSignal(signal);
const confidenceToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
const row = buildInsertRow(signal, confidenceToPersist);
```

`writeSignalWithClient` observability emission lines 321–344:

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

  return { success: true, observabilitySignalEmitted: false };
```
