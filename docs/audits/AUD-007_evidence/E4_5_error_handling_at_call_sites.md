# E4.5 — Error-Handling Code Surrounding Each `writeSignal` Call (verbatim with line numbers)

## (a) `api/import/sci/execute/route.ts:377` — full block lines 377–407

```typescript
writeSignal({
          tenantId,
          signalType: 'classification:outcome',
          sourceFileName: unit.sourceFile || '',
          sheetName: unit.tabName || '',
          structuralFingerprint: unit.structuralFingerprint as Record<string, unknown>,
          classification: unit.confirmedClassification,
          confidence: confidenceValue,
          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
          classificationTrace: (traceData || {}) as Record<string, unknown>,
          vocabularyBindings: (unit.vocabularyBindings || null) as Record<string, unknown> | null,
          agentScores: traceData
            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
            : {},
          humanCorrectionFrom: wasOverridden ? originalClassification : null,
          scope: 'tenant',
          source: wasOverridden ? 'user_corrected' : 'sci_agent',
          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
```

## (b) `api/intelligence/converge/route.ts:95` — full block lines 95–117

```typescript
writeSignal({
          tenantId,
          signalType: 'classification:outcome',
          sourceFileName: 'convergence',
          sheetName: signal.domain,
          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
          classification: 'convergence_match',
          confidence: signal.confidence,
          decisionSource: 'convergence',
          classificationTrace: {} as Record<string, unknown>,
          vocabularyBindings: null,
          agentScores: { convergence: signal.confidence },
          humanCorrectionFrom: null,
          scope: 'tenant',
          source: 'sci_agent',
          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[ConvergeAPI] convergence_match CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[ConvergeAPI] convergence_match unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
```

## (c) `api/intelligence/converge/route.ts:122` — full block lines 122–144

```typescript
writeSignal({
          tenantId,
          signalType: 'classification:outcome',
          sourceFileName: 'convergence',
          sheetName: gap.component,
          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
          classification: 'convergence_gap',
          confidence: 0,
          decisionSource: 'convergence',
          classificationTrace: {} as Record<string, unknown>,
          vocabularyBindings: null,
          agentScores: { convergence: 0 },
          humanCorrectionFrom: null,
          scope: 'tenant',
          source: 'sci_agent',
          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[ConvergeAPI] convergence_gap CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[ConvergeAPI] convergence_gap unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
```

## (d) `api/import/sci/process-job/route.ts:343` — full block

(captured verbatim in E4_2_call_site_d_process_job.md lines 343 ff; .catch handler immediately follows the closing brace per same pattern)

## (e) `api/import/sci/analyze/route.ts:464` — full block

(captured verbatim in E4_2_call_site_e_analyze.md lines 464 ff; .catch handler immediately follows the closing brace per same pattern)

## Patterns

All 5 sites share the same error-handling structure: `.catch((err: unknown) => { if (err instanceof CanonicalWriteError) console.warn('[<TAG>] ... CanonicalWriteError (${err.cause}): ${err.message}'); else console.warn('[<TAG>] ... unexpected error:', err); });`

Tags used: `[SCIExecute]`, `[ConvergeAPI]`, `[SCIProcessJob]`, `[SCIAnalyze]`. CC produces this enumeration as fact; no commentary.
