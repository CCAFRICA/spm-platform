# Phase 1G Path α §11.4 Amendment — α-1 Two-Phase Content-Profile Split

**Replaces §11.4 of `HF-196_Phase1G_PathAlpha_DIRECTIVE.md` (commit `64235c41` branch HEAD).**
**Disposition:** α-1 (architect-confirmed 2026-05-03).
**Substrate:** Decision 108 (LOCKED HC Override Authority Hierarchy), HF-095 Phase 2 stated intent ("HC-aware — uses HC columnRole when available, falls back to structural dataType detection"), Memory entry 30 (Progressive Performance / "Reconstruction restores what worked").

---

## 11.4 — α-1 Two-Phase Content-Profile Split (Pipeline Reordering)

The original §11.4 specified threading `hcRole?` parameter through `detectStructuralIdentifier`. CC's Phase 1G-1 synthesis surfaced (correctly) that this is signature-only — the active call sites at `content-profile.ts:459, 464, 461-inline` execute during Phase A profile generation, BEFORE HC runs, with `hcRole=undefined`. The HC-silence guard short-circuits to structural arms; defect remains operative.

α-1 closes the defect *architecturally* by restructuring the pipeline so HC runs between two content-profile phases:

**Phase A** — `generateContentProfileStats(rows, headers)` returns `ContentProfileStats` (fields, columnStats, distributions, sample data — pure deterministic statistics; NO pattern derivations like `hasEntityIdentifier` or `idField`).

**HC runs** — `headerComprehension(stats, ...)` uses Phase A stats as input; produces `HeaderInterpretation[]` with semantic roles per column.

**Phase B** — `generateContentProfilePatterns(stats, hcInterpretations)` returns `ContentProfilePatterns` (hasEntityIdentifier, idField, structuralNameField, identifierRepeatRatio, nonIdFields). Pattern detection consumes HC; structural arms gate on HC silence.

**Final profile** = `{ ...stats, patterns: ContentProfilePatterns }`.

Sites 3, 7, and the inline at line 461 are inside Phase B — they receive HC interpretations and gate appropriately. The pipeline-ordering inversion is closed; Decision 108 is operative architecturally.

### 11.4.1 — Read content-profile.ts current export shape

```bash
cd ~/spm-platform
echo "=== content-profile.ts exports + ContentProfile shape ==="
grep -nE "^export\s+(function|interface|type|const)" web/src/lib/sci/content-profile.ts 2>&1
echo "---"
echo "=== generateContentProfile signature + return shape ==="
grep -nE "function generateContentProfile|return\s+\{" web/src/lib/sci/content-profile.ts 2>&1 | head -10
echo "---"
echo "=== ContentProfile interface (current) ==="
sed -n '1,60p' web/src/lib/sci/content-profile.ts 2>&1 | head -80
echo "---"
echo "=== detectStructuralIdentifier function body + line 218 + line 217 ==="
sed -n '210,230p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"
echo "=== hasEntityIdentifier OR-fold + idField finder (~line 455-465) ==="
sed -n '450,470p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"
echo "=== generateContentProfile end-of-function + return (locate the return statement) ==="
grep -nE "function generateContentProfile|^}\s*$|return\s+\{" web/src/lib/sci/content-profile.ts 2>&1
```

Paste output. Confirm:
- Current `ContentProfile` interface shape
- Current `generateContentProfile` signature
- Where pattern derivations begin (post-stats, pre-return)
- All three Site instances (217, 218, 461-inline)

### 11.4.2 — Author the split

Modify `web/src/lib/sci/content-profile.ts`:

#### Step 1: Define new types

Add near top of file (after existing type imports):

