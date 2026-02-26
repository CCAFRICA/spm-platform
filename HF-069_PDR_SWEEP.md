# HF-069: PDR SWEEP — CURRENCY + PERSONA + BRAND CARDS + AMBER THRESHOLD
## Four persistent defects. Four surgical phases. Browser screenshots or it didn't happen.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — MANDATORY

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply (v2.0+)
2. `PERSISTENT_DEFECT_REGISTRY.md` — the EXACT item definitions. Do NOT rename, reinterpret, or substitute these items. You will verify these definitions in the completion report.
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

**If you have not read all four files, STOP and read them now.**

---

## WHY THIS HF EXISTS

PDR-01, PDR-05, PDR-06, and PDR-07 are cosmetic and UX defects that have each survived multiple fix cycles. They have been scoped in OB-99, OB-100, OB-101, OB-102, HF-060, and HF-063. Each time, the completion report says PASS. Each time, the browser disagrees.

These defects individually seem minor. Collectively they destroy demo credibility:
- **PDR-01:** Currency amounts showing `.00` on a MX$1,035,811.00 payout makes the platform look unfinished
- **PDR-05:** A Rep persona seeing the full admin view makes persona filtering look broken (it is)
- **PDR-06:** Brand cards at the bottom of the page instead of as section headers makes the hierarchy invisible
- **PDR-07:** Every location showing green (no amber) makes the performance comparison useless

This HF is different from previous attempts:
1. **One phase per PDR item** — not bundled with feature work
2. **Diagnostic FIRST** — document what the browser currently shows before writing any fix
3. **Grep verification** — prove the fix is comprehensive (no stray `toLocaleString`, no remaining `user.role`)
4. **No new features** — verify and fix, nothing else
5. **Surgical scope** — touch only the files needed for each PDR item

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (auth-service.ts, session-context.tsx, auth-shell.tsx, middleware.ts).
6. **Supabase .in() ≤ 200 items per call.**

---

## SCOPE BOUNDARIES

### IN SCOPE
- PDR-01: Currency formatting — platform-wide sweep
- PDR-05: Persona filtering — effectivePersona enforcement
- PDR-06: Brand cards as collapsible section headers
- PDR-07: Amber threshold ±5%
- PDR-04: NOTE only — count network requests, do not attempt systemic fix

### OUT OF SCOPE — DO NOT TOUCH
- **Auth files** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx) — NEVER
- Landing pages (/operate, /perform) — OB-105 scope
- Observatory — HF-067 completed
- Import pipeline — HF-068 scope
- Calculation engine
- Sidebar / navigation restructuring
- New features, new components, new pages
- PDR-02 (module-aware landing) — OB-105 scope
- PDR-03 (Bloodwork Financial landing) — OB-105 scope
- New Supabase tables or migrations

---

## PHASE 0: DIAGNOSTIC — BROWSER TRUTH FOR ALL 4 PDR ITEMS

Before changing ANY code, document what the browser CURRENTLY shows for each item.

### 0A: PDR-01 — Currency No Cents

```bash
echo "============================================"
echo "HF-069 PHASE 0: PDR SWEEP DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: PDR-01 — CURRENCY FORMATTING ==="
echo ""
echo "--- Where is the currency formatting utility? ---"
grep -rn "formatTenantCurrency\|formatCurrency\|formatAmount\|formatMoney" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- What threshold does it use? ---"
for f in $(grep -rln "formatTenantCurrency\|formatCurrency\|formatAmount" web/src/lib/ web/src/types/ web/src/utils/ 2>/dev/null | grep -v node_modules | head -5); do
  echo "--- $f ---"
  grep -A 15 "function format\|const format\|export.*format" "$f" | head -20
  echo ""
done
echo ""
echo "--- Pages still using raw toLocaleString or toFixed for currency ---"
grep -rn "toLocaleString\|\.toFixed" web/src/app/financial/ web/src/app/operate/ web/src/app/perform/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -iv "date\|time\|number.*format" | head -20
echo ""
echo "--- Pages still using Intl.NumberFormat directly for currency ---"
grep -rn "NumberFormat.*currency\|style.*currency" web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10
```

