# OB-159 Completion Report: Unified SCI Scoring Overhaul

## PR: https://github.com/CCAFRICA/spm-platform/pull/181

## Commits
- `824af38` — Phase 0: Architecture decision
- `a53d287` — Phases 1-4: Composite signatures, Korean Test cleanup, Round 2, volume patterns
- `aac2585` — Phase 5: Fix person-name detection for non-person entities

## What Changed

### Phase 1: Composite Structural Signatures (`signatures.ts` — NEW)
Five fingerprints that set confidence floors when multiple structural signals align:
- **Transaction** (80%): identifierRepeatRatio > 1.5 AND temporal AND numericFieldRatio > 40%
- **Entity** (85%): identifierRepeatRatio <= 1.3 AND categoricalRatio > 25% AND hasId AND hasStructuralName
- **Target** (75%): identifierRepeatRatio <= 1.5 AND numericRatio > 30% AND hasId AND no temporal
- **Plan** (85%): sparse/auto headers AND rowCount < 50 AND (no ID or very low rows)
- **Reference** (75%): rowCount < 100 AND not person-level AND categorical keys AND not sparse

### Phase 2: Korean Test Cleanup (`agents.ts`)
Removed all field-name matching from scoring:
- Target agent: REMOVED `has_target_field` (+0.25 from containsTarget matching "meta")
- Entity agent: REMOVED `has_license_field` (+0.10 from field name matching)
- Entity agent: Replaced `has_name_field` with `has_structural_name` (value-based detection)

### Phase 3: Round 2 Negotiation (`agents.ts`)
Agents see each other's scores and adjust:
- Target penalized when identifierRepeatRatio > 2.0 (targets are set once)
- Transaction boosted when temporal + repeat > 1.5 (confirms event pattern)
- Entity penalized when repeat > 2.0 (rosters have ~1.0)
- Entity vs Target: high numeric ratio shifts weight toward target
- Absence clarity: clear winner gets small boost when gap > 25%

### Phase 4: Volume Pattern Signal (`content-profile.ts`, `sci-types.ts`)
- `volumePattern`: single (<=1.3), few (1.3-3.0), many (>3.0), unknown
- Replaced absolute `rowCountCategory` in scoring with entity-relative volume
- Moved `numericFieldRatio`, `identifierRepeatRatio` from patterns to structure
- Added `categoricalFieldRatio`, `categoricalFieldCount`, `hasPeriodMarkers`

### Phase 5: Person-Name Detection Fix (`content-profile.ts`)
- `detectPersonNameColumn()` now rejects values containing digits (>20%)
- Prevents hub/location names like "Hub CDMX 1" from being classified as person names
- Fixes Datos_Flota_Hub misclassification as entity instead of reference

## Proof Gates

### Scoring Simulation (ALL PASS)
| Sheet | Expected | Actual | Status |
|-------|----------|--------|--------|
| Datos_Rendimiento (201 rows, 50 emp x 4 months) | transaction >= 75% | 98% | PASS |
| Plantilla (50 rows, 1 per employee) | entity >= 85% | 85% | PASS |
| Datos_Flota_Hub (20 rows, fleet reference) | reference >= 75% | 75% | PASS |

### Korean Test Compliance
- Zero field-name matching in scoring weights (agents.ts)
- `nameSignals` used ONLY for observation text and semantic binding
- `has_structural_name` uses `detectPersonNameColumn()` — value patterns, not headers
- `detectStructuralIdentifier()` uses uniqueness ratio + value type, not header text

### Build Verification
- `rm -rf .next && npm run build` — PASS, zero errors

## Root Cause Analysis
Meridian Datos_Rendimiento (transaction data) was misclassified as target because:
1. **Korean Test violation**: Target agent got +0.25 from `containsTarget` matching "Meta" in field names
2. **Additive-only scoring**: No mechanism for multiple signals to create conviction
3. **No spatial intelligence**: Agents scored independently without seeing competitors

The fix addresses all three through composite signatures (conviction from aligned signals), Korean Test cleanup (no field-name scoring), and Round 2 negotiation (spatial awareness).
