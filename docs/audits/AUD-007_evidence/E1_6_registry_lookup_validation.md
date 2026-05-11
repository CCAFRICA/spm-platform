# E1.6 — §5.3 Identifier Validation (registry lookup) Verbatim

## In `writeSignal` (pre-write registry check, lines 279–287)

```typescript
if (!isRegistered(signal.signalType)) {
    throw new CanonicalWriteError(
      'unregistered_signal_type',
      signal.signalType,
      `[CanonicalWriter] writeSignal: signal_type '${signal.signalType}' not registered. ` +
      `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
      `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
    );
  }
```

## In `writeSignalBatch` (pre-write registry check, lines 374–386)

```typescript
  // Pre-validate every signal_type is registered (Decision 154/155 + AUD-004 v3 E1/E2).
  // Atomic: if any signal in the batch is unregistered, no writes occur.
  for (const s of signals) {
    if (!isRegistered(s.signalType)) {
      throw new CanonicalWriteError(
        'unregistered_signal_type',
        s.signalType,
        `[CanonicalWriter] writeSignalBatch: signal_type '${s.signalType}' not registered. ` +
        `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
        `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
      );
    }
  }
```

## In `validateSignal` (per-signal registry check, lines 148–157)

```typescript
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
```

## Imports of registry surface

From line 40:

```typescript
import { isRegistered, lookup, all as allRegistered } from './signal-registry';
```
