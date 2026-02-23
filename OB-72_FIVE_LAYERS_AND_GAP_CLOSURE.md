# OB-72: FIVE LAYERS OF PROOF + FINAL GAP CLOSURE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with all sections (A through F).

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query.

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### THE THREE VIOLATIONS THAT KEEP RECURRING

**VIOLATION 1: Inventing schema instead of checking it.**
RULE: Before writing ANY Supabase query, verify every column name against SCHEMA_REFERENCE.md.

**VIOLATION 2: Creating parallel implementations instead of wiring existing code.**
RULE: Before creating ANY new file, `grep -rn` for existing implementations. Extend, don't duplicate.

**VIOLATION 3: Claiming PASS via code review instead of proving with live tests.**
RULE: Every proof gate marked "browser test" or "SQL query" must include PASTED OUTPUT. "Code:" is NOT evidence. "PASS — grep shows function exists" is NOT evidence. **PASTE the actual output, screenshot description, or curl response.**

### ⚠️ SPECIAL ENFORCEMENT FOR THIS OB

OB-69, OB-70, and OB-71 ALL claimed proof gates via code analysis. Zero browser evidence across 3 OBs and ~85 proof gates. This is the last OB before CLT-67. **Mission 6 requires ACTUAL browser verification with pasted evidence for every item.** CC will run the dev server, open pages, and paste what it sees. No exceptions.

### COMPLIANCE CHECKPOINTS (Mandatory at end of each Mission)

```
COMPLIANCE CHECK — Mission N
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — list tables]
□ Searched for existing implementations before creating new files? [YES/NO — list grep commands]
□ Every state change persists to Supabase? [YES/NO — list write operations]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — list AP#]
□ Scale test: would this work for 150K entities? [YES/NO]
```

---

## WHY THIS OB EXISTS

**This is the final OB before CLT-67.** After this, the platform should be walkthrough-ready.

Six things must be true:

1. **"Every number explained"** — A user can click their payout and trace it through components → metrics → source data. This is the Five Layers of Proof in consumer UI. Currently, trace stubs return empty arrays (OB-66: "3 critical dead ends").

2. **Anomaly detection is visible** — `detectAnomalies()` exists (OB-71) but is never auto-invoked. The admin assessment panel should show anomalies without manual intervention.

