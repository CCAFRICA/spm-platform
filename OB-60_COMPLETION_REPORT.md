# OB-60 Completion Report

## PUBLIC LANDING, SELF-SERVICE SIGNUP, AND OBSERVATORY REDESIGN

**Date**: 2026-02-18
**Branch**: dev
**Commits**: 9 (3127e65..b2ec061)

---

## Mission Summary

| # | Mission | Phase | Status |
|---|---------|-------|--------|
| 1 | Public Landing Page | 0-1 | COMPLETE |
| 2 | Self-Service Signup Flow | 2-3 | COMPLETE |
| 3 | Observatory Redesign — Metrics + Queue | 4 | COMPLETE |
| 4 | Observatory — Tab Consolidation | 5 | COMPLETE |
| 5 | Observatory — Text Fix + DemoPersonaSwitcher | 6 | COMPLETE |
| 6 | Verification + PR | 7 | COMPLETE |

---

## Commits

| SHA | Phase | Description |
|-----|-------|-------------|
| `3127e65` | — | Commit prompt for traceability |
| `ca73bd9` | 0 | Public landing page — hero, value props, pricing calculator, competitive comparison |
| `21214f4` | 1 | Landing page polish — mobile responsive, SEO meta, smooth scroll |
| `c3057d7` | 2 | Self-service signup — 4-field form, auto-provisioning, welcome card |
| `7fcda5b` | 3 | Login rebrand + signup validation |
| `c0b74c6` | 4 | Observatory redesign — actionable metrics, expanded Operations Queue |
| `d2649f7` | 5 | Observatory — tabs consolidated 6→3, inline styles |
| `7369cb9` | 6 | Observatory text/color fixes, remove DemoPersonaSwitcher |
| `b2ec061` | 6B | Add Log In CTA to landing page top nav (PG-03) |

---

## Files Created

| File | Purpose |
|------|---------|
| `web/src/app/landing/page.tsx` | Public marketing page — hero, value props, competitive comparison, interactive pricing calculator |
| `web/src/app/landing/layout.tsx` | SEO metadata with Open Graph tags |
| `web/src/app/signup/page.tsx` | 4-field self-service signup form with validation |
| `web/src/app/api/auth/signup/route.ts` | Full provisioning chain: auth user → tenant → profile → metering |
| `web/src/components/dashboards/WelcomeCard.tsx` | Guided Proof of Value entry point for new tenants |

## Files Modified