### 0B: PDR-05 — Persona Filtering

```bash
echo ""
echo "=== 0B: PDR-05 — PERSONA FILTERING ==="
echo ""
echo "--- Where is effectivePersona defined/derived? ---"
grep -rn "effectivePersona\|usePersona\|PersonaContext\|derivePersona" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- Any remaining user.role references in data-fetching code? ---"
grep -rn "user\.role\|user\[.role.\]\|profile\.role" web/src/app/ web/src/hooks/ web/src/lib/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "type\|interface\|Type\|\.d\.ts" | head -20
echo ""
echo "--- DemoPersonaSwitcher — does it set entity scope? ---"
grep -rn "DemoPersonaSwitcher\|PersonaSwitcher" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
for f in $(grep -rln "DemoPersonaSwitcher\|PersonaSwitcher" web/src/components/ 2>/dev/null | head -3); do
  echo "--- $f ---"
  grep -A 5 "setPersona\|setOverride\|handleSwitch\|onChange" "$f" | head -20
  echo ""
done
echo ""
echo "--- Financial pages: do they use effectivePersona for data filtering? ---"
grep -rn "effectivePersona\|scopeEntityIds\|persona" web/src/app/financial/ --include="*.tsx" | head -15
```

### 0C: PDR-06 — Brand Cards

```bash
echo ""
echo "=== 0C: PDR-06 — BRAND CARDS ==="
echo ""
echo "--- Network Pulse page (where brand cards should appear) ---"
find web/src -path "*financial*pulse*" -name "*.tsx" -o -path "*financial*page*" -name "*.tsx" 2>/dev/null | head -5
echo ""
echo "--- Brand card rendering logic ---"
grep -rn "brand\|Brand\|Costa Azul\|Fuego\|Rápido\|collaps\|Collaps\|expand\|section.*header\|groupBy.*brand" web/src/app/financial/ --include="*.tsx" | head -20
echo ""
echo "--- Is there a brand grouping component? ---"
find web/src -name "*Brand*" -o -name "*brand*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -10
echo ""
echo "--- Are locations nested under brands? ---"
grep -rn "group\|Group\|section\|Section\|header\|Header" web/src/app/financial/ --include="*.tsx" | grep -iv "import\|type\|interface" | head -15
```

### 0D: PDR-07 — Amber Threshold

```bash
echo ""
echo "=== 0D: PDR-07 — AMBER THRESHOLD ==="
echo ""
echo "--- Color assignment logic in Financial pages ---"
grep -rn "amber\|green\|red\|color\|threshold\|0\.05\|5%\|±5\|average\|avg" web/src/app/financial/ --include="*.tsx" | head -20
echo ""
echo "--- Where is the performance color function? ---"
grep -rn "getColor\|performanceColor\|statusColor\|healthColor\|getStatus" web/src/app/financial/ web/src/lib/financial/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- What is the threshold math? ---"
for f in $(grep -rln "amber\|threshold\|0\.05\|±5" web/src/app/financial/ web/src/lib/financial/ 2>/dev/null | head -5); do
  echo "--- $f ---"
  grep -B 3 -A 10 "amber\|threshold\|0\.05" "$f" | head -30
  echo ""
done
```

### 0E: PDR-04 — N+1 Request Count (NOTE ONLY)