3. **Disputes work end-to-end** — Rep can file a dispute from their proof view. Individual dispute detail reads from Supabase, not in-memory (OB-71 Known Issue #3). Dispute connects to the proof layer where the discrepancy was found.

4. **Korean Test passes** — FIELD_ID_MAPPINGS legacy constants have been deferred twice. Hardcoded field name dictionaries remain in the codebase. Until removed, the "works in any language" claim is false.

5. **Operations are auditable** — audit_logs table exists but nothing writes to it. Critical operations (dispute, approval, lifecycle, calculation) must create audit entries. SOC2 narrative requires this.

6. **Browser-verified** — Everything built in OB-67 through OB-72 actually works in a browser, not just in grep output. This is the pre-CLT-67 confidence gate.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
5. **Commit this prompt to git as first action.**
6. **profiles.id ≠ auth.uid(). Use auth_user_id.**
7. **Check SCHEMA_REFERENCE.md before any Supabase query.**
8. **RequireRole uses useAuth() not usePersona().**

---

## SCHEMA TRUTH — TABLES INVOLVED IN THIS OB

From SCHEMA_REFERENCE.md:

**calculation_results**: id, tenant_id, **batch_id**, entity_id, rule_set_id, period_id, **total_payout** (numeric), **components** (jsonb), **metrics** (jsonb), **attainment** (jsonb), metadata, created_at

**entity_period_outcomes**: id, tenant_id, entity_id, period_id, total_payout, **rule_set_breakdown** (jsonb), **component_breakdown** (jsonb), lowest_lifecycle_state, **attainment_summary** (jsonb), metadata, materialized_at

**entities**: id, tenant_id, **external_id**, **display_name**, entity_type, status, profile_id, created_at, updated_at

**disputes**: id, tenant_id, entity_id, period_id, batch_id, category, status, description, resolution, amount_disputed, amount_resolved, **filed_by**, resolved_by, created_at, updated_at, resolved_at

**audit_logs**: id, tenant_id, user_id (FK → profiles.id), **action** (text), **entity_type** (text), **entity_id** (uuid), **changes** (jsonb), **metadata** (jsonb), created_at
*(Note: verify actual audit_logs columns in Phase 0 — table may have been created by migration but columns differ from design)*

**classification_signals**: id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at

**periods**: id, tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata, created_at, updated_at

**rule_sets**: id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, **components** (jsonb), cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at

---

## PHASE 0: DIAGNOSTIC (MANDATORY — BEFORE ANY CODE)

### 0A: Five Layers of Proof — what exists today

```bash
echo "============================================"
echo "OB-72 PHASE 0A: FIVE LAYERS OF PROOF AUDIT"
echo "============================================"

echo ""
echo "=== Forensics pages ==="
find web/src/app -path "*forensic*" -name "page.tsx" | sort
find web/src/app -path "*investigate*" -name "page.tsx" | sort
find web/src/app -path "*trace*" -name "page.tsx" | sort

echo ""
echo "=== My Compensation / Perform pages ==="
find web/src/app -path "*compensation*" -o -path "*perform*" | grep "page.tsx" | sort

echo ""
echo "=== Existing drill-down components ==="
grep -rn "drill\|DrillDown\|expandRow\|onRowClick\|detail.*view\|component.*breakdown" \
  web/src/components/ web/src/app/ --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== Where do calculation_results.components get rendered? ==="
grep -rn "\.components\b\|component_breakdown\|rule_set_breakdown" \
  web/src/app/ web/src/components/ --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== Trace data loading stubs (the "dead ends") ==="
grep -rn "getTrace\|loadTrace\|fetchTrace\|traceData\|TODO.*trace\|TODO.*drill" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== What does calculation_results.components JSONB look like? ==="
echo "Check persona-queries.ts or page-loaders.ts for how components are parsed"
grep -rn "parseComponent\|components\[" web/src/lib/ --include="*.ts" | head -10

echo ""
echo "=== RepDashboard / ManagerDashboard — what data do they show? ==="
grep -rn "components\|totalPayout\|attainment\|tier\|breakdown" \
  web/src/components/dashboards/ --include="*.tsx" | head -20
```

### 0B: FIELD_ID_MAPPINGS audit

```bash
echo "============================================"
echo "OB-72 PHASE 0B: FIELD_ID_MAPPINGS AUDIT"
echo "============================================"

echo ""
echo "=== FIELD_ID_MAPPINGS or similar constants ==="
grep -rn "FIELD_ID_MAPPINGS\|FIELD_MAPPINGS\|fieldDictionary\|NORMALIZER\|lookupTable\|lookupDict" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== YEAR_FIELDS, MONTH_FIELDS, etc. ==="
grep -rn "YEAR_FIELDS\|MONTH_FIELDS\|PERIOD_FIELDS\|ENTITY_FIELDS\|ID_FIELDS" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== Hardcoded field name arrays ==="
grep -rn "'\''año'\''\|'\''mes'\''\|'\''fecha'\''\|'\''periodo'\''\|'\''num_empleado'\''\|'\''Vendedor'\''\|'\''No_Tienda'\''" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== Where are these constants used in logic? ==="
for f in $(grep -rln "FIELD_ID_MAPPINGS\|FIELD_MAPPINGS\|YEAR_FIELDS\|MONTH_FIELDS" web/src/ --include="*.ts" | grep -v node_modules | head -10); do
  echo "--- $f ---"
  grep -c "FIELD_ID_MAPPINGS\|FIELD_MAPPINGS\|YEAR_FIELDS\|MONTH_FIELDS" "$f"
done
```

### 0C: Audit logs table state

```bash
echo "============================================"
echo "OB-72 PHASE 0C: AUDIT LOGS STATE"
echo "============================================"

echo ""
echo "=== audit_logs in migrations ==="
grep -rn "audit_logs" web/supabase/migrations/ | head -10

echo ""
echo "=== audit_logs references in code ==="
grep -rn "audit_logs\|auditLog\|audit_log" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== Existing write points that should audit ==="
echo "(dispute create, approval create, lifecycle transition, calculation run)"
grep -rn "\.insert\|\.update\|\.upsert" web/src/app/api/ --include="*.ts" | grep -v node_modules | head -20

# Check live DB:
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'audit_logs' ORDER BY ordinal_position;
# SELECT COUNT(*) FROM audit_logs;
```

### 0D: Dispute detail page state

```bash
echo "============================================"
echo "OB-72 PHASE 0D: DISPUTE DETAIL STATE"
echo "============================================"

echo ""
echo "=== Individual dispute page ==="
find web/src/app -path "*dispute*" -name "page.tsx" | sort

echo ""
echo "=== Dispute detail — reads from where? ==="
DISPUTE_DETAIL=$(find web/src/app -path "*dispute*/*\[*" -name "page.tsx" | head -1)
echo "File: $DISPUTE_DETAIL"
grep -n "getDispute\|fetch.*dispute\|supabase.*dispute\|Map\|localStorage\|in-memory" "$DISPUTE_DETAIL" 2>/dev/null | head -10

echo ""
echo "=== Dispute creation from rep context ==="
grep -rn "File Dispute\|fileDispute\|createDispute\|submitDispute\|new.*dispute" \
  web/src/app/perform/ web/src/app/my-compensation/ web/src/components/dashboards/ --include="*.tsx" | head -10
```

### 0E: Anomaly detection wiring

```bash
echo "============================================"
echo "OB-72 PHASE 0E: ANOMALY WIRING STATE"
echo "============================================"

echo ""
echo "=== detectAnomalies function ==="
grep -rn "detectAnomalies\|detect_anomalies" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== Is it called from anywhere? ==="
grep -rn "detectAnomalies(" web/src/ --include="*.ts" --include="*.tsx" | grep -v "export\|function\|import" | grep -v node_modules | head -5

echo ""
echo "=== Assessment API route — does it invoke anomaly detection? ==="
ASSESS_ROUTE=$(find web/src/app/api -path "*assessment*" -name "route.ts" | head -1)
grep -n "anomal\|detectAnom" "$ASSESS_ROUTE" 2>/dev/null
```

### 0F: Document findings

Create `OB-72_DIAGNOSTIC.md` at project root with:
1. **Five Layers:** What components exist, what data is available, where the dead ends are, what JSONB structure components/metrics/attainment use
2. **FIELD_ID_MAPPINGS:** Count of constants, files that use them, what they map
3. **Audit logs:** Table exists or not, columns, any existing writes
4. **Dispute detail:** Reads from Supabase or in-memory, can rep file from dashboard
5. **Anomaly wiring:** detectAnomalies exists, called from nowhere

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | Diagnostic file exists | File check | All 5 sections with grep evidence |
| PG-0B | JSONB component structure documented | Diagnostic section 1 | Sample of what components/metrics/attainment contain |
| PG-0C | FIELD_ID_MAPPINGS count documented | Diagnostic section 2 | Files + line count |

**Commit:** `OB-72 Phase 0: Diagnostic — five layers, field mappings, audit logs, disputes, anomaly`

---

## ARCHITECTURE DECISION GATE (MANDATORY)

```
ARCHITECTURE DECISION RECORD — OB-72
=====================================

DECISION 1: Five Layers UI Pattern

Problem: Need drill-down from aggregate → entity → component → metric.

Option A: Build dedicated /proof or /trace route with nested drill-down.
  - Separate from dashboards. Deep-link from dashboard to proof view.

Option B: Add expandable rows/panels inline on existing dashboard pages.
  - No new routes. Click entity row → expands to show components inline.

CHOSEN: Option ___ because ___

---

DECISION 2: FIELD_ID_MAPPINGS Replacement

Problem: Hardcoded field name dictionaries need to be removed.

Option A: Remove constants entirely. Let AI semantic inference handle everything.
  - Risk: If AI is unavailable, no fallback.

Option B: Replace constants with configuration-driven lookup from import_batches.field_mappings JSONB.
  - Field mappings stored per import batch. Code reads from DB, not constants.

Option C: Replace with tenant-level field mapping configuration table.
  - Most flexible but requires new table.

CHOSEN: Option ___ because ___

---

DECISION 3: Audit Log Instrumentation Pattern

Problem: Need audit logs on critical operations without modifying every API route.

Option A: Utility function `logAudit(supabase, {action, entityType, entityId, changes, metadata})` called explicitly.
  - Simple, explicit, no magic.

Option B: Supabase database triggers on INSERT/UPDATE.
  - Automatic but less control over metadata.

CHOSEN: Option ___ because ___
```

**Commit:** `OB-72 Architecture Decision: five layers UI, field mappings, audit pattern`

---

## MISSION 1: FIVE LAYERS — LAYER 5 (OUTCOME) + LAYER 4 (POPULATION)

### 1A: Build the proof trace view

This is the top-down entry point. A user sees:

**Layer 5 — Outcome (Aggregate):**
- Period total payout (SUM of all entity payouts)
- Component totals (SUM per component across all entities)
- Entity count, average payout, median
- Match rate against expected (if reconciliation data exists)

**Layer 4 — Population (Per-Entity):**
- Table of all entities with: display_name, external_id, total_payout, attainment
- Sorted by total_payout descending (highest first)
- Color-coded: exact match (green), within tolerance (yellow), discrepancy (red)
- Clickable rows — clicking opens Layer 3 (Mission 2)

### 1B: Data source

Layer 5 aggregates: Query `calculation_results` grouped by period, or read from `calculation_batches.summary` if it contains aggregate data.

Layer 4 per-entity: Query `calculation_results` joined with `entities` for the selected period/batch:

```typescript
const { data } = await supabase
  .from('calculation_results')
  .select(`
    id, entity_id, total_payout, components, metrics, attainment,
    entities!inner(display_name, external_id)
  `)
  .eq('batch_id', batchId)
  .order('total_payout', { ascending: false });
```

### 1C: Where to render

This should be accessible from:
1. **Admin on /operate** — "View Proof" button next to calculation summary
2. **Rep on My Compensation** — clicking their payout opens their entity-level proof
3. **Manager on Perform** — clicking a team member opens that entity's proof

Create a `ProofView` component (or extend existing forensics) that takes `batchId` and `entityId` (optional — if no entity, shows Layer 5+4; if entity, jumps to Layer 3+2).

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | Layer 5 shows aggregate totals | Code + browser in M6 | Period total, component totals, entity count |
| PG-1B | Layer 4 shows per-entity table | Code + browser in M6 | display_name, external_id, total_payout, attainment |
| PG-1C | Entity rows are clickable | Code review | onClick navigates to entity detail or expands |
| PG-1D | Query uses correct schema columns | grep output | batch_id, total_payout, components from SCHEMA_REFERENCE.md |

```
COMPLIANCE CHECK — Mission 1
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — calculation_results, entities]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — reads only]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-11, AP-13]
□ Scale test: would this work for 150K entities? [YES/NO — paginated]
```

**Commit:** `OB-72 Mission 1: Five Layers — Layer 5 Outcome + Layer 4 Population`

---

## MISSION 2: FIVE LAYERS — LAYER 3 (COMPONENT) + LAYER 2 (METRIC)

### 2A: Layer 3 — Component breakdown for one entity

When user clicks an entity in Layer 4:

**Layer 3 — Component:**
- Entity name + external_id header
- Total payout for this entity
- Per-component breakdown table:
  - Component name (from rule_sets.components)
  - Component payout (from calculation_results.components JSONB)
  - Component attainment (from calculation_results.attainment JSONB)
  - Contribution % (component payout / total payout)

Data source: `calculation_results.components` JSONB for the specific entity_id + batch_id.

### 2B: Layer 2 — Metric detail for one component

When user clicks a component in Layer 3:

**Layer 2 — Metric:**
- Component name header
- Source metrics that fed this component:
  - Metric name (from calculation_results.metrics JSONB)
  - Metric value (raw number)
  - Attainment % (metric value / target if applicable)
  - Source: which data sheet / field provided this value
- Tier/matrix lookup result (if component uses tiers):
  - Which tier the entity landed in
  - Threshold values for the tier
  - Payout rate for the tier

Data source: `calculation_results.metrics` and `calculation_results.attainment` JSONB for the specific entity.

### 2C: JSONB parsing

**CRITICAL:** The exact structure of `components`, `metrics`, and `attainment` JSONB fields must be determined from Phase 0 diagnostic. Do NOT invent a structure. Read actual data from the database or from the calculation engine code that writes these fields.

```bash
# Find where components JSONB is written
grep -rn "components.*=\|components:" web/src/lib/calculation/ --include="*.ts" | head -15
```

Parse whatever structure exists. If the structure is flat (e.g., `{ "Optical Sales": 550, "Store Bonus": 200 }`), render as-is. If nested, render with hierarchy.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | Layer 3 shows component breakdown | Code review | Per-component name, payout, attainment |
| PG-2B | Layer 2 shows source metrics | Code review | Metric names, values, attainment |
| PG-2C | JSONB parsed from actual data structure | Code review | No invented structure |
| PG-2D | Drill-down navigation works (L4 → L3 → L2) | Code review | Click entity → components → metrics |

```
COMPLIANCE CHECK — Mission 2
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — reads only]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-13]
□ Scale test: would this work for 150K entities? [YES/NO — single entity query]
```

**Commit:** `OB-72 Mission 2: Five Layers — Layer 3 Component + Layer 2 Metric drill-down`

---

## MISSION 3: ANOMALY AUTO-INVOKE + DISPUTE FROM PROOF VIEW

### 3A: Auto-invoke anomaly detection in assessment

Find the assessment API route (`/api/ai/assessment`) and add:

1. Before generating the AI assessment, query `calculation_results` for the period
2. Call `detectAnomalies()` on the result set
3. Include anomalies in the AI prompt context
4. The AI's response now naturally includes anomaly interpretation

```typescript
// In /api/ai/assessment route, BEFORE calling AIService:
import { detectAnomalies } from '@/lib/intelligence/anomaly-detection';

// Fetch calculation results for the period
const { data: results } = await supabase
  .from('calculation_results')
  .select('entity_id, total_payout')
  .eq('tenant_id', tenantId)
  .eq('period_id', periodId);

const anomalies = results ? detectAnomalies(results.map(r => ({
  entityId: r.entity_id,
  totalPayout: r.total_payout
}))) : { anomalies: [], stats: null };

// Pass anomalies to AI assessment
const response = await aiService.generateAssessment(persona, {
  ...data,
  anomalies: anomalies.anomalies,
  stats: anomalies.stats,
}, locale);
```

### 3B: "File Dispute" button on proof views

On Layer 3 (component breakdown) and Layer 4 (entity list), add a "File Dispute" button that:
1. Pre-populates: entity_id, period_id, batch_id from current context
2. Opens a dispute form (modal or inline)
3. Categories: Data Error, Calculation Error, Plan Interpretation, Missing Transaction
4. Description: free text with optional data references
5. Submits via POST /api/disputes (already exists from OB-68)

### 3C: Fix individual dispute detail

The individual dispute view (`/transactions/disputes/[id]`) must read from Supabase, not in-memory:

```typescript
// Instead of getDispute(id) from memory:
const { data: dispute } = await supabase
  .from('disputes')
  .select('*, entities!inner(display_name, external_id)')
  .eq('id', disputeId)
  .eq('tenant_id', tenantId)
  .maybeSingle();
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Assessment API calls detectAnomalies | grep output | `detectAnomalies` in assessment route |
| PG-3B | AI response includes anomaly interpretation | Code review | Anomalies in prompt context |
| PG-3C | "File Dispute" button on proof view | Code review | Button exists with pre-populated context |
| PG-3D | Dispute form submits to POST /api/disputes | Code review | fetch('/api/disputes') on submit |
| PG-3E | Dispute detail reads from Supabase | grep output | `.from('disputes')` in detail page |

```
COMPLIANCE CHECK — Mission 3
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — disputes, calculation_results]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — dispute created via API]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-17 (single dispute path)]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-72 Mission 3: Anomaly auto-invoke + dispute from proof view + detail fix`

---

## MISSION 4: FIELD_ID_MAPPINGS REMOVAL

### 4A: Audit all hardcoded field name constants

From Phase 0 findings, list every file that contains hardcoded field name constants, dictionaries, or arrays.

### 4B: Determine replacement strategy

Based on Architecture Decision #2, replace constants with the chosen approach:

**If Option B (import batch field mappings):**
- Each import batch already stores AI-determined field mappings in `import_batches.field_mappings` or `committed_data.metadata`
- Read field mappings from the import context, not from constants
- If no import context exists (e.g., first-time calculation), log warning and skip — do NOT fall back to constants

**Pattern:**
```typescript
// BEFORE (hardcoded):
const YEAR_FIELDS = ['año', 'Año', 'year', 'Year', 'anio'];
const yearValue = YEAR_FIELDS.find(f => record[f] !== undefined);

