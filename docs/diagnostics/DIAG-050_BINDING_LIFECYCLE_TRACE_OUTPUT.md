# DIAG-050 — Binding Lifecycle Trace Output

**Date:** 2026-05-18
**Tenant:** CRP — e44bbcb1-2710-4880-8c7d-a1bd902720b7
**Head SHA:** 80188efe (PR #414, HF-235 merge)
**Branch:** diag-050-binding-lifecycle-trace

---

## Phase 1: Flywheel Injection Site

### Symbol search

`grep -rn "Tier 1" --include="*.ts" src/lib/sci/ src/app/api/import/` (15 hits):

```
src/lib/sci/fingerprint-flywheel.ts:5: *   Tier 1: Exact tenant-specific fingerprint match → skip LLM entirely
src/lib/sci/fingerprint-flywheel.ts:43:  // Tier 1: Exact tenant-specific match
src/lib/sci/fingerprint-flywheel.ts:52:    // HF-145: Confidence threshold gates Tier 1 routing.
src/lib/sci/fingerprint-flywheel.ts:59:      console.log(`[SCI-FINGERPRINT] LLM skipped — Tier 1 match from ${tier1.match_count} prior imports`);
src/lib/sci/fingerprint-flywheel.ts:70:    // DIAG-010 / OB-178: Demoted Tier 1 returns as Tier 2 match with existing data.
src/lib/sci/fingerprint-flywheel.ts:124: * Tier 1 match: increment match_count, Bayesian confidence update
src/app/api/import/commit/route.ts:178:    // Tier 1: AI classification (this step)
src/app/api/import/sci/process-job/route.ts:6: * checks flywheel → classifies (Tier 1/2/3) → updates job status.
src/app/api/import/sci/process-job/route.ts:201:    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: HC ${skipHC ? 'SKIPPED (Tier 1)' : 'completed'}`);
src/app/api/import/sci/process-job/route.ts:280:    // Tier 1 confidence override uses the unit's own flywheel confidence (was: primary's).
src/app/api/import/sci/execute/route.ts:324:        // After user confirmation, update with the confirmed roles so future Tier 1 lookups
src/app/api/import/sci/analyze/route.ts:137:      // Phase B: Enhance with header comprehension — only for sheets where Tier 1 did not hit.
src/app/api/import/sci/analyze/route.ts:161:      // HF-181 Layer 1 / HF-197B: For each Tier 1 match, inject that sheet's OWN cached
src/app/api/import/sci/analyze/route.ts:198:        console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${sheet.sheetName}`);
src/app/api/import/sci/analyze/route.ts:202:      // HC has run (or been injected from Tier 1 flywheel); now compute patterns +
```

`grep -rn "injected.*fieldBindings\|injectFieldBindings\|fromFlywheel" --include="*.ts" src/lib/sci/ src/app/api/import/` (1 hit):

