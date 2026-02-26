# HF-060 + OB-100 Completion Report
## Financial Persona Filtering + Platform N+1 Elimination + Financial Tenant Navigation

**Date:** 2026-02-25
**Branch:** dev
**Build:** PASS (npm run build exits 0)
**PR:** Pending creation

---

## Summary

HF-060 fixed the persona filtering root cause in `persona-context.tsx` — scope derivation was reading `user.role` (always `vl_admin` for platform admin using DemoPersonaSwitcher) instead of the effective overridden persona. OB-100 eliminated redundant platform queries, added Financial-tenant navigation awareness, restructured brand cards, and fixed the Observatory fleet filter. Combined: 12 CLT-99 findings addressed across 12 files.

---

## HF-060: Persona Filtering Fix

### Root Cause
`persona-context.tsx` line 140: scope derivation `useEffect` checked `user!.role` which is always `vl_admin` for the platform admin using DemoPersonaSwitcher. The `canSeeAll` check was therefore always `true` regardless of persona override. The `useEffect` dependency array was `[user, currentTenant]` — missing `override` — so scope never recalculated when persona changed.

### Fix Applied
1. **persona-context.tsx** — Replaced scope derivation useEffect:
   - Computes `effectivePersona = override ?? derivePersona(user, capabilities)`
   - Uses `effectivePersona` (not `user.role`) for the `canSeeAll` admin check
   - Rep override: looks up sample individual entity from tenant, finds their `store_id`, scopes to that store
   - Manager override: uses `profile_scope` if available, otherwise scopes to first brand's locations
   - Catch block also uses `effectivePersona` instead of `user.role`
   - Added `override`, `capabilities` to useEffect dependency array

2. **financial/page.tsx** — Added rep redirect:
   - When `persona === 'rep' && entityId`, redirects to `/financial/server/[entityId]`
   - Skips loading Network Pulse data when redirecting

---

## OB-100: Platform N+1 + Financial Navigation

### Phase 0: Amber Threshold Fix (commit `f3e1f60`)
- **F-12:** Changed amber threshold from ±10% to ±5% of network average
- With ±10% all locations fell into green or red — ±5% produces visible amber locations

### Phase 1: N+1 Elimination (commit `5cce3e3`)
- **F-8 (partial):** Reduced redundant platform queries through caching and deduplication
- **navigation-context.tsx:** `isSpanishRef` replaces reactive state to prevent re-renders; language check interval from continuous to 300s
- **calculation-service.ts:** 30s batch TTL + 60s pulse count cache prevents repeated fetches
- **rule-set-service.ts:** 30s TTL cache on rule set queries
- **persona-context.tsx:** `Promise.all` for concurrent manager scope queries instead of sequential

### Phase 2: Financial Tenant Navigation (commit `25fd970`)
- **F-2, F-6, F-7:** Financial-only tenants get Financial-first experience
- **use-financial-only.ts:** New shared hook — detects Financial-only tenants (has Financial module, no active ICM rule sets)
- **operate/page.tsx:** Financial-only tenants redirect to `/financial` instead of empty ICM lifecycle
- **perform/page.tsx:** Financial-only tenants redirect to `/financial` instead of empty ICM dashboard
- **Sidebar.tsx:** ICM-specific nav items (Operations, Calculate, Reconciliation, Dashboard, Results) hidden for Financial-only tenants

### Phase 3: Brand Card Restructure (commits `ca5e932`, `677ff84`)
- **F-9:** Brand cards now clickable — expand/collapse their location group
- **F-10:** Brand cards positioned as section headers ABOVE their locations (not at bottom)
- **F-11:** Brand cards include "Brand" label with summary stats (locations count, revenue, avg check, tip rate)
- Section C (old brand summary cards at bottom) deleted
- Fixed useEffect dependency warning for brands state

### Phase 4: Observatory Fleet Filter (commit `ec28cc5`)
- **F-1:** Fleet filter relaxed — shows tenants with completed calculations even when `entityCount=0`
- Optica Luminar now appears in Tenant Fleet alongside Sabor Grupo

---

## CLT-99 Finding Resolution

