# HF-196 Phase 1D — data_type Surface Reconstruction (D154/D155 Compliance)

# Classification: HF Phase extension (1D within HF-196)
# Author: Architect-drafted via Claude
# Date: 2026-05-02
# Branch: hf-196-platform-restoration-vertical-slice (continuation)

---

## SUBSTRATE GROUNDING (READ FIRST)

This phase is governed by Decisions 154 and 155 (LOCKED 2026-04-27). Every decision in this phase derives from these obligations:

**Decision 154 (verbatim):**
> "Structural primitives — calculation operations, intent shapes, dispatch operands — shall exist in exactly ONE canonical declaration. Every boundary that names, dispatches on, validates, or documents these primitives shall derive from that declaration without maintaining a private copy. Every primitive recognized at any boundary shall be recognizable at every boundary it traverses. Every dispatch boundary shall produce observable, named, structured failure on unrecognized identifiers — never silent fallback."

**Decision 155 (verbatim):**
> "The canonical declaration of structural primitives required by Decision 154 is a SURFACE (registry), not a string. The surface admits per-domain declaration entries. The surface enforces uniqueness, structural validity, and Korean Test compliance across all entries. Every boundary that names, dispatches on, validates, or documents structural primitives derives from the surface — not from any private copy."

**Application to data_type:**

`data_type` is a structural primitive — it identifies the structural class of a committed_data row (entity / transaction / target / reference / plan). The current platform violates D154 because:

1. `normalizeFileNameToDataType` exists as a **private copy in 4 places** (commit/route.ts:56, execute/route.ts:44, execute-bulk/route.ts:44, intelligence/wire/route.ts:33) — direct D154 violation
2. SCI's `informational_label` IS the canonical structural class (already produced by SCI agent classification) — but `data_type` derivation does not consume it
3. `processDataUnit` (execute-bulk:667-675) **does not produce `informational_label` at all** — boundary inconsistency, D155 violation
4. Engine reads literal `data_type` string from committed_data — current per-filename stems mean engine has no canonical handle for cross-month transaction aggregation

**The reconstruction obligation:**

The SCI agent's classification (`informational_label`) IS the single canonical surface. `data_type` derives from `informational_label` via identity (`data_type === informational_label`) — not via translation, not via filename stems, not via private copies. Every import path consumes the SCI classification; every boundary recognizes the same structural classes; engine reads the canonical surface.

**Identity not translation:** `informational_label` carries `'entity' | 'transaction' | 'target' | 'reference' | 'plan'`. `data_type` becomes the same value. No mapping table. No structural-noun translation. The simpler architecture is more substrate-aligned per D154's "single canonical declaration."

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation. Execute every sub-phase sequentially through commit + push without architect intervention. HALT only on the explicit Critical HALT Conditions below.

## CRITICAL HALT CONDITIONS (architect-disposition required)

CC HALTs and surfaces ONLY when:
1. **Engine consumption audit (1D-1.5) reveals tenant-specific or domain-specific literals** in engine matching (Korean Test violation requiring scope expansion)
2. **Build fails** AND root cause is structural defect not solvable by code-level fix within scope
3. **Korean Test build gate fails** AND violation cannot be remediated within scope
4. **Substrate-extending architectural decision required** that was not pre-authorized
5. **Tenant data integrity risk** outside explicitly-authorized scope

ALL OTHER ISSUES: CC resolves structurally and continues. No "shall I proceed" stops.

---

## RECUSAL GATE
**PASS.** This phase amends VP code surfaces. Does not amend IRA-governing substrate.

## ARCHITECT APPROVAL GATE
**PASS.** Architect approved (this conversation, 2026-05-02):
- `data_type = informational_label` (identity, not translation)
- All 4 import paths fixed (A.3 — D154 mandate)
- Clean cutover, no tolerance window (D154 + Scale by Design)
- `processDataUnit` adds `informational_label` (D155 boundary parity)
- Engine consumption audit before engine adjustment

---

## CC FAILURE PATTERNS TO PREVENT (this phase)

| # | Pattern | Prevention |
|---|---|---|
| FP-49 | Schema fabrication | Schema queries via tsx-script before any SQL |
| Recurrence | "Apply pattern from history without reading history" | This phase: D154/D155 locked April 27 — read substrate-grounding above; do not invent vocabulary |
| Korean Test | Adding tenant/domain literals | Identity mapping (`data_type = informational_label`) is substrate-aligned; no string literals beyond SCI's existing 5 classes |
| Bypass | Patching one path while leaving others | A.3 is mandated by D154; all 4 paths converge in this commit |
| Architect-as-courier | CC interpreting ambiguous output | CC reports structural facts; architect interprets values |

