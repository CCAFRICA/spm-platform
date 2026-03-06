# HF-092: CLASSIFICATION SIGNALS SCHEMA CORRECTION
## Scale-Ready Schema for SCI Flywheel
## Type: Hotfix — Corrective
## Depends on: OB-160E (PR #186 — must be merged)
## Priority: P0 — Blocks Phase F. Standing Rule 2 violation.
## Root Cause: CC Failure Pattern 43 — JSONB blob instead of specification-defined columns

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply. PAY SPECIAL ATTENTION to Section A Rule 2: Scale by Design, Not Retrofit.
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `web/src/lib/sci/classification-signal-service.ts` — the file being corrected

---

## WHY THIS HF EXISTS

OB-160E was given a prompt that specified dedicated top-level columns on the `classification_signals` table:

```sql
-- DEV PLAN v2 SPECIFICATION (the controlling document):
classification_signals (
  id, tenant_id,
  source_file_name, sheet_name,
  structural_fingerprint JSONB,
  classification, confidence, decision_source,
  classification_trace JSONB,
  header_comprehension JSONB,
  vocabulary_bindings JSONB,
  agent_scores JSONB,
  human_correction_from TEXT,
  scope TEXT DEFAULT 'tenant',
  created_at TIMESTAMPTZ
)
```

CC instead stored all Phase E data inside the existing `signal_value` JSONB column under `signal_type: 'sci:classification_outcome_v2'`. This is a **Standing Rule 2 violation:**

- **Dedicated columns are indexable.** `WHERE structural_fingerprint->>'numericFieldRatioBucket' = '50-75'` on an indexed JSONB column is O(log n). Scanning inside a nested `signal_value` JSONB blob is O(n).
- **At 50 tenants × 100 imports × 3 sheets = 15,000 signals,** JSONB path scanning is noticeable. At enterprise scale (500 tenants × 1,000 imports), it's a redesign.
- **Phases I, J, K query these columns heavily.** Cross-tenant flywheel (Phase I) queries `scope = 'foundational'` + `structural_fingerprint` across ALL tenants. Domain flywheel (Phase J) adds domain filtering. Synaptic density (Phase K) aggregates by fingerprint. All of these require indexed, top-level columns.

**The specification defined the schema for a reason. CC deviated from it. This HF corrects the deviation.**

---

## PHASE 0: AUDIT CURRENT STATE

Before writing any code, document exactly what OB-160E created:

```bash
# 1. What columns exist on classification_signals now?
# Run in Supabase SQL Editor:
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'classification_signals' ORDER BY ordinal_position;

# 2. How does classification-signal-service.ts currently write signals?
grep -n "signal_value\|signal_type\|sci:classification" \
  web/src/lib/sci/classification-signal-service.ts

# 3. How does lookupPriorSignals currently query?
grep -A 15 "async function lookupPriorSignals" \
  web/src/lib/sci/classification-signal-service.ts

# 4. How does recallVocabularyBindings currently query?
grep -A 15 "async function recallVocabularyBindings" \
  web/src/lib/sci/classification-signal-service.ts

# 5. How many signals exist in the table right now?
# Run in Supabase SQL Editor:
# SELECT count(*), signal_type FROM classification_signals GROUP BY signal_type;

# 6. Are there existing OB-86 signals we need to preserve?
# Run in Supabase SQL Editor:
# SELECT DISTINCT signal_type FROM classification_signals;
```

Paste ALL output into a document. This establishes the baseline.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 0: Audit current classification_signals schema and usage" && git push origin dev`

---

## PHASE 1: SCHEMA MIGRATION

### 1A: Add Dedicated Columns

Execute this migration in the **Supabase SQL Editor** — not as a file. Verify with a schema query afterward.

```sql
-- HF-092: Add dedicated columns to classification_signals
-- Reason: Dev Plan v2 specification requires indexed, queryable columns.
-- OB-160E incorrectly stored data in signal_value JSONB blob.

-- Add columns (IF NOT EXISTS prevents failure if partially applied)
ALTER TABLE classification_signals 
  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
  ADD COLUMN IF NOT EXISTS sheet_name TEXT,
  ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB,
  ADD COLUMN IF NOT EXISTS classification TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS decision_source TEXT,
  ADD COLUMN IF NOT EXISTS classification_trace JSONB,
  ADD COLUMN IF NOT EXISTS header_comprehension JSONB,
  ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB,
  ADD COLUMN IF NOT EXISTS agent_scores JSONB,
  ADD COLUMN IF NOT EXISTS human_correction_from TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'tenant';

-- Verify columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'classification_signals' 
ORDER BY ordinal_position;
```

