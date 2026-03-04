# OB-152: DECISION 92 — TEMPORAL BINDING AND REFERENCE AGENT FOUNDATION
## Phased Architecture Migration with Full Regression Protection
## Date: 2026-03-04
## Type: Multi-Session Batch (6 phases)
## Estimated Duration: 14-18 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## WHY THIS OB EXISTS — AND WHY IT IS DANGEROUS

This OB modifies the **Engine Contract** (Decision 84). The calculation engine's data query pattern changes from FK-based period lookup to calculation-time date-range join. This is the most foundational change since the engine was proven at 100% accuracy (67/67 entities, $0.00 delta).

**What we are protecting:**
- LAB (Caribe Financial): 268 results, $8,498,311.77 total, 4 plans. PROVEN baseline. Different results after this OB = OB failure.
- Optica Luminar plan interpretation: 7 components, proven 3x on production.
- SCI classification pipeline: 4 agents with proven structural heuristic scoring.

**What we are changing:**
- committed_data gets a source_date column (the business date from the raw data)
- The engine supports TWO data-fetch paths during transition: source_date (new) and period_id (legacy)
- SCI execute stops creating periods during import, extracts source_date instead
- A 5th SCI agent (Reference) recognizes catalog/lookup data
- Three new tables: reference_data, reference_items, alias_registry

**What we are NOT changing:**
- The calculation engine component evaluation logic (intent executor, bounded lookups)
- Plan interpretation (AI to rule_sets.components)
- Entity extraction from rosters
- The period lifecycle state machine
- Authentication, navigation, Observatory, or any dashboard surface
- rule_sets, entities, periods, or rule_set_assignments table structures

---

## READ FIRST — MANDATORY FILES

Before reading further, open and read these files COMPLETELY. You must cat each file and confirm you read it in your first commit.

```bash
cd /Users/AndrewAfrica/spm-platform
cat CC_STANDING_ARCHITECTURE_RULES.md
cat SCHEMA_REFERENCE.md
cat DECISION_92_TEMPORAL_REFERENCE_NORMALIZATION.md
cat ENGINE_CONTRACT_BINDING.sql
cat Vialuce_Synaptic_Content_Ingestion_Specification.md
cat OB-127_SCI_FOUNDATION.md
```

Create file OB-152_READ_CONFIRMATION.md with:
- One line per file confirming you read it
- For SCHEMA_REFERENCE.md: paste the committed_data table definition
- For CC_STANDING_ARCHITECTURE_RULES.md: paste the Anti-Pattern Registry count
- For SCI specification: paste the 4 agent types and their top 3 positive signals

**Commit:** `OB-152 Phase 0A: Prompt committed + read confirmation`

---

## STANDING RULES

1. After EVERY commit: git push origin dev
2. After EVERY push: kill dev server, rm -rf .next, npm run build, npm run dev, confirm localhost:3000
3. Final step: gh pr create --base main --head dev
4. Commit this prompt to git as first action (Rule 29)
5. Git from repo root (spm-platform), NOT web/ (Rule 6)
6. Fix logic, not data (Rule 12)
7. Zero domain vocabulary in new code — Korean Test on every new file
8. One commit per phase — collapsed commits = standing rule violation (Rule 28)
9. Phase 0 MUST complete before any code changes — Decision 85 (test with data first)
10. Read-before-write: cat every function you intend to modify BEFORE modifying it. Paste the CURRENT code in the completion report alongside the CHANGED code.

---

## CC FAILURE PATTERNS — SPECIFIC TO THIS OB

| Pattern | Risk | How CC Will Fail | Mitigation |
|---|---|---|---|
| #1 Placeholder Syndrome | source_date extraction returns hardcoded new Date() instead of real extraction | PG requires source_date values matching actual dates in row_data JSONB |
| #3 Schema Disconnect | Migration creates source_date column, TypeScript writes sourceDate (camelCase) | Verify column name convention with test query in Phase 1B |
| #5 Adjacent File Problem | CC changes wrong data-fetch function (dashboard instead of engine) | Phase 0 maps ALL consumers; Phase 2 targets ONLY the engine function |
| #6 Stale State Blindness | LAB has period_id but no source_date; new path returns 0 rows | Hybrid: try source_date first, if 0 rows AND period_id exists, fall back |
| #28 Classification without construction | Reference Agent scores but execute doesnt populate tables | PG requires database row count > 0 |
| #31 Korean Test violation | Date extraction uses if key equals Mes or fecha | Date extraction uses STRUCTURAL heuristics, zero field name string literals |

