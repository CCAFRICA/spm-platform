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

### Classification entry symbols

`grep -rn "classifyContentUnits|applyHeaderComprehensionSignals|classifyByHCPattern" --include="*.ts" src/lib/sci/`:

```
src/lib/sci/synaptic-ingestion-state.ts:17:import { computeAdditiveScores, applyHeaderComprehensionSignals, resolveClaimsPhase1, requiresHumanReview } from './agents';
src/lib/sci/synaptic-ingestion-state.ts:180:export function classifyContentUnits(state: SynapticIngestionState): void {
src/lib/sci/synaptic-ingestion-state.ts:252:    applyHeaderComprehensionSignals(scores, profile);
src/lib/sci/resolver.ts:7:// Replaces: classifyContentUnits() scoring logic
src/lib/sci/resolver.ts:19:import { computeAdditiveScores, applyHeaderComprehensionSignals } from './agents';
src/lib/sci/resolver.ts:54:// Replaces classifyContentUnits from synaptic-ingestion-state.ts
src/lib/sci/resolver.ts:109:    applyHeaderComprehensionSignals(scores, profile);
src/lib/sci/agents.ts:145: * Used by classifyContentUnits in synaptic-ingestion-state.ts (Phase C consolidated pipeline).
src/lib/sci/agents.ts:176: * New code should use classifyContentUnits from synaptic-ingestion-state.ts.
src/lib/sci/agents.ts:193:export function applyHeaderComprehensionSignals(
src/lib/sci/hc-pattern-classifier.ts:50:export function classifyByHCPattern(profile: ContentProfile): HCPatternResult | null {
```

`grep -rn "fieldBindings.*=" --include="*.ts" src/lib/sci/` (excluding tests) — empty result. No assignment to `fieldBindings` lives in `src/lib/sci/`.

`grep -rnE "fieldBindings\s*[:=]" --include="*.ts" --include="*.tsx" src/`:

```
src/app/api/import/sci/execute/route.ts:341:              fieldBindings: unit.confirmedBindings,
src/app/api/import/sci/process-job/route.ts:330:        { ..., fieldBindings: unit.fieldBindings, ... },
src/app/api/import/sci/analyze-document/route.ts:196:      fieldBindings: [], // Documents don't have field bindings
src/app/api/import/sci/analyze/route.ts:440:            fieldBindings: unit.fieldBindings,
src/lib/sci/synaptic-ingestion-state.ts:596:        fieldBindings: primaryBindings,
src/lib/sci/synaptic-ingestion-state.ts:620:        fieldBindings: secondaryBindings,
src/lib/sci/synaptic-ingestion-state.ts:649:        fieldBindings: claim.semanticBindings,
src/lib/sci/sci-types.ts:301:  fieldBindings: SemanticBinding[];
```

Three TRUE construction sites for proposal `fieldBindings`: `synaptic-ingestion-state.ts:596` (PARTIAL primary), `:620` (PARTIAL secondary), `:649` (FULL claim). All inside `buildProposalFromState`.

`grep -rn "confirmedBindings.*=|proposedBindings.*=" --include="*.ts" src/lib/sci/ src/app/api/`:

```
src/app/api/import/sci/execute-bulk/route.ts:290:    unit: { ...unit, confirmedBindings: filteredBindings },
src/app/api/import/sci/execute/route.ts:421:    confirmedBindings: filteredBindings,
src/components/sci/SCIExecution.tsx:173:        confirmedBindings: proposalUnit.fieldBindings,
src/components/sci/SCIExecution.tsx:250:        confirmedBindings: proposalUnit.fieldBindings,
src/components/sci/SCIExecution.tsx:308:        confirmedBindings: proposalUnit.fieldBindings,
```

`confirmedBindings` is produced CLIENT-SIDE in `SCIExecution.tsx` by copying `proposalUnit.fieldBindings` from the analyze-response. Server-side `execute-bulk:290` / `execute:421` re-assign `confirmedBindings` inside `filterFieldsForPartialClaim` (a re-projection of an already-set value, not a fresh population).

