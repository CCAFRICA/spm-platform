# E4.3d — Pre-deletion Call Site (d): `api/import/sci/process-job/route.ts` at 93d6e793^

**Lines:** 303–403

```typescript
    // Update job with classification result
    await supabase.from('processing_jobs').update({
      status: 'classified',
      recognition_tier: recognitionTier,
      classification_result: classificationResult,
      proposal: { contentUnits },
    }).eq('id', jobId);

    const totalMs = Date.now() - startTime;
    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Classified in ${totalMs}ms (Tier ${recognitionTier})`);

    // Flywheel write (fire-and-forget) — HF-197B: per-sheet keying.
    // Each unit writes its OWN sheet's hash (was: reused fingerprintHash from sheets[0]),
    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
    for (const unit of contentUnits) {
      if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
      const sheetForUnit = sheets.find(s => s.sheetName === unit.tabName);
      if (!sheetForUnit) {
        console.warn(`[SCI-WORKER] Could not locate sheet for unit tabName=${unit.tabName} — skipping flywheel write`);
        continue;
      }
      const unitHash = computeFingerprintHashSync(sheetForUnit.columns, sheetForUnit.rows);
      const columnRoles: Record<string, string> = {};
      for (const b of unit.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
      writeFingerprint(
        tenantId, unitHash,
        { classification: unit.classification, confidence: unit.confidence, fieldBindings: unit.fieldBindings, tabName: unit.tabName },
        columnRoles, fileName,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ).catch(() => {});
    }

    // Classification signal write (fire-and-forget)
    for (const unit of contentUnits) {
      const fp = computeStructuralFingerprint(
        Array.from(profileMap.values()).find(p => p.tabName === unit.tabName) || Array.from(profileMap.values())[0]
      );
      const payload: ClassificationSignalPayload = {
        tenantId,
        sourceFileName: fileName,
        sheetName: unit.tabName,
        fingerprint: fp,
        classification: unit.classification,
        confidence: unit.confidence,
        decisionSource: sheetTier(unit.tabName) === 1 ? 'fingerprint_tier1' : 'crr_bayesian',
        classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
        vocabularyBindings: null,
        agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
        humanCorrectionFrom: null,
      };
      writeClassificationSignal(
        payload,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ).catch(() => {});
    }

    return NextResponse.json({
      jobId,
      status: 'classified',
      recognitionTier,
      contentUnits: contentUnits.length,
      durationMs: totalMs,
    });

  } catch (err) {
    console.error('[SCI-WORKER] Error:', err);
    return NextResponse.json(
      { error: 'Worker processing failed', details: String(err) },
      { status: 500 },
    );
  }
}
```
