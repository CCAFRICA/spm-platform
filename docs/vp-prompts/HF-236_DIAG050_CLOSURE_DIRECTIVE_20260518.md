# HF-236 — DIAG-050 Closure: Persistence-Time Narrowing Prohibition + Materialization-Layer Drift Closure

**Date:** 2026-05-18
**Authority:** DIAG-050 IRA disposition (commit 06513d0, Option 6 IRA-innovated, rank 2 / combined-closure rank 1) + Wave 1 substrate amendments locked (T1-E902 v2, T1-E906 v2, T1-E910 v2, T2-E06 v2, new T2 content_unit_hash_sha256)
**Closes:** Layer 1 (analyze/route.ts roleMap registry) + Layer 3 (filterFieldsForPartialClaim row_data narrowing). Layer 2 closes structurally as a consequence of Layer 1.
**Branch:** `hf-236-diag050-closure`

---

## §0 — Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` binds. Vertical Slice (T2-E04), Korean Test (T1-E910 v2), Carry Everything (T1-E902 v2), HC Override Authority (T2-E06 v2). Single PR. Build + push after every phase.

---

## §1 — Problem

DIAG-050 traced binding lifecycle attrition: flywheel-replay path produces degraded HC inputs (8-entry roleMap fallback to 'unknown'), `analyzeSplit` decides PARTIAL where fresh-LLM decides FULL, `filterFieldsForPartialClaim` projects both bindings AND row_data to the agent's owned+shared subset. CRP transaction files: 11 source columns → 5 persisted columns. Plans 2/3/4 fail reconciliation because filter-bearing components have no column to filter against.

Option 6 (combined closure):
- **Layer 1** — eliminate the hardcoded roleMap. Force fresh-LLM emission when cached binding would produce `columnRole: 'unknown'`.
- **Layer 3** — separate claim scope from data scope. `filterFieldsForPartialClaim` filters bindings only; row_data persists unconditionally.

Layer 2 (analyzeSplit sensitivity) closes structurally: with Layer 1 closed, flywheel-replay produces native columnRoles, eliminating the divergence that caused incorrect PARTIAL classifications.

---

## §2 — Phase 0: Branch

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git checkout -b hf-236-diag050-closure
```

---

## §3 — Phase 1: Layer 3 — Remove row_data narrowing from filterFieldsForPartialClaim

Two call sites: `web/src/app/api/import/sci/execute-bulk/route.ts:265-293` and `web/src/app/api/import/sci/execute/route.ts:405-425`. Both have identical shape per DIAG-050.

Read the current function in both files. Modify each so the function returns the full rows (no projection) and only filters `confirmedBindings` to `Set(ownedFields ∪ sharedFields)`.

Current shape (execute-bulk:265-293):
```typescript
function filterFieldsForPartialClaim(
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return { unit, rows };
  }
  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);
  const filteredRows = rows.map(row => { /* project to allowedFields */ });
  const filteredBindings = unit.confirmedBindings.filter(b => allowedFields.has(b.sourceField));
  return { unit: { ...unit, confirmedBindings: filteredBindings }, rows: filteredRows };
}
```

New shape (both files):
```typescript
// HF-236: Per T1-E902 v2 + T2-E06 v2 (locked 2026-05-18), claim scope narrowing
// governs agent ownership semantics, not data persistence scope. row_data persists
// unconditionally; confirmedBindings narrow to the agent's semantic claim.
function filterFieldsForPartialClaim(
  unit: BulkContentUnit,  // or ContentUnitExecution for execute/route.ts
  rows: Record<string, unknown>[],
): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return { unit, rows };
  }
  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);
  const filteredBindings = unit.confirmedBindings.filter(b => allowedFields.has(b.sourceField));
  return { unit: { ...unit, confirmedBindings: filteredBindings }, rows };
}
```

Verify both files updated:
```bash
grep -n "filterFieldsForPartialClaim" web/src/app/api/import/sci/execute-bulk/route.ts web/src/app/api/import/sci/execute/route.ts
grep -A 20 "function filterFieldsForPartialClaim" web/src/app/api/import/sci/execute-bulk/route.ts
grep -A 20 "function filterFieldsForPartialClaim" web/src/app/api/import/sci/execute/route.ts
```

Both functions should show the new shape — no `filteredRows = rows.map(...)` block, `rows` returned unchanged.

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "BUILD: $?"
cd ~/spm-platform && git add -A && git commit -m "HF-236 Phase 1: Layer 3 — row_data persists unconditionally; PARTIAL narrows bindings only" && git push origin hf-236-diag050-closure
```

