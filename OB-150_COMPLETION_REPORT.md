# OB-150: Production Infrastructure Hardening — Completion Report

## Status: COMPLETE
**Date:** 2026-03-03
**PR:** #163 (merged to main)
**Branch:** dev → main

---

## Phase 1: Vercel Function Timeouts ✅

**Problem:** Plan import on vialuce.ai fails with ERR_CONNECTION_CLOSED — serverless functions timing out before AI processing completes.

**Fix:** Set `maxDuration=300` (Vercel Pro maximum) and `runtime='nodejs'` on all 7 critical API routes:

| Route | Before | After |
|---|---|---|
| `/api/import/sci/execute` | 120s | **300s** |
| `/api/import/sci/analyze` | _(none)_ | **300s** |
| `/api/import/sci/analyze-document` | _(none)_ | **300s** |
| `/api/calculation/run` | _(none)_ | **300s** |
| `/api/import/commit` | 120s | **300s** |
| `/api/interpret-plan` | 60s | **300s** |
| `/api/import/prepare` | _(none)_ | **60s** |

**Evidence:** Build clean. All routes export both `runtime` and `maxDuration`.

---

## Phase 2: HTTP 413 Body Size Limit ✅

**Problem:** Large plan documents (PPTX/PDF sent as base64) hit Next.js default body size limits.

**Fix:** Added to `next.config.mjs`:
```javascript
experimental: {
  serverActions: {
    bodySizeLimit: '20mb',
  },
},
```

**Note:** File-based import (HF-047) already uses Supabase Storage signed URLs to bypass Vercel's 4.5MB limit. This fix covers the remaining Server Actions path (plan document interpretation via base64).

---

## Phase 3: N+1 Query Reduction ✅

**Problem:** PersonaContext fires 7 sequential Supabase queries on every navigation — scope rarely changes during a session.

**Fix:** Added module-level scope cache with 5-minute TTL:
- Cache key: `${userId}:${tenantId}:${persona}`
- Cache hit → 0 queries (instant return from `fetchScope`)
- Cache invalidated on user/tenant/persona change (effect deps)
- Cache writes at all 8 exit points in `fetchScope()`

**Baseline context providers (from Phase 0C diagnostic):**
- `session-context.tsx` — Already optimized (Promise.all batch)
- `tenant-context.tsx` — Already has tenantConfigCache
- `operate-context.tsx` — Already batches plans+periods
- `persona-context.tsx` — **Fixed** (was worst offender, 7 sequential → 0 on cache hit)

---

## Phase 4: Deploy to Production ✅

- PR #163 merged to main
- Vercel auto-deploys from main branch

---

## Commits (3 phases)
```
90f4124 OB-150 Phase 3: N+1 reduction — PersonaContext scope caching
026287a OB-150 Phase 2: HTTP 413 -- body size limit 20MB for server actions
1f28e09 OB-150 Phase 1: Vercel function timeout -- maxDuration 300s on all AI routes
```
