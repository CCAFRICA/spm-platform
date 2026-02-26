# OB-104: PIPELINE UX INTEGRITY + TENANT RESET TOOLING

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items
3. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE
4. `DS-005_DATA_INGESTION_FACILITY.md` — file type and batch upload specs

---

## WHY THIS OB EXISTS

CLT-103 browser testing of the Caribe / Mexican Bank Co pipeline walkthrough revealed that while OB-103 built the structural pipeline (multi-file, PDF support, period dates, multi-plan calculation), the UX integrity is broken. Files fail silently, the user has no batch context, warnings block without alternatives, and failed imports abandon the queue.

Additionally, there is no way to reset a tenant to an empty state for repeated demo testing. Every failed walkthrough attempt leaves orphaned data that pollutes the next attempt.

**This OB fixes the import UX so a co-founder can walk through the pipeline without confusion, and provides tooling to reset tenants cleanly.**

---

## CLT-103 FINDINGS ADDRESSED

| # | Finding | Severity | Description |
|---|---------|----------|-------------|
| F1 | Sign-out broken | P0 | signOut() doesn't navigate to /login. Broken since HF-030. |
| F2 | No batch context in multi-file import | P1 | User uploads 4 files but sees no queue indicator, no "File 2 of 4", no completed file list |
| F3 | Tier gap warnings — no user guidance | P1 | Warnings show "Confirm correct" with no explanation and no alternative actions |
| F4 | Plan import fails silently | P0 | "Failed to import plan / Interpretation failed" — no file name, no reason, no recovery |
| F5 | Failed import abandons remaining queue | P0 | When file 2 fails, files 3 and 4 are silently dropped. User must re-upload manually. |
| F6 | No "Accept All Warnings" for demo flow | P2 | 4 individual "Confirm correct" clicks per file × 4 files = demo friction |
| F7 | GPV "Start free" on login page | P1 | Enterprise login shows self-registration link |
| F8 | Module-aware Perform empty state | P1 | Sabor Grupo shows "No hay resultados de compensación" despite having 46K Financial records |
| F9 | Intelligence panel crisis narrative from null data | P0 | AI generates "critical performance crisis" from zero/no calculation data |
| F10 | "Behind Pace" on zero data | P1 | Pacing card shows "Behind Pace" with MX$0/day when no calculation exists |
| F11 | Domain-agnostic labels on Operate | P2 | "Total Payout" label on Performance Index tenant |
| F12 | Persona Switcher routing broken | P1 | Rep lands on /financial/location instead of /perform |
| F13 | Persona identity doesn't update | P1 | After switch, still shows "VL Platform Admin" |
| F14 | Missing tenant auth users | P0 | Sabor Grupo + Caribe Financial users don't exist |
| F15 | No tenant reset capability | P1 | No way to clear a tenant back to empty for repeated demo testing |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.**
7. **Supabase .in() ≤ 200 items.**

---

## PHASE 1: TENANT RESET SCRIPT (F15)

Create `web/src/scripts/clear-tenant.ts` — a script that resets a tenant to a completely empty state while preserving the tenant record itself and its auth users/profiles.

