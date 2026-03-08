# HF-106 Completion Report: Duplicate Content Unit Elimination + PeriodProvider Removal

**3 sheets = 3 content units, always. Zero period API calls on import path.**

---

## Summary

Fixed two production failures:
1. **Duplicate CU**: Import proposal showed 4 content units for a 3-sheet file, causing unique constraint violations on committed_data insert. Root cause: `analyzeSplit()` created `::split` entries when round2Scores gap was small.
2. **Stale /api/periods**: PeriodProvider in auth-shell.tsx triggered `/api/periods` fetch on every route, including import.

### Files Changed
| File | Action |
|------|--------|
| `web/src/app/api/import/sci/analyze/route.ts` | MODIFIED — Level 1 score capping, dedup safety net, [SCI-PROPOSAL] log |
| `web/src/components/layout/auth-shell.tsx` | MODIFIED — Remove PeriodProvider from shell |
| `web/src/app/page.tsx` | MODIFIED — Add PeriodProvider wrapping |
| `web/src/app/perform/page.tsx` | MODIFIED — Add PeriodProvider wrapping |

### Files NOT Changed (preserved)
| File | Reason |
|------|--------|
| `web/src/lib/sci/resolver.ts` | Level 2 — UNCHANGED |
| `web/src/lib/sci/agents.ts` | Agent scoring — UNCHANGED |
| `web/src/lib/sci/negotiation.ts` | analyzeSplit — UNCHANGED (dedup applied at route level) |
| `web/src/lib/sci/hc-pattern-classifier.ts` | Level 1 — UNCHANGED |
| `web/src/contexts/period-context.tsx` | usePeriod() safe fallback — UNCHANGED |

---

## Evidentiary Gates

### EG-1: 3 Sheets = 3 Content Units

```
=== CLASSIFICATION RESULTS ===
Sheet: Plantilla => transaction @ 31%
Sheet: Datos_Rendimiento => transaction @ 90%
Sheet: Datos_Flota_Hub => transaction @ 90%

[SCI-DEDUP] Removed split duplicate for Plantilla (entity)
[SCI-PROPOSAL] 3 content units for 3 sheets
```

Before fix: 4 CUs (Plantilla appeared twice — transaction@31% + entity@28% split).
After fix: 3 CUs. The `::split` entry for Plantilla is filtered out.

### EG-2: Dedup Safety Net Code

```typescript
// HF-106: Dedup safety net — one sheet = one content unit, always.
const fileContentUnits = buildProposalFromState(state, fileSheets)
  .filter(cu => {
    if (cu.contentUnitId.includes('::split')) {
      console.log(`[SCI-DEDUP] Removed split duplicate for ${cu.tabName} (${cu.classification})`);
      return false;
    }
    return true;
  });
```

### EG-3: Level 1 Score Capping

```typescript
// HF-106: Cap competing agents to prevent analyzeSplit from splitting
score.confidence = Math.min(score.confidence, 0.10);
```

When Level 1 fires, non-winner round2Scores are capped to 0.10. This prevents `analyzeSplit` from creating splits on Level-1-matched sheets (gap becomes 0.80+, well above 0.25 threshold).

### EG-4: PeriodProvider Architecture

**Before (auth-shell.tsx):**
```typescript
const isImportRoute = pathname.startsWith('/operate/import') || pathname.startsWith('/data/import');
return (
  <PersonaProvider>
    {isImportRoute ? shell : <PeriodProvider>{shell}</PeriodProvider>}
  </PersonaProvider>
);
```

**After (auth-shell.tsx):**
```typescript
return (
  <PersonaProvider>
    {shell}
  </PersonaProvider>
);
```

**After (page.tsx, perform/page.tsx):**
```typescript
export default function DashboardPage() {
  return (
    <PeriodProvider>
      <DashboardContent />
    </PeriodProvider>
  );
}
```

Pages that need periods wrap themselves. Import routes never mount PeriodProvider.

### EG-5: usePeriod() Safe Fallback

```typescript
// period-context.tsx (UNCHANGED)
export function usePeriod(): PeriodContextValue {
  const context = useContext(PeriodContext);
  return context ?? EMPTY_PERIOD_CONTEXT;
}
```

Navbar and other shell components that call `usePeriod()` get empty defaults on routes without PeriodProvider. Zero crashes.

### EG-6: Zero /api/periods Calls

```bash
grep -c "api/periods" /tmp/hf106-dev.log
# Output: 0
```

### EG-7: resolver.ts, agents.ts, negotiation.ts Unchanged

```bash
git diff HEAD~2..HEAD -- web/src/lib/sci/resolver.ts
# Output: EMPTY

git diff HEAD~2..HEAD -- web/src/lib/sci/agents.ts
# Output: EMPTY

git diff HEAD~2..HEAD -- web/src/lib/sci/negotiation.ts
# Output: EMPTY
```

### EG-8: Build Output

```
f Middleware                                  75 kB
○  (Static)   prerendered as static content
f  (Dynamic)  server-rendered on demand
Exit code: 0
```

---

## Root Cause Analysis

### Failure 1: Duplicate CU
`buildProposalFromState()` calls `analyzeSplit()` which creates `::split` entries when:
- Score gap between top 2 agents is <= 25%
- Runner-up agent has >= 30% of field affinities

For Plantilla: transaction@31% vs entity@28% (gap=3%). Both conditions met. Split created a second CU mapping to the same sheet, which caused unique constraint violations when both tried to write committed_data rows.

**Fix layers:**
1. Level 1 score capping (preventive): When HC pattern fires, cap non-winner scores to 0.10, making gap > 0.80
2. Dedup safety net (defensive): Filter ALL `::split` entries from proposal. One sheet = one content unit.

### Failure 2: /api/periods on import
PeriodProvider mounted in auth-shell.tsx wrapped the entire app shell. When user navigated to `/operate` (before reaching `/operate/import`), PeriodProvider mounted and fetched `/api/periods`. The conditional-mounting approach (`isImportRoute` check) was insufficient because periods loaded on `/operate` before user clicked import.

**Fix:** Remove PeriodProvider from shell entirely. Pages that need it (`/`, `/perform`) wrap themselves. `usePeriod()` returns safe empty defaults elsewhere.
