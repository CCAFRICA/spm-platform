# OB-105: OPERATE & PERFORM LANDING PAGES — BLOODWORK IMPLEMENTATION
## Replace skeleton pages with actual Bloodwork dashboards. No interpretation. File replacement.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply (v3.0)
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
3. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS OB EXISTS — AND WHY IT'S DIFFERENT

The `/operate` and `/perform` landing pages have failed to match the Bloodwork specification across **7 prior attempts**: OB-92, OB-94, OB-97, OB-102, HF-063D, OB-104, and multiple sub-phases within those. Every time, CC builds a structural skeleton — two cards with raw labels — and reports it as done. The specification describes health scoring, deterministic commentary, color-coded status, data freshness indicators, and anomaly counts. The implementation delivers flat cards with "Pendiente" and "Ninguno."

**Root cause identified:** CC interprets design descriptions and builds what it understands. What it understands is "show a card for each module." What it misses is the intelligence layer — the computed health status, the formatted commentary, the color coding, the reference frames. These are the parts that make the page a Bloodwork dashboard instead of a data dump.

**This OB takes a different approach.** Instead of describing what the page should look like, this prompt provides the exact component structure, the exact data queries, and the exact rendering logic. CC's job is to implement this as written — not to interpret a design specification.

**Scope is deliberately narrow:** 2 pages, 4 tasks, that's it. No Results Dashboard, no Operations Center, no sidebar changes, no navigation restructuring. Just `/operate/page.tsx` and `/perform/page.tsx` — the two landing pages that a prospect sees first.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (auth-service.ts, session-context.tsx, auth-shell.tsx, middleware.ts).
6. **Supabase .in() ≤ 200 items.**

---

## TASK 0: DIAGNOSTIC — CAPTURE CURRENT STATE

Before changing ANY code, run this diagnostic and paste ALL output into a file.

```bash
echo "============================================"
echo "OB-105 TASK 0: LANDING PAGE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: OPERATE PAGE — CURRENT STATE ==="
echo "--- Full file contents ---"
cat web/src/app/operate/page.tsx
echo ""
echo "--- What components does it import? ---"
grep -n "^import" web/src/app/operate/page.tsx
echo ""
echo "--- What does it render? (look for return/JSX) ---"
grep -n "return\|<.*>" web/src/app/operate/page.tsx | head -30

echo ""
echo "=== 0B: PERFORM PAGE — CURRENT STATE ==="
echo "--- Full file contents ---"
cat web/src/app/perform/page.tsx
echo ""
echo "--- What components does it import? ---"
grep -n "^import" web/src/app/perform/page.tsx
echo ""
echo "--- What does it render? ---"
grep -n "return\|<.*>" web/src/app/perform/page.tsx | head -30

echo ""
echo "=== 0C: SESSION CONTEXT — WHAT DATA IS AVAILABLE? ==="
echo "--- Exported values from SessionContext ---"
grep -n "export\|useSession\|interface.*Context" web/src/contexts/session-context.tsx | head -20
echo ""
echo "--- What fields are on the session? ---"
grep -n "tenant\|ruleSet\|entities\|periods\|calculat\|financial\|module" web/src/contexts/session-context.tsx | head -30

echo ""
echo "=== 0D: EXISTING BLOODWORK/DASHBOARD COMPONENTS ==="
echo "--- Any existing Bloodwork components? ---"
find web/src -name "*Bloodwork*" -o -name "*bloodwork*" -o -name "*ModuleCard*" -o -name "*module-card*" -o -name "*HealthCard*" -o -name "*health-card*" 2>/dev/null
echo ""
echo "--- Are they imported anywhere? ---"
grep -rn "Bloodwork\|ModuleCard\|HealthCard\|ModuleHealth" web/src/app/operate/page.tsx web/src/app/perform/page.tsx 2>/dev/null

echo ""
echo "=== 0E: AVAILABLE DATA FOR MODULE HEALTH ==="
echo "--- How does the app detect ICM module? ---"
grep -rn "ruleSet\|rule_set" web/src/contexts/session-context.tsx | head -10
echo ""
echo "--- How does the app detect Financial module? ---"
grep -rn "financial\|Financial\|posData\|pos_data\|hasFinancial" web/src/contexts/session-context.tsx web/src/hooks/ | head -15
echo ""
echo "--- What calculation data is available? ---"
grep -rn "calculationBatch\|calculation_batch\|lastCalculation\|calcResult" web/src/contexts/session-context.tsx | head -10

echo ""
echo "=== 0F: DATABASE COUNTS FOR TEST TENANTS ==="
echo "--- Check Sabor Grupo data (tenant will vary by ID) ---"
echo "Run these in Supabase SQL Editor:"
echo "SELECT t.name, "
echo "  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,"
echo "  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,"
echo "  (SELECT count(*) FROM periods WHERE tenant_id = t.id) as periods,"
echo "  (SELECT count(*) FROM calculation_batches WHERE tenant_id = t.id) as calc_batches,"
echo "  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as committed_rows"
echo "FROM tenants t WHERE t.name ILIKE '%sabor%' OR t.name ILIKE '%pipeline%' OR t.name ILIKE '%mexican%';"

echo ""
echo "============================================"
echo "DIAGNOSTIC COMPLETE — PASTE ALL OUTPUT ABOVE"
echo "============================================"
```

