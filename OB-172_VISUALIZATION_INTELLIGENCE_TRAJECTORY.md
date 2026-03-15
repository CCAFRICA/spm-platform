# OB-172: VISUALIZATION INTELLIGENCE + TRAJECTORY COMPUTATION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — 10-gate checklist

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS OB EXISTS

The intelligence stream (/stream) shows factual intelligence: "$44,590 in October, 85 entities, 4 components." That's Cold-tier intelligence (DS-015 Section 3.1). When BCL has 3+ calculated periods, the system should show trajectory: velocity, pace projection, period-over-period trends, and allocation recommendations. This is Warm-tier intelligence — the platform gets smarter as data accumulates.

**Decision 130 (LOCKED):** Period-over-period velocity = average delta over last 3 periods. Pace projection = gap / velocity. Negative or zero velocity = "not on pace." No probability estimates until Hot tier (7+ periods).

This OB builds the trajectory computation engine and wires it into /stream. The design is deliberate: we build trajectory BEFORE importing additional BCL periods so we can watch the system transition from Cold to Warm in real time as each new period is calculated.

**DS-015 Phase B implementation.**

**Mission Control items addressed:**
- **MC#18 (P1):** Trajectory Computation
- **MC#47 (P1):** Period-Over-Period Comparison

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data.
7. **Domain-agnostic.** Zero hardcoded component names, entity names, or period labels.

---

## CRITICAL CONTEXT

### BCL Ground Truth (All 6 Months)

| Period | C1 | C2 | C3 | C4 | Total |
|--------|-----|-----|-----|-----|-------|
| Oct 2025 | $17,990 | $10,170 | $8,480 | $7,950 | **$44,590** |
| Nov 2025 | $16,700 | $12,530 | $9,561 | $7,500 | **$46,291** |
| Dec 2025 | $25,450 | $18,140 | $10,646 | $7,750 | **$61,986** |
| Jan 2026 | $17,860 | $12,160 | $10,075 | $7,450 | **$47,545** |
| Feb 2026 | $20,700 | $14,510 | $10,255 | $7,750 | **$53,215** |
| Mar 2026 | $25,240 | $14,500 | $10,116 | $8,550 | **$58,406** |

### Expected Trajectory Intelligence (After 3+ Periods)

With Oct, Nov, Dec calculated:
- **Population trend:** $44,590 → $46,291 → $61,986. Accelerating. +$17,396 over 3 months.
- **Period velocity:** Average delta = ($46,291-$44,590 + $61,986-$46,291) / 2 = +$8,698/period
- **Component trajectory:** C1 grew $7,460 (Oct→Dec). C2 grew $7,970. C3 grew $2,166. C4 declined $200.
- **Entity-level examples:**
  - Gabriela Vascones (BCL-5003, Senior): Oct $1,400 → should track across periods
  - Valentina Salazar (BCL-5012, Standard): Oct $198 → should track across periods

### CRL Tier Progression

| Calculated Periods | CRL Tier | What Activates |
|-------------------|----------|----------------|
| 1 (October only) | Cold | Factual: value + context + comparison. No trajectory. |
| 2 (Oct + Nov) | Cold | Period delta shown. "Up $1,701 from October." Still factual. |
| 3 (Oct + Nov + Dec) | **Warm** | Velocity + pace projection activate. "Average growth: $8,698/period." |
| 6 (all months) | Warm (approaching Hot) | Full trajectory with acceleration detection. Component allocation. |

### Key Schema

- `calculation_results`: `total_payout`, `components` (jsonb array), `entity_id`, `period_id`, `batch_id`
- `calculation_batches`: `period_id`, `lifecycle_state`, `entity_count`, `summary`
- `periods`: `id`, `label`, `start_date`, `end_date`, `canonical_key`
- `entities`: `id`, `external_id`, `display_name`, `metadata`

### Existing State Reader (OB-170)

`web/src/lib/intelligence/state-reader.ts` already computes `TenantContext` with:
- `calculatedPeriods[]` — periods with completed calculation batches
- `crlTier` — 'cold' | 'warm' | 'hot' based on calculated period count
- `hasTrajectoryData` — true when 3+ periods calculated

OB-172 extends the State Reader with trajectory data and adds trajectory rendering to /stream.

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE (Zero Code Changes)

### 0A: Verify State Reader