```bash
echo ""
echo "=== 0E: PDR-04 — N+1 NOTE ==="
echo ""
echo "MANUAL CHECK:"
echo "1. Open Financial Network Pulse in browser"
echo "2. Open Network tab (clear first)"
echo "3. Count total requests after page fully loads"
echo "4. Record the number (target: < 100)"
echo ""
echo "Context providers with Supabase calls:"
grep -rn "\.from(" web/src/contexts/ --include="*.tsx" | wc -l
echo " Supabase calls in context providers"
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — HF-069
//
// PDR-01 CURRENT STATE:
// Currency formatter: [exists at FILE, uses threshold AMOUNT]
// Raw toLocaleString/toFixed found in: [list files, count]
// Pages NOT using the formatter: [list]
//
// PDR-05 CURRENT STATE:
// effectivePersona hook: [exists at FILE]
// user.role references remaining: [count, list files]
// DemoPersonaSwitcher sets entity scope: [yes/no]
// Financial pages use effectivePersona: [yes/no]
//
// PDR-06 CURRENT STATE:
// Brand grouping: [brands above locations / brands at bottom / no grouping]
// Collapsible: [yes/no]
// Brand card shows: [list of stats displayed]
//
// PDR-07 CURRENT STATE:
// Color function: [exists at FILE]
// Threshold: [±5% / ±10% / other]
// Amber locations visible: [yes/no]
//
// PDR-04 NOTE:
// Request count on Financial page: [number]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Phase 0: PDR sweep diagnostic — current state of all 4 items" && git push origin dev`

**Do NOT write fix code until Phase 0 is committed.**

---

## PHASE 1: PDR-01 — CURRENCY NO CENTS

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — do NOT change this definition)
> All currency displays ≥ MX$10,000 render as whole numbers. No `.00`, no decimal cents.
> **Correct:** MX$1,035,811 · MX$17,023,895 · MX$977,524
> **Wrong:** MX$1,035,811.00 · MX$17,023,894.85 · MX$977,524.00
> **Exception:** Per-check averages and tip amounts below MX$10,000 may retain cents (MX$361.82 is meaningful).
> **Scope:** Platform-wide. Every page, every module, every persona.

### 1A: Ensure a Single Canonical Currency Formatter Exists

There must be ONE function that all currency displays use. If it exists, verify. If not, create it.

```typescript
// Expected location: web/src/lib/utils/format-currency.ts (or similar)

/**
 * Format currency for display.
 * - Amounts >= 10,000: no decimals (MX$1,035,811)
 * - Amounts < 10,000: show cents (MX$361.82) — meaningful for per-check/tip amounts
 * 
 * @param amount - The numeric amount
 * @param currency - Currency code (default: 'MXN')
 * @param locale - Locale string (default: 'es-MX')
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = 'MXN',
  locale: string = 'es-MX'
): string {
  if (amount == null || isNaN(amount)) return '—';
  
  const useDecimals = Math.abs(amount) < 10_000;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  }).format(amount);
}
```

### 1B: Platform-Wide Sweep — Replace All Raw Currency Formatting

Find and replace every instance of raw currency formatting with the canonical function:

```bash
# Find all currency formatting that bypasses the canonical function
grep -rn "toLocaleString\|\.toFixed\|NumberFormat.*currency\|style.*currency" \
  web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" | grep -v "format-currency\|formatCurrency"
```

For each file found:
1. Import the canonical `formatCurrency` function
2. Replace the raw formatting call with `formatCurrency(amount, tenant?.currency)`
3. Verify the amount variable is a number (not a pre-formatted string)

**Critical:** This is platform-wide. Check EVERY directory:
- `web/src/app/financial/` — all Financial pages
- `web/src/app/operate/` — Results Dashboard, Operations Center
- `web/src/app/perform/` — all persona dashboards
- `web/src/components/` — shared components (InsightPanel, RepTrajectory, etc.)
- `web/src/components/platform/` — Observatory components (just fixed in HF-067)

### 1C: Verification

```bash
# After fix: ZERO raw currency formatting outside the canonical function
echo "=== PDR-01 VERIFICATION ==="
echo "--- Raw toLocaleString remaining (should be 0 for currency) ---"
grep -rn "toLocaleString" web/src/app/ web/src/components/ --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" \
  | grep -iv "date\|time" | wc -l
echo ""
echo "--- Raw toFixed remaining (should be 0 for currency) ---"
grep -rn "\.toFixed" web/src/app/ web/src/components/ --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | wc -l
echo ""
echo "--- All formatCurrency usages ---"
grep -rn "formatCurrency\|formatTenantCurrency" web/src/app/ web/src/components/ --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | wc -l
echo " total usages of canonical formatter"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Phase 1: PDR-01 Currency no cents — platform-wide sweep" && git push origin dev`

