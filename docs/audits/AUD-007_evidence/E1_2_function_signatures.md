# E1.2 — Canonical Writer Function Signatures (verbatim)

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts`

## `writeSignal` (lines 274–278)

```typescript
export async function writeSignal(
  signal: CanonicalSignalInput,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<WriteResult>
```

## `writeSignalWithClient` (lines 298–301)

```typescript
export async function writeSignalWithClient(
  signal: CanonicalSignalInput,
  supabase: SupabaseClient,
): Promise<WriteResult>
```

## `writeSignalBatch` (lines 366–370)

```typescript
export async function writeSignalBatch(
  signals: CanonicalSignalInput[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<BatchWriteResult>
```

## `writeSignalBatchWithClient` (lines 395–398)

```typescript
export async function writeSignalBatchWithClient(
  signals: CanonicalSignalInput[],
  supabase: SupabaseClient,
): Promise<BatchWriteResult>
```