// AFTER (from import context):
const fieldMappings = await getImportFieldMappings(tenantId, importBatchId);
const yearField = fieldMappings?.find(m => m.semanticType === 'year')?.sourceField;
const yearValue = yearField ? record[yearField] : null;
if (!yearValue) console.warn('[Engine] No year field mapped — re-import to generate mappings');
```

### 4C: Korean Test verification

After removing all constants, verify:
```bash
# Zero hardcoded field name arrays in lib/
grep -rn "YEAR_FIELDS\|MONTH_FIELDS\|PERIOD_FIELDS\|ENTITY_FIELDS\|ID_FIELDS\|FIELD_ID_MAPPINGS\|FIELD_MAPPINGS" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v "// \|/\*"

# Zero Spanish field names in logic code
grep -rn "'año'\|'ano'\|'anio'\|'mes'\|'fecha'\|'periodo'\|'num_empleado'\|'Vendedor'\|'No_Tienda'" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v "// \|/\*\|demo/"
```

**Expected result: ZERO matches** (excluding comments and demo data generators).

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | FIELD_ID_MAPPINGS constants removed | grep output pasted | Zero matches in lib/ |
| PG-4B | Replacement reads from import context | Code review | Field access via semantic lookup |
| PG-4C | Korean Test passes | grep output pasted | Zero hardcoded field names in lib/ (excl. demo/) |
| PG-4D | Build clean after removal | npm run build | Exit 0 |

```
COMPLIANCE CHECK — Mission 4
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-5, AP-6, AP-7]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-72 Mission 4: FIELD_ID_MAPPINGS removal — Korean Test passes`

---

## MISSION 5: AUDIT LOGGING ON CRITICAL PATHS

### 5A: Verify audit_logs table

From Phase 0, confirm the table exists with correct columns. If not, create migration.

### 5B: Create audit utility

```typescript
// web/src/lib/audit/audit-logger.ts
export async function logAudit(supabase: SupabaseClient, params: {
  tenantId: string;
  userId: string;       // profiles.id of the actor
  action: string;       // 'dispute.created', 'dispute.resolved', 'approval.requested', 
                        // 'approval.decided', 'lifecycle.transitioned', 'calculation.run'
  entityType: string;   // 'dispute', 'approval_request', 'calculation_batch', 'rule_set'
  entityId: string;     // UUID of the affected entity
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      changes: params.changes ?? {},
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error('[AuditLogger] Failed to write audit log:', err);
    // Audit failures should NOT block operations — log and continue
  }
}
```

### 5C: Instrument critical API routes

Add `logAudit()` calls to these routes:

1. **POST /api/disputes** — `action: 'dispute.created'`
2. **PATCH /api/disputes/[id]** — `action: 'dispute.resolved'` or `'dispute.updated'`
3. **POST /api/approvals** — `action: 'approval.requested'`
4. **PATCH /api/approvals/[id]** — `action: 'approval.decided'`
5. **POST /api/calculation/run** — `action: 'calculation.run'`
6. **Lifecycle transitions** (wherever `transitionLifecycle` is called) — `action: 'lifecycle.transitioned'`

### 5D: Simple audit log viewer (optional if time permits)

On `/govern/audit-trail` or `/investigate/audit-log`:
- Table showing: timestamp, action, entity_type, user display_name, metadata
- Filtered by tenant_id (RLS enforced)
- Sorted by created_at descending
- Simple, read-only, no editing

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | audit_logs table verified | SQL output pasted | Columns match or migration applied |
| PG-5B | logAudit utility exists | File check | Function with all required params |
| PG-5C | 4+ API routes instrumented | grep output | `logAudit` in dispute, approval, calculation, lifecycle routes |
| PG-5D | Build clean | npm run build | Exit 0 |

```
COMPLIANCE CHECK — Mission 5
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — audit_logs]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — audit entries written]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-8 (migration executed)]
□ Scale test: would this work for 150K entities? [YES/NO — indexed, fire-and-forget]
```

**Commit:** `OB-72 Mission 5: Audit logging — critical operations instrumented`

---

## MISSION 6: BROWSER-VERIFIED INTEGRATION CLT

### ⚠️ THIS MISSION IS NOT CODE REVIEW

This is a BROWSER TEST. Start the dev server. Open pages. Document what you see. Paste actual responses.

### 6A: Start clean

```bash
cd web && rm -rf .next && npm run build && npm run dev
```

### 6B: Auth flow (from OB-71 unverified claims D2)

```bash
# 1. Unauthenticated access
curl -s -o /dev/null -w "HTTP %{http_code}, redirect: %{redirect_url}" http://localhost:3000/
# Expected: HTTP 307, redirect: /login

