# E4.2e — Call Site (e): `api/import/sci/analyze/route.ts:464` ±50 lines

**Lines:** 414–514 (writeSignal at line 464)

```typescript
   414	    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
   415	    try {
   416	      for (const unit of proposal.contentUnits) {
   417	        if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
   418	        // Build column_roles map from field bindings
   419	        const columnRoles: Record<string, string> = {};
   420	        for (const binding of unit.fieldBindings) {
   421	          columnRoles[binding.sourceField] = binding.semanticRole;
   422	        }
   423	        // HF-197B: locate the unit's OWN sheet for the hash, not sheets[0].
   424	        const sourceFile = files.find(f => f.fileName === unit.sourceFile);
   425	        const sheetForUnit = sourceFile?.sheets.find(s => s.sheetName === unit.tabName);
   426	        if (!sheetForUnit) {
   427	          console.warn(`[SCI-FINGERPRINT] Could not locate sheet for unit sourceFile=${unit.sourceFile} tabName=${unit.tabName} — skipping flywheel write`);
   428	          continue;
   429	        }
   430	        const hash = (await import('@/lib/sci/structural-fingerprint')).computeFingerprintHashSync(
   431	          sheetForUnit.columns,
   432	          sheetForUnit.rows,
   433	        );
   434	        writeFingerprint(
   435	          tenantId,
   436	          hash,
   437	          {
   438	            classification: unit.classification,
   439	            confidence: unit.confidence,
   440	            fieldBindings: unit.fieldBindings,
   441	            tabName: unit.tabName,
   442	          },
   443	          columnRoles,
   444	          unit.sourceFile,
   445	          process.env.NEXT_PUBLIC_SUPABASE_URL!,
   446	          process.env.SUPABASE_SERVICE_ROLE_KEY!,
   447	        ).catch(() => {}); // Fire-and-forget
   448	      }
   449	    } catch {
   450	      // Flywheel write failure must NEVER block import
   451	    }
   452	
   453	    // HF-094: Write classification signals via dedicated columns (fire-and-forget)
   454	    // Single write path: writeClassificationSignal (HF-092 indexed columns)
   455	    try {
   456	      for (const unit of proposal.contentUnits) {
   457	        const fp = fingerprintMap.get(unit.contentUnitId);
   458	        if (!fp) continue; // Document-based units (plan) have no fingerprint
   459	
   460	        const unitTrace = unit.classificationTrace as unknown as ClassificationTrace | undefined;
   461	        const unitDecisionSource = unitTrace?.decisionSource || 'crr_bayesian';
   462	
   463	        // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
   464	        writeSignal({
   465	          tenantId,
   466	          signalType: 'classification:outcome',
   467	          sourceFileName: unit.sourceFile,
   468	          sheetName: unit.tabName,
   469	          structuralFingerprint: fp as unknown as Record<string, unknown>,
   470	          classification: unit.classification,
   471	          confidence: unit.confidence,
   472	          decisionSource: unitDecisionSource,
   473	          classificationTrace: ((unit.classificationTrace as unknown as Record<string, unknown>) ?? {}),
   474	          vocabularyBindings: null,
   475	          agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
   476	          humanCorrectionFrom: null,
   477	          scope: 'tenant',
   478	          source: 'sci_agent',
   479	          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
   480	        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
   481	          if (err instanceof CanonicalWriteError) {
   482	            console.warn(`[SCIAnalyze] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
   483	          } else {
   484	            console.warn('[SCIAnalyze] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
   485	          }
   486	        });
   487	      }
   488	    } catch {
   489	      // Signal capture failure must NEVER block import
   490	    }
   491	
   492	    return NextResponse.json(proposal);
   493	
   494	  } catch (err) {
   495	    console.error('[SCI Analyze] Error:', err);
   496	    return NextResponse.json(
   497	      { error: 'Analysis failed', details: String(err) },
   498	      { status: 500 }
   499	    );
   500	  }
   501	}
```
