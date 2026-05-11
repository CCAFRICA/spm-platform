# E4.3e — Pre-deletion Call Site (e): `api/import/sci/analyze/route.ts` at 93d6e793^

**Lines:** 424–524

```typescript
          continue;
        }
        const hash = (await import('@/lib/sci/structural-fingerprint')).computeFingerprintHashSync(
          sheetForUnit.columns,
          sheetForUnit.rows,
        );
        writeFingerprint(
          tenantId,
          hash,
          {
            classification: unit.classification,
            confidence: unit.confidence,
            fieldBindings: unit.fieldBindings,
            tabName: unit.tabName,
          },
          columnRoles,
          unit.sourceFile,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {}); // Fire-and-forget
      }
    } catch {
      // Flywheel write failure must NEVER block import
    }

    // HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 indexed columns)
    try {
      for (const unit of proposal.contentUnits) {
        const fp = fingerprintMap.get(unit.contentUnitId);
        if (!fp) continue; // Document-based units (plan) have no fingerprint

        const unitTrace = unit.classificationTrace as unknown as ClassificationTrace | undefined;
        const unitDecisionSource = unitTrace?.decisionSource || 'crr_bayesian';

        const payload: ClassificationSignalPayload = {
          tenantId,
          sourceFileName: unit.sourceFile,
          sheetName: unit.tabName,
          fingerprint: fp,
          classification: unit.classification,
          confidence: unit.confidence,
          decisionSource: unitDecisionSource,
          classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
          vocabularyBindings: null,
          agentScores: Object.fromEntries(
            unit.allScores.map(s => [s.agent, s.confidence])
          ),
          humanCorrectionFrom: null,
        };

        writeClassificationSignal(
          payload,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});
      }
    } catch {
      // Signal capture failure must NEVER block import
    }

    return NextResponse.json(proposal);

  } catch (err) {
    console.error('[SCI Analyze] Error:', err);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(err) },
      { status: 500 }
    );
  }
}
```