### 1A: Script

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function clearTenant(tenantIdentifier: string) {
  console.log(`\n=== CLEAR TENANT: ${tenantIdentifier} ===\n`);

  // 1. Find tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .or(`slug.ilike.%${tenantIdentifier}%,name.ilike.%${tenantIdentifier}%`);

  if (!tenants?.length) {
    console.error(`No tenant found matching "${tenantIdentifier}"`);
    process.exit(1);
  }

  if (tenants.length > 1) {
    console.error('Multiple tenants match. Be more specific:');
    tenants.forEach(t => console.log(`  ${t.name} (${t.slug}) — ${t.id}`));
    process.exit(1);
  }

  const tenant = tenants[0];
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`ID: ${tenantId}`);
  console.log('');

  // 2. Delete in dependency order (children before parents)
  const tables = [
    // Calculation layer
    'calculation_results',
    'calculation_batches',

    // Data layer
    'committed_data',
    'import_batches',
    'ingestion_events',

    // Classification / AI
    'classification_signals',

    // Entity layer
    'rule_set_assignments',
    'entity_period_outcomes',
    'entity_relationships',
    'entities',

    // Plan layer
    'rule_sets',
    'rule_set_versions',

    // Period layer
    'periods',

    // Disputes / lifecycle
    'disputes',
    'approval_queue',
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId);

      if (error) {
        // Table might not exist or might not have tenant_id column
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.log(`  ⊘ ${table} — table does not exist (skip)`);
        } else if (error.message.includes('tenant_id')) {
          console.log(`  ⊘ ${table} — no tenant_id column (skip)`);
        } else {
          console.warn(`  ⚠ ${table} — ${error.message}`);
        }
      } else {
        console.log(`  ✓ ${table} — ${count ?? 0} rows deleted`);
      }
    } catch (e) {
      console.warn(`  ⚠ ${table} — unexpected error: ${e}`);
    }
  }

  // 3. Verify tenant is clean
  console.log('\n=== VERIFICATION ===\n');

  const checks = [
    'rule_sets', 'entities', 'periods', 'committed_data',
    'calculation_batches', 'calculation_results'
  ];

  let allClean = true;
  for (const table of checks) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      const status = (count ?? 0) === 0 ? '✓ CLEAN' : `✗ ${count} rows remain`;
      console.log(`  ${status} — ${table}`);
      if ((count ?? 0) > 0) allClean = false;
    } catch {
      console.log(`  ⊘ ${table} — cannot verify`);
    }
  }

  // 4. Confirm what's PRESERVED
  console.log('\n=== PRESERVED (not deleted) ===\n');

  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`  Profiles: ${profileCount ?? 0} (preserved)`);

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('name, slug, settings')
    .eq('id', tenantId)
    .single();
  console.log(`  Tenant record: ${tenantData?.name} (preserved)`);
  console.log(`  Settings/demo_users: ${tenantData?.settings ? 'preserved' : 'none'}`);

  console.log(`\n=== ${allClean ? 'TENANT IS CLEAN' : 'SOME DATA REMAINS'} ===`);
  console.log(`\n${tenant.name} is ready for a fresh walkthrough.`);
  console.log('Auth users and profiles are intact — login will work immediately.');
}

// Parse CLI argument
const identifier = process.argv[2];
if (!identifier) {
  console.log('Usage: npx tsx src/scripts/clear-tenant.ts <tenant-name-or-slug>');
  console.log('Examples:');
  console.log('  npx tsx src/scripts/clear-tenant.ts "mexican bank"');
  console.log('  npx tsx src/scripts/clear-tenant.ts caribe');
  console.log('  npx tsx src/scripts/clear-tenant.ts sabor');
  console.log('  npx tsx src/scripts/clear-tenant.ts "optica luminar"');
  process.exit(0);
}

clearTenant(identifier).catch(console.error);
```

### 1B: Run and Verify

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx src/scripts/clear-tenant.ts "mexican bank"
```

Expected output:
```
=== CLEAR TENANT: mexican bank ===

Tenant: Mexican Bank Co (mexican-bank-co)
ID: abc123...

  ✓ calculation_results — 0 rows deleted
  ✓ calculation_batches — 0 rows deleted
  ✓ committed_data — 0 rows deleted
  ...
  
=== TENANT IS CLEAN ===
Mexican Bank Co is ready for a fresh walkthrough.
```

### Proof Gates — Phase 1
```
PG-01: clear-tenant.ts script exists and runs without errors
PG-02: Running against Mexican Bank Co deletes all data tables
PG-03: Tenant record preserved after clear
PG-04: Profiles preserved after clear (can still login)
PG-05: Running clear-tenant.ts a second time shows 0 rows deleted (idempotent)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 1: Tenant reset script — clear-tenant.ts" && git push origin dev`

---

## PHASE 2: DEMO USER CREATION SCRIPT (F14)

Create `web/src/scripts/create-demo-users.ts` — creates auth users + profiles for tenants that exist but don't have demo users.

### 2A: Script

The script must:
1. Find Sabor Grupo and Caribe Financial tenants
2. Create or update auth users (6 total — 3 per tenant)
3. Create profiles linking auth users to correct tenants
4. Update tenant settings with demo_users for Persona Switcher

**Users:**

