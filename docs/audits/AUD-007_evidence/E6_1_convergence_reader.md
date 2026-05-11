# E6.1 — `convergence-service.ts` Readers of `classification_signals` (verbatim)

## `loadMetricComprehensionSignals` — full function body (lines 769–787)

```typescript
async function loadMetricComprehensionSignals(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
): Promise<MetricComprehensionSignal[]> {
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_value, confidence, rule_set_id')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('signal_type', 'comprehension:plan_interpretation')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
    return [];
  }
  return (data ?? []) as MetricComprehensionSignal[];
}
```

**Reads:** `signal_value` (JSONB), `confidence`, `rule_set_id`.
**Filters on:** `tenant_id`, `rule_set_id`, `signal_type='comprehension:plan_interpretation'`.
**Sort:** `created_at DESC`.
**Call site:** line 201 inside `convergeBindings` orchestrator.

## Other reader sites in convergence-service.ts (per grep `.from('classification_signals')` in same file)

```
$ grep -n "\.from('classification_signals')" web/src/lib/intelligence/convergence-service.ts
229:      .from('classification_signals')        (other call — not loadMetricComprehensionSignals)
239:      .from('classification_signals')        (other call)
775:      .from('classification_signals')        (the loadMetricComprehensionSignals body above)
```

CC notes 3 distinct `.from('classification_signals').select(...)` calls in convergence-service.ts. Only `loadMetricComprehensionSignals` (line 769–787) was the directive's explicit target. Lines 229 and 239 are additional reads in the same file; CC has not surfaced their bodies inline as the directive's E6.1 specifically named `loadMetricComprehensionSignals` plus "and surrounding read functions". They appear in the E6.3 enumeration below as part of the broader reader inventory.