# 2. Login page renders
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/login
# Expected: HTTP 200
```

**PASTE the actual curl output.**

### 6C: Calculation trigger (from D1 — CRITICAL unverified)

Navigate to /operate on localhost. Select a period. Click "Run Preview".

Document:
- Does the button fire? (Network tab — is there a POST?)
- What does the POST response say?
- After completion, are there calculation_results?

```sql
-- Run after triggering calculation:
SELECT COUNT(*) as results, SUM(total_payout) as total 
FROM calculation_results 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

**PASTE the SQL output.**

### 6D: Entity visibility (from D3, D8)

Navigate to /configure/people.
- Does it render? Or crash?
- How many entities shown?
- Is external_id visible?

### 6E: Five Layers proof view (from Mission 1+2)

Navigate to the proof view built in this OB.
- Layer 5: Total payout, component totals
- Layer 4: Entity list with names and payouts
- Layer 3: Click entity → component breakdown
- Layer 2: Click component → metrics

### 6F: Assessment panels (from D5, D6, D7)

Navigate to /operate (admin dashboard).
- Is the AssessmentPanel visible?
- Does it show AI-generated content or loading skeleton?

### 6G: Disputes (from D4, A3)

Navigate to /transactions/disputes.
- Does the list show real data or empty state?
- Click a dispute (if any) — does detail load from Supabase?

