# DIAG-010 FINDINGS: Flywheel Fingerprint Self-Correction Failure
## Date: March 19, 2026

## EXECUTIVE SUMMARY

The self-correction cycle is architecturally incomplete: after HF-145 correctly demotes a Tier 1 fingerprint below the confidence threshold, the code falls directly to Tier 3 (full LLM, novel structure treatment) instead of performing a targeted Tier 2-style re-classification using the existing record. This works functionally (correct classification produced) but at full LLM cost and with an uncontrolled confidence recovery. Two of the three reported bugs are not confirmed by database evidence.

## BUG 1: Tier 2 returns match=false for a known hash

### Evidence

`lookupFingerprint` in `fingerprint-flywheel.ts` lines 51-106:

```typescript
// Line 51-72: Tier 1 — checks confidence threshold
if (tier1 && tier1.classification_result && Object.keys(...).length > 0) {
  const conf = Number(tier1.confidence);
  if (conf >= 0.5) {
    return { tier: 1, ... };  // Tier 1 accepted
  }
  // Confidence below threshold — demote
  console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED to tier=2: ...`);
  // ← FALLS THROUGH — no return, no re-classification with existing data
}

// Line 74-93: Tier 2 — queries tenant_id IS NULL (cross-tenant foundational)
const { data: tier2 } = await supabase
  .from('structural_fingerprints')
  .select(...)
  .is('tenant_id', null)       // ← ONLY matches cross-tenant records
  .eq('fingerprint_hash', fingerprintHash)
  .maybeSingle();