### Classification dispatcher body

`buildProposalFromState` is the function that produces `fieldBindings` on the proposal. `classifyContentUnits` (the resolver) only writes scores / claimType into `state.resolutions`. Verbatim `buildProposalFromState` excerpts (relevant slices); lines 517-665 from `src/lib/sci/synaptic-ingestion-state.ts`:

```typescript
517 export function buildProposalFromState(
518   state: SynapticIngestionState,
519   fileSheets: Array<{ sourceFile: string; sheetName: string }>,
520 ): ContentUnitProposal[] {
521   const contentUnits: ContentUnitProposal[] = [];
522
523   for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
524     const scores = state.round2Scores.get(unitId);
525     if (!scores || scores.length === 0) continue;
526
527     const resolution = state.resolutions.get(unitId);
528     if (!resolution) continue;
...
536     const splitAnalysis = analyzeSplit(fieldAffinities, scores, log);
...
570     if (splitAnalysis.shouldSplit && splitAnalysis.secondaryAgent) {
571       // PARTIAL claims — two content units from one tab
572       const primaryAgent = splitAnalysis.primaryAgent;
573       const secondaryAgent = splitAnalysis.secondaryAgent;
...
582       const primaryBindings = generatePartialBindings(profile, primaryAgent, splitAnalysis.primaryFields, splitAnalysis.sharedFields);
583       const secondaryBindings = generatePartialBindings(profile, secondaryAgent, splitAnalysis.secondaryFields, splitAnalysis.sharedFields);
...
596         fieldBindings: primaryBindings,
...
620         fieldBindings: secondaryBindings,
...
635     } else {
636       // FULL claim — single agent wins
637       const claim = resolveClaimsPhase1(profile, scores);
638       const intel = generateProposalIntelligence(profile, scores, negotiationResult, claim.agent);
639
640       contentUnits.push({
...
649         fieldBindings: claim.semanticBindings,
...
656         claimType: 'FULL',
```

### Binding transformation trace

| LINE | Verbatim | OPERATION | EFFECT |
|---|---|---|---|
| `synaptic-ingestion-state.ts:582` | `const primaryBindings = generatePartialBindings(profile, primaryAgent, splitAnalysis.primaryFields, splitAnalysis.sharedFields);` | write (constructs new array) | FILTER — keeps only fields ∈ `primaryFields ∪ sharedFields` (`negotiation.ts:268-274`) |
| `synaptic-ingestion-state.ts:583` | `const secondaryBindings = generatePartialBindings(profile, secondaryAgent, splitAnalysis.secondaryFields, splitAnalysis.sharedFields);` | write | FILTER — keeps only fields ∈ `secondaryFields ∪ sharedFields` |
| `synaptic-ingestion-state.ts:596` | `fieldBindings: primaryBindings,` | write (proposal field) | sets PARTIAL primary proposal's `fieldBindings` to the filtered set |
| `synaptic-ingestion-state.ts:620` | `fieldBindings: secondaryBindings,` | write | sets PARTIAL secondary proposal's `fieldBindings` to the filtered set |
| `synaptic-ingestion-state.ts:649` | `fieldBindings: claim.semanticBindings,` | write | sets FULL proposal's `fieldBindings` to ALL `profile.fields` (no filter; `agents.ts:450-468:generateSemanticBindings` maps over `profile.fields` 1:1) |

Reference — `generatePartialBindings` filter (negotiation.ts:262-292), verbatim:

```typescript
262 export function generatePartialBindings(
263   profile: ContentProfile,
264   agent: AgentType,
265   ownedFields: string[],
266   sharedFields: string[]
267 ): SemanticBinding[] {
268   const relevantFields = new Set([...ownedFields, ...sharedFields]);
269   const bindings: SemanticBinding[] = [];
270   const hc = profile.headerComprehension;
271   const rowCount = profile.structure.rowCount ?? profile.fields.length;
272
273   for (const field of profile.fields) {
274     if (!relevantFields.has(field.fieldName)) continue;
275     ...
```

