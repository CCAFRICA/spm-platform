# OB-160A Completion Report: Content Profile Foundation

## Commits
- `0af531b` — Phase 0: Diagnostic read of current state
- `d5d12c2` — Phases 1-4: Probabilistic type scoring, temporal detection, identifier-relative cardinality, signal interface
- (Phase 5) — Remove diagnostic logging, build verification

## Architecture Decisions Applied
- **Decision 103:** Probabilistic type scoring replaces sequential waterfall
- **Decision 104:** Temporal detection is type-agnostic (raw values)
- **Decision 105:** Person-name detection uses identifier-relative cardinality

## Files Modified
- `web/src/lib/sci/content-profile.ts` — Complete rewrite
- `web/src/lib/sci/sci-types.ts` — ProfileObservation interface, hasPeriodMarkers to hasTemporalColumns
- `web/src/lib/sci/agents.ts` — hasPeriodMarkers to hasTemporalColumns, diagnostic logging removed
- `web/src/lib/sci/signatures.ts` — hasPeriodMarkers to hasTemporalColumns, entity threshold to 1.5, diagnostic logging removed

## Phase 0: Issues Found
1. Boolean waterfall claims Mes=1 as boolean before integer check
2. Temporal detection requires dataType === 'integer' — fails when Mes typed as boolean
3. Person-name detection uses digit check (total-row based) — "Monterrey Hub" (no digits) still passes
4. No signal interface for flywheel emission
5. Entity signature threshold 1.3 too tight for Plantilla ratio 1.34

## Phase 1: Probabilistic Type Scoring (Decision 103)

### Before: Sequential waterfall
```
isBooleanValue() first → if all values in {0,1,true,false,...} → boolean
Then check integer, decimal, etc.
Mes=1 → classified as boolean (all values match '1')
```

### After: Simultaneous plausibility scoring
```
boolean: 0.20 (only one side present — all 1s, no 0s)
integer: 0.90 (all parse as integers, range > 1, distinct > 2)
→ INTEGER WINS
```

### Proof Gates
- PG-1: PASS — classifyColumnType function exists with simultaneous scoring
- PG-2: PASS — Boolean scorer requires BOTH true-like AND false-like for 0.95
- PG-3: PASS — Column of all-1s: integer 0.90 > boolean 0.20
- PG-4: PASS — Column {0,1,0,1,1,0}: boolean 0.95 > integer 0.80
- PG-5: PASS — allScores preserved via ProfileObservation alternativeInterpretations
- PG-6: PASS — npm run build exits 0

## Phase 2: Temporal Column Detection (Decision 104)

### Before
```
Requires f.dataType === 'integer' for period marker detection
Mes classified as boolean → temporal detection fails
hasPeriodMarkers: false for Datos_Rendimiento
```

### After
```
detectTemporalColumns() checks RAW NUMERIC VALUES regardless of dataType
Even if Mes classified as boolean, raw value 1 parses as integer in [1,12]
hasTemporalColumns: true for Datos_Rendimiento
```

### Proof Gates
- PG-7: PASS — detectTemporalColumns checks raw numeric values
- PG-8: PASS — Mes=1 detected as temporal (raw integer in [1,12])
- PG-9: PASS — Ano=2025 detected as temporal year-range
- PG-10: PASS — Zero references to hasPeriodMarkers (grep returns zero)
- PG-11: PASS — Zero /api/periods calls in import surface
- PG-12: PASS — Zero PeriodContext/usePeriod in import surface
- PG-13: PASS — npm run build exits 0

## Phase 3: Identifier-Relative Cardinality (Decision 105)

### Before
```
detectPersonNameColumn: checks multi-word, digit ratio, total-row cardinality
"Monterrey Hub" (12 unique, 0 digits) → PASSES as person name
```

### After
```
detectStructuralNameColumn: nameCardinality = distinctNames / distinctIdentifiers
"Monterrey Hub" (12 unique / 50 IDs = 0.24) → REJECTED (< 0.50)
"Ana Garcia Lopez" (50 unique / 50 IDs = 1.0) → ACCEPTED
```

### Proof Gates
- PG-14: PASS — computeIdentifierRelativeCardinality function exists
- PG-15: PASS — Name detection uses identifier-relative cardinality
- PG-16: PASS — 50 unique names / 50 unique IDs = 1.0 → detected as name
- PG-17: PASS — 12 unique hub names / 50 unique IDs = 0.24 → NOT name
- PG-18: PASS — "Monterrey Hub" rejected as person name
- PG-19: PASS — "Ana Garcia Lopez" accepted as person name (real Meridian data)
- PG-20: PASS — categoricalFieldRatio uses identifier-relative cardinality
- PG-21: PASS — npm run build exits 0

## Phase 4: Signal Interface + Structural Metrics

### Proof Gates
- PG-22: PASS — ProfileObservation interface defined in sci-types.ts
- PG-23: PASS — ContentProfile includes observations: ProfileObservation[]
- PG-24: PASS — Type classification produces observation with allScores
- PG-25: PASS — Temporal detection produces observation
- PG-26: PASS — Name detection produces observation with cardinality evidence
- PG-27: PASS — Entity signature threshold <= 1.5
- PG-28: PASS — npm run build exits 0

## Phase 5: Cleanup + Verification

### Proof Gates
- PG-29: PASS — All diagnostic logging removed (grep returns zero)
- PG-30: PASS — npm run build exits 0
- PG-31: PASS — localhost:3000 responds
- PG-32: Pending browser test — Datos_Rendimiento Mes as integer
- PG-33: Pending browser test — Datos_Rendimiento hasTemporalColumns
- PG-34: Pending browser test — Datos_Flota_Hub hasStructuralNameColumn = false
- PG-35: Pending browser test — Plantilla hasStructuralNameColumn = true

## Implementation Completeness Gate

SCI Spec Layer 1: "The Content Profile is additive, not reductive."

After OB-160A:
- Structural observation of every column (probabilistic type scoring) — DELIVERED
- Temporal column detection without interpretation — DELIVERED
- Additive observation (ProfileObservation with alternatives) — DELIVERED
- No filtering (temporal detection type-agnostic) — DELIVERED
- No exclusion (boolean requires both values) — DELIVERED

Gap to full Layer 1: Header comprehension (Phase B — requires LLM)