```bash
# Find the state reader
find web/src -name "state-reader*" -o -name "*intelligence*loader*" | sort

# Check what TenantContext contains
grep -A 50 "interface TenantContext\|type TenantContext" web/src/lib/intelligence/state-reader.ts
```

### 0B: Verify /stream Section Components

```bash
# List all intelligence stream section components
find web/src/components -name "*Intelligence*" -o -name "*Stream*" -o -name "*Trajectory*" -o -name "*Trend*" | sort
grep -rn "SystemHealth\|ActionRequired\|PipelineReadiness\|Optimization\|Distribution\|Lifecycle\|Bloodwork" \
  web/src/app/stream/page.tsx 2>/dev/null | head -20
```

### 0C: Verify calculation_results Across Periods

```sql
-- BCL: What calculation periods exist?
SELECT p.label, p.start_date, cb.lifecycle_state, cb.entity_count,
  (SELECT SUM(cr.total_payout) FROM calculation_results cr WHERE cr.batch_id = cb.id) as total
FROM calculation_batches cb
JOIN periods p ON cb.period_id = p.id
WHERE cb.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY p.start_date;
```

This should show 1 period (October 2025, $44,590). After Patricia imports+calculates more, it grows.

**Commit:** `git add -A && git commit -m "OB-172 Phase 0: Diagnostic — state reader and /stream current state" && git push origin dev`

---

## PHASE 1: TRAJECTORY COMPUTATION ENGINE

### 1A: Create Trajectory Service

Create `web/src/lib/intelligence/trajectory-service.ts`

This is a pure computation module — no UI, no Supabase calls. It takes calculation data and produces trajectory intelligence.

```typescript
export interface PeriodSnapshot {
  periodId: string;
  periodLabel: string;
  startDate: string;
  totalPayout: number;
  entityCount: number;
  componentTotals: Record<string, number>; // componentName → total
}

export interface EntityTrajectory {
  entityId: string;
  externalId: string;
  displayName: string;
  periods: Array<{
    periodLabel: string;
    totalPayout: number;
    components: Record<string, number>;
  }>;
  velocity: number | null;           // avg delta over last 3 periods (null if < 3)
  acceleration: number | null;       // delta of velocity (null if < 4)
  trend: 'accelerating' | 'stable' | 'decelerating' | 'insufficient_data';
  paceProjection: {
    componentName: string;            // highest-leverage component
    currentValue: number;
    nextTierBoundary: number;
    gap: number;
    periodsToReach: number | null;    // null if velocity <= 0
    projectedGain: number;            // payout increase if tier reached
  } | null;
}

export interface PopulationTrajectory {
  periods: PeriodSnapshot[];
  velocity: number | null;            // population-level avg delta
  acceleration: number | null;
  trend: 'accelerating' | 'stable' | 'decelerating' | 'insufficient_data';
  componentTrajectories: Array<{
    componentName: string;
    periods: Array<{ label: string; total: number }>;
    velocity: number | null;
    trend: 'growing' | 'stable' | 'declining' | 'insufficient_data';
  }>;
  // Movers
  topAccelerators: EntityTrajectory[];    // top 3 entities by positive velocity
  topDecliners: EntityTrajectory[];       // top 3 entities by negative velocity
  newEntities: string[];                  // entities appearing for first time
  droppedEntities: string[];              // entities absent from latest period
}

export function computeTrajectory(
  snapshots: PeriodSnapshot[],
  entityData: Map<string, EntityTrajectory['periods']>,
  tierBoundaries?: Record<string, Array<{ min: number; max: number; payout: number }>>
): PopulationTrajectory {
  // Implementation below
}
```

### 1B: Velocity Computation (Decision 130)

```typescript
function computeVelocity(values: number[]): number | null {
  // Decision 130: average delta over last 3 periods
  if (values.length < 2) return null;
  
  const deltas: number[] = [];
  const recent = values.slice(-3); // last 3 values
  for (let i = 1; i < recent.length; i++) {
    deltas.push(recent[i] - recent[i - 1]);
  }
  
  if (deltas.length === 0) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

function computeAcceleration(values: number[]): number | null {
  if (values.length < 4) return null;
  
  // Velocity at two points, then delta
  const recent4 = values.slice(-4);
  const v1 = (recent4[1] - recent4[0] + recent4[2] - recent4[1]) / 2; // velocity at period N-1
  const v2 = (recent4[2] - recent4[1] + recent4[3] - recent4[2]) / 2; // velocity at period N
  return v2 - v1;
}

function classifyTrend(velocity: number | null, acceleration: number | null): string {
  if (velocity === null) return 'insufficient_data';
  if (acceleration !== null && acceleration > 0 && velocity > 0) return 'accelerating';
  if (acceleration !== null && acceleration < 0 && velocity > 0) return 'decelerating';
  if (velocity > 0) return 'accelerating'; // positive velocity without acceleration data
  if (velocity < 0) return 'decelerating';
  return 'stable';
}
```