| Tenant | Email | Password | Role | Display Name |
|--------|-------|----------|------|-------------|
| Sabor Grupo | admin@saborgrupo.mx | demo-password-VL1 | admin | Carlos Mendoza |
| Sabor Grupo | gerente@saborgrupo.mx | demo-password-VL1 | manager | Ana Martínez |
| Sabor Grupo | mesero@saborgrupo.mx | demo-password-VL1 | sales_rep | Diego Ramírez |
| Caribe Financial | admin@caribefinancial.mx | demo-password-VL1 | admin | Roberto Vega |
| Caribe Financial | director@caribefinancial.mx | demo-password-VL1 | manager | Patricia Navarro |
| Caribe Financial | oficial@caribefinancial.mx | demo-password-VL1 | sales_rep | Miguel Torres |

Use the same script pattern as Phase 1 — Supabase Admin API with service role key, idempotent (check before create), update password if user already exists.

### 2B: Run and Verify

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx src/scripts/create-demo-users.ts
```

### 2C: SQL Verification

```sql
SELECT p.email, p.role, p.display_name, t.name
FROM profiles p JOIN tenants t ON t.id = p.tenant_id
WHERE p.email IN ('admin@saborgrupo.mx','gerente@saborgrupo.mx','mesero@saborgrupo.mx',
  'admin@caribefinancial.mx','director@caribefinancial.mx','oficial@caribefinancial.mx');
```

**Must return 6 rows.**

### Proof Gates — Phase 2
```
PG-06: create-demo-users.ts exists and runs without errors
PG-07: admin@saborgrupo.mx exists in auth.users
PG-08: admin@caribefinancial.mx exists in auth.users
PG-09: All 6 profiles linked to correct tenant_id with correct role
PG-10: Login with admin@saborgrupo.mx / demo-password-VL1 succeeds
PG-11: Login with admin@caribefinancial.mx / demo-password-VL1 succeeds
```

**PG-10 and PG-11 are ACCEPTANCE GATES. If login doesn't work, this phase failed.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 2: Demo user creation script" && git push origin dev`

---

## PHASE 3: SIGN-OUT + LOGIN PAGE FIXES (F1, F7)

### 3A: Fix Sign-Out Navigation

```bash
grep -rn "signOut\|handleLogout\|handleSignOut" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

Find the sign-out handler. Add AFTER `supabase.auth.signOut()`:

```typescript
// Clear all auth and tenant cookies
document.cookie.split(';').forEach(c => {
  const name = c.trim().split('=')[0];
  if (name.startsWith('sb-')) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
});
document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
// Full reload to login — NOT router.push
window.location.href = '/login';
```

### 3B: Hide "Don't have an account? Start free"

```bash
grep -rn "Start free\|start free\|Sign up\|Don't have an account" web/src/app/ --include="*.tsx" | head -10
```

Hide the text. Add comment: `{/* TODO: Show when GPV self-signup is enabled */}`

### Proof Gates — Phase 3
```
PG-12: Sign Out → navigates to /login
PG-13: After sign-out, /operate redirects back to /login
PG-14: Login page does NOT show "Don't have an account? Start free"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 3: Sign-out fix + hide GPV signup" && git push origin dev`

---

## PHASE 4: PLAN IMPORT UX — BATCH CONTEXT + ERROR HANDLING + WARNINGS (F2, F3, F4, F5, F6)

This is the critical phase. The plan import multi-file flow has the structure (OB-103) but the UX is broken.

### 4A: File Queue Panel (F2)

When multiple files are selected for upload, show a persistent queue panel:

