# OB-108: OPERATE LANDING — PIPELINE READINESS INTELLIGENCE
## Replace the static summary with an operations cockpit that tells you what to do next

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items
3. `SCHEMA_REFERENCE.md` — authoritative column reference
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

---

## WHY THIS OB EXISTS

CLT-102 F-2: "Operate landing underwhelming — no guidance, no intelligence, no proximity to next action. Static summary card with text links."

The Operate landing page has failed the Bloodwork specification across **8 prior attempts** (OB-92, OB-94, OB-97, OB-102, HF-063D, OB-104, OB-105, plus sub-phases). Every time, CC builds flat cards with static labels and reports them as done.

**This OB takes a different approach.** Instead of a design specification, this prompt provides:
1. The exact Supabase queries to run
2. The exact data transformations
3. The exact conditional rendering logic
4. The exact text templates

CC implements as written. No interpretation. No "structural skeleton."

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt to git as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**
6. **Supabase .in() ≤ 200 items.**

---

## SCOPE — DELIBERATELY NARROW

**ONE PAGE:** `/operate/page.tsx` (or wherever the Operate landing renders).

**NO sidebar changes. NO new routes. NO new tables. NO auth changes. NO Financial module changes. NO Perform page changes.**

Replace the current Operate page content with an intelligence-driven pipeline readiness cockpit.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "OB-108 PHASE 0: OPERATE LANDING DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CURRENT OPERATE PAGE ==="
wc -l web/src/app/operate/page.tsx
cat web/src/app/operate/page.tsx

echo ""
echo "=== 0B: WHAT DOES IT RENDER? ==="
echo "Look for: static text, hardcoded labels, dummy data, module cards"
grep -n "Pendiente\|No data\|Coming soon\|placeholder\|dummy\|hardcoded\|TODO" \
  web/src/app/operate/page.tsx | head -20

echo ""
echo "=== 0C: WHAT DATA DOES IT FETCH? ==="
grep -n "supabase\|useQuery\|fetch\|getData\|from(\|select(" \
  web/src/app/operate/page.tsx | head -20

echo ""
echo "=== 0D: DOES IT USE SESSION/TENANT CONTEXT? ==="
grep -n "useSession\|useTenant\|tenantId\|tenant_id\|SessionContext\|TenantContext" \
  web/src/app/operate/page.tsx | head -10

echo ""
echo "=== 0E: WHAT COMPONENTS DOES IT IMPORT? ==="
grep -n "^import" web/src/app/operate/page.tsx | head -30

echo ""
echo "=== 0F: SUPABASE DATA AVAILABLE FOR THIS TENANT ==="
echo "--- For Óptica Luminar (has ICM data) ---"
cat <<'SQL'
-- Rule sets
SELECT COUNT(*) as plan_count FROM rule_sets
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' AND status = 'active';

-- Entities
SELECT COUNT(*) as entity_count FROM entities
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- Committed data
SELECT COUNT(*) as data_rows FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- Periods
SELECT COUNT(*) as period_count FROM periods
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- Calculation batches
SELECT id, status, created_at FROM calculation_batches
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 3;

-- Latest calculation results
SELECT COUNT(*) as result_count, SUM(total_payout) as total_payout
FROM calculation_results
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND batch_id = (SELECT id FROM calculation_batches
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1);
SQL

echo ""
echo "--- For Caribe Financial (has plans + roster, no calculation yet) ---"
cat <<'SQL'
SELECT COUNT(*) as plan_count FROM rule_sets
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251' AND status = 'active';

SELECT COUNT(*) as entity_count FROM entities
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

SELECT COUNT(*) as data_rows FROM committed_data
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

SELECT COUNT(*) as period_count FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
SQL
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-108 Phase 0: Operate landing diagnostic" && git push origin dev`

---

## PHASE 1: IMPLEMENT — PIPELINE READINESS COCKPIT

**Replace the content of the Operate landing page** (preserve the page shell, layout imports, session/tenant context hooks — replace the JSX and data fetching).

### THE PAGE MUST SHOW THESE 4 SECTIONS:

---

### SECTION 1: Pipeline Readiness Gauge

**Purpose:** At a glance — is this tenant ready to run calculations? What's missing?

**Data queries:**

```typescript
// Run these queries using the tenant's Supabase client
const [plans, entities, dataRows, periods, batches] = await Promise.all([
  supabase.from('rule_sets').select('id, name, status').eq('tenant_id', tenantId).eq('status', 'active'),
  supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  supabase.from('periods').select('id, label, start_date, end_date').eq('tenant_id', tenantId),
  supabase.from('calculation_batches').select('id, status, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
]);
```