### 6H: Console clean (from D10)

On each page visited, check the browser console:
- Zero 406 errors?
- Zero unhandled errors?
- Only acceptable warnings?

### CLT CHECKLIST — 22 ITEMS

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | curl / → 307 to /login | | PASTE curl output |
| 2 | curl /login → 200 | | PASTE curl output |
| 3 | /operate renders lifecycle stepper | | PASTE what renders |
| 4 | Run Preview fires POST | | PASTE network activity |
| 5 | calculation_results populated | | PASTE SQL count |
| 6 | Lifecycle stepper advances | | PASTE what stepper shows |
| 7 | /configure/people renders entity roster | | PASTE entity count |
| 8 | Entity external_id visible | | PASTE sample |
| 9 | Entity search works | | PASTE filtered result |
| 10 | /configure/users accessible from sidebar | | PASTE confirmation |
| 11 | Assessment panel on /operate | | PASTE what renders |
| 12 | /transactions/disputes shows data or empty state | | PASTE what renders |
| 13 | Dispute detail from Supabase (not in-memory) | | PASTE evidence |
| 14 | Layer 5 Outcome totals | | PASTE what renders |
| 15 | Layer 4 Population entity table | | PASTE sample rows |
| 16 | Layer 3 Component breakdown | | PASTE for one entity |
| 17 | Layer 2 Metric detail | | PASTE for one component |
| 18 | File Dispute from proof view | | PASTE button exists |
| 19 | Zero 406 errors across all pages | | PASTE console check |
| 20 | Zero unhandled errors | | PASTE console check |
| 21 | Build clean | | PASTE npm run build exit code |
| 22 | Dev server responds | | PASTE curl localhost:3000 response code |