---

## PHASE 2: PDR-05 — PERSONA FILTERING

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — do NOT change this definition)
> All scope/filtering decisions use `effectivePersona = override ?? derivePersona(user, capabilities)`. Never check `user.role` (always returns `vl_admin` for demo accounts). DemoPersonaSwitcher override must flow through scope derivation. Override must be in useEffect dependency arrays.
> **Correct:** Rep persona sees Server Detail (scoped to their locations/data).
> **Wrong:** Rep persona sees full admin Network Pulse view.
> **Scope:** Every page that filters by persona. Every useEffect that uses persona for data fetching.

### 2A: Find All `user.role` References in Business Logic

```bash
# Find user.role in data-fetching, filtering, and rendering logic
# Exclude type definitions and interfaces — we only care about RUNTIME usage
grep -rn "user\.role\|user\[.role.\]\|profile\.role\|\.role ==\|\.role !=" \
  web/src/app/ web/src/hooks/ web/src/lib/ web/src/components/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" \
  | grep -v "type \|interface \|Type\|\.d\.ts\|// " \
  | head -30
```

### 2B: Replace Each `user.role` With `effectivePersona`

For each file found in 2A:
1. Import `usePersona` or access `effectivePersona` from the appropriate context
2. Replace `user.role` with `effectivePersona`
3. If inside a `useEffect`, add `effectivePersona` to the dependency array

### 2C: Verify DemoPersonaSwitcher Sets Entity Scope

The DemoPersonaSwitcher must set not just the persona label but the entity scope:
- Admin → no scope restriction (sees everything)
- Manager → scoped to their team/zone entities
- Rep → scoped to their individual entity

```bash
# Check if switching persona also updates scopeEntityIds
grep -rn "scopeEntity\|entityScope\|setScope\|persona.*entity\|entity.*persona" \
  web/src/components/ web/src/contexts/ web/src/hooks/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" | head -15
```

If the persona switcher only sets a label but not the entity scope, that's the root cause of Rep seeing admin data. Fix by:
1. When persona switches to 'rep': look up which entity this rep is (from entities table or seed data)
2. Set scopeEntityIds to that entity's ID
3. All data-fetching hooks must respect scopeEntityIds

### 2D: Verify Financial Pages Use effectivePersona

```bash
# After fix: Financial pages should reference effectivePersona, not user.role
echo "=== PDR-05 VERIFICATION ==="
echo "--- user.role remaining in business logic (should be 0) ---"
grep -rn "user\.role\|profile\.role" \
  web/src/app/ web/src/hooks/ web/src/lib/ web/src/components/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" \
  | grep -v "type \|interface \|Type\|\.d\.ts\|// " | wc -l
echo ""
echo "--- effectivePersona usages ---"
grep -rn "effectivePersona" web/src/app/ web/src/components/ --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | wc -l
echo " total effectivePersona usages"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Phase 2: PDR-05 Persona filtering — effectivePersona enforcement" && git push origin dev`

---

## PHASE 3: PDR-06 — BRAND CARDS AS COLLAPSIBLE SECTION HEADERS

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — do NOT change this definition)
> Brand cards (Costa Azul, Fuego Dorado, Rápido Verde) appear ABOVE their location groups as section headers. They are collapsible — click to expand/collapse their location group. They show: brand name, service type badge, location count, total revenue, avg per-location, tip rate.
> **Correct:** Brand header → locations nested below, expandable/collapsible.
> **Wrong:** Brand cards at bottom of page. Brand cards not labeled. Brand cards not interactive.

### 3A: Find the Network Pulse Rendering

```bash
# Find where locations and brands render on Financial pages
grep -rn "location\|Location\|brand\|Brand" web/src/app/financial/ --include="*.tsx" \
  | grep -i "map\|render\|return\|card\|grid\|list" | head -20
```

