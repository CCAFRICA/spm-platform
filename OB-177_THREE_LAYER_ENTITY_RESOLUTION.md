# OB-177: Three-Layer Entity Resolution
## DS-018 Implementation — Closing Gaps Against Entity Model Design (D1-D7)
## March 18, 2026

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL rules including Section 0 (Governing Principles)
2. `SCHEMA_REFERENCE_LIVE.md` — verify every column name before writing SQL or code
3. `DS-018_Import_to_Calculation_Data_Integrity_v2.md` — governing specification for this OB
4. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items before completion report
5. This prompt (read COMPLETELY before writing any code)

**STANDING RULES (active this session):**
- **28:** Every phase ends with one browser-testable acceptance criterion
- **29:** No code changes until diagnostic identifies root cause with evidence
- **30:** One issue per prompt — this OB is the single comprehensive deliverable
- **34:** No Bypass Recommendations. Fix structurally.
- **35:** EPG mandatory for mathematical/formula phases
- **36:** No unauthorized behavioral changes
- **37:** Lifecycle wiring requires transition proof script
- **38:** Mathematical review gate

**STANDING RULE 4: Do NOT use any ground truth values. Andrew verifies independently.**

---

## CONTEXT

The vialuce calculation engine is proven ($312,033 exact across 6 months). The variant routing failure is NOT an engine bug — it is an implementation gap where the running code does not conform to locked architectural designs.

**The Entity Model Design (Decisions D1-D7) specifies a Three-Layer temporal management system:**

| Layer | Table | Purpose | Read By |
|-------|-------|---------|---------|
| Living | `entities.temporal_attributes` | Full dated history, source-tracked | Entity card UI |
| Materialized | `period_entity_state.resolved_attributes` | Pre-resolved flat JSONB per entity per period | Calculation engine |
| Frozen | `calculation_batches` (materialization timestamp) | Immutable inputs at OFFICIAL | Audit |

**What's broken:** The variant discriminant matcher reads from `committed_data` (volatile) instead of `period_entity_state` (the Materialized layer). Entity enrichment doesn't write to `entities.temporal_attributes` (the Living layer). The `period_entity_state` materialization isn't implemented. The Three-Layer chain is broken at every link.

**What this OB delivers:** A Vertical Slice from roster import through entity enrichment through period materialization through variant-correct calculation through rendered result. One PR.

### Live Schema Reference (verified)

**entities:** id, tenant_id, entity_type, status, external_id, display_name, profile_id, temporal_attributes (jsonb), metadata (jsonb), created_at, updated_at

**period_entity_state:** id, tenant_id, entity_id, period_id, resolved_attributes (jsonb), resolved_relationships (jsonb), entity_type, status, materialized_at

**committed_data:** id, tenant_id, import_batch_id, entity_id, period_id, data_type, row_data (jsonb), metadata (jsonb), created_at, source_date

**Note:** `structural_fingerprints` was created in OB-174 (post March 7 schema). Verify column names by querying `SELECT column_name FROM information_schema.columns WHERE table_name = 'structural_fingerprints'` before writing any SQL against it.

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE OF THREE-LAYER CHAIN

**Objective:** Confirm which links in the Three-Layer chain are broken.

**Actions:**

0A: Query `period_entity_state` for BCL tenant:
```sql
SELECT COUNT(*) FROM period_entity_state 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```
Expected: 0 rows (materialization not implemented).

0B: Query `entities.temporal_attributes` for BCL-5001:
```sql
SELECT external_id, temporal_attributes 
FROM entities 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' 
AND external_id = 'BCL-5001';
```
Expected: `temporal_attributes = []` or `{}` (enrichment not written).

0C: Find where the variant discriminant matcher reads its data:
```bash
grep -n "entityRowsFlat\|flatDataByEntity\|discriminant\|VARIANT\|HF-119" \
  web/src/app/api/calculation/run/route.ts | head -20
```

0D: Find where entity enrichment SHOULD write to temporal_attributes:
```bash
grep -rn "temporal_attributes\|enrichment\|enrich" \
  web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | head -20
```