**Readiness steps (4-step pipeline):**

```typescript
const steps = [
  {
    label: 'Plans',
    status: plans.data.length > 0 ? 'complete' : 'needed',
    detail: plans.data.length > 0
      ? `${plans.data.length} active plan${plans.data.length > 1 ? 's' : ''}: ${plans.data.map(p => p.name).join(', ')}`
      : 'No plans configured',
    action: plans.data.length > 0 ? null : { label: 'Import Plan', href: '/admin/launch/plan-import' },
  },
  {
    label: 'Roster',
    status: entities.count > 0 ? 'complete' : 'needed',
    detail: entities.count > 0
      ? `${entities.count.toLocaleString()} entities`
      : 'No roster imported',
    action: entities.count > 0 ? null : { label: 'Import Roster', href: '/data/import/enhanced' },
  },
  {
    label: 'Data',
    status: dataRows.count > 0 ? 'complete' : 'needed',
    detail: dataRows.count > 0
      ? `${dataRows.count.toLocaleString()} records across ${periods.data.length} period${periods.data.length !== 1 ? 's' : ''}`
      : 'No transaction data imported',
    action: dataRows.count > 0 ? null : { label: 'Import Data', href: '/data/import/enhanced' },
  },
  {
    label: 'Calculate',
    status: batches.data.length > 0 ? 'complete' : (dataRows.count > 0 ? 'ready' : 'blocked'),
    detail: batches.data.length > 0
      ? `Last run: ${new Date(batches.data[0].created_at).toLocaleDateString()}`
      : dataRows.count > 0 ? 'Ready to calculate' : 'Waiting for data',
    action: dataRows.count > 0 && batches.data.length === 0
      ? { label: 'Run Calculation', href: '/operate/calculate' }
      : null,
  },
];
```

**Rendering:**

```
┌─────────────────────────────────────────────────────────┐
│  Pipeline Readiness                                      │
│                                                          │
│  ● Plans ──── ● Roster ──── ● Data ──── ○ Calculate     │
│  ✓ 5 plans    ✓ 25 entities  ✓ 98 rows   → Ready        │
│               across 3                                   │
│               periods                                    │
│                                                          │
│                              [Run Calculation →]         │
└─────────────────────────────────────────────────────────┘
```

- Complete steps: filled green circle `●` with `✓`
- Ready (can do next): filled blue circle `●` with action button
- Needed: empty circle `○` with action link
- Blocked: empty grey circle, greyed out

**Rendering rules:**
- Steps connected by a horizontal line (use a flex row with `border-t` between items, or similar)
- Each step: circle indicator → label → detail text → optional action button
- Green circle: `bg-emerald-600 text-white` with check icon
- Blue circle: `bg-blue-600 text-white` (ready state)
- Grey circle: `bg-zinc-700 text-zinc-400` (needed/blocked)
- Action button: small `bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-sm`

---

### SECTION 2: Module Summary Cards

**Purpose:** What does this tenant have? Show modules with health status.

**Rendering:**

For each module the tenant has (ICM if rule_sets exist, Financial if tenant has financial_module enabled):

