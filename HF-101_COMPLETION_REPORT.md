# HF-101 COMPLETION REPORT

## Commits
- `541d411` — Prompt committed
- `042a606` — Phase 1: Architecture decisions
- `0213f31` — Phase 2: All three fixes implemented

## Files Changed
| File | Changes |
|------|---------|
| `web/src/lib/sci/agents.ts` | +34/-5 — HC Override: reference floor 0.80 + transaction penalty -0.30 + R2 temporal suppression |
| `web/src/lib/sci/synaptic-ingestion-state.ts` | +9/-1 — R2 temporal_repeat_conviction suppressed when HC reference_key active |
| `web/src/contexts/period-context.tsx` | +12/-8 — Remove isImportRoute hack, usePeriod returns safe defaults |
| `web/src/components/layout/auth-shell.tsx` | +10/-4 — PeriodProvider conditionally not mounted on import |
| `web/src/lib/ai/types.ts` | +2/-1 — Added document_analysis task type |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | +30/-1 — document_analysis system prompt + user prompt + PDF support |
| `web/src/app/api/import/sci/analyze-document/route.ts` | +116/-102 — Full rewrite to use AIService |

## Evidentiary Gates

### EG-1: Zero Raw AI Calls Outside AIService
**Grep command:** `grep -rn "api.anthropic.com" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v ai-service | grep -v "providers/"`
**Output:**
```
(no output — zero results)
```
**Conclusion:** All AI calls now route through AIService. The only `api.anthropic.com` reference is inside `anthropic-adapter.ts`, which is internal to AIService.

### EG-2: Zero /api/periods on Import Path
**Component tree evidence:**
```
auth-shell.tsx:197 — const isImportRoute = pathname.startsWith('/operate/import');
auth-shell.tsx:209 — {isImportRoute ? shell : <PeriodProvider>{shell}</PeriodProvider>}
```
PeriodProvider is architecturally REMOVED from the import route tree. When on `/operate/import`, PeriodProvider never mounts, never calls loadPeriods, never makes GET /api/periods.

**period-context.tsx cleanup:**
```
grep -n "isImportRoute|pathname" period-context.tsx
(no output — zero references)
```
The isImportRoute hack is completely removed from PeriodContext. The architectural solution is in auth-shell.tsx instead.

**usePeriod safety:**
```typescript
// period-context.tsx
const EMPTY_PERIOD_CONTEXT: PeriodContextValue = {
  activePeriodKey: '',
  activePeriodId: '',
  activePeriodLabel: '',
  availablePeriods: [],
  setActivePeriod: () => {},
  isLoading: false,
};

export function usePeriod(): PeriodContextValue {
  const context = useContext(PeriodContext);
  return context ?? EMPTY_PERIOD_CONTEXT;
}
```
Navbar and other components that call usePeriod() get safe empty defaults on the import route instead of crashing.

**Conclusion:** Zero period API calls on import path. Architectural solution — not a conditional hack.

### EG-3: HC Override Authority in Scoring
**Code evidence — Reference Agent floor when HC identifies reference_key (agents.ts:288-327):**
```typescript
const highConfRefKeys = Array.from(interpretations.values()).filter(
  interp => interp.columnRole === 'reference_key' && interp.confidence >= 0.80
);

if (highConfRefKeys.length >= 1) {
  // HC OVERRIDE AUTHORITY (Decision 108)
  const overrideFloor = 0.80;
  if (reference.confidence < overrideFloor) {
    reference.confidence = overrideFloor;
    reference.signals.push({
      signal: 'hc_override_reference_floor',
      weight: overrideFloor - oldConf,
      evidence: `Decision 108 HC Override: reference_key at >=0.80 confidence`,
    });
  }

  // Penalize transaction
  if (transaction) {
    transaction.confidence = Math.max(0, transaction.confidence - 0.30);
    transaction.signals.push({
      signal: 'hc_override_reference_contradict_tx',
      weight: -0.30,
      evidence: `Decision 108: HC reference_key overrides structural temporal/event signals`,
    });
  }
}
```

**R2 temporal suppression (synaptic-ingestion-state.ts:394-420):**
```typescript
const hasHCReferenceOverride = profile.headerComprehension &&
  Array.from(profile.headerComprehension.interpretations.values()).some(
    interp => interp.columnRole === 'reference_key' && interp.confidence >= 0.80
  );

// Temporal repeat conviction suppressed when HC reference_key active
if (transaction && target && hasTemporal && repeatRatio > 1.5 && !hasHCReferenceOverride) {
```

**Expected scoring outcome for Datos_Flota_Hub:**
- Before HF-101: transaction@98%, reference@50% (HC ignored)
- After HF-101: reference@80% (floor), transaction@~70% (structural 1.0 - 0.30 penalty, no R2 temporal boost)
- Winner: reference

**Conclusion:** Decision 108 HC Override now has authority. reference_key at >=0.80 sets a floor and penalizes competing agents.

### EG-4: Plan Interpretation Uses AIService
**Code evidence — AIService import in analyze-document/route.ts:**
```typescript
import { getAIService } from '@/lib/ai/ai-service';
// ...
const aiService = getAIService();
const aiResponse = await aiService.execute({
  task: 'document_analysis',
  input: aiInput,
  options: { maxTokens: 4096, responseFormat: 'json' },
}, true, { tenantId });
```

**Removed code evidence — no raw fetch:**
```
grep "ANTHROPIC_API_URL|api.anthropic.com" analyze-document/route.ts
(no output — removed)
```

**Conclusion:** analyze-document/route.ts now uses AIService. Gets retry (3 attempts), JSON repair (3-layer), cost tracking, and provider abstraction for free.

### EG-5: Build Clean
**Build output (Phase 2):**
```
 Generating static pages (191/191)
 Collecting build traces ...
```
Exit code: 0

### EG-6: max_tokens Verification
```
header-comprehension.ts:76: maxTokens: 8192
analyze-document/route.ts:136: maxTokens: 4096
anthropic-adapter.ts:644: max_tokens: request.options?.maxTokens || 8192
```
All AI calls have maxTokens >= 4096. Default is 8192.

## Anti-Pattern Compliance
- **AP-17 (dual code paths):** Zero raw AI calls outside AIService (grep evidence in EG-1)
- **AP-25 (Korean Test):** HC Override uses column role (structural + LLM), not field names. No field-name matching in scoring changes.
- **Decision 92:** Zero period calls on import path — PeriodProvider not mounted (auth-shell.tsx evidence in EG-2)
- **Decision 108:** HC Override code + R2 suppression (agents.ts + synaptic-ingestion-state.ts evidence in EG-3)

## Issues Found
- None. All three fixes implemented, build clean, structural verification passes.
- Live import verification (Datos_Flota_Hub classification) requires production deployment — documented in PV section.