0E: Find the period_entity_state materialization (if any):
```bash
grep -rn "period_entity_state\|materialize\|materialization" \
  web/src/ --include="*.ts" | grep -v node_modules | head -20
```

**Paste ALL output for 0A through 0E.**

**Acceptance criterion:** Diagnostic confirms which layers are unimplemented and identifies the exact code locations for Phases 1-4.

**Commit:** `OB-177 Phase 0: Three-Layer chain diagnostic`

---

## PHASE 1: ENTITY ENRICHMENT — POPULATE THE LIVING LAYER

**Objective:** When SCI processes roster/entity-classified content, write enrichment attributes to `entities.temporal_attributes`.

**Governing design:** Entity Model Design, Decision D1: "Import-seeded, AI-assembled, human-confirmed, continuously enriched."

**Requirements:**

1. Find the SCI execute path that processes entity/roster-classified content (the path that currently creates entities with display_name but empty temporal_attributes).

2. After entity creation/update, detect enrichment fields in the content unit's data. An enrichment field is:
   - Low-to-medium cardinality (not unique like an ID, not constant)
   - Text type (not numeric measures)
   - NOT the entity identifier column
   - NOT the entity display name column

3. For each detected enrichment field, write to `entities.temporal_attributes` using the Entity Model Design's temporal attribute structure:
```json
{
  "field_name_normalized": {
    "current": "field_value",
    "history": [{
      "value": "field_value",
      "from": "source_date or import_date",
      "to": null,
      "source": "import_batch_id"
    }]
  }
}
```

4. Merge, don't overwrite. If `temporal_attributes` already has a value for this field:
   - If the new value is the same as current: no change (idempotent)
   - If the new value is different: close the current history entry (set `to` date) and add new entry
   - This handles the promotion scenario: Ejecutivo → Ejecutivo Senior

5. The field name stored in temporal_attributes should be normalized (lowercased, trimmed) but must preserve the original value. The variant matcher tokenizes VALUES, not keys.

**What NOT to do:**
- Do not hardcode field names ("nivel", "cargo", "role") — detect structurally
- Do not assume specific content unit classifications — check the classification result
- Do not skip entity creation if enrichment fails — entity creation is the primary action, enrichment is additive

**EPG Script:** `scripts/verify/OB-177_phase1_enrichment.ts`
```
1. Query entities.temporal_attributes for BCL-5001 after roster import
2. Confirm temporal_attributes contains at least one enrichment field
3. Confirm the field has the correct structure (current + history array)
4. Query BCL-5012 (Standard entity) — confirm different value than BCL-5001
5. Print PASS/FAIL per assertion
```
CC must run this script and paste the COMPLETE output.

**Acceptance criterion:** After roster import, `entities.temporal_attributes` for BCL-5001 contains enrichment data with dated history. BCL-5001 and BCL-5012 have different values for the role/nivel field.

**Commit:** `OB-177 Phase 1: Entity enrichment — populate Living layer`

---

## PHASE 2: PERIOD ENTITY STATE MATERIALIZATION

**Objective:** Implement the materialization step that resolves `entities.temporal_attributes` into `period_entity_state.resolved_attributes` for a specific period.

**Governing design:** Entity Model Design, Decision D5, Part 11: Three Materialization Layers.

**Requirements:**

1. Create a materialization function that, given a tenant_id and period_id:
   - Fetches all entities assigned to the plan for that period (from rule_set_assignments)
   - For each entity, reads `temporal_attributes`
   - Resolves each temporal attribute to its value as-of the period's date range (the value whose `from` ≤ period.end_date and (`to` is null OR `to` > period.start_date))
   - Writes the flat resolved values to `period_entity_state.resolved_attributes`
   - Sets `entity_type`, `status`, `materialized_at`

2. The materialization is idempotent — re-running it for the same period produces the same result (upsert, not insert).

3. Trigger: the materialization runs at calculation time, before variant routing. This is the on-demand approach (Phase 2 of DS-018). The batch approach (triggered at period opening) is a future optimization.

