# OB-83: DOMAIN AGENT RUNTIME + AI ASSESSMENT PANELS
## Close the Two P1 Gaps From the Co-Founder Briefing

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_State_Specification.md` — Synaptic State protocol
4. `Vialuce_Calculation_Intent_Specification.md` — the Intent vocabulary
5. `OB-82_COMPLETION_REPORT.md` — current platform state after sync
6. `OB-80_COMPLETION_REPORT.md` — negotiation protocol, domain registry
7. `OB-81_COMPLETION_REPORT.md` — wiring, agent memory

**Read all seven before writing any code.**

---

## WHAT THIS OB DOES

The co-founder briefing v2 identified two P1 gaps. This OB closes both:

**Gap 1: Domain Agent Runtime Dispatch**
The negotiation protocol types exist and are tested (OB-80). The ICM Domain Agent registration exists. But the protocol isn't invoked during actual pipeline execution — the current engine still handles calculation dispatch directly. This OB makes the ICM Domain Agent the actual entry point for calculation, with the negotiation protocol scoring every interaction.

**Gap 2: AI Assessment Panels**
The AI assessment API route exists. Persona-specific prompts are designed (OB-53/56). But no Assessment Panel component renders on any dashboard. This OB builds the component and wires it to all three persona dashboards with real AI intelligence.

**After OB-83, both P1 gaps are closed. Every claim in the co-founder briefing is either PROVEN or explicitly marked as future work.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in Foundational code.**
8. Domain Agent dispatch code lives in `src/lib/domain/` — domain language acceptable there.
9. Assessment Panel UI lives in `src/components/` — display strings acceptable there.

---

## PHASE 0: DIAGNOSTIC

### 0A: Read the current calculation dispatch path

```bash
echo "=== CALCULATION ROUTE — FULL FILE ==="
cat web/src/app/api/calculation/run/route.ts

echo ""
echo "=== HOW CALCULATION IS CURRENTLY DISPATCHED ==="
grep -n "evaluateComponent\|calculateEntity\|executeIntent\|runCalculation" web/src/app/api/calculation/run/route.ts
```

### 0B: Read the ICM Domain Agent registration

```bash
echo "=== ICM DOMAIN AGENT ==="
cat web/src/lib/domain/domains/icm.ts

echo ""
echo "=== NEGOTIATION PROTOCOL ==="
cat web/src/lib/domain/negotiation-protocol.ts

echo ""
echo "=== DOMAIN REGISTRY ==="
cat web/src/lib/domain/domain-registry.ts
```

### 0C: Read the AI assessment infrastructure

```bash
echo "=== AI ASSESSMENT API ROUTE ==="
find web/src/app/api -path "*assess*" -name "route.ts" | head -5
for f in $(find web/src/app/api -path "*assess*" -name "route.ts"); do
  echo "--- $f ---"
  cat "$f"
done

echo ""
echo "=== AI SERVICE ==="
cat web/src/lib/ai/ai-service.ts 2>/dev/null | head -40 || echo "NOT FOUND"

echo ""
echo "=== EXISTING ASSESSMENT COMPONENTS ==="
find web/src/components -iname "*assess*" -o -iname "*intelligence*" -o -iname "*insight*" -o -iname "*coach*" | head -10
```

### 0D: Read the persona dashboards

```bash
echo "=== DASHBOARD PAGES ==="
find web/src/app -path "*dashboard*" -name "page.tsx" | head -10

echo ""
echo "=== ADMIN DASHBOARD ==="
find web/src/app -path "*admin*" -name "page.tsx" | head -5

echo ""
echo "=== MANAGER DASHBOARD ==="
find web/src/app -path "*manage*" -name "page.tsx" | head -5

echo ""
echo "=== REP/PERFORM DASHBOARD ==="
find web/src/app -path "*perform*" -name "page.tsx" -o -path "*rep*" -name "page.tsx" | head -5
```

### 0E: Read the Insight Agent (source for assessment content)

```bash
echo "=== INSIGHT AGENT ==="
cat web/src/lib/agents/insight-agent.ts | head -60

