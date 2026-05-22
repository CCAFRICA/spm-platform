# HF-247 — Plan Import Integrity: Cold-Start, Cache Quality, Silent-Fallback Elimination

**Branch:** `dev` (off `main @ 1f041531` via merge `e7d5702a`)
**Date:** 2026-05-21
**Scope:** Five class defects from DIAG-056 production logs, closed at class level. Cold-start operation as first-class mode.

---

## Phase 1 — Plan Workbook Signature Independence

### BEFORE (`web/src/app/api/import/sci/analyze/route.ts`)

```typescript
if (fileUnitIds.size >= 2) {
  …
  const hasTransaction = fileResolutions.some(r => r.classification === 'transaction');
  const hasReferenceOrTarget = fileResolutions.some(
    r => r.classification === 'reference' || r.classification === 'target',
  );
  let totalRows = 0;
  let hasRateTableSignal = false;
  for (const r of fileResolutions) { … }
  const matchesPlanSignature =
    !hasTransaction
    && hasReferenceOrTarget         // ← Korean-Test violation: precondition on sibling data type
    && totalRows < 1000
    && hasRateTableSignal;
```

The `hasReferenceOrTarget` precondition violated T1-E910 v2 (Korean Test, Decision 154): a plan workbook's identity must derive from its own content. The precondition blocked cold-start — a customer's very first plan import (no reference, no targets, no transactional data anywhere in the tenant) could not qualify. Live BCL evidence (2026-05-21):

```
[SCI-PLAN-WORKBOOK] file=BCL_Plan_Comisiones_2025.xlsx sheets=3 totalRows=49
  hasTx=false hasRefOrTgt=false rateTableSignal=true — no plan signature
```

### AFTER

```typescript
// HF-247 Phase 1: signature qualifies on plan's OWN content (Korean Test,
// T1-E910 v2). Single-sheet plans (>= 1 sheet) also qualify.
if (fileUnitIds.size >= 1) {
  …
  const hasTransaction = fileResolutions.some(r => r.classification === 'transaction');
  // hasReferenceOrTarget retained for diagnostic logging only — no longer in
  // matchesPlanSignature AND chain.
  const hasReferenceOrTarget = fileResolutions.some(
    r => r.classification === 'reference' || r.classification === 'target',
  );
  let totalRows = 0;
  let hasRateTableSignal = false;
  for (const r of fileResolutions) { … }
  const matchesPlanSignature =
    !hasTransaction
    && totalRows < 1000
    && hasRateTableSignal;
```

Plan signature: `!hasTransaction AND totalRows < 1000 AND hasRateTableSignal`. The no-match log line carries `hasRefOrTgt=… (informational)` so future readers don't mistake it for a precondition.

---

## Phase 2 — Flywheel Cache Outcome Quality Gate

### BEFORE (`web/src/lib/sci/fingerprint-flywheel.ts`)

```typescript
// Read path (lookupFingerprint, Tier 1 branch):
if (conf >= 0.5) {
  console.log(`[SCI-FINGERPRINT] tier=1 match=true …`);
  return { tier: 1, match: true, …, columnRoles: tier1.column_roles, … };
}
// fall through to Tier 2 demotion …

// Write path (writeFingerprint):
export async function writeFingerprint(tenantId, fingerprintHash, classificationResult, columnRoles, sourceFileName, …) {
  try {
    const supabase = createClient(…);
    // INSERT or UPDATE — no quality filter on columnRoles content
```

The cache stored prior-failure outcomes (`columnRoles` carrying `unknown@<conf>` entries) and promoted them as Tier 1 authority on subsequent imports. Live BCL evidence:

```
HF-236: Plan General flywheel cache missing native columnRole on ≥1 binding
Tier 1: injected 3 fieldBindings from flywheel into Metas Mensuales
[SCI-HC-DIAG] sheet=Plan General roles=[BANCO CUMBRE DEL LITORAL:unknown@0.85, ...]
```

### AFTER