// Line 95-106: Tier 3 — no match found
return { tier: 3, match: false, ... };
```

### Root Cause

**ARCHITECTURAL GAP, NOT A BUG.** Tier 2 queries `tenant_id IS NULL` — it searches for foundational (cross-tenant) patterns. BCL's fingerprint has `tenant_id = 'b1c2d3e4-...'` (tenant-specific). There are no foundational records in the database. Tier 2 correctly returns no match.

The issue is that after Tier 1 demotion, the code has NO path for "re-classify using the demoted record's data." It falls through from Tier 1 (tenant-specific, confidence < 0.5) to Tier 2 (cross-tenant, no record) to Tier 3 (novel structure). The existing record's data is not used for re-classification.

### Code Location
`web/src/lib/sci/fingerprint-flywheel.ts`, `lookupFingerprint`, lines 70-72 (fallthrough after demotion)

## BUG 2: Old fingerprint record deleted instead of updated

### Evidence

**NOT CONFIRMED by database evidence.** Current database state:
```
hash: fbead6eed137  match_count: 14  confidence: 0.9333
source: BCL_Datos_Oct2025.xlsx
created: 2026-03-18T01:12:12  updated: 2026-03-19T12:40:22
```

The old record EXISTS. It was updated (not deleted) after the March 19 import. `writeFingerprint` found the existing record by hash and updated it with incremented match_count and formula-computed confidence.

The prompt's evidence ("WHERE fingerprint_hash = 'fbead6eed137' → NO ROWS") may have been from a transient state during import, a query error, or a different database context.

### Root Cause
**Not applicable.** The record was not deleted. `writeFingerprint` correctly found and updated the existing record.

### Code Location
`web/src/lib/sci/fingerprint-flywheel.ts`, `writeFingerprint`, lines 129-159 (existing record update path)

## BUG 3: Hash instability — same structure produces different hashes

### Evidence

**NOT CONFIRMED.** Database shows 2 records for BCL:

| Hash (first 12) | File | match_count | confidence |
|------------------|------|-------------|------------|
| `fbead6eed137` | BCL_Datos_Oct2025.xlsx | 14 | 0.9333 |
| `a94f3b01211a` | BCL_Plantilla_Personal.xlsx | 1 | 0.5 |

These are TWO DIFFERENT file structures:
- Datos: 13 columns (ID_Empleado, Nombre_Completo, Sucursal, Periodo, Monto_Colocacion, Meta_Colocacion, etc.)
- Plantilla: 8 columns (ID_Empleado, Nombre_Completo, Sucursal_ID, Cargo, Nivel_Cargo, Fecha_Ingreso, ID_Gerente, Region)

Different columns → different hash. This is CORRECT behavior.

### Hash Stability Analysis

The hash composite includes:
```
cols:{count} | names:{sorted_lowercase_columns} | types:{type_per_column} | numRatio:{ratio} | idRepeat:{ratio}
```

- `names:` — sorted, lowercased column names. Deterministic for same structure.
- `types:` — derived from sample data values via `detectColumnType()`. Could vary if data content changes column type classification (e.g., a column that's numeric in October becomes text in November due to an "N/A" value).
- `idRepeat:` — bucketed to 1 decimal. Stable unless cardinality ratio changes by >0.05.

For BCL datos files: same 13 columns across all months, all with consistent data types. Hash IS stable: the old hash `fbead6eed137` from the first import (March 18) is the same hash used by today's import (March 19). Evidence: `writeFingerprint` found the existing record and updated it.

### Code Location
`web/src/lib/sci/structural-fingerprint.ts`, `computeFingerprintHashSync`, lines 128-168

## RELATIONSHIP BETWEEN BUGS

The three reported bugs are NOT independent. Only Bug 1 is real:

**Bug 1 (Tier 2 fallthrough) is an architectural gap.** After Tier 1 demotion, the code should provide a "re-classify using existing record" path. Instead, it falls to Tier 3 (full LLM), which happens to produce the correct result (ID_Empleado correctly identified as entity_identifier). Then `writeFingerprint` updates the existing record with the corrected classification AND bumps confidence above 0.5.

**Bugs 2 and 3 are not confirmed.** The old record exists and was updated. The hash is stable across imports of the same structure.

**The self-correction cycle DID work**, but via an unintended path:
1. HF-145 threshold demoted to Tier 2 ✓
2. Tier 2 found nothing (no cross-tenant records) → fell to Tier 3 ✗ (should have re-classified with existing data)
3. Tier 3 ran full LLM classification → correct result ✓ (wasteful but correct)
4. `writeFingerprint` updated existing record with corrected classification ✓
5. Confidence bumped to 0.9333 (match_count=14) → above threshold → Tier 1 restored ✓

**Result: Self-correction worked. Cost: full LLM call instead of targeted re-classification.**

## RECOMMENDED FIX APPROACH

**Structural fix: Add a "demoted Tier 1" re-classification path.**

In `lookupFingerprint`, after Tier 1 demotion (confidence < 0.5), instead of falling through to Tier 2 (cross-tenant), return the existing record's data with `tier: 2` and `match: true`. The caller (process-job) should then run targeted re-classification (HC only, no full LLM) using the existing column structure as context.

```typescript
// After Tier 1 confidence check fails:
if (conf < 0.5) {
  console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED to tier=2: ...`);
  // Return existing data as Tier 2 match — caller runs targeted re-classification
  return {
    tier: 2,
    match: true,
    fingerprintHash,
    classificationResult: tier1.classification_result,
    columnRoles: tier1.column_roles,
    confidence: conf,
    matchCount: tier1.match_count,
  };
}
```

This way:
- The caller knows it's a Tier 2 match (not Tier 1) → runs HC + CRR (not skip LLM)
- The existing record's column structure is available as context for re-classification
- The full Tier 3 LLM call is avoided
- `writeFingerprint` updates the existing record with corrected bindings
- Confidence recovers via the standard formula

**No schema change needed. Single function change in `lookupFingerprint`.**

## IMPACT ON DECISION CANDIDATES
- **Decision 135 (Leader-Follower Fingerprint):** Can proceed — hash is stable, cross-tenant (Tier 2) infrastructure exists
- **Decision 138 (Flywheel Self-Correction on Binding Failure):** Self-correction WORKS but via wasteful Tier 3 path. Fix above makes it efficient. Can lock AFTER fix verified.