```
┌─────────────────────────────────────────────────────┐
│  📁 Plan Import Queue — 4 files                      │
│                                                      │
│  ✓ Deposit_Growth_Incentive_Q1_2024.xlsx  — Done     │
│  ⏳ Consumer_Lending_Commission_2024.pdf  — Processing│
│  ○ Mortgage_Origination_Bonus_2024.pdf    — Queued    │
│  ○ Insurance_Referral_Program_2024.xlsx   — Queued    │
│                                                      │
│  File 2 of 4                                         │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
- Panel persists across the 3-step wizard for each file
- Current file is highlighted/bold
- Completed files show ✓ with plan name extracted from interpretation
- Failed files show ✗ with reason
- Clicking a completed file shows its interpretation summary (read-only)

### 4B: Error Handling on Failed Interpretation (F4, F5)

When `interpret-plan` API returns an error:

1. Show the **file name** that failed: "Consumer_Lending_Commission_2024.pdf — Interpretation failed"
2. Show the **reason** if available from the API response, or a generic: "The AI could not interpret this document."
3. Show **recovery options**:
   ```
   [Retry This File]  [Skip & Process Next]  [Upload Different File]
   ```
4. "Skip & Process Next" moves to file 3 in the queue — does NOT abandon remaining files
5. "Retry This File" re-sends the same file to the API
6. The queue panel updates: ✗ for the failed file, ⏳ for the next one

**CRITICAL: A failed file must NOT abandon the remaining queue.** The current behavior silently drops files 3 and 4 when file 2 fails. Fix the queue processing loop to continue on error:

```typescript
for (const file of fileQueue) {
  try {
    const result = await processFile(file);
    updateQueueStatus(file, 'completed', result);
  } catch (error) {
    updateQueueStatus(file, 'failed', error.message);
    // Show error UI with retry/skip options
    const action = await waitForUserAction(); // 'retry' | 'skip' | 'replace'
    if (action === 'retry') {
      // re-process same file
    } else if (action === 'skip') {
      continue; // move to next file
    } else if (action === 'replace') {
      // open file picker, replace this file in queue, re-process
    }
  }
}
```

### 4C: Warning Guidance + Accept All (F3, F6)

The tier gap warnings (S-06) are legitimate anomaly detections. The UX needs:

1. **Explain what "Confirm correct" means:**
   Change button label to: **"Accept as-is"** with tooltip: "Keep the current tier boundaries. Values in the gap will fall into no tier."

2. **Add alternative actions per warning:**
   ```
   [Accept as-is ✓]  [Adjust boundaries →]  [Flag for review 🏷]
   ```
   - "Accept as-is" = current "Confirm correct" — marks the warning as acknowledged
   - "Adjust boundaries" = expands an inline editor showing the two threshold values with edit fields
   - "Flag for review" = marks it as unresolved but allows import to proceed (warning persists on the rule set)

3. **Add "Accept All Warnings" button** below the warnings list:
   ```
   ──────────────────────────────────────────────
   4 warnings detected in tier thresholds.
   [Accept All 4 Warnings]  [View Full Validation Report]
   ```
   This is essential for the demo — clicking 4 individual buttons per file × 4 files = 16 clicks of friction.

4. **Warnings do NOT block import.** The "Confirm & Import Plan" button at the bottom must be clickable regardless of whether warnings are accepted. Unaccepted warnings are preserved as metadata on the rule set for future review. Make this visually clear — the button should not appear disabled or dependent on warning resolution.

### 4D: Batch Completion Summary

After all files in the queue are processed (whether succeeded, failed, or skipped), show a summary:

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Plan Import Complete — 4 files processed             │
│                                                          │
│  ✓ Deposit Growth Incentive        95% confidence        │
│  ✓ Consumer Lending Commission     92% confidence        │
│  ✗ Mortgage Origination Bonus      Failed — retry?       │
│  ✓ Insurance Referral Program      88% confidence        │
│                                                          │
│  3 plans created  ·  1 failed                            │
│                                                          │
│  [View Plans]  [Import More]  [Continue to Data Import →]│
└─────────────────────────────────────────────────────────┘
```

### Proof Gates — Phase 4
```
PG-15: File queue panel shows all selected files with status indicators
PG-16: Current file highlighted in queue during processing
PG-17: Completed files show ✓ in queue panel
PG-18: Failed file shows file name and error reason
PG-19: Failed file offers [Retry] [Skip] [Replace] options
PG-20: Skipping a failed file processes the next file in queue (queue continues)
PG-21: "Accept All Warnings" button exists and accepts all warnings in one click
PG-22: "Confirm & Import Plan" button is clickable without resolving warnings
PG-23: Batch completion summary shows all files with final status
PG-24: Queue panel shows "File X of N" indicator
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 4: Plan Import UX — queue, errors, warnings, batch summary" && git push origin dev`

---

## PHASE 5: MODULE-AWARE PERFORM LANDING (F8, F9, F10)

### 5A: Fix Perform Empty State for Financial-Primary Tenants

