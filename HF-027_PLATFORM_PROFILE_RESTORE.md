# HF-027: Restore Platform User Profile After Ghost Tenant Cleanup

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## CONTEXT

HF-026 Phase 1 removed the ghost tenant `a0000000-0000-0000-0000-000000000001` (RetailCo MX) from Supabase. This likely cascade-deleted or orphaned the `platform@vialuce.com` user's profile row, because the profile was associated with that tenant ID.

**Production symptom:** Login at vialuce.ai with `platform@vialuce.com` / `demo-password-VL1` shows:
- "Account found but profile is missing. Contact your administrator."
- Console: Two 406 (Not Acceptable) errors on GET to `.../rest/v1/profiles...`
- 406 from PostgREST means `.single()` returned 0 rows

The auth user exists (Supabase Auth recognized credentials), but the profiles table has no matching row.

## STANDING RULES
1. Commit + push after every change
2. After every commit: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
3. All work via OB/HF prompts. Prompt committed to git before work begins.
4. Never provide CC with answer values — fix logic not data
5. Reports and proof gates at PROJECT ROOT only
6. Final step: `gh pr create --base main --head dev`

## PHASE 0: DIAGNOSTIC

Run these queries against Supabase to understand the exact state:

```bash
# 1. Find the platform user's auth UUID
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.auth.admin.listUsers();
const platform = data?.users?.find(u => u.email === 'platform@vialuce.com');
console.log('Platform user:', platform?.id, platform?.email, platform?.created_at);
// Also check all users to see if any profiles exist
const { data: profiles } = await sb.from('profiles').select('*');
console.log('All profiles:', JSON.stringify(profiles, null, 2));
// Check tenants table
const { data: tenants } = await sb.from('tenants').select('id, name, industry');
console.log('All tenants:', JSON.stringify(tenants, null, 2));
"
```

Document findings before any changes.

## PHASE 1: RESTORE PLATFORM PROFILE

Based on diagnostic findings, restore the platform user's profile. The platform user is special — they have `scope_level: 'platform'` and are NOT tied to any specific tenant. They use the tenant picker to select which tenant to view.

```bash
# Insert profile for platform user (use the UUID from Phase 0)
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Get platform user UUID
const { data: usersData } = await sb.auth.admin.listUsers();
const platformUser = usersData?.users?.find(u => u.email === 'platform@vialuce.com');
if (!platformUser) { console.error('NO PLATFORM USER IN AUTH'); process.exit(1); }

// Check if profile already exists
const { data: existing } = await sb.from('profiles').select('*').eq('id', platformUser.id);
if (existing && existing.length > 0) {
  console.log('Profile already exists:', existing[0]);
  // Check if it needs updating
} else {
  // Insert platform profile — no tenant_id, scope_level platform
  const { data, error } = await sb.from('profiles').upsert({
    id: platformUser.id,
    email: 'platform@vialuce.com',
    display_name: 'VL Platform Admin',
    scope_level: 'platform',
    capabilities: ['manage_tenants', 'view_all', 'manage_users', 'run_calculations', 'manage_rule_sets', 'approve_results', 'export_data'],
    preferred_language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('INSERT ERROR:', error);
  else console.log('Profile restored:', data);
}
"
```

**IMPORTANT:** Also check ALL demo user profiles (admin@opticaluminar.mx, gerente@opticaluminar.mx, vendedor@opticaluminar.mx, admin@velocidaddeportiva.mx, gerente@velocidaddeportiva.mx, asociado@velocidaddeportiva.mx). If any are missing, restore them too. Each tenant demo user needs:
- `id` = their auth UUID
- `tenant_id` = their tenant's UUID
- `scope_level` = appropriate level (tenant/team/individual)
- `capabilities` = appropriate for their role

## PHASE 2: VERIFY LOGIN CODE PATH

Check the login code to understand:
1. What query runs against `profiles` after auth succeeds?
2. Does it filter by tenant_id? (Platform user has no tenant_id — this might be the query issue)
3. Is it using `.single()` which returns 406 on 0 rows?

If the query incorrectly requires tenant_id, fix it to handle platform-level users who have no tenant_id. The query should be:
```
profiles.select('*').eq('id', user.id).single()
```
NOT:
```
profiles.select('*').eq('id', user.id).eq('tenant_id', someTenantId).single()
```

If the code adds a tenant_id filter to the profile lookup during login, that's a bug — tenant context isn't established yet at login time.

## PHASE 3: VERIFY ALL DEMO USERS CAN AUTH

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const users = [
  { email: 'platform@vialuce.com', password: 'demo-password-VL1' },
  { email: 'admin@opticaluminar.mx', password: 'demo-password-OL1' },
  { email: 'gerente@opticaluminar.mx', password: 'demo-password-OL2' },
  { email: 'vendedor@opticaluminar.mx', password: 'demo-password-OL3' },
  { email: 'admin@velocidaddeportiva.mx', password: 'demo-password-VD1' },
  { email: 'gerente@velocidaddeportiva.mx', password: 'demo-password-VD2' },
  { email: 'asociado@velocidaddeportiva.mx', password: 'demo-password-VD3' },
];

for (const u of users) {
  const { data, error } = await sb.auth.signInWithPassword(u);
  if (error) { console.log('FAIL:', u.email, error.message); continue; }
  
  const { data: profile, error: profErr } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  if (profErr) console.log('PROFILE MISSING:', u.email, profErr.message);
  else console.log('OK:', u.email, '→', profile.scope_level, profile.display_name);
  
  await sb.auth.signOut();
}
"
```

All 7 users must authenticate AND have profiles. Any missing profile = same bug as platform user.

## PHASE 4: AUTOMATED CLT

Reuse the CLT-HF026 verification script plus add profile checks:

```bash
npx tsx web/scripts/clt-hf026-verify.ts
```

Additionally verify:
- All 7 auth users sign in successfully
- All 7 have profile rows
- Platform user has scope_level 'platform' and no tenant_id
- OL users have correct tenant_id
- VD users have correct tenant_id

## PHASE 5: COMPLETION REPORT + PR

Create `HF-027_COMPLETION_REPORT.md` at PROJECT ROOT with:
1. Diagnostic findings (which profiles were missing, why)
2. What was restored/fixed
3. Login code analysis (was there a query bug or just missing data?)
4. All 7 users verified
5. Automated CLT results

Then:
```bash
git add -A && git commit -m "HF-027: Restore platform user profile after ghost tenant cleanup"
git push origin dev
gh pr create --base main --head dev --title "HF-027: Restore platform profile + verify all demo auth" --body "Platform user profile was cascade-deleted when HF-026 removed ghost tenant. Restored profile, verified all 7 demo users authenticate with profiles."
```

## ANTI-PATTERNS TO AVOID
- Do NOT create a new auth user. The auth user exists. Only the profile row is missing.
- Do NOT modify the tenants table. The tenants are correct.
- Do NOT add a tenant_id to the platform user's profile. Platform users are cross-tenant.
- Do NOT skip Phase 0 diagnostic. We need to understand exactly what's missing before fixing.
