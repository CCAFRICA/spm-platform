# OB-71 Phase 0: Diagnostic Report

## 1. Auth Flow Audit

### Complete Trace (login → dashboard → logout)

| Step | File | Line | Mechanism |
|------|------|------|-----------|
| Mount login | `web/src/app/login/page.tsx` | ~20 | `clearSupabaseLocalStorage()` removes stale tokens |
| Form submit | `web/src/app/login/page.tsx` | ~45 | Calls `login(email, password)` from useAuth |
| useAuth.login | `web/src/contexts/auth-context.tsx` | ~95 | `signInWithEmail()` → `fetchCurrentProfile()` → `mapProfileToUser()` → redirect |
| Google OAuth | `web/src/app/login/page.tsx` | ~65 | `supabase.auth.signInWithOAuth()` redirect to `/auth/callback` |
| Middleware | `web/src/middleware.ts` | ~30 | Every request: `supabase.auth.getUser()` for validation + token refresh |
| Unauth redirect | `web/src/middleware.ts` | ~80 | Protected path + no user → redirect to `/login?redirect=pathname` |
| Cookie cleanup | `web/src/middleware.ts` | ~60 | `clearAuthCookies()` removes all sb-* and vialuce-tenant-id cookies |
| Fresh redirect | `web/src/middleware.ts` | ~85 | Uses fresh `NextResponse.redirect()` — prevents stale cookie leak (HF-032 fix) |
| Role check | `web/src/middleware.ts` | ~120 | OB-67 workspace-level restricted paths checked against user role |
| AuthShell gate | `web/src/components/layout/auth-shell.tsx` | ~40 | Public paths render directly; protected paths go through AuthShellProtected |
| AuthShellProtected | `web/src/components/layout/auth-shell.tsx` | ~80 | loading→spinner, !authenticated→redirect, authenticated→full shell |
| Persona | `web/src/contexts/persona-context.tsx` | ~50 | Derives from role+capabilities, NOT an auth bypass |
| Logout | `web/src/contexts/auth-context.tsx` | ~150 | signOut + force-clear cookies + sessionStorage + localStorage + hard navigate to /login |

### Public Paths (no auth required)
`/login`, `/signup`, `/landing`, `/auth/callback`, `/api/auth`, `/api/health`, `/api/calculation/run`, `/api/platform/flags`, `/unauthorized`

### Auth Verdict
**Well-hardened, defense-in-depth.** No demo bypass vulnerabilities found. Three layers: middleware (server), AuthShellProtected (client), persona (visual only). DemoPersonaSwitcher is VL Admin only and does not bypass auth.

### Auth Fix Needed
**None.** Auth is solid. No Mission 1 fix required — just verification.

---

## 2. AI Assessment Infrastructure

### Current State

| Component | File | Status |
|-----------|------|--------|
| Assessment API | `web/src/app/api/ai/assessment/route.ts` | EXISTS — direct Anthropic call (not AIService) |
| AssessmentPanel | `web/src/components/design-system/AssessmentPanel.tsx` | EXISTS — reusable glass card component |
| Admin dashboard | `web/src/app/operate/page.tsx` | INTEGRATED — AssessmentPanel with admin persona |
| Manager dashboard | `web/src/app/perform/page.tsx` | INTEGRATED — AssessmentPanel with manager persona |
| Rep dashboard | `web/src/app/insights/page.tsx` | INTEGRATED — AssessmentPanel with rep persona |
| Data loader | `web/src/lib/data/persona-queries.ts` | EXISTS — getRepDashboardData, getManagerDashboardData, getAdminDashboardData |

### Assessment Route Details
- Model: `claude-sonnet-4-20250514`, max_tokens: 300
- 3 system prompts: admin (governance), manager (coaching), rep (personal coach)
- Locale-aware (English/Spanish)
- Signal persistence added in HF-055

### AI Assessment Verdict
Assessment panels already exist and are integrated. Missions 2-4 should enhance them, not rebuild.

---

## 3. Accumulated Gaps Audit

| # | Gap | File:Line | Severity | Status |
|---|-----|-----------|----------|--------|
| 1 | Locale hardcoded to 'es-MX' | `web/src/app/operate/page.tsx:386` | Medium | `formatLabel()` ignores isSpanish toggle |
| 2 | Sync getDispute call | `web/src/app/transactions/disputes/[id]/page.tsx:45` | Low | Uses sync function, should be async |
| 3 | Hardcoded English labels | `web/src/app/transactions/alerts/page.tsx`, `orders/page.tsx` | Low | Admin pages — CC ADMIN ALWAYS ENGLISH rule applies, NOT a bug |
| 4 | Status badges | Multiple pages | None | Working as designed |
| 5 | Navigation signals | `web/src/lib/navigation/navigation-signals.ts` | None | Intentional no-op by design |
| 6 | Sync getSignals deprecated | `web/src/lib/ai/training-signal-service.ts` | None | No external callers, by design |
| 7 | Calculation trigger | `web/src/app/operate/page.tsx:186-207` | None | Properly wired to POST /api/calculation/run |

### Actionable Gaps for Mission 5
1. Fix locale hardcoding in operate/page.tsx `formatLabel()`
2. Fix sync dispute call in disputes/[id]/page.tsx
3. Items 3-7 are NOT bugs — by design or already working

---

## Phase 0 Conclusion

- **Auth**: Solid, no fix needed — Mission 1 reduces to verification-only
- **AI Assessment**: Infrastructure exists — Missions 2-4 enhance existing panels
- **Accumulated gaps**: 2 actionable fixes for Mission 5
- **Proceed**: Mission 1 → verify auth, Mission 2-4 → enhance AI panels, Mission 5 → 2 fixes, Mission 6 → CLT + build
