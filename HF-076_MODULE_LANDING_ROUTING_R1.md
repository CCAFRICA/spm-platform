# HF-076: MODULE-AWARE LANDING ROUTING
## Target: alpha.2.0
## Derived from: CLT-109 F-1, F-7, F-8
## Alpha Exit Criteria: #4 (landing page shows accurate, module-appropriate information)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules, anti-patterns, architecture decision gates
2. `SCHEMA_REFERENCE.md` — authoritative column reference for all Supabase tables

---

## WHY THIS HF EXISTS

The Operate landing page (`/operate`) has failed in 9 consecutive build attempts (OB-92, 94, 97, 102, 104, 105, 108, and sub-phases). CLT-109 proved it shows incorrect data for EVERY tenant tested:

- **Sabor Grupo Gastronomico** (Financial tenant): Shows ICM pipeline readiness gauge, "Run First Calculation" CTA. Sabor runs restaurants — they don't run compensation calculations.
- **Mexican Bank Co / Caribe** (ICM tenant, no calculations): Shows "5 active plans" (actually 4), "ready for first calculation run" (data is invalid), pipeline gauge all green (data hasn't been validated).

**Root cause:** The page queries Supabase for row counts and presents them as pipeline readiness. Row existence ≠ data validity. The page also assumes every tenant runs ICM, ignoring the Financial module entirely.

**The fix:** Stop landing on this page. Route each tenant to the page that best represents their actual state and module usage. This is a routing change, not a page rebuild.

**Scope: 1 file modified. ~30 lines of code. No new routes. No new tables. No auth changes.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (`spm-platform`), NOT from `web/`.
4. Commit this prompt as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**
6. Supabase .in() ≤ 200 items.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-076 PHASE 0: LANDING ROUTING DIAGNOSTIC"
echo "============================================"
echo ""

echo "=== 1. CURRENT OPERATE LANDING PAGE ==="
cat web/src/app/operate/page.tsx | head -60
echo ""
echo "--- File length ---"
wc -l web/src/app/operate/page.tsx
echo ""

echo "=== 2. HOW DOES THE PAGE KNOW WHICH TENANT? ==="
grep -n "tenant\|useTenant\|getTenant\|tenantId\|tenant_id" \
  web/src/app/operate/page.tsx | head -10
echo ""

echo "=== 3. HOW ARE FEATURES/MODULES DETERMINED? ==="
grep -rn "features\|modules\|financial\|icm\|module_type" \
  web/src/app/operate/page.tsx | head -10
echo ""

echo "=== 4. DOES A REDIRECT MECHANISM ALREADY EXIST? ==="
grep -rn "redirect\|router\.push\|router\.replace\|useRouter\|next/navigation" \
  web/src/app/operate/page.tsx | head -10
echo ""

echo "=== 5. CHECK TENANT FEATURES STRUCTURE ==="
# How are tenant features/modules stored?
grep -rn "features\|modules" web/src/lib/ --include="*.ts" \
  | grep -i "tenant\|type\|interface" | head -10
echo ""

echo "=== 6. LAYOUT FILE — DOES IT WRAP /operate? ==="
cat web/src/app/operate/layout.tsx 2>/dev/null | head -30 || echo "No layout.tsx"
echo ""

echo "=== 7. EXISTING ROUTING PATTERNS ==="
# How do other pages handle conditional routing?
grep -rn "redirect\|router\.push\|router\.replace" \
  web/src/app/ --include="page.tsx" | head -10
echo ""

echo "=== 8. VERIFY TARGET ROUTES EXIST ==="
ls -la web/src/app/financial/pulse/page.tsx 2>/dev/null && echo "✓ /financial/pulse exists" || echo "✗ /financial/pulse MISSING"
ls -la web/src/app/operate/calculate/page.tsx 2>/dev/null && echo "✓ /operate/calculate exists" || echo "✗ /operate/calculate MISSING"
ls -la web/src/app/data/import/enhanced/page.tsx 2>/dev/null && echo "✓ /data/import/enhanced exists" || echo "✗ /data/import/enhanced MISSING"
ls -la web/src/app/operate/import/enhanced/page.tsx 2>/dev/null && echo "✓ /operate/import/enhanced exists" || echo "✗ /operate/import/enhanced MISSING"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-076 Phase 0: Landing routing diagnostic" && git push origin dev`

---

## PHASE 1: IMPLEMENT MODULE-AWARE ROUTING

**File:** `web/src/app/operate/page.tsx`

At the TOP of the page component, before ANY rendering, add routing logic. The exact implementation depends on Phase 0 findings (how tenant/features are accessed), but the logic is:

```typescript
// Module-aware landing routing — Decision 57
// After 9 failed attempts at building this page, route to the best page for each tenant.

async function determineModuleLanding(
  tenantId: string,
  tenantFeatures: Record<string, any>,
  supabase: SupabaseClient
): Promise<string | null> {
  
  // 1. Financial-ONLY tenant → Network Pulse (their primary workspace)
  const hasFinancial = tenantFeatures?.financial === true || tenantFeatures?.modules?.includes('financial');
  const hasICM = tenantFeatures?.icm === true || tenantFeatures?.modules?.includes('icm');
  
  if (hasFinancial && !hasICM) {
    return '/financial/pulse';
  }
  
  // 2. Dual-module tenant → route to whichever module has more recent activity
  if (hasFinancial && hasICM) {
    const [calcResult, finResult] = await Promise.all([
      supabase.from('calculation_batches')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase.from('committed_data')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .eq('data_type', 'pos_cheque')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    
    const lastCalc = calcResult.data?.[0]?.created_at;
    const lastFinancial = finResult.data?.[0]?.created_at;
    
    // If financial has data and ICM doesn't, or financial is more recent → Financial
    if (lastFinancial && (!lastCalc || new Date(lastFinancial) > new Date(lastCalc))) {
      return '/financial/pulse';
    }
    // Otherwise fall through to ICM logic below
  }
  
  // 3. ICM tenant WITH completed calculations → calculation results
  const { count: calcCount } = await supabase
    .from('calculation_batches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'completed');
  
  if (calcCount && calcCount > 0) {
    return '/operate/calculate';
  }
  
  // 4. ICM tenant WITH committed data but no calculations → import (they need to calculate)
  const { count: dataCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  
  if (dataCount && dataCount > 0) {
    return '/operate/import/enhanced';
  }
  
  // 5. Empty tenant → import (start here)
  return '/operate/import/enhanced';
}
```

**Then use it in the page component:**

If it's a Server Component:
```typescript
import { redirect } from 'next/navigation';

export default async function OperatePage() {
  // ... existing tenant/supabase setup ...
  
  const targetRoute = await determineModuleLanding(tenantId, features, supabase);
  if (targetRoute) {
    redirect(targetRoute);
  }
  
  // Fallback: render the existing page content (should rarely reach here)
  return ( /* existing JSX */ );
}
```

If it's a Client Component:
```typescript
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Inside the component:
const router = useRouter();

useEffect(() => {
  async function routeToModule() {
    const targetRoute = await determineModuleLanding(tenantId, features, supabase);
    if (targetRoute) {
      router.replace(targetRoute); // replace, not push — don't add to history
    }
  }
  if (tenantId) routeToModule();
}, [tenantId]);
```

**IMPORTANT:** Use `router.replace()` not `router.push()` — replace prevents the user from hitting "Back" and landing on the Operate page again.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-076 Phase 1: Module-aware landing routing — Decision 57" && git push origin dev`

---

## PHASE 2: VERIFY ALL TENANT ROUTES

After the dev server is running, manually test each tenant by switching in the UI:

```bash
echo "============================================"
echo "HF-076 PHASE 2: ROUTE VERIFICATION"
echo "============================================"

# Check that the target pages actually render without errors
echo ""
echo "=== Test target routes exist and build ==="
# The build in Phase 1 confirms no compile errors.
# Now verify the routing logic by checking tenant features in the database:

echo ""
echo "=== Tenant features check ==="
# Print what features each tenant has so we can predict routing
grep -rn "Sabor\|Optica\|Caribe\|Mexican Bank\|Pipeline\|RetailPLG" \
  web/src/ --include="*.ts" --include="*.tsx" \
  | grep -i "feature\|module\|financial\|icm" | head -20
```

**Manual browser verification (do this for each tenant):**

1. **Óptica Luminar** → Navigate to /operate → should redirect to /operate/calculate
   - Reason: ICM tenant with completed calculations
   
2. **Sabor Grupo Gastronomico** → Navigate to /operate → should redirect to /financial/pulse
   - Reason: Has Financial module, POS data is more recent than any ICM activity
   
3. **Mexican Bank Co (Caribe)** → Navigate to /operate → should redirect to /operate/import/enhanced
   - Reason: ICM tenant with committed data but no completed calculations
   
4. **Pipeline Proof Co** → Navigate to /operate → should redirect to /operate/calculate
   - Reason: ICM tenant with completed calculations
   
5. **RetailPLGMX** → Navigate to /operate → should redirect to /operate/import/enhanced
   - Reason: Empty/minimal tenant

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-076 Phase 2: Tenant routing verification" && git push origin dev`

---

## PHASE 3: BUILD AND COMPLETE

### 3A: Clean Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit code: $?"
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 3B: Proof Gates (8)

| # | Gate | Criterion | Evidence |
|---|------|-----------|----------|
| PG-01 | npm run build exits 0 | Clean build | Build log |
| PG-02 | localhost:3000 responds | HTTP 200 or 307 | curl output |
| PG-03 | Sabor → /financial/pulse | Financial tenant lands on Network Pulse | Browser URL |
| PG-04 | Óptica → /operate/calculate | ICM+calcs lands on results | Browser URL |
| PG-05 | Caribe/MBC → /operate/import/enhanced | ICM no calcs lands on import | Browser URL |
| PG-06 | Pipeline Proof → /operate/calculate | ICM+calcs lands on results | Browser URL |
| PG-07 | No auth files modified | `git diff --name-only` shows no auth files | Diff output |
| PG-08 | Back button doesn't return to /operate | `router.replace` used, not `push` | Code review |

### 3C: CLT-109 Findings Addressed

| Finding | Description | How Fixed |
|---------|-------------|-----------|
| CLT109-F1 | Sabor sees ICM pipeline for Financial tenant | Sabor → /financial/pulse |
| CLT109-F7 | Caribe shows wrong plan count, invalid CTA | Caribe → /operate/import/enhanced |
| CLT109-F8 | Every tenant shows misleading landing page | Module-aware routing bypasses the page |

### 3D: Release Context

```
Target: alpha.2.0
PR: [number from gh pr create]
Verified by: CLT-112
```

### 3E: Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-076: Module-Aware Landing Routing [alpha.2.0]" \
  --body "## Target: alpha.2.0
## Derived from: CLT-109 F-1/F-7/F-8 (Decision 57)

### What Changed
/operate now routes to the best page for each tenant based on module usage and data state:
- Financial-primary → /financial/pulse (Network Pulse)
- ICM with completed calculations → /operate/calculate (Results)
- ICM with data, no calculations → /operate/import/enhanced (Import)
- Empty tenant → /operate/import/enhanced (Import)
- Dual-module → whichever module has more recent activity

### Why
After 9 failed attempts at the Operate landing page, the correct answer is to stop landing there. Every tenant now lands on a page that accurately represents their state.

### Routing Logic
1. Financial-only → Network Pulse
2. Dual-module → most recent activity wins
3. ICM + completed calcs → Calculate/Results
4. ICM + data, no calcs → Import
5. Empty → Import

8 proof gates. No auth files modified. 1 file changed (~30 lines)."
```

**Final commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-076 Complete: Module-aware landing routing — targeting alpha.2.0" && git push origin dev`

---

## WHAT THIS HF DOES NOT DO

| Item | Why Excluded | Where Handled |
|------|-------------|---------------|
| Rebuild the Operate landing page | 9 failed attempts. Route around it. | Future alpha.3.0 |
| Fix plan count accuracy on landing | Page is bypassed, count doesn't display | — |
| Fix pipeline readiness gauge | Page is bypassed | — |
| Navigation/sidebar changes | Needs design session | S30 → alpha.3.0 |
| Financial module enhancements | Separate scope | alpha.3.0 |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Skip Phase 0 diagnostic | Phase 0 reveals how tenant features are accessed — MUST know this |
| AP-4 | Define routing function but never call it | Verify the redirect actually fires in the page component |
| AP-6 | Git from web/ | cd to spm-platform root first |
| AP-15 | Use router.push instead of router.replace | push creates back-button loop. MUST use replace. |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-076: "After 9 attempts, the smartest landing page is no landing page."*