| File | Changes |
|------|---------|
| `web/src/middleware.ts` | Added `/signup`, `/landing` to PUBLIC_PATHS; root `/` redirects unauthenticated to `/landing` |
| `web/src/components/layout/auth-shell.tsx` | Added `/landing`, `/signup` bypass; removed DemoPersonaSwitcher from shell-excluded routes |
| `web/src/app/login/page.tsx` | Brand rebrand (#2D2F8F/#E8A838), added "Start Free" link to /signup |
| `web/src/app/page.tsx` | WelcomeCard display for zero-period tenants |
| `web/src/lib/data/platform-queries.ts` | Extended FleetOverview with MRR, attention items, throughput, AI confidence fields |
| `web/src/app/api/platform/observatory/route.ts` | TIER_MRR lookup, enhanced fleet metrics, severity-coded queue with actions |
| `web/src/components/platform/ObservatoryTab.tsx` | Rewritten: 6 actionable metrics, expanded queue, tenant cards with health dots |
| `web/src/components/platform/PlatformObservatory.tsx` | Consolidated 6 tabs → 3 (Command Center, Intelligence, Revenue) |

---

## Proof Gates

### Phase 0 — Public Landing Page
| # | Gate | Result |
|---|------|--------|
| PG-01 | `/landing` returns 200 unauthenticated | PASS — curl returns 200 |
| PG-02 | Hero contains "VIALUCE" brand and tagline | PASS — h1 "VIALUCE", tagline in #E8A838 |
| PG-03 | Two CTAs present (Start Free + Log In) | PASS — Top nav has Log In + Start Free; hero has Start Free + See Pricing |
| PG-04 | Competitive comparison table renders | PASS — 8-column table with Vialuce vs competitors |

### Phase 1 — Landing Polish
| # | Gate | Result |
|---|------|--------|
| PG-05 | Pricing calculator is interactive | PASS — Entity slider, module checkboxes, experience tier with live total |
| PG-06 | SEO meta tags present | PASS — layout.tsx has title, description, openGraph |

### Phase 2 — Self-Service Signup
| # | Gate | Result |
|---|------|--------|
| PG-07 | `/signup` returns 200 | PASS — curl returns 200 |
| PG-08 | Signup form has 4 fields | PASS — email, password (w/ toggle), org name, entity count |
| PG-09 | API creates auth user + tenant + profile | PASS — route.ts uses createServiceRoleClient, creates all three |
| PG-10 | Duplicate email check exists | PASS — profiles table query before createUser |
| PG-11 | WelcomeCard renders for new tenants | PASS — page.tsx checks availablePeriods.length |

### Phase 3 — Login Rebrand
| # | Gate | Result |
|---|------|--------|
| PG-12 | Login page uses VIALUCE brand colors | PASS — #2D2F8F header, #E8A838 tagline, #020617 background |
| PG-13 | Login page links to /signup | PASS — "Don't have an account? Start Free →" |
| PG-14 | Signup page links to /login | PASS — "Already have an account? Log In" |

### Phase 4 — Observatory Redesign
| # | Gate | Result |
|---|------|--------|
| PG-15 | 6 actionable metrics replace vanity metrics | PASS — MRR, Active/Total, Attention Items, Throughput, Avg Days, AI Confidence |
| PG-16 | Operations Queue has severity-coded borders | PASS — red/amber/blue left borders, action buttons |
| PG-17 | MRR computed from TIER_MRR lookup | PASS — server-side computation in observatory route |
| PG-18 | Tenant cards show health dots and next actions | PASS — green/amber/red dots, lifecycle badges, NEXT_ACTIONS lookup |

### Phase 5 — Tab Consolidation
| # | Gate | Result |
|---|------|--------|
| PG-19 | Exactly 3 tabs (Command Center, Intelligence, Revenue) | PASS — TabId union type has exactly 3 members |
| PG-20 | Gold active tab indicator (#E8A838) | PASS — borderBottom uses #E8A838 for active tab |

### Phase 6 — Text & DemoPersonaSwitcher
| # | Gate | Result |
|---|------|--------|
| PG-21 | No persona switcher on Observatory | PASS — grep count = 0 in select-tenant directory |
| PG-22 | No text below 13px in platform components | PASS — minimum found is 13px (acceptable) |
| PG-23 | No faint text colors (#64748B or dimmer) | PASS — all text colors ≥ #94A3B8 |

### Phase 7 — Build & Verification
| # | Gate | Result |
|---|------|--------|
| PG-24 | `npm run build` passes with zero errors | PASS |
| PG-25 | Dev server responds on localhost:3000 | PASS — 200 on /landing, /signup, /login |
| PG-26 | All changes pushed to dev branch | PASS |

---

## Architecture Decisions

### Public Route Access
- Middleware intercepts unauthenticated root `/` → redirects to `/landing`
- `/landing` and `/signup` added to PUBLIC_PATHS (no auth required)
- AuthShell early-return gate bypasses auth hooks for public routes

### Self-Service Signup Chain
- `createServiceRoleClient()` bypasses RLS for provisioning
- Slug generation: `${baseSlug}-${Date.now().toString(36).slice(-4)}` for uniqueness
- Auto-login via browser Supabase client after API success
- Cleanup: deletes auth user if tenant creation fails

### Observatory Actionable Metrics
- MRR: computed server-side from TIER_MRR lookup × active tenant count
- Active tenants: calculated runs within last 30 days
- Operations Queue: severity from daysSinceCreation/stalledDays thresholds
- All inline styles — no CSS class overrides possible

### Brand Identity
- Deep Indigo: `#2D2F8F` (primary brand)
- Gold: `#E8A838` (accent, taglines, active indicators)
- Background: `#020617` (consistent across login, signup, landing, Observatory)
