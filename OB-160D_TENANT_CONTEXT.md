# OB-160D PHASE D: TENANT CONTEXT
## "The system knows what the tenant has"
## SCI Development Plan Phase D of 12 (A through L)
## Target: Current release
## Depends on: OB-160C (PR #184 — must be merged)
## Priority: P0 — Implements SCI Spec Layer 3 Tier 2

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 3: Confidence Scoring (Tier 2: Tenant Context)
4. `web/src/lib/sci/synaptic-ingestion-state.ts` — the SynapticIngestionState from Phase C (this is what you extend)
5. `web/src/lib/sci/agents.ts` — agent scoring logic (where tenant context adjustments apply)
6. `web/src/lib/sci/sci-types.ts` — all SCI type interfaces
7. `web/src/app/api/import/sci/analyze/route.ts` — the analyze flow (where tenant context queries run)

**IMPORTANT:** After reading each file, note in your Architecture Decision the EXACT current interfaces for:
- `SynapticIngestionState` — what fields exist, what's populated, what's empty
- `TenantContext` — does the type exist? What shape?
- `ClassificationTrace` — does `tenantContextApplied` field exist?
- Where in the analyze route does scoring happen? Tenant context must run BEFORE scoring.

---

## CONTEXT

### What Phases A/B/C Delivered