```bash
cat web/src/app/perform/page.tsx | head -100
grep -rn "No hay resultados\|no.*calculation\|compensation" web/src/app/perform/ --include="*.tsx" | head -10
```

**Logic:**

```typescript
const hasICMPlans = ruleSetCount > 0;
const hasICMCalc = calculationBatches.some(b => b.status === 'completed');
const hasFinancialData = /* check if Financial module has data — committed_data with pos/financial type, or financial feature flag */ ;

if (!hasICMPlans && hasFinancialData) {
  // Financial-primary tenant — show Financial performance summary
  // Link to /financial dashboard
  // Do NOT show "No hay resultados de compensación"
} else if (hasICMPlans && !hasICMCalc) {
  // ICM tenant, no calc yet — show "Run a calculation to see results"
} else if (hasICMPlans && hasICMCalc) {
  // ICM tenant with results — show ICM performance (current behavior)
} else if (!hasICMPlans && !hasFinancialData) {
  // Empty tenant — show "Import your data to get started"
}
```

### 5B: Intelligence Panel Null-Data Guard (F9)

```bash
grep -rn "Coaching Intelligence\|Intelligence\|insight.*panel\|agent.*recommend" web/src/app/perform/ web/src/components/ --include="*.tsx" | head -15
```

**Add a deterministic gate BEFORE any AI/LLM call:**

```typescript
if (!hasCalculationResults) {
  return <EmptyState message="Run a calculation to generate coaching insights." />;
}
if (totalPayout === 0 && entities.every(e => (e.attainment ?? 0) === 0)) {
  return <EmptyState message="Calculation complete — verify data import covers this period." />;
}
// ONLY NOW generate AI content
```

**NEVER generate AI narrative from null/zero data. This is non-negotiable.**

### 5C: "Behind Pace" Zero-Data Guard (F10)

```bash
grep -rn "Behind Pace\|behind.*pace\|pacing\|run.*rate" web/src/app/perform/ web/src/components/ --include="*.tsx" | head -10
```

If no calculation exists OR total is zero:
- Pacing card shows "—" or "Awaiting calculation"
- NOT "Behind Pace" with MX$0/day
- NOT red/amber status indicators on zero data

### Proof Gates — Phase 5
```
PG-25: Sabor Grupo /perform does NOT show "No hay resultados de compensación"
PG-26: Sabor Grupo /perform shows Financial summary or link to Financial dashboard
PG-27: Manager view with no calculation does NOT show AI crisis narrative
PG-28: Manager view with no calculation shows empty state message
PG-29: "Behind Pace" does NOT appear when no calculation exists
PG-30: Optica Luminar /perform still shows ICM view correctly (no regression)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 5: Module-aware Perform + Intelligence null guard" && git push origin dev`

---

## PHASE 6: OPERATE LABELS + PERSONA SWITCHER (F11, F12, F13)

### 6A: Domain-Agnostic Labels on Operate Landing (F11)

```bash
grep -rn "Total Payout\|TOTAL PAYOUT\|Payout" web/src/app/operate/page.tsx | head -5
```

Change "TOTAL PAYOUT" to a dynamic label:
```typescript
const resultLabel = ruleSetCount > 0 && ruleSets.some(rs =>
  rs.type === 'compensation' || rs.name?.toLowerCase().includes('comis')
) ? 'Total Payout' : 'Last Result';
```

Default to "Last Result" — works for both compensation and performance index tenants.

### 6B: Persona Switcher Routing Fix (F12)

```bash
grep -rn "persona.*switch\|DemoPersona\|PersonaSwitcher\|signInWithPassword" web/src/components/ --include="*.tsx" | head -15
```

After successful `signInWithPassword()`:
```typescript
const targetRoute = role === 'sales_rep' ? '/perform' : role === 'manager' ? '/perform' : '/operate';
window.location.href = targetRoute;
```

Rep ALWAYS goes to `/perform`. Manager ALWAYS goes to `/perform`. Admin goes to `/operate`.

### 6C: Persona Switcher Error Handling (F13)

If `signInWithPassword()` fails:
```typescript
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  // Show error — do NOT sign out current user
  toast.error(`Switch failed: ${error.message}`);
  return;
}
```

### 6D: Persona Identity Display

After persona switch, `window.location.href` triggers full reload which re-fetches the profile. The bottom-left identity display should update automatically. If it doesn't, the profile fetch in the session context is not re-running on reload — debug and fix.