---

## ARCHITECTURE DECISION GATE

```
DECISION: How to implement calculation-time period binding while protecting LAB?

Option A: Pure switchover — all queries to date-range join
  Risk: LAB has no source_date, ALL queries return 0 rows. CATASTROPHIC.

Option B: Backfill source_date on LAB first, then switchover
  Risk: Requires manual mapping of 4 LAB plan data structures. Fragile.

Option C: Hybrid — engine tries source_date first, falls back to period_id
  Risk: Two code paths during transition. Acceptable because:
    1. Fallback is CURRENT working code (zero change risk)
    2. New path only activates when source_date exists
    3. After LAB backfill (future OB), fallback becomes dead code

CHOSEN: Option C (Hybrid)
REJECTED: A (breaks LAB), B (requires manual LAB mapping)
```

---

## PHASE 0: DIAGNOSTIC — CONSUMER MAP AND BASELINE

### 0A: Map ALL period_id consumers on committed_data

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== 1. Direct .eq period_id on committed_data ==="
grep -rn "\.eq.*['\"]period_id['\"]" web/src/ --include="*.ts" --include="*.tsx" | grep -iv "periods\|calculation_results\|calculation_batches\|entity_period" | head -30

echo ""
echo "=== 2. Supabase queries on committed_data ==="
grep -rn "from('committed_data')" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 3. Engine data-fetch function ==="
grep -rn "committed_data" web/src/lib/orchestration/ web/src/lib/calculation/ web/src/lib/data-architecture/ --include="*.ts" | head -20

echo ""
echo "=== 4. SCI execute period references ==="
grep -rn "period\|Period" web/src/app/api/import/sci/execute/route.ts | head -30

echo ""
echo "=== 5. Import pipeline period creation ==="
grep -rn "\.insert.*period\|from('periods').*insert\|createPeriod" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 6. SCI agents directory ==="
ls -la web/src/lib/sci/
wc -l web/src/lib/sci/agents.ts web/src/lib/sci/sci-types.ts
```

### 0B: READ the engine data-fetch function completely

From 0A result 3, identify the file. Then cat the COMPLETE function that queries committed_data for an entity+period. Paste it in the completion report.

### 0C: READ the SCI execute pipeline completely

```bash
cat web/src/app/api/import/sci/execute/route.ts
```

Paste the period creation section in the completion report.

### 0D: LAB baseline verification

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: t } = await sb.from('tenants').select('id').eq('slug', 'caribe-financial').single();
  if (!t) { console.log('LAB not found'); return; }
  const { data: r } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', t.id);
  const total = (r||[]).reduce((s,x)=>s+Number(x.total_payout),0);
  console.log('LAB:', (r||[]).length, 'results,', total.toFixed(2));
  console.log('Expected: 268 results, 8498311.77');
  const { count: wp } = await sb.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id',t.id).not('period_id','is',null);
  const { count: tot } = await sb.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id',t.id);
  console.log('Committed data total:', tot, 'with period_id:', wp);
}
run();
"
```

### Phase 0 Output Format

```
// CONSUMER MAP (committed_data x period_id):
// [file:line] — [ENGINE/DASHBOARD/API/IMPORT] — [function]
//
// ENGINE FUNCTION: [file], [function], lines [N-M]
// [paste exact query code]
//
// SCI PERIOD CREATION: [file], lines [N-M]
// [paste exact creation code]
//
// LAB BASELINE: [count] results, $[total]
// Committed data: [total] rows, [with_period] have period_id
//
// BLAST RADIUS: [N] ENGINE, [N] DASHBOARD, [N] IMPORT consumers
```

**Commit:** `OB-152 Phase 0: Consumer map + LAB baseline`

**HARD STOP: Do NOT proceed until Phase 0 is committed with paste evidence.**

---

## PHASE 1: SCHEMA MIGRATION — ADDITIVE ONLY

### 1A: Create and EXECUTE migration