```typescript
/**
 * HF-196 Phase 1G Path α — Two-phase content-profile split per Decision 108.
 *
 * Phase A produces pure statistics; HC runs against stats; Phase B produces
 * HC-aware pattern derivations. Pattern detection structurally consumes HC,
 * never operates as peer producer with HC.
 */

/**
 * Phase A output: deterministic statistics.
 * No pattern derivations (no hasEntityIdentifier, no idField).
 */
export interface ContentProfileStats {
  fields: FieldProfile[];
  rowCount: number;
  columnStats: Record<string, ColumnStats>;
  // ... preserve all existing stats-only properties from current ContentProfile
  // ... DO NOT include: hasEntityIdentifier, idField, structuralNameField, identifierRepeatRatio, nonIdFields
}

/**
 * Phase B output: HC-aware pattern derivations.
 * Each pattern field is computed with HC primacy per Decision 108.
 */
export interface ContentProfilePatterns {
  hasEntityIdentifier: boolean;
  idField: FieldProfile | null;
  structuralNameField: FieldProfile | null;
  identifierRepeatRatio: number;
  nonIdFields: FieldProfile[];
  // ... preserve all existing pattern properties from current ContentProfile
}

/**
 * Composite ContentProfile = Stats + Patterns.
 * Backward compatibility: callers that consume ContentProfile receive merged shape.
 */
export type ContentProfile = ContentProfileStats & {
  patterns: ContentProfilePatterns;
};
```

CC: introspect the current `ContentProfile` interface and migrate properties to the correct phase. Stats are deterministic computations on raw row data (column types, distributions, distinctCount, sample values). Patterns are pattern-detection outputs (booleans / selected fields based on heuristics). When uncertain, default to **stats** (Phase A) for properties that don't depend on pattern detection.

#### Step 2: Refactor `generateContentProfile` into two phases

```typescript
/**
 * Phase A — generate deterministic statistics only.
 * Runs before HC. No pattern derivations.
 */
export function generateContentProfileStats(
  rows: Record<string, unknown>[],
  headers: string[],
  // preserve existing parameters
): ContentProfileStats {
  // BODY: lift from current generateContentProfile, EXCLUDING:
  //   - detectStructuralIdentifier calls
  //   - hasEntityIdentifier computation
  //   - idField finder
  //   - structuralNameField finder
  //   - identifierRepeatRatio computation
  //   - nonIdFields filtering
  // RETURN: stats-only shape (fields, rowCount, columnStats, ...)
}

/**
 * Phase B — generate HC-aware patterns.
 * Runs after HC; receives HC interpretations; gates structural arms on HC silence.
 */
export function generateContentProfilePatterns(
  stats: ContentProfileStats,
  hcInterpretations?: Map<string, HeaderInterpretation>,
): ContentProfilePatterns {
  const fields = stats.fields;
  const rowCount = stats.rowCount;

  // HF-196 Phase 1G — detectStructuralIdentifier with HC primacy
  const detectStructuralIdentifierHCAware = (f: FieldProfile): boolean => {
    const hcRole = hcInterpretations?.get(f.fieldName)?.columnRole;

    // Decision 108: HC wins. If HC has any role (other than 'unknown'),
    // structural arm yields; structural patterns do not produce identifier signal.
    if (hcRole && hcRole !== 'unknown') {
      return false;
    }

    // Site 7 — sequential integer (HC silent only)
    if (f.dataType === 'integer' && f.distribution.isSequential) {
      return true;
    }

    // Site 3 — high-cardinality integer (HC silent only)
    const uniquenessRatio = rowCount > 0 ? f.distinctCount / rowCount : 0;
    if (f.dataType === 'integer' && uniquenessRatio > 0.90) {
      return true;
    }

    return false;
  };

  // hasEntityIdentifier OR-fold (line 460) — three components, all gated on HC silence
  const hasEntityIdentifier = fields.some(f => {
    const hcRole = hcInterpretations?.get(f.fieldName)?.columnRole;

    // HC primary: if HC said this is an identifier, signal present
    if (hcRole === 'identifier') return true;

    // HC primary: if HC has any other role, structural signals yield
    if (hcRole && hcRole !== 'unknown') return false;

    // HC silent: structural fallback
    return (
      detectStructuralIdentifierHCAware(f) ||
      f.nameSignals.containsId ||
      // 461-inline: gated on HC silence (we're already in HC-silent branch here)
      (f.dataType === 'integer' && f.distribution.isSequential)
    );
  });

  // idField finder — same gating shape
  const idField = fields.find(f => {
    const hcRole = hcInterpretations?.get(f.fieldName)?.columnRole;
    if (hcRole === 'identifier') return true;
    if (hcRole && hcRole !== 'unknown') return false;
    return detectStructuralIdentifierHCAware(f);
  }) ?? fields.find(f => {
    const hcRole = hcInterpretations?.get(f.fieldName)?.columnRole;
    if (hcRole && hcRole !== 'unknown') return false;
    return f.nameSignals.containsId;
  }) ?? null;

  // PRESERVE existing computations for: structuralNameField, identifierRepeatRatio, nonIdFields
  // Use updated idField above for computations that depend on it.

  return {
    hasEntityIdentifier,
    idField,
    structuralNameField,  // existing logic
    identifierRepeatRatio,  // existing logic, may use updated idField
    nonIdFields,  // existing logic
    // ... other pattern properties preserved
  };
}

/**
 * Composite generator — backward-compatible wrapper.
 *
 * USAGE NOTE: Callers that need HC primacy MUST invoke generateContentProfileStats
 * first, run HC against the stats, then invoke generateContentProfilePatterns
 * with the HC interpretations. This wrapper exists for legacy callers that
 * cannot be updated atomically; it computes patterns with hcInterpretations=undefined,
 * which means structural arms fire (legacy behavior).
 *
 * After Phase 1G, all production call sites use the two-phase form. This wrapper
 * is retained only for backward compatibility / test fixtures.
 */
export function generateContentProfile(
  rows: Record<string, unknown>[],
  headers: string[],
  // preserve existing parameters
): ContentProfile {
  const stats = generateContentProfileStats(rows, headers, /* ... */);
  const patterns = generateContentProfilePatterns(stats, undefined);  // legacy: HC silent
  return { ...stats, patterns };
}
```

