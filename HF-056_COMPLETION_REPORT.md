# HF-056: Tenant User Password Reset + API Auth Fix

## What Was Fixed
1. Reset passwords for 6 tenant persona users to `demo-password-VL1` via Supabase admin API
2. Updated `demo_users` passwords in tenant settings (Optica Luminar + Velocidad Deportiva) to match
3. Middleware returns 401 JSON for unauthenticated API requests (was 307 redirect)

## Root Cause
Tenant user passwords in Supabase auth did not match the passwords stored in tenant `settings.demo_users`. The DemoPersonaSwitcher component was configured with different passwords (demo-password-OL1/OL2/OL3, demo-password-VD1/VD2/VD3) than what was set in auth.users. Password reset aligned all credentials to `demo-password-VL1`.

## UAT Re-Verification

```
=== UAT RE-VERIFICATION ===

--- Test 1: All users authenticate ---
platform@vialuce.com                     PASS
admin@opticaluminar.mx                   PASS
gerente@opticaluminar.mx                 PASS
vendedor@opticaluminar.mx                PASS
admin@velocidaddeportiva.mx              PASS
gerente@velocidaddeportiva.mx            PASS
asociado@velocidaddeportiva.mx           PASS

7/7 authenticated

--- Test 2: API returns 401 not 307 ---
{"error":"Unauthorized","message":"Authentication required"}
HTTP 401 (disputes)
{"error":"Unauthorized","message":"Authentication required"}
HTTP 401 (signals)

--- Test 3: Public API still works ---
{"error":"Missing required fields: tenantId, periodId, ruleSetId"}
HTTP 400 (calculation/run — public path unaffected)

--- Test 4: Login page renders ---
HTTP 200

--- Test 5: Build clean ---
npm run build: SUCCESS
88.5 kB shared JS, 74.8 kB middleware
```

## Profile → Tenant → Role Mapping (Verified)

```
Email                                    Role            Tenant
--------------------------------------------------------------------------------
admin@opticaluminar.mx                   admin           Optica Luminar
gerente@opticaluminar.mx                 manager         Optica Luminar
vendedor@opticaluminar.mx                viewer          Optica Luminar
admin@velocidaddeportiva.mx              admin           Velocidad Deportiva
gerente@velocidaddeportiva.mx            manager         Velocidad Deportiva
asociado@velocidaddeportiva.mx           viewer          Velocidad Deportiva
platform@vialuce.com                     vl_admin        (platform-level)
```

## Findings Resolved
- **F-06 (BLOCKING)**: All 7 users now authenticate with `demo-password-VL1`
- **F-08 (MEDIUM)**: API routes return 401 JSON for unauthenticated requests

## Files Modified
- `web/src/middleware.ts` — Added API 401 response for unauthenticated `/api/*` requests
- Supabase auth.users — 6 passwords reset via admin API
- Supabase tenants.settings — demo_users passwords updated for 2 tenants
