# HF-088: PRODUCTION DATA CLEANUP (Post OB-151)

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## READ FIRST
- `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, proof gates apply
- This is a DATA CLEANUP hotfix, not a code change. All work happens via a one-time TypeScript script executed against production Supabase.
- CC Failure Pattern 26: Never suggest manual SQL against production. This HF uses a script with verification queries instead.
- Decision 79: No auto-create tenant profiles for platform admin. HF-086 violated this — we are cleaning up the damage.

## CONTEXT

OB-151 (PR #168) fixed three production-blocking issues:
1. VL Admin tenant visibility (rewrote resolveProfileId to Option B — no auto-create)
2. Duplicate rule_sets (server-side idempotency + module-level dedup guard)
3. Client fetch timeout (polling recovery up to 90s)

But OB-151's code fixes only prevent FUTURE problems. The DATABASE still contains damage from HF-086 and the failed import attempts:
- **Auto-created VL Admin profiles** with `display_name = 'VL Platform Admin'` and `role = 'admin'` in tenant-scoped profiles. These were created by HF-086's resolveProfileId before OB-151 rewrote it. They cause `.maybeSingle()` to error (now fixed to array query) but are still garbage data.
- **Duplicate rule_sets** from failed import attempts where the client fired execute twice and the server had no idempotency guard (now fixed).

This HF creates and executes a cleanup script with full verification.

---

## PHASE 0: DIAGNOSTIC (Read-Only)

Create `web/scripts/hf088-diagnostic.ts`:

```typescript
/**
 * HF-088 Phase 0: Diagnostic — read-only queries to understand current state
 * Run from: spm-platform/web
 * Command: npx tsx scripts/hf088-diagnostic.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
  console.log('=== HF-088 DIAGNOSTIC ===\n');

  // 1. Find ALL VL Admin profiles
  console.log('--- VL Admin Profiles (ALL) ---');
  const { data: allVlProfiles, error: e1 } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name, created_at')
    .eq('email', 'platform@vialuce.com');
  
  if (e1) console.error('Error querying profiles:', e1.message);
  console.table(allVlProfiles);

  const platformProfile = allVlProfiles?.filter(p => p.tenant_id === null);
  const tenantProfiles = allVlProfiles?.filter(p => p.tenant_id !== null);
  console.log(`\nPlatform-level profiles (KEEP): ${platformProfile?.length ?? 0}`);
  console.log(`Tenant-scoped profiles (DELETE — HF-086 damage): ${tenantProfiles?.length ?? 0}`);

  // 2. Also check by display_name pattern (in case email differs)
  console.log('\n--- Profiles with display_name "VL Platform Admin" and role "admin" ---');
  const { data: vlNameProfiles, error: e2 } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name, created_at')
    .eq('display_name', 'VL Platform Admin')
    .eq('role', 'admin');
  
  if (e2) console.error('Error querying by display_name:', e2.message);
  console.table(vlNameProfiles);

  // 3. Find rule_sets for Óptica Luminar
  console.log('\n--- Rule Sets for Óptica Luminar ---');
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%');
  
  if (!tenants?.length) {
    console.log('No Óptica tenant found.');
  } else {
    const tenantId = tenants[0].id;
    console.log(`Tenant: ${tenants[0].name} (${tenantId})`);

    const { data: ruleSets, error: e3 } = await supabase
      .from('rule_sets')
      .select('id, name, status, created_at, metadata')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    
    if (e3) console.error('Error querying rule_sets:', e3.message);
    console.table(ruleSets?.map(rs => ({
      id: rs.id.substring(0, 8) + '...',
      name: rs.name,
      status: rs.status,
      created_at: rs.created_at,
      contentUnitId: (rs.metadata as any)?.contentUnitId?.substring(0, 8) || 'none'
    })));
    console.log(`Total rule_sets: ${ruleSets?.length ?? 0}`);
  }

  // 4. Verify Óptica Luminar data state (expect all zeros — nuclear cleared)
  console.log('\n--- Óptica Luminar Data State ---');
  if (tenants?.length) {
    const tenantId = tenants[0].id;
    const { count: entityCount } = await supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: dataCount } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: resultCount } = await supabase.from('calculation_results').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: assignmentCount } = await supabase.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);

    console.log(`Entities: ${entityCount}`);
    console.log(`Committed data: ${dataCount}`);
    console.log(`Calculation results: ${resultCount}`);
    console.log(`Rule set assignments: ${assignmentCount}`);
  }

  // 5. Other tenant health check
  console.log('\n--- Other Tenant Health Check ---');
  const tenantChecks = [
    { name: 'Pipeline Test Co', slug: 'pipeline' },
    { name: 'Caribe Financial', slug: 'caribe' },
    { name: 'Sabor Grupo', slug: 'sabor' }
  ];

  for (const t of tenantChecks) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name')
      .ilike('slug', `%${t.slug}%`)
      .maybeSingle();
    
    if (!tenant) {
      console.log(`${t.name}: Not found (OK if not seeded)`);
      continue;
    }
    
    const { count: entities } = await supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    const { count: results } = await supabase.from('calculation_results').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    console.log(`${t.name}: ${entities} entities, ${results} results`);
  }

  console.log('\n=== END DIAGNOSTIC ===');
  console.log('\nIf tenant-scoped VL Admin profiles > 0 or Óptica rule_sets > 0, proceed to Phase 1 cleanup.');
  console.log('If both are already 0, skip to Phase 2 verification and report clean state.');
}

diagnose().catch(console.error);
```

**Run the diagnostic:**
```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/hf088-diagnostic.ts
```

**PASTE THE FULL OUTPUT before proceeding to Phase 1. If everything is already 0, skip Phase 1 entirely.**

**Commit:** `HF-088 Phase 0: Diagnostic script`

---

## PHASE 1: CLEANUP (Destructive — only if Phase 0 shows data to clean)

**SKIP THIS PHASE if Phase 0 diagnostic shows 0 tenant-scoped VL Admin profiles AND 0 Óptica rule_sets.**

Create `web/scripts/hf088-cleanup.ts`:

```typescript
/**
 * HF-088 Phase 1: Cleanup — delete HF-086 damage and duplicate rule_sets
 * Run from: spm-platform/web
 * Command: npx tsx scripts/hf088-cleanup.ts
 * 
 * SAFETY: This script only deletes:
 *   1. Profiles where email='platform@vialuce.com' AND tenant_id IS NOT NULL
 *      (HF-086 auto-created profiles that should never exist per Decision 79)
 *   2. ALL rule_sets for Óptica Luminar tenant (tenant was nuclear cleared — no valid rule_sets should exist)
 *   3. Any rule_set_assignments orphaned by rule_set deletion
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanup() {
  console.log('=== HF-088 CLEANUP ===\n');

  // Step 1: Delete auto-created VL Admin tenant profiles
  console.log('Step 1: Deleting VL Admin tenant-scoped profiles...');
  
  const { data: toDelete } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name')
    .eq('email', 'platform@vialuce.com')
    .not('tenant_id', 'is', null);
  
  console.log(`Found ${toDelete?.length ?? 0} profiles to delete:`);
  if (toDelete?.length) console.table(toDelete);

  if (toDelete && toDelete.length > 0) {
    const ids = toDelete.map(p => p.id);
    const { error: delError, count } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .in('id', ids);
    
    if (delError) {
      console.error('DELETE FAILED:', delError.message);
      process.exit(1);
    }
    console.log(`✅ Deleted ${count} VL Admin tenant profiles.`);
  } else {
    console.log('✅ No VL Admin tenant profiles to delete.');
  }

  // Step 2: Delete rule_set_assignments for Óptica Luminar (FK dependency — must go first)
  console.log('\nStep 2: Deleting Óptica Luminar rule_set_assignments...');

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%');
  
  if (!tenants?.length) {
    console.log('No Óptica tenant found. Skipping.');
  } else {
    const tenantId = tenants[0].id;

    const { error: assignErr, count: assignCount } = await supabase
      .from('rule_set_assignments')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId);
    
    if (assignErr) {
      console.error('Assignment delete error:', assignErr.message);
    } else {
      console.log(`✅ Deleted ${assignCount ?? 0} rule_set_assignments.`);
    }

    // Step 3: Delete rule_sets
    console.log('\nStep 3: Deleting Óptica Luminar rule_sets...');
    const { error: rsErr, count: rsCount } = await supabase
      .from('rule_sets')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId);
    
    if (rsErr) {
      console.error('Rule set delete error:', rsErr.message);
      process.exit(1);
    }
    console.log(`✅ Deleted ${rsCount ?? 0} rule_sets.`);
  }

  console.log('\n=== CLEANUP COMPLETE ===');
  console.log('Now re-run hf088-diagnostic.ts to verify clean state (Phase 2).');
}

cleanup().catch(console.error);
```

**Run the cleanup:**
```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/hf088-cleanup.ts
```

**PASTE THE FULL OUTPUT.**

**Commit:** `HF-088 Phase 1: Cleanup executed`

---

## PHASE 2: VERIFICATION

Re-run the diagnostic to confirm clean state:

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/hf088-diagnostic.ts
```

**Expected output:**

| Check | Expected Value |
|---|---|
| VL Admin platform profiles (tenant_id IS NULL) | 1 |
| VL Admin tenant profiles (tenant_id IS NOT NULL) | 0 |
| Profiles with display_name "VL Platform Admin" and role "admin" | 0 |
| Óptica Luminar rule_sets | 0 |
| Óptica Luminar entities | 0 |
| Óptica Luminar committed_data | 0 |
| Óptica Luminar calculation_results | 0 |
| Óptica Luminar rule_set_assignments | 0 |
| Pipeline Test Co | Non-zero entities and results |
| Caribe Financial | Non-zero entities and results |

**If ANY value doesn't match expected, STOP and report the discrepancy in the completion report. Do not proceed.**

**PASTE THE FULL VERIFICATION OUTPUT.**

**Commit:** `HF-088 Phase 2: Verification passed — clean state confirmed`

---

## PHASE 3: COMPLETION REPORT

Create `HF-088_COMPLETION_REPORT.md` in project root:

```markdown
# HF-088 COMPLETION REPORT
## Production Data Cleanup (Post OB-151)

### Purpose
Delete HF-086 auto-created VL Admin tenant profiles and duplicate rule_sets 
from failed import attempts. OB-151 (PR #168) prevents future occurrences; 
this HF cleans existing damage.

### Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | VL Admin has exactly 1 profile (platform-level, tenant_id=null) | | [paste] |
| PG-02 | Zero VL Admin tenant-scoped profiles exist | | [paste] |
| PG-03 | Óptica Luminar has 0 rule_sets | | [paste] |
| PG-04 | Óptica Luminar has 0 entities, 0 committed_data, 0 results, 0 assignments | | [paste] |
| PG-05 | Pipeline Test Co data intact | | [paste] |
| PG-06 | Caribe Financial data intact | | [paste] |
| PG-07 | Build clean (npm run build exits 0) | | [paste] |

### Scripts Created
- `web/scripts/hf088-diagnostic.ts` — read-only state inspection (reusable)
- `web/scripts/hf088-cleanup.ts` — one-time destructive cleanup

### What Changed
- Database only. No application code modified.
- Deleted [N] VL Admin tenant profiles
- Deleted [N] Óptica rule_set_assignments  
- Deleted [N] Óptica rule_sets
```

**Fill in all [paste] and [N] values from actual output.**

**Commit:** `HF-088 Phase 3: Completion report`
**Push:** `git push origin dev`

Create PR:
```bash
gh pr create --base main --head dev \
  --title "HF-088: Production data cleanup (post OB-151)" \
  --body "One-time cleanup of HF-086 auto-created VL Admin profiles and duplicate rule_sets. Scripts committed for audit trail. No application code changes."
```

---

## MAXIMUM SCOPE

3 phases + completion report. 7 proof gates. Diagnostic → Cleanup → Verification. Nothing else.

**DO NOT:**
- Modify any application code
- Change any API routes
- Touch resolve-profile.ts (OB-151 already fixed it)
- Modify any other tenant's data
- Add features, fix bugs, or improve anything else

This is purely database cleanup with scripted verification.

---

*HF-088 — March 2026*
*"Scripts, not SQL Editor. Verification, not assumption. Clean state, then test."*
