# HF-063D: CLT-102/103 CONSOLIDATED FIXES — DEMO WALKTHROUGH BLOCKERS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all tasks sequentially.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `AUTH_FLOW_REFERENCE.md` — READ but DO NOT MODIFY any auth middleware files
3. `PERSISTENT_DEFECT_REGISTRY.md` — verify PDR items in scope

---

## WHY THIS EXISTS

CLT-102 and CLT-103 browser testing of Sabor Grupo Gastronomico revealed multiple demo-blocking issues. OB-103 Phase 0A (auth users + sign-out fix) was specified but CC skipped it entirely. Additionally, module-aware logic on Perform and Operate landings was structurally built (OB-102) but content intelligence is missing — empty ICM states show on Financial-primary tenants, AI generates crisis narratives from null data, and persona routing is broken.

**This HF fixes 7 specific issues discovered during browser testing. Nothing else.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **DO NOT MODIFY ANY AUTH MIDDLEWARE FILE.**

---

## TASK 1: CREATE MISSING AUTH USERS — SABOR GRUPO + CARIBE FINANCIAL

OB-103 Phase 0A specified this. CC skipped it. These users are required for the co-founder demo walkthrough. Without them, direct tenant login is impossible.

### 1A: Create Script

Create `web/src/scripts/create-demo-users.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Set SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard → Settings → API');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_USERS = [
  // Sabor Grupo Gastronomico
  { email: 'admin@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Carlos Mendoza', role: 'admin', scopeLevel: 'tenant', tenantMatch: 'sabor', label: 'Admin', icon: 'shield' },
  { email: 'gerente@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Ana Martínez', role: 'manager', scopeLevel: 'division', tenantMatch: 'sabor', label: 'Gerente', icon: 'users' },
  { email: 'mesero@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Diego Ramírez', role: 'sales_rep', scopeLevel: 'individual', tenantMatch: 'sabor', label: 'Mesero', icon: 'user' },
  // Caribe Financial Group
  { email: 'admin@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Roberto Vega', role: 'admin', scopeLevel: 'tenant', tenantMatch: 'caribe', label: 'Admin', icon: 'shield' },
  { email: 'director@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Patricia Navarro', role: 'manager', scopeLevel: 'division', tenantMatch: 'caribe', label: 'Director', icon: 'users' },
  { email: 'oficial@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Miguel Torres', role: 'sales_rep', scopeLevel: 'individual', tenantMatch: 'caribe', label: 'Oficial', icon: 'user' },
];

async function main() {
  console.log('=== HF-063D: Create Demo Users ===\n');

  const { data: tenants } = await supabase.from('tenants').select('id, slug, name, settings');
  if (!tenants?.length) { console.error('No tenants found'); process.exit(1); }

  const findTenant = (match: string) => tenants.find(t =>
    t.slug?.toLowerCase().includes(match) || t.name?.toLowerCase().includes(match)
  );

  const saborTenant = findTenant('sabor');
  const caribeTenant = findTenant('caribe');
  console.log('Sabor:', saborTenant ? `${saborTenant.name} (${saborTenant.id})` : 'NOT FOUND');
  console.log('Caribe:', caribeTenant ? `${caribeTenant.name} (${caribeTenant.id})` : 'NOT FOUND');

  if (!saborTenant && !caribeTenant) { console.error('Neither tenant found'); process.exit(1); }

  const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUsers = listData?.users || [];

  for (const user of DEMO_USERS) {
    const tenant = user.tenantMatch === 'sabor' ? saborTenant : caribeTenant;
    if (!tenant) { console.warn(`Skip ${user.email} — no ${user.tenantMatch} tenant`); continue; }

    // Auth user
    const existing = existingUsers.find(u => u.email === user.email);
    let authUserId: string;

    if (existing) {
      authUserId = existing.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: user.password, email_confirm: true });
      console.log(`✓ ${user.email} exists (${authUserId}), password updated`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email, password: user.password, email_confirm: true
      });
      if (error) { console.error(`✗ ${user.email}: ${error.message}`); continue; }
      authUserId = data.user.id;
      console.log(`✓ Created ${user.email} (${authUserId})`);
    }

    // Profile
    const { data: existingProfile } = await supabase
      .from('profiles').select('id')
      .eq('auth_user_id', authUserId).eq('tenant_id', tenant.id).maybeSingle();

    if (!existingProfile) {
      const { error } = await supabase.from('profiles').insert({
        auth_user_id: authUserId, tenant_id: tenant.id, email: user.email,
        display_name: user.displayName, role: user.role, scope_level: user.scopeLevel,
      });
      if (error) {
        // Retry without scope_level
        const { error: retry } = await supabase.from('profiles').insert({
          auth_user_id: authUserId, tenant_id: tenant.id, email: user.email,
          display_name: user.displayName, role: user.role,
        });
        if (retry) console.error(`  ✗ Profile failed: ${retry.message}`);
        else console.log(`  ✓ Profile created (no scope_level)`);
      } else {
        console.log(`  ✓ Profile → ${tenant.name} (${user.role})`);
      }
    } else {
      console.log(`  Profile exists`);
    }
  }

  // Update tenant demo_users settings
  for (const tenant of [saborTenant, caribeTenant].filter(Boolean)) {
    if (!tenant) continue;
    const match = tenant.name?.toLowerCase().includes('sabor') ? 'sabor' : 'caribe';
    const users = DEMO_USERS.filter(u => u.tenantMatch === match);
    const config = users.map(u => ({ email: u.email, password: u.password, label: u.label, icon: u.icon }));
    const settings = { ...((tenant.settings as Record<string, unknown>) || {}), demo_users: config };
    const { error } = await supabase.from('tenants').update({ settings }).eq('id', tenant.id);
    console.log(error ? `✗ demo_users for ${tenant.name}: ${error.message}` : `✓ demo_users for ${tenant.name}`);
  }

  console.log('\n=== Test Logins ===');
  DEMO_USERS.forEach(u => console.log(`  ${u.email} / ${u.password}`));
}

main().catch(console.error);
```

