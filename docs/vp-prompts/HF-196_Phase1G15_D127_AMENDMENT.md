# Phase 1G-15 Amendment — Decision 127 Structural Adoption

**Appends to `HF-196_Phase1G_PathAlpha_DIRECTIVE.md` after §14.**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: post-Phase-1G-14 commits + Phase 5-RESET-8 itemized TSV commits).
**Disposition:** Approach 4 (full structural adoption) confirmed 2026-05-03. HF-196 absorbs.
**Substrate:** Decision 127 LOCKED 2026-03-16 (`[min, max)` half-open intervals throughout); SR-34 (no bypass); Adjacent-Arm Drift discipline (close defect class at construction layer, not pattern-detection at resolver).

---

## 15.0 Defect grounding

**Surface (Phase 5-RESET-8 reconciliation):** entity-level reconciliation against `BCL_Resultados_Esperados.xlsx` Detalle revealed 4 entity-component mismatches across 6 months × 85 entities × 4 components (2,040 cells). All 4 mismatches concentrated in C1 Colocación de Crédito (`bounded_lookup_2d`); each calculates `C1 = 0` when ground truth expects positive amount.

**Forensic chain (CC-localized):**

1. AI plan interpreter persists `columnBoundaries` for c1_colocacion_credito_senior:
   - `[2] { min: 0.8, max: 0.899, maxInclusive: true, minInclusive: true }`
   - `[3] { min: 0.9, max: 0.949, maxInclusive: true, minInclusive: true }`
   - `[4] { min: 0.95, max: null, maxInclusive: true, minInclusive: true }`
2. Persisted boundaries form non-contiguous partition: gap between `boundary[2].max=0.899` and `boundary[3].min=0.9` (also between 0.949 and 0.95).
3. Source `Indice_Calidad_Cartera` for 4 entity-periods: 0.8992, 0.8994, 0.8996, 0.9491 — all values fall in gap regions.
4. `findBoundaryIndex` at `intent-executor.ts:165-191` iterates boundaries; for gap-falling values, no boundary's `[min, max]` contains the value; returns `-1`.
5. OB-169 `.999` snap heuristic at lines 175-185 detects `frac > 0 && (1 - frac) < 0.01 && effectiveInclusive` — fires for `.999` ceiling-of-integer pattern only. Frac `0.899` → (1-0.899)=0.101 > 0.01 → no snap. Frac `0.949` → (1-0.949)=0.051 > 0.01 → no snap.
6. `executeBoundedLookup2D` at lines 239-246: `colIdx < 0` → `outputValue: 0` regardless of `rowBoundaryMatched`.

**Empirical confirmation (intentTraces from BCL-5071):** `columnBoundaryMatched: undefined`, `outputValue: 0`, `rowBoundaryMatched: { min: 100, max: 119.999, index: 4 }` (row matched correctly; column failed; output zero).

**Architectural defect — Decision 127 implementation gap:**

Decision 127 (LOCKED 2026-03-16): "All tier, matrix, and band resolution in the calculation engine uses half-open intervals: `[min, max)` — inclusive lower bound, exclusive upper bound. The final band in any sequence uses inclusive upper bound `[min, max]` to capture the ceiling."

OB-169 implementation: detect `.999` truncation pattern at integer ceilings; snap to ceiling on detection. Pattern-matching heuristic for one specific AI emission shape, not structural enforcement of half-open semantics.

`grep -rnE "Decision 127|D127|half-open|halfOpen" web/src/` → zero matches. Decision 127's locked semantic is not operatively present in code.

The decision was locked under empirical evidence of one specific defect (BCL-5052 at exact 80.0% boundary) without structural verification that the OB-169 implementation realizes the decision's stated semantic. The implementation gap shipped as compromise; remained latent until substrate evolution (matrix_lookup → bounded_lookup_2d migration) moved boundary representation onto a path the heuristic doesn't cover.

**Defect class — Adjacent-Arm Drift at boundary representation layer:** OB-169 closed the diagnosed instance (`.999` ceiling-of-integer pattern). Same structural defect class (boundary representation hygiene) re-emerged at `.X99` decimal-truncation pattern that AI emits when adapting to source data precision. Each future AI emission pattern (`.X9`, `.XX`, language-specific decimal conventions) produces same defect class until structural fix lands.

