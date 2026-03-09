# HF-112 Phase 0: AI Column Mapping Diagnostic

## Why Deterministic Fails
HF-111 boundary matching selects wrong columns because many columns have overlapping value ranges:
- `Incidentes_Seguridad` (0-3) fits inside percentage boundaries (0-100)
- `Entregas_Tiempo` (50-80) fits inside percentage boundaries (0-100)
- Multiple percentage-scale columns are interchangeable to boundary matching

Column exclusion worsens the problem: once a wrong column binds early, the correct column is unavailable.

## What the Platform Already Knows (Both Sides)

**Plan side** (from AI plan interpretation → calculationIntent):
- Each component's `sourceSpec.field` names its required metric in English
- `extractInputRequirements()` extracts the role but NOT the metricField — needs extension

**Data side** (from HC → field_identities → contextualIdentity):
- Each column has an English contextualIdentity describing what it represents
- Available in `DataCapability.fieldIdentities[colName].contextualIdentity`

**The bridge:** One AI call matching English metric names to English contextual identities.

## Current Column Selection Code
`generateAllComponentBindings()` at convergence-service.ts:918 — uses `scoreColumnForRequirement()` (boundary matching only, no semantic awareness).

## AIService Integration Point
```typescript
import { getAIService } from '@/lib/ai';
const aiService = getAIService();
const response = await aiService.execute({
  task: 'narration',  // closest existing task type
  input: { system: systemPrompt, userMessage: userPrompt },
  options: { maxTokens: 500, responseFormat: 'json' }
}, false);
// response.result contains parsed JSON
```

## Fix Plan
1. Extend `ComponentInputRequirement` with `metricField`
2. Extract metric field names per role from calculationIntent
3. One AI call: plan metric names + data column profiles → mapping
4. Boundary validation of AI proposals (HF-111 repurposed)
5. Existing binding reuse check (zero AI cost on re-run)

---
*HF-112 Phase 0 | March 9, 2026*