4. The `resolved_attributes` JSONB should be flat — no nested timelines:
```json
{ "nivel": "Ejecutivo Senior", "sucursal": "Guayaquil Centro" }
```
Not:
```json
{ "nivel": { "current": "Ejecutivo Senior", "history": [...] } }
```
The materialization resolves the timeline. The engine reads flat values.

**EPG Script:** `scripts/verify/OB-177_phase2_materialization.ts`
```
1. Trigger materialization for BCL tenant + October 2025 period
2. Query period_entity_state for BCL-5001 + October — confirm resolved_attributes has "nivel" (or equivalent enrichment field) with Senior value
3. Query period_entity_state for BCL-5012 + October — confirm Standard value
4. Count total rows in period_entity_state for BCL + October — should be 85
5. Confirm materialized_at is set
6. Print PASS/FAIL per assertion
```

**Acceptance criterion:** After materialization, `period_entity_state` has 85 rows for BCL + October, each with flat `resolved_attributes` containing the resolved enrichment values for that period.

**Commit:** `OB-177 Phase 2: period_entity_state materialization`

---

## PHASE 3: VARIANT MATCHER READS FROM MATERIALIZED LAYER

**Objective:** Change the variant discriminant matcher to read from `period_entity_state.resolved_attributes` instead of `flatDataByEntity`.

**Governing design:** Entity Model Design, Decision D5: calculation engine reads from Materialized layer.

**Requirements:**

1. In the calculation engine (`run/route.ts`), find the variant discriminant matching block (around line 1062-1117 per DIAG-007).

2. Currently the token source is:
```typescript
for (const row of entityRowsFlat) {  // ← reads from flatDataByEntity (committed_data)
```

3. Change to read from `period_entity_state.resolved_attributes`:
   - Before the entity loop, fetch `period_entity_state` for this tenant + period
   - Index by entity_id
   - In the discriminant matching block, build the token set from `resolved_attributes` (flat JSONB) instead of `entityRowsFlat`

4. Fallback: if `period_entity_state` has no row for this entity (materialization not run, or new entity), fall back to the existing `entityRowsFlat` path. Log a warning: "No materialized state for entity X — using committed_data fallback."

5. The tokenization logic is unchanged — it still calls `variantTokenize()` on all string values. Only the data source changes.

**What NOT to do:**
- Do not change the metric derivation path (convergence bindings → `dataByBatch`) — that's working correctly
- Do not remove the `flatDataByEntity` code path entirely — it's the fallback
- Do not change the discriminant scoring logic — only the token source

**EPG Script:** `scripts/verify/OB-177_phase3_variant_routing.ts`
```
1. Trigger calculation for BCL October 2025 via API
2. Parse the Vercel log (or local log) for VARIANT lines
3. Count entities with V0:1 (Senior routed) — should be 13
4. Count entities with V0:0 (Standard routed) — should be 72
5. Confirm Grand total matches previous proven value (DO NOT hardcode GT — compare against calculation_results sum)
6. Print PASS/FAIL per assertion
```

**Acceptance criterion:** After calculation, 13 entities route to variant_0 (Senior) and 72 to variant_1 (Standard). The Grand total changes from the incorrect $41,814 (all-Standard) to the correct value (with Senior rates applied).

**Commit:** `OB-177 Phase 3: Variant matcher reads from period_entity_state`

---

## PHASE 4: FLYWHEEL SELF-CORRECTION

**Objective:** Add outcome-based validation for the structural fingerprint's entity_identifier classification.

**Governing design:** DS-017 extended with CRR correction signal principles.

**Requirements:**

1. After each import batch commitment (in the execute-bulk or process-job handler), compute entity_id binding match rate:
```
match_rate = COUNT(committed_data WHERE entity_id IS NOT NULL AND import_batch_id = X) 
           / COUNT(committed_data WHERE import_batch_id = X)
```

2. If `match_rate < 0.5`:
   - Log warning: "Entity binding failure: {match_rate}% for batch {batch_id}. Fingerprint entity_identifier may be incorrect."
   - Query `structural_fingerprints` for this batch's fingerprint hash
   - Set a flag (e.g., `needs_reclass: true` or decrease confidence) on the fingerprint record
   - Emit a classification signal with `decision_source: 'outcome_validation'`