---

## INVARIANTS

- **D154 single canonical declaration.** SCI classification is the canonical surface. All boundaries derive from it.
- **D155 federated entries on single surface.** SCI classification surface admits 5 entries (entity / transaction / target / reference / plan). No additional entries introduced in this phase.
- **Korean Test (T1-E910).** Identity preserves SCI's structural class names. Zero new literals.
- **Vertical Slice Rule.** All 4 paths + engine alignment in one commit. No partial ship.
- **Capability-first routing.** CC executes builds, greps, reads, commits. No SQL Editor work in this phase.

---

## PHASE 1D-1: ENGINE CONSUMPTION AUDIT (READ-ONLY)

### 1D-1.1 — Locate all engine reads of data_type
```bash
cd ~/spm-platform/web
grep -rnE "row\.data_type|\.data_type ===|\.data_type ==|\.data_type\.includes|\.data_type\.match|findMatchingSheet" src/lib/calculation/ src/app/api/calculation/ src/lib/intelligence/ --include="*.ts" | head -50
```
Paste verbatim.

### 1D-1.2 — Locate SHEET_COMPONENT_PATTERNS
```bash
grep -rnA 30 "SHEET_COMPONENT_PATTERNS" src/ --include="*.ts" | head -100
```
Paste verbatim.

