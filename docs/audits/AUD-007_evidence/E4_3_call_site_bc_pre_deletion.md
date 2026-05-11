# E4.3b+c — Pre-deletion Call Sites (b+c): `api/intelligence/converge/route.ts` at 93d6e793^

**Lines:** 45–165 (covers both writeClassificationSignal calls in pre-deletion source — :95 + :120)

```typescript
    let totalDerivations = 0;
    const allReports: Array<{ ruleSetId: string; derivations: number; report: unknown[] }> = [];

    for (const rsId of ruleSetIds) {
      const result = await convergeBindings(tenantId, rsId, supabase);

      if (result.derivations.length > 0) {
        // Read existing bindings
        const { data: rs } = await supabase
          .from('rule_sets')
          .select('input_bindings')
          .eq('id', rsId)
          .single();

        const existing = ((rs?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
        const merged = [...existing];

        for (const d of result.derivations) {
          const existingIdx = merged.findIndex(e => e.metric === d.metric);
          if (existingIdx === -1) {
            // New metric — add it
            merged.push(d as unknown as Record<string, unknown>);
          } else if (d.operation === 'ratio') {
            // OB-128: Ratio derivation replaces existing raw derivation.
            // Rename existing to {metric}_actuals so the ratio can reference it.
            const existingEntry = merged[existingIdx];
            existingEntry.metric = `${d.metric}_actuals`;
            merged.push(d as unknown as Record<string, unknown>);
          }
          // else: duplicate metric with same operation — skip (existing behavior)
        }

        await supabase
          .from('rule_sets')
          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
          .eq('id', rsId);

        const newCount = merged.length - existing.length;
        totalDerivations += newCount;

        allReports.push({
          ruleSetId: rsId,
          derivations: newCount,
          report: result.matchReport,
        });
      }

      // OB-160G: Write Level 3 convergence signals via Phase E service (HF-092 dedicated columns)
      for (const signal of result.signals) {
        try {
          writeClassificationSignal(
            {
              tenantId,
              sourceFileName: 'convergence',
              sheetName: signal.domain,
              fingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' },
              classification: 'convergence_match',
              confidence: signal.confidence,
              decisionSource: 'convergence',
              classificationTrace: {} as ClassificationTrace,
              vocabularyBindings: null,
              agentScores: { convergence: signal.confidence },
              humanCorrectionFrom: null,
            },
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          ).catch(() => {});
        } catch {
          // Signal failure must not block convergence
        }
      }

      // Write gap signals
      for (const gap of result.gaps) {
        try {
          writeClassificationSignal(
            {
              tenantId,
              sourceFileName: 'convergence',
              sheetName: gap.component,
              fingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' },
              classification: 'convergence_gap',
              confidence: 0,
              decisionSource: 'convergence',
              classificationTrace: {} as ClassificationTrace,
              vocabularyBindings: null,
              agentScores: { convergence: 0 },
              humanCorrectionFrom: null,
            },
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          ).catch(() => {});
        } catch {
          // Signal failure must not block convergence
        }
      }
    }

    return NextResponse.json({
      success: true,
      derivationsGenerated: totalDerivations,
      ruleSetsProcessed: ruleSetIds.length,
      reports: allReports,
    });
  } catch (err) {
    console.error('[Convergence API] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```