---

## §4 — Phase 2: Layer 1 — Replace roleMap with materialization-layer alignment

File: `web/src/app/api/import/sci/analyze/route.ts:161-199`.

Current behavior: flywheel-cached bindings injected via 8-entry `roleMap` semanticRole → columnRole; misses fall to `'unknown'`.

New behavior: when flywheel-cached binding's semanticRole has no native columnRole mapping (per Korean Test, no hardcoded registry), force fresh LLM re-emission for that sheet rather than injecting degraded HC. This is the Option 5 mechanism (re-emit when flywheel cache is insufficient) combined with Option 4's Layer 3 closure already shipped in Phase 1.

Implementation approach: detect cases where flywheel-cached bindings carry semanticRoles outside the LLM's native columnRole vocabulary. When detected, skip the flywheel injection for that sheet and let the existing fresh-LLM HC path run.

The LLM's native columnRole vocabulary is the union of values it emits in `HeaderInterpretation.columnRole` — currently {`identifier`, `name`, `temporal`, `measure`, `attribute`, `reference_key`}. Any cached semanticRole that does not have a 1:1 mapping in this set triggers re-emission.

Read the current analyze/route.ts:161-199 block. Replace the inline `roleMap` and fallback-to-`'unknown'` logic with:

```typescript
// HF-236: Per T1-E910 v2 (locked 2026-05-18), no hardcoded role registries in
// foundational code. When flywheel-cached binding's semanticRole has no native
// columnRole mapping (i.e., would require a hardcoded translation registry),
// skip the flywheel injection for this sheet and let fresh-LLM HC run.
// This forces materialization-layer alignment between fresh-LLM and flywheel paths.

for (const sheet of file.sheets) {
  const flywheelResult = sheetFlywheelResults.get(sheet.sheetName);
  if (!sheetSkipHC(sheet.sheetName) || !flywheelResult?.classificationResult) continue;

  const flywheelBindings = (flywheelResult.classificationResult as Record<string, unknown>)?.fieldBindings as Array<{
    sourceField: string;
    semanticRole: string;
    confidence: number;
    displayContext?: string;
    columnRole?: string;  // HF-236: bindings now carry native columnRole when cached from fresh-LLM
  }> | undefined;
  if (!flywheelBindings || flywheelBindings.length === 0) continue;

  // HF-236: Verify every cached binding carries native columnRole. If any binding
  // lacks columnRole or carries a value outside the LLM's native vocabulary,
  // skip injection and force fresh-LLM re-emission for this sheet.
  const NATIVE_COLUMN_ROLES = new Set(['identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key']);
  const allBindingsHaveNativeRole = flywheelBindings.every(fb =>
    fb.columnRole && NATIVE_COLUMN_ROLES.has(fb.columnRole)
  );

  if (!allBindingsHaveNativeRole) {
    console.log(`[SCI-FINGERPRINT] HF-236: flywheel bindings for ${sheet.sheetName} carry non-native columnRoles — forcing fresh-LLM re-emission`);
    // Remove the sheet from skipHC set so fresh-LLM HC runs
    skipHCSet.delete(sheet.sheetName);  // adjust to actual variable name in scope
    continue;
  }

  const sheetProfile = profileMap.get(sheet.sheetName);
  if (!sheetProfile) continue;

  const interpretations = new Map<string, import('@/lib/sci/sci-types').HeaderInterpretation>();
  for (const fb of flywheelBindings) {
    interpretations.set(fb.sourceField, {
      columnName: fb.sourceField,
      semanticMeaning: fb.displayContext || fb.semanticRole,
      dataExpectation: '',
      columnRole: fb.columnRole as 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key',
      confidence: fb.confidence,
    });
  }
  sheetProfile.headerComprehension = {
    interpretations,
    crossSheetInsights: [],
    llmCallDuration: 0,
    llmModel: 'flywheel-tier1',
    fromVocabularyBinding: false,
  };
  console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${sheet.sheetName}`);
}
```

The `skipHCSet.delete(sheet.sheetName)` call must match the actual variable name in scope — read the surrounding code (lines 130-200) to identify the set/array that controls which sheets skip HC. Adjust accordingly.

Additionally, update the flywheel **write** path (in `execute/route.ts` around line 341 per DIAG-050 §6.3) to include `columnRole` in the cached `fieldBindings`. This ensures fresh-LLM emissions cache the native role so future Tier 1 replays carry the native value directly.

```bash
grep -n "fieldBindings: unit.confirmedBindings" web/src/app/api/import/sci/execute/route.ts
```

Locate the write site. Update to include columnRole derived from the unit's HC trace.

Build and commit:
```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "BUILD: $?"
cd ~/spm-platform && git add -A && git commit -m "HF-236 Phase 2: Layer 1 — materialization-layer alignment; roleMap registry eliminated" && git push origin hf-236-diag050-closure
```

---

## §5 — Phase 3: Flywheel cache invalidation for CRP

Per DIAG-050 §6.3: the CRP transaction fingerprint's flywheel cache currently carries 5 bindings (post-PARTIAL-filter). This must be cleared so the next CRP import runs fresh-LLM HC and caches native columnRoles.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb
    .from('classification_signals')
    .delete()
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('signal_type', 'flywheel')
    .select('id');
  console.log('Cleared CRP flywheel signals:', data?.length || 0, 'rows');
  if (error) console.error(error);
})();
"
```

