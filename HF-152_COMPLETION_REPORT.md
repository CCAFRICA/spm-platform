# HF-152 COMPLETION REPORT
## Date: March 20, 2026

## ROOT CAUSE
MFA enforcement in middleware.ts line 229 redirects ALL authenticated AAL1 requests to `/auth/mfa/verify`. This includes `POST /api/auth/log-event`, which means `auth.login.success` is NEVER logged — the POST gets 307'd to the MFA page.

## FIX
One line: exempt `/api/auth/log-event` from the MFA redirect check.
```typescript
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
```

## PROOF GATES
| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| PG-1 | Middleware exempts log-event | PASS | `!pathname.startsWith('/api/auth/log-event')` at line 233 |
| PG-2 | MFA enforcement still applies | PASS | Check still exists for all other routes |
| PG-3 | Comment explains exemption | PASS | HF-152 + SOC 2 CC6 rationale |
| PG-4 | Only middleware.ts modified | PASS | 1 file, 5 insertions, 1 deletion |
| PG-5 | npm run build exits 0 | PASS | Build clean |

## BUILD OUTPUT
```
npm run build — zero errors
ƒ Middleware                                  76.1 kB
```