Create web/supabase/migrations/20260304_decision92_temporal_binding.sql with:
- ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE
- Index on (tenant_id, source_date) WHERE source_date IS NOT NULL
- Composite index on (tenant_id, entity_id, source_date) WHERE both NOT NULL
- CREATE TABLE reference_data (id, tenant_id, reference_type, name, version, status, key_field, schema_definition, import_batch_id, metadata, created_by, created_at, updated_at)
- CREATE TABLE reference_items (id, tenant_id, reference_data_id, external_key, display_name, category, attributes, status, created_at, updated_at)
- CREATE TABLE alias_registry (id, tenant_id, reference_item_id, alias_text, alias_normalized, confidence, confirmation_count, source, scope, metadata, created_at, updated_at)
- RLS policies on all 3 new tables
- UNIQUE constraints per Decision 92 specification

**EXECUTE in Supabase SQL Editor. File existence is NOT proof (AP-8).**

### 1B: Verify column name convention

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await sb.from('committed_data').select('source_date').limit(1);
  if (error) console.log('COLUMN NOT FOUND:', error.message);
  else console.log('Column name in JS client:', Object.keys(data[0] || {source_date:null}));
  for (const t of ['reference_data','reference_items','alias_registry']) {
    const { error: e } = await sb.from(t).select('id').limit(1);
    console.log(t + ':', e ? 'FAIL: '+e.message : 'EXISTS');
  }
}
run();
"
```

### 1C: Regenerate types or manually add

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx supabase gen types typescript --project-id bayqxeiltnpjrvflksfa > src/types/database.types.ts 2>/dev/null || echo "Manual type update needed"
```

**PG-1 (HARD): source_date queryable, 3 tables exist, LAB count unchanged, build exits 0.**

**Commit:** `OB-152 Phase 1: Schema migration — source_date + reference tables (EXECUTED + VERIFIED)`

---

## PHASE 2: ENGINE HYBRID PATH

### READ-BEFORE-WRITE GATE

cat the COMPLETE engine data-fetch function (identified Phase 0B) BEFORE modifying. Paste BEFORE code in completion report.

### 2A: Implement hybrid

Wherever the engine queries committed_data for entity+period:

```typescript
// Cache period dates ONCE per calculation batch (not per entity)
const periodDates = await getPeriodDates(supabase, periodId); // { start_date, end_date }

// For each entity:
async function getEntityData(supabase, tenantId, entityId, periodId, periodDates) {
  // Try source_date path first (new imports)
  if (periodDates?.start_date && periodDates?.end_date) {
    const { data: dateRows } = await supabase
      .from('committed_data').select('*')
      .eq('tenant_id', tenantId).eq('entity_id', entityId)
      .not('source_date', 'is', null)
      .gte('source_date', periodDates.start_date)
      .lte('source_date', periodDates.end_date);
    if (dateRows && dateRows.length > 0) return dateRows;
  }
  // Fallback to period_id (existing LAB data)
  const { data: legacyRows } = await supabase
    .from('committed_data').select('*')
    .eq('tenant_id', tenantId).eq('entity_id', entityId)
    .eq('period_id', periodId);
  return legacyRows || [];
}
```

### 2B: Apply to ALL ENGINE consumers from Phase 0 consumer map

### 2C: Supabase .in() batching — <=200 items per call