### 1C: Pace Projection (Decision 130)

```typescript
function computePaceProjection(
  entityTrajectory: EntityTrajectory['periods'],
  velocity: number | null,
  tierBoundaries?: Record<string, Array<{ min: number; max: number; payout: number }>>
): EntityTrajectory['paceProjection'] {
  if (!velocity || velocity <= 0 || !tierBoundaries) return null;
  
  const latestPeriod = entityTrajectory[entityTrajectory.length - 1];
  let bestProjection: EntityTrajectory['paceProjection'] = null;
  let shortestPeriods = Infinity;
  
  for (const [componentName, boundaries] of Object.entries(tierBoundaries)) {
    const currentValue = latestPeriod.components[componentName] || 0;
    
    // Find next tier boundary above current value
    for (const boundary of boundaries) {
      if (boundary.min > currentValue) {
        const gap = boundary.min - currentValue;
        const periodsToReach = Math.ceil(gap / velocity);
        
        if (periodsToReach < shortestPeriods) {
          shortestPeriods = periodsToReach;
          bestProjection = {
            componentName,
            currentValue,
            nextTierBoundary: boundary.min,
            gap,
            periodsToReach,
            projectedGain: boundary.payout - currentValue,
          };
        }
        break; // only check next tier, not all higher tiers
      }
    }
  }
  
  return bestProjection;
}
```

### 1D: Population-Level Trajectory

```typescript
function computePopulationTrajectory(snapshots: PeriodSnapshot[]): Partial<PopulationTrajectory> {
  const sorted = [...snapshots].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const totals = sorted.map(s => s.totalPayout);
  
  const velocity = computeVelocity(totals);
  const acceleration = computeAcceleration(totals);
  const trend = classifyTrend(velocity, acceleration);
  
  // Component-level trajectories
  const allComponentNames = new Set<string>();
  sorted.forEach(s => Object.keys(s.componentTotals).forEach(c => allComponentNames.add(c)));
  
  const componentTrajectories = Array.from(allComponentNames).map(name => {
    const values = sorted.map(s => s.componentTotals[name] || 0);
    const v = computeVelocity(values);
    return {
      componentName: name,
      periods: sorted.map((s, i) => ({ label: s.periodLabel, total: values[i] })),
      velocity: v,
      trend: v === null ? 'insufficient_data' : v > 100 ? 'growing' : v < -100 ? 'declining' : 'stable',
    };
  });
  
  return { periods: sorted, velocity, acceleration, trend, componentTrajectories };
}
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | trajectory-service.ts exists | Exports computeTrajectory, computeVelocity |
| PG-2 | Velocity with 1 period returns null | Insufficient data |
| PG-3 | Velocity with 2 periods returns delta | Simple difference |
| PG-4 | Velocity with 3 periods returns avg of 2 deltas | Decision 130 |
| PG-5 | Pace projection with velocity ≤ 0 returns null | "Not on pace" |
| PG-6 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-172 Phase 1: Trajectory computation engine — velocity, acceleration, pace projection" && git push origin dev`

---

## PHASE 2: TRAJECTORY DATA LOADER

### 2A: Extend State Reader with Trajectory Data

Add a `loadTrajectoryData` function that queries calculation_results across all calculated periods for a tenant:

```typescript
export async function loadTrajectoryData(tenantId: string): Promise<{
  snapshots: PeriodSnapshot[];
  entityData: Map<string, EntityTrajectory['periods']>;
}> {
  const supabase = createClient();
  
  // Get ALL calculation results across ALL periods (latest batch per period)
  // Batch the query: get latest batch per period first, then results
  
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, entity_count, summary, periods!inner(label, start_date)')
    .eq('tenant_id', tenantId)
    .in('lifecycle_state', ['PREVIEW', 'OFFICIAL', 'PENDING_APPROVAL', 'APPROVED', 'POSTED'])
    .order('created_at', { ascending: false });
  
  // Deduplicate: keep latest batch per period
  const latestBatchPerPeriod = new Map();
  for (const batch of batches || []) {
    if (!latestBatchPerPeriod.has(batch.period_id)) {
      latestBatchPerPeriod.set(batch.period_id, batch);
    }
  }
  
  if (latestBatchPerPeriod.size === 0) {
    return { snapshots: [], entityData: new Map() };
  }
  
  // Get results for all batches (may be large — batch in groups of 5)
  const batchIds = Array.from(latestBatchPerPeriod.values()).map(b => b.id);
  const allResults = [];
  
  for (let i = 0; i < batchIds.length; i += 5) {
    const chunk = batchIds.slice(i, i + 5);
    const { data } = await supabase
      .from('calculation_results')
      .select('batch_id, entity_id, total_payout, components')
      .eq('tenant_id', tenantId)
      .in('batch_id', chunk);
    if (data) allResults.push(...data);
  }
  
  // Build snapshots and entity data from results
  // ... (parse components JSONB, aggregate per period, per entity)
  
  return { snapshots, entityData };
}
```

### 2B: Scale Consideration

BCL: 85 entities × 6 periods = 510 calculation_results rows. Trivial.
At scale (5,000 entities × 12 periods = 60,000 rows): still manageable in a single query with period batching.
At enterprise (50,000 × 24 = 1.2M rows): would need aggregation at the DB level. For now, client-side aggregation is fine.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-7 | loadTrajectoryData returns correct snapshots for BCL | 1 snapshot (October), $44,590 |
| PG-8 | Entity data populated | 85 entities with period arrays |
| PG-9 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-172 Phase 2: Trajectory data loader — multi-period results aggregation" && git push origin dev`

---

## PHASE 3: TRAJECTORY SECTION ON /STREAM

### 3A: Trajectory Intelligence Card

Add a new section to /stream that renders when `hasTrajectoryData` is true (3+ calculated periods) OR when 2 periods exist (show period delta).

**With 1 calculated period (Cold — current BCL state):**
- Trajectory section does NOT render. Silence = not enough data. (Bloodwork Principle)

**With 2 calculated periods:**
```
━━━ PERIOD COMPARISON ━━━

October → November: +$1,701 (+3.8%)

Component Movement:
  C1 Credit Placement    $17,990 → $16,700   ▼ -$1,290
  C2 Account Growth      $10,170 → $12,530   ▲ +$2,360
  C3 Products             $8,480 →  $9,561   ▲ +$1,081
  C4 Compliance           $7,950 →  $7,500   ▼ -$450

[View Entity Detail →]
```

**With 3+ calculated periods (Warm):**
```
━━━ TRAJECTORY INTELLIGENCE ━━━

Population: $44,590 → $46,291 → $61,986   ▲ Accelerating
Velocity: +$8,698/period   Acceleration: +$15,695

Component Trajectories:
  C1 Credit Placement    ▲ Growing    +$3,730/period
  C2 Account Growth      ▲ Growing    +$3,985/period
  C3 Products            ▲ Growing    +$1,083/period
  C4 Compliance          → Stable     -$100/period

Top Accelerators:
  [Entity Name]  +$[X]/period  ▲ Fastest growth
  [Entity Name]  +$[X]/period
  [Entity Name]  +$[X]/period

Attention Needed:
  [Entity Name]  -$[X]/period  ▼ Declining 3 consecutive periods
  [Entity Name]  -$[X]/period

[View Full Trajectory Report →]  [Compare Periods →]
```

### 3B: Five Elements on Trajectory

| Element | Content |
|---------|---------|
| Value | "+$8,698/period velocity" or "+$1,701 Oct→Nov" |
| Context | "3 periods calculated. Population: 85 entities across 4 components." |
| Comparison | Period-over-period deltas. Component growth/decline. Entity ranking. |
| Action | "View Entity Detail →" (expands to per-entity trajectory inline), "Compare Periods →" (navigates to comparison view) |
| Impact | "At current velocity, total payout will reach $70,684 by April 2026." (extrapolation with confidence disclosure: "Based on 3 periods. Insufficient data for high confidence.") |

### 3C: CRL Confidence Disclosure