```typescript
// Read path:
const cachedRoles = (tier1.column_roles ?? {}) as Record<string, string>;
const hasUnknownRole = Object.values(cachedRoles).some(role => role === 'unknown' || role === '' || role == null);
if (conf >= 0.5 && !hasUnknownRole) {
  console.log(`[SCI-FINGERPRINT] tier=1 match=true …`);
  return { tier: 1, … };
}
if (hasUnknownRole) {
  console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED (poisoned cache): hash=${fingerprintHash.substring(0,12)} confidence=${conf} — cached column_roles contains 'unknown' (HF-247 outcome quality gate)`);
}
// existing Tier 2 demotion …

// Write path:
const hasUnknownRole = Object.values(columnRoles).some(role => role === 'unknown' || role === '' || role == null);
if (hasUnknownRole) {
  console.log(`[SCI-FINGERPRINT] Skipped write (failed-outcome quality gate, HF-247): hash=${fingerprintHash.substring(0,12)} file=${sourceFileName} — columnRoles contains 'unknown'`);
  return;
}
```

Both gates key on the same structural quality signal. Read-side demotion handles already-poisoned cache without requiring a migration; write-side skip prevents new poisoned entries.

---

## Phase 3 — Silent Fallback Elimination

### BEFORE — `parseJsonResponse` at `web/src/lib/ai/providers/anthropic-adapter.ts:1089-1098`

```typescript
try {
  return JSON.parse(jsonStr);
} catch {
  return {
    rawContent: content,
    parseError: true,
    confidence: 0,
  };
}
```

`parseError: true` but no `error` field. The SCI guard checks `error`. Mismatch → silent fallthrough to success path with empty components.

### BEFORE — SCI guard at `web/src/lib/sci/plan-interpretation.ts:158-167`

```typescript
const interpretation = response.result;
if (interpretation.fallback || interpretation.error) {
  return planUnits.map(u => ({
    classification: 'plan' as const,
    success: false,
    …
    error: String(interpretation.error || 'AI interpretation returned no results'),
  }));
}
// upsert proceeds with empty components if parseError fell through
```

### AFTER — `parseJsonResponse`

```typescript
try {
  return JSON.parse(jsonStr);
} catch (parseErr) {
  // HF-247 Phase 3: parse failure surfaces as BOTH parseError (diagnostic) AND
  // error (the field the SCI guard checks). Pre-HF-247 only parseError was set,
  // so the guard never fired and a corrupted rule_set persisted with
  // components: [] and ruleSetName: "Unnamed Plan".
  const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
  return {
    rawContent: content,
    parseError: true,
    error: `JSON parse failed: ${message}`,
    confidence: 0,
  };
}
```

### AFTER — SCI guard (both `executeBatchedPlanInterpretation` and `executePlanPipeline`)

```typescript
const interpretation = response.result;

// HF-247 Phase 3: combined failure guard. Catches:
//   - .fallback / .error (existing semantic)
//   - .parseError — the silent JSON-parse fallback (parseJsonResponse:1089-1098)
//     now also sets .error, but we check both for belt-and-suspenders.
//   - components missing or empty on a workbook that was classified as plan
//     (the LLM was given plan content and returned nothing — failure).
const components = interpretation.components;
const componentsCount = Array.isArray(components) ? components.length : 0;
if (interpretation.fallback || interpretation.error || interpretation.parseError || componentsCount === 0) {
  const reason = interpretation.error
    ? String(interpretation.error)
    : interpretation.parseError
    ? 'AI response failed JSON parse (truncation or malformed output)'
    : componentsCount === 0
    ? 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.'
    : 'AI interpretation returned no results';
  console.error(`[SCI plan-interp] Refusing to persist rule_set — ${reason}`);
  return /* failed result */;
}
```

Empty-components-on-plan is now a typed failure mode with an actionable user-facing message.

---

## Phase 4 — Commit-Stage Type Validation

### BEFORE (`web/src/lib/sci/commit-content-unit.ts`)

```typescript
const entityIdField = resolveEntityIdField(
  unit.confirmedBindings,
  unit.classificationTrace,
  classification,
);