3. On subsequent imports with the same fingerprint:
   - If `needs_reclass` flag is set: do NOT use the cached entity_identifier
   - Re-run structural entity_identifier detection (highest uniqueness text/alphanumeric column)
   - If the new classification differs from cached: update the fingerprint record

4. Confidence adjustment:
   - On successful binding (match_rate ≥ 0.5): confidence increases per existing formula `1 - 1/(matchCount + 1)`
   - On failed binding (match_rate < 0.5): `confidence = max(0.3, confidence - 0.2)`
   - If confidence drops below 0.5: Tier 1 is demoted to Tier 2 (re-classify with minimal LLM)

**Note on `structural_fingerprints` table:** This table was created in OB-174, after SCHEMA_REFERENCE_LIVE.md was generated. Before writing any SQL or code referencing this table, run:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'structural_fingerprints' ORDER BY ordinal_position;
```
Paste the output to confirm column names.

**EPG Script:** `scripts/verify/OB-177_phase4_selfcorrection.ts`
```
1. Query structural_fingerprints for BCL fingerprint hash
2. Confirm current entity_identifier field classification
3. Compute binding match rate from committed_data for the most recent batch
4. If match_rate < 0.5: confirm needs_reclass flag or confidence decrease
5. Simulate next import: confirm re-classification is triggered
6. Confirm confidence decreased (not increased) for the failed binding
7. Print PASS/FAIL per assertion
```

**Acceptance criterion:** After the self-correction detects the entity_identifier misclassification, the fingerprint is flagged for re-classification and confidence decreases.

**Commit:** `OB-177 Phase 4: Flywheel self-correction on binding failure`

---

## PHASE 5: VERTICAL SLICE PROOF

**Objective:** End-to-end walkthrough: roster import → enrichment → materialization → calculation → correct variant routing → correct totals.

**Requirements:**

1. Import BCL_Plantilla_Personal.xlsx (roster file)
2. Confirm entity enrichment wrote to `entities.temporal_attributes` (Phase 1 EPG)
3. Import BCL_Datos_Oct2025.xlsx (transaction data)
4. Trigger calculation for October 2025
5. Confirm materialization populated `period_entity_state` (Phase 2 EPG)
6. Confirm variant routing: 13 Senior, 72 Standard (Phase 3 EPG)
7. Confirm calculation totals are correct (Andrew verifies independently)
8. Confirm `/stream` renders with correct System Health total
9. Confirm component breakdown shows BOTH Senior Executive and Executive variants

**This phase uses localhost:3000. Andrew will verify production after merge.**

**Acceptance criterion:** The complete chain works — roster enriches entities, materialization resolves per-period, variant matcher reads materialized state, calculation produces correct totals with both variant types.

**Commit:** `OB-177 Phase 5: Vertical slice proof — roster to calculation`

---

## PHASE 6: BUILD VERIFICATION + COMPLETION REPORT

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000 loads
5. Create completion report file (see below)
6. `git add . && git commit -m "OB-177 Phase 6: Build verification and completion report"`
7. `git push origin dev`
8. `gh pr create --base main --head dev --title "OB-177: Three-Layer Entity Resolution — DS-018 Implementation" --body "## Summary\nCloses implementation gaps against Entity Model Design (D1-D7). Implements entity enrichment to temporal_attributes (Living layer), period_entity_state materialization (Materialized layer), variant matcher reads from materialized state, and flywheel self-correction on binding failure.\n\n## Phases\n- Phase 0: Three-Layer chain diagnostic\n- Phase 1: Entity enrichment — populate Living layer\n- Phase 2: period_entity_state materialization\n- Phase 3: Variant matcher reads from Materialized layer\n- Phase 4: Flywheel self-correction\n- Phase 5: Vertical slice proof\n- Phase 6: Build verification\n\n## DS-018 Gaps Closed\n- Gap 1: Variant matcher reads from period_entity_state (not committed_data)\n- Gap 2: Entity enrichment writes to temporal_attributes\n- Gap 3: period_entity_state materialization implemented\n- Gap 4: Flywheel self-correction on entity_identifier binding failure\n\n## Proof\nSee OB-177_COMPLETION_REPORT.md and scripts/verify/OB-177_*.ts"`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-177_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## COMPLETION REPORT TEMPLATE

```markdown
# OB-177 COMPLETION REPORT
## Date: [DATE]
## Execution Time: [START] to [END]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Three-Layer chain diagnostic |
| | Phase 1 | Entity enrichment — populate Living layer |
| | Phase 2 | period_entity_state materialization |
| | Phase 3 | Variant matcher reads from Materialized layer |
| | Phase 4 | Flywheel self-correction |
| | Phase 5 | Vertical slice proof |
| | Phase 6 | Build verification and completion report |

