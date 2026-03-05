# OB-155: BROWSER PIPELINE PROOF — USER CLICKS IMPORT → CALCULATE → SEES RESULTS
## Vertical Slice Through the UI | No Scripts | The User Is the Test

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema (post OB-152)
3. `OB-154_COMPLETION_REPORT.md` — engine proof: MX$1,277,432, 719 entities, +1.88% delta
4. `OB-153_COMPLETION_REPORT.md` — vertical pipeline slice: period removed from import, SCI construction, components parsing

---

## FOUNDATIONAL RULES (ENFORCED)

1. **Engine and experience evolve together.** This OB is a vertical slice through the BROWSER. Every phase includes a browser action by the user.
2. **No scripts as proof.** OB-154 proved the engine works via scripts. This OB proves the PLATFORM works via browser. If a user cannot do it by clicking, it is not done.
3. **Korean Test.** Zero field-name matching in any new code.
4. **Supabase .in() batching ≤200.** (Section G)

---

## CONTEXT

### What's Proven (OB-154)
- Engine accuracy: MX$1,277,432 vs MX$1,253,832 (+1.88%)
- Entity dedup: 719 (not 19,578)
- Temporal windowing: January data correctly isolated from 3 months
- Source_date extraction: 100% coverage
- 5 of 6 components exact match to ground truth

### What's NOT Proven
- **A user cannot complete the workflow through the browser.** OB-154 bypassed Next.js entirely:
  - Plan import: direct Anthropic API call via script (Next.js dev server fetch failed)
  - Data import: direct Supabase insert via script
  - Calculation: script-triggered
  - Component format: manual transformation script bridged AI output → engine format

### Three Problems to Solve

**Problem 1: Plan import through the browser fails.** The SCI plan execute route calls the Anthropic API to interpret the PPTX. On localhost, this fails with "fetch failed." On Vercel production, it worked (7 components saved). The dev server configuration is broken for large AI payloads.

**Problem 2: AI produces wrong component format.** The AI plan interpreter outputs `calculationType`/`calculationIntent` format. The engine reads `componentType`/`tierConfig`/`matrixConfig`/`conditionalConfig`/`percentageConfig`. OB-154 bridged this with a one-off script. The bridge must be permanent code in the plan interpretation pipeline.

**Problem 3: Data import through the browser must construct the engine contract.** OB-153 proved the SCI construction pipeline can create entities, bind source_dates, and create assignments. But OB-154 showed the entity count inflated to 19,578 through the pipeline and had to be done via script to get 719. The SCI entity construction must deduplicate correctly when triggered through the browser.

---

## PHASE 0: DIAGNOSTIC — WHY DOES BROWSER IMPORT FAIL?

### 0A: Plan Import Failure Trace

The plan import calls the Anthropic API from inside a Next.js API route. On localhost, this fails. Trace the exact failure:

```bash
# Find the plan interpretation code path
grep -rn "interpretPlan\|planInterpret\|anthropic\|ai.*plan" web/src/app/api/import/sci/execute/route.ts --include="*.ts" | head -20

# Find where the AI call is made
grep -rn "anthropic\|claude\|messages.create\|fetch.*api.anthropic" web/src/lib/ web/src/app/api/ --include="*.ts" | head -30

# Check for timeout or body size configurations
grep -rn "maxDuration\|bodyParser\|sizeLimit\|timeout" web/src/app/api/import/ --include="*.ts" | head -10
```

Identify:
1. Which file makes the Anthropic API call for plan interpretation
2. What error occurs (timeout? body size? DNS? SSL?)
3. Whether the issue is dev-server-specific or systemic

### 0B: Component Format Gap

```bash
# Find what the AI returns vs what the engine expects
grep -rn "calculationType\|calculationIntent" web/src/ --include="*.ts" | head -20
grep -rn "componentType\|tierConfig\|matrixConfig\|percentageConfig\|conditionalConfig" web/src/lib/calculation/ --include="*.ts" | head -20
```