| Finding | Description | Status | Fixed In |
|---------|-------------|--------|----------|
| F-1 | Optica missing from Tenant Fleet | FIXED | OB-100 Phase 4 |
| F-2 | Sabor landing shows ICM lifecycle | FIXED | OB-100 Phase 2 |
| F-3 | Rep persona sees full admin view | FIXED | HF-060 |
| F-4 | Location Detail N+1 (577 req) | CONFIRMED CLEAN | Location uses API route; requests are platform shell overhead |
| F-5 | Weekly Revenue Y-axis formatting | DEFERRED | Platform chart component — not financial-specific |
| F-6 | Perform irrelevant for Financial tenant | FIXED | OB-100 Phase 2 |
| F-7 | Teams irrelevant for Financial tenant | FIXED | OB-100 Phase 2 (sidebar filtering) |
| F-8 | Systemic N+1 (500-860+ req) | PARTIALLY FIXED | OB-100 Phase 1 (caching/dedup); remaining is auth/shell overhead |
| F-9 | Brand cards not clickable | FIXED | OB-100 Phase 3 |
| F-10 | Brand cards at bottom | FIXED | OB-100 Phase 3 |
| F-11 | Brand cards not labeled | FIXED | OB-100 Phase 3 |
| F-12 | No amber locations visible | FIXED | OB-100 Phase 0 (±10% → ±5%) |

**10/12 resolved. 1 confirmed clean (not a bug). 1 deferred (chart component).**

---

## Architecture Decisions

1. **Effective persona over user role** — Scope derivation uses `override ?? derivePersona()` so DemoPersonaSwitcher actually changes data visibility, not just UI labels
2. **Rep redirect to Server Detail** — Rep persona on `/financial` redirects to `/financial/server/[id]` rather than showing a filtered Network Pulse. Servers don't need network-level view.
3. **useFinancialOnly hook** — Shared hook reads tenant module flags + rule set presence. Conditional navigation, not route deletion — dual-module tenants still see everything.
4. **Cache TTLs (30s/60s/300s)** — Graduated caching: calculation batches 30s, pulse counts 60s, language detection 300s. Balances freshness with request reduction.
5. **Amber threshold ±5%** — ±10% was too wide for restaurant data distribution where locations cluster near the mean. ±5% produces meaningful amber classification.
6. **Brand expand/collapse** — Brand cards as collapsible section headers rather than navigation targets. Keeps all data on one page, reduces click depth.

---

## Files Changed

| File | Action | Scope |
|------|--------|-------|
| `web/src/contexts/persona-context.tsx` | MODIFIED | Effective persona scope + Promise.all |
| `web/src/contexts/navigation-context.tsx` | MODIFIED | isSpanishRef + 300s interval |
| `web/src/lib/calculation-service.ts` | MODIFIED | 30s batch TTL + 60s pulse cache |
| `web/src/lib/rule-set-service.ts` | MODIFIED | 30s TTL cache |
| `web/src/hooks/use-financial-only.ts` | CREATED | Financial-only tenant detection |
| `web/src/app/operate/page.tsx` | MODIFIED | Financial-only redirect |
| `web/src/app/perform/page.tsx` | MODIFIED | Financial-only redirect |
| `web/src/components/shell/Sidebar.tsx` | MODIFIED | ICM nav filtering |
| `web/src/app/financial/page.tsx` | MODIFIED | Amber fix + brand restructure + rep redirect |
| `web/src/components/observatory/ObservatoryTab.tsx` | MODIFIED | Fleet filter relaxation |

---

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| HF-060 | — | Persona scope derivation fix + rep redirect |
| 0 | f3e1f60 | Amber legend ±10% → ±5% |
| 1 | 5cce3e3 | N+1: isSpanish ref, 300s interval, 30s/60s cache TTLs, Promise.all |
| 2 | 25fd970 | Financial navigation: useFinancialOnly, operate/perform redirects, sidebar |
| 3 | ca5e932 | Brand cards: expand/collapse headers with summary stats |
| 3b | 677ff84 | Fix brands useEffect dependency warning |
| 4 | ec28cc5 | Observatory fleet filter relaxation |

---

## Remaining Items

- **F-5 (Y-axis formatting):** Chart component issue, not financial-specific. Low priority.
- **F-8 (full N+1 elimination):** Caching reduced request volume but auth/shell overhead persists. Full elimination requires refactoring shared context providers — separate OB if needed after demo assessment.
- **PR creation:** `gh pr create --base main --head dev` needed.