```
COMPLIANCE CHECK — Mission 6
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO — THIS IS THE WHOLE POINT]
□ Anti-Pattern Registry checked? [YES/NO — AP-9, AP-10]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-72 Mission 6: Browser-verified CLT — 22 items with pasted evidence`

---

## PHASE FINAL: COMPLETION REPORT + PR

Create `OB-72_COMPLETION_REPORT.md` at PROJECT ROOT with:

1. **Diagnostic Summary** — Five layers data structure, FIELD_ID_MAPPINGS count, audit_logs state
2. **Architecture Decisions** — 3 decisions with evidence
3. **Mission 1: Layers 5+4** — Aggregate totals + per-entity table
4. **Mission 2: Layers 3+2** — Component breakdown + metric detail
5. **Mission 3: Anomaly + Disputes** — Auto-invoke, file dispute from proof, detail fix
6. **Mission 4: FIELD_ID_MAPPINGS** — Removed, Korean Test, replacement approach
7. **Mission 5: Audit Logging** — Utility, instrumented routes, table verified
8. **Mission 6: Browser CLT** — 22 items with PASTED EVIDENCE
9. **Five Layers Implementation Summary:**

| Layer | Name | What It Shows | Data Source |
|-------|------|---------------|-------------|
| 5 | Outcome | Period totals, component sums | calculation_results aggregated |
| 4 | Population | Per-entity payouts, discrepancies | calculation_results + entities |
| 3 | Component | Per-component breakdown for entity | calculation_results.components |
| 2 | Metric | Source metrics, attainment, tiers | calculation_results.metrics + attainment |
| 1 | Interpretation | AI plan understanding (future) | rule_sets.components + AI context |

