# OB-186: Platform Capabilities — Period Management, Quota Resolution, Scope Aggregate, Cadence-Aware Calculate

## MANDATORY — READ FIRST
Include CC_STANDING_ARCHITECTURE_RULES.md at the top of your working context.

## Classification
- **Type:** OB (Objective Build)
- **Priority:** P0
- **Vertical Slice:** Period creation (UI + API) → Cadence-aware calculate page → Quota in piecewise_linear evaluator → Scope aggregate filter fix → Full CRP recalculation
- **Addresses:** CLT-187 F04, F08, F09, F15, F18; CLT-188 F01; Decision 113, Decision 144
- **Prerequisite:** HF-172 merged (PR #309) — metric_derivation filters + source_pattern de-gating

---

## CONTEXT

CRP is the third proof tenant (medical device, 32 entities, 4 plans). After HF-172, Plans 1-3 produce directionally correct calculations but with specific gaps. Plan 4 produces $0. Andrew is clean-slating CRP and reimporting through the browser. Every capability in this OB must work through the platform UI — no SQL Editor interventions.

### Current State After HF-172

| Plan | Engine | GT (Jan) | Gap |
|------|--------|----------|-----|
| Plan 1 (Capital Equipment) | $173,358 | $182,282 | Monthly period — needs bi-weekly. $4,000 intercept gap + 1 variant mismatch (test data, now fixed) |
| Plan 2 (Consumables) | $15,466 | $28,159 | Revenue correct post-HF-172. Quota unavailable — engine can't compute attainment tiers. |
| Plan 3 (Cross-Sell) | $2,300 | $2,400 | 17/17 visible entities match. Gap is in 6 hidden entities only. |
| Plan 4 (District Override) | $0 | $66,757 | Convergence produces 0 derivations. Scope aggregates don't apply product_category filter. |

### What This OB Delivers

4 platform capabilities that are NOT CRP-specific:

1. **Period Management UI** — Any tenant admin can create periods of any cadence through the Configure workspace
2. **Cadence-Aware Calculate** — Calculate page filters periods by plan cadence so users can't miscalculate
3. **Plan Parameter Resolution** — piecewise_linear evaluator reads quota from plan component definition (works for any plan with variant-specific parameters)
4. **Filtered Scope Aggregates** — scope_aggregate pre-computation applies metric_derivation filters (same filters HF-172 enabled for direct entity metrics)

---

## PHASE 1: Period Management UI

### Problem
Decision 113 (LOCKED): "Periods are user business decisions. The user defines cadence and boundaries." But no UI exists for creating periods. The existing "Create Periods" button on the import page auto-detects from data, which only produces monthly cadence. CRP needs bi-weekly periods for Plan 1.

### What Exists
- `POST /api/periods` API route exists and works
- `periods` table schema: id, tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata
- `period_type` check constraint accepts: monthly, biweekly, weekly, quarterly, annual
- Import page has auto-detect + create button (Decision 47)

### What to Build

**A period management section in the Configure workspace.**

The existing Configure workspace (`/configure`) has a Users page and a Periods page. The Periods page currently shows existing periods but has no creation capability.

**Add to the Periods page:**

1. **"Create Period" button** that opens a form with:
   - Label (text input, e.g., "Jan 1-15 2026")
   - Period type (dropdown: monthly, biweekly, weekly, quarterly, annual)
   - Start date (date picker)
   - End date (date picker)
   - Status defaults to "open"
   - `canonical_key` auto-generated from period_type + dates (e.g., "2026-BW01", "2026-01")

2. **Period list** showing all periods with label, type, date range, status

3. **Calls `POST /api/periods`** with the form data

### Architecture Decision Gate
- **Korean Test:** Period type dropdown values come from the database check constraint, not hardcoded in the UI. Query the constraint or use a config constant.
- **Scale:** Pagination for period list. No N+1 queries.
- **Domain-agnostic:** Period management works for any module, not just ICM.

### Verification
- Navigate to `/configure/periods`
- Create a monthly period: "January 2026" (2026-01-01 to 2026-01-31)
- Create two biweekly periods: "Jan 1-15 2026" (2026-01-01 to 2026-01-15), "Jan 16-31 2026" (2026-01-16 to 2026-01-31)
- All three appear in the period list
- No SQL Editor involvement

---

## PHASE 2: Cadence-Aware Calculate Page

### Problem
When a tenant has both monthly and biweekly periods, the Calculate page period selector shows ALL periods regardless of which plan is selected. A user could accidentally calculate a biweekly plan against a monthly period or vice versa. The plan's cadence information exists in `cadence_config` on the rule_set but the UI doesn't read it.

### What Exists
- `rule_sets.cadence_config` JSONB column exists but is always `{}`
- Calculate page has plan selector and period selector
- `POST /api/calculate` accepts ruleSetId + periodId

### What to Build

**Step 2a: Store cadence in rule_set at plan import time.**

When the AI interprets a plan PDF, the plan description typically states the cadence ("bi-weekly commission", "monthly bonus"). The plan interpretation should extract this and store it in `cadence_config`.

Read the plan interpretation code (search for `cadence_config` assignments — currently all set to `{}`). Add cadence extraction to the AI plan interpretation prompt:

```json
{
  "cadence_config": {
    "period_type": "biweekly"  // or "monthly", "quarterly", etc.
  }
}
```

The AI prompt for plan interpretation already receives the full plan document text. Add a field to the response schema requesting cadence. If the AI can't determine cadence, default to "monthly".

**Step 2b: Calculate page filters periods by plan cadence.**

When the user selects a plan on the Calculate page:
1. Read `cadence_config.period_type` from the selected rule_set
2. Filter the period dropdown to show only periods matching that `period_type`
3. If `cadence_config` is empty or has no `period_type`, show all periods (backward compatible)

**Step 2c: For existing CRP plans (already imported), allow manual cadence setting.**

If plans are already imported with empty `cadence_config`, the admin needs a way to set cadence without reimporting. Add an "Edit Plan" action on the plan list (or calculate page) that allows setting the cadence. This calls a PATCH on the rule_set to update `cadence_config`.

### Architecture Decision Gate
- **Korean Test:** Cadence extraction from AI uses structural heuristics (frequency words in any language), not English string matching
- **Scale:** Period filtering is a simple WHERE clause, no performance concern
- **No behavioral change for existing tenants:** Empty cadence_config = show all periods (backward compatible)

### Verification
- Import Plan 1 PDF → verify `cadence_config.period_type` = "biweekly" in the rule_set JSONB
- Import Plan 2 PDF → verify `cadence_config.period_type` = "monthly"
- On Calculate page, select Plan 1 → period dropdown shows only biweekly periods
- Select Plan 2 → period dropdown shows only monthly periods
- Calculate Plan 1 for "Jan 1-15 2026" → verify Vercel logs show correct date range

---

## PHASE 3: Plan Parameter Resolution (Quota for Piecewise Linear)

### Problem
Plan 2 (Consumables) is a piecewise_linear plan with quota-based attainment tiers. The GT uses variant-specific quotas: Senior Rep = $25,000/month, Rep = $18,000/month. The engine has correct consumable revenue (post-HF-172) but no quota value, so it can't compute `attainment = revenue / quota` and can't select the correct tier rate (3%/5%/8%).

### What Exists
- The plan PDF states the quotas explicitly
- The AI plan interpretation extracts component definitions with segments (breakpoints)
- The `calculationMethod` JSONB on the component has `ratioMetric` and `segments`
- The piecewise_linear segments have `{min: 0, max: 1.0, rate: 0.03}` (attainment ratios)
- The engine evaluator for piecewise_linear reads segments and applies rates

### What's Missing
- The component definition doesn't include the quota value(s)
- The engine evaluator can't compute attainment without a quota
- Variant-specific quotas need to be stored per-variant in the component definition

### What to Build

**Step 3a: Extract quota from plan interpretation.**

The AI plan interpretation prompt already asks for component structure. Add a field for `quotaMetric` or `targetValue` per variant:

```json
{
  "type": "piecewise_linear",
  "calculationMethod": {
    "type": "piecewise_linear",
    "ratioMetric": "quota_attainment",
    "baseMetric": "consumable_revenue",
    "targetValue": 25000,
    "segments": [...]
  }
}
```

For variant-specific quotas, each variant's component should carry its own `targetValue`:
- Variant 0 (Senior Rep): `targetValue: 25000`
- Variant 1 (Rep): `targetValue: 18000`

Read the current AI prompt for plan interpretation (in the Anthropic adapter). Add `targetValue` (or `quota`, `target`) to the piecewise_linear response schema. The plan PDF says "quota: $25,000 for Senior, $18,000 for Rep" — the AI can extract this.

**Step 3b: Engine evaluator reads quota from component definition.**

The piecewise_linear evaluator in the intent executor needs to:
1. Read `targetValue` from the component's calculationMethod
2. Compute `attainment = derivedMetric[baseMetric] / targetValue`
3. Use `attainment` to select the correct segment (tier)
4. Apply `segment.rate × revenue`

Find the piecewise_linear evaluation code in `intent-executor.ts` (search for `piecewise_linear` in the `executeOperation` or `resolveSource` functions). The evaluator likely reads a `ratioMetric` from derived metrics — if that metric doesn't exist, it falls back to something. The fix: if `ratioMetric` value is 0 or missing AND `targetValue` exists on the component, compute attainment = baseMetric / targetValue.

### Architecture Decision Gate
- **Korean Test:** `targetValue` is a numeric field from the plan, not a hardcoded constant
- **Domain-agnostic:** This pattern applies to any plan with a target/quota parameter — not just ICM consumables
- **Variant-aware:** Different variants can have different target values. The engine selects the variant first, then reads the target from that variant's component.

### Verification
- Import Plan 2 PDF → verify the component JSONB includes `targetValue: 25000` (Senior) and `targetValue: 18000` (Rep)
- Calculate Plan 2 for January 2026
- Tyler Morrison (Senior Rep, CN revenue $33,109): attainment = 33,109/25,000 = 1.324 → 8% tier → $2,648.72
- David Stern (Rep, CN revenue $16,277): attainment = 16,277/18,000 = 0.904 → 3% tier → $488.31
- Plan 2 grand total should approach GT $28,159.48

### Ground Truth for Verification (Plan 2, January)

| Tier | Count | Entities |
|------|-------|----------|
| Below Quota (<100%) at 3% | 12 | Lisa Nakamura, Michelle Torres, Brian Foster, Priya Sharma, Fatima Al-Rashid, Thomas Grant, Yuki Tanaka, Maya Johnson, Ahmed Hassan, and others |
| At/Above Quota (100-120%) at 5% | 4 | Aisha Patel, Kevin O'Brien, Samuel Osei, and 1 more |
| Super Accelerator (>120%) at 8% | 8 | Tyler Morrison, Rachel Green, William Drake, Patrick Sullivan, Sophia Castellano, and others |

---

## PHASE 4: Filtered Scope Aggregates for Plan 4

### Problem
Plan 4 (District Override) requires District Managers to earn 1.5% of their district's total equipment revenue, and Regional VPs to earn 0.5% of their region's total. The engine's scope aggregate pre-computation (HF-155, OB-181) already sums metrics across entities sharing a district/region. But it sums ALL numeric fields in committed_data — it doesn't apply the `product_category = 'Capital Equipment'` filter. So the scope total includes CE + CN + XS revenue, producing wrong district/region totals.

### What Exists (HF-155, OB-181)
- `scopeAggregates` pre-computed per entity in the calc engine
- Keys like `district:total_amount:sum` and `region:total_amount:sum`
- Entity metadata has `district` and `region` fields (from roster import)
- The intent executor reads `scopeAggregates[scope:field:aggregation]`

### What's Missing
- The scope aggregate loop doesn't apply `metric_derivation` filters
- The convergence can't produce a derivation for scope_aggregate plans (0 derivations, 1 gap)
- The scope_aggregate intent source doesn't specify which filtered metric to aggregate

### What to Build

**Step 4a: Apply metric_derivation filters to scope aggregate pre-computation.**

The existing scope aggregate code in `run-calculation.ts` (around line ~34860 per AUD-001) iterates over other entities' rows and sums all numeric fields:

```typescript
for (const [key, val] of Object.entries(rd)) {
  if (key.startsWith('_') || typeof val !== 'number') continue;
  entityScopeAgg[`district:${key}:sum`] = ...
}
```

This must be changed to produce FILTERED scope aggregates. For each `metricDerivation` that has `operation: 'sum'` and `filters`, compute a filtered scope aggregate:

```typescript
// For each metric derivation with filters
for (const rule of metricDerivations) {
  if (rule.operation !== 'sum' || !rule.source_field) continue;
  
  // For each other entity in same scope
  for (const [otherId, otherSheetMap] of dataByEntity.entries()) {
    if (otherId === entityId) continue;
    const otherMeta = entityMap.get(otherId)?.metadata;
    if (otherMeta?.district !== entityDistrict) continue;
    
    for (const [, rows] of otherSheetMap.entries()) {
      for (const row of rows) {
        const rd = row.row_data as Record<string, unknown>;
        // Apply the SAME filters from the derivation rule
        if (rowMatchesFilters(rd, rule.filters)) {
          const val = rd[rule.source_field];
          if (typeof val === 'number') {
            entityScopeAgg[`district:${rule.metric}:sum`] += val;
          }
        }
      }
    }
  }
}
```

This reuses the `rowMatchesFilters` helper from HF-172.

**IMPORTANT:** The `metricDerivations` come from the CURRENT plan's `input_bindings`. But scope_aggregate plans (Plan 4) have EMPTY input_bindings (convergence failed). The filters needed are from Plan 1's bindings (product_category = 'Capital Equipment'). 

This is an architectural question: how does Plan 4's scope_aggregate know to filter by Capital Equipment?

**Answer: The scope_aggregate component definition specifies the source metric.** The plan PDF says "1.5% of district equipment revenue." The component's `calculationMethod` should reference `metric: "equipment_revenue"` — the same metric that Plan 1 derives. The scope aggregate pre-computation should look up the metric_derivation for that metric name ACROSS ALL plans for the tenant, not just the current plan.

**Step 4b: Produce metric_derivation for scope_aggregate plans.**

Currently convergence produces 0 derivations for Plan 4. Instead of fixing convergence (large effort), add a simpler path: when the engine sees a scope_aggregate plan with empty input_bindings, it looks for the referenced metric in OTHER plans' input_bindings.

The component says `metric: "equipment_revenue"` (or similar). The engine searches all rule_sets for this tenant to find a `metric_derivation` that derives `"period_equipment_revenue"` (Plan 1's derivation). It reuses that derivation's source_field and filters for the scope aggregation.

This is the "cross-plan metric resolution" pattern — scope_aggregate plans consume metrics that other plans define.

**Step 4c: The scope_aggregate intent must emit a scope_aggregate source.**

The `transformFromMetadata` function must handle scope_aggregate by emitting an intent with a `scope_aggregate` source:

```typescript
// scope_aggregate intent:
// input = scope_aggregate with scope=district/region, field=metric_name, aggregation=sum
// output = input × rate
```

The intent executor's `resolveSource` for `scope_aggregate` already reads `data.scopeAggregates[key]` (line ~36885 in AUD-001). If the key matches (e.g., `district:period_equipment_revenue:sum`), it returns the value. The operation is then `multiply` by the rate.

### Architecture Decision Gate
- **Korean Test:** Metric names and filter values come from metric_derivations and component definitions — never hardcoded
- **Domain-agnostic:** Cross-plan metric resolution works for any tenant where one plan's metric feeds another plan's calculation
- **Scale:** Scope aggregation iterates over all entities × all rows — O(n²). For 31 entities this is fine. For 100K entities, this needs batch optimization. Flag for future but don't block.

### Verification
- Calculate Plan 4 for January 2026
- James Whitfield (DM, NE-NE): should see district CE revenue = $875,346 → 1.5% = $13,130.19
- Marcus Chen (RVP, NE): should see region CE revenue = $1,401,189 → 0.5% = $7,005.94
- Plan 4 grand total should approach GT $66,756.89 (January)

### Ground Truth (Plan 4, January)

| Entity | Role | Scope | Scope CE Revenue | Rate | Override |
|--------|------|-------|------------------|------|----------|
| Marcus Chen | RVP | NE | $1,401,189 | 0.5% | $7,005.94 |
| Diana Reeves | RVP | SE | $1,936,656 | 0.5% | $9,683.28 |
| James Whitfield | DM | NE-NE | $875,346 | 1.5% | $13,130.19 |
| Sarah Okonkwo | DM | NE-MA | $525,843 | 1.5% | $7,887.64 |
| Robert Vasquez | DM | SE-CR | $1,010,978 | 1.5% | $15,164.67 |
| Elena Marchetti | DM | SE-GS | $925,678 | 1.5% | $13,885.17 |

---

## PHASE 5: Full CRP Regression Test

After Phases 1-4 are implemented and deployed:

### Test Sequence (Andrew performs in browser)

1. **Clean slate CRP** — all data wiped
2. **Import corrected roster** (01_CRP_Employee_Roster_20260101.csv) — verify 32 entities created, William Drake = "Senior Rep"
3. **Import 4 plan PDFs** — verify each plan's `cadence_config` and `components` JSONB
4. **Create periods** via Configure → Periods page:
   - January 2026 (monthly, 2026-01-01 to 2026-01-31)
   - Jan 1-15 2026 (biweekly, 2026-01-01 to 2026-01-15)
   - Jan 16-31 2026 (biweekly, 2026-01-16 to 2026-01-31)
5. **Import data files 02 and 03** (Jan 1-15 and Jan 16-31 transactions)
6. **Calculate Plan 1** for each biweekly period:
   - "Jan 1-15 2026" → GT: $73,142.72
   - "Jan 16-31 2026" → GT: $109,139.46
   - Combined: $182,282.18
7. **Calculate Plan 2** for "January 2026" → GT: $28,159.48
8. **Calculate Plan 3** for "January 2026" → GT: $2,400.00
9. **Calculate Plan 4** for "January 2026" → GT: $66,756.89
10. **Total Plans 1-4 January** → GT: $279,538.55

### Capture for each calculation:
- Vercel Runtime Log (full entity-level output)
- Grand total
- Any warnings or fallback messages

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** the metric_derivation filter logic from HF-172 (it works)
- **Do NOT modify** entity resolution (OB-183, HF-171 — they work)
- **Do NOT modify** auth, session, or cookie code
- **Do NOT modify** convergence-service.ts for this OB
- **Do NOT delete** any existing API routes
- **Do NOT modify** BCL or Meridian tenant data
- **Do NOT provide** GT values to the engine — the engine must derive correct results from plan definitions + data

---

## COMPLETION REPORT REQUIREMENTS

The completion report MUST include:

1. **Phase 1:** Screenshot of period creation form + list showing 3 periods created
2. **Phase 2:** Grep showing `cadence_config` populated on plan import. Screenshot of filtered period dropdown.
3. **Phase 3:** Grep showing `targetValue` in component JSONB. Vercel log showing correct Plan 2 tier rates.
4. **Phase 4:** Vercel log showing Plan 4 producing non-zero results with scope aggregates.
5. **Build output** confirming clean build with no errors
6. **No hardcoded field names** (Korean Test grep)
7. **Regression:** BCL and Meridian plans must still calculate correctly if triggered (no regression from engine changes)

---

## GIT

After all phases verified:

```bash
cd /Users/andrew/Projects/spm-platform
git add -A
git commit -m "OB-186: Period management UI, cadence-aware calculate, quota resolution, filtered scope aggregates

Phase 1: Period creation form in Configure workspace
Phase 2: cadence_config populated at plan import, period dropdown filtered by plan cadence
Phase 3: piecewise_linear reads targetValue from component, computes attainment internally
Phase 4: Scope aggregate pre-computation applies metric_derivation filters, cross-plan metric resolution
Phase 5: Full CRP regression verified through browser"

gh pr create --base main --head dev --title "OB-186: Platform capabilities — periods, cadence, quota, scope aggregate" --body "Four platform capabilities for mixed-cadence tenants: (1) Period management UI in Configure workspace, (2) Cadence-aware period filtering on Calculate page, (3) Quota/target extraction from plan interpretation for piecewise_linear, (4) Filtered scope aggregate pre-computation with cross-plan metric resolution. Enables CRP Plan 1 bi-weekly, Plan 2 correct tiers, Plan 4 district/region overrides."
```