Adjust table/column names if the actual schema differs (per VG/VP schema reference).

```bash
cd ~/spm-platform && git add -A && git commit -m "HF-236 Phase 3: CRP flywheel cache invalidated (poisoned by pre-fix PARTIAL filtering)" && git push origin hf-236-diag050-closure
```

---

## §6 — Phase 4: Build verification + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "FINAL BUILD: $?"
cd ~/spm-platform
gh pr create --base main --head hf-236-diag050-closure \
  --title "HF-236: DIAG-050 closure — persistence-time narrowing prohibition (Layer 1 + Layer 3 vertical slice)" \
  --body "Closes DIAG-050 per Option 6 (IRA-innovated, ff0f6c9 rank 2 / combined-closure rank 1).

Substrate basis: Wave 1 amendments locked 2026-05-18 — T1-E902 v2 (Carry Everything: persistence/round-trip/hints-not-gates), T1-E910 v2 (Korean Test: four identification classes), T2-E06 v2 (HC Override Authority: automated claim-type projection prohibited), plus new T2 content_unit_hash_sha256 entry.

Layer 1 (analyze/route.ts): roleMap registry eliminated. Cached bindings carrying semanticRoles outside the LLM's native columnRole vocabulary trigger fresh-LLM re-emission rather than degrading to columnRole='unknown'. Korean Test compliance restored.

Layer 3 (execute-bulk/route.ts + execute/route.ts filterFieldsForPartialClaim): row_data persists unconditionally; PARTIAL claim narrows confirmedBindings only. T1-E902 v2 compliance restored.

Layer 2 (analyzeSplit sensitivity): closes structurally — flywheel-replay now produces native columnRoles, eliminating the divergence that caused incorrect PARTIAL classifications.

Flywheel write path updated to cache native columnRole alongside semanticRole.

CRP flywheel cache invalidated to prevent poisoned-cache replay.

Verification: clean-slate CRP, re-import all four sales files, all 11 columns persist in row_data, Pass 4 categorical-filter derivation produces filters for Plans 2/3/4, reconciliation against \$566,728.97 pre-clawback."
```

Report PR URL. Halt for architect to clean-slate CRP and verify reconciliation.