**Backward compatibility safeguard:** `generateContentProfile` (the legacy single-phase function) preserved as a wrapper that defaults to `hcInterpretations=undefined`. Test fixtures and any non-production caller continue to work; they receive structural-arm behavior (legacy). Production import paths (analyze/route.ts + process-job/route.ts) explicitly invoke the two-phase form to gain HC primacy.

#### Step 3: Build verification (incremental)

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Must exit 0. If type errors surface (e.g., consumers of ContentProfile that expect properties at the top level instead of nested under `.patterns`), CC migrates them to read from `profile.patterns.hasEntityIdentifier` etc.

CC: grep for all consumers of the affected pattern properties:

```bash
grep -rnE "\.hasEntityIdentifier|\.idField\b|\.structuralNameField|\.identifierRepeatRatio|\.nonIdFields" web/src/ --include="*.ts" 2>&1 | head -30
```

For each consumer, update access path: `profile.hasEntityIdentifier` → `profile.patterns.hasEntityIdentifier`. Or, optionally, expose patterns at the top level of the merged ContentProfile type (the `&` intersection in the type definition does this automatically — verify with the build).

### 11.4.3 — Update call sites: analyze/route.ts + process-job/route.ts

Update `web/src/app/api/import/sci/analyze/route.ts:91` (and parallel site in process-job/route.ts):

#### Pre-edit (Phase A monolithic)

```typescript
const profile = generateContentProfile(rows, headers, /* ... */);
const profileMap = new Map<string, ContentProfile>();
profileMap.set(sheetName, profile);

// ... (later, around line 128, HC runs against profileMap)
const hcResult = await runHeaderComprehension(profileMap, ...);
```

#### Post-edit (Phase A → HC → Phase B)

