# OB-57 Completion Report
## COMMERCIAL PLATFORM — TENANT ONBOARDING, MODULE BILLING, OBSERVATORY

**Branch:** dev
**Date:** 2026-02-17
**Status:** ALL PHASES COMPLETE

---

## Mission Summary

| # | Mission | Phases | Status |
|---|---------|--------|--------|
| 1 | Tenant Creation Wizard | 0–2 | COMPLETE |
| 2 | Module Activation & Billing | 3–4 | COMPLETE |
| 3 | User Provisioning | 5 | COMPLETE |
| 4 | Observatory Visual Fix | 6 | COMPLETE |
| 5 | Verification | 7 | COMPLETE |

---

## Commits

| Hash | Phase | Description |
|------|-------|-------------|
| `8002ff4` | — | Prompt committed for traceability |
| `c7779ca` | 0 | Schema preparation — billing data in settings JSONB |
| `851ebad` | 1–2 | Tenant creation wizard + API |
| `6473515` | 3 | Module activation API + usage calculation |
| `8172db4` | 4 | Billing tab redesign |
| `9b0e824` | 5 | User provisioning — invite flow |
| `9b684da` | 6 | Observatory visual fix — text sizing and contrast |

---

## Phase Details

### Phase 0: Schema Preparation
- Billing data stored in existing `settings` JSONB column (no DDL migration needed)
- Seed script (`scripts/seed-billing.mjs`) provisions all tenants with tier/billing data
- Migration 008 documents intended schema changes

### Phases 1–2: Tenant Creation Wizard + API
- **`lib/billing/pricing.ts`** — Complete pricing engine: 5 tiers, module fees, bundle discounts, experience tiers, `calculateBill()` function
- **`OnboardingTab.tsx`** — 6-step qualifying wizard: Organization → Scale → Use Case → Complexity → Experience → Review
- **`api/platform/tenants/create/route.ts`** — POST endpoint with VL Admin auth, slug uniqueness check, billing data in settings JSONB, metering event

### Phase 3: Module Activation & Usage
- **`api/platform/tenants/[tenantId]/modules/route.ts`** — PATCH endpoint for module toggle, recalculates bundle discount + monthly total
- **`lib/billing/usage.ts`** — `getTenantUsage()` reads MCP/MTP/AI/user metrics from usage_metering table

### Phase 4: Billing Tab Redesign
- **`BillingUsageTab.tsx`** — Fleet billing overview (MRR, ARR, entities, calc runs), expandable per-tenant detail, module toggle switches, usage bars (green/amber/red), metering events grid

### Phase 5: User Provisioning
- **`PostCreationScreen`** component in OnboardingTab — inline invite form with email, display name, role (Admin/Manager/Rep), language (es/en/pt)
- Wired to existing `/api/platform/users/invite` endpoint
- Shows invited users list, "Done — Back to Pipeline" button

### Phase 6: Observatory Visual Fix
Applied DS-001 text hierarchy across ALL 6 Observatory tabs:
- Labels: `#94A3B8`, 13px minimum, uppercase
- Body text: `#E2E8F0`, 14px minimum
- Hero metrics: `#F8FAFC`, 28px bold
- Secondary text: `#94A3B8`, 13px
- Tab headings with descriptions on every tab
- Zero `10px` text remaining
- Zero `text-[10px]` Tailwind classes remaining

---

## Proof Gates

| # | Gate | Result |
|---|------|--------|
| 1 | "Coming Soon" in platform components | **0** |
| 2 | Service role client in admin API routes | **5 files** |
| 3 | `fontSize: 10px` in platform components | **0** |
| 4 | Tab headings in all 6 tabs | **6/6** |
| 5 | Pricing engine exists | **132 lines** |
| 6 | Tenant create API exists | **125 lines** |
| 7 | Module toggle API exists | **105 lines** |
| 8 | Usage calculation exists | **40 lines** |
| 9 | `text-[10px]` remaining | **0** |
| 10 | TypeScript zero errors | **PASS** |
| 11 | Clean build | **PASS** |
| 12 | localhost:3000 responds | **307** (redirect to login) |

---

## Files Created/Modified

### New Files
- `web/src/lib/billing/pricing.ts` — Pricing engine
- `web/src/lib/billing/usage.ts` — Usage calculation
- `web/src/app/api/platform/tenants/create/route.ts` — Tenant creation API
- `web/src/app/api/platform/tenants/[tenantId]/modules/route.ts` — Module toggle API
- `web/supabase/migrations/008_add_billing_columns.sql` — Schema documentation
- `web/scripts/seed-billing.mjs` — Billing seed script

### Modified Files
- `web/src/components/platform/OnboardingTab.tsx` — Full rewrite (6-step wizard + post-creation)
- `web/src/components/platform/BillingUsageTab.tsx` — Full rewrite (fleet billing)
- `web/src/components/platform/ObservatoryTab.tsx` — Visual fix (text sizing/contrast)
- `web/src/components/platform/AIIntelligenceTab.tsx` — Visual fix
- `web/src/components/platform/InfrastructureTab.tsx` — Visual fix
- `web/src/components/platform/IngestionTab.tsx` — Visual fix
- `web/src/components/platform/PlatformObservatory.tsx` — Header badge text fix

---

## Architecture Decisions

1. **Settings JSONB over DDL columns** — Billing data stored in `settings.billing`, `settings.tier`, `settings.experience_tier` within existing JSONB column. No database migration needed.
2. **Service role client for admin ops** — All platform API routes use `createServiceRoleClient()` to bypass RLS for cross-tenant operations.
3. **Existing invite API reused** — Phase 5 wires into existing `/api/platform/users/invite` endpoint rather than creating a new one.
4. **Inline styles as primary strategy** — All text sizing uses inline `style={{}}` for precise control, no Tailwind text-size classes for critical readability.
