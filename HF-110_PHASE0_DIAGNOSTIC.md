# HF-110 Phase 0: Three Root Cause Diagnostic

## Root Cause A: field_identities NEVER stored

**Why:** `SCIExecution.tsx:236-248` builds `execUnit` but DOES NOT include `classificationTrace` from the proposal. The frontend has `proposalUnit.classificationTrace` (ContentUnitProposal line 321) but never passes it to the execute request.

**Effect:** In execute/route.ts, `unit.classificationTrace` is always undefined → `extractFieldIdentitiesFromTrace()` returns null → field_identities never written to committed_data metadata.

**Fix:** Pass `classificationTrace` from proposal to execute request, AND build field_identities from `confirmedBindings` (semantic_roles) as a guaranteed fallback.

## Root Cause B: Convergence components extraction

**Finding:** `extractComponents()` in convergence-service.ts (line 319-367) ALREADY handles variant structure via `cj.variants[0].components`. However, it does NOT handle the case where components is a direct array (no variants wrapper). This is a robustness issue but NOT the primary blocker — the current data uses variants.

**Actual blocker:** With field_identities absent (Root Cause A), convergence's structural matching (HF-109 Pass 2) finds no fieldIdentities on data capabilities → no structural candidates → 0 bindings.

## Root Cause C: Entity resolution wrong column

**Finding:** Entity resolution's semantic_roles fallback (entity-resolution.ts:79-114) exists but picks up entity_identifier columns from ALL batches — including reference/hub sheets that have different identifier columns. Result: 9 hubs from reference sheet + row indices from wrong column selection.

**Fix:** Prioritize entity-classified batches (informational_label = 'entity') for identifier discovery.

---

*HF-110 Phase 0 | March 9, 2026*