### 1B: Create Indexes for Scale

```sql
-- Index for prior signal lookup: tenant + structural fingerprint matching
-- This is the hot path — called on every import for every content unit
CREATE INDEX IF NOT EXISTS idx_cs_tenant_scope 
  ON classification_signals(tenant_id, scope);

CREATE INDEX IF NOT EXISTS idx_cs_tenant_fingerprint 
  ON classification_signals(tenant_id) 
  WHERE scope = 'tenant';

-- Index for vocabulary binding recall: tenant + most recent with bindings
CREATE INDEX IF NOT EXISTS idx_cs_vocab_bindings 
  ON classification_signals(tenant_id, created_at DESC) 
  WHERE vocabulary_bindings IS NOT NULL;

-- Index for cross-tenant flywheel (Phase I): foundational scope queries
CREATE INDEX IF NOT EXISTS idx_cs_foundational 
  ON classification_signals(scope, structural_fingerprint) 
  WHERE scope = 'foundational';

-- Index for domain flywheel (Phase J): domain-scoped queries
-- (scope column will be used with domain tagging in Phase J)

-- Verify indexes exist
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'classification_signals';
```

### 1C: Migrate Existing Phase E Data (if any)

If OB-160E wrote any signals into `signal_value` JSONB, migrate them to the dedicated columns:

```sql
-- Migrate Phase E signals from signal_value JSONB to dedicated columns
-- Only migrate rows where the dedicated columns are still NULL
UPDATE classification_signals
SET
  source_file_name = signal_value->>'source_file_name',
  sheet_name = signal_value->>'sheet_name',
  structural_fingerprint = (signal_value->'structural_fingerprint')::JSONB,
  classification = signal_value->>'classification',
  confidence = (signal_value->>'confidence')::NUMERIC,
  decision_source = signal_value->>'decision_source',
  classification_trace = (signal_value->'classification_trace')::JSONB,
  header_comprehension = (signal_value->'header_comprehension')::JSONB,
  vocabulary_bindings = (signal_value->'vocabulary_bindings')::JSONB,
  agent_scores = (signal_value->'agent_scores')::JSONB,
  human_correction_from = signal_value->>'human_correction_from',
  scope = COALESCE(signal_value->>'scope', 'tenant')
WHERE signal_type = 'sci:classification_outcome_v2'
  AND classification IS NULL;

-- Verify migration
SELECT id, source_file_name, sheet_name, classification, confidence, decision_source, scope
FROM classification_signals
WHERE signal_type = 'sci:classification_outcome_v2';
```

### Proof Gates — Phase 1
- PG-01: ALL dedicated columns exist on classification_signals (paste schema query result)
- PG-02: Index `idx_cs_tenant_scope` exists (paste pg_indexes query)
- PG-03: Index `idx_cs_tenant_fingerprint` exists
- PG-04: Index `idx_cs_vocab_bindings` exists
- PG-05: Index `idx_cs_foundational` exists
- PG-06: Any existing Phase E signals migrated to dedicated columns (paste verification query)
- PG-07: OB-86 signals (non-Phase-E) are UNTOUCHED (verify with count query)

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 1: Schema migration — dedicated columns + indexes for scale-ready signal storage" && git push origin dev`

---

## PHASE 2: UPDATE SIGNAL SERVICE TO USE DEDICATED COLUMNS

### 2A: Update writeClassificationSignal

Modify `web/src/lib/sci/classification-signal-service.ts` to write to dedicated columns instead of `signal_value` JSONB:

```typescript
// BEFORE (OB-160E — WRONG):
// .insert({
//   tenant_id: tenantId,
//   signal_type: 'sci:classification_outcome_v2',
//   signal_value: { structural_fingerprint, classification, ... },  // ← BLOB
//   confidence: ...,
// })

// AFTER (HF-092 — CORRECT):
// .insert({
//   tenant_id: tenantId,
//   signal_type: 'sci:classification_outcome_v2',  // keep for compatibility with OB-86 queries
//   source_file_name: sourceFileName,               // ← DEDICATED COLUMN
//   sheet_name: sheetName,                           // ← DEDICATED COLUMN
//   structural_fingerprint: fingerprint,             // ← DEDICATED COLUMN (indexed)
//   classification: classification,                  // ← DEDICATED COLUMN
//   confidence: confidence,                          // ← DEDICATED COLUMN
//   decision_source: decisionSource,                 // ← DEDICATED COLUMN
//   classification_trace: classificationTrace,       // ← DEDICATED COLUMN
//   header_comprehension: headerComprehension,       // ← DEDICATED COLUMN
//   vocabulary_bindings: vocabularyBindings,          // ← DEDICATED COLUMN
//   agent_scores: agentScores,                       // ← DEDICATED COLUMN
//   human_correction_from: humanCorrectionFrom,      // ← DEDICATED COLUMN
//   scope: 'tenant',                                 // ← DEDICATED COLUMN (indexed)
// })
```