### 3B: Implement Brand Grouping

The Network Pulse page must:

1. **Group locations by brand** — data structure should be `Map<brandName, Location[]>`
2. **Render brand header before its locations:**

```
For each brand:
  <BrandHeader>
    [Expand/Collapse icon] [Brand Name] — [Service Type Badge] — [Location Count] locations
    Revenue: MX$X,XXX,XXX | Avg/Location: MX$XXX,XXX | Tip Rate: X.X%
  </BrandHeader>
  
  {isExpanded && (
    <LocationGrid>
      [Location Card 1] [Location Card 2] [Location Card 3] ...
    </LocationGrid>
  )}
```

3. **Collapsible state:** Use React `useState` per brand, default expanded
4. **Brand header must be visually distinct:** Wider than location cards, different background shade, larger text
5. **Stats on the brand header:** brand name, service type badge, location count, total revenue, average per-location, tip rate

### 3C: Do NOT Create a New Component Unless Necessary

If a brand card component already exists from OB-100, verify it works and wire it correctly. If not, create a minimal one. Do not build an elaborate component — this is a layout fix, not a feature.

### 3D: Verification

```bash
echo "=== PDR-06 VERIFICATION ==="
echo "--- Brand grouping in Financial pages ---"
grep -rn "groupBy\|group.*brand\|brandGroup\|groupedLocations\|brandLocations" \
  web/src/app/financial/ --include="*.tsx" | head -10
echo ""
echo "--- Collapsible state ---"
grep -rn "expand\|collapse\|isOpen\|isExpanded\|toggle" \
  web/src/app/financial/ --include="*.tsx" | head -10
echo ""
echo "--- Brand card renders ABOVE locations ---"
echo "MANUAL CHECK: Open Financial Network Pulse in browser"
echo "Verify: Costa Azul header → its locations → Fuego Dorado header → its locations → Rápido Verde header → its locations"
echo "Verify: Click on a brand header collapses/expands its location group"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Phase 3: PDR-06 Brand cards as collapsible section headers" && git push origin dev`

---

## PHASE 4: PDR-07 — AMBER THRESHOLD ±5%

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — do NOT change this definition)
> Location performance colors use ±5% threshold from network/brand average.
> **Correct:** Green = above average. Amber = within ±5% of average. Red = below 95% of average.
> **Wrong:** ±10% threshold (too wide for restaurant data — everything looks green).

### 4A: Find the Color Assignment Function

```bash
grep -rn "getColor\|performanceColor\|statusColor\|healthColor\|getPerformance\|getStatus" \
  web/src/app/financial/ web/src/lib/financial/ web/src/components/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
```

### 4B: Verify or Fix the Threshold Math

The function should implement:

```typescript
function getPerformanceColor(value: number, average: number): 'green' | 'amber' | 'red' {
  if (average === 0) return 'green'; // Avoid division by zero
  
  const ratio = value / average;
  
  if (ratio >= 1.0) return 'green';       // At or above average
  if (ratio >= 0.95) return 'amber';      // Within ±5% (95-100% of average)
  return 'red';                            // Below 95% of average
}
```

**CRITICAL:** The threshold is **±5%** from average (Decision 42). This means:
- Green: value ≥ average (100%+)
- Amber: value between 95% and 100% of average
- Red: value < 95% of average

If the current implementation uses ±10% (ratio >= 0.90 for amber), change it to 0.95.

### 4C: Verify at Least One Amber Location