**Korean Test gate (1D-1.2):** if SHEET_COMPONENT_PATTERNS contains tenant-specific or domain-specific string literals (e.g., 'loan_disbursement', 'mortgage', 'equipment'): HALT (Critical HALT #1). Surface as Korean Test violation requiring separate audit (out of HF-196 scope; D154/D155 follow-on work item).

### 1D-1.3 — Locate informational_label readers
```bash
grep -rnE "informational_label" src/ --include="*.ts" | head -40
```
Paste verbatim. Identify which sites already read `informational_label`.

### 1D-1.4 — Synthesis (CC produces)

CC produces a synthesis table:

| Engine site | What it reads | Match pattern | Action |
|---|---|---|---|
| run-calculation.ts:N | row.data_type | exact-equality / substring / regex | (auto-derived) |
| run/route.ts:N | row.data_type | (pattern) | (action) |
| convergence-service.ts:N | sr.data_type | (pattern) | (action) |

For each engine site, classify:
- **A — already aligned:** reads `informational_label` OR reads `data_type` with pattern match that tolerates `'entity'/'transaction'/'target'/'reference'/'plan'` → no engine change needed
- **B — exact-string mismatch:** reads `data_type` with exact-string match against per-filename stems → engine adjustment needed
- **C — Korean Test concern:** reads with tenant/domain-specific literal → HALT (Critical HALT #1)

If any site classified C: HALT.
If sites classified B exist: engine adjustment in scope for 1D-7.
If all sites classified A: 1D-7 is no-op (no engine change).

CC pastes synthesis table verbatim. NO HALT for synthesis itself; CC continues to 1D-2 unless Critical HALT #1 fires.

---

## PHASE 1D-2: SHARED RESOLVER (D155 SURFACE)

Create `web/src/lib/sci/data-type-resolver.ts`:

```typescript
/**
 * HF-196 Phase 1D — Single canonical declaration of data_type per D154/D155.
 *
 * data_type is the structural class of a committed_data row, derived from
 * SCI's informational_label classification (single canonical surface).
 *
 * Per D154: every boundary derives from this resolver. Private copies prohibited.
 * Per D155: 5 federated entries (one per SCI agent classification).
 * Per Korean Test (T1-E910): identity preservation — no domain/tenant literals.
 */

export type SemanticDataType = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

export type SCIClassification = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

/**
 * Resolve data_type from SCI classification.
 *
 * Identity: data_type === informational_label (no translation).
 * The SCI agent's classification IS the canonical structural class per D154/D155.
 */
export function resolveDataTypeFromClassification(
  classification: SCIClassification
): SemanticDataType {
  // Exhaustiveness via discriminated union — TS compile-time guard
  switch (classification) {
    case 'entity':
      return 'entity';
    case 'transaction':
      return 'transaction';
    case 'target':
      return 'target';
    case 'reference':
      return 'reference';
    case 'plan':
      return 'plan';
    default: {
      // Compile-time exhaustiveness check (Rule 28 from HF-195)
      const _exhaustive: never = classification;
      throw new Error(`Unrecognized SCI classification: ${_exhaustive}`);
    }
  }
}
```

Commit identity-as-implementation explicitly. Do not introduce structural-noun translation (`'entity' → 'roster'`). The simpler shape is the substrate-aligned shape per D154 single canonical declaration.

**Build verification:**
```bash
cd web && npx tsc --noEmit src/lib/sci/data-type-resolver.ts 2>&1 | head -10
```
Must exit 0.

---

## PHASE 1D-3: WIRE ALL 4 IMPORT PATHS

For each of the 4 paths below, replace the `normalizeFileNameToDataType`-based derivation with `resolveDataTypeFromClassification(classification)`.

### 1D-3.1 — execute-bulk (3 sites: processEntityUnit, processDataUnit, processReferenceUnit)

File: `web/src/app/api/import/sci/execute-bulk/route.ts`

For each of the three processXUnit functions, locate the existing data_type derivation block (lines ~521-525, ~628-632, ~790) and replace with:

```typescript
import { resolveDataTypeFromClassification } from '@/lib/sci/data-type-resolver';
// ...
const dataType = resolveDataTypeFromClassification(classification);
```

The `classification` variable is already in scope at each site (used elsewhere). Verify scope before editing.

### 1D-3.2 — execute (plan path)

File: `web/src/app/api/import/sci/execute/route.ts`

Apply same replacement pattern at all data_type derivation sites.

### 1D-3.3 — commit/route.ts (HF-047 alternate path)

File: `web/src/app/api/import/commit/route.ts`

Apply same replacement at the data_type derivation site (line ~760+ resolveDataType priority chain).

### 1D-3.4 — intelligence/wire/route.ts

File: `web/src/app/api/intelligence/wire/route.ts`

Investigate site purpose first:
```bash
grep -nA 20 "normalizeFileNameToDataType\|data_type" src/app/api/intelligence/wire/route.ts | head -40
```
Paste output.

If site is a primary import path: apply same replacement.
If site is a re-classification/migration utility: surface for architect disposition (do not auto-replace; this is Critical HALT #4 territory).

### 1D-3.5 — Verify all 4 paths converged
```bash
grep -rn "resolveDataTypeFromClassification" src/ --include="*.ts"
```
Expected: 1 definition site + 4-6 caller sites (depending on how many derivation sites per path). Paste output.

```bash
grep -rn "normalizeFileNameToDataType" src/ --include="*.ts"
```
Expected: zero matches in data_type derivation contexts. Function still exists (1D-6 repurposes it for hashing); call sites that legitimately use it for hashing remain. Paste output.

---

## PHASE 1D-4: PROCESSDATAUNIT INFORMATIONAL_LABEL PARITY (D155)

File: `web/src/app/api/import/sci/execute-bulk/route.ts`

In `processDataUnit` (the metadata block at ~667-675), add `informational_label: classification`:

```typescript
metadata: {
  source: 'sci-bulk',
  proposalId,
  semantic_roles,
  resolved_data_type,
  entity_id_field,
  informational_label: classification,  // HF-196 Phase 1D — D155 boundary parity
  field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
}
```

Verify parity:
```bash
grep -nE "informational_label" src/app/api/import/sci/execute-bulk/route.ts
```
Expected: 3 matches (processEntityUnit, processDataUnit, processReferenceUnit). Paste output.

---

## PHASE 1D-5: ENGINE CONSUMPTION ALIGNMENT (CONDITIONAL ON 1D-1.4)

If 1D-1.4 synthesis classified any engine site as B (exact-string mismatch):

For each site, adjust to read either `informational_label` directly OR `data_type` (which now equals `informational_label` by construction post 1D-3).

If 1D-1.4 synthesis classified all engine sites as A (already aligned): 1D-5 is no-op. Document and continue.

CC pastes per-site changes.

---

## PHASE 1D-6: REPURPOSE NORMALIZEFILENAMETODATATYPE

The function `normalizeFileNameToDataType` is no longer used for `data_type` derivation. It may still have legitimate uses for filename hashing/deduplication detection.

### 1D-6.1 — Inventory remaining call sites
```bash
grep -rn "normalizeFileNameToDataType" src/ --include="*.ts"
```
Paste output.

### 1D-6.2 — For each remaining call site, classify use:
- **Hashing/dedup:** legitimate; rename to clarify intent (e.g., `normalizeFileNameForHashing` or `hashFileNameStem`)
- **Stale (no actual use post 1D-3):** delete the call site

### 1D-6.3 — Apply rename + delete unused
- Rename function definition (preserve hashing logic if any uses remain)
- Update remaining legitimate call sites to use new name
- Delete unused call sites

### 1D-6.4 — Verify
```bash
grep -rn "normalizeFileNameToDataType\|normalizeFileNameForHashing\|hashFileNameStem" src/ --include="*.ts"
```
Paste output. Confirm clean state.

---

## PHASE 1D-7: BUILD + KOREAN TEST GATE

```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste last 30 lines.

```bash
bash scripts/verify-korean-test.sh
```
Must PASS. Paste output.

If either fails: HALT (Critical HALT #2 or #3).

---

## PHASE 1D-8: SELF-TEST AGAINST CURRENT BCL STATE (READ-ONLY DIAGNOSTIC)

Write `web/scripts/diag-hf196-phase1d-verification.ts` (one-shot, do NOT commit):

```typescript
import { createClient } from '@supabase/supabase-js';
import { resolveDataTypeFromClassification } from '../src/lib/sci/data-type-resolver';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Sample current rows
const { data: rows } = await sb
  .from('committed_data')
  .select('id, data_type, metadata')
  .eq('tenant_id', tenantId)
  .limit(20);

console.log('Current state:');
const distinctTypes = new Set(rows!.map(r => r.data_type));
console.log('  distinct data_type values (current, per-filename stems):', Array.from(distinctTypes));

console.log('\nPost-Phase-1D state (would produce on re-import):');
const distinctClassifications = new Set(rows!.map(r => (r.metadata as any)?.informational_label).filter(Boolean));
console.log('  distinct informational_label values:', Array.from(distinctClassifications));
console.log('  expected distinct data_type values post Phase 5-RESET-3:');
for (const cls of distinctClassifications) {
  if (cls) console.log(`    - ${resolveDataTypeFromClassification(cls as any)}`);
}
```

Run; paste output; delete script.

Expected: current shows 5 distinct per-filename data_type values; post-Phase-1D would show ≤2 (entity, transaction).

---

## PHASE 1D-9: COMMIT

```bash
cd ~/spm-platform
git add -A
git status   # paste verbatim — confirm changeset matches expected scope
git commit -m "HF-196 Phase 1D: data_type surface reconstruction per D154/D155 — single canonical declaration via SCI informational_label; 4 import paths converged on shared resolver; processDataUnit boundary parity; normalizeFileNameToDataType repurposed for hashing only"
git push origin hf-196-platform-restoration-vertical-slice
```

Paste commit SHA + push confirmation.

---

## PHASE 5-RESET-3 PROTOCOL (after 1D-9)

CC restarts dev server with Phase 1D code (per CC_STANDING_ARCHITECTURE_RULES Rule 1):
```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```
Paste outputs.

HALT — surface to architect:
- Dev rebuilt with Phase 1D code
- Branch HEAD at Phase 1D commit
- Awaiting architect signals:
  1. "wipe applied" — BCL clean-slate via Supabase Dashboard SQL Editor (entities included)
  2. "5B re-4 done" — roster + 4 transactions (Oct/Nov/Dic/Ene 2026) re-imported via http://localhost:3000

On both signals: CC re-runs Phase 5B verification + cumulative Phase 5C verification (Oct/Nov/Dic/Ene).

**PASS criteria (revised post 1D):**
- distinct_entity_ids = 85 (Phase 1B holds)
- roster band: distinct_source_dates = 0 (Phase 1C holds)
- transaction bands: distinct_source_dates per band correct (Oct=2025-10-01 etc.)
- **data_type values are SCI classifications: 'entity' for roster rows, 'transaction' for all 4 monthly transaction files (single canonical value across all 4)**
- Post 4-month re-import: distinct data_type values = 2 (entity, transaction) — NOT 5 per-filename stems

After Phase 5-RESET-3 PASS, Phase 5C resumes from step 5 of 6 (Feb 2026 transaction).

---

## OUT-OF-SCOPE FINDINGS (LOG; DO NOT FIX IN HF-196)

CC surfaces these for architect awareness as separate work items post HF-196:

1. **SHEET_COMPONENT_PATTERNS audit** — if 1D-1.2 surfaced any structure that may carry domain literals, full audit needed as separate Korean Test compliance work
2. **Mid-period entity attribute changes** — entities.temporal_attributes array exists; engine doesn't yet read it; CRP files 04+06 will require this; separate OB
3. **Pattern recurrence** — fourth "fix existed in history; regressed; re-applied" defect in HF-196 (HF-186, HF-110, April 1 source_date EFG, OB-119). Architect-side standing rule candidate: substrate-extending observation for ICA capture

---

## END OF DIRECTIVE

CC executes 1D-1 through 5-RESET-3 protocol sequentially without architect intervention except where Critical HALT Conditions fire. After 5-RESET-3 sets up architect signal wait, architect provides wipe + re-import signals. Phase 5C resumes from step 5/6 against semantic data_type post-PASS.