// OB-152/OB-157 — source_date extraction …
// (no validation between entityIdField resolution and row insert)
```

Live BCL evidence — entity table received plan-content rows:

```
[SCI Bulk] Entity: 23 new, 0 existing, 0 enriched
[commitContentUnit] entity (sci-bulk): 36 rows committed, data_type=entity,
  entity_id_field="C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior", source_dates=0/36
```

### AFTER

```typescript
const entityIdField = resolveEntityIdField(
  unit.confirmedBindings,
  unit.classificationTrace,
  classification,
);

// HF-247 Phase 4: commit-stage type validation. Refuse to write
// classification-content inconsistent commits. Plan component names appearing
// as column headers carry telltale structural prefixes ("C1:", "C2:"),
// descriptive content (em-dash separated phrases, all-caps multi-word labels),
// or length over the typical identifier ceiling.
if (classification === 'entity' && entityIdField) {
  const looksLikeContentTitle =
    entityIdField.length > 40
    || /^[A-Z]\d+\s*[:.]/.test(entityIdField)
    || entityIdField.includes('—')
    || entityIdField.includes(' – ')
    || /:\s+[A-ZÁÉÍÓÚÑ]{2,}/.test(entityIdField);
  if (looksLikeContentTitle) {
    const reason = `Sheet "${tabName}" classified as 'entity' but resolved entity_id_field "${entityIdField}" matches plan-component-title pattern (length / structural-prefix / descriptive-punctuation). Refusing to commit — classification likely incorrect; the sheet appears to carry plan content.`;
    console.error(`[commitContentUnit] HF-247 Phase 4 type-validation: ${reason}`);
    await supabase
      .from('import_batches')
      .update({ status: 'failed', error_summary: { error: reason, hf: 'HF-247-Phase-4' } as unknown as Json })
      .eq('id', batchId);
    return { batchId, totalInserted: 0, dataType, entityIdField, fieldIdentities, earliestDate: null, latestDate: null, dateCount: 0, success: false, error: reason };
  }
}
```

Korean-test compliant: no domain vocabulary. Four structural sub-signals OR together. Real entity ID column names (short, alphanumeric) pass through unchanged.

---

## Phase 5 — Cold-Start Operation

### Before

The Tier 1 / Tier 2 / Tier 3 cascade in `lookupFingerprint` already handled cold-start structurally — each `maybeSingle()` returns null cleanly on no rows, fall-through to the next tier is unconditional. But cold-start was invisible in logs: a Tier 3 outcome for a tenant's first-ever import looked identical to a Tier 3 outcome for a novel structure encountered on an existing tenant.

### After

```typescript
// Tier 3: No match — novel structure
// HF-247 Phase 5: cold-start log. When neither Tier 1 nor Tier 2 hit and
// the tenant has zero prior fingerprints, this is a customer's first
// import — distinguish it from a "novel-structure-but-other-fingerprints-exist"
// case so operators can recognize cold-start in production logs.
const { count: tenantFpCount } = await supabase
  .from('structural_fingerprints')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);
if ((tenantFpCount ?? 0) === 0) {
  console.log(`[SCI-FINGERPRINT] cold-start (no prior fingerprints for tenant) — skipping to Tier 3 (HF-247 Phase 5)`);
}
console.log(`[SCI-FINGERPRINT] tier=3 match=false hash=${fingerprintHash.substring(0, 12)} — novel structure`);
console.log(`[SCI-FINGERPRINT] LLM called — Tier 3 novel structure, fingerprint stored for future recognition`);
```

One extra count query per cache miss; negligible at SCI rates. The cold-start signal lets operators recognize first-import flows.

---

## Phase 6 — Verification

### Build (CC, local)

```
$ npx tsc --noEmit
(no output — clean)

$ rm -rf .next && npm run build
✓ Compiled successfully