Document the exact format the AI produces and the exact format the engine reads.

### 0C: Entity Creation Path

```bash
# Find how SCI creates entities during import
grep -rn "createEntit\|entity.*insert\|\.from('entities')" web/src/app/api/import/sci/execute/route.ts | head -20

# Find deduplication logic
grep -rn "external_id\|dedup\|unique\|upsert.*entit" web/src/app/api/import/sci/execute/route.ts | head -20
```

Identify whether entity creation deduplicates by external_id or creates one per row.

### 0D: Verify Óptica Clean State

Óptica should be clean from HF-088, but OB-154 reimported data via scripts. Check current state:

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT count(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as committed_data,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments,
  (SELECT count(*) FROM calculation_results WHERE tenant_id = t.id) as results
FROM t;
```

**If data exists from OB-154:** Nuclear clear Óptica again using `web/scripts/hf088-nuclear-clear.ts` before proceeding. This OB must start from a clean slate and prove the pipeline through the browser.

### PHASE 0 DELIVERABLE

Write `OB-155_DIAGNOSTIC.md` at project root with:
1. Plan import failure: exact file, line, error message
2. Component format gap: AI output shape vs engine input shape
3. Entity creation: dedup logic present or absent
4. Óptica clean state: Engine Contract all zeros

**Commit:** `OB-155 Phase 0: Browser pipeline diagnostic`

---

## PHASE 1: FIX PLAN IMPORT THROUGH THE BROWSER

Based on Phase 0A findings, fix the plan import so it works when a user uploads a PPTX through the import surface on localhost:3000.

### Likely Fixes (based on known failure modes):

**If timeout:** Increase `maxDuration` on the SCI execute route. The AI plan interpretation takes 30-60s. Vercel Pro allows 300s. Dev server may have a shorter default.

**If body size:** The PPTX is ~1MB, base64-encoded to ~1.5MB, potentially sent twice. Reduce payload size or stream the file from Supabase Storage instead of embedding in the request body.

**If DNS/network in dev:** The dev server may not resolve api.anthropic.com correctly. Check environment variables, proxy settings, or node fetch configuration.

**If the AI service initialization fails silently:** Add error handling and logging around the Anthropic API call so failures are visible in the terminal, not swallowed.

### Proof Gate 1:
- PG-1: User uploads PPTX on localhost:3000 import page
- PG-2: SCI classifies it as Plan content
- PG-3: AI interpretation runs (visible in terminal logs: "Calling Anthropic API..." → "Plan interpretation complete")
- PG-4: Rule set created in database with components

**Commit:** `OB-155 Phase 1: Plan import works through browser — [root cause and fix]`

---

## PHASE 2: COMPONENT FORMAT BRIDGE — PERMANENT CODE

The AI plan interpreter produces components in one format. The engine reads another. This bridge must be permanent code, not a script.

### 2A: Identify the Transformation Location

The transformation belongs in the plan interpretation pipeline — AFTER the AI returns its response and BEFORE the rule_set is saved to the database. The AI output is domain-intelligent (it understands compensation concepts). The engine input is domain-agnostic (it processes structural primitives). The bridge translates.

### 2B: Implement the Transformation

For each component the AI produces:

| AI Output Field | Engine Expected Field | Transformation |
|---|---|---|
| `calculationType: 'matrix_lookup'` | `componentType: 'matrix_lookup'` | Direct rename |
| `calculationType: 'tiered_lookup'` | `componentType: 'tier_lookup'` | Value mapping |
| `calculationType: 'percentage'` | `componentType: 'percentage'` | Direct rename |
| `calculationType: 'conditional_percentage'` | `componentType: 'conditional_percentage'` | Direct rename |
| `calculationIntent.lookupMatrix` | `matrixConfig.values` | Restructure to engine shape |
| `calculationIntent.tiers` | `tierConfig.tiers` | Restructure to engine shape |
| `calculationIntent.rate` | `percentageConfig.rate` | Direct mapping |
| `calculationIntent.conditions` | `conditionalConfig.conditions` | Restructure to engine shape |

The exact transformation depends on what Phase 0B revealed. OB-154's `ob154-fix-components.ts` contains the working transformation — extract its logic into a function in the plan interpretation pipeline.

### 2C: Variant Handling

The AI may produce separate components for certified vs non-certified. The engine uses `variants` array. The bridge must:
1. Detect components that are variant-pairs (same base calculation, different matrices/rates)
2. Group them into the variants structure the engine expects
3. Wire variant selection to the Puesto field (entity role — structural detection, not field name matching)

### 2D: Metric Derivations

OB-154 created 14 metric_derivation rules for store-level attainment ratios. These derivations must be produced by the bridge, not manually scripted. When the AI identifies a component that needs `store_sales_attainment`, and the data has `actual` and `goal` fields, the bridge should produce:
```json
{
  "metric": "store_sales_attainment",
  "operation": "ratio",
  "numerator": { "source": "field", "field": "actual" },
  "denominator": { "source": "field", "field": "goal" }
}
```

This goes into `rule_sets.input_bindings.metric_derivations`.

### Proof Gate 2:
- PG-5: Component format transformation is in the codebase (not a script), in the plan interpretation pipeline
- PG-6: After plan import through browser, the rule_set in the database has `componentType`/`tierConfig`/`matrixConfig` format (not `calculationType`/`calculationIntent`)
- PG-7: Variants are correctly structured (certified/non-certified)
- PG-8: Metric derivations are generated and stored in input_bindings
- PG-9: `npm run build` exits 0

**Commit:** `OB-155 Phase 2: Component format bridge — AI output → engine format in plan pipeline`

---

## PHASE 3: FIX ENTITY DEDUP IN SCI PIPELINE

OB-153 created 19,578 entities through the SCI pipeline. OB-154 created 719 via script. The SCI pipeline must produce 719 through the browser.

### 3A: Root Cause

From Phase 0C, identify whether entity creation:
- Creates one entity per committed_data row (wrong — creates 19,578)
- Creates one entity per unique identifier value (correct — creates 719)
- Runs entity creation once per content unit instead of once per unique identifier across all content units

### 3B: Fix

Entity construction during SCI execute must:
1. After all committed_data is written, scan for the high-cardinality identifier column (structural detection)
2. Extract DISTINCT values from that column across ALL content units
3. Check entities table for existing matches by (tenant_id, external_id)
4. INSERT only new, unmatched entities
5. UPDATE committed_data.entity_id for all rows matching each entity's external_id

**Add or verify a UNIQUE constraint:**
```sql
-- If not already present:
ALTER TABLE entities ADD CONSTRAINT entities_tenant_external_type_unique
  UNIQUE (tenant_id, external_id, entity_type);
```

If the constraint already exists, use UPSERT (ON CONFLICT DO NOTHING) instead of blind INSERT.

### Proof Gate 3:
- PG-10: After data import through browser, entities table has ≈ 719 rows (not 19,578)
- PG-11: Each entity has unique external_id (no duplicates)
- PG-12: committed_data.entity_id is populated for transaction rows

**Commit:** `OB-155 Phase 3: Entity dedup — SCI creates 719, not 19,578`

---

## PHASE 4: BROWSER END-TO-END PROOF

This is the proof gate that matters. A user sitting at localhost:3000 completes the entire workflow by clicking.

### 4A: Nuclear Clear

If Óptica has data from previous phases, nuclear clear it. Start clean.

### 4B: Import Plan (Browser)

1. Open localhost:3000
2. Navigate to Óptica tenant
3. Go to Import
4. Upload `RetailCorp_Plan1.pptx`
5. SCI classifies → AI interprets → components displayed in proposal
6. Confirm
7. **Verify:** Rule set exists in database with correct component format

### 4C: Import Data (Browser)

1. Stay on Import page
2. Upload `BacktTest_Optometrista_mar2025_Proveedores.xlsx`
3. SCI classifies content units → commits data → creates entities → binds source_dates → creates assignments
4. **Verify:** 719 entities, ~119K committed rows, source_dates populated, assignments created

### 4D: Create Periods (Browser)

1. Navigate to Calculate
2. Use "Create periods from data" (OB-153 added this) or manually create January 2024
3. **Verify:** Period exists in database

### 4E: Calculate (Browser)

1. Select January 2024 period and Óptica rule set
2. Click Calculate
3. **Verify:** Calculation runs, results appear

### 4F: View Results (Browser)

1. Results display with total payout
2. **Verify:** Total is within ±5% of MX$1,253,832
3. **Screenshot:** Paste the browser showing the rendered result

### Proof Gate 4 (FINAL):
- PG-13: Plan imported through browser (not script)
- PG-14: Data imported through browser (not script)
- PG-15: 719 entities created through browser import
- PG-16: Periods created through browser
- PG-17: Calculation executed through browser
- PG-18: Total payout renders on screen (within ±5% of MX$1,253,832)
- PG-19: Browser console has no errors during the full workflow
- PG-20: `npm run build` exits 0

**Commit:** `OB-155 Phase 4: Browser end-to-end proof — import → calculate → result`

---

## PHASE 5: CC-UAT-08 — BROWSER-VERIFIED FORENSICS

### 5A: Entity Count Verification

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT count(*) as entities, count(DISTINCT external_id) as unique_ids
FROM entities WHERE tenant_id = (SELECT id FROM t);
```

Must show 719 entities created through the browser pipeline (not scripts).

### 5B: Temporal Windowing

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as total_rows,
  count(CASE WHEN source_date BETWEEN '2024-01-01' AND '2024-01-31' THEN 1 END) as january_rows
FROM committed_data
WHERE tenant_id = (SELECT id FROM t);
```

January rows must be < total rows (temporal windowing working).

### 5C: Component Aggregates

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1),
latest_batch AS (
  SELECT id FROM calculation_batches
  WHERE tenant_id = (SELECT id FROM t)
  ORDER BY created_at DESC LIMIT 1
)
SELECT
  comp->>'name' as component_name,
  count(*) as entity_count,
  SUM((comp->>'payout')::numeric) as component_total
FROM calculation_results cr,
  jsonb_array_elements(cr.components) as comp
WHERE cr.batch_id = (SELECT id FROM latest_batch)
GROUP BY comp->>'name'
ORDER BY component_total DESC;
```

### 5D: Paste ALL Evidence

Paste verbatim:
1. All SQL query results
2. Browser console output during the workflow
3. Terminal output showing API calls succeeding
4. The rendered result total on screen

### Proof Gate 5 (CC-UAT):
- PG-21: Entity dedup verified (719, 0 duplicates)
- PG-22: Temporal windowing verified (January < total)
- PG-23: Component aggregates reasonable (5 of 6 within ±5% of ground truth)
- PG-24: All evidence pasted verbatim

**Commit:** `OB-155 Phase 5: CC-UAT-08 — browser-verified forensics`

---

## PHASE 6: COMPLETION REPORT + PR

Write `OB-155_COMPLETION_REPORT.md` at project root.

Include:
1. Phase 0: Root causes identified (plan import failure, component format gap, entity dedup)
2. Phase 1: Plan import fix (what was wrong, what was changed)
3. Phase 2: Component format bridge (where it lives in the codebase, transformation logic)
4. Phase 3: Entity dedup fix (root cause, fix, constraint)
5. Phase 4: Browser proof (screenshots / pasted output showing the full workflow)
6. Phase 5: CC-UAT-08 forensic evidence
7. All 24 proof gates PASS/FAIL

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-155: Browser Pipeline Proof — User Clicks Import → Calculate → Sees Results" \
  --body "## What This OB Proves

A user sitting at localhost:3000 can:
1. Upload a plan PPTX → AI interprets → components in engine format
2. Upload a data XLSX → 719 entities created (deduped) → source_dates bound → assignments created
3. Create periods from data range
4. Click Calculate → engine runs → MX\$[total] renders on screen

### Fixes
- Plan import: [root cause and fix]
- Component format bridge: AI calculationType/calculationIntent → engine componentType/tierConfig/matrixConfig — permanent code in plan pipeline
- Entity dedup: SCI creates 719 entities (not 19,578) through browser

### Results
- Total payout: MX\$[amount] (ground truth: MX\$1,253,832, delta: [N]%)
- Entities: 719 (deduped by external_id)
- Temporal windowing: January rows correctly isolated

### CC-UAT-08
- All forensic evidence pasted verbatim
- Entity dedup, temporal windowing, component aggregates verified

## Proof Gates: see OB-155_COMPLETION_REPORT.md"
```

### FULL PROOF GATE TABLE

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Plan upload works in browser | User uploads PPTX, no errors |
| PG-2 | SCI classifies plan | Content classified as Plan |
| PG-3 | AI interpretation runs | Terminal logs show Anthropic API call |
| PG-4 | Rule set created | Database has rule_set with components |
| PG-5 | Format bridge in codebase | Not a script — permanent code |
| PG-6 | Engine-format components | componentType/tierConfig in database |
| PG-7 | Variants structured | Certified/non-certified in variants array |
| PG-8 | Metric derivations generated | input_bindings.metric_derivations populated |
| PG-9 | Build clean | `npm run build` exits 0 |
| PG-10 | Entity dedup | ≈ 719 entities (not 19,578) |
| PG-11 | No duplicate external_ids | UNIQUE constraint holds |
| PG-12 | Entity binding | committed_data.entity_id populated |
| PG-13 | Plan import via browser | Not script |
| PG-14 | Data import via browser | Not script |
| PG-15 | 719 entities via browser | Not script |
| PG-16 | Periods created via browser | Not script |
| PG-17 | Calculate via browser | Not script |
| PG-18 | Payout renders | Within ±5% of MX$1,253,832 |
| PG-19 | Console clean | No errors during workflow |
| PG-20 | Build clean | `npm run build` exits 0 |
| PG-21 | Entity dedup SQL | 719, 0 duplicates |
| PG-22 | Temporal windowing SQL | January < total |
| PG-23 | Component aggregates | 5 of 6 within ±5% |
| PG-24 | Evidence verbatim | All outputs pasted |

**Commit:** `OB-155 Complete: Browser pipeline proof — user clicks import → calculate → sees results`

---

## WHAT NOT TO DO

1. **Do NOT bypass the browser.** This OB exists because OB-154 used scripts. If a step cannot be done through the browser, FIX the browser code — do not write another script.
2. **Do NOT import more than once.** One plan import, one data import. If either fails, fix the code, nuclear clear, and retry.
3. **Do NOT report browser proof gates as PASS based on script execution.** PG-13 through PG-19 require the USER to perform the action through the browser. Terminal scripts do not satisfy these gates.
4. **Do NOT leave the component format bridge as a script.** It must be permanent code in the plan interpretation pipeline. If the bridge is in `scripts/`, PG-5 FAILS.
5. **Do NOT create entities per data row.** 719 not 19,578. If entity count > 1,000 after data import, STOP and fix before calculating.
6. **Do NOT hardcode Óptica field names.** Korean Test applies to everything.
7. **Do NOT summarize evidence.** Paste verbatim.

---

## IF THE PLAN IMPORT CANNOT BE FIXED FOR LOCALHOST

If the Anthropic API call genuinely cannot work from the Next.js dev server (e.g., node fetch limitations, SSL issues, etc.):

1. Document the exact technical limitation
2. Test on Vercel production instead (where it previously worked)
3. The proof gate is: a user uploads a PPTX and the platform interprets it. Whether this runs on localhost or production doesn't matter — what matters is the user does it through the browser, not through a script.

If testing on production: use vialuce.ai, VL Admin login, Óptica tenant. Nuclear clear Óptica first.

---

*OB-155 — March 4, 2026*
*"The engine is proven. The scripts are proven. Now prove the platform."*
