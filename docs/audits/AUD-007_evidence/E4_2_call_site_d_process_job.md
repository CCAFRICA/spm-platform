# E4.2d — Call Site (d): `api/import/sci/process-job/route.ts:343` ±50 lines

**Lines:** 293–393 (writeSignal at line 343)

```typescript
   293	    const classificationResult = {
   294	      contentUnits: contentUnits.map(u => ({
   295	        contentUnitId: u.contentUnitId,
   296	        sourceFile: u.sourceFile,
   297	        tabName: u.tabName,
   298	        classification: u.classification,
   299	        confidence: u.confidence,
   300	      })),
   301	      recognitionTier,
   302	    };
   303	
   304	    // Update job with classification result
   305	    await supabase.from('processing_jobs').update({
   306	      status: 'classified',
   307	      recognition_tier: recognitionTier,
   308	      classification_result: classificationResult,
   309	      proposal: { contentUnits },
   310	    }).eq('id', jobId);
   311	
   312	    const totalMs = Date.now() - startTime;
   313	    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Classified in ${totalMs}ms (Tier ${recognitionTier})`);
   314	
   315	    // Flywheel write (fire-and-forget) — HF-197B: per-sheet keying.
   316	    // Each unit writes its OWN sheet's hash (was: reused fingerprintHash from sheets[0]),
   317	    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
   318	    for (const unit of contentUnits) {
   319	      if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
   320	      const sheetForUnit = sheets.find(s => s.sheetName === unit.tabName);
   321	      if (!sheetForUnit) {
   322	        console.warn(`[SCI-WORKER] Could not locate sheet for unit tabName=${unit.tabName} — skipping flywheel write`);
   323	        continue;
   324	      }
   325	      const unitHash = computeFingerprintHashSync(sheetForUnit.columns, sheetForUnit.rows);
   326	      const columnRoles: Record<string, string> = {};
   327	      for (const b of unit.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
   328	      writeFingerprint(
   329	        tenantId, unitHash,
   330	        { classification: unit.classification, confidence: unit.confidence, fieldBindings: unit.fieldBindings, tabName: unit.tabName },
   331	        columnRoles, fileName,
   332	        process.env.NEXT_PUBLIC_SUPABASE_URL!,
   333	        process.env.SUPABASE_SERVICE_ROLE_KEY!,
   334	      ).catch(() => {});
   335	    }
   336	
   337	    // Classification signal write (fire-and-forget)
   338	    for (const unit of contentUnits) {
   339	      const fp = computeStructuralFingerprint(
   340	        Array.from(profileMap.values()).find(p => p.tabName === unit.tabName) || Array.from(profileMap.values())[0]
   341	      );
   342	      // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
   343	      writeSignal({
   344	        tenantId,
   345	        signalType: 'classification:outcome',
   346	        sourceFileName: fileName,
   347	        sheetName: unit.tabName,
   348	        structuralFingerprint: fp as unknown as Record<string, unknown>,
   349	        classification: unit.classification,
   350	        confidence: unit.confidence,
   351	        decisionSource: sheetTier(unit.tabName) === 1 ? 'fingerprint_tier1' : 'crr_bayesian',
   352	        classificationTrace: ((unit.classificationTrace as unknown as Record<string, unknown>) ?? {}),
   353	        vocabularyBindings: null,
   354	        agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
   355	        humanCorrectionFrom: null,
   356	        scope: 'tenant',
   357	        source: 'sci_agent',
   358	        context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
   359	      }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
   360	        if (err instanceof CanonicalWriteError) {
   361	          console.warn(`[SCIProcessJob] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
   362	        } else {
   363	          console.warn('[SCIProcessJob] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
   364	        }
   365	      });
   366	    }
   367	
   368	    return NextResponse.json({
   369	      jobId,
   370	      status: 'classified',
   371	      recognitionTier,
   372	      contentUnits: contentUnits.length,
   373	      durationMs: totalMs,
   374	    });
   375	
   376	  } catch (err) {
   377	    console.error('[SCI-WORKER] Error:', err);
   378	    return NextResponse.json(
   379	      { error: 'Worker processing failed', details: String(err) },
   380	      { status: 500 },
   381	    );
   382	  }
   383	}
```