### 2B: Update lookupPriorSignals

Query dedicated columns, not JSONB paths:

```typescript
// BEFORE (OB-160E — WRONG):
// .select('id, signal_value')  // ← reading from JSONB blob
// .filter on signal_value->>'structural_fingerprint'

// AFTER (HF-092 — CORRECT):
// .select('id, classification, confidence, decision_source, structural_fingerprint')
// Direct column access — indexed, O(log n) lookup
const { data, error } = await supabase
  .from('classification_signals')
  .select('id, classification, confidence, decision_source, structural_fingerprint')
  .eq('tenant_id', tenantId)
  .eq('scope', 'tenant')
  .order('created_at', { ascending: false })
  .limit(20);
```

### 2C: Update recallVocabularyBindings

Query `vocabulary_bindings` column directly:

```typescript
// BEFORE (OB-160E — WRONG):
// .select('signal_value')  // ← reading from JSONB blob
// then extracting signal_value.vocabulary_bindings

// AFTER (HF-092 — CORRECT):
// .select('vocabulary_bindings')  // ← direct column access, indexed
const { data, error } = await supabase
  .from('classification_signals')
  .select('vocabulary_bindings')
  .eq('tenant_id', tenantId)
  .not('vocabulary_bindings', 'is', null)
  .order('created_at', { ascending: false })
  .limit(5);
```

### 2D: Update Trace API Endpoint

Update `web/src/app/api/import/sci/trace/route.ts` to query dedicated columns:

```typescript
// Select from dedicated columns, not signal_value JSONB
const { data, error } = await supabase
  .from('classification_signals')
  .select(`
    id, source_file_name, sheet_name,
    classification, confidence, decision_source,
    structural_fingerprint, classification_trace,
    header_comprehension, vocabulary_bindings,
    agent_scores, human_correction_from, scope,
    created_at
  `)
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false })
  .limit(limit);
```

### 2E: Verify No Remaining signal_value References for SCI Data

```bash
# After updates, grep for any remaining signal_value usage in SCI signal code
grep -rn "signal_value" \
  web/src/lib/sci/classification-signal-service.ts \
  web/src/app/api/import/sci/trace/route.ts
# Should return ZERO for SCI signal reads/writes
# (signal_value may still exist for OB-86 non-SCI signals — that's fine)
```

### Proof Gates — Phase 2
- PG-08: writeClassificationSignal writes to dedicated columns (paste the insert object)
- PG-09: lookupPriorSignals queries dedicated columns, not signal_value (paste the select)
- PG-10: recallVocabularyBindings queries vocabulary_bindings column directly (paste the select)
- PG-11: Trace API queries dedicated columns (paste the select)
- PG-12: ZERO signal_value references in classification-signal-service.ts for SCI signals
- PG-13: ZERO signal_value references in trace/route.ts
- PG-14: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 2: Signal service writes/reads dedicated columns — no JSONB blob" && git push origin dev`

---

## PHASE 3: BUILD + VERIFY + PR

### 3A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 3B: Code Review Verification

```bash
# 1. Verify classification-signal-service.ts writes dedicated columns
grep -n "source_file_name\|sheet_name\|structural_fingerprint\|classification_trace\|vocabulary_bindings\|decision_source\|human_correction_from\|scope" \
  web/src/lib/sci/classification-signal-service.ts | head -20

# 2. Verify NO signal_value usage for SCI data
grep -n "signal_value" \
  web/src/lib/sci/classification-signal-service.ts \
  web/src/app/api/import/sci/trace/route.ts

# 3. Verify lookupPriorSignals selects from columns
grep -A 10 "lookupPriorSignals" \
  web/src/lib/sci/classification-signal-service.ts | grep "select"

# 4. Verify recallVocabularyBindings selects vocabulary_bindings column
grep -A 10 "recallVocabularyBindings" \
  web/src/lib/sci/classification-signal-service.ts | grep "select"

# 5. Verify schema in Supabase (paste result)
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'classification_signals' ORDER BY ordinal_position;

# 6. Verify indexes in Supabase (paste result)
# SELECT indexname FROM pg_indexes WHERE tablename = 'classification_signals';
```

### 3C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-092: Classification Signals Schema Correction — dedicated columns for scale" \
  --body "## Why This HF Exists