echo ""
echo "=== INSIGHT AGENT PERSONA ROUTING ==="
grep -n "persona\|admin\|manager\|rep\|routeToPersona" web/src/lib/agents/insight-agent.ts
```

**Commit:** `OB-83 Phase 0: Diagnostic — dispatch path, domain agent, assessment infrastructure, dashboards`

---

## MISSION 1: ICM DOMAIN AGENT RUNTIME DISPATCH

### What changes:

Currently the calculation route directly calls the engine. After this mission, the flow is:

```
API Request
  → Determine domain (from tenant config, default 'icm')
  → Load Domain Agent registration
  → Domain Agent creates NegotiationRequest
  → Foundational pipeline executes (existing code)
  → Response wrapped in NegotiationResponse with IAP score
  → Training signal captured
```

The key insight: the foundational pipeline code doesn't change. The Domain Agent becomes the **entry point** that frames the request and scores the result. This is a wrapper, not a rewrite.

### 1A: Create src/lib/domain/domain-dispatcher.ts

```typescript
// Domain Dispatcher — routes work through the Domain Agent layer

import { getDomain } from './domain-registry';
import { scoreIAP, NegotiationRequest, NegotiationResponse, IAPWeights } from './negotiation-protocol';

export interface DispatchContext {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  iapWeights?: IAPWeights;
}

export interface CalculationDispatchResult {
  // The actual calculation results (unchanged from current)
  results: unknown;
  
  // NEW: Negotiation metadata
  negotiation: {
    domainId: string;
    domainVersion: string;
    iapScore: {
      intelligence: number;
      acceleration: number;
      performance: number;
      composite: number;
    };
    terminology: Record<string, string>;  // structural → domain display terms
  };
}

// Wrap calculation dispatch through the Domain Agent
export function createCalculationRequest(
  context: DispatchContext,
  batchId: string,
  periodId: string
): NegotiationRequest {
  const domain = getDomain(context.domainId);
  if (!domain) {
    // Fallback: no domain agent registered, proceed without negotiation metadata
    return {
      requestId: batchId,
      domainId: context.domainId,
      requestType: 'calculate_outcomes',
      payload: { batchId, periodId, tenantId: context.tenantId },
      urgency: 'immediate',
    };
  }
  
  return {
    requestId: batchId,
    domainId: domain.domainId,
    requestType: 'calculate_outcomes',
    payload: {
      batchId,
      periodId,
      tenantId: context.tenantId,
      interpretationContext: domain.interpretationContext,
      requiredPrimitives: domain.requiredPrimitives,
    },
    iapPreference: context.iapWeights,
    urgency: 'immediate',
  };
}

// Score the calculation result through IAP
export function scoreCalculationResult(
  context: DispatchContext,
  results: unknown,
  confidence: number,
  producedLearning: boolean
): CalculationDispatchResult {
  const domain = getDomain(context.domainId);
  const iapScore = scoreIAP(
    {
      producesLearning: producedLearning,
      automatesStep: true,  // calculation is always automated
      confidence,
    },
    context.iapWeights
  );
  
  return {
    results,
    negotiation: {
      domainId: context.domainId,
      domainVersion: domain?.version || 'unknown',
      iapScore,
      terminology: domain ? buildTerminologyMap(domain) : {},
    },
  };
}

function buildTerminologyMap(domain: DomainRegistration): Record<string, string> {
  return {
    entity: domain.terminology.entity,
    entityGroup: domain.terminology.entityGroup,
    outcome: domain.terminology.outcome,
    ruleset: domain.terminology.ruleset,
    period: domain.terminology.period,
  };
}
```

### 1B: Wire into calculation route

In `web/src/app/api/calculation/run/route.ts`, add Domain Agent dispatch at entry and scoring at exit:

```typescript
import { createCalculationRequest, scoreCalculationResult } from '@/lib/domain/domain-dispatcher';
import { getDomain } from '@/lib/domain/domain-registry';
// Import ICM to trigger registration
import '@/lib/domain/domains/icm';

// At the TOP of the handler (after auth, before calculation):
const domainId = tenantConfig?.domainId || 'icm';
const verticalHint = tenantConfig?.verticalHint;
const dispatchContext = { tenantId, domainId, verticalHint };