With ±5%, there SHOULD be at least one amber location in the Sabor Grupo data (20 locations across 3 brands — it's statistically very unlikely all are above or below 5% of average).

If zero locations show amber:
1. Check the data: are ALL locations really >100% of average? That would mean the threshold is working but the data is skewed.
2. More likely: the color function isn't being called, or the color isn't being rendered (CSS issue).

```bash
echo "=== PDR-07 VERIFICATION ==="
echo "--- Threshold value in code ---"
grep -rn "0\.95\|0\.9[0-9]\|threshold\|±5\|±10" \
  web/src/app/financial/ web/src/lib/financial/ --include="*.tsx" --include="*.ts" | head -10
echo ""
echo "--- Where is the color applied to location cards? ---"
grep -rn "amber\|yellow\|#f59e0b\|warning\|bg-amber\|text-amber\|border-amber" \
  web/src/app/financial/ --include="*.tsx" | head -10
echo ""
echo "MANUAL CHECK:"
echo "Open Financial Network Pulse in browser"
echo "Look for at least one amber/yellow location card"
echo "If all green: check whether the color function is called at all"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Phase 4: PDR-07 Amber threshold ±5% enforcement" && git push origin dev`

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

### 5A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 5B: Persistent Defect Registry — Verification

**Use the EXACT definitions from PERSISTENT_DEFECT_REGISTRY.md. Do NOT rename or substitute.**

| PDR # | PDR Definition (from PERSISTENT_DEFECT_REGISTRY.md) | In Scope | Status | Evidence |
|-------|------------------------------------------------------|----------|--------|----------|
| PDR-01 | Currency ≥ MX$10,000 shows no cents | YES | PASS/FAIL | [Describe: which pages checked, what amounts display, grep results showing 0 raw formatters] |
| PDR-02 | Module-aware Operate landing (Decision 46) | NO | — | Not in scope — OB-105 |
| PDR-03 | Bloodwork Financial landing page | NO | — | Not in scope — OB-105 |
| PDR-04 | Page loads < 100 network requests | NOTE | PASS/FAIL | [Request count on Financial Network Pulse] |
| PDR-05 | effectivePersona not user.role for filtering | YES | PASS/FAIL | [Describe: grep results showing 0 user.role in business logic, Rep persona test result] |
| PDR-06 | Brand cards as collapsible section headers | YES | PASS/FAIL | [Describe: brand order on page, collapsible behavior, stats shown on brand header] |
| PDR-07 | Amber threshold ±5% visible | YES | PASS/FAIL | [Describe: threshold value in code, amber locations visible or not, if not — why] |

**PDR-01, PDR-05, PDR-06, and PDR-07 are IN SCOPE and MUST show PASS with evidence. FAIL on any blocks the PR.**

### 5C: Completion Report

Create `HF-069_COMPLETION_REPORT.md` at PROJECT ROOT:

1. **Phase 0 diagnostic** — what each PDR item showed before fixes
2. **PDR-01 fix:**
   - Currency formatter location and threshold (MX$10,000)
   - Files modified to use canonical formatter
   - Grep verification: raw toLocaleString/toFixed count before → after (target: 0)
3. **PDR-05 fix:**
   - user.role references found and replaced
   - effectivePersona wiring confirmed
   - DemoPersonaSwitcher entity scope status
   - Rep persona test: scoped view or admin view?
4. **PDR-06 fix:**
   - Brand grouping implementation
   - Collapsible behavior
   - Brand header stats (brand name, location count, revenue, avg, tip rate)
   - Visual: brands render above their location groups
5. **PDR-07 fix:**
   - Threshold value: ±5% confirmed (0.95 ratio)
   - Color function location
   - Amber locations visible: yes/no
   - If no amber: explanation (data distribution or code issue)
6. **PDR-04 note:** Request count on Financial page (no fix attempted)
7. **All proof gates** PASS/FAIL with evidence

### 5D: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Currency formatter exists | Single canonical function with 10,000 threshold |
| PG-02 | Currency sweep complete | 0 raw toLocaleString/toFixed for currency in app/ and components/ |
| PG-03 | Financial amounts no cents | Amounts ≥ MX$10K display without .00 |
| PG-04 | Small amounts retain cents | Amounts < MX$10K display with .XX |
| PG-05 | No user.role in business logic | 0 user.role references in data-fetching/filtering code |
| PG-06 | effectivePersona used | Financial pages reference effectivePersona or usePersona |
| PG-07 | Rep persona scoped | Rep on Financial pages sees scoped view, not full admin |
| PG-08 | Brands above locations | Brand headers render above their location groups |
| PG-09 | Brands collapsible | Click on brand header toggles location visibility |
| PG-10 | Brand stats visible | Brand header shows: name, location count, revenue, avg, tip rate |
| PG-11 | Threshold is ±5% | Code uses 0.95 ratio, not 0.90 |
| PG-12 | Amber visible | At least 1 amber location on Network Pulse (or documented data reason) |
| PG-13 | No regression | Financial pages still render with data, no console errors |
| PG-14 | `npm run build` | Exits 0 |
| PG-15 | localhost:3000 | Responds with 200 |

### 5E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-069: PDR Sweep — Currency, Persona, Brand Cards, Amber Threshold" \
  --body "## Problem
Four persistent defects (PDR-01, PDR-05, PDR-06, PDR-07) have survived multiple
fix cycles across OB-99, OB-100, OB-101, OB-102, HF-060, and HF-063. Each time
completion reports say PASS. Each time browser disagrees.

## Fix Approach
One surgical phase per PDR item. Diagnostic first. Grep verification. No new features.

### PDR-01: Currency No Cents (Platform-Wide)
- Single canonical formatCurrency function with MX\$10,000 threshold
- All raw toLocaleString/toFixed/NumberFormat calls replaced
- Amounts ≥ MX\$10K: no decimals. Amounts < MX\$10K: retain cents.

### PDR-05: Persona Filtering
- All user.role references in business logic replaced with effectivePersona
- DemoPersonaSwitcher entity scope verified
- Rep persona sees scoped Financial view

### PDR-06: Brand Cards as Section Headers
- Locations grouped by brand
- Brand header renders above its location group
- Collapsible: click to expand/collapse
- Brand header shows: name, service type, location count, revenue, avg, tip rate

### PDR-07: Amber Threshold ±5%
- Performance color function uses 0.95 ratio (not 0.90)
- Green: ≥ average. Amber: 95-100% of average. Red: < 95% of average.
- At least 1 amber location visible on Network Pulse

## PDR Items Addressed: PDR-01, PDR-05, PDR-06, PDR-07
## Proof Gates: 15 — see HF-069_COMPLETION_REPORT.md"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-069 Complete: PDR sweep — currency, persona, brand cards, amber threshold" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Rename PDR definitions to match what was built | Use EXACT definitions from PERSISTENT_DEFECT_REGISTRY.md |
| AP-2 | Report PASS without browser evidence | Describe what renders, not what the code says |
| AP-3 | Change the currency threshold | MX$10,000 as defined in PDR-01. Not MX$1,000. Read the file. |
| AP-4 | Fix one page, miss others | Platform-wide grep sweep for currency. All Financial pages for persona. |
| AP-5 | Build new features instead of fixing | Verify and fix. Nothing else. |
| AP-6 | Broad refactoring | Minimal surgical fixes. Touch only what each PDR requires. |
| AP-7 | Modify auth files | DO NOT TOUCH. Auth works. |
| AP-8 | Touch Observatory (HF-067) | Already fixed and merged. Leave it alone. |
| AP-9 | Touch import pipeline (HF-068) | Separate scope. Leave it alone. |
| AP-10 | Skip the diagnostic phase | Phase 0 committed BEFORE any fix code. Every time. |

---

## CRITICAL REMINDER

This is the **4th+ attempt** at fixing these items. The difference this time:
1. Each PDR item gets its own dedicated phase — not buried in a 12-phase OB
2. Phase 0 establishes browser truth before any code changes
3. Grep verification proves completeness — not just "I fixed the one file I found"
4. The completion report uses EXACT PDR definitions — not CC's reinterpretation
5. Evidence describes what RENDERS, not what the code SAYS

If Phase 0 shows that a PDR item is already PASS (previous fix held), document it as PASS with evidence and move to the next phase. Don't fix what isn't broken. Don't touch what works.

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-069: "Four defects. Four phases. No interpretation. No substitution. Browser truth only."*