OB-160E stored SCI classification signal data inside a generic signal_value JSONB blob 
instead of the dedicated columns specified in the Dev Plan v2. This violates Standing Rule 2 
(Scale by Design) because:

- JSONB path queries are O(n) vs indexed column queries O(log n)
- Phases I/J/K query structural_fingerprint and scope across ALL tenants
- At 50+ tenants with hundreds of imports, JSONB scanning becomes a bottleneck

## What Changed

### 1. Schema Migration
Added dedicated columns to classification_signals: source_file_name, sheet_name,
structural_fingerprint, classification, confidence, decision_source, classification_trace,
header_comprehension, vocabulary_bindings, agent_scores, human_correction_from, scope.

### 2. Indexes for Scale
- idx_cs_tenant_scope: tenant + scope (hot path for prior signal lookup)
- idx_cs_tenant_fingerprint: tenant with scope='tenant' filter
- idx_cs_vocab_bindings: tenant + created_at for vocabulary recall
- idx_cs_foundational: scope + fingerprint for cross-tenant flywheel (Phase I)

### 3. Service Updated
writeClassificationSignal, lookupPriorSignals, recallVocabularyBindings all read/write
dedicated columns instead of signal_value JSONB.

### 4. Data Migration
Any OB-160E signals in signal_value JSONB migrated to dedicated columns.
OB-86 non-SCI signals untouched.

## CC Failure Pattern 43
JSONB blob instead of specification-defined columns. The controlling document (Dev Plan v2)
specified the schema. The implementation deviated. This HF restores specification compliance.

## Standing Rule 2 Compliance
Every query now uses indexed columns. Scale test: works at 500 tenants × 1000 imports = 
1.5M signals with O(log n) lookups."
```

### Proof Gates — Phase 3
- PG-15: `npm run build` exits 0
- PG-16: localhost:3000 responds
- PG-17: Schema query shows ALL dedicated columns (paste result)
- PG-18: Index query shows ALL 4 indexes (paste result)
- PG-19: ZERO signal_value references for SCI data in classification-signal-service.ts
- PG-20: ZERO signal_value references in trace/route.ts
- PG-21: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Complete: Classification signals schema correction — dedicated indexed columns" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- ALTER TABLE to add dedicated columns
- CREATE INDEX for scale-ready queries
- Migrate any existing signal_value data to dedicated columns
- Update writeClassificationSignal to write dedicated columns
- Update lookupPriorSignals to query dedicated columns
- Update recallVocabularyBindings to query dedicated column
- Update trace/route.ts to query dedicated columns
- Preserve OB-86 non-SCI signals (don't touch signal_value for those)

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring logic
- Analyze route flow
- Execute route flow (except signal write call)
- Header comprehension logic (only the data access path changes)
- Tenant context
- Content profile
- Auth files
- Calculation engine

### CRITICAL CONSTRAINTS

1. **OB-86 compatibility.** The `signal_type` and `signal_value` columns remain for OB-86's non-SCI signals (plan anomaly, field mapping, etc.). Phase E's SCI signals use the dedicated columns. Both coexist.
2. **No data loss.** If OB-160E wrote signals into signal_value, they must be migrated to dedicated columns. Verify migration with a count query before and after.
3. **Indexes designed for Phases I/J/K.** The `idx_cs_foundational` index prepares for cross-tenant flywheel queries even though Phase I is future. Building the index now costs nothing. Adding it later requires a table scan.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-092_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification

### Completion Report Structure
1. **Phase 0 audit results** — paste current schema, current signal_value usage, signal counts
2. **Schema migration** — paste the SQL executed + verification query results
3. **Index creation** — paste the SQL executed + pg_indexes verification
4. **Data migration** — paste before/after signal counts
5. **Service updates** — paste the new insert/select calls (dedicated columns)
6. **signal_value grep** — paste proof of zero SCI signal_value references
7. **Proof gates** — 21 gates, each PASS/FAIL with pasted evidence

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read?
□ Current schema audited (Phase 0 output pasted)?
□ All dedicated columns added to classification_signals?
□ All 4 indexes created?
□ Existing Phase E signals migrated to dedicated columns?
□ OB-86 non-SCI signals untouched?
□ writeClassificationSignal writes dedicated columns?
□ lookupPriorSignals queries dedicated columns?
□ recallVocabularyBindings queries vocabulary_bindings column?
□ trace/route.ts queries dedicated columns?
□ ZERO signal_value references for SCI data?
□ npm run build exits 0?
□ localhost:3000 responds?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*HF-092: "The specification defined dedicated columns for a reason: they're indexable, queryable, and scale-ready. A JSONB blob is convenient today and a redesign tomorrow. We don't build for today."*