**Phase A (PR #182):** Content Profile foundation — probabilistic type scoring, type-agnostic temporal detection (`hasTemporalColumns`), identifier-relative cardinality, `ProfileObservation` signal interface.

**Phase B (PR #183):** Header comprehension — one LLM call per file, vocabulary binding interface, measurement metrics, graceful fallback.

**Phase C (PR #184):** Agent scoring + signatures + negotiation — Korean Test cleanup, composite structural signatures with confidence floors, Round 2 negotiation through `SynapticIngestionState`, `ClassificationTrace` structure, PARTIAL claim interfaces defined.

### What Phase C Left for Phase D

Phase C created the `SynapticIngestionState` object and the `TenantContext` type declaration. But `tenantContext` is **unpopulated** — it exists as a field on the state object, set to null or a default empty value. Phase D populates it with real data from Supabase queries.

Phase C also created the `ClassificationTrace` structure with a `tenantContextApplied` array. Phase D populates that array with every tenant context adjustment and its evidence.

### What Phase D Delivers

Phase D implements **SCI Spec Layer 3, Tier 2: Tenant Context.** Before agents score any content unit, the system queries what the tenant already has in the database. This context directly adjusts agent scores using **presence-based matching only.**

The single most powerful signal: **entity ID overlap.** If the incoming sheet contains values that match the tenant's existing entity `external_id` values, it's almost certainly data ABOUT those entities (transaction, target, or reference), not a new roster.

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
  Phase C: Agent Scoring + Signatures + Negotiation ✅ (PR #184)
→ PHASE D: Tenant Context ← YOU ARE HERE
  Phase E: Classification Signals + Flywheel
  Phase F: Execute Pipeline + Routing
  Phase G: Convergence + input_bindings
  Phase H: Field-Level PARTIAL Claims
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test — no hardcoded language dictionaries | Tenant context uses structural matching (ID overlap), not field names |
| 92/93 | Period is not an import concept | Tenant context may observe committed_data exists, but NEVER references periods |
| 98 | Audit attribution = auth.uid() | No FK to profiles in audit columns |
| 99 | Composite signatures as confidence floors | Tenant context adjustments layer ON TOP of signature floors — they don't override them |
| 103 | Probabilistic type scoring | Tenant context reads Content Profile structural observations, not raw data |
| 105 | Identifier-relative cardinality | Entity ID overlap uses the identifier column detected by Phase A |
| 106 | One LLM call per file | Phase D does NOT call LLM. Tenant context is deterministic (Tier 2). |

### Meridian State at Phase D Entry

| Table | Count | Significance |
|---|---|---|
| rule_sets | 1 | Plan imported. 5 components with calculationIntents. |
| entities | 0 | No entities yet — first data import hasn't executed. |
| committed_data | 0 | No transaction data yet. |
| reference_data | 0 | No reference data yet. |
| periods | 0 | Engine creates at calc time. |

**IMPORTANT:** For Meridian's FIRST data import, tenant context will show: plan exists (1 rule_set), zero entities, zero committed_data. This is a valid state. The tenant context signal is: "tenant has a plan, this file likely contains the data to feed it." This is a presence-based signal (plan exists), not an absence-based boost (no entities → Entity Agent boost).

For SUBSEQUENT imports (after entities are created by Phase F), the entity ID overlap signal becomes the most powerful discriminator.

---

## ARCHITECTURE DECISION GATE

```
DECISION: How should tenant context query and apply to scoring?

Option A: Query tenant state inside each agent's scoring function
  - Each agent queries Supabase independently for what it needs
  - Duplicated queries across 5 agents
  - No centralized tenant context object
  REJECTED: Wasteful, duplicated queries, no shared state, violates SynapticIngestionState design

Option B: Single tenant context query BEFORE scoring, stored in SynapticIngestionState
  - One query phase fetches all tenant state
  - Result stored in SynapticIngestionState.tenantContext
  - Agents READ from tenantContext during scoring — no additional DB queries
  - ClassificationTrace records every adjustment with evidence
  CHOSEN: Single query, shared state, traceable adjustments

Option C: Lazy-load tenant context on first agent access
  - Query deferred until first agent needs it
  - Cached for subsequent agents
  REJECTED: Adds complexity without benefit — the query is cheap and always needed

CHOSEN: Option B — centralized query, SynapticIngestionState storage, traceable adjustments
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160D Phase 0: Architecture decision — centralized tenant context query before scoring" && git push origin dev`

---

## PHASE 1: TENANT CONTEXT SERVICE

### 1A: Verify Existing Interfaces

Before writing ANY code, verify what Phase C created. Run these commands and paste the output:

```bash
# 1. Find the SynapticIngestionState interface
grep -n "SynapticIngestionState\|TenantContext\|tenantContext" \
  web/src/lib/sci/synaptic-ingestion-state.ts

# 2. Find ClassificationTrace tenantContextApplied field
grep -n "tenantContextApplied\|ClassificationTrace" \
  web/src/lib/sci/sci-types.ts

# 3. Find where scoring happens in the analyze route
grep -n "scoreContent\|agentScor\|round1\|round2\|SynapticIngestionState" \
  web/src/app/api/import/sci/analyze/route.ts

# 4. Find current TenantContext type if it exists
grep -rn "interface TenantContext\|type TenantContext" \
  web/src/lib/sci/ --include="*.ts"

# 5. Check entities table for external_id access pattern
grep -rn "external_id\|entities" \
  web/src/app/api/import/sci/ --include="*.ts" | head -20
```

Paste the output into your Architecture Decision record. If any expected interface doesn't exist, CREATE it before proceeding — but document the gap as a Phase C incompleteness.

### 1B: Define/Verify TenantContext Type

The `TenantContext` type must match the Dev Plan v2 specification. If Phase C already defined it, verify it matches. If it doesn't exist or is incomplete, define it in `sci-types.ts`:

```typescript
// Tenant Context — populated by querying Supabase before agent scoring
// SCI Spec Layer 3, Tier 2
export interface TenantContext {
  // What the tenant already has
  existingEntityCount: number;
  existingEntityExternalIds: Set<string>;
  existingPlanCount: number;
  existingPlanComponentNames: string[];           // human-readable plan component names
  existingPlanInputRequirements: string[];         // what the plan's components need (from calculationIntent)
  committedDataRowCount: number;
  committedDataTypes: string[];                    // distinct data_type values
  referenceDataExists: boolean;

  // Overlap analysis — computed per content unit
  // (populated during scoring, not during initial query)
  entityIdOverlap?: EntityIdOverlap;
}

export interface EntityIdOverlap {
  sheetIdentifierColumn: string;                  // which column in the sheet was used
  sheetUniqueValues: Set<string>;                 // distinct values in that column
  matchingEntityIds: Set<string>;                 // values that match existing entity external_ids
  overlapPercentage: number;                      // matchingEntityIds.size / sheetUniqueValues.size
  overlapSignal: 'high' | 'partial' | 'none';    // >80% = high, 1-80% = partial, 0% = none
}
```

### 1C: Create Tenant Context Service

Create `web/src/lib/sci/tenant-context.ts`:

```typescript
/**
 * Tenant Context Service
 * SCI Spec Layer 3, Tier 2 — Deterministic tenant state query
 * 
 * Queries what the tenant already has in Supabase BEFORE agent scoring.
 * All adjustments are presence-based. Absence is not evidence.
 * 
 * Phase D of 12 (SCI Development Plan v2)
 */

import { createClient } from '@supabase/supabase-js';
import type { TenantContext, EntityIdOverlap, ContentProfile } from './sci-types';

/**
 * Query tenant state from Supabase.
 * Called ONCE before scoring, result stored in SynapticIngestionState.tenantContext.
 * 
 * @param tenantId - tenant UUID
 * @param supabaseUrl - from env
 * @param supabaseServiceKey - service role key (server-side only)
 * @returns TenantContext with all existing state
 */
export async function queryTenantContext(
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<TenantContext> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parallel queries — all independent, no sequential dependency
  const [
    entitiesResult,
    ruleSetsResult,
    committedDataCountResult,
    committedDataTypesResult,
    referenceDataResult
  ] = await Promise.all([
    // 1. Entities: count + external_ids
    supabase
      .from('entities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .not('external_id', 'is', null),

    // 2. Rule sets (plans): count + components
    supabase
      .from('rule_sets')
      .select('name, components')
      .eq('tenant_id', tenantId),

    // 3. Committed data: row count
    supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    // 4. Committed data: distinct data_type values
    supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId),

    // 5. Reference data: existence check
    supabase
      .from('reference_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
  ]);

  // Extract entity external_ids
  const entityExternalIds = new Set<string>(
    (entitiesResult.data ?? [])
      .map(e => e.external_id)
      .filter(Boolean)
  );

  // Extract plan component names and input requirements from calculationIntent
  const planComponentNames: string[] = [];
  const planInputRequirements: string[] = [];
  for (const rs of (ruleSetsResult.data ?? [])) {
    if (Array.isArray(rs.components)) {
      for (const comp of rs.components) {
        if (comp.name) planComponentNames.push(comp.name);
        // Extract input requirements from calculationIntent if present
        if (comp.calculationIntent?.inputs) {
          for (const input of Object.keys(comp.calculationIntent.inputs)) {
            if (!planInputRequirements.includes(input)) {
              planInputRequirements.push(input);
            }
          }
        }
      }
    }
  }

  // Extract distinct data_type values
  const committedDataTypes = [
    ...new Set(
      (committedDataTypesResult.data ?? [])
        .map(d => d.data_type)
        .filter(Boolean)
    )
  ];

  return {
    existingEntityCount: entityExternalIds.size,
    existingEntityExternalIds: entityExternalIds,
    existingPlanCount: (ruleSetsResult.data ?? []).length,
    existingPlanComponentNames: planComponentNames,
    existingPlanInputRequirements: planInputRequirements,
    committedDataRowCount: committedDataCountResult.count ?? 0,
    committedDataTypes: committedDataTypes,
    referenceDataExists: (referenceDataResult.count ?? 0) > 0
  };
}

/**
 * Compute entity ID overlap between a content unit and existing entities.
 * 
 * Uses the identifier column detected by Phase A's Content Profile.
 * Does NOT match on field names — matches on VALUES in the identifier column.
 * 
 * @param profile - ContentProfile from Phase A (has identifier detection)
 * @param rows - raw data rows for this content unit
 * @param existingEntityExternalIds - from TenantContext
 * @returns EntityIdOverlap or null if no identifier column detected
 */
export function computeEntityIdOverlap(
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  existingEntityExternalIds: Set<string>
): EntityIdOverlap | null {
  // Find the identifier column from Content Profile structural detection
  // Phase A marks columns with hasIdentifier based on structural analysis
  if (!profile.hasIdentifier || !profile.identifierColumn) {
    return null;
  }

  const identifierColumn = profile.identifierColumn;

  // Extract unique values from the identifier column
  const sheetUniqueValues = new Set<string>();
  for (const row of rows) {
    const val = row[identifierColumn];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      sheetUniqueValues.add(String(val).trim());
    }
  }

  if (sheetUniqueValues.size === 0) {
    return null;
  }

  // If tenant has no entities yet, overlap is 0% — this is valid, not an error
  if (existingEntityExternalIds.size === 0) {
    return {
      sheetIdentifierColumn: identifierColumn,
      sheetUniqueValues,
      matchingEntityIds: new Set<string>(),
      overlapPercentage: 0,
      overlapSignal: 'none'
    };
  }

  // Compute overlap
  const matchingEntityIds = new Set<string>();
  for (const val of sheetUniqueValues) {
    if (existingEntityExternalIds.has(val)) {
      matchingEntityIds.add(val);
    }
  }

  const overlapPercentage = matchingEntityIds.size / sheetUniqueValues.size;

  return {
    sheetIdentifierColumn: identifierColumn,
    sheetUniqueValues,
    matchingEntityIds,
    overlapPercentage,
    overlapSignal: overlapPercentage > 0.80 ? 'high'
                 : overlapPercentage > 0 ? 'partial'
                 : 'none'
  };
}
```

### Proof Gates — Phase 1
- PG-01: `TenantContext` interface exists in `sci-types.ts` (or verified from Phase C)
- PG-02: `EntityIdOverlap` interface exists in `sci-types.ts`
- PG-03: `tenant-context.ts` created with `queryTenantContext` and `computeEntityIdOverlap`
- PG-04: `queryTenantContext` uses `Promise.all` for parallel queries (not sequential)
- PG-05: Zero hardcoded field names in tenant-context.ts (Korean Test — grep verification)
- PG-06: Zero period references in tenant-context.ts (Decision 92/93 — grep verification)
- PG-07: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160D Phase 1: Tenant context service — query tenant state + entity ID overlap detection" && git push origin dev`

---

## PHASE 2: TENANT CONTEXT SCORE ADJUSTMENTS

### 2A: Define Adjustment Logic

Create the scoring adjustment function in `tenant-context.ts`. All adjustments are **presence-based.** Every adjustment must record evidence for the `ClassificationTrace`.

```typescript
/**
 * Tenant context score adjustments — presence-based ONLY.
 * 
 * CRITICAL: No absence-based boosting. AP-31.
 * ✅ "Tenant has entities, this sheet overlaps 80% → Transaction boost"
 * ❌ "Tenant has no plan → Plan Agent boost" — NEVER
 * 
 * @returns Array of adjustments with evidence for ClassificationTrace
 */
export interface TenantContextAdjustment {
  agent: string;                    // which agent is adjusted
  adjustment: number;               // positive = boost, negative = penalize
  signal: string;                   // what presence-based signal triggered this
  evidence: string;                 // human-readable evidence string
}

export function computeTenantContextAdjustments(
  tenantContext: TenantContext,
  overlap: EntityIdOverlap | null,
  profile: ContentProfile
): TenantContextAdjustment[] {
  const adjustments: TenantContextAdjustment[] = [];

  // ─── SIGNAL 1: Entity ID Overlap (most powerful) ───
  if (overlap && overlap.overlapSignal === 'high') {
    // >80% of this sheet's identifiers match existing entities
    // → This is data ABOUT existing entities, not a new roster
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.15,
      signal: 'entity_id_overlap_high',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entity external_ids`
    });
    adjustments.push({
      agent: 'entity',
      adjustment: -0.10,
      signal: 'entity_id_overlap_high',
      evidence: `Entities already exist — ${overlap.matchingEntityIds.size} matching. This sheet is data ABOUT them, not a new roster`
    });
  }

  if (overlap && overlap.overlapSignal === 'partial') {
    // Some overlap but not decisive — note it but don't strongly adjust
    // Partial overlap is a mixed signal. Could be:
    // - Transaction data with some new hires (partial roster + data)
    // - Updated roster (new entities + existing)
    // We record the observation but keep adjustments small
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.05,
      signal: 'entity_id_overlap_partial',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% partial overlap (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size} matching entity external_ids)`
    });
  }

  // Note: overlap.overlapSignal === 'none' (0% overlap) → NO adjustment
  // Absence of overlap is not evidence. AP-31.

  // ─── SIGNAL 2: Plan exists + data matches input requirements ───
  if (tenantContext.existingPlanCount > 0 && profile.numericFieldRatio > 0.30) {
    // Tenant has a plan and this sheet has numeric data
    // The plan needs data to calculate against — numeric content is likely that data
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.10,
      signal: 'plan_exists_numeric_content',
      evidence: `Tenant has ${tenantContext.existingPlanCount} plan(s) with ${tenantContext.existingPlanInputRequirements.length} input requirements. This sheet has ${Math.round(profile.numericFieldRatio * 100)}% numeric fields — likely the data those plans need`
    });
  }

  // ─── SIGNAL 3: Same external_ids but different structural profile → roster update ───
  if (overlap && overlap.overlapSignal === 'high'
    && !profile.hasTemporalColumns
    && profile.categoricalFieldRatio > 0.25) {
    // High ID overlap + no temporal data + categorical attributes
    // → This could be a roster update, not transaction data
    // → Reduce the transaction boost, increase entity boost
    adjustments.push({
      agent: 'entity',
      adjustment: +0.10,
      signal: 'roster_update_candidate',
      evidence: `High ID overlap (${Math.round(overlap.overlapPercentage * 100)}%) but no temporal columns and ${Math.round(profile.categoricalFieldRatio * 100)}% categorical fields — possible roster update, not transaction data`
    });
    adjustments.push({
      agent: 'transaction',
      adjustment: -0.05,
      signal: 'roster_update_candidate',
      evidence: `High ID overlap but categorical-heavy structure without temporal columns suggests roster update, not transactions`
    });
  }

  return adjustments;
}
```

### 2B: Adjustment Rules — What Is NOT Here (AP-31 Compliance)

The following adjustments are explicitly **NOT** implemented. They violate AP-31 (absence-based tenant context):

```
❌ "Tenant has no plan" → Plan Agent boost           — REMOVED (v1 had this, v2 corrected)
❌ "Tenant has no entities" → Entity Agent boost     — NEVER (absence is not evidence)  
❌ "Tenant has no committed_data" → Transaction boost — REMOVED (v1 had this, v2 corrected)
❌ "No reference data" → Reference Agent boost       — NEVER
```

**Grep verification required:** After implementation, scan for any absence-based patterns:

```bash
# Must return ZERO results
grep -rn "has no\|doesn't have\|!.*existingPlanCount\|=== 0.*boost\|Count === 0" \
  web/src/lib/sci/tenant-context.ts | grep -v "// " | grep -v "❌"
```

### Proof Gates — Phase 2
- PG-08: `TenantContextAdjustment` interface defined
- PG-09: `computeTenantContextAdjustments` function created
- PG-10: Entity ID high overlap (>80%) → Transaction +0.15, Entity -0.10
- PG-11: Entity ID zero overlap → NO adjustments (verified by tracing logic)
- PG-12: Plan exists + numeric content → Transaction +0.10
- PG-13: Roster update candidate detection (high overlap + no temporal + categorical)
- PG-14: ZERO absence-based adjustments (grep returns zero)
- PG-15: Every adjustment has `signal` + `evidence` strings populated
- PG-16: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160D Phase 2: Tenant context score adjustments — presence-based only, AP-31 compliant" && git push origin dev`

---

## PHASE 3: WIRE INTO ANALYZE FLOW

### 3A: Integrate Tenant Context into Analyze Route

The analyze route must be modified to:

1. **Query tenant context BEFORE scoring** — call `queryTenantContext` early in the analyze flow
2. **Store in SynapticIngestionState** — `state.tenantContext = tenantContext`
3. **Per-content-unit overlap** — call `computeEntityIdOverlap` for each sheet
4. **Apply adjustments** — call `computeTenantContextAdjustments` per content unit, apply to agent scores
5. **Record in ClassificationTrace** — populate `tenantContextApplied` array

```typescript
// In the analyze route, BEFORE agent scoring:

import { queryTenantContext, computeEntityIdOverlap, computeTenantContextAdjustments } from '@/lib/sci/tenant-context';

// 1. Query tenant context (once per import)
const tenantContext = await queryTenantContext(
  tenantId,
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2. Store in SynapticIngestionState
state.tenantContext = tenantContext;

// 3. For each content unit, AFTER Phase A content profile but BEFORE/DURING agent scoring:
for (const unit of contentUnits) {
  // Compute entity ID overlap for this specific sheet
  const overlap = computeEntityIdOverlap(
    unit.profile,
    unit.rows,  // or however the raw rows are accessed
    tenantContext.existingEntityExternalIds
  );

  // Compute adjustments
  const adjustments = computeTenantContextAdjustments(
    tenantContext,
    overlap,
    unit.profile
  );

  // Apply adjustments to agent scores (after Round 1, as part of Round 2 or post-Round-2)
  for (const adj of adjustments) {
    // Find the matching agent score and apply adjustment
    // The exact mechanism depends on Phase C's scoring pipeline
    // Key: adjustments ADD to agent scores, they don't replace them
  }

  // Record in ClassificationTrace
  unit.trace.tenantContextApplied = adjustments.map(adj => ({
    signal: adj.signal,
    adjustment: adj.adjustment,
    evidence: adj.evidence
  }));
}
```

### 3B: Integration Sequence

The analyze flow should follow this exact sequence:

```
1. Parse file → extract sheets, columns, rows
2. Phase A: Generate ContentProfile for each sheet
3. Phase B: Header comprehension (LLM call if needed)
4. ──► Phase D: Query tenant context (ONE query, stored in state) ◄──
5. Phase C Round 1: Agent scoring (structural heuristics + header comprehension)
6. Phase C Signatures: Composite signature matching → confidence floors
7. ──► Phase D: Per-sheet entity ID overlap + adjustments ◄──
8. Phase C Round 2: Spatial negotiation through SynapticIngestionState
9. ──► Phase D: Record adjustments in ClassificationTrace ◄──
10. Phase C Resolution: Determine final classification
```

**Note:** Tenant context adjustments are conceptually part of scoring. They inject between Round 1 and Round 2, or as an additional input to Round 2. The exact injection point depends on Phase C's implementation. Read the analyze route carefully to find the right insertion point. The principle is: tenant context informs Round 2 negotiations.

### 3C: Handle First Import Scenario

For Meridian's current state (rule_sets=1, entities=0, committed_data=0):

- `queryTenantContext` returns: existingPlanCount=1, existingEntityCount=0, rest zeros
- `computeEntityIdOverlap` returns: overlapPercentage=0, overlapSignal='none' (no entities to match against)
- `computeTenantContextAdjustments` returns:
  - For Datos_Rendimiento (transaction sheet): Signal 2 fires (plan exists + numeric content → Transaction +0.10). Signals 1 and 3 don't fire (no entity overlap possible).
  - For Plantilla (entity sheet): No signals fire (no entities to overlap with, no plan-data signal for non-numeric sheets).
  - For Datos_Flota_Hub (reference sheet): No signals fire.

This is **correct behavior.** Tenant context on first import adds a mild Transaction boost when a plan exists. It does NOT dramatically change classification — Tier 1 heuristics + signatures are the primary classifiers on first import. Tenant context becomes increasingly powerful on subsequent imports as the tenant accumulates data.

### Proof Gates — Phase 3
- PG-17: `queryTenantContext` called in analyze route BEFORE agent scoring
- PG-18: `state.tenantContext` populated on `SynapticIngestionState`
- PG-19: `computeEntityIdOverlap` called per content unit
- PG-20: `computeTenantContextAdjustments` called per content unit
- PG-21: Adjustments applied to agent scores (paste the integration code)
- PG-22: `ClassificationTrace.tenantContextApplied` populated (paste evidence)
- PG-23: Tenant context runs in correct sequence (after profile, before/during scoring)
- PG-24: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160D Phase 3: Wire tenant context into analyze flow — query before scoring, adjustments in Round 2" && git push origin dev`

---

## PHASE 4: BUILD + VERIFY + PR

### 4A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 4B: Code Review Verification

```bash
# 1. Verify tenant-context.ts exists
ls -la web/src/lib/sci/tenant-context.ts

# 2. Verify ZERO Korean Test violations — no field name matching
grep -rn '"ID_Empleado"\|"Nombre"\|"employee"\|"name"\|"target"\|"hub"' \
  web/src/lib/sci/tenant-context.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 3. Verify ZERO period references (Decision 92/93)
grep -rn "period\|Period" \
  web/src/lib/sci/tenant-context.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 4. Verify ZERO absence-based adjustments (AP-31)
grep -rn "=== 0.*\+\|has no\|doesn't have\|!.*Count\|!.*Exists" \
  web/src/lib/sci/tenant-context.ts | grep -v "// " | grep -v "❌" | grep -v "Note"
# Should return ZERO — all adjustments are presence-based

# 5. Verify tenant context integrated in analyze route
grep -rn "queryTenantContext\|computeEntityIdOverlap\|computeTenantContextAdjustments\|tenantContext" \
  web/src/app/api/import/sci/analyze/ --include="*.ts" | head -15

# 6. Verify SynapticIngestionState.tenantContext populated
grep -rn "state.tenantContext\|tenantContext =" \
  web/src/app/api/import/sci/analyze/ --include="*.ts"

# 7. Verify ClassificationTrace.tenantContextApplied populated
grep -rn "tenantContextApplied" \
  web/src/lib/sci/ --include="*.ts" web/src/app/api/import/sci/ --include="*.ts"
```

### 4C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160D: Tenant Context — presence-based scoring from existing tenant state" \
  --body "Phase D of 12-phase SCI Development Plan. Implements SCI Spec Layer 3, Tier 2.

## What Changed

### 1. Tenant Context Service (tenant-context.ts — NEW)
Queries tenant state from Supabase before agent scoring:
- Existing entity count + external_ids
- Existing plan count + component input requirements
- Committed data row count + types
- Reference data existence
All queries run in parallel via Promise.all.

### 2. Entity ID Overlap Detection
The most powerful tenant context signal. Compares identifier column values
from incoming sheets against existing entity external_ids.
- >80% overlap → strong evidence this is transaction/target data about existing entities
- 0% overlap → no adjustment (absence is not evidence, AP-31)

### 3. Presence-Based Score Adjustments
Three adjustment signals, all presence-based:
- Entity ID high overlap → Transaction +0.15, Entity -0.10
- Plan exists + numeric content → Transaction +0.10
- Roster update candidate (high overlap + no temporal + categorical)
Zero absence-based adjustments. AP-31 compliant.

### 4. SynapticIngestionState Integration
Tenant context stored in state.tenantContext, accessible to all agents.
Entity ID overlap computed per content unit.
All adjustments recorded in ClassificationTrace.tenantContextApplied.

## Implementation Completeness
SCI Spec Layer 3, Tier 2 says: 'The agent checks existing tenant state from the Synaptic Surface. This adjusts the base score.'
Phase D delivers: tenant state query + presence-based adjustments + entity ID overlap.
Gap: Tier 3 (prior signals from classification flywheel) — Phase E."
```

### Proof Gates — Phase 4
- PG-25: `npm run build` exits 0
- PG-26: localhost:3000 responds
- PG-27: Zero Korean Test violations (grep returns zero)
- PG-28: Zero period references (grep returns zero)
- PG-29: Zero absence-based adjustments (grep returns zero)
- PG-30: `queryTenantContext` called in analyze route
- PG-31: `SynapticIngestionState.tenantContext` populated
- PG-32: `ClassificationTrace.tenantContextApplied` populated
- PG-33: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160D Complete: Tenant Context — SCI Spec Layer 3 Tier 2" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- `TenantContext` type (define or verify from Phase C)
- `EntityIdOverlap` type
- `TenantContextAdjustment` type
- `tenant-context.ts` service module (query + overlap + adjustments)
- Integration into analyze route (query before scoring)
- SynapticIngestionState.tenantContext population
- ClassificationTrace.tenantContextApplied population
- Per-content-unit entity ID overlap detection
- Presence-based adjustment logic

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring functions (Phase C — read from, don't modify internal logic)
- Composite signatures (Phase C — tenant context layers on top, doesn't change floors)
- Header comprehension (Phase B — completed)
- Content Profile type detection (Phase A — completed)
- Classification signal storage (Phase E)
- Execute pipeline (Phase F)
- Convergence / input_bindings (Phase G)
- Auth files
- Calculation engine

### CRITICAL CONSTRAINTS

1. **Presence-based ONLY.** Every adjustment must reference something the tenant HAS. No adjustments based on what the tenant DOESN'T have. AP-31 is non-negotiable.
2. **Korean Test compliance.** Entity ID overlap matches on VALUES, not column names. `computeEntityIdOverlap` reads the identifier column detected by Phase A's structural analysis — it never reads column headers directly.
3. **Decision 92/93.** Zero period references anywhere in tenant-context.ts. Tenant context may observe committed_data exists, but never queries, creates, or references periods.
4. **One query per import.** `queryTenantContext` runs ONCE. The result is cached in SynapticIngestionState. No per-sheet DB queries.
5. **Adjustments are additive.** Tenant context adjustments ADD to agent scores. They don't override composite signature floors (Decision 99).
6. **Tenant context is ephemeral.** Stored in SynapticIngestionState (in-memory per import session). Not persisted to database. Phase E handles signal persistence.
7. **Identifier column from Phase A.** `computeEntityIdOverlap` uses `profile.identifierColumn` (or whatever Phase A named the detected identifier field). Verify the exact field name from `content-profile.ts` before coding.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-25 | Korean Test violation — field name matching | Overlap matches VALUES in identifier column, not column names |
| AP-30 | Period references in import code | Zero period awareness in tenant-context.ts |
| AP-31 | Absence-based tenant context | Presence-based matching only. 0% overlap = no adjustment |
| AP-32 | Dual code paths for same function | Single `computeTenantContextAdjustments` function |
| AP-33 | Partial specification reported as complete | Implementation Completeness Gate required |
| NEW | Sequential DB queries | Promise.all for all tenant state queries |
| NEW | Per-sheet DB queries | One query per import, cached in SynapticIngestionState |
| NEW | Tenant context overriding signature floors | Adjustments are additive, not replacements |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 3, Tier 2 says:**
"The agent checks existing tenant state from the Synaptic Surface. This adjusts the base score."

**After Phase D:**
- Tenant state query: ✅ `queryTenantContext` fetches entity count + IDs, plan count + requirements, committed_data count + types, reference_data existence
- Score adjustments: ✅ Presence-based adjustments from entity ID overlap, plan existence + numeric content, roster update detection
- SynapticIngestionState: ✅ `tenantContext` field populated, accessible to all agents
- ClassificationTrace: ✅ `tenantContextApplied` records every adjustment with evidence
- Absence-based logic: ✅ ZERO (AP-31 verified by grep)
- Entity ID overlap: ✅ Structural identifier column values compared against existing external_ids

**Tier 2 is complete.** Phase E builds Tier 3 (prior signals from the classification flywheel).

**Gap to full Layer 3:**
- Tier 3 (ML Confidence — prior classification signals for structurally similar content) — Phase E
- Tier 3 runs only when Tier 1 + Tier 2 produce no clear winner (gap < 0.15) — Phase E

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160D_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

### Completion Report Structure
1. **Architecture Decision** — centralized query before scoring, rationale
2. **Commits** — all with hashes, one per phase
3. **Files created** — tenant-context.ts
4. **Files modified** — sci-types.ts (if TenantContext/EntityIdOverlap added), analyze route, synaptic-ingestion-state.ts (if modified)
5. **Phase C Interface Verification** — paste the grep output from Phase 1A showing what exists
6. **Tenant Context Query** — paste the parallel query structure
7. **Adjustment Logic** — paste all three adjustment signals with evidence format
8. **AP-31 Compliance** — paste grep proving zero absence-based adjustments
9. **Proof gates** — 33 gates, each PASS/FAIL with pasted evidence
10. **Implementation Completeness Gate** — Tier 2 complete after Phase D

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Phase C interfaces verified BEFORE writing code (paste grep output)?
□ tenant-context.ts created?
□ queryTenantContext uses Promise.all (not sequential queries)?
□ computeEntityIdOverlap uses structural identifier column, not field names?
□ computeTenantContextAdjustments is presence-based ONLY?
□ ZERO absence-based adjustments (grep returns zero)?
□ ZERO Korean Test violations (grep returns zero)?
□ ZERO period references (grep returns zero)?
□ SynapticIngestionState.tenantContext populated in analyze route?
□ ClassificationTrace.tenantContextApplied populated per content unit?
□ Tenant context query runs BEFORE agent scoring?
□ Adjustments are additive, not overriding signature floors?
□ First import scenario handled (plan exists, no entities, no committed_data)?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160D: "The system knows what you already have. When it sees your employees' IDs appearing in a new upload, it understands: this is data about those people, not a new roster. Context from presence. Intelligence from evidence. Never from absence."*