## 15.1 Architectural shape — Approach 4

Phase 1G-15 implements Decision 127's locked semantic structurally:

1. **Plan interpreter prompt (`anthropic-adapter.ts`)** instructs AI to emit half-open boundaries with `maxInclusive: false` consistently; explicit ceilings (e.g., `max: 0.95` not `max: 0.949`); last band's `max` is `null` (open-ended) or `maxInclusive: true` (capped). No `.999` truncation. No inclusive-on-both-ends except final band.

2. **Boundary canonicalization layer** at plan persistence walks `(b[i].max, b[i+1].min)` pairs; validates contiguous partition (`b[i].max === b[i+1].min`); rejects malformed boundaries with structured named error if recovery impossible; applies normalization where AI emission diverges from canonical form.

3. **`findBoundaryIndex` resolver** simplifies to pure half-open semantics: `value >= b.min && value < b.max` (or `value <= b.max` if last band). OB-169 `.999` snap heuristic removed as redundant.

4. **Existing rule_sets handled via Phase 5-RESET-9 BCL re-import.** Clean slate; fresh plan import through canonical interpreter; new rule_set has gap-free boundaries by construction.

Decision 127's locked semantic now structurally enforced. Adjacent-Arm Drift defect class closed at construction layer. Future AI emission patterns automatically covered (canonicalizer validates structural property; doesn't pattern-match shapes).

## 15.2 Phase 1G-15 sub-phases

### 15-1: Discovery probe — boundary surface inventory

```bash
cd ~/spm-platform

echo "=== Boundary type definition ==="
grep -nB 1 -A 15 "type Boundary|interface Boundary|export.*Boundary" web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/types.ts 2>&1 | head -30

echo "---"
echo "=== All consumers of Boundary type ==="
grep -rnE "Boundary\b|boundaries\b|maxInclusive|minInclusive" web/src/lib/calculation/ web/src/lib/intelligence/ web/src/lib/sci/ --include="*.ts" 2>&1 | head -40

echo "---"
echo "=== findBoundaryIndex full body (current state) ==="
sed -n '160,200p' web/src/lib/calculation/intent-executor.ts

echo "---"
echo "=== executeBoundedLookup1D + executeBoundedLookup2D — boundary consumption ==="
grep -nA 35 "function executeBoundedLookup" web/src/lib/calculation/intent-executor.ts | head -80

echo "---"
echo "=== Plan interpreter prompt — boundary directive (anthropic-adapter.ts) ==="
sed -n '420,470p' web/src/lib/intelligence/anthropic-adapter.ts

echo "---"
echo "=== bridgeAIToEngineFormat / convertComponent — plan persistence path ==="
grep -nE "bridgeAIToEngineFormat|convertComponent|persistRuleSet" web/src/lib/intelligence/ web/src/lib/sci/ --include="*.ts" 2>&1 | head -20

echo "---"
echo "=== OB-169 reference comment — current location verification ==="
grep -nE "OB-169|\.999 approximation|frac.*0\.01" web/src/lib/calculation/intent-executor.ts

echo "---"
echo "=== Existing test fixtures referencing inclusive-end boundaries ==="
grep -rnE "max.*999|maxInclusive.*true" web/src/ web/__tests__/ web/test/ --include="*.ts" --include="*.json" 2>&1 | head -20
```

Paste verbatim. Synthesis required:

1. `Boundary` type shape; `maxInclusive`/`minInclusive` field semantics
2. Full consumer inventory of `Boundary` (every code path that reads boundaries)
3. Plan persistence flow: where AI-emitted boundaries land in `rule_sets.components[].calculationIntent.{boundaries|rowBoundaries|columnBoundaries}` JSONB
4. Test fixtures dependency on legacy inclusive-end shape (informs migration scope)

If consumer surface beyond `findBoundaryIndex` surfaces (e.g., other resolvers, validators, display formatters), each must be evaluated for half-open compatibility.

### 15-2: Plan interpreter prompt amendment

