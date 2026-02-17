# OB-47: PLATFORM OBSERVATORY — VL ADMIN COMMAND CENTER

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.
7. VL Admin: all users select preferred language. No forced English override.
8. Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic. Every metric on this page MUST read from Supabase. If a table doesn't exist, query what IS available. Never show "—" when data exists.
- **Schema Disconnect:** Writes to one field, reads from another. Read the actual Supabase schema before writing queries.
- **Silent Fallbacks:** Returns zero/null instead of throwing errors — if data is missing, show an explicit empty state with guidance, do NOT silently swallow.
- **Report Burial:** Saves reports in subdirectories instead of project root.
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive.
- **Hardcoded Demo Data:** Every number on this page must come from Supabase queries. No mock data objects. No `const TENANTS = [...]`. Query real data.

---

## CONTEXT

### What This Is
The Platform Observatory is the VL Admin's command center — the first thing the person running ViaLuce sees after login. It replaces the current bare tenant selector (`/select-tenant`) with a full operational surface: fleet health, AI intelligence metrics, billing/usage tracking, infrastructure monitoring, and customer onboarding pipeline.

### Architecture Decision: Route Reuse with Scope-Based Experience
The `/select-tenant` route serves TWO experiences based on user scope:

```
scope_level: 'platform' (VL Admin)  → Full Observatory (5 tabs)
scope_level: 'tenant' (tenant admin) → Simple tenant picker (existing behavior)
scope_level: 'individual' (single-tenant) → Skip entirely, redirect to /
```

### Navigation: Own Tab Bar (Not ChromeSidebar)
The Observatory does NOT use ChromeSidebar. It has its own horizontal tab navigation:
- **Observatory** — Fleet health, operations queue, tenant cards
- **AI Intelligence** — Classification accuracy, training signals, per-tenant AI health
- **Billing & Usage** — Subscriptions, usage meters, cost breakdown, metering events
- **Infrastructure** — Service health, costs, scaling projection
- **Onboarding** — Active onboardings pipeline, launch wizard

ChromeSidebar only appears AFTER entering a tenant context.

