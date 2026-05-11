# E4.2c — Call Site (c): `api/intelligence/converge/route.ts:122` ±50 lines

**Lines:** 72–172 (writeSignal at line 122)

```typescript
    72	            existingEntry.metric = `${d.metric}_actuals`;
    73	            merged.push(d as unknown as Record<string, unknown>);
    74	          }
    75	          // else: duplicate metric with same operation — skip (existing behavior)
    76	        }
    77	
    78	        await supabase
    79	          .from('rule_sets')
    80	          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
    81	          .eq('id', rsId);
    82	
    83	        const newCount = merged.length - existing.length;
    84	        totalDerivations += newCount;
    85	
    86	        allReports.push({
    87	          ruleSetId: rsId,
    88	          derivations: newCount,
    89	          report: result.matchReport,
    90	        });
    91	      }
    92	
    93	      // OB-160G + OB-199 Phase 4: Write Level 3 convergence signals via canonical writer.
    94	      for (const signal of result.signals) {
    95	        writeSignal({
    96	          tenantId,
    97	          signalType: 'classification:outcome',
    98	          sourceFileName: 'convergence',
    99	          sheetName: signal.domain,
   100	          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
   101	          classification: 'convergence_match',
   102	          confidence: signal.confidence,
   103	          decisionSource: 'convergence',
   104	          classificationTrace: {} as Record<string, unknown>,
   105	          vocabularyBindings: null,
   106	          agentScores: { convergence: signal.confidence },
   107	          humanCorrectionFrom: null,
   108	          scope: 'tenant',
   109	          source: 'sci_agent',
   110	          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
   111	        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
   112	          if (err instanceof CanonicalWriteError) {
   113	            console.warn(`[ConvergeAPI] convergence_match CanonicalWriteError (${err.cause}): ${err.message}`);
   114	          } else {
   115	            console.warn('[ConvergeAPI] convergence_match unexpected error:', err instanceof Error ? err.message : String(err));
   116	          }
   117	        });
   118	      }
   119	
   120	      // Write gap signals
   121	      for (const gap of result.gaps) {
   122	        writeSignal({
   123	          tenantId,
   124	          signalType: 'classification:outcome',
   125	          sourceFileName: 'convergence',
   126	          sheetName: gap.component,
   127	          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
   128	          classification: 'convergence_gap',
   129	          confidence: 0,
   130	          decisionSource: 'convergence',
   131	          classificationTrace: {} as Record<string, unknown>,
   132	          vocabularyBindings: null,
   133	          agentScores: { convergence: 0 },
   134	          humanCorrectionFrom: null,
   135	          scope: 'tenant',
   136	          source: 'sci_agent',
   137	          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
   138	        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
   139	          if (err instanceof CanonicalWriteError) {
   140	            console.warn(`[ConvergeAPI] convergence_gap CanonicalWriteError (${err.cause}): ${err.message}`);
   141	          } else {
   142	            console.warn('[ConvergeAPI] convergence_gap unexpected error:', err instanceof Error ? err.message : String(err));
   143	          }
   144	        });
   145	      }
   146	    }
   147	
   148	    return NextResponse.json({
   149	      success: true,
   150	      derivationsGenerated: totalDerivations,
   151	      ruleSetsProcessed: ruleSetIds.length,
   152	      reports: allReports,
   153	    });
   154	  } catch (err) {
   155	    console.error('[Convergence API] Error:', err);
   156	    return NextResponse.json(
   157	      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
   158	      { status: 500 }
   159	    );
   160	  }
   161	}
```