// Create negotiation request (logs the domain framing)
const negotiationRequest = createCalculationRequest(dispatchContext, batchId, periodId);

// ... existing calculation pipeline (UNCHANGED) ...

// At the BOTTOM (after calculation, before response):
const dispatchResult = scoreCalculationResult(
  dispatchContext,
  existingResults,
  averageConfidence,   // from synaptic stats
  trainingSignalsCaptured  // boolean
);

// Add negotiation metadata to response
return NextResponse.json({
  ...existingResponse,
  negotiation: dispatchResult.negotiation,
});
```

### 1C: Wire terminology into API responses

The Insight Agent, Reconciliation Agent, and Resolution Agent responses should translate structural terms to domain terms for display:

```typescript
// In insight/reconciliation/resolution API routes:
import { getDomain } from '@/lib/domain/domain-registry';
import '@/lib/domain/domains/icm';

// After agent produces results:
const domain = getDomain(domainId || 'icm');
if (domain) {
  // Replace structural terms in display strings
  // "entity" → "employee", "outcome" → "payout", etc.
  // This is display-layer translation only — agent logic stays structural
}
```

### 1D: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob83-test-dispatch.ts
// Test 1: ICM domain registration loads on import
// Test 2: createCalculationRequest produces valid NegotiationRequest
// Test 3: scoreCalculationResult produces valid IAP scores
// Test 4: Terminology map generated correctly for ICM
// Test 5: Missing domain falls back gracefully (no crash)
// Test 6: Dispatch wraps existing results (doesn't modify calculation)
// Test 7: IAP score composite matches weighted sum
// Test 8: Build compiles with dispatch wiring
// Test 9: Calculation route includes negotiation in response
// Test 10: Korean Test — domain-dispatcher.ts has zero domain words in foundational logic
//          (domain words acceptable in terminology map output and import of icm.ts)
SCRIPT
npx tsx web/scripts/ob83-test-dispatch.ts
```

**Proof gates:**
- PG-1: ICM Domain Agent invoked during calculation dispatch
- PG-2: NegotiationRequest created with correct metadata
- PG-3: IAP score included in calculation response
- PG-4: Terminology mapping translates structural → domain terms
- PG-5: Existing calculation results unchanged (dispatch is additive)
- PG-6: Fallback works when no domain registered

**Commit:** `OB-83 Mission 1: ICM Domain Agent runtime dispatch — 6 gates`

---

## MISSION 2: AI ASSESSMENT PANEL COMPONENT

### What this builds:

A reusable `<AssessmentPanel>` React component that:
1. Calls the AI assessment API with the current persona and data context
2. Displays persona-specific intelligence in a styled card
3. Caches results per period + data hash (prevents redundant AI calls)
4. Shows loading state while AI processes
5. Handles empty/error states gracefully (never fabricates)

### 2A: Create the component

```typescript
// web/src/components/intelligence/AssessmentPanel.tsx

'use client';

import { useState, useEffect } from 'react';

interface AssessmentPanelProps {
  persona: 'admin' | 'manager' | 'individual';
  tenantId: string;
  periodId?: string;
  batchId?: string;
  entityId?: string;           // for individual persona
  teamId?: string;             // for manager persona
  className?: string;
}

// The component calls /api/ai/assessment with persona context
// Response shape:
// {
//   headline: string,          // "3 reps within 5% of next tier"
//   insights: Array<{
//     type: 'governance' | 'coaching' | 'growth',
//     title: string,
//     body: string,
//     action?: string,          // suggested next step
//     urgency: 'high' | 'medium' | 'low',
//     dataSource: string,       // what data this is based on (AP-18 compliance)
//   }>,
//   generatedAt: string,
//   cached: boolean,
// }
```

### 2B: Per-persona content

**Admin persona — Governance & Risk:**
- Calculation accuracy summary (anomaly rates, low-confidence patterns)
- Reconciliation status (discrepancy counts, unresolved corrections)
- Compliance indicators (audit trail completeness, separation of duties)
- System health (agent memory depth, flywheel contribution rates)
- Example headline: "2 unresolved discrepancies require attention. Calculation confidence: 94.2%."

