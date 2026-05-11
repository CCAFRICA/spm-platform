# E4.3a — Pre-deletion Call Site (a): `api/import/sci/execute/route.ts` at 93d6e793^ (= 6042d29e)

**Lines:** 337–437 (the pre-Phase-4-final writeClassificationSignal call site)

```typescript
              const { error: insertErr } = await supabase
                .from('rule_set_assignments')
                .insert(slice);
              if (insertErr) {
                console.error(`[SCI Execute] HF-126 assignment insert batch ${i} error:`, insertErr.message);
              }
            }
            console.log(`[SCI Execute] HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets`);
          } else {
            console.log(`[SCI Execute] HF-126: All ${allEntityIds.length} entities already assigned`);
          }
        }
      }
    } catch (assignErr) {
      console.error('[SCI Execute] HF-126 assignment creation failed (non-blocking):', assignErr);
    }

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
      convergence: convergenceReport,
    };

    // OB-160E/HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
    try {
      for (const unit of contentUnits) {
        if (!unit.structuralFingerprint) continue;

        const originalClassification = unit.originalClassification || unit.confirmedClassification;
        const wasOverridden = originalClassification !== unit.confirmedClassification;
        const traceData = unit.classificationTrace as ClassificationTrace | undefined;

        const payload: ClassificationSignalPayload = {
          tenantId,
          sourceFileName: unit.sourceFile || '',
          sheetName: unit.tabName || '',
          fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
          classification: unit.confirmedClassification,
          confidence: wasOverridden ? 1.0 : (unit.originalConfidence || 0),
          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
          classificationTrace: traceData || {} as ClassificationTrace,
          vocabularyBindings: unit.vocabularyBindings || null,
          agentScores: traceData
            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
            : {},
          humanCorrectionFrom: wasOverridden ? originalClassification : null,
        };

        writeClassificationSignal(
          payload,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // OB-160I: Aggregate anonymized structural pattern to foundational scope (fire-and-forget)
        // Privacy: only structural fingerprint + classification + confidence cross the tenant boundary
        const aggConfidence = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
        aggregateToFoundational(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // OB-160J: Aggregate to domain scope (fire-and-forget)
        aggregateToDomain(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          tenantDomainId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // HF-181 Layer 2: Update fingerprint with CONFIRMED bindings (fire-and-forget)
        // The analyze route wrote the fingerprint from pre-LLM structural-only bindings.
        // After user confirmation, update with the confirmed roles so future Tier 1 lookups
        // have correct semantic roles (especially entity_identifier).
        if (unit.confirmedBindings && unit.confirmedBindings.length > 0 && unit.rawData && unit.rawData.length > 0) {
          const cols = Object.keys(unit.rawData[0]);
          const hash = computeFingerprintHashSync(cols, unit.rawData.slice(0, 5));
          const confirmedColumnRoles: Record<string, string> = {};
          for (const binding of unit.confirmedBindings) {
            if (binding.sourceField && binding.semanticRole) {
              confirmedColumnRoles[binding.sourceField] = binding.semanticRole;
            }
          }
          writeFingerprint(
            tenantId,
            hash,
            {
              classification: unit.confirmedClassification,
              confidence: 1.0,
              fieldBindings: unit.confirmedBindings,
              tabName: unit.tabName || '',
            },
            confirmedColumnRoles,
            unit.sourceFile || '',
```