```
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│  ● ICM                          │  │  ● Financial                     │
│  Incentive Compensation          │  │  Restaurant Operations           │
│                                  │  │                                  │
│  Plans: 5                        │  │  Locations: 20                   │
│  Entities: 25                    │  │  Brands: 3                       │
│  Last calc: Feb 27               │  │  Records: 46,700                 │
│  Status: Ready                   │  │  Status: Active                  │
│                                  │  │                                  │
│  [View Results]  [Import Data]   │  │  [Network Pulse]  [Import Data]  │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

**Health status:**
- `Healthy` (green dot): has plans + entities + data + recent calculation
- `Attention` (amber dot): has data but no recent calculation, or calculation is stale (>30 days)
- `Setup needed` (grey dot): missing plans or entities or data

**Single module = full width.** Dual module = side by side (grid-cols-2).

**ICM module detection:** `rule_sets` with status 'active' exist for tenant.
**Financial module detection:** Check `tenants` table for `modules` JSONB containing 'financial', OR check if `committed_data` has rows with `_sheetName` containing POS/cheque patterns. Use whatever method already exists in the codebase — find it in Phase 0.

---

### SECTION 3: Deterministic Commentary

**Purpose:** One paragraph that summarizes the tenant's operational state. NO AI. Template + data.

```typescript
function buildCommentary(plans, entities, dataRows, periods, batches, tenantName) {
  const parts = [];
  parts.push(`${tenantName} has`);

  if (plans.length === 0) {
    parts.push('no compensation plans configured. Import a plan document to begin.');
    return parts.join(' ');
  }

  parts.push(`${plans.length} active plan${plans.length > 1 ? 's' : ''}`);

  if (entities > 0) {
    parts.push(`covering ${entities.toLocaleString()} entities`);
  } else {
    parts.push('but no roster has been imported');
  }

  if (dataRows > 0 && periods.length > 0) {
    const periodRange = periods.length === 1
      ? periods[0].label
      : `${periods[0].label} through ${periods[periods.length - 1].label}`;
    parts.push(`with ${dataRows.toLocaleString()} data records spanning ${periodRange}`);
  }

  if (batches.length > 0) {
    const lastCalc = new Date(batches[0].created_at);
    const daysAgo = Math.floor((Date.now() - lastCalc.getTime()) / 86400000);
    if (daysAgo === 0) parts.push('— last calculation ran today');
    else if (daysAgo === 1) parts.push('— last calculation ran yesterday');
    else parts.push(`— last calculation ran ${daysAgo} days ago`);
  } else if (dataRows > 0) {
    parts.push('— ready for first calculation run');
  }

  return parts.join(' ') + '.';
}
```

**Rendering:** A single paragraph in `text-zinc-300 text-sm leading-relaxed` above the module cards. No box, no card — just text.

---

### SECTION 4: Quick Actions

**Purpose:** The one thing the user should do next, prominently displayed.

```typescript
function getNextAction(plans, entities, dataRows, batches) {
  if (plans.length === 0) return { label: 'Import Your First Plan', href: '/admin/launch/plan-import', icon: 'FileUp' };
  if (entities === 0) return { label: 'Import Roster', href: '/data/import/enhanced', icon: 'Users' };
  if (dataRows === 0) return { label: 'Import Transaction Data', href: '/data/import/enhanced', icon: 'Upload' };
  if (batches.length === 0) return { label: 'Run First Calculation', href: '/operate/calculate', icon: 'Calculator' };
  return { label: 'View Latest Results', href: '/operate/calculate', icon: 'BarChart3' };
}
```

**Rendering:** A prominent button at the bottom of the page in `bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 text-lg font-medium`. This is THE call to action — the one thing.

---

## PHASE 1 IMPLEMENTATION INSTRUCTIONS

1. Read the current `/operate/page.tsx` (from Phase 0)
2. Preserve: imports for layout, session context, tenant context, Supabase client, any `useEffect` auth pattern
3. Replace: all JSX content and data fetching with the 4 sections above
4. Add the data fetching in a `useEffect` or equivalent (match the pattern the page already uses)
5. Add a loading state: `if (loading) return <div className="animate-pulse">Loading operations overview...</div>`
6. The page title should be: `Operations Overview — {tenantName}`

**CSS rules:**
- All backgrounds: `bg-zinc-900` or `bg-zinc-800/50` (dark theme)
- Text: `text-zinc-100` for headings, `text-zinc-300` for body, `text-zinc-500` for muted
- Cards: `bg-zinc-800/50 border border-zinc-700 rounded-lg p-6`
- No white backgrounds. No light mode.
- Currency formatting: use `toLocaleString()` for numbers. No cents on amounts ≥ MX$10K (PDR-01).

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-108 Phase 1: Operate landing — pipeline readiness cockpit" && git push origin dev`

---

## PHASE 2: VERIFY ACROSS TENANTS

After Phase 1, visit `/operate` for each tenant and verify:

### 2A: Óptica Luminar (full pipeline — plans + roster + data + calculations)
- Pipeline gauge: all 4 steps green
- Module card: ICM, Healthy (green), shows plan count + entity count + last calc date
- Commentary: "Óptica Luminar has 1 active plan covering 24,833 entities with 119,129 data records spanning Jan 2024 through Jul 2024 — last calculation ran X days ago."
- Quick action: "View Latest Results"

### 2B: Caribe Financial (partial — plans + roster + some data, no calculation)
- Pipeline gauge: Plans ✓, Roster ✓, Data ✓, Calculate → "Ready"
- Module card: ICM, Attention (amber — no calculation yet)
- Commentary: "Caribe Financial Group has 5 active plans covering 25 entities with 98 data records spanning Jan 2024 through Mar 2024 — ready for first calculation run."
- Quick action: "Run First Calculation"

### 2C: Pipeline Proof Co (full pipeline)
- Pipeline gauge: all 4 steps green
- Quick action: "View Latest Results"