**Manager persona — Coaching Actions:**
- Team performance distribution (who's close to next tier, who's declining)
- Prescribed coaching meetings with expected impact
- Exception flags (missed gates, unusual patterns)
- Example headline: "Meet with Ana — she's 3% from next tier. Carlos missed attendance gate."

**Individual persona — Growth Signals:**
- Personal performance trajectory (trending up/down/steady)
- Proximity to next tier with projected timeline
- Components where improvement has highest payout impact
- Example headline: "You're trending 8% above last period. Optical Sales is your highest-leverage component."

### 2C: Prompt construction

The assessment API route should build persona-specific prompts:

```typescript
function buildAssessmentPrompt(
  persona: string,
  calculationSummary: unknown,
  reconciliationSummary: unknown,
  synapticStats: unknown,
  domain: DomainRegistration | undefined
): string {
  const terminology = domain?.terminology || {
    entity: 'entity', outcome: 'outcome', performance: 'performance'
  };
  
  const basePrompt = `You are an AI intelligence analyst for a performance platform.
Generate a brief, actionable assessment for a ${persona} persona.
Use domain terminology: ${JSON.stringify(terminology)}.
Every insight MUST include a dataSource field citing what data it's based on.
Never fabricate insights from missing data — if data is empty, say so.
Respond in structured JSON only.`;

  // Persona-specific additions
  if (persona === 'admin') {
    return basePrompt + `\nFocus: governance risk, calculation accuracy, reconciliation status, compliance.`;
  } else if (persona === 'manager') {
    return basePrompt + `\nFocus: team coaching actions, tier proximity, exception flags, performance distribution.`;
  } else {
    return basePrompt + `\nFocus: personal growth trajectory, tier proximity, highest-leverage component, trend.`;
  }
}
```

### 2D: Caching strategy

```typescript
// Cache key: persona + periodId + hash(calculationData)
// Cache duration: until new calculation batch runs for this period
// Storage: calculation_batches.config.assessmentCache[persona]
//
// On calculation complete: clear assessment cache for all personas
// On assessment request: check cache first, call AI only if miss
// This prevents: repeated AI calls for same data, stale assessments after recalculation
```

### 2E: Anti-hallucination (AP-18)

```typescript
// Every insight MUST have a non-empty dataSource field
// Post-processing: strip any insight where dataSource is empty or "unknown"
// If calculation summary has zero entities: return "No calculation data available for this period"
// If reconciliation hasn't run: omit reconciliation insights entirely (don't invent)
// Never claim specific numbers not present in the input data
```

### 2F: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob83-test-assessment.ts
// Test 1: AssessmentPanel component compiles
// Test 2: Admin prompt includes governance/risk focus
// Test 3: Manager prompt includes coaching/team focus
// Test 4: Individual prompt includes growth/trajectory focus
// Test 5: Cache key generation is deterministic
// Test 6: Cache hit returns stored result (no AI call)
// Test 7: Cache miss triggers AI call
// Test 8: Anti-hallucination: empty dataSource stripped
// Test 9: Anti-hallucination: zero-entity data returns "no data" message
// Test 10: Domain terminology injected into prompts
// Test 11: API route returns structured JSON with insights array
// Test 12: Build compiles with new component
SCRIPT
npx tsx web/scripts/ob83-test-assessment.ts
```

**Proof gates:**
- PG-7: AssessmentPanel component renders for all three personas
- PG-8: AI prompts are persona-specific with domain terminology
- PG-9: Cache prevents redundant AI calls (same period + data)
- PG-10: Anti-hallucination: no insight without dataSource
- PG-11: Empty data produces honest "no data" message, not fabricated insights

**Commit:** `OB-83 Mission 2: AI Assessment Panel component — 5 gates`

---

## MISSION 3: WIRE ASSESSMENT PANELS TO DASHBOARDS

### 3A: Add to Admin dashboard

Find the admin dashboard page. Add `<AssessmentPanel persona="admin" />` in a prominent position (top of page or first card in grid).

### 3B: Add to Manager dashboard

Find the manager dashboard page. Add `<AssessmentPanel persona="manager" />` with team context.

### 3C: Add to Rep/Individual dashboard

Find the individual/perform dashboard page. Add `<AssessmentPanel persona="individual" />` with entity context.

### 3D: Verify rendering

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

Navigate to each dashboard in the browser and verify:
- Panel renders without errors
- Loading state shows while AI processes
- Content appears (or "no data" message if no calculation data)
- No console errors

### 3E: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob83-test-dashboard-wiring.ts
// Test 1: Admin dashboard includes AssessmentPanel import
// Test 2: Manager dashboard includes AssessmentPanel import
// Test 3: Individual dashboard includes AssessmentPanel import
// Test 4: Build compiles with all three panels wired
// Test 5: Each panel passes correct persona prop
SCRIPT
npx tsx web/scripts/ob83-test-dashboard-wiring.ts
```

