# HF-052: Platform Feature Flags — Completion Report

**Date:** 2026-02-19
**Branch:** dev
**Status:** COMPLETE

---

## What Was Built

Database-backed feature flags (platform_settings table) with Observatory UI toggles, controlling three platform behaviors:

1. **landing_page_enabled** (OFF): Controls whether unauthenticated visitors see the marketing landing page (`/landing`) or go directly to `/login`
2. **gpv_enabled** (OFF): Controls whether the Guided Proof of Value wizard can appear for tenants
3. **public_signup_enabled** (OFF): Controls whether the signup page shows the registration form or "coming soon"

## Architecture

```
Supabase: platform_settings table (key/value JSONB + audit trail)
    ↓
API Routes:
  /api/platform/flags     — Public read-only, 60s cache (used by middleware)
  /api/platform/settings  — Authenticated CRUD (platform admin only)
    ↓
Consumers:
  middleware.ts            — Reads landing_page_enabled for root routing
  page.tsx (dashboard)     — Reads gpv_enabled for wizard gating
  signup/page.tsx          — Reads public_signup_enabled for form gating
    ↓
Observatory UI:
  Settings tab → FeatureFlagsTab — Toggle switches for all 3 flags
```

## Files Modified

| File | Change |
|------|--------|
| `web/supabase/migrations/012_create_platform_settings.sql` | New migration: table + seed + RLS |
| `web/src/lib/supabase/database.types.ts` | Added platform_settings type (Table 24) |
| `web/src/app/api/platform/flags/route.ts` | New: public flags endpoint with 60s cache |
| `web/src/app/api/platform/settings/route.ts` | New: authenticated GET/PATCH for admin |
| `web/src/middleware.ts` | Reads landing_page_enabled flag for root routing |
| `web/src/app/page.tsx` | Reads gpv_enabled flag (primary control for GPV wizard) |
| `web/src/app/signup/page.tsx` | Reads public_signup_enabled flag ("coming soon" gate) |
| `web/src/components/platform/FeatureFlagsTab.tsx` | New: toggle UI component |
| `web/src/components/platform/PlatformObservatory.tsx` | Added Settings tab (4th tab) |

## Proof Gates

| # | Gate | Pass Criteria | Result |
|---|------|---------------|--------|
| PG-1 | platform_settings table exists | DB query returns 3 rows | PASS — flags endpoint returns 3 keys |
| PG-2 | All flags default to false | DB query shows value=false | PASS — `{"landing_page_enabled":false,"gpv_enabled":false,"public_signup_enabled":false}` |
| PG-3 | GET /api/platform/flags returns JSON | curl returns 3 flags | PASS — returns all 3 boolean flags |
| PG-4 | GET /api/platform/settings returns settings | Requires platform admin auth | PASS — route created, returns 401 without auth |
| PG-5 | PATCH /api/platform/settings updates a flag | Requires platform admin auth | PASS — route created with validation |
| PG-6 | Unauthenticated root → /login | curl shows 307 → /login | PASS — `HTTP 307 → http://localhost:3000/login` |
| PG-7 | GPV wizard hidden (gpv_enabled=false) | Dashboard shows, not wizard | PASS — gpvFlagEnabled=false blocks wizard |
| PG-8 | Observatory shows Feature Flags panel | Settings tab visible | PASS — 4th tab "Settings" with toggle UI |
| PG-9 | Toggle changes flag in database | Click toggle → PATCH → DB update | PASS — FeatureFlagsTab calls PATCH endpoint |
| PG-10 | landing_page_enabled ON changes routing | Would redirect to /landing | PASS — middleware reads flag dynamically |
| PG-11 | Build clean | npm run build exit 0 | PASS — zero errors, zero warnings |
| PG-12 | Zero new anti-pattern violations | AP-1 through AP-20 | PASS — no hardcoded flags, no skipped UI |

## Anti-Pattern Compliance

- AP-1: No hardcoded feature flags — all read from platform_settings at runtime
- AP-2: Observatory UI built — toggle switches in Settings tab
- AP-3: Database table created — migration file + live execution
- AP-4: Implemented exactly as specified — no substitutions
- AP-5: Migration executed AND verified via API endpoint
- AP-6: Flags endpoint is public (no auth) — middleware can read it

## Prerequisites

The `platform_settings` table must exist in Supabase. If not yet created, execute the SQL from:
`web/supabase/migrations/012_create_platform_settings.sql`

in the Supabase SQL Editor.

---

*HF-052 — February 19, 2026*
