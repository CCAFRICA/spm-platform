# HF-054 Diagnostic — Schema Alignment Audit

## 1. Tables Referenced in Codebase (26 tables)

agent_inbox, audit_logs, calculation_batches, calculation_results, calculation_traces,
classification_signals, committed_data, entities, entity_period_outcomes,
entity_relationships, import_batches, imports, ingestion_events, ingestion-raw,
period_entity_state, periods, platform_events, platform_settings, profile_scope,
profiles, reassignment_events, rule_set_assignments, rule_sets, tenants,
usage_metering, user_journey

## 2. profiles Table — Reported Schema

User-reported actual columns: id, tenant_id, auth_user_id, display_name, email, role,
capabilities, locale, avatar_url, created_at, updated_at

database.types.ts additionally defines: entity_id, scope_override, scope_level, settings, status

## 3. CONFIRMED Schema Mismatches

### 3A: profiles.entity_id — DOES NOT EXIST (P0)

**File:** `web/src/contexts/persona-context.tsx:101`
```typescript
.select('id, entity_id')  // ← entity_id doesn't exist → HTTP 400
```
**Impact:** Fires on EVERY page load (context provider). Creates error loop.
**Usage:** Sets entityId in context, used as fallback scope for non-admin users.
**Fix:** Remove entity_id from select. If profile→entity linkage needed, query entities
table using `profile_id` column (entities.profile_id → profiles.id, not the reverse).

### 3B: profiles.scope_level — WRITES IN 3 PLACES

| File | Line | Value |
|------|------|-------|
| `api/auth/signup/route.ts` | 139 | `scope_level: 'tenant'` |
| `api/platform/users/invite/route.ts` | 150 | `scope_level: template.scope` |
| `api/admin/tenants/create/route.ts` | 149 | `scope_level: 'tenant'` |
| `lib/supabase/database.types.ts` | 155,173,188 | Type definitions |

**Status:** User reports column doesn't exist. If true, INSERT operations silently fail
or return errors on profile creation. However, types.ts defines it — needs DB verification.

### 3C: calculation_batches.lifecycle_state — 70+ REFERENCES

Referenced in: period-context.tsx, my-compensation/page.tsx, calculate/page.tsx,
operate/pay/page.tsx, api/periods/route.ts, api/platform/observatory/route.ts,
api/calculation/run/route.ts, lifecycle-service.ts, compensation-clock-service.ts,
cycle-service.ts, queue-service.ts, calculation-service.ts, approval-service.ts,
platform-queries.ts, page-loaders.ts, persona-queries.ts, database.types.ts

**Status:** With 70+ consistent references across the entire codebase, this is almost
certainly a real column. The reported 406 error may be RLS-related, not schema-related.

## 4. Platform API Routes — Profile Query Audit

ALL platform API routes already use correct patterns:
- `.eq('auth_user_id', user.id)` ✓ (not `.eq('id', user.id)`)
- `.select('role')` ✓ (not `scope_level`)
- `role === 'vl_admin'` ✓ (not `scope_level === 'platform'`)

Fixed in HF-053 Phase 0-PRE: `/api/platform/settings/route.ts`

**The Observatory Settings 403 reported in the prompt may already be resolved.**

## 5. Period Detection — File Audit

| Path | Content |
|------|---------|
| `web/src/app/data/import/enhanced/page.tsx` | CANONICAL — has all HF-053 changes (period-detector, fullSheetData, year/month targets) |
| `web/src/app/operate/import/enhanced/page.tsx` | RE-EXPORT: `export { default } from '@/app/data/import/enhanced/page'` |
| Sidebar link | Points to `/data/import/enhanced` |
| Command palette, workspace-config | Points to `/operate/import/enhanced` |

**Both routes serve the same component.** HF-053 edited the correct canonical file.

## 6. Entity Linkage Architecture

The entities table has `profile_id: string | null` — the FK goes FROM entities TO profiles.
There is NO `entity_id` on profiles. The correct query for profile→entity:
```typescript
const { data: entity } = await supabase
  .from('entities')
  .select('id')
  .eq('profile_id', profileId)
  .eq('tenant_id', tenantId)
  .maybeSingle();
```

## 7. Fix Plan

1. **persona-context.tsx** — Remove entity_id from profiles select. Query entities table
   for profile→entity linkage if needed.
2. **database.types.ts** — Remove entity_id from profiles type if confirmed not in DB.
   Keep scope_level pending DB verification.
3. **Settings API** — Already fixed. Verify it works.
4. **lifecycle_state** — Likely valid column. Investigate 406 if it persists.
5. **Period detection** — Already in correct file. Verify on localhost.