### Proof Gates — Phase 6
```
PG-31: Sabor Grupo Operate does not show "TOTAL PAYOUT" label
PG-32: Clicking Rep persona → lands on /perform
PG-33: After persona switch, identity display shows correct user
PG-34: Failed persona switch shows error, stays logged in
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Phase 6: Operate labels + Persona Switcher routing" && git push origin dev`

---

## PHASE 7: BUILD + COMPLETION

### 7A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 7B: Completion Report

Create `OB-104_COMPLETION_REPORT.md` at project root:

1. Tenant reset script — clear-tenant.ts
2. Demo user creation — 6 users, login verified
3. Sign-out fix + GPV signup hidden
4. Plan Import UX — queue panel, error handling, warning guidance, batch summary
5. Module-aware Perform — Financial-primary tenants, Intelligence null guard
6. Operate labels + Persona Switcher
7. All proof gates PASS/FAIL with evidence
8. CLT-103 findings F1-F15 addressed

### 7C: PR

```bash
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-104 Complete: Pipeline UX Integrity + Tenant Reset" && git push origin dev
gh pr create --base main --head dev \
  --title "OB-104: Pipeline UX Integrity + Tenant Reset Tooling" \
  --body "## CLT-103 Findings Resolved: 15

### Phase 1: Tenant Reset Script
- clear-tenant.ts: Deletes all data for a tenant while preserving auth users/profiles
- Idempotent, dependency-ordered deletion
- Usage: npx tsx src/scripts/clear-tenant.ts 'tenant name'

### Phase 2: Demo User Creation
- 6 auth users (3 Sabor + 3 Caribe) with profiles and demo_users settings
- Idempotent, updates passwords if users exist

### Phase 3: Sign-Out + Login
- Sign-out navigates to /login with cookie cleanup
- GPV signup link hidden on login page

### Phase 4: Plan Import UX
- File queue panel with status indicators (✓/⏳/✗/○)
- Failed files show name + reason + recovery options (Retry/Skip/Replace)
- Failed files do NOT abandon remaining queue
- Accept All Warnings button
- Warnings don't block import
- Batch completion summary

### Phase 5: Module-Aware Perform
- Financial-primary tenants see Financial summary, not empty ICM state
- Intelligence panel null-data guard (no AI narratives from zero data)
- Behind Pace hidden when no calculation exists

### Phase 6: Operate Labels + Persona Switcher
- Domain-agnostic labels (Total Payout → Last Result for non-compensation)
- Rep persona routes to /perform
- Persona switch error handling (no accidental sign-out)

## Proof Gates: 34"
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Tenant reset script (clear-tenant.ts)
- Demo user creation script (create-demo-users.ts)
- Sign-out navigation fix
- GPV signup link hidden
- Plan Import: file queue panel, error handling, warning UX, batch summary
- Module-aware Perform landing (Financial-primary tenants)
- Intelligence null-data guard
- Behind Pace zero-data guard
- Domain-agnostic Operate labels
- Persona Switcher routing + error handling

### OUT OF SCOPE — DO NOT BUILD
- Data Import UX changes (separate — Plan Import first)
- Calculation engine changes
- Financial module page changes
- Auth middleware changes (DO NOT TOUCH)
- N+1 systemic fix (PDR-04 — separate OB)
- Coordination gates / clawback engine
- New seed data

---

## ANTI-PATTERNS

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | AI narrative from null/zero data | Deterministic gate before any AI call |
| AP-2 | Status indicators on zero data ("Behind Pace") | Show "—" or empty state when no calc exists |
| AP-3 | ICM empty state on Financial-primary tenant | Module-aware conditional rendering |
| AP-4 | Silent failure dropping remaining files | Queue continues on error with user choice |
| AP-5 | Sign-out without navigation | Cookie clear + window.location.href |
| AP-6 | Modifying auth files | Read AUTH_FLOW_REFERENCE.md — DO NOT TOUCH |
| AP-7 | Failed persona switch = sign out | Show error toast, stay logged in |

---

*ViaLuce.ai — The Way of Light*
*"A demo that confuses the presenter has already failed. Every click must be intentional, every state must be explained, every error must offer a path forward."*