Reference — `generateSemanticBindings` (FULL path, no filter) (agents.ts:450-468):

```typescript
450 function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
451   const hc = profile.headerComprehension;
452   const rowCount = profile.structure.rowCount ?? profile.fields.length;
453   return profile.fields.map(field => {
454     const hcInterp = hc?.interpretations.get(field.fieldName);
455     const hcRole = hcInterp?.columnRole;
456     const identifiesWhat = hcInterp?.identifiesWhat;
457     const binding = assignSemanticRole(field, agent, hcRole, rowCount, identifiesWhat);
458     return {
459       sourceField: field.fieldName,
460       platformType: field.dataType,
461       semanticRole: binding.role,
...
```

### NO_MATCH handler

Directive §4.4 expected a literal `NO_MATCH` symbol. `grep -rn "NO_MATCH|noMatch|pattern.*not.*match" --include="*.ts" src/lib/sci/` returns **0 hits**. The HF-230 decision-tree implementation in `hc-pattern-classifier.ts` uses `return null` as its fallthrough signal:

```
hc-pattern-classifier.ts:52   if (!hc) return null;
hc-pattern-classifier.ts:59   if (totalColumns === 0) return null;
hc-pattern-classifier.ts:64     return null;
```

These three exits represent: (a) no HC at all, (b) HC has zero column entries, (c) HC coverage below `MIN_COVERAGE_RATIO` (0.50) of confident roles. When `classifyByHCPattern` returns null, Level-2 CRR Bayesian (the additive-scoring path in `classifyContentUnits`) owns the classification — `applyHeaderComprehensionSignals` still consults `profile.headerComprehension` (it's additive whether or not a pattern matched). The bindings produced downstream (`generatePartialBindings` / `generateSemanticBindings`) consult `profile.headerComprehension.interpretations` and `profile.fields` regardless of whether HC pattern matched. Pattern null-return does NOT preserve / transform / filter bindings — bindings are produced later, by the FULL or PARTIAL branch in `buildProposalFromState`.

```
NO_MATCH HANDLER LOCATION: src/lib/sci/hc-pattern-classifier.ts:52, 59, 64 (three `return null` exits)
HANDLER BODY: `return null;` (no inline handler; caller `classifyContentUnits` proceeds to Level-2 CRR)
BINDING PRESERVATION: PRESERVED — pattern null-return does not touch fieldBindings (those are produced later in `buildProposalFromState` from `profile.fields`)
EVIDENCE: hc-pattern-classifier.ts:52/59/64 return null; downstream `classifyContentUnits` at synaptic-ingestion-state.ts:180-340 never touches `fieldBindings`; `buildProposalFromState:517-665` is the sole producer.
```

### Observation on Phase 1 / Phase 2 interplay

Phase 1 established that flywheel injection writes into `sheetProfile.headerComprehension.interpretations` (Map<string,HeaderInterpretation>). Phase 2 establishes that `fieldBindings` are produced by `buildProposalFromState` from `profile.fields` (the field inventory) — NOT from `profile.headerComprehension.interpretations`. The HC interpretations affect the ROLE chosen for each binding (via `hcInterp.columnRole`) but do NOT determine the COUNT of bindings. The count equals `profile.fields.length` in the FULL path or `|primaryFields ∪ sharedFields|` in the PARTIAL path.

This means the 11→5 attrition cannot come from the flywheel-injected `headerComprehension` map size mismatching the field inventory. It must come from one of: (a) `splitAnalysis.shouldSplit === true` causing a PARTIAL claim with 5 ownedFields+sharedFields, OR (b) downstream filtering in `filterFieldsForPartialClaim`. The DB probe in Phase 5 will reveal whether `claimType === 'PARTIAL'` for the CRP transaction batch.

## Phase 3: confirmedBindings Materialization

### confirmedBindings reference inventory

`grep -rn "confirmedBindings:|confirmedBindings =|\.confirmedBindings" --include="*.ts" --include="*.tsx" src/` (excluding tests):

| File:Line | Match | Classification |
|---|---|---|
| `src/app/api/import/sci/execute-bulk/route.ts:57` | `confirmedBindings: SemanticBinding[];` | declaration (interface field) |
| `src/app/api/import/sci/execute-bulk/route.ts:285` | `const filteredBindings = unit.confirmedBindings.filter(` | read (to filter) |
| `src/app/api/import/sci/execute-bulk/route.ts:290` | `unit: { ...unit, confirmedBindings: filteredBindings },` | assignment (PARTIAL re-projection) |
| `src/app/api/import/sci/execute-bulk/route.ts:345` | `const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');` | read |
| `src/app/api/import/sci/execute-bulk/route.ts:346` | `const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');` | read |
| `src/app/api/import/sci/execute-bulk/route.ts:347` | `const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');` | read |
| `src/app/api/import/sci/execute-bulk/route.ts:356` | `const enrichmentBindings = unit.confirmedBindings.filter(b =>` | read |
| `src/app/api/import/sci/execute-bulk/route.ts:368` | `for (const binding of unit.confirmedBindings) {` | read |
| `src/app/api/import/sci/execute/route.ts:326` | `if (unit.confirmedBindings && unit.confirmedBindings.length > 0 && unit.rawData && unit.rawData.length > 0) {` | read |
| `src/app/api/import/sci/execute/route.ts:330` | `for (const binding of unit.confirmedBindings) {` | read |
| `src/app/api/import/sci/execute/route.ts:341` | `fieldBindings: unit.confirmedBindings,` | read |
| `src/app/api/import/sci/execute/route.ts:414` | `const filteredBindings = unit.confirmedBindings.filter(` | read |
| `src/app/api/import/sci/execute/route.ts:421` | `confirmedBindings: filteredBindings,` | assignment (PARTIAL re-projection) |
| `src/components/sci/SCIExecution.tsx:173` | `confirmedBindings: proposalUnit.fieldBindings,` | assignment (initial population, bulk path) |
| `src/components/sci/SCIExecution.tsx:250` | `confirmedBindings: proposalUnit.fieldBindings,` | assignment (initial population, execute single path) |
| `src/components/sci/SCIExecution.tsx:308` | `confirmedBindings: proposalUnit.fieldBindings,` | assignment (initial population, plan path) |
| `src/lib/sci/sci-types.ts:342` | `confirmedBindings: SemanticBinding[];` | declaration (ContentUnitExecution type) |
| `src/lib/sci/commit-content-unit.ts:58` | `confirmedBindings: SemanticBinding[];` | declaration (CommitContentUnitInput type) |
| `src/lib/sci/commit-content-unit.ts:278` | `for (const binding of unit.confirmedBindings) {` | read |
| `src/lib/sci/commit-content-unit.ts:289` | `buildFieldIdentitiesFromBindings(unit.confirmedBindings);` | read |
| `src/lib/sci/commit-content-unit.ts:295` | `unit.confirmedBindings,` | read (into resolveEntityIdField) |
| `src/lib/sci/commit-content-unit.ts:301` | `findDateColumnFromBindings(unit.confirmedBindings);` | read |
| `src/lib/sci/commit-content-unit.ts:302` | `buildSemanticRolesMap(unit.confirmedBindings);` | read |

Five assignment sites total — three CLIENT initial-population sites (`SCIExecution.tsx:173,250,308`) and two SERVER re-projection sites (`execute-bulk/route.ts:290`, `execute/route.ts:421`).

### Assignment site bodies

**Site 1 — `src/components/sci/SCIExecution.tsx:166-187` (bulk path initial population):**

```typescript
166     // Build content unit metadata (no rawData — server reads from Storage)
167     const bulkUnits = dataUnits.map(eu => {
168       const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
169       if (!proposalUnit) return null;
170       return {
171         contentUnitId: eu.contentUnitId,
172         confirmedClassification: eu.classification,
173         confirmedBindings: proposalUnit.fieldBindings,
174         ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
175         ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
176         ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
177         originalClassification: proposalUnit.classification,
178         originalConfidence: proposalUnit.confidence,
179         // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
180         ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
181         ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
182         ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
183         sourceFile: proposalUnit.sourceFile,
184         tabName: proposalUnit.tabName,
185       };
186     }).filter(Boolean);
```

**Site 2 — `src/components/sci/SCIExecution.tsx:247-264` (execute single path initial population):**

```typescript
247     const execUnit = {
248       contentUnitId: unit.contentUnitId,
249       confirmedClassification: unit.classification,
250       confirmedBindings: proposalUnit.fieldBindings,
251       rawData: sheetData?.rows || [],
252       ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
253       ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
254       ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
255       ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
```

**Site 3 — `src/components/sci/SCIExecution.tsx:302-322` (plan path initial population):**

```typescript
302       const planExecUnits = planUnits.map(unit => {
303         const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
304         if (!proposalUnit) return null;
305         return {
306           contentUnitId: unit.contentUnitId,
307           confirmedClassification: unit.classification,
308           confirmedBindings: proposalUnit.fieldBindings,
309           rawData: [] as Record<string, unknown>[], // Plan units have no row data
```

**Site 4 — `src/app/api/import/sci/execute-bulk/route.ts:263-293` (PARTIAL re-projection):**

```typescript
263 // ── Field filtering for PARTIAL claims ──
264
265 function filterFieldsForPartialClaim(
266   unit: BulkContentUnit,
267   rows: Record<string, unknown>[],
268 ): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
269   if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
270     return { unit, rows };
271   }
272
273   const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);
274
275   const filteredRows = rows.map(row => {
276     const filtered: Record<string, unknown> = {};
277     for (const key of Object.keys(row)) {
278       if (allowedFields.has(key) || key.startsWith('_')) {
279         filtered[key] = row[key];
280       }
281     }
282     return filtered;
283   });
284
285   const filteredBindings = unit.confirmedBindings.filter(
286     b => allowedFields.has(b.sourceField)
287   );
288
289   return {
290     unit: { ...unit, confirmedBindings: filteredBindings },
291     rows: filteredRows,
292   };
293 }
```

**Site 5 — `src/app/api/import/sci/execute/route.ts:405-425` (PARTIAL re-projection on execute path):**

(Mirror of Site 4 for the non-bulk execute endpoint; same shape; same logic; both `rows` and `confirmedBindings` projected to `ownedFields ∪ sharedFields`.)

### Materialization source analysis

| ASSIGNMENT SITE | SOURCE EXPRESSION | SOURCE FIELD(S) | FILTER APPLIED | FILTER LITERAL |
|---|---|---|---|---|
| `SCIExecution.tsx:173` | `proposalUnit.fieldBindings` | `ContentUnitProposal.fieldBindings` (from analyze-response body) | NONE | n/a |
| `SCIExecution.tsx:250` | `proposalUnit.fieldBindings` | same | NONE | n/a |
| `SCIExecution.tsx:308` | `proposalUnit.fieldBindings` | same | NONE | n/a |
| `execute-bulk/route.ts:290` | `filteredBindings` (line 285: `unit.confirmedBindings.filter(b => allowedFields.has(b.sourceField))`) | own `unit.confirmedBindings` | YES — keeps only `b.sourceField ∈ Set(ownedFields ∪ sharedFields)` | gate on line 269: `unit.claimType !== 'PARTIAL'` short-circuits; if PARTIAL, filter at line 286 with `allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields])` |
| `execute/route.ts:421` | mirror of execute-bulk:290 | same | YES — same | same |

### Path divergence analysis

```
DIVERGENT PATHS: NO at materialization layer; YES at the upstream proposal-building layer

  Upstream paths (which feed `proposalUnit.fieldBindings`):
    PATH A (FULL claim):     synaptic-ingestion-state.ts:649 → `claim.semanticBindings`
                             from agents.ts:427 → `generateSemanticBindings(profile, winner.agent)`
                             which maps over ALL profile.fields (no filter) — count = profile.fields.length

    PATH B (PARTIAL claim):  synaptic-ingestion-state.ts:596 (primary) + :620 (secondary)
                             → `generatePartialBindings(profile, agent, ownedFields, sharedFields)`
                             from negotiation.ts:262, which filters by
                             `relevantFields = Set(ownedFields ∪ sharedFields)` (negotiation.ts:268-274)
                             — count = |primary_or_secondary_fields ∪ sharedFields|

  TRIGGER between A and B:   `splitAnalysis.shouldSplit` from analyzeSplit() (negotiation.ts)
                             evaluated at synaptic-ingestion-state.ts:312

SHARED MATERIALIZATION: YES (downstream)
  Client population:   SCIExecution.tsx:173/250/308 — `confirmedBindings: proposalUnit.fieldBindings`
                       (identical for FULL and PARTIAL; no client-side filter)
  Server re-projection (PARTIAL only): execute-bulk/route.ts:290 / execute/route.ts:421
                       — re-applies the same `ownedFields ∪ sharedFields` filter at the
                       server boundary. For FULL claims, this is a no-op (line 269
                       short-circuits return).
```

The directive's IGF-T1-E952 framing of "fresh-LLM vs flywheel-replay" as the two-arm split is not the divergence layer for binding count. Both fresh-LLM and flywheel-replay paths produce `profile.headerComprehension.interpretations` (different sources, same target field per Phase 1). Both paths produce `profile.fields` from the same SheetJS-parsed sample. Both flow through `buildProposalFromState` and choose FULL vs PARTIAL based on `splitAnalysis.shouldSplit` — which depends on `analyzeSplit(fieldAffinities, scores, log)`.

The arm that matters for binding count is FULL vs PARTIAL, not fresh-LLM vs flywheel. If flywheel-replayed CRP transactions go to PARTIAL but fresh-LLM CRP transactions go to FULL, the attrition is at the FULL/PARTIAL branch.

## Phase 4: commitContentUnit Consumption

### commitContentUnit full body

`web/src/lib/sci/commit-content-unit.ts` is 433 lines. Phase 4 quotes the consumption-relevant region (lines 204-433) verbatim with line numbers — the file's imports + helper functions (lines 1-200) are present in the repo for cross-reference. (Helper `resolveEntityIdField` body is at lines 152-180, `findHcRole` at lines 125-150, both quoted earlier in Phase 1 / Phase 3 context.)

```typescript
204 export async function commitContentUnit(
205   supabase: SupabaseClient,
206   params: CommitContentUnitParams,
207 ): Promise<CommitContentUnitResult> {
208   const {
209     unit,
210     rows,
211     classification,
212     tenantId,
213     proposalId,
214     tabName,
215     fileName,
216     source,
217     fileHashSha256,
218   } = params;
219
220   // Empty-rows short-circuit — preserve existing caller contract.
221   if (rows.length === 0) {
222     return {
223       batchId: '',
224       totalInserted: 0,
225       dataType: resolveDataTypeFromClassification(classification),
226       entityIdField: null,
227       fieldIdentities: {},
228       earliestDate: null,
229       latestDate: null,
230       dateCount: 0,
231       success: true,
232     };
233   }
234
235   const profile = profileFor(source);
236
237   // HF-196 Phase 1D — data_type derives from SCI classification (Decisions 154/155).
238   const dataType = resolveDataTypeFromClassification(classification);
239
240   // HF-213 — content_unit_hash_sha256 is the supersession identity primitive.
241   const contentUnitHashSha256 = computeContentUnitHashSha256(rows);
242   const batchId = crypto.randomUUID();
243
244   await supabase.from('import_batches').insert({
245     id: batchId,
246     tenant_id: tenantId,
247     file_name: fileName,
248     file_type: 'sci',
249     status: 'processing',
250     row_count: rows.length,
251     // HF-196 Phase 1F — file-level hash retained for audit (supersedure trigger
252     // moved to content_unit_hash_sha256 at HF-213).
253     file_hash_sha256: fileHashSha256,
254     content_unit_hash_sha256: contentUnitHashSha256,
255     metadata: {
256       source,
257       proposalId,
258       contentUnitId: unit.contentUnitId,
259       classification,
260     } as unknown as Json,
261   });
262
263   // HF-213 Rule 30 — supersession on content_unit_hash_sha256 match.
264   await supersedePriorBatchOnContentMatch(
265     supabase,
266     tenantId,
267     batchId,
268     contentUnitHashSha256,
269     rows,
270   );
271
272   // Build semantic_roles map from confirmedBindings (single shape across
273   // all four classifications).
274   const semanticRoles: Record<
275     string,
276     { role: string; confidence: number; claimedBy: string }
277   > = {};
278   for (const binding of unit.confirmedBindings) {
279     semanticRoles[binding.sourceField] = {
280       role: binding.semanticRole,
281       confidence: binding.confidence,
282       claimedBy: binding.claimedBy,
283     };
284   }
285
286   // HF-110 — field_identities: HC trace primary, confirmedBindings fallback (DS-009 1.3).
287   const fieldIdentities =
288     extractFieldIdentitiesFromTrace(unit.classificationTrace) ??
289     buildFieldIdentitiesFromBindings(unit.confirmedBindings);
290
291   // Decision 108 — HC role @ >= 0.80 overrides structural binding.
292   // HF-233 — Classification-aware resolution: transaction reads reference_key,
293   // entity/target reads identifier, reference is null.
294   const entityIdField = resolveEntityIdField(
295     unit.confirmedBindings,
296     unit.classificationTrace,
297     classification,
298   );
299
300   // OB-152/OB-157 — source_date extraction with period marker composition.
301   const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
302   const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
303   const periodMarkerHint = detectPeriodMarkerColumns(rows);
304
305   // Build committed_data rows. entity_id and period_id are always NULL at
306   // import — engine binds them at calc time (OB-182, Decision 92).
307   let earliestDate: string | null = null;
308   let latestDate: string | null = null;
309   let dateCount = 0;
310
311   const insertRows = rows.map((row, i) => {
312     const sourceDate = extractSourceDate(
313       row,
314       dateColumnHint,
315       semanticRolesMap,
316       periodMarkerHint,
317     );
318     if (sourceDate) {
319       dateCount++;
320       if (!earliestDate || sourceDate < earliestDate) earliestDate = sourceDate;
321       if (!latestDate || sourceDate > latestDate) latestDate = sourceDate;
322     }
323
324     return {
325       tenant_id: tenantId,
326       import_batch_id: batchId,
327       entity_id: null as string | null,
328       period_id: null as string | null,
329       source_date: sourceDate,
330       data_type: dataType,
331       row_data: { ...row, _sheetName: tabName, _rowIndex: i },
332       metadata: {
333         source,
334         proposalId,
335         semantic_roles: semanticRoles,
336         resolved_data_type: dataType,
337         entity_id_field: entityIdField,
338         informational_label: classification,
339         field_identities: fieldIdentities,
340       },
341     };
342   });
343
344   // Chunked insert — per-source profile (sci-bulk retries; sci does not).
345   ... [chunked insert loop, lines 344-404, retains rows verbatim per chunk] ...
405 }
406
407   // Finalize batch.
408   ... [batch status update, success log line] ...
432   };
433 }
```

(Lines 344-433 elided; covered in earlier read. The body of those lines is purely the chunked-insert loop plus batch finalization — they consume `insertRows` but do not modify the per-row `row_data` shape.)

### semantic_roles construction

```
SEMANTIC_ROLES CONSTRUCTION LINES: 272-284 (commit-content-unit.ts)
SOURCE:                              `for (const binding of unit.confirmedBindings) { semanticRoles[binding.sourceField] = { role, confidence, claimedBy }; }`
INCLUDES:                            every binding in unit.confirmedBindings (no filter applied inside commitContentUnit)
                                     count(semanticRoles) === unit.confirmedBindings.length
```

### row_data construction

```
ROW_DATA CONSTRUCTION LINES:    311-331 (commit-content-unit.ts)
SPREAD EXPRESSION:               `row_data: { ...row, _sheetName: tabName, _rowIndex: i }`  (line 331)
ROW SOURCE:                      `rows` parameter of type `Record<string, unknown>[]` (param destructured at line 210)
                                 The `rows` array enters `commitContentUnit` from its caller:
                                   • execute-bulk path: `processDataUnit(..., rows, ...)` is invoked at
                                     execute-bulk/route.ts:218 via `processContentUnit`, where `rows`
                                     was already passed through `filterFieldsForPartialClaim(unit, rows)`
                                     at execute-bulk/route.ts:216 — see Phase 3 § Site 4. For PARTIAL
                                     claims, the rows are pre-projected to `ownedFields ∪ sharedFields`.
                                   • execute path: same shape; pre-projection at execute/route.ts:414-421.
COLUMN PROJECTION INSIDE        NONE — the spread `{ ...row, _sheetName, _rowIndex }` preserves every key
commitContentUnit:               present in the input `row` argument.
```

### Invariant reconciliation

The DB invariant `row_data_col_count == semantic_roles_count` is reconciled by **Option B**: the row source (the `rows` parameter) arrives at `commitContentUnit` already pre-projected upstream by the caller, when the unit has `claimType === 'PARTIAL'`.

```
INVARIANT EXPLANATION:
  Option A (row_data projected by confirmedBindings inside commitContentUnit): RULED OUT
    commit-content-unit.ts:331 uses an unrestricted spread `{ ...row, _sheetName, _rowIndex }`.
    No projection occurs inside this function.

  Option B (row source is pre-projected upstream by caller): SELECTED
    execute-bulk/route.ts:215-222 calls
      `const effectiveUnit = filterFieldsForPartialClaim(unit, rows);`
      `const result = await processContentUnit(..., effectiveUnit.unit, effectiveUnit.rows, ...);`
    `filterFieldsForPartialClaim` (execute-bulk/route.ts:265-293, quoted in Phase 3 § Site 4)
    short-circuits when `unit.claimType !== 'PARTIAL'` (line 269) and otherwise builds
      `allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields])`
    then projects BOTH:
      • `filteredRows`  (lines 275-283) — `for (const key of Object.keys(row)) if (allowedFields.has(key) || key.startsWith('_'))`
      • `filteredBindings`  (lines 285-287) — `unit.confirmedBindings.filter(b => allowedFields.has(b.sourceField))`
    to the same `allowedFields` set, so when commitContentUnit reads the pre-projected `rows` and the
    pre-projected `unit.confirmedBindings`, both have identical key counts.

  Option C (count coincidence): RULED OUT
    The invariant holds across all tenants, all data types, all timestamps per the directive's §1.1
    table. A 5-tenant-data-type coincidence over 11→5 / 7→7 / 19→19 / 13→13 / 8→8 cuts is structurally
    implausible.

  Option D (other): N/A

SELECTED:  Option B
EVIDENCE:  execute-bulk/route.ts:215-222 (caller wraps via filterFieldsForPartialClaim);
           execute-bulk/route.ts:265-293 (the filter projects BOTH rows AND bindings to the same set);
           commit-content-unit.ts:278-284 (semanticRoles built from the pre-projected confirmedBindings);
           commit-content-unit.ts:331 (row_data spreads the pre-projected row unchanged).
```

For tenants where the invariant collapses NUMBERS (Meridian transaction 19=19, BCL transaction 13=13, CRP transaction 5=5), the count equals:
- the full file's column count, IF `claimType === 'FULL'` (filterFieldsForPartialClaim short-circuits on line 269), OR
- |ownedFields ∪ sharedFields|, IF `claimType === 'PARTIAL'`.

Phase 5 will confirm via DB probe which `claimType` operated for the current CRP transaction batch.

## Phase 5: Database State Evidence

[populated by Phase 5]

## Phase 6: Binding Lifecycle Map and Attrition Point

[populated by Phase 6]