**Proof gates:**
- PG-12: Admin dashboard renders with Assessment Panel
- PG-13: Manager dashboard renders with Assessment Panel
- PG-14: Individual dashboard renders with Assessment Panel
- PG-15: Build compiles with all three wired

**Commit:** `OB-83 Mission 3: Wire Assessment Panels to all persona dashboards — 4 gates`

---

## MISSION 4: ASSESSMENT API ROUTE FIX

### 4A: Ensure the assessment API route uses AIService

The OB-66 audit found the assessment route bypasses AIService. Fix this:

```typescript
// In /api/ai/assessment/route.ts:
// BEFORE: Direct Anthropic call or mock data
// AFTER: Route through AIService with proper error handling

import { AIService } from '@/lib/ai/ai-service';

export async function POST(request: Request) {
  const { persona, tenantId, periodId, batchId, entityId, teamId } = await request.json();
  
  // 1. Check cache
  const cacheKey = buildCacheKey(persona, periodId, batchId);
  const cached = await checkCache(tenantId, cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });
  
  // 2. Load calculation data for this period
  const calcData = await loadCalculationSummary(tenantId, periodId, batchId);
  const reconData = await loadReconciliationSummary(tenantId, batchId);
  const synapticStats = await loadSynapticStats(tenantId);
  
  // 3. Load domain for terminology
  const domainId = tenantConfig?.domainId || 'icm';
  const domain = getDomain(domainId);
  
  // 4. Build persona-specific prompt
  const prompt = buildAssessmentPrompt(persona, calcData, reconData, synapticStats, domain);
  
  // 5. Call AI through AIService (not direct)
  const aiService = new AIService();
  const response = await aiService.complete({
    prompt,
    maxTokens: 1000,
    responseFormat: 'json',
  });
  
  // 6. Parse and validate response
  const assessment = parseAssessmentResponse(response);
  
  // 7. Anti-hallucination filter
  assessment.insights = assessment.insights.filter(i => i.dataSource && i.dataSource !== 'unknown');
  
  // 8. Cache result
  await cacheAssessment(tenantId, cacheKey, assessment);
  
  // 9. Write training signal
  await captureSignal('assessment_generated', { persona, insightCount: assessment.insights.length });
  
  return NextResponse.json({ ...assessment, cached: false });
}
```

