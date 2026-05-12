# HF-218 Phase 0 — OB-177 Decrement Loop Investigation

**Date:** 2026-05-12
**Branch:** `dev` (base commit `372149d0`)
**Outcome:** **Decrement write site NOT located in code. Component 3 takes implementation path (b).**

## Grep evidence

### p0a — structural_fingerprints update/decrement/0.20/0.92/-=

```
$ grep -rn "structural_fingerprints" web/src/ --include="*.ts" | grep -E "update|decrement|0\.20|0\.92|-="
(empty — zero matches; exit code 1)
```

### p0b — processEntityUnit

```
$ grep -rn "processEntityUnit" web/src/ --include="*.ts"
web/src/app/api/import/sci/execute-bulk/route.ts:318:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
web/src/app/api/import/sci/execute-bulk/route.ts:339:async function processEntityUnit(
web/src/app/api/import/sci/execute-bulk/route.ts:699:        // here while present at processEntityUnit/processReferenceUnit. Now uniformly
web/src/app/api/import/sci/execute-bulk/route.ts:769:  // Entity creation for roster imports still handled by processEntityUnit (separate path).
web/src/lib/sci/entity-resolution.ts:68:      // is the SCI agent's already-recorded choice (set by processEntityUnit/processDataUnit
web/src/lib/sci/entity-resolution.ts:313:  // for unchanged values). Per OB-177 pattern at processEntityUnit:461-509.
```

`processEntityUnit:461-509` (paste-traced):
```typescript
// OB-177: Enrich EXISTING entities — merge temporal_attributes (don't overwrite)
let enriched = 0;
for (const eid of allIds) {
  …
  // Merge: for each enrichment field, check if value changed
  …
}
```

CC note (verbatim, not classification): the OB-177 reference at `processEntityUnit:461-509` covers the **entity enrichment / temporal_attributes merge** pattern. Same OB-177 ticket as the fingerprint-flywheel.ts:54-55 decrement comment, but **a different code surface**. The OB-177 decrement-on-failure for `structural_fingerprints.confidence` is NOT located here.

### p0c — decreaseConfidence / decreaseFingerprint / demoteFingerprint

```
$ grep -rn "decreaseConfidence|decreaseFingerprint|demoteFingerprint" web/src/ --include="*.ts"
(empty — zero matches; exit code 1)
```

### p0d — confidence: ... -

```
$ grep -rn "confidence: .* - " web/src/lib/sci/ --include="*.ts"
(empty — zero matches; exit code 1)
```

### Cross-reference: all `structural_fingerprints` references in repo

```
web/src/app/api/import/sci/process-job/route.ts:118: // per-sheet caching operates at the structural_fingerprints flywheel layer
web/src/lib/sci/import-batch-supersession.ts:24:   Path B-prime FK retained
web/src/lib/sci/import-batch-supersession.ts:172:   Lineage link: structural_fingerprints.import_batch_id ← newBatchId
web/src/lib/sci/import-batch-supersession.ts:196:  .from('structural_fingerprints') — UPDATE for FK lineage backfill (not confidence)
web/src/lib/sci/fingerprint-flywheel.ts:45:  .from('structural_fingerprints') — SELECT for Tier 1 lookup
web/src/lib/sci/fingerprint-flywheel.ts:87:  .from('structural_fingerprints') — SELECT for Tier 2 (cross-tenant) lookup
web/src/lib/sci/fingerprint-flywheel.ts:141: .from('structural_fingerprints') — SELECT existence check
web/src/lib/sci/fingerprint-flywheel.ts:155: .from('structural_fingerprints') — UPDATE for increment (match_count + Bayesian confidence)
web/src/lib/sci/fingerprint-flywheel.ts:174: .from('structural_fingerprints') — INSERT new fingerprint (confidence 0.5)
```

All write operations on `structural_fingerprints` are:
- INSERT new fingerprint (confidence 0.5)
- UPDATE incrementing match_count + Bayesian increment of confidence
- UPDATE for FK lineage backfill (no confidence touch)

**No DECREMENT write site exists.**

## Decision

**Component 3 path (b) — implementation required.**

Per directive Component 3 spec, CC implements:
- New function `decrementFingerprintConfidence(tenantId, fingerprintHash, reason, supabaseUrl, supabaseServiceKey)` in `web/src/lib/sci/fingerprint-flywheel.ts`
- Caller from engine structural_exception path (Component 2) when failing binding traces to fingerprint cache hit
- Records `classification_signal` with `signal_type: 'flywheel:fingerprint_decrement'`
- Decrement formula per Phase 1 Architecture Decision Record Decision 2

The increment loop exists in code (fingerprint-flywheel.ts:152). After Phase 4, the decrement loop will exist in code at the same file/symmetric surface. Bidirectional flywheel completes.