**Mandatory per Decision 130:** When displaying trajectory intelligence, the system MUST disclose its confidence basis:

- 2 periods: "Based on 1 period-over-period comparison. Trend may not be representative."
- 3 periods: "Based on 3 periods. Moderate confidence in velocity estimate."
- 6+ periods: "Based on 6 periods. High confidence in velocity and acceleration."

This is NOT a disclaimer buried in fine print. It's a visible confidence badge on the trajectory section, consistent with DS-013 Section 7 (Confidence Disclosure test).

### 3D: Section Ordering Update

Update the State Reader's section priority to include trajectory:

| Priority | Section | Condition |
|----------|---------|-----------|
| 1 | System Health | Always (calculated period exists) |
| 2 | Action Required | Uncalculated periods with data |
| 3 | Pipeline Readiness | Empty periods exist |
| 4 | **Trajectory Intelligence** | **2+ calculated periods** |
| 5 | Reconciliation Status | Calculation without reconciliation |
| 6 | Optimization Opportunities | Zero-payout or boundary entities |
| 7 | Lifecycle | Always |
| 8 | Population Distribution | Always |

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-10 | Trajectory section does NOT render with 1 period | BCL current state: section absent |
| PG-11 | Section renders with 2+ periods | After November calculated, period comparison visible |
| PG-12 | Section shows velocity with 3+ periods | After December, velocity + acceleration shown |
| PG-13 | Component trajectories shown | Per-component growth/decline |
| PG-14 | Top accelerators/decliners listed | Entity names from database, not hardcoded |
| PG-15 | Confidence disclosure visible | Badge with period count basis |
| PG-16 | Action buttons present | "View Entity Detail →", "Compare Periods →" |
| PG-17 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-172 Phase 3: Trajectory intelligence section on /stream" && git push origin dev`

---

## PHASE 4: PERIOD COMPARISON VIEW

### 4A: Inline Expansion (Action Proximity)

When the user clicks "Compare Periods →" on the trajectory section, an inline expansion shows side-by-side period comparison without leaving /stream.

```
━━━ PERIOD COMPARISON: October → November → December ━━━

         Oct 2025    Nov 2025    Dec 2025    Trend
Total    $44,590     $46,291     $61,986     ▲ Accelerating

C1       $17,990     $16,700     $25,450     ▲ +$3,730/mo
C2       $10,170     $12,530     $18,140     ▲ +$3,985/mo
C3        $8,480      $9,561     $10,646     ▲ +$1,083/mo
C4        $7,950      $7,500      $7,750     → Stable

Entity Count  85       85          85

[Collapse]  [Export CSV →]
```

### 4B: Entity-Level Trajectory (Click to Expand)

Within the comparison, clicking an entity row expands to show that entity's trajectory:

```
Valentina Salazar (BCL-5012, Ejecutivo)
  Oct: $198  →  Nov: $[X]  →  Dec: $[X]
  Velocity: +$[X]/period
  C3 (Products): growing — 1 → [N] → [N] products
  [View Statement →]
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-18 | "Compare Periods →" opens inline expansion | Does not navigate away from /stream |
| PG-19 | Period columns show correct totals | Oct $44,590 verified |
| PG-20 | Per-component rows with trend indicators | Growing/declining/stable per component |
| PG-21 | Entity drill-down works | Click expands entity trajectory |

**Commit:** `git add -A && git commit -m "OB-172 Phase 4: Period comparison — inline expansion on /stream" && git push origin dev`

---

## PHASE 5: STATEMENT TRAJECTORY (INDIVIDUAL)

### 5A: Extend /perform/statements with Trajectory

The commission statement page (OB-171) shows a single period. Add a trajectory section when 2+ periods have results for this entity:

```
━━━ YOUR TRAJECTORY ━━━

  Oct: $198  →  Nov: $[X]  →  Dec: $[X]
  Velocity: +$[X]/period

  Component Trend:
    C1  $80 → $[X] → $[X]   [trend]
    C2   $0 → $[X] → $[X]   [trend]
    C3  $18 → $[X] → $[X]   [trend]
    C4 $100 → $[X] → $[X]   [trend]

  Pace: At current velocity, [next tier] in [N] periods.