### 4B: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob83-test-assessment-api.ts
// Test 1: Assessment route uses AIService (not direct Anthropic)
// Test 2: Cache check happens before AI call
// Test 3: Response includes insights array with dataSource fields
// Test 4: Training signal captured on assessment generation
// Test 5: Empty calculation data returns honest response
// Test 6: Invalid persona returns 400
// Test 7: API key missing returns 500 with safe message (no leak)
SCRIPT
npx tsx web/scripts/ob83-test-assessment-api.ts
```

**Proof gates:**
- PG-16: Assessment route uses AIService
- PG-17: Cache prevents redundant AI calls
- PG-18: Training signal captured per assessment
- PG-19: Anti-hallucination enforced in API response

**Commit:** `OB-83 Mission 4: Assessment API route — AIService, caching, training signals, 4 gates`

---

## MISSION 5: BUILD + KOREAN TEST + COMPLETION

### 5A: Build verification

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 5B: Korean Test

```bash
echo "=== KOREAN TEST — FOUNDATIONAL FILES ==="
for f in intent-types.ts intent-executor.ts intent-validator.ts intent-transformer.ts synaptic-types.ts synaptic-surface.ts synaptic-density.ts pattern-signature.ts anomaly-detector.ts flywheel-pipeline.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/calculation/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "--- Agent files ---"
for f in reconciliation-agent.ts insight-agent.ts resolution-agent.ts agent-memory.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/agents/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "--- Domain dispatcher (foundational logic) ---"
count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/domain/domain-dispatcher.ts" 2>/dev/null || echo "0")
echo "  domain-dispatcher.ts: $count domain words"
```

Note: `domain-dispatcher.ts` should have zero domain words in its logic. The terminology map output contains domain words by design — that's the point of the translation layer.

### 5C: Integration checklist

```
□ npm run build exits 0?
□ localhost:3000 responds?
□ Dispatch tests pass?
□ Assessment tests pass?
□ Dashboard wiring tests pass?
□ Assessment API tests pass?
□ Korean Test: 0 domain words in foundational files?
□ ICM Domain Agent dispatches during calculation?
□ IAP score in calculation response?
□ Assessment Panel renders on admin dashboard?
□ Assessment Panel renders on manager dashboard?
□ Assessment Panel renders on individual dashboard?
□ Assessment caching prevents redundant AI calls?
□ Anti-hallucination: no insight without dataSource?
□ gh pr create executed?
```

**Proof gates:**
- PG-20: Korean Test passes on all foundational files
- PG-21: npm run build exits 0

**Commit:** `OB-83 Mission 5: Build + Korean Test + completion`

---

## COMPLETION REPORT

Save as `OB-83_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **P1 Gap 1 Closed: Domain Agent Runtime Dispatch**
   - ICM Domain Agent now invoked during every calculation
   - NegotiationRequest created at entry, IAP score at exit
   - Terminology mapping translates agent output to domain language
   - Existing calculation results unchanged (additive wrapper)

2. **P1 Gap 2 Closed: AI Assessment Panels**
   - AssessmentPanel component built with three persona modes
   - Wired to admin, manager, and individual dashboards
   - API route uses AIService (not direct Anthropic)
   - Caching per period + data hash prevents redundant AI calls
   - Anti-hallucination: no insight without dataSource
   - Training signals captured per assessment

3. **Commits** — all with hashes
4. **Files created** — every new file
5. **Files modified** — every changed file
6. **Proof gates** — 21 gates, each PASS/FAIL
7. **Korean Test** — expanded output
8. **Co-Founder Briefing v2 Gap Status Update:**

```
Gap: AI Assessment Panels         — CLOSED (OB-83)
Gap: Domain Agent Runtime         — CLOSED (OB-83)
Gap: UX polish                    — OPEN (P2)
Gap: Billing infrastructure       — OPEN (P2)
Gap: Mobile responsiveness        — OPEN (P3)
Gap: Additional domain activations — OPEN (P3)
```

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-83: Domain Agent Runtime + AI Assessment Panels — Close P1 Gaps" \
  --body "## Close Both P1 Gaps From Co-Founder Briefing v2

### Mission 1: ICM Domain Agent Runtime Dispatch
- ICM Domain Agent invoked during every calculation
- NegotiationRequest created at entry, IAP score at exit
- Terminology mapping: structural → domain display terms
- Existing calculation unchanged (additive wrapper)

### Mission 2: AI Assessment Panel Component
- Reusable component with three persona modes (admin/manager/individual)
- Admin: governance, risk, compliance
- Manager: coaching actions, tier proximity, exceptions
- Individual: growth trajectory, tier proximity, leverage
- Anti-hallucination: every insight requires dataSource

### Mission 3: Dashboard Wiring
- Assessment Panel on admin dashboard
- Assessment Panel on manager dashboard
- Assessment Panel on individual dashboard

### Mission 4: Assessment API Route
- Routes through AIService (not direct Anthropic)
- Caching per period + data hash
- Training signal capture
- Anti-hallucination filter

### Proof Gates: 21 — see OB-83_COMPLETION_REPORT.md
### Korean Test: PASS"
```

**Commit:** `OB-83 Final: Completion report + PR`

---

## MAXIMUM SCOPE

5 missions, 21 proof gates. After OB-83, both P1 gaps from the co-founder briefing are closed.

---

*OB-83 — February 22, 2026*