Save diagnostic output to `OB-105_DIAGNOSTIC.md` at project root.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-105 Task 0: Diagnostic — current landing page state" && git push origin dev`

---

## TASK 1: OPERATE PAGE — MODULE HEALTH BLOODWORK DASHBOARD

**This is a COMPLETE FILE REPLACEMENT. Do not edit the existing page. Replace it entirely.**

Replace `web/src/app/operate/page.tsx` with a new implementation that follows this exact structure. You must adapt the imports and context hooks to match what actually exists in the codebase (found in Task 0 diagnostic), but the rendering logic and visual output must match what is specified here.

### 1A: Data Requirements

The page needs these data points from SessionContext or from direct Supabase queries in a server component / page loader:

**For ICM Module Health:**
- `ruleSets`: array of rule sets for this tenant (count = active plans)
- `entities`: array of entities (count = workforce size)
- `periods`: array of periods (most recent = current period)
- `calculationBatches`: array of calculation batches (most recent completed = last calculation)
- `calculationResults`: count of results in most recent batch (for match rate)

**For Financial Module Health:**
- `committedData` where data appears to be POS/financial: count of rows, distinct location count, revenue sum
- OR: a `hasFinancialModule` flag derived from tenant settings or data presence

**For Recent Activity:**
- Last 5-7 significant events: imports, calculations, reconciliations
- Source: `ingestion_events`, `calculation_batches`, `import_batches` ordered by created_at desc

### 1B: Module Health Computation

Implement this EXACT health logic. Do not simplify. Do not skip conditions.

```typescript
// ICM Module Health
function computeICMHealth(data: {
  ruleSetCount: number;
  entityCount: number;
  lastCalcDate: Date | null;
  lastCalcTotal: number;
  periodCount: number;
}) {
  // No plans = not configured
  if (data.ruleSetCount === 0) {
    return { status: 'not_configured' as const, color: 'zinc', label: 'Not Configured' };
  }
  
  // Plans but no entities = needs data
  if (data.entityCount === 0) {
    return { status: 'needs_data' as const, color: 'amber', label: 'Needs Data' };
  }
  
  // Has entities but never calculated
  if (!data.lastCalcDate) {
    return { status: 'ready' as const, color: 'blue', label: 'Ready to Calculate' };
  }
  
  // Has calculated — check freshness
  const daysSinceCalc = Math.floor((Date.now() - data.lastCalcDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceCalc <= 7) {
    return { status: 'healthy' as const, color: 'emerald', label: 'Healthy' };
  }
  if (daysSinceCalc <= 30) {
    return { status: 'attention' as const, color: 'amber', label: 'Attention' };
  }
  return { status: 'stale' as const, color: 'red', label: 'Stale Data' };
}

// Financial Module Health
function computeFinancialHealth(data: {
  hasData: boolean;
  locationCount: number;
  chequeCount: number;
  revenue: number;
  flaggedLocations: number;
}) {
  if (!data.hasData) {
    return { status: 'not_configured' as const, color: 'zinc', label: 'Not Configured' };
  }
  if (data.locationCount === 0) {
    return { status: 'needs_data' as const, color: 'amber', label: 'Needs Data' };
  }
  if (data.flaggedLocations > 0) {
    return { status: 'attention' as const, color: 'amber', label: 'Attention' };
  }
  return { status: 'healthy' as const, color: 'emerald', label: 'Healthy' };
}
```