### 2D: LAB REGRESSION TEST

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: t } = await sb.from('tenants').select('id').eq('slug','caribe-financial').single();
  const { data: r } = await sb.from('calculation_results').select('total_payout').eq('tenant_id',t.id);
  const total = (r||[]).reduce((s,x)=>s+Number(x.total_payout),0);
  const count = (r||[]).length;
  console.log('LAB REGRESSION:', count, 'results,', total.toFixed(2));
  console.log(count===268 && Math.abs(total-8498311.77)<0.10 ? 'PASS' : '*** REGRESSION FAIL ***');
}
run();
"
```

**PG-2 (HARD — BLOCKING): LAB 268 results, $8,498,311.77 +/- $0.10. If FAIL, revert Phase 2.**

**Commit:** `OB-152 Phase 2: Engine hybrid — source_date primary, period_id fallback`

---

## PHASE 3: SCI PIPELINE — SOURCE_DATE EXTRACTION

### READ-BEFORE-WRITE GATE

cat the COMPLETE SCI execute route. Paste the period creation section in completion report.

### 3A: Remove period creation from SCI execute

Remove/comment out code that: detects period labels, creates period records, assigns period_id to committed_data.

DO NOT remove: entity extraction, entity binding, classification, row_data population.

### 3B: Add source_date extraction — STRUCTURAL, NOT LINGUISTIC

**CRITICAL KOREAN TEST REQUIREMENT:** Zero field-name matching in any specific language. No if key equals Mes, fecha, month, year.

Date extraction uses THREE strategies in order:

1. **Content Profile date column** — the Content Profile already identifies date columns by value analysis (not name). Use the identified column.
2. **AI semantic role** — SCI field classification already tags fields with semantic roles. If a field is tagged date/transaction_date/event_date, use it.
3. **Structural scan** — find any column where values parse as valid dates in range 2000-2030.

```typescript
function extractSourceDate(
  rowData: Record<string, unknown>,
  dateColumnHint: string | null,     // From Content Profile
  semanticRoles: Record<string, string> | null  // From SCI classification
): string | null {
  // Strategy 1: Content Profile identified date column
  if (dateColumnHint && rowData[dateColumnHint] != null) {
    const parsed = parseAnyDateValue(rowData[dateColumnHint]);
    if (parsed) return parsed;
  }
  // Strategy 2: Semantic role tagged as temporal
  if (semanticRoles) {
    for (const [field, role] of Object.entries(semanticRoles)) {
      if (['date','transaction_date','event_date','cutoff_date'].includes(role)) {
        if (rowData[field] != null) {
          const parsed = parseAnyDateValue(rowData[field]);
          if (parsed) return parsed;
        }
      }
    }
  }
  // Strategy 3: Structural scan (plausible date in any column)
  for (const value of Object.values(rowData)) {
    if (value == null) continue;
    const parsed = parseAnyDateValue(value);
    if (parsed) {
      const y = new Date(parsed).getFullYear();
      if (y >= 2000 && y <= 2030) return parsed;
    }
  }
  return null;
}

function parseAnyDateValue(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) return d.toISOString().split('T')[0];
  }
  if (typeof value === 'number' && value >= 36526 && value <= 47483) {
    // Excel serial date range 2000-01-01 to 2030-01-01
    const d = new Date(new Date(1899,11,30).getTime() + value * 86400000);
    return d.toISOString().split('T')[0];
  }
  return null;
}
```

**VERIFY Korean Test:**
```bash
grep -n "'[Mm]es'\|'[Ff]echa'\|'[Mm]onth'\|'[Yy]ear'\|'[Aa].o'" web/src/lib/sci/ -r
echo "(Expected: 0 matches)"
```

### 3C: Wire source_date into committed_data INSERT

Add source_date to INSERT. Remove period_id from INSERT.

### 3D: Add dateRange to execute response

```typescript
return NextResponse.json({ ...response, dateRange: { earliest, latest, count }, periodsCreated: 0 });
```

### 3E: Verify

```bash
# No period creation in SCI execute
grep -n "from('periods').*insert\|createPeriod" web/src/app/api/import/sci/execute/route.ts
echo "(Expected: 0)"

# source_date in INSERT path
grep -n "source_date" web/src/app/api/import/sci/execute/route.ts
echo "(Expected: >= 1)"