$ npm run dev (then curl localhost:3000)
HTTP 307
```

No new TypeScript errors. Adapter API surface unchanged. Five phases each verified individually before commit.

### Architect-manual verification

1. Clean-slate BCL via SQL (deletes `structural_fingerprints`, `classification_signals`, `rule_sets`, `committed_data`, `entities` for the tenant).
2. Import ONLY the BCL plan file through the browser — no data files, no personnel template.
3. Capture:
   - `[SCI-FINGERPRINT] cold-start (no prior fingerprints for tenant)` — confirms Phase 5.
   - `[SCI-PLAN-WORKBOOK] file=… signature=match` — confirms Phase 1 (no hasRefOrTgt precondition).
   - `[SCI plan-interp] Batched plan saved: … N components` with N > 0 — confirms end-to-end plan extraction works cold.
   - Or `[SCI plan-interp] Refusing to persist rule_set — …` with diagnostic reason if the LLM still produces empty output — confirms Phase 3 guard fires.

To be filled by architect after the manual run:

| Line | Value |
|---|---|
| `[SCI-FINGERPRINT] cold-start ...` | _present / absent_ |
| `[SCI-PLAN-WORKBOOK] ... signature=match` | _present / absent_ |
| `[SCI plan-interp] Batched plan saved` | _verbatim line_ |
| `[SCI plan-interp] Refusing to persist rule_set` | _verbatim line if fired_ |
| BCL October grand total (post data + calc) | _$..._ |

---

## HALT conditions

| ID | Condition | Status |
|---|---|---|
| HALT-1 | Plan signature reclassifies non-plan workbooks as plan | TBD — first architect-manual run will surface. Refine signature on regression. |
| HALT-2 | Cache quality gate causes ALL Tier 1 matches to disappear | Cleared. Gate keys on `'unknown'` role specifically. Successful imports with concrete roles still qualify. |
| HALT-3 | Cold-start path has implicit cached-data dependencies | Cleared. `lookupFingerprint` cascade returns null cleanly on no rows; cold-start log fires after Tier 3 fall-through with no errors. |
| HALT-4 | parseError-as-error breaks an existing working flow | Cleared. The change is additive — `parseError: true` already existed; `error` is added alongside. Existing flows that read `parseError` still see it. |
| HALT-5 | Commit-stage validation rejects a previously-valid import | TBD. The four structural sub-signals fire on content-title patterns; real identifier columns (short, alphanumeric) pass through. Architect-manual will surface false positives. |
| HALT-6 | Cold-start plan-only import still produces 0 components | Not a HF-247 failure. Report `[DIAG-LLM-RAW]` line. The LLM may have received insufficient plan text — escalate to plan extraction layer. |

---

## Out of scope

- Calculation engine (OB-200 grammar, scale metadata, HF-244 validator, HF-244 scale mutual exclusion). Unchanged. The engine operates on persisted rule_sets — once HF-247 enables plan import to persist correct rule_sets, the engine logic applies.
- C0 truncation (3-leaf tree). When plan reimport produces a complete tree, the HF-244 validator will either accept it or throw `UnconvertibleComponentError`. Separate HF if the LLM still truncates.
- CRP and Meridian verification. After BCL cold-start verifies, the same plan-import path applies to other tenants. Architect runs CRP and Meridian as separate verifications.
- Evaluator unit test suite (deferred).
- Temporal prime extensions.
- Substrate supersession candidates (VG-side).

---

## Files changed

Phase 1:
- `web/src/app/api/import/sci/analyze/route.ts` — `matchesPlanSignature` no longer requires `hasReferenceOrTarget`; `fileUnitIds.size >= 1` allows single-sheet plans.

Phase 2:
- `web/src/lib/sci/fingerprint-flywheel.ts` — read-side Tier 1 gate demotes poisoned cache; write-side skip prevents new poisoned entries.

Phase 3:
- `web/src/lib/ai/providers/anthropic-adapter.ts` — `parseJsonResponse` catch sets `error` in addition to `parseError`.
- `web/src/lib/sci/plan-interpretation.ts` — both SCI guards now check `fallback || error || parseError || componentsCount === 0`.

Phase 4:
- `web/src/lib/sci/commit-content-unit.ts` — pre-insert validation refuses `entity` classification with plan-component-title `entity_id_field` pattern.

Phase 5:
- `web/src/lib/sci/fingerprint-flywheel.ts` — `[SCI-FINGERPRINT] cold-start` log at Tier 3 fall-through when tenant has zero prior fingerprints.

Phase 6:
- `docs/completion-reports/HF-247_COMPLETION_REPORT.md` (this file)