```

This uses the same trajectory service from Phase 1, filtered to a single entity.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-22 | Trajectory section on statement (2+ periods) | Visible when entity has multi-period results |
| PG-23 | Trajectory hidden with 1 period | BCL current state: section absent |
| PG-24 | Pace projection shown (3+ periods) | "At current velocity, [tier] in [N] periods" |

**Commit:** `git add -A && git commit -m "OB-172 Phase 5: Statement trajectory — individual entity trend" && git push origin dev`

---

## PHASE 6: BROWSER VERIFICATION (CLT-172)

### With Current BCL State (1 Period)

1. Navigate to /stream as BCL admin
2. Verify trajectory section does NOT appear (only 1 period — Bloodwork)
3. Verify System Health shows $44,590
4. Verify /perform/statements for Valentina shows no trajectory section

### Meridian Regression

1. Switch to Meridian
2. Verify MX$185,063
3. Verify trajectory section does NOT appear (1 period)

### Build Verification

```bash
npm run build  # Must exit 0
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | BCL /stream: no trajectory section (1 period) | Bloodwork: silence = insufficient data |
| PG-26 | BCL /stream: System Health $44,590 | No regression |
| PG-27 | BCL /perform/statements: no trajectory (1 period) | Section hidden |
| PG-28 | Meridian MX$185,063 | No regression |
| PG-29 | Console clean | No errors |

**Commit:** `git add -A && git commit -m "OB-172 Phase 6: CLT-172 — trajectory hidden with 1 period, no regression" && git push origin dev`

---

## PHASE 7: COMPLETION REPORT + PR

Create `OB-172_COMPLETION_REPORT.md` and PR.

```bash
gh pr create --base main --head dev \
  --title "OB-172: Visualization Intelligence + Trajectory — System Gets Smarter With Each Period" \
  --body "## What This Delivers

### Trajectory Computation Engine (MC#18 — P1)
- trajectory-service.ts: velocity, acceleration, pace projection, component trajectories
- Decision 130: avg delta over 3 periods, gap/velocity for pace, 'not on pace' for negative velocity
- Entity-level and population-level trajectories

### Trajectory on /stream (DS-015 Phase B)
- 1 period: section hidden (Bloodwork)
- 2 periods: period comparison with component deltas
- 3+ periods: full trajectory with velocity, acceleration, top movers, confidence disclosure
- CRL tier transitions: Cold → Warm as periods accumulate

### Period Comparison (MC#47 — P1)
- Inline expansion on /stream — side-by-side periods with component trends
- Entity drill-down within comparison
- Export CSV action

### Statement Trajectory
- /perform/statements shows entity trajectory when 2+ periods calculated
- Pace projection: 'At current velocity, [tier] in [N] periods'

### Proof
- BCL (1 period): trajectory correctly hidden
- Meridian: MX\$185,063 no regression
- Ready for multi-period activation: import Nov + calculate → trajectory appears

## Proof Gates: see OB-172_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "OB-172 Phase 7: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

### Step 1: Verify Trajectory Hidden (1 Period)
1. Login as Patricia at vialuce.ai
2. Navigate to /stream — trajectory section should NOT appear
3. Navigate to /perform/statements — no trajectory on Valentina's statement

### Step 2: Meridian Regression
1. Switch to Meridian — MX$185,063 confirmed
2. No trajectory section (1 period)

### Step 3: Activate Trajectory (Multi-Period)
1. As Patricia, import November 2025 data via /operate/import
2. Calculate November 2025
3. Navigate to /stream — **Period Comparison should now appear** (2 periods)
4. Import December 2025, calculate
5. Navigate to /stream — **Full Trajectory Intelligence should appear** (3 periods = Warm tier)
6. Verify velocity, component trajectories, confidence disclosure

**This is the live demo of the system getting smarter with each period.**

**ZERO data-modifying SQL.**

---

## WHAT SUCCESS LOOKS LIKE

Patricia has calculated October ($44,590). She imports November data and calculates. /stream now shows: "October → November: +$1,701 (+3.8%). C2 Account Growth led the increase." She imports December and calculates. /stream transforms: "Population: Accelerating. Velocity: +$8,698/period. C1 Credit Placement grew fastest. 3 entities declining — attention needed." The Valentina Salazar statement shows: "$198 → $[Nov] → $[Dec]. Your velocity is +$[X]/period."

The platform didn't just calculate numbers. It understood the trajectory and told Patricia what it means.

---

*OB-172 — March 15, 2026*
*"One period is a fact. Two periods is a comparison. Three periods is intelligence."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