### 2D: A tenant with no data (if one exists)
- Pipeline gauge: Plans ○, Roster ○, Data ○, Calculate ○ (all needed)
- Module card: Setup needed (grey)
- Commentary: "[Tenant] has no compensation plans configured. Import a plan document to begin."
- Quick action: "Import Your First Plan"

**For each tenant, paste the actual rendered text from the browser.** Not what the code says — what the browser shows.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-108 Phase 2: Multi-tenant verification" && git push origin dev`

---

## PHASE 3: BUILD AND COMPLETION

### 3A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 3B: PDR Verification

| PDR # | In Scope? | Status | Evidence |
|-------|-----------|--------|----------|
| PDR-01 | YES — any currency on /operate | PASS/FAIL | [Verify no cents on amounts ≥ MX$10K] |
| PDR-02 | YES — /operate is the landing | PASS/FAIL | [Shows module cards, not redirect or ICM-only stepper] |
| PDR-03 | NO | — | Not in scope |
| PDR-04 | NOTE | — | [Request count on /operate] |
| PDR-05 | NO | — | Not in scope (no persona filtering on Operate) |
| PDR-06 | NO | — | Not in scope |
| PDR-07 | NO | — | Not in scope |

### 3C: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | /operate renders without console errors | Zero red errors |
| PG-02 | Pipeline gauge shows 4 steps | Plans → Roster → Data → Calculate |
| PG-03 | Óptica: all 4 steps green | Full pipeline tenant |
| PG-04 | Caribe: 3 green + 1 ready | Has data, no calculation |
| PG-05 | Module card shows health status with colored dot | Green/amber/grey |
| PG-06 | Module card shows real counts (plans, entities, data rows) | Not hardcoded |
| PG-07 | Commentary paragraph is visible and data-driven | Template + real data |
| PG-08 | Quick action button shows correct next step per tenant | Varies by tenant state |
| PG-09 | No lifecycle stepper on landing | Stepper belongs in Operations Center |
| PG-10 | Currency follows PDR-01 (no cents ≥ MX$10K) | If any amounts shown |
| PG-11 | npm run build exits 0 | Clean build |
| PG-12 | localhost:3000 responds | HTTP 200 or 307 |
| PG-13 | No auth files modified | git diff confirms |

### 3D: CLT-102 Findings Addressed

| Finding | Description | Resolution |
|---------|-------------|------------|
| CLT102-F2 | Operate landing underwhelming | FIXED — Pipeline readiness gauge + module cards + commentary + quick action |

### 3E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-108: Operate Landing — Pipeline Readiness Intelligence" \
  --body "## Replaces static summary with operations cockpit

### Pipeline Readiness Gauge
4-step visual pipeline: Plans → Roster → Data → Calculate.
Each step shows status (complete/ready/needed/blocked), detail text, and action button.

### Module Summary Cards
ICM and/or Financial module cards with health status (green/amber/grey),
real data counts, and action links.

### Deterministic Commentary
Template-driven paragraph summarizing tenant state. No AI calls.

### Quick Action
One prominent button showing the most important next step for this tenant.

### Multi-Tenant Verified
- Óptica Luminar: full pipeline, all green
- Caribe Financial: 3 green + 1 ready
- Pipeline Proof Co: full pipeline

## CLT-102 F-2 addressed
## PDR-01 verified (currency), PDR-02 verified (module-aware landing)
## No auth files modified"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-108 Complete: Operate landing pipeline readiness cockpit" && git push origin dev`

---

## WHAT THIS OB DOES NOT DO

- Does NOT change the Perform page (separate OB)
- Does NOT change sidebar navigation
- Does NOT change Financial module pages
- Does NOT add AI/LLM calls — all commentary is deterministic
- Does NOT restructure routes
- Does NOT change the calculation engine
- Does NOT touch auth files

**One page. Four sections. Data-driven. Deterministic.**

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Static "Pendiente" or "Coming soon" labels | Every label computed from real data |
| AP-2 | Hardcoded entity counts or plan names | All values from Supabase queries |
| AP-3 | Lifecycle stepper as landing content | Pipeline gauge replaces stepper on landing |
| AP-4 | Module cards without health status | Every card has green/amber/grey dot |
| AP-5 | Commentary without tenant name | Template always starts with tenant name |
| AP-6 | No loading state | Show skeleton while queries run |
| AP-7 | White backgrounds | Dark theme only (bg-zinc-900/800) |
| AP-8 | Cents on large amounts | PDR-01: no cents ≥ MX$10K |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-108: "Show the user what they have, what's missing, and what to do next. In one glance."*