10. **COMPLIANCE CHECKS** — All 6 mission blocks
11. **ALL PROOF GATES** — 24 total (plus 22-item CLT checklist in Mission 6)
12. **STANDING RULE COMPLIANCE**
13. **KNOWN ISSUES**

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-72: Five Layers of Proof + FIELD_ID_MAPPINGS + Audit Logging + Browser CLT" \
  --body "## What This OB Delivers — FINAL OB BEFORE CLT-67

### Mission 1+2: Five Layers of Proof (Consumer UI)
- Layer 5: Aggregate outcome totals
- Layer 4: Per-entity population breakdown  
- Layer 3: Per-component detail for each entity
- Layer 2: Source metrics and attainment
- Drill-down: L5 → L4 → L3 → L2 click navigation

### Mission 3: Anomaly + Disputes
- detectAnomalies() auto-invoked in assessment API
- File Dispute button on proof views with pre-populated context
- Individual dispute detail reads from Supabase

### Mission 4: FIELD_ID_MAPPINGS Removal
- Korean Test passes — zero hardcoded field name constants
- Replacement via import context semantic lookup

### Mission 5: Audit Logging
- audit_logs instrumented on dispute, approval, calculation, lifecycle
- Fire-and-forget pattern (never blocks operations)

### Mission 6: Browser-Verified CLT
- 22-point checklist with PASTED evidence
- Auth, calculation, entities, proof layers, disputes, console clean