Modify `web/src/lib/intelligence/anthropic-adapter.ts` boundary format directive (around lines 425-460 per CC's earlier probe):

**Pre-edit (current — inclusive-on-both-ends with .999 truncation):**
```
BOUNDARY FORMAT:
{ "min": number|null, "max": number|null, "minInclusive": true, "maxInclusive": true }
Use null for unbounded (no lower/upper limit). Both inclusive to match >= min AND <= max.
```

**Post-edit (Decision 127 half-open):**
```
BOUNDARY FORMAT (Decision 127 — half-open intervals):
{ "min": number|null, "max": number|null, "minInclusive": true, "maxInclusive": false }

Convention: half-open intervals [min, max). Inclusive lower bound; exclusive upper bound.
Each boundary's max equals the next boundary's min EXACTLY (contiguous partition; no gaps).
The FINAL boundary in any sequence uses one of:
  - max: null (open-ended; no upper limit)
  - maxInclusive: true (capped; includes the ceiling)

Worked example (correct half-open form):
"rowBoundaries": [
  { "min": 0,   "max": 70,   "minInclusive": true, "maxInclusive": false },
  { "min": 70,  "max": 80,   "minInclusive": true, "maxInclusive": false },
  { "min": 80,  "max": 90,   "minInclusive": true, "maxInclusive": false },
  { "min": 90,  "max": 100,  "minInclusive": true, "maxInclusive": false },
  { "min": 100, "max": 120,  "minInclusive": true, "maxInclusive": false },
  { "min": 120, "max": null, "minInclusive": true, "maxInclusive": true  }
]

DO NOT use .999 / .X99 / .X truncation patterns. Express "less than X" as max: X with maxInclusive: false.
DO NOT leave gaps between consecutive boundaries.
```

CC: read actual prompt structure; preserve adjacent prompt content (other directives, examples for non-boundary sections). Adjust example values to match BCL plan's actual percentage shapes if examples are tenant-specific.

### 15-3: Boundary canonicalization layer

Add new module `web/src/lib/calculation/boundary-canonicalizer.ts` (or equivalent location per CC's plan-persistence path discovery in 15-1).

```typescript
import type { Boundary } from './intent-executor';

/**
 * HF-196 Phase 1G-15 — Decision 127 structural enforcement.
 *
 * Canonicalizes AI-emitted boundary arrays into half-open partition form.
 * Validates contiguous partition; normalizes inclusive-end emissions to half-open;
 * rejects structurally malformed boundaries with named error.
 */

export class BoundaryCanonicalizationError extends Error {
  constructor(
    public readonly boundaryIndex: number,
    public readonly diagnosis: string,
    public readonly boundaries: readonly Boundary[],
  ) {
    super(`Boundary canonicalization failed at index ${boundaryIndex}: ${diagnosis}`);
    this.name = 'BoundaryCanonicalizationError';
  }
}

/**
 * Canonicalize a boundary array to half-open form per Decision 127.
 *
 * Pre-conditions:
 * - boundaries.length >= 1
 * - boundaries sorted ascending by min
 *
 * Post-conditions:
 * - For i < length - 1: boundaries[i].maxInclusive === false
 * - For i < length - 1: boundaries[i].max === boundaries[i+1].min
 * - boundaries[length - 1] either { max: null } or { maxInclusive: true }
 */
export function canonicalizeBoundaries(input: readonly Boundary[]): Boundary[] {
  if (!input || input.length === 0) {
    throw new BoundaryCanonicalizationError(-1, 'empty boundary array', input);
  }

  const sorted = [...input].sort((a, b) => {
    const aMin = a.min ?? -Infinity;
    const bMin = b.min ?? -Infinity;
    return aMin - bMin;
  });

  const canonical: Boundary[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = { ...sorted[i] };
    const isLast = i === sorted.length - 1;

    // Final boundary handling
    if (isLast) {
      // Acceptable shapes: { max: null } or { max: number, maxInclusive: true }
      if (current.max === null) {
        // Open-ended; canonical
        canonical.push(current);
        break;
      }
      if (current.maxInclusive !== true) {
        // Capped final must be inclusive
        current.maxInclusive = true;
      }
      canonical.push(current);
      break;
    }

    // Non-final boundary: must be half-open with max === next.min
    const next = sorted[i + 1];
    const nextMin = next.min;

    if (current.max === null) {
      throw new BoundaryCanonicalizationError(
        i,
        `non-final boundary has max: null (only the final boundary may be open-ended)`,
        input,
      );
    }
    if (nextMin === null) {
      throw new BoundaryCanonicalizationError(
        i + 1,
        `non-first boundary has min: null`,
        input,
      );
    }

    // Force half-open semantics
    current.maxInclusive = false;

    // Detect and close gap: if current.max < next.min, snap to next.min
    if (current.max < nextMin) {
      // Gap detected — close by snapping current.max to next.min
      // Tolerance check: gap must be small (e.g., <= 0.05 for percentage data; <= 1 for integer data)
      // Larger gaps suggest structurally malformed plan; reject
      const gap = nextMin - current.max;
      const scale = Math.max(Math.abs(current.max), Math.abs(nextMin), 1);
      const relativeGap = gap / scale;
      if (relativeGap > 0.05) {
        throw new BoundaryCanonicalizationError(
          i,
          `boundary gap too large to auto-close: max=${current.max}, next.min=${nextMin}, gap=${gap}`,
          input,
        );
      }
      current.max = nextMin;
    } else if (current.max > nextMin) {
      throw new BoundaryCanonicalizationError(
        i,
        `boundary overlap: max=${current.max} > next.min=${nextMin}`,
        input,
      );
    }
    // current.max === nextMin: already canonical

    canonical.push(current);
  }

  return canonical;
}

/**
 * Validate canonical form (post-canonicalization invariant check).
 * Throws if boundaries do not form a valid half-open partition.
 */
export function assertCanonicalBoundaries(boundaries: readonly Boundary[]): void {
  if (!boundaries || boundaries.length === 0) {
    throw new BoundaryCanonicalizationError(-1, 'empty boundary array', boundaries);
  }
  for (let i = 0; i < boundaries.length - 1; i++) {
    const b = boundaries[i];
    const next = boundaries[i + 1];
    if (b.max === null) {
      throw new BoundaryCanonicalizationError(i, 'non-final boundary has max: null', boundaries);
    }
    if (b.maxInclusive !== false) {
      throw new BoundaryCanonicalizationError(i, 'non-final boundary not half-open (maxInclusive should be false)', boundaries);
    }
    if (b.max !== next.min) {
      throw new BoundaryCanonicalizationError(i, `discontinuous partition: max=${b.max} !== next.min=${next.min}`, boundaries);
    }
  }
  // Final boundary check
  const last = boundaries[boundaries.length - 1];
  if (last.max !== null && last.maxInclusive !== true) {
    throw new BoundaryCanonicalizationError(boundaries.length - 1, 'capped final boundary must be maxInclusive: true', boundaries);
  }
}
```

**Integration into plan persistence path:**

CC identifies via 15-1 grep where AI-emitted boundaries flow into `rule_sets.components[].calculationIntent`. Likely at `bridgeAIToEngineFormat` or `convertComponent` in `web/src/lib/intelligence/`. At each persistence point where boundaries are assembled into the rule_set JSONB, invoke `canonicalizeBoundaries` before write.

Pseudocode:

```typescript
// In bridgeAIToEngineFormat (or equivalent persistence point)
import { canonicalizeBoundaries, assertCanonicalBoundaries } from '@/lib/calculation/boundary-canonicalizer';

// For 1D bounded lookup
if (intent.operation === 'bounded_lookup_1d') {
  intent.boundaries = canonicalizeBoundaries(intent.boundaries);
  assertCanonicalBoundaries(intent.boundaries);
}

// For 2D bounded lookup
if (intent.operation === 'bounded_lookup_2d') {
  intent.rowBoundaries = canonicalizeBoundaries(intent.rowBoundaries);
  intent.columnBoundaries = canonicalizeBoundaries(intent.columnBoundaries);
  assertCanonicalBoundaries(intent.rowBoundaries);
  assertCanonicalBoundaries(intent.columnBoundaries);
}
```

CC determines actual integration shape per 15-1 evidence. If multiple persistence paths exist, canonicalization runs at each (or at a single chokepoint upstream).

### 15-4: `findBoundaryIndex` simplification

Replace current body (`intent-executor.ts:165-191`) with pure half-open form:

```typescript
export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const isLast = i === boundaries.length - 1;

    const minOk = b.min === null
      ? true
      : (b.minInclusive !== false ? value >= b.min : value > b.min);

    let maxOk: boolean;
    if (b.max === null) {
      maxOk = true;
    } else if (isLast && b.maxInclusive === true) {
      // Final capped band: inclusive
      maxOk = value <= b.max;
    } else {
      // Half-open per Decision 127
      maxOk = value < b.max;
    }

    if (minOk && maxOk) return i;
  }
  return -1;
}
```

OB-169 `.999` snap heuristic removed (lines 175-185 in current code). Canonicalizer at plan persistence guarantees `Boundary` arrays reaching the resolver are in half-open form; resolver applies pure half-open comparison without pattern detection.

### 15-5: Build + Korean Test + synthetic boundary tests

```bash
cd ~/spm-platform/web && rm -rf .next && npm run build 2>&1 | tail -20
cd ~/spm-platform && bash scripts/verify-korean-test.sh 2>&1 | tail -10
```

Build EXIT 0; Korean Test PASS.

Synthetic verification:

```bash
cd ~/spm-platform/web
npx tsx -e "
import { canonicalizeBoundaries, assertCanonicalBoundaries, BoundaryCanonicalizationError } from './web/src/lib/calculation/boundary-canonicalizer.ts';

// Test 1: Inclusive-end .X99 input → canonicalized half-open (closes Phase 5-RESET-8 defect shape)
const malformed = [
  { min: 0,    max: 0.699, minInclusive: true, maxInclusive: true },
  { min: 0.7,  max: 0.799, minInclusive: true, maxInclusive: true },
  { min: 0.8,  max: 0.899, minInclusive: true, maxInclusive: true },
  { min: 0.9,  max: 0.949, minInclusive: true, maxInclusive: true },
  { min: 0.95, max: null,  minInclusive: true, maxInclusive: true },
];
const canonical = canonicalizeBoundaries(malformed);
console.log('Test 1 (close gap):', canonical[2].max === 0.9 ? 'PASS' : 'FAIL', canonical);

// Test 2: Already canonical → no-op
const goodForm = [
  { min: 0,   max: 0.7,  minInclusive: true, maxInclusive: false },
  { min: 0.7, max: 0.8,  minInclusive: true, maxInclusive: false },
  { min: 0.8, max: null, minInclusive: true, maxInclusive: true  },
];
const canonical2 = canonicalizeBoundaries(goodForm);
console.log('Test 2 (canonical no-op):', canonical2[0].max === 0.7 ? 'PASS' : 'FAIL');

// Test 3: Overlap → reject
try {
  canonicalizeBoundaries([
    { min: 0,   max: 0.8,  minInclusive: true, maxInclusive: false },
    { min: 0.7, max: 1.0,  minInclusive: true, maxInclusive: true  },
  ]);
  console.log('Test 3 (overlap reject): FAIL (should have thrown)');
} catch (e) {
  console.log('Test 3 (overlap reject):', e instanceof BoundaryCanonicalizationError ? 'PASS' : 'FAIL');
}

// Test 4: Gap too large to auto-close → reject
try {
  canonicalizeBoundaries([
    { min: 0,   max: 0.5,  minInclusive: true, maxInclusive: true },
    { min: 0.9, max: null, minInclusive: true, maxInclusive: true },
  ]);
  console.log('Test 4 (large gap reject): FAIL (should have thrown)');
} catch (e) {
  console.log('Test 4 (large gap reject):', e instanceof BoundaryCanonicalizationError ? 'PASS' : 'FAIL');
}

// Test 5: findBoundaryIndex on canonicalized boundaries closes Phase 5-RESET-8 defect
import { findBoundaryIndex } from './web/src/lib/calculation/intent-executor.ts';
const idx_8996 = findBoundaryIndex(canonical, 0.8996);
const idx_9491 = findBoundaryIndex(canonical, 0.9491);
console.log('Test 5a (0.8996 → boundary index):', idx_8996, idx_8996 === 2 ? 'PASS' : 'FAIL');
console.log('Test 5b (0.9491 → boundary index):', idx_9491, idx_9491 === 3 ? 'PASS' : 'FAIL');
" 2>&1
```

Expected: 5/5 PASS. If FAIL, surface specific test; HALT.

### 15-6: Commit + push

```bash
cd ~/spm-platform
git add web/src/lib/calculation/boundary-canonicalizer.ts \
        web/src/lib/calculation/intent-executor.ts \
        web/src/lib/intelligence/anthropic-adapter.ts
# Plus any plan-persistence integration files identified in 15-1

git status
git commit -m "HF-196 Phase 1G-15: Decision 127 structural adoption

— Plan interpreter prompt: half-open boundary directive ([min, max) with maxInclusive: false)
— Boundary canonicalization layer (boundary-canonicalizer.ts) at plan persistence
— findBoundaryIndex simplified to pure half-open semantics; OB-169 snap heuristic removed
— Adjacent-Arm Drift defect class structurally closed at boundary representation layer
— Decision 127 (LOCKED 2026-03-16) implementation now realizes locked semantic
— Closes 4 entity-component C1 mismatches surfaced by Phase 5-RESET-8 reconciliation"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Surface commit SHA + push confirmation.

### 15-7: Append Phase 1G-15 section to completion report

Add to `docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md`:

```markdown
## Phase 1G-15: Decision 127 Structural Adoption

### Defect grounding
- Phase 5-RESET-8 architect-channel reconciliation: 4 entity-component C1 mismatches across Nov 2025, Ene 2026, Mar 2026 (each calculates C1 = $0; ground truth expects positive)
- Forensic chain: AI-emitted boundaries with .X99 inclusive-end pattern produce non-contiguous partition; source values fall in gaps between consecutive boundaries; findBoundaryIndex returns -1; executeBoundedLookup2D returns 0
- Empirical: 4 entities with calidad_cartera ∈ {0.8992, 0.8994, 0.8996, 0.9491} fall in gaps between boundary[i].max=.X99 and boundary[i+1].min=.X+1

### Decision 127 implementation gap
- Decision 127 LOCKED 2026-03-16: half-open intervals [min, max) throughout; final band inclusive at max
- OB-169 (PR #243) implementation: pattern-detection heuristic for .999 truncation at integer ceilings only
- grep confirms: zero references to Decision 127 / half-open / halfOpen in code prior to Phase 1G-15
- Pattern-detection heuristic ships as compromise; remained latent until substrate evolution moved boundary representation onto path heuristic doesn't cover

### Architectural shape
- Plan interpreter prompt amended: emit half-open with maxInclusive: false; explicit ceilings; final band null or capped
- Boundary canonicalization layer (boundary-canonicalizer.ts): validates contiguous partition; normalizes malformed emissions; rejects structurally malformed boundaries with named error
- findBoundaryIndex simplified to pure half-open semantics
- OB-169 .999 snap heuristic removed as redundant
- Decision 127's locked semantic now structurally enforced; Adjacent-Arm Drift defect class closed at construction layer

### Verification
- Build: EXIT 0
- Korean Test: PASS
- Synthetic boundary tests: 5/5 PASS (close gap, canonical no-op, overlap reject, large gap reject, findBoundaryIndex on canonicalized boundaries returns correct index)
- Commit: <SHA>

### Substrate citations
- Decision 127 LOCKED 2026-03-16 (half-open interval convention) — implementation gap closed; locked semantic now operative
- Adjacent-Arm Drift defect-class discipline: close defect class at construction layer, not pattern-detection at resolver
- SR-34: no bypass; OB-169 heuristic deprecated as redundant rather than retained as defensive code
- Korean Test: half-open intervals are domain-agnostic mathematical convention; canonicalizer validates structural property (contiguous partition)
```

```bash
git add docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md
git commit -m "HF-196 Phase 1G-15 — Completion report append"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Surface commit SHA.

## 15.3 Phase 5-RESET-9 — BCL re-import + 6-month reconciliation

After 15-6 + 15-7 commits land, BCL re-import is required. Existing rule_set has gap-shape boundaries persisted from prior plan import; canonicalizer applies at plan persistence time, not retroactively to existing rule_sets. Fresh import produces canonical rule_set.

CC restarts dev server; surfaces signals:

```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build 2>&1 | tail -10
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```

Surface to architect:

> Phase 1G-15 commits landed: `<SHA>` + `<SHA>`. Dev rebuilt with Decision 127 structural adoption. Awaiting architect signals for Phase 5-RESET-9:
>
> 1. **"5-RESET-9 wipe applied"** — full BCL clean slate via Supabase Dashboard SQL Editor (10-table BEGIN/COMMIT including periods)
> 2. **"5-RESET-9 imports done"** — architect imports BCL_Plantilla_Personal + 6 monthly transactions + BCL_Plan_Comisiones_2025
> 3. **"5-RESET-9 periods+calc done"** — architect creates 6 periods (Oct 2025 → Mar 2026) via UI manual create + runs calc per period
> 4. **"5-RESET-9 reconcile complete"** — architect surfaces verdict for completion-report append

### On signal 1 (wipe applied)

CC verifies wipe via tsx-script (10-table count = 0 across BCL tenant_id).

### On signal 2 (imports done)

CC verifies:
- 7 import_batches operative
- Plan rule_set 1 active
- **Critical gate:** boundary canonicalization operative — verify rule_set's persisted boundaries are in canonical half-open form (no .X99 inclusive-end pattern; consecutive `max === next.min`):

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { assertCanonicalBoundaries } from './web/src/lib/calculation/boundary-canonicalizer.ts';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const { data: rs } = await sb.from('rule_sets').select('components').eq('tenant_id', tenantId).eq('status','active').limit(1);
const components = (rs?.[0]?.components ?? []) as any[];

for (const comp of components) {
  const intent = comp?.calculationIntent;
  if (!intent) continue;
  if (intent.operation === 'bounded_lookup_2d') {
    console.log(\`\${comp.id} rowBoundaries:\`, JSON.stringify(intent.rowBoundaries));
    console.log(\`\${comp.id} columnBoundaries:\`, JSON.stringify(intent.columnBoundaries));
    try {
      assertCanonicalBoundaries(intent.rowBoundaries);
      console.log(\`  rowBoundaries canonical: PASS\`);
    } catch (e: any) {
      console.log(\`  rowBoundaries canonical: FAIL — \${e.message}\`);
    }
    try {
      assertCanonicalBoundaries(intent.columnBoundaries);
      console.log(\`  columnBoundaries canonical: PASS\`);
    } catch (e: any) {
      console.log(\`  columnBoundaries canonical: FAIL — \${e.message}\`);
    }
  }
  if (intent.operation === 'bounded_lookup_1d') {
    console.log(\`\${comp.id} boundaries:\`, JSON.stringify(intent.boundaries));
    try {
      assertCanonicalBoundaries(intent.boundaries);
      console.log(\`  boundaries canonical: PASS\`);
    } catch (e: any) {
      console.log(\`  boundaries canonical: FAIL — \${e.message}\`);
    }
  }
}
" 2>&1
```

Expected: every bounded_lookup component's boundaries surface canonical PASS. If FAIL, canonicalizer didn't run at persistence; surface; HALT.

### On signal 3 (periods+calc done)

CC extracts itemized TSVs for all 6 periods to `docs/CC-artifacts/HF-196_Phase5RESET9_<period>_itemized.tsv`. Single batch script; single commit. Surface per-period totals + per-component sums for architect-channel reconciliation.

### On signal 4 (reconcile complete)

Architect performs entity-by-entity reconciliation against `BCL_Resultados_Esperados.xlsx` Detalle for all 6 months. Surfaces verdict (PASS-RECONCILED / FAIL-DELTA / FAIL-STRUCTURAL). CC appends architect-supplied verdict to Phase 1G-15 completion report; commits.

## 15.4 HF-196 closure

After Phase 5-RESET-9 reconcile signal 4 PASS-RECONCILED:

- Phase 1G architectural realignment complete (8 isSequential sites + α-1 pipeline reordering + HF-203 SCALE ANOMALY architectural inversion)
- Phase 1G-14: conditional_gate visitor pattern (metadata-extraction Adjacent-Arm Drift closed)
- Phase 1G-15: Decision 127 structural adoption (boundary representation Adjacent-Arm Drift closed)
- BCL 6-month reconciliation against ground truth: PASS-RECONCILED
- HF-196 architecturally complete

Surface to architect:

> HF-196 architecturally complete. PR #359 ready for Ready-for-Review transition. Reconciliation gate: PASS-RECONCILED across 6 periods × 4 components × 85 entities.

`gh pr edit 359 --draft=false` (architect or CC executes per Rule 30 / SR-44).

---

## End of Phase 1G-15 amendment.
