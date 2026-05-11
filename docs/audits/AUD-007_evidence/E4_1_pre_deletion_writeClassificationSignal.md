# E4.1 — Pre-deletion writeClassificationSignal Function (verbatim from commit 93d6e793^)

**Source:** `git show 93d6e793^:web/src/lib/sci/classification-signal-service.ts | sed -n '81,122p'`
**93d6e793^** resolves to commit `6042d29e` (OB-199 Phase 4.5 close, just before Phase 4 final deletion).

```typescript
export async function writeClassificationSignal(
  payload: ClassificationSignalPayload,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: payload.tenantId,
        signal_type: 'classification:outcome',
        source_file_name: payload.sourceFileName,
        sheet_name: payload.sheetName,
        structural_fingerprint: payload.fingerprint,
        classification: payload.classification,
        confidence: payload.confidence,
        decision_source: payload.decisionSource,
        classification_trace: payload.classificationTrace,
        vocabulary_bindings: payload.vocabularyBindings,
        agent_scores: payload.agentScores,
        human_correction_from: payload.humanCorrectionFrom,
        scope: 'tenant',
        source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent',
        context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
        calculation_run_id: payload.calculationRunId ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[SCI Signal] Write failed:', error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('[SCI Signal] Write exception (non-blocking):', err);
    return null;
  }
}
```