### 1B: Run Script

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx src/scripts/create-demo-users.ts
```

### 1C: Verify

```sql
SELECT p.email, p.role, p.display_name, t.name
FROM profiles p JOIN tenants t ON t.id = p.tenant_id
WHERE p.email IN ('admin@saborgrupo.mx','gerente@saborgrupo.mx','mesero@saborgrupo.mx',
  'admin@caribefinancial.mx','director@caribefinancial.mx','oficial@caribefinancial.mx');
```

**Must return 6 rows.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 1: Demo user creation script" && git push origin dev`

---

## TASK 2: FIX SIGN-OUT NAVIGATION

Broken since HF-030. `signOut()` clears session but doesn't navigate.

```bash
grep -rn "signOut\|handleLogout\|handleSignOut" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

**Fix the logout handler — add AFTER `supabase.auth.signOut()`:**

```typescript
// Clear all auth and tenant cookies
document.cookie.split(';').forEach(c => {
  const name = c.trim().split('=')[0];
  if (name.startsWith('sb-')) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
});
document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
// Full page reload to /login — NOT router.push
window.location.href = '/login';
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 2: Sign-out navigates to /login" && git push origin dev`

---

## TASK 3: HIDE "DON'T HAVE AN ACCOUNT? START FREE" ON LOGIN PAGE

```bash
grep -rn "Start free\|start free\|Sign up\|Don't have an account\|create.*account" web/src/app/ --include="*.tsx" | head -10
```

Find the text on the login page. **Remove it or wrap in `{false && ...}`** with comment:
```typescript
{/* TODO: Show when GPV self-signup is enabled via platform config */}
```

Enterprise login pages do not advertise self-registration.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 3: Hide GPV signup link on login" && git push origin dev`

---

## TASK 4: PERFORM LANDING — MODULE-AWARE EMPTY STATE (CLT-103 F1)

**The Problem:** Sabor Grupo Perform landing shows "No hay resultados de compensación para este periodo" — an empty ICM compensation view for a tenant that has 46,700 POS cheques in the Financial module but no ICM calculations.

**The Fix:** The Perform landing must check what modules have data, not just whether ICM calculations exist.

```bash
cat web/src/app/perform/page.tsx | head -80
grep -rn "No hay resultados\|no.*results\|no.*calculation\|compensation" web/src/app/perform/ --include="*.tsx" | head -10
```

**Logic change in `/perform/page.tsx`:**

```typescript
// CURRENT (wrong): Always show ICM view, show empty state if no calc
// NEW: Check which modules have data

const hasICMData = calculationBatches.length > 0;
const hasFinancialData = /* check committed_data with data_type containing 'pos' or check financial module flag */ true;

// If NO ICM data but HAS Financial data → show Financial performance view
// If HAS ICM data → show ICM performance (current behavior)
// If BOTH → show module selector or combined view
// If NEITHER → show "Get started" empty state with link to Import
```

**For tenants with Financial data but no ICM calculations, the Perform landing should show:**

```
┌──────────────────────────────────────────────────────┐
│  📊 Performance Overview                              │
│  Sabor Grupo Gastronomico · Enero 2024                │
│                                                       │
│  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │ 🍽️ Financial     │  │ No compensation plans     │   │
│  │ Performance      │  │ configured for this       │   │
│  │                  │  │ tenant.                   │   │
│  │ 46,700 records   │  │                           │   │
│  │ 20 locations     │  │ [Import Plans →]          │   │
│  │ Enero 2024       │  │                           │   │
│  │                  │  └──────────────────────────┘   │
│  │ [View Dashboard →]│                                │
│  └─────────────────┘                                  │
└──────────────────────────────────────────────────────┘
```