```typescript
// HF-196 Phase 1G Path α — Two-phase content-profile per Decision 108

// Phase A: deterministic statistics
const stats = generateContentProfileStats(rows, headers, /* ... */);
const statsMap = new Map<string, ContentProfileStats>();
statsMap.set(sheetName, stats);

// HC runs against stats
const hcResult = await runHeaderComprehension(statsMap, ...);
const hcInterpretations = hcResult?.interpretations ?? new Map();

// Phase B: HC-aware patterns (gates structural arms on HC silence per Decision 108)
const patterns = generateContentProfilePatterns(stats, hcInterpretations);
const profile: ContentProfile = { ...stats, patterns };

const profileMap = new Map<string, ContentProfile>();
profileMap.set(sheetName, profile);
```

CC: read the actual call-site flow. The shape may differ:
- Multiple sheets: iterate per sheet; produce statsMap; run HC across statsMap; produce profileMap with patterns
- HC may consume profileMap directly (existing API) — preserve API surface; HC reads stats.fields, stats.columnStats from the merged ContentProfile (still valid because stats subtype is contained)
- HC's existing additive override at `header-comprehension.ts:508-509, 571-572` becomes redundant after Phase 1G — HC primacy is now operative at pattern-detection time. CC should:
  - Remove or comment out the additive override in HC (the demotion path doesn't exist; HC ran first; patterns gate accordingly).
  - **OR** preserve the additive override as defensive (Phase 1G might miss a new structural pattern site; legacy override catches it). CC dispositions; recommend preserve as defensive (small code; non-defective in post-1G architecture).

#### Build verification

```bash
cd web && rm -rf .next && npm run build 2>&1 | tail -20
```

Must exit 0.

### 11.4.4 — Self-test pipeline reordering

```bash
cd ~/spm-platform

echo "=== Verify two-phase exports ==="
grep -nE "export\s+function\s+(generateContentProfileStats|generateContentProfilePatterns|generateContentProfile)" web/src/lib/sci/content-profile.ts
echo "---"
echo "=== Verify two-phase invocation in analyze/route.ts ==="
grep -nE "generateContentProfileStats|generateContentProfilePatterns" web/src/app/api/import/sci/analyze/route.ts
echo "---"
echo "=== Verify two-phase invocation in process-job/route.ts ==="
grep -nE "generateContentProfileStats|generateContentProfilePatterns" web/src/app/api/import/sci/process-job/route.ts
echo "---"
echo "=== Verify Sites 3, 7, 461-inline gate on HC silence ==="
sed -n '200,250p' web/src/lib/sci/content-profile.ts
echo "---"
echo "=== Confirm hasEntityIdentifier OR-fold reads HC interpretations ==="
grep -nE "hasEntityIdentifier|idField" web/src/lib/sci/content-profile.ts | head -15
```

Paste all output.

Confirm:
- Both phases exported as named functions
- Both call sites (analyze/route.ts + process-job/route.ts) use two-phase form
- Sites 3, 7, 461-inline gate on `hcRole && hcRole !== 'unknown'` precondition
- hasEntityIdentifier + idField finder consume HC interpretations

### 11.4.5 — Korean Test gate

```bash
cd ~/spm-platform
bash scripts/verify-korean-test.sh 2>&1 | tail -20
```

Must PASS. The two-phase split uses structural primitives only (`hcRole` strings are platform-defined semantic roles, not customer vocabulary; `dataType`, `isSequential`, `uniquenessRatio` are deterministic statistics).

### 11.4.6 — Document the architectural change for completion report §1G-4

Capture for completion report:
- Two-phase split shape (Stats / Patterns interfaces)
- Phase A function signature (no HC parameter)
- Phase B function signature (accepts HC interpretations)
- Backward-compatible wrapper (`generateContentProfile` as legacy)
- Pipeline reordering: analyze/route.ts + process-job/route.ts updated
- HC additive-override status: <preserved as defensive / removed as redundant — architect-disposition>

**Proceed to §11.5 (Site 8 tenant-context.ts:146).**

---

## End of §11.4 amendment.
