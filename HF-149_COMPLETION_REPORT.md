# HF-149 COMPLETION REPORT
## Date: March 20, 2026

## ROOT CAUSE
`logAuthEvent` was called from client-side code (auth-service.ts, MFA pages) where `SUPABASE_SERVICE_ROLE_KEY` is not available (server-only env var). The function silently returned at line 38 (`if (!url || !serviceKey) return`). Additionally, `platform_events.tenant_id` is NOT NULL, preventing platform-scope events (VL Admin, tenant_id IS NULL).

## FIX
1. **Two logging paths:** Server-side `logAuthEvent` (middleware, API routes) + client-side `logAuthEventClient` (calls `/api/auth/log-event` API route)
2. **API route:** `/api/auth/log-event` resolves actor_id and tenant_id from cookies server-side, inserts via service role client
3. **tenant_id:** Pass `null` (not sentinel UUID) for platform-scope events
4. **Migration:** `ALTER TABLE platform_events ALTER COLUMN tenant_id DROP NOT NULL` — **MUST BE RUN BY ANDREW IN SQL EDITOR**

## FILES CREATED
| File | Purpose |
|------|---------|
| `web/src/app/api/auth/log-event/route.ts` | Server-side API for client-side auth event logging |
| `web/supabase/migrations/20260320_hf149_platform_events_tenant_nullable.sql` | Migration + RLS policy |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/lib/auth/auth-logger.ts` | Split into logAuthEvent (server) + logAuthEventClient (client) |
| `web/src/lib/supabase/auth-service.ts` | Uses logAuthEventClient for login/logout |
| `web/src/app/auth/mfa/enroll/page.tsx` | Uses logAuthEventClient |
| `web/src/app/auth/mfa/verify/page.tsx` | Uses logAuthEventClient |

## PROOF GATES
| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| PG-4 | Service role client for INSERT | PASS | API route creates service role client: `createClient(url, serviceKey)` |
| PG-7 | 5+ event types wired | PASS | login.success, login.failure, logout, mfa.enroll, mfa.verify.success, mfa.verify.failure, session.expired.idle, session.expired.absolute, permission.denied |
| PG-10 | npm run build exits 0 | PASS | Build clean |

## MIGRATION REQUIRED (Andrew)
Run in Supabase SQL Editor:
```sql
ALTER TABLE platform_events ALTER COLUMN tenant_id DROP NOT NULL;
```
Until this runs, platform-scope events will fail to insert (NOT NULL constraint).

## BUILD OUTPUT
```
npm run build — zero errors
ƒ Middleware                                  76 kB
```