**Key rule:** NEVER show "No hay resultados de compensación" for a tenant that has no ICM plans and never intended to have compensation. The empty state message must be module-aware:
- Has ICM plans but no calc: "Run a calculation to see results" (current, correct for ICM tenants)
- Has no ICM plans: Don't show ICM section at all, or show one-line "No compensation plans configured"
- Has Financial data: Surface the Financial module as the primary view
- Has neither: "Import your data to get started"

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 4: Module-aware Perform landing" && git push origin dev`

---

## TASK 5: INTELLIGENCE PANEL — NULL DATA GUARD (CLT-102 F1)

**The Problem:** Manager Perform view shows Coaching Intelligence panel generating alarming AI narrative from zero/null data: *"The team is experiencing a critical performance crisis in January 2024, with all 8 members falling below target and achieving 0% quota attainment across the board."*

Zero data ≠ crisis. No calculation ≠ performance failure. This destroys trust.

```bash
grep -rn "Coaching Intelligence\|Intelligence\|coaching.*intelligence\|agent.*intelligence\|ai.*panel\|insight.*panel" web/src/app/perform/ web/src/components/ --include="*.tsx" | head -15
grep -rn "critical.*performance\|performance.*crisis\|immediate.*intervention\|breakdown.*sales" web/src/ --include="*.tsx" --include="*.ts" | head -10
```

**Fix — add a deterministic gate BEFORE any AI/LLM call:**

```typescript
// BEFORE generating Intelligence content, check:
const hasCalculationResults = calculationBatches.some(b => b.status === 'completed');
const hasNonZeroData = totalPayout > 0 || entities.some(e => e.attainment > 0);

if (!hasCalculationResults) {
  // Show: "No calculation results for this period. Run a calculation to see coaching insights."
  // DO NOT call AI. DO NOT generate narrative. DO NOT show "Behind Pace" or any status.
  return <EmptyIntelligenceState message="Run a calculation to generate coaching insights." />;
}

if (!hasNonZeroData) {
  // Show: "Calculation complete but no payout data found. Verify data import coverage."
  // DO NOT generate crisis narrative from zeros.
  return <EmptyIntelligenceState message="Calculation complete — verify data import for this period." />;
}

// ONLY NOW generate AI insights from actual data
```

**Also fix "Behind Pace" on zero data:**

```bash
grep -rn "Behind Pace\|behind.*pace\|pacing\|run.*rate" web/src/app/perform/ web/src/components/ --include="*.tsx" | head -10
```

If no calculation exists OR total is zero, Pacing card shows "—" or "Awaiting data", NOT "Behind Pace."

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 5: Intelligence null-data guard" && git push origin dev`

---

## TASK 6: OPERATE LANDING — DOMAIN-AGNOSTIC LABELS (CLT-102 F2)

**The Problem:** Sabor Grupo Operate landing shows "Comisión por Ventas - Meseros" as the ICM plan label and "Total Payout" as a metric. Sabor Grupo is a Performance Index framework, not compensation. The labels should be domain-agnostic.

```bash
grep -rn "Total Payout\|Payout\|Comisión\|Commission\|LAST CALCULATION\|ACTIVE PLANS" web/src/app/operate/page.tsx --include="*.tsx" | head -10
```