```
src/app/api/import/sci/analyze/route.ts:198:        console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${sheet.sheetName}`);
```

`grep -rn "flywheel.*confidence\|confidence.*0\.50\|confidence:.*0\.5" --include="*.ts" src/lib/sci/` (13 hits):

```
src/lib/sci/negotiation.ts:372:      return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
src/lib/sci/negotiation.ts:392:      return { role: 'tier_boundary', context: `${field.fieldName} — threshold`, confidence: 0.50 };
src/lib/sci/synaptic-ingestion-state.ts:323:      requiresHumanReview: winner.confidence < 0.50 || gap < 0.10,
src/lib/sci/synaptic-ingestion-state.ts:554:      if (scores[0].confidence < 0.50) {
src/lib/sci/header-comprehension.ts:225:        confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
src/lib/sci/header-comprehension.ts:402:      confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
src/lib/sci/resolver.ts:225:      requiresHumanReview: winner.confidence < 0.50 || gap < 0.10,
src/lib/sci/agents.ts:442:  return scores[0].confidence < 0.50 || gap < 0.10;
src/lib/sci/agents.ts:582:  return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
src/lib/sci/agents.ts:593:    return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
src/lib/sci/agents.ts:609:    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
src/lib/sci/agents.ts:621:    return { role: 'baseline_value', context: `${field.fieldName} — reference value`, confidence: 0.55 };
src/lib/sci/fingerprint-flywheel.ts:182:          confidence: 0.5,
```

### Injection function body

Only one site in the repository injects flywheel-cached bindings. Located in `src/app/api/import/sci/analyze/route.ts:161-199`. Verbatim with line numbers:

```typescript
161       // HF-181 Layer 1 / HF-197B: For each Tier 1 match, inject that sheet's OWN cached
162       // fieldBindings into that sheet's OWN profile (was: always injected into sheets[0]).
163       for (const sheet of file.sheets) {
164         const flywheelResult = sheetFlywheelResults.get(sheet.sheetName);
165         if (!sheetSkipHC(sheet.sheetName) || !flywheelResult?.classificationResult) continue;
166
167         const flywheelBindings = (flywheelResult.classificationResult as Record<string, unknown>)?.fieldBindings as Array<{ sourceField: string; semanticRole: string; confidence: number; displayContext?: string }> | undefined;
168         if (!flywheelBindings || flywheelBindings.length === 0) continue;
169
170         const sheetProfile = profileMap.get(sheet.sheetName);
171         if (!sheetProfile) continue;
172
173         // Map semanticRole → ColumnRole for HeaderInterpretation
174         const roleMap: Record<string, 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key' | 'unknown'> = {
175           entity_identifier: 'identifier', entity_name: 'name',
176           transaction_date: 'temporal', period: 'temporal',
177           transaction_amount: 'measure', transaction_count: 'measure',
178           category_code: 'attribute', entity_attribute: 'attribute',
179         };
180         const interpretations = new Map<string, import('@/lib/sci/sci-types').HeaderInterpretation>();
181         for (const fb of flywheelBindings) {
182           const columnRole = roleMap[fb.semanticRole] ?? 'unknown';
183           interpretations.set(fb.sourceField, {
184             columnName: fb.sourceField,
185             semanticMeaning: fb.displayContext || fb.semanticRole,
186             dataExpectation: '',
187             columnRole,
188             confidence: fb.confidence,
189           });
190         }
191         sheetProfile.headerComprehension = {
192           interpretations,
193           crossSheetInsights: [],
194           llmCallDuration: 0,
195           llmModel: 'flywheel-tier1',
196           fromVocabularyBinding: false,
197         };
198         console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${sheet.sheetName}`);
199       }
```

### Target field identification

```
TARGET FIELD:        sheetProfile.headerComprehension.interpretations
TYPE:                Map<string, HeaderInterpretation>   (see src/lib/sci/sci-types.ts:101-107)
CONFIDENCE_VALUE:    fb.confidence (preserved from the cached classificationResult; per-binding)
SOURCE_OF_CONFIDENCE_VALUE: cached (from prior LLM/HC outcome stored on classification_signals.flywheel record)
SEMANTIC_ROLE → COLUMN_ROLE MAP (analyze/route.ts:174-179):
  entity_identifier   → identifier
  entity_name         → name
  transaction_date    → temporal
  period              → temporal
  transaction_amount  → measure
  transaction_count   → measure
  category_code       → attribute
  entity_attribute    → attribute
FALLBACK (analyze/route.ts:182): roleMap[fb.semanticRole] ?? 'unknown'
   — every semanticRole NOT in the 8 keys above maps to columnRole='unknown'.
   Notably absent: 'reference_key', 'entity_license', 'descriptive_label',
   'tier_boundary', 'baseline_value', and any other semanticRole the flywheel
   record might carry.
```

The injection writes the flywheel bindings into `profile.headerComprehension` — the same field that fresh-LLM populates. There is no separate `unit.fieldBindings` / `unit.proposedBindings` field. Downstream consumers read `profile.headerComprehension.interpretations`.

## Phase 2: SCI Classification Path

[populated by Phase 2]

## Phase 3: confirmedBindings Materialization

[populated by Phase 3]

## Phase 4: commitContentUnit Consumption

[populated by Phase 4]

## Phase 5: Database State Evidence

[populated by Phase 5]

## Phase 6: Binding Lifecycle Map and Attrition Point

[populated by Phase 6]
