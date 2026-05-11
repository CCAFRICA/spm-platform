# E4.2a — Call Site (a): `api/import/sci/execute/route.ts:377` ±50 lines

**Lines:** 327–427 (writeSignal at line 377)

```typescript
   327	                  rule_set_id: rs.id,
   328	                  entity_id: entityId,
   329	                  assignment_type: 'direct',
   330	                  metadata: {},
   331	                });
   332	              }
   333	            }
   334	          }
   335	
   336	          if (newAssignments.length > 0) {
   337	            const INSERT_BATCH = 5000;
   338	            for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
   339	              const slice = newAssignments.slice(i, i + INSERT_BATCH);
   340	              const { error: insertErr } = await supabase
   341	                .from('rule_set_assignments')
   342	                .insert(slice);
   343	              if (insertErr) {
   344	                console.error(`[SCI Execute] HF-126 assignment insert batch ${i} error:`, insertErr.message);
   345	              }
   346	            }
   347	            console.log(`[SCI Execute] HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets`);
   348	          } else {
   349	            console.log(`[SCI Execute] HF-126: All ${allEntityIds.length} entities already assigned`);
   350	          }
   351	        }
   352	      }
   353	    } catch (assignErr) {
   354	      console.error('[SCI Execute] HF-126 assignment creation failed (non-blocking):', assignErr);
   355	    }
   356	
   357	    const response: SCIExecutionResult = {
   358	      proposalId,
   359	      results,
   360	      overallSuccess: results.every(r => r.success),
   361	      convergence: convergenceReport,
   362	    };
   363	
   364	    // OB-160E/HF-094: Write classification signals via dedicated columns (fire-and-forget)
   365	    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
   366	    try {
   367	      for (const unit of contentUnits) {
   368	        if (!unit.structuralFingerprint) continue;
   369	
   370	        const originalClassification = unit.originalClassification || unit.confirmedClassification;
   371	        const wasOverridden = originalClassification !== unit.confirmedClassification;
   372	        const traceData = unit.classificationTrace as ClassificationTrace | undefined;
   373	
   374	        // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
   375	        // Decision 30 v2 inclusive bound: confidence=1.0 on human-override admissible.
   376	        const confidenceValue = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
   377	        writeSignal({
   378	          tenantId,
   379	          signalType: 'classification:outcome',
   380	          sourceFileName: unit.sourceFile || '',
   381	          sheetName: unit.tabName || '',
   382	          structuralFingerprint: unit.structuralFingerprint as Record<string, unknown>,
   383	          classification: unit.confirmedClassification,
   384	          confidence: confidenceValue,
   385	          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
   386	          classificationTrace: (traceData || {}) as Record<string, unknown>,
   387	          vocabularyBindings: (unit.vocabularyBindings || null) as Record<string, unknown> | null,
   388	          agentScores: traceData
   389	            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
   390	            : {},
   391	          humanCorrectionFrom: wasOverridden ? originalClassification : null,
   392	          scope: 'tenant',
   393	          source: wasOverridden ? 'user_corrected' : 'sci_agent',
   394	          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
   395	        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
   396	          if (err instanceof CanonicalWriteError) {
   397	            console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
   398	          } else {
   399	            console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
   400	          }
   401	        });
   402	
   403	        // OB-160I: Aggregate anonymized structural pattern to foundational scope (fire-and-forget)
   404	        // Privacy: only structural fingerprint + classification + confidence cross the tenant boundary
   405	        const aggConfidence = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
   406	        aggregateToFoundational(
   407	          unit.structuralFingerprint as unknown as StructuralFingerprint,
   408	          unit.confirmedClassification,
   409	          aggConfidence,
   410	          process.env.NEXT_PUBLIC_SUPABASE_URL!,
   411	          process.env.SUPABASE_SERVICE_ROLE_KEY!,
   412	        ).catch(() => {});
   413	
   414	        // OB-160J: Aggregate to domain scope (fire-and-forget)
   415	        aggregateToDomain(
   416	          unit.structuralFingerprint as unknown as StructuralFingerprint,
   417	          unit.confirmedClassification,
   418	          aggConfidence,
   419	          tenantDomainId,
   420	          process.env.NEXT_PUBLIC_SUPABASE_URL!,
   421	          process.env.SUPABASE_SERVICE_ROLE_KEY!,
   422	        ).catch(() => {});
   423	
   424	        // HF-181 Layer 2: Update fingerprint with CONFIRMED bindings (fire-and-forget)
   425	        // The analyze route wrote the fingerprint from pre-LLM structural-only bindings.
   426	        // After user confirmation, update with the confirmed roles so future Tier 1 lookups
   427	        // have correct semantic roles (especially entity_identifier).
```
