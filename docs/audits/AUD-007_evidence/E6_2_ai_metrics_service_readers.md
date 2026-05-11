# E6.2 — `ai-metrics-service.ts` Readers (verbatim)

## `fetchSignals` — universal reader (lines 93–111)

```typescript
async function fetchSignals(tenantId?: string, limit = 5000): Promise<RawSignal[]> {
  const supabase = getServiceClient();
  let query = supabase
    .from('classification_signals')
    .select('id, tenant_id, signal_type, confidence, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[AIMetricsService] fetchSignals error:', error.message);
    return [];
  }
  return data ?? [];
}
```

**Reads:** `id`, `tenant_id`, `signal_type`, `confidence`, `source`, `created_at`.
**Filters on:** `tenant_id` (optional).
**Sort:** `created_at DESC`.
**No `signal_type` filter** — fetches all signal_types.

## `classifyAction` — source/confidence-based classification (lines 128–138)

```typescript
function classifyAction(signal: RawSignal): 'accepted' | 'corrected' | 'rejected' | 'pending' {
  const src = signal.source ?? '';
  if (src === 'user_confirmed') return 'accepted';
  if (src === 'user_corrected') return 'corrected';
  // Confidence-based heuristic for signals without explicit user action
  if (signal.confidence !== null) {
    if (signal.confidence >= 0.95) return 'accepted';
    if (signal.confidence < 0.3) return 'rejected';
  }
  return 'pending';
}
```

**Reads:** `source`, `confidence` from the RawSignal shape returned by `fetchSignals`.
**Threshold gates:** `>= 0.95` (accepted), `< 0.3` (rejected).

## Three downstream consumers of `fetchSignals` (per grep, in same file)

Lines 145, 206, 252 — three functions invoke `fetchSignals(tenantId)`:
- `computeAcceptanceRate` (line 145)
- `computeCalibrationMetrics` (line 206)
- `computeFlywheelTrend` (line 252)

CC has surfaced the universal-reader function above. The 3 derived-metric functions consume the resulting RawSignal[] via `classifyAction` heuristic + per-signal aggregation.