## FILES CREATED
| File | Purpose |
|------|---------|
| scripts/verify/OB-177_phase1_enrichment.ts | EPG: entity enrichment verification |
| scripts/verify/OB-177_phase2_materialization.ts | EPG: materialization verification |
| scripts/verify/OB-177_phase3_variant_routing.ts | EPG: variant routing verification |
| scripts/verify/OB-177_phase4_selfcorrection.ts | EPG: flywheel self-correction verification |

## FILES MODIFIED
| File | Change |
|------|--------|

## PROOF GATES — HARD (EPG output required)
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | Phase 1 EPG: temporal_attributes populated for BCL-5001 with enrichment field + history | | [paste COMPLETE script output] |
| 2 | Phase 1 EPG: BCL-5001 and BCL-5012 have different enrichment values | | [paste script output] |
| 3 | Phase 2 EPG: period_entity_state has 85 rows for BCL + October | | [paste script output] |
| 4 | Phase 2 EPG: resolved_attributes is FLAT (no nested timelines) | | [paste script output] |
| 5 | Phase 3 EPG: 13 entities route to variant_0, 72 to variant_1 | | [paste script output] |
| 6 | Phase 3 EPG: Grand total differs from $41,814 (all-Standard result) | | [paste script output] |
| 7 | Phase 4 EPG: binding failure detected for BCL fingerprint | | [paste script output] |
| 8 | Phase 4 EPG: confidence decreased (not increased) on failure | | [paste script output] |
| 9 | Phase 5: Vertical slice — roster → enrichment → materialization → calculation → correct totals | | [paste proof chain] |
| 10 | npm run build exits 0 | | [paste exit code] |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | /stream shows component breakdown with BOTH Senior Executive and Executive variants | | |
| 2 | No console errors through roster import → calculate → /stream | | |
| 3 | Meridian regression: MX$185,063 unaffected | | |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL — [N] commits for 7 phases
- Rule 4 (no GT values): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL
- Rule 29 (diagnostic before code): PASS/FAIL — Phase 0 precedes Phases 1-4
- Rule 34 (no bypasses): PASS/FAIL
- Rule 35 (EPG scripts): PASS/FAIL — 4 scripts created, run, output pasted
- Rule 36 (no unauthorized changes): PASS/FAIL

## PERSISTENT DEFECT REGISTRY — VERIFICATION
| PDR # | Description | In Scope? | Status | Evidence |
|-------|-------------|-----------|--------|----------|
| PDR-01 | Currency no cents | NO | — | |

## KNOWN ISSUES
- [anything that didn't work, partial implementations, deferred items]
```

---

## WHAT THIS OB DOES NOT COVER

- Entity-to-user linking (Workstream 3 — separate OB)
- Manager/Rep persona surfaces
- Batch materialization triggered at period opening (future optimization — on-demand is Phase 2)
- Calculation Snapshot (Frozen layer) — written at OFFICIAL, not implemented yet
- Cross-tenant flywheel correction signals (Foundational scope — DS-017 Phase I)
- Fix for entity_id FK binding on committed_data (separate concern — the variant matcher no longer depends on it)
- Roster import UI/UX issues (BCL_Plantilla_Personal.xlsx import may require existing SCI pipeline)

---

*"The architecture solved this months ago. This OB makes the code conform."*