### 1C: Rendering Structure

The page renders this structure. **Every element listed here MUST appear in the final page.** If CC omits the commentary block, the health dot, the stats grid, or the action links — it has failed.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Operations Overview — [Tenant Name]                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  [Deterministic Commentary — 2-3 sentences computed from data] │  │
│  │  "2 plans configured across 719 entities. Last calculation     │  │
│  │  completed Jan 24 with MX$1.25M total. All systems healthy."   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────┐ ┌──────────────────────────────┐│
│  │ ● Healthy                       │ │ ● Attention                  ││
│  │ Incentive Compensation          │ │ Financial Performance        ││
│  │                                 │ │                              ││
│  │ ┌─────────┐ ┌─────────┐       │ │ ┌─────────┐ ┌─────────┐    ││
│  │ │ 2       │ │ 719     │       │ │ │ 20      │ │ 47,051  │    ││
│  │ │ Plans   │ │ Entities│       │ │ │ Locations│ │ Cheques │    ││
│  │ └─────────┘ └─────────┘       │ │ └─────────┘ └─────────┘    ││
│  │ ┌─────────┐ ┌─────────┐       │ │ ┌─────────┐ ┌─────────┐    ││
│  │ │ Jan 24  │ │MX$1.25M │       │ │ │ MX$17M  │ │ 2       │    ││
│  │ │Last Calc│ │ Result  │       │ │ │ Revenue │ │ Flagged │    ││
│  │ └─────────┘ └─────────┘       │ │ └─────────┘ └─────────┘    ││
│  │                                 │ │                              ││
│  │ → Operations Center             │ │ → Financial Dashboard        ││
│  │ → Import Data                   │ │ → Network Pulse              ││
│  │ → Calculate                     │ │ → Import POS Data            ││
│  │ → View Results                  │ │                              ││
│  └─────────────────────────────────┘ └──────────────────────────────┘│
│                                                                      │
│  Recent Activity                                                     │
│  ─────────────────────────────────────────────────────────────       │
│  ● Jan 24 · ICM   Calculation completed: 719 entities, MX$1.25M    │
│  ● Jan 22 · FIN   POS data imported: 47,051 cheques                │
│  ● Jan 20 · ICM   Reconciliation: 100% match verified              │
│  ● Jan 18 · ICM   Data imported: 119,129 records                   │
│  ● Jan 15 · FIN   POS data imported: 46,700 cheques                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1D: Critical Rendering Requirements

1. **Health status dot:** A colored circle (8-12px) next to the status label. Use inline styles for the color:
   - `emerald` = `#10b981` (healthy)
   - `amber` = `#f59e0b` (attention/needs data)
   - `blue` = `#3b82f6` (ready)
   - `red` = `#ef4444` (stale)
   - `zinc` = `#71717a` (not configured)

2. **Stats grid:** 2×2 grid of stat boxes inside each module card. Each box has a large number on top and a small label below. Use `text-2xl font-bold` for the number, `text-xs text-zinc-400` for the label.

3. **Currency formatting:** No cents for amounts ≥ $10,000. Use Intl.NumberFormat or the tenant's formatCurrency utility. Example: `MX$1,253,832` not `MX$1,253,832.00`.