**Fix:**
- "TOTAL PAYOUT" → "LAST RESULT" (or read the rule set's output type — if payout, show "Total Payout"; if score/index, show "Total Score")
- "Compensation (ICM)" card header → Read from rule set type or just show "Performance" generically
- Plan names like "Comisión por Ventas - Meseros" are correct — those come from the rule set data. The surrounding labels need to be neutral.

**Minimum fix:** Change hard-coded "TOTAL PAYOUT" to a dynamic label:
```typescript
const payoutLabel = ruleSetCount > 0 && ruleSets.some(rs => rs.output_type === 'payout')
  ? 'Total Payout' : 'Last Result';
```

If `output_type` doesn't exist on rule sets, default to "Last Result" which works for both compensation and performance index tenants.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 6: Domain-agnostic Operate labels" && git push origin dev`

---

## TASK 7: PERSONA SWITCHER — FIX ROUTING + IDENTITY DISPLAY (CLT-102 F3, F4)

**Problems:**
1. Rep persona lands on `/financial/location/{uuid}` instead of `/perform`
2. After switching persona, bottom-left still shows "VL Platform Admin" instead of the switched persona
3. Persona Switcher may be signing out instead of switching (broken signInWithPassword)

```bash
grep -rn "persona.*switch\|demo.*persona\|DemoPersona\|PersonaSwitcher" web/src/ --include="*.tsx" --include="*.ts" | head -15
```

**Fix routing:** After successful `signInWithPassword()`:
```typescript
// Navigate based on role
const targetRoute = newUser.role === 'admin' ? '/operate'
  : newUser.role === 'manager' ? '/perform'
  : '/perform'; // reps always go to /perform

window.location.href = targetRoute; // Full reload, not router.push
```

**Fix identity display:** After persona switch, the session context must reload the new user's profile. If using `window.location.href` for navigation, this happens automatically on reload.

**Fix sign-in failure:** If `signInWithPassword` fails (wrong password, user doesn't exist), show error toast — do NOT sign out the current user.

```typescript
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  toast.error(`Could not switch to ${email}: ${error.message}`);
  return; // Stay logged in as current user
}
// Only navigate on success
window.location.href = targetRoute;
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Task 7: Persona Switcher routing and identity" && git push origin dev`

---

## BUILD + VERIFY

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

---

## PROOF GATES

### Auth Users (Task 1)
```
PG-01: admin@saborgrupo.mx login succeeds → lands in Sabor Grupo
PG-02: admin@caribefinancial.mx login succeeds → lands in Caribe Financial
PG-03: gerente@saborgrupo.mx login succeeds
PG-04: mesero@saborgrupo.mx login succeeds
PG-05: All 6 profiles linked to correct tenant with correct role (SQL query)
```

### Sign-Out (Task 2)
```
PG-06: Click Sign Out → navigates to /login
PG-07: After sign-out, navigating to /operate redirects to /login
```

### GPV Signup (Task 3)
```
PG-08: Login page does NOT show "Don't have an account? Start free"
```

### Module-Aware Perform (Task 4)
```
PG-09: Sabor Grupo /perform does NOT show "No hay resultados de compensación"
PG-10: Sabor Grupo /perform shows Financial data summary or link to Financial dashboard
PG-11: ICM-only tenant (Optica Luminar) /perform still shows ICM view correctly
```

### Intelligence Null Guard (Task 5)
```
PG-12: Manager view with no calculation does NOT show "critical performance crisis"
PG-13: Manager view with no calculation shows "Run a calculation" empty state
PG-14: "Behind Pace" does NOT appear when no calculation exists
```

### Domain-Agnostic Labels (Task 6)
```
PG-15: Operate landing does not show "TOTAL PAYOUT" for non-compensation tenants
```

### Persona Switcher (Task 7)
```
PG-16: Clicking Rep persona → lands on /perform (not /financial/location/...)
PG-17: After persona switch, identity display shows switched user (not VL Platform Admin)
PG-18: Failed persona switch shows error toast, stays logged in as current user
```

**PG-01 and PG-02 are the ACCEPTANCE GATES. If those logins don't work, the HF failed.**

---

## COMPLETION + PR

```bash
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-063D Complete: CLT-102/103 demo blockers resolved" && git push origin dev
gh pr create --base main --head dev \
  --title "HF-063D: CLT-102/103 Demo Blockers — Auth Users, Sign-Out, Module-Aware Perform, Intelligence Guard" \
  --body "## 7 Tasks — 18 Proof Gates

### Task 1: Missing auth users (Sabor Grupo + Caribe Financial)
6 users created with profiles and demo_users tenant settings

### Task 2: Sign-out navigation
Cookie cleanup + window.location.href = '/login'

### Task 3: Hide GPV signup on login
'Start free' hidden when self-registration is off

### Task 4: Module-aware Perform landing
Financial-primary tenants see Financial data, not empty ICM state

### Task 5: Intelligence null-data guard
No AI narratives from zero data. 'Behind Pace' hidden without calculations.

### Task 6: Domain-agnostic Operate labels
'Total Payout' → 'Last Result' for non-compensation tenants

### Task 7: Persona Switcher routing
Rep → /perform. Identity updates on switch. Failed switch = error toast, not sign-out.

## Acceptance: admin@saborgrupo.mx and admin@caribefinancial.mx login and see correct content"
```

---

## SCOPE — EXACTLY 7 TASKS

| # | Task | What It Fixes |
|---|------|---------------|
| 1 | Create 6 auth users + profiles | Can't login to Sabor/Caribe directly |
| 2 | Sign-out navigation | Broken since HF-030 |
| 3 | Hide GPV signup link | Enterprise login shows self-registration |
| 4 | Module-aware Perform | Empty ICM state on Financial-primary tenant |
| 5 | Intelligence null guard | AI crisis narrative from zero data |
| 6 | Domain-agnostic labels | "Total Payout" on Performance Index tenant |
| 7 | Persona Switcher routing | Rep lands on wrong page, identity doesn't update |

**DO NOT touch: auth middleware, RLS policies, calculation engine, import pipeline, Financial module pages, N+1 fix (PDR-04 is a separate OB).**

---

*ViaLuce.ai — The Way of Light*
*"If the demo persona sees the wrong data, the demo is over."*