## Proof Gates: 24 + 22-item CLT — see OB-72_COMPLETION_REPORT.md
## This is the LAST OB before CLT-67."
```

**Commit:** `OB-72 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 24 proof gates + 22-item browser CLT. After this OB:

1. Five Layers of Proof works (L5 → L4 → L3 → L2) ✓
2. Anomaly detection is auto-invoked in assessments ✓
3. Disputes file from proof view, detail reads from Supabase ✓
4. Korean Test passes — zero FIELD_ID_MAPPINGS ✓
5. Critical operations write audit logs ✓
6. Browser-verified CLT with 22 items of real evidence ✓

**DO NOT** build Layer 1 (Interpretation) — that requires AI plan review UI, which is OB-73+ scope. **DO NOT** build CoachMarks, T-1 pipeline, billing, or org discovery. **DO NOT** add new dashboard features beyond proof view integration.

CLT-67 follows this OB as a pure walkthrough — no code changes, just verification.

---

## ANTI-PATTERNS TO WATCH

- **AP-5/AP-6/AP-7**: FIELD_ID_MAPPINGS removal is the core of Mission 4
- **AP-8**: Audit_logs migration must be EXECUTED not just created
- **AP-11**: Proof views must show REAL data, not mock
- **AP-13**: All queries use SCHEMA_REFERENCE.md columns
- **AP-17**: Single dispute path, single audit path

---

*OB-72 — February 21, 2026*
*"The last OB before the walkthrough. If it's not proven in a browser, it's not proven."*