# Korean Test
grep -rn "'[Mm]es'\|'fecha'\|'month'\|'year'" web/src/lib/sci/ --include="*.ts" | grep -v "//\|semantic"
echo "(Expected: 0)"
```

Rerun LAB regression from Phase 2D.

**PG-3 (HARD): Zero period creation in SCI, source_date in INSERT, Korean Test pass, LAB regression pass.**

**Commit:** `OB-152 Phase 3: SCI — remove period creation, add source_date extraction`

---

## PHASE 4: REFERENCE AGENT — FIFTH SCI CLASSIFICATION

### READ-BEFORE-WRITE GATE

cat web/src/lib/sci/agents.ts and web/src/lib/sci/sci-types.ts completely. Paste agent list and ContentClassification type.

### 4A: Add reference to ContentClassification type

### 4B: Add Reference Agent weights following exact pattern of existing 4 agents

Positive signals: high_key_uniqueness (+0.25), descriptive_columns (+0.20), low_row_count (+0.15), no_date_column (+0.10), no_entity_identifier (+0.10), clean_headers (+0.05).
Negative: has_date_column (-0.20), transactional_rows (-0.20), has_entity_identifier (-0.10), high_sparsity (-0.10), auto_generated_headers (-0.15).

### 4C: Add Reference routing in SCI execute

Reference classification creates reference_data + reference_items records. Does NOT insert into committed_data.

### 4D: Regression test — create web/scripts/ob152-test-agents.ts

Test with synthetic ContentProfile objects that:
- Catalog shape -> Reference Agent wins
- Roster shape -> Entity Agent still wins
- Transaction shape -> Transaction Agent still wins
- Plan shape -> Plan Agent still wins
- Target shape -> Target Agent still wins

### 4E: Korean Test

```bash
grep -rn "product\|catalog\|sku\|menu\|territory\|commission\|compensation\|restaurant\|franchise" web/src/lib/sci/ --include="*.ts" | grep -v "//\|reference_type\|test"
echo "(Expected: 0 domain vocabulary)"
```

Rerun LAB regression.

**PG-4 (HARD): Reference Agent scores correctly, 4 existing agents unaffected, Korean Test pass, LAB pass.**

**Commit:** `OB-152 Phase 4: Reference Agent — fifth SCI classification`

---

## PHASE 5: DOCUMENTATION + SCHEMA_REFERENCE UPDATE

### 5A: Update SCHEMA_REFERENCE.md
Add source_date to committed_data. Add reference_data, reference_items, alias_registry.

### 5B: Update CC_STANDING_ARCHITECTURE_RULES.md
Add anti-patterns AP-23 (SCI creates periods), AP-24 (period_id at import), AP-25 (language-specific date extraction).

### 5C: Update ENGINE_CONTRACT_BINDING.sql
Replace 7-value query with 8-value query per Decision 92.

**PG-5 (SOFT): Docs updated.**

**Commit:** `OB-152 Phase 5: Documentation — SCHEMA_REFERENCE + CC_RULES + ENGINE_CONTRACT`

---

## PHASE 6: COMPLETION REPORT + PR

### Completion Report Structure (Rule 26)

OB-152_COMPLETION_REPORT.md in project root:
- Commits (one per phase, Rule 28)
- Files changed (every file, with line counts)
- Schema changes (source_date + 3 tables)
- Proof gates (PG-1 through PG-5 + BUILD + KOREAN) with paste evidence
- LAB regression summary (baseline, after each phase, final delta)
- BEFORE/AFTER code (Rule 10 read-before-write evidence)
- Compliance checklist
- Known issues / deferred items

### PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-152: Decision 92 — Temporal Binding + Reference Agent" \
  --body "Decision 92: source_date replaces period_id as structural requirement. Engine hybrid path. SCI stops creating periods. Reference Agent (5th SCI classification). LAB regression: PASS."
```

**Commit:** `OB-152 Phase 6: Completion report + PR`

---

## SCOPE CONTROL

### IN: source_date column, engine hybrid, SCI date extraction, Reference Agent, 3 tables, docs
### OUT: Import UI changes, Calculate page updates, LAB backfill, normalization pipeline, alias resolution, any navigation/auth/dashboard changes

### PRIORITY IF TIME SHORT:
1. Phases 0-2 = MINIMUM (schema + engine hybrid + LAB regression)
2. Phase 3 = HIGH (unblocks Optica import)
3. Phase 4 = IMPORTANT (can be separate OB)
4. Phase 5 = manual fallback available

---

## DOCUMENT UPDATE TRACKER

| Document | Update | When |
|---|---|---|
| SCHEMA_REFERENCE.md | source_date + 3 tables | This OB Phase 5 |
| CC_STANDING_ARCHITECTURE_RULES.md | AP-23, AP-24, AP-25 | This OB Phase 5 |
| ENGINE_CONTRACT_BINDING.sql | 8-value query | This OB Phase 5 |
| Vialuce_Calculation_Flow_Architecture | Layers 2+4 | Next session |
| Vialuce_SCI_Specification | 5 agents, source_date | Next session |
| VIALUCE_OPERATIONS_BACKLOG.md | Decision 92 | Next session |
| TMR Addendum 10 | Calculation-Time Binding | Next session |
| Architecture Reference | Concepts C-61 to C-65 | Next session |

---

*"The data knows when it happened. The business decides how to window it. The engine applies the window at calculation time."*
*— Decision 92, March 4, 2026*