### Design Language
- Dark theme: `#0A0E1A` base, `#0F172A` cards, `#1E293B` borders
- Monospace feel for metrics: system-ui for prose, tabular-nums for numbers
- ViaLuce purple-to-indigo gradient for brand accent
- Health indicators: green (#10B981) healthy, amber (#F59E0B) warning, red (#EF4444) critical
- Capacity bars: green <50%, amber 50-80%, red >80%
- No emojis in production components — use lucide-react icons

---

## SUPABASE SCHEMA REFERENCE

Before writing ANY query, read the actual schema. These are the tables you have:

```sql
-- Tenant fleet
tenants: id, name, slug, industry, country, status, settings (JSONB), created_at, updated_at

-- User management
profiles: id, email, display_name, scope_level, tenant_id, capabilities, language, created_at

-- Calculation data
periods: id, tenant_id, label, period_key, start_date, end_date, status, created_at
entities: id, tenant_id, external_id, display_name, attributes (JSONB), created_at
rule_sets: id, tenant_id, name, components (JSONB), population_config, created_at
rule_set_assignments: id, tenant_id, rule_set_id, entity_id, effective_from
calculation_batches: id, tenant_id, rule_set_id, period_id, lifecycle_state, entity_count, total_payout, created_at
calculation_results: id, tenant_id, entity_id, calculation_batch_id, total_payout, components (JSONB), created_at
entity_period_outcomes: id, tenant_id, entity_id, period_key, total_payout, rule_set_outcomes (JSONB), created_at
committed_data: id, tenant_id, entity_id, period_key, data_type, values (JSONB), created_at

-- AI signals (may or may not exist — check before querying)
classification_signals: id, tenant_id, signal_type, confidence, metadata (JSONB), created_at

-- Usage metering (may or may not exist — check before querying)
usage_metering: id, tenant_id, event_type, quantity, metadata (JSONB), recorded_at
```

**IMPORTANT:** Some tables above may not exist yet. In Phase 0, check which tables exist. For tables that don't exist, show "Not yet configured" in the UI, not "—" or 0.

---

## PHASE 0: DIAGNOSTIC — Schema Audit

Before writing any code:

1. Check which Supabase tables actually exist by reading the migration files or querying the schema
2. Read the current `/select-tenant/page.tsx` to understand what it does
3. Read `web/src/contexts/persona-context.tsx` to understand scope detection
4. Read `web/src/lib/data/persona-queries.ts` for query patterns
5. Check how `scope_level` is read from the profiles table
6. Document which tables exist and which don't — this determines what each Observatory tab can show

Report findings. Do NOT change code.

---

## PHASE 1: OBSERVATORY SHELL — Scope-Based Route Split

Modify `/select-tenant/page.tsx` (or create a wrapper):

```
if (userScope === 'platform') → render <PlatformObservatory />
else if (userScope === 'tenant' && multiTenant) → render <TenantPicker /> (existing)
else → redirect to /
```

Create the PlatformObservatory shell component with:
- Top bar: ViaLuce logo + "Platform Observatory" label + user avatar/email
- Tab navigation: 5 tabs (Observatory, AI Intelligence, Billing & Usage, Infrastructure, Onboarding)
- Content area that renders the active tab
- Dark theme matching design language above

The tab components will be built in subsequent phases.

**Proof gate:** VL Admin (platform@vialuce.com) sees Observatory shell with 5 tabs. Tenant admin (admin@opticaluminar.mx) still sees simple tenant picker.

---

## PHASE 2: OBSERVATORY TAB — Fleet Health + Queue + Tenant Cards

### Hero Metrics Row (4 cards)
All from Supabase:
- **Active Tenants:** `SELECT count(*) FROM tenants` + `SELECT count(*) FROM tenants WHERE status = 'active'`
- **Total Entities:** `SELECT count(*) FROM entities` (across all tenants — VL Admin has platform scope in RLS)
- **Calculation Runs:** `SELECT count(*) FROM calculation_batches` (total runs across platform)
- **Periods Active:** `SELECT count(*) FROM periods WHERE status != 'closed'` (or equivalent)

### Operations Queue
Derive from real system state:
- Tenants with no calculation_batches → "Tenant X created [date] — no calculations yet"
- Tenants where latest calculation_batch lifecycle_state has been stuck > 48h → "Tenant X stalled at [state]"
- Any tenant with 0 entities → "Tenant X has no data imported"

If no actionable items exist, show: "All tenants healthy — no items require attention"

### Tenant Fleet Cards
Query: `SELECT * FROM tenants ORDER BY updated_at DESC`

For each tenant, show:
- Name, industry, country (from tenant record)
- Entity count: `SELECT count(*) FROM entities WHERE tenant_id = ?`
- Latest period: `SELECT label, status FROM periods WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`
- Latest lifecycle state: `SELECT lifecycle_state FROM calculation_batches WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`
- Total payout (latest batch): `SELECT total_payout FROM calculation_batches WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`
- User count: `SELECT count(*) FROM profiles WHERE tenant_id = ?`
- Last activity: `updated_at` from tenant record

Clicking a tenant card: call existing `setTenant()` function and redirect to `/`

"+ Launch New Tenant" button (links to Onboarding tab)

**Proof gate:** Shows real tenant data from Supabase. Clicking a tenant card enters that tenant context.

---

## PHASE 3: AI INTELLIGENCE TAB

### Hero Metrics
- **Total Signals:** `SELECT count(*) FROM classification_signals` (if table exists)
- **Average Confidence:** `SELECT avg(confidence) FROM classification_signals` (if table exists)

If `classification_signals` doesn't exist, show a placeholder card: "AI signal tracking not yet configured. Signals will appear here once the AI pipeline captures classification and mapping data."

### Classification Accuracy By Type
If signal data exists, group by signal_type and show average confidence per type.
If not, show the architectural intent:
- Sheet Classification — tracks accuracy of AI sheet type detection
- Field Mapping — tracks accuracy of AI column→semantic field mapping
- Period Detection — tracks accuracy of temporal inference
- Plan Interpretation — tracks accuracy of component/tier extraction

### Per-Tenant AI Health
For each tenant, if signals exist:
- Count signals per tenant
- Average confidence per tenant
- Show as a row: Tenant name | confidence | signal count

**Proof gate:** Tab renders. If signals table exists, shows real data. If not, shows informative "not yet configured" state (NOT blank, NOT "—").

---

## PHASE 4: BILLING & USAGE TAB

### Hero Metrics
Derive from what's available:
- **Total Entities (billable):** `SELECT count(*) FROM entities` grouped by tenant
- **Calculation Runs (this month):** `SELECT count(*) FROM calculation_batches WHERE created_at > first_of_month`
- **Periods Processed:** `SELECT count(*) FROM periods` grouped by tenant

### Per-Tenant Subscription Cards
For each tenant, show:
- Entity count, period count, calculation batch count, user count
- If `usage_metering` table exists: query event counts per tenant
- Action buttons: "Manage Users" (future), "Configure Modules" (future), "Enter Tenant"

### Usage Meters
For each tenant, show capacity-style bars:
- Entities: count / soft limit (set limit as tenant.settings.entity_limit or default 100)
- Calculation runs this month: count / soft limit (default 50)
- Users: count / soft limit (default 10)

Color-code: green <50%, amber 50-80%, red >80%

### Recent Activity Feed
`SELECT * FROM calculation_batches ORDER BY created_at DESC LIMIT 10`
Show: timestamp, tenant name, lifecycle state, entity count, total payout

**Proof gate:** Tab renders with real entity/period/batch counts per tenant. Usage meters show proportional bars.

---

## PHASE 5: INFRASTRUCTURE TAB

### Service Health
Static configuration with live status checks where possible:
- **Supabase:** Show connection status (the fact that queries work = healthy). Show tenant count, total rows.
- **Vercel:** Static "Healthy" (no API access). Show last deploy info if available from env.
- **Anthropic:** Static config. Show API key configured status (env var exists, not the key itself).
- **Cloudflare:** Static "Active" — DNS resolves.
- **Resend:** Static config status.

### Cost Projection Table
Derive from real data:
- Current: X tenants, Y entities, estimated cost
- Show scaling projection: 10/50/100 tenants with per-entity cost compression

### Storage
If queryable: `SELECT count(*) FROM committed_data` as a proxy for data volume
If not: show Supabase plan storage allocation

**Proof gate:** Tab renders. Shows real service config status. No mock/hardcoded numbers where real data is available.

---

## PHASE 6: ONBOARDING TAB

### Active Onboardings
Query tenants where setup appears incomplete:
- No rule_sets → "Awaiting plan import"
- No calculation_batches → "Awaiting first calculation"
- No committed_data → "Awaiting data import"

Show a 6-stage pipeline per tenant: Create Tenant → Invite Users → Import Plan → Import Data → First Calculation → Go Live

Determine stage from data:
- Tenant exists → Stage 1 complete
- Profiles count > 1 → Stage 2 complete
- Rule sets count > 0 → Stage 3 complete
- Committed data count > 0 → Stage 4 complete
- Calculation batches count > 0 → Stage 5 complete
- Calculation batch with lifecycle_state 'POST' or beyond → Stage 6 complete

### Launch New Tenant Section
Show "Create Tenant" as a prominent card with:
- Description of what happens (create tenant, configure modules, invite users)
- Button that (for now) shows a placeholder: "Tenant creation from this UI coming soon. Currently use Supabase seed scripts."
- This is the ONE acceptable placeholder because tenant creation requires server-side operations not yet built

### Recently Launched
Tenants with completed onboarding (all 6 stages) shown as a compact list with health metrics.

**Proof gate:** Tab renders. Shows real onboarding progress derived from Supabase data. Sabor Caribe (if it exists) shows partial progress.

---

## PHASE 7: "BACK TO OBSERVATORY" NAVIGATION

When inside a tenant context (on `/` or any workspace), the VL Admin needs a way back:
- Add a "← Platform" link in the top bar (or ChromeSidebar header) that is ONLY visible when `scope_level === 'platform'`
- Clicking it: clears tenant context (cookie + sessionStorage) and redirects to `/select-tenant`

**Proof gate:** VL Admin can enter tenant → see dashboard → click "← Platform" → return to Observatory.

---

## PHASE 8: VERIFICATION BUILD + CLT

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0  
npm run dev              # Must start without errors
```

### Proof Gates

| Gate | Check | Pass? |
|------|-------|-------|
| PG-1 | VL Admin (platform@vialuce.com) sees Observatory, not bare tenant picker | |
| PG-2 | Tenant admin (admin@opticaluminar.mx) still sees simple tenant picker | |
| PG-3 | Observatory tab: hero metrics show real numbers from Supabase | |
| PG-4 | Observatory tab: tenant fleet cards show entity count, period, lifecycle state | |
| PG-5 | Observatory tab: clicking tenant card enters tenant context, redirects to / | |
| PG-6 | AI Intelligence tab: renders without error (real data or informative placeholder) | |
| PG-7 | Billing tab: per-tenant entity/period/batch counts are real | |
| PG-8 | Billing tab: usage meters show proportional capacity bars | |
| PG-9 | Infrastructure tab: shows service health with real config status | |
| PG-10 | Onboarding tab: shows tenant pipeline stages derived from real data | |
| PG-11 | Onboarding tab: stage progression matches actual tenant data state | |
| PG-12 | "← Platform" link visible to VL Admin inside tenant context | |
| PG-13 | "← Platform" returns to Observatory (clears tenant context) | |
| PG-14 | "← Platform" NOT visible to tenant admin users | |
| PG-15 | No hardcoded mock data anywhere — all numbers from Supabase | |
| PG-16 | Dark theme consistent — all text readable, proper contrast | |
| PG-17 | Tab switching is instant (no page reload) | |
| PG-18 | npx tsc --noEmit exits 0 | |
| PG-19 | npm run build exits 0 | |
| PG-20 | No console errors on any tab | |

---

## FILES TO CREATE

```
web/src/components/platform/PlatformObservatory.tsx    — Shell with tab nav
web/src/components/platform/ObservatoryTab.tsx         — Fleet health + queue + tenant cards
web/src/components/platform/AIIntelligenceTab.tsx      — AI metrics + per-tenant health
web/src/components/platform/BillingUsageTab.tsx        — Subscriptions + usage meters + events
web/src/components/platform/InfrastructureTab.tsx      — Service health + costs + scaling
web/src/components/platform/OnboardingTab.tsx          — Pipeline + launch wizard
web/src/lib/data/platform-queries.ts                   — All cross-tenant Supabase queries
```

## FILES TO MODIFY

```
web/src/app/select-tenant/page.tsx                     — Scope-based split: Observatory vs picker
web/src/components/layout/auth-shell.tsx                — "← Platform" link for VL Admin
```

---

## COMMIT SEQUENCE

```
Phase 0: git commit -m "OB-47 Phase 0: schema audit and diagnostic"
Phase 1: git commit -m "OB-47 Phase 1: Observatory shell with scope-based routing"
Phase 2: git commit -m "OB-47 Phase 2: Observatory tab — fleet health and tenant cards"
Phase 3: git commit -m "OB-47 Phase 3: AI Intelligence tab"
Phase 4: git commit -m "OB-47 Phase 4: Billing and Usage tab"
Phase 5: git commit -m "OB-47 Phase 5: Infrastructure tab"
Phase 6: git commit -m "OB-47 Phase 6: Onboarding tab"
Phase 7: git commit -m "OB-47 Phase 7: back-to-observatory navigation"
Phase 8: git commit -m "OB-47 Phase 8: verification build and completion report"
Final:   gh pr create --base main --head dev --title "OB-47: Platform Observatory — VL Admin Command Center" --body "Replaces bare tenant selector with full Platform Observatory for VL Admin. Five tabs: Fleet Health, AI Intelligence, Billing/Usage, Infrastructure, Onboarding. All data from Supabase. Scope-based routing preserves tenant picker for non-platform users."
```