4. **Action links:** Text links with → prefix. Each navigates via `router.push()` or `<Link>`. NOT buttons. Color: `text-blue-400 hover:text-blue-300`.

5. **Module card conditional rendering:**
   - **Dual-module tenant (Sabor Grupo):** Both cards side by side, 50% width each
   - **ICM-only tenant (Pipeline Test Co):** Only ICM card, full width
   - **Financial-only tenant:** Only Financial card, full width
   - **No modules:** Single card saying "Configure your first module" with link to Import
   - Detection: ICM enabled if `ruleSetCount > 0`. Financial enabled if POS/financial data exists in `committed_data` or if tenant settings include financial module flag.

6. **Deterministic commentary:** This is NOT an AI call. It's template + data:

```typescript
function buildCommentary(icm: ICMHealthData | null, fin: FinancialHealthData | null): string {
  const parts: string[] = [];
  
  if (icm && icm.ruleSetCount > 0) {
    parts.push(`${icm.ruleSetCount} plan${icm.ruleSetCount > 1 ? 's' : ''} configured across ${icm.entityCount.toLocaleString()} entities`);
    if (icm.lastCalcDate) {
      parts.push(`Last calculation ${formatRelativeDate(icm.lastCalcDate)} with ${formatCurrency(icm.lastCalcTotal)} total`);
    } else {
      parts.push('No calculations run yet');
    }
  }
  
  if (fin && fin.hasData) {
    parts.push(`${formatCurrency(fin.revenue)} revenue across ${fin.locationCount} locations`);
    if (fin.flaggedLocations > 0) {
      parts.push(`${fin.flaggedLocations} location${fin.flaggedLocations > 1 ? 's' : ''} flagged for attention`);
    }
  }
  
  if (parts.length === 0) {
    return 'Import your plans and data to get started.';
  }
  
  // Health summary
  const allHealthy = (!icm || icm.status === 'healthy') && (!fin || fin.status === 'healthy');
  if (allHealthy) {
    parts.push('All systems operational');
  }
  
  return parts.join('. ') + '.';
}
```

7. **Recent activity:** Query the last 5-7 events from `ingestion_events`, `calculation_batches`, and `import_batches`. Format each as: `[dot] [date] · [module badge] [description]`. Module badge is a small pill: ICM = blue background, FIN = green background. If no events exist, show "No activity yet."

8. **Tenant name in header:** Read from SessionContext. Display as "Operations Overview — [tenant.name]".

9. **Background/card styling:** Cards should use `bg-zinc-800/50 border border-zinc-700 rounded-lg p-6`. The page background inherits from the layout (dark theme). NO white backgrounds. NO light mode assumptions.

10. **Single-module full-width:** When only one module card renders, it must NOT be 50% width with empty space. It must be `col-span-2` or `w-full`.

### 1E: What NOT to Build

- NO AI/LLM calls. All text is deterministic templates.
- NO lifecycle stepper on this page. The stepper belongs in Operations Center (`/operate/operations`).
- NO sidebar changes. This OB changes page content only.
- NO new Supabase tables or migrations.
- NO auth changes.
- NO imports from files that don't exist. Check every import path in the diagnostic.

### Proof Gates — Task 1

```
PG-01: /operate renders without errors in browser console
PG-02: Sabor Grupo shows BOTH ICM and Financial module cards
PG-03: Pipeline Test Co shows ONLY ICM module card (full width)
PG-04: Each module card has a colored health dot (not just text)
PG-05: Each module card shows 4 stat boxes in a 2×2 grid
PG-06: Commentary paragraph is visible above the cards
PG-07: Action links are visible and navigate correctly
PG-08: Recent activity section shows events (or "No activity yet")
PG-09: "Healthy" shows green dot, "Attention" shows amber dot
PG-10: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-105 Task 1: Operate landing — Bloodwork module health dashboard" && git push origin dev`

---

