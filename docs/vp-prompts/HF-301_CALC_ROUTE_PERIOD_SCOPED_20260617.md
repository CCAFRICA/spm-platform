# HF-301: Remove Whole-Tenant Scans from Calc Route

**Date:** 2026-06-17
**Category:** HF — fixes AUD-006 RC-2/RC-3 (calc route timeout at MIR scale).
**Number:** HF-301 (assigned by architect). VERIFY before committing: `ls docs/vp-prompts/ | grep -iE "^HF-301"` and `ls docs/completion-reports/ | grep -iE "^HF-301"` must both return empty.
**Predecessor:** AUD-006 (architect-channel, 2026-06-17). DIAG-071 / HF-300 confirmed C1 (plan supersession) is fixed — 5 active plans. This HF fixes the calc-time timeout.
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — WHAT IS BROKEN

Tenant `972c8eb0-e3ae-4e4c-ad30-8b34804c893a` (MIR): Calculate times out at 300s on every plan. Vercel kills the function. The calc route loads ~26k period-scoped rows (correct), then runs three whole-tenant operations that dominate the time budget:

1. **`resolveEntitiesFromCommittedData()`** (HF-109) — scans ALL 165,897 committed_data rows, creates/updates entities, writes entity_id back via UPDATE. Whole-tenant. This is the primary timeout cause.
2. **HF-126 assignment creation** — fetches ALL 553 entities, checks ALL assignments across 5 active plans, inserts missing ones. Whole-tenant.
3. **Convergence derivation** — reads ALL rule_sets, derives bindings from committed_data. Whole-tenant.

Meanwhile, OB-183's in-memory entity resolution (already in the calc route) resolves entity_id from `row_data[entity_id_field]` using only the period-scoped rows already loaded. It does NOT need the whole-tenant scan. DB confirms: `metadata.entity_id_field` is populated on 165,867 of 165,897 rows (99.98%).

BCL/Meridian/CRP are unaffected — they use Route A (execute/route.ts) where post-commit ran in-request at small scale, and their committed_data already has entity_id populated.

---

## §1 — DISCIPLINE

1. `CC_STANDING_ARCHITECTURE_RULES.md` applies.
2. **Do not touch the import pipeline.** This HF fixes the calc route only.
3. **Do not touch Route A** (execute/route.ts). BCL/Meridian/CRP must not regress.
4. **Scale by Design.** The fix must work for any tenant size. No new per-tenant assumptions.
5. **Korean Test.** No field-name matching in any language. OB-183 uses `metadata.entity_id_field` (structural — the SCI classification wrote it at import time).

---

## §2 — THE FIX (three edits in one file)

**File:** `web/src/app/api/calculation/run/route.ts`

All three edits are in this single file. Read the file first. Paste the current code around each edit site before making changes.

### Edit 1: Remove HF-109 whole-tenant entity resolution call

Find the call to `resolveEntitiesFromCommittedData`. It will look like:
```typescript
// HF-109: Post-import entity resolution (DS-009 3.3)
try {
  const entityResult = await resolveEntitiesFromCommittedData(supabase, tenantId);
  console.log(`[SCI Execute] HF-109 Entity resolution: ...`);
} catch (entityErr) {
  console.error('[SCI Execute] Post-import entity resolution failed (non-blocking):', entityErr);
}
```

**Action:** Comment out (do not delete) the entire try/catch block. Replace with a log line:
```typescript
// HF-301: resolveEntitiesFromCommittedData REMOVED from calc hot path.
// Was HF-109 whole-tenant scan — times out at >50k rows.
// OB-183 in-memory resolution handles entity binding from period-scoped data.
addLog('HF-301: Whole-tenant entity resolution skipped (OB-183 in-memory handles period-scoped)');
```

Verify that OB-183's in-memory resolution loop (the `calcTimeResolved` counter) is still present and fires BEFORE this point. It should be in the committed_data grouping loop (Phase 4 in the route). Paste the OB-183 loop to confirm it exists and will fire.

### Edit 2: Scope HF-126 assignment creation to period entities only

Find the HF-126 assignment block. It currently fetches ALL entity IDs:
```typescript
const ASSIGN_PAGE = 1000;
const allEntityIds: string[] = [];
let page = 0;
while (true) {
  const { data: entityPage } = await supabase
    .from('entities')
    .select('id')
    .eq('tenant_id', tenantId)
    .range(page * ASSIGN_PAGE, (page + 1) * ASSIGN_PAGE - 1);
  // ...
}
```

**Action:** Replace the whole-tenant entity fetch with the set of entity IDs that OB-183 already resolved in memory. After OB-183's grouping loop runs, `dataByEntity` (or `flatDataByEntity`) contains the entity UUIDs that have data in this period. Use those keys instead of fetching all 553:

```typescript
// HF-301: Scope assignments to entities present in this period's data
// dataByEntity keys are the entity UUIDs resolved by OB-183
const periodEntityIds = Array.from(dataByEntity.keys());
addLog(`HF-301: ${periodEntityIds.length} entities in period (vs ${entities.length} total)`);

if (periodEntityIds.length > 0 && activeRuleSets && activeRuleSets.length > 0) {
  // Check existing assignments for ONLY these entities
  const assignedSet = new Set<string>();
  for (let i = 0; i < periodEntityIds.length; i += ASSIGN_PAGE) {
    const slice = periodEntityIds.slice(i, i + ASSIGN_PAGE);
    const { data: existing } = await supabase
      .from('rule_set_assignments')
      .select('entity_id, rule_set_id')
      .eq('tenant_id', tenantId)
      .in('entity_id', slice);
    if (existing) {
      for (const a of existing) assignedSet.add(`${a.entity_id}:${a.rule_set_id}`);
    }
  }

  const newAssignments = [];
  for (const rs of activeRuleSets) {
    for (const entityId of periodEntityIds) {
      if (!assignedSet.has(`${entityId}:${rs.id}`)) {
        newAssignments.push({
          tenant_id: tenantId,
          rule_set_id: rs.id,
          entity_id: entityId,
          assignment_type: 'direct',
          metadata: {},
        });
      }
    }
  }

  if (newAssignments.length > 0) {
    const INSERT_BATCH = 5000;
    for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
      const slice = newAssignments.slice(i, i + INSERT_BATCH);
      await supabase.from('rule_set_assignments').insert(slice);
    }
    addLog(`HF-301: Created ${newAssignments.length} assignments (period-scoped)`);
  }
}
```

**Verify:** `dataByEntity` is the Map populated by OB-183's grouping loop. Confirm its keys are entity UUIDs (not external_ids). If the variable name differs, read the code and use the correct one. The keys must be the UUID from `extIdToUuid.get()`, not the raw external_id string.

### Edit 3: Remove convergence from calc hot path

Find the convergence block. It will look like:
```typescript
// OB-160G convergence
try {
  const allRuleSets = ...
  for (const rs of allRuleSets) {
    const result = await convergeBindings(...);
    // ...
  }
  convergenceReport = { ... };
} catch (convErr) {
  console.error('[SCI Execute] Post-execute convergence failed (non-blocking):', convErr);
}
```

**Action:** Wrap the entire convergence block in a check: skip if `input_bindings` already exist on the rule_set being calculated.

```typescript
// HF-301: Skip convergence if bindings already derived (not first calc)
const currentBindings = ruleSet.input_bindings as Record<string, unknown> | null;
const hasExistingBindings = currentBindings && 
  Object.keys(currentBindings).length > 0 && 
  currentBindings.metric_mappings;

if (!hasExistingBindings) {
  addLog('HF-301: First calc — running convergence for this rule_set only');
  // Run convergence for THIS rule_set only, not all rule_sets
  try {
    const result = await convergeBindings(tenantId, ruleSetId, supabase);
    // ... (existing single-rule_set convergence logic)
  } catch (convErr) {
    console.error('[CalcAPI] Convergence failed (non-blocking):', convErr);
  }
} else {
  addLog('HF-301: Convergence bindings exist — skipping re-derivation');
}
```

**Key change:** converge only the REQUESTED rule_set (the one being calculated), not ALL rule_sets. And skip entirely if bindings already exist.

---

## §3 — WHAT NOT TO TOUCH

- `execute-bulk/route.ts` — import pipeline, not in scope
- `execute/route.ts` — Route A, used by BCL/Meridian/CRP
- `entity-resolution.ts` — the HF-109 function itself is fine; we're removing its CALL from the calc route, not changing the function
- `finalize-import` endpoint — HF-300's addition; leave in place (it may be useful for non-calc data prep later)
- Schema — no migrations
- Plan interpretation — not in scope

---

## §4 — BUILD + VERIFY

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git checkout -b hf-301-calc-route-period-scoped
# Make the three edits
npm run build  # must exit 0
```

After build, run a local sanity check:
```bash
grep -n "resolveEntitiesFromCommittedData" web/src/app/api/calculation/run/route.ts
# Should show only the commented-out block and the HF-301 log line
grep -n "HF-301" web/src/app/api/calculation/run/route.ts
# Should show three markers (Edits 1, 2, 3)
```

---

## §5 — COMPLETION REPORT (MANDATORY)

Commit `docs/completion-reports/HF-301_COMPLETION_REPORT.md` BEFORE opening the PR. Must contain:

1. The assigned number and how it was verified against the ledger.
2. Edit 1: pasted diff showing HF-109 call removed, OB-183 loop confirmed present.
3. Edit 2: pasted diff showing period-scoped assignment creation, the variable used for period entity IDs, and confirmation it contains UUIDs.
4. Edit 3: pasted diff showing convergence gated on existing bindings, scoped to single rule_set.
5. Build exit-0 evidence.
6. Scope fence: what was NOT touched (import pipeline, Route A, schema, entity-resolution.ts, plan interpretation).

Then `gh pr create --base main --head hf-301-calc-route-period-scoped` with title "HF-301: Remove whole-tenant scans from calc route (period-scoped self-heal)" and body referencing AUD-006.

State PR number and HEAD SHA.

---

## §6 — PROOF GATE (architect, SR-44, after production deploy verified)

- [ ] Verify production SHA contains HF-301 commit.
- [ ] MIR: Calculate January 2025 on PLAN DE COMISIONES POR VENTA MAYORISTA → returns results within 300s (not timeout).
- [ ] MIR: Calculate January 2025 on each of the other 4 plans → returns results.
- [ ] MIR: DB query — `rule_set_assignments` now has non-zero rows for entities that appeared in January data.
- [ ] BCL: Calculate October 2024 → still returns $44,590 (regression check).
- [ ] Meridian: Calculate Q1 → still returns results (regression check).
- [ ] CRP: Plans 1+3 still PASS at $364,457.84 (regression check).

---

*HF-301 · Remove Whole-Tenant Scans from Calc Route · 2026-06-17*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