## TASK 2: PERFORM PAGE — MODULE-AWARE PERSONA DASHBOARD

**This is a COMPLETE FILE REPLACEMENT. Do not edit the existing page. Replace it entirely.**

Replace `web/src/app/perform/page.tsx` with a new implementation.

### 2A: Persona × Module Matrix

The Perform page renders different content based on BOTH the user's persona AND the tenant's enabled modules:

| Persona | ICM Only | Financial Only | Both Modules |
|---------|----------|----------------|--------------|
| Admin | ICM overview + stats | Financial overview + link | Both sections |
| Manager | Team performance | Location performance | Both sections |
| Rep | My compensation | My location stats | Both sections |

### 2B: Admin View Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  Performance Dashboard — [Tenant Name]                               │
│  [Period selector or current period display]                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  [Commentary: "719 entities evaluated in January 2024.         │  │
│  │  Total compensation MX$1,253,832. Distribution: 42% in        │  │
│  │  MX$1,000-2,000 band. 0 anomalies detected."]                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ MX$1,253,832 │ │ 719          │ │ MX$1,743     │ │ 0          │ │
│  │ Total Payout │ │ Entities     │ │ Average      │ │ Anomalies  │ │
│  │ ↑ from prior │ │              │ │              │ │            │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                      │
│  [IF Financial module enabled:]                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ MX$17M       │ │ 20           │ │ 47,051       │ │ 1.0%       │ │
│  │ Revenue      │ │ Locations    │ │ Cheques      │ │ Leakage    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                      │
│  → View Detailed Results                                             │
│  → View Financial Dashboard                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2C: Module-Aware Empty States

**CRITICAL — this is the #1 regression that has survived 6+ fixes:**

```typescript
// Determine what to show
const hasICM = ruleSetCount > 0;
const hasICMResults = calculationBatches?.some(b => b.status === 'completed');
const hasFinancial = financialDataExists; // from committed_data or tenant flag

// WRONG (current behavior):
if (!hasICMResults) {
  return <div>No hay resultados de compensación para este periodo</div>;
}

// CORRECT:
if (!hasICM && !hasFinancial) {
  // Empty tenant — no modules at all
  return <EmptyState
    title="No performance data yet"
    description="Import your plans and data from Operate to see performance results here."
    action={{ label: "Go to Operate", href: "/operate" }}
  />;
}

if (!hasICM && hasFinancial) {
  // Financial-only tenant (e.g., Sabor Grupo without ICM plans)
  // Show Financial performance summary — NOT "no compensation results"
  return <FinancialPerformanceSummary />;
}

if (hasICM && !hasICMResults) {
  // ICM configured but not yet calculated
  return <EmptyState
    title="Ready to calculate"
    description={`${ruleSetCount} plan${ruleSetCount > 1 ? 's' : ''} configured with ${entityCount} entities. Run a calculation from Operate to see results.`}
    action={{ label: "Go to Calculate", href: "/operate" }}
  />;
}

// Has ICM results — show performance dashboard
// If ALSO has Financial, show both sections
```

### 2D: Null-Data Guard (Principle 10)

Before any section that could trigger AI content:

```typescript
// Gate: BEFORE any InsightPanel, CoachingIntelligence, Assessment, or Pacing component
if (!hasICMResults || totalPayout === 0) {
  // DO NOT render AI panels. Show nothing or show "Awaiting data"
  // This prevents the "critical performance crisis" fabrication from null data
}
```

**The Behind Pace widget must also be gated:**
```typescript
if (!hasICMResults || totalPayout === 0) {
  // Return null — don't show pacing at all
  // NOT "Behind Pace MX$0/day"
}
```

### 2E: Key Rendering Requirements

1. **Hero metrics row:** 4 cards across the top. Large number (`text-3xl font-bold`), small label below (`text-xs text-zinc-400`). Include trend arrow if prior period data available.

2. **Domain-agnostic labels:** Use "Total Result" not "Total Payout" unless tenant has confirmed compensation-type rule sets. Use "Entities" not "Reps" or "Employees."

3. **Financial section only shows when Financial module is active.** Don't show empty Financial cards for ICM-only tenants.

4. **Commentary is deterministic.** Template + data. No AI calls.

5. **No InsightPanel / CoachingIntelligence / Assessment rendering when data is null.** These components must not even be imported if there's no calculation data.

### Proof Gates — Task 2

```
PG-11: /perform renders without errors in browser console
PG-12: Sabor Grupo (Financial primary) does NOT show "No hay resultados de compensación"
PG-13: Sabor Grupo shows Financial performance section
PG-14: Pipeline Test Co (ICM) shows ICM performance metrics
PG-15: Empty tenant shows guidance message with link to Operate
PG-16: No AI/Intelligence panels visible when no calculation data exists
PG-17: "Behind Pace" does NOT appear when no calculation exists
PG-18: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-105 Task 2: Perform landing — module-aware persona dashboard" && git push origin dev`

---

## TASK 3: WIRING VERIFICATION — IMPORT CHAIN CHECK

This task exists solely because CC has repeatedly created components that aren't rendered (AP-19). 

### 3A: Verify operate/page.tsx actually renders new content

```bash
echo "=== TASK 3: WIRING VERIFICATION ==="
echo ""
echo "--- operate/page.tsx imports ---"
grep -n "^import" web/src/app/operate/page.tsx
echo ""
echo "--- operate/page.tsx return statement (first 50 lines of JSX) ---"
grep -A 50 "return" web/src/app/operate/page.tsx | head -60
echo ""
echo "--- Does it still reference old components? ---"
grep -n "OperationsCenter\|LifecycleStepper\|lifecycle\|CompensationCard\|Centro de Operaciones" web/src/app/operate/page.tsx
echo ""
echo "--- perform/page.tsx imports ---"
grep -n "^import" web/src/app/perform/page.tsx
echo ""
echo "--- perform/page.tsx return statement ---"
grep -A 50 "return" web/src/app/perform/page.tsx | head -60
echo ""
echo "--- Does perform still show 'No hay resultados'? ---"
grep -n "No hay resultado\|no.*compensación\|No compensation" web/src/app/perform/page.tsx
echo ""
echo "--- Check for dead component files (created but never imported) ---"
for f in $(find web/src/components -name "*Bloodwork*" -o -name "*ModuleHealth*" -o -name "*ModuleCard*" 2>/dev/null); do
  basename="$(basename $f .tsx)"
  echo "Component: $basename"
  grep -rn "$basename" web/src/app/operate/page.tsx web/src/app/perform/page.tsx 2>/dev/null || echo "  ⚠ NOT IMPORTED BY ANY LANDING PAGE"
done
echo ""
echo "=== END WIRING VERIFICATION ==="
```

### 3B: Fix Any Wiring Issues

If the diagnostic in 3A reveals:
- Old component still referenced → remove the import, add new one
- New component not imported → add the import and render it
- Dead component files → delete them or wire them in
- "No hay resultados" still present → the page.tsx was not actually replaced

**This phase produces a commit ONLY if issues are found. If everything is wired correctly, commit a verification note.**

### Proof Gates — Task 3

```
PG-19: operate/page.tsx does NOT import LifecycleStepper or OperationsCenter as main content
PG-20: operate/page.tsx DOES render module health cards
PG-21: perform/page.tsx does NOT contain "No hay resultados" or "no compensación"
PG-22: Zero dead component files (all created components are imported somewhere)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-105 Task 3: Wiring verification — all components connected" && git push origin dev`

---

## TASK 4: BUILD + COMPLETION + PR

### 4A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -30
# MUST exit 0
```

### 4B: Completion Report

Create `OB-105_COMPLETION_REPORT.md` at project root:

1. Task 0: Diagnostic — what was the previous state of operate/page.tsx and perform/page.tsx?
2. Task 1: Operate landing — module health cards, health computation, commentary, recent activity, action links
3. Task 2: Perform landing — module-aware empty states, persona-based content, null-data guard
4. Task 3: Wiring verification — all components imported and rendered, no dead code
5. All proof gates PG-01 through PG-22 with PASS/FAIL

**CRITICAL RULE 31:** If any task was NOT executed, the completion report MUST say "Task X: NOT EXECUTED — [reason]". Do NOT report a task as done if no commit exists for it.

### 4C: PR (COMPOUND COMMAND — Rule 3)

```bash
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-105 Complete: Bloodwork landing implementation" && git push origin dev && gh pr create --base main --head dev --title "OB-105: Operate & Perform Landing Pages — Bloodwork Implementation" --body "## Why This OB Is Different

7 prior attempts (OB-92, OB-94, OB-97, OB-102, HF-063D, OB-104) failed to deliver the Bloodwork specification on landing pages. CC built structural skeletons and reported them as done. This OB provides exact component structure, data queries, and rendering logic — CC implements rather than interprets.

### Operate Landing (/operate)
- Module health cards with computed status (healthy/attention/stale/needs-data)
- Colored health indicator dots (emerald/amber/red/blue/zinc)
- 2×2 stats grid per module (plans, entities, last calc, total result)
- Deterministic commentary paragraph (template + data, no AI)
- Recent activity timeline (last 5-7 events)
- Action links per module
- Conditional rendering: dual-module = side-by-side, single = full-width

### Perform Landing (/perform)
- Module-aware empty states (Financial tenant ≠ 'no compensation results')
- Admin hero metrics (4-card row with trend arrows)
- Financial section when Financial module active
- Null-data guard: no AI panels on zero/null data
- No 'Behind Pace' on zero data
- Domain-agnostic labels

### Wiring Verification
- All new components imported and rendered by their pages
- No dead component files
- No old component references remaining

## Proof Gates: 22"
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- `/operate/page.tsx` — complete file replacement with Bloodwork module health dashboard
- `/perform/page.tsx` — complete file replacement with module-aware persona dashboard
- Helper functions for health computation, commentary generation, and data formatting
- Wiring verification to prevent dead code

### OUT OF SCOPE — DO NOT TOUCH
- Sidebar / navigation (OB-97 scope)
- Auth files (NEVER)
- Financial module pages (/financial/*)
- Results Dashboard (/operate/results)
- Operations Center (/operate/operations)
- Calculation engine
- New Supabase tables or migrations
- Plan import pages
- Any page other than /operate and /perform landing pages

---

## ANTI-PATTERNS — THE SPECIFIC FAILURES FROM 7 PRIOR ATTEMPTS

| # | Anti-Pattern | What Happened Before | Prevention in This OB |
|---|---|---|---|
| AP-1 | Create component, never import it | OB-102 created BloodworkDashboard, operate/page.tsx never imported it | Task 3 explicitly checks import chain |
| AP-2 | Conditional branch always evaluates to old path | OB-102/HF-063D added module detection but conditions fell through to ICM stepper | Health computation functions defined inline — no external condition to miss |
| AP-3 | "No hay resultados" for Financial-primary tenant | 6+ fixes claimed to resolve this. It persists. | Module-aware branching is the FIRST logic in the page, not a late-stage check |
| AP-4 | AI narrative from null data | CoachingIntelligence generates "crisis" from zeros | Principle 10 gate as first check before any AI component |
| AP-5 | Two flat cards with no intelligence | OB-102 built the skeleton, stripped the health scoring | Health computation, colored dots, stats grid, commentary are all mandatory proof gates |
| AP-6 | Report as done without changing rendered output | Completion reports claim "Bloodwork dashboard delivered" while browser shows old page | Task 3 wiring verification catches this pattern |
| AP-7 | Modify existing page instead of replacing it | CC adds conditions to old page, creating spaghetti | COMPLETE FILE REPLACEMENT — not edits |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-105: The seventh time is the charm — because this time we're not describing the page. We're building it.*
*"Stop interpreting. Start implementing."*
