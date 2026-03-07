# HF-095 Completion Report: HC Override Authority + nameSignals Elimination

## Decision 108: Header Comprehension Override Authority

When HC produces column roles with confidence >= 0.80, those roles OVERRIDE structural type detection in the Content Profile. Structural analysis stands alone when HC is unavailable.

---

## Phase 0: Diagnostic

### Current Authority Mapping (Before HF-095)
- HC enhances Content Profile AFTER structural detection, BEFORE scoring
- HC could only ADD signals (temporal reinforcement, name reinforcement)
- HC could NOT suppress structural false positives
- Result: structural false positives (temporal, currency, identifier) propagated into scoring

### nameSignals Inventory
| Signal | Files Using It | Replaced By |
|--------|---------------|-------------|
| containsId | agents.ts, negotiation.ts | HC `identifier` + structural uniqueness |
| containsName | agents.ts, negotiation.ts | HC `name` + `looksLikePersonName` |
| containsDate | agents.ts, negotiation.ts | HC `temporal` + structural date type |
| containsAmount | agents.ts, negotiation.ts | HC `measure` + structural currency type |
| containsTarget | agents.ts, negotiation.ts | Removed (Decision 100) |
| containsRate | agents.ts | HC `measure` + structural percentage type |
| looksLikePersonName | agents.ts, negotiation.ts | RETAINED — structural value-pattern detection |

---

## Phase 1: HC Override in Content Profile

### Implementation: `header-comprehension.ts` → `enhanceProfileWithComprehension()`

**Override 1: Identifier Detection**
- Scans HC interpretations for `identifier` or `reference_key` with confidence >= 0.80
- Uses that column for `identifierRepeatRatio` calculation
- Updates `volumePattern` to match new ratio

**Override 2: Temporal Suppression**
- When HC says a column is NOT temporal (e.g., `attribute`, `measure`) but structural analysis flagged it as temporal (integer in range 1-12 or 2000-2040)
- Suppresses temporal detection for that column
- Re-evaluates `hasDateColumn` and `hasTemporalColumns`

**Override 3: Currency Suppression**
- When HC identifies a column as non-monetary measure (capacity, count, utilization)
- Reduces `hasCurrencyColumns` count

All overrides require HC confidence >= 0.80. Structural fallback when HC unavailable.

---

## Phase 2: nameSignals Elimination

### agents.ts
- `generateSemanticBindings`: passes HC columnRole to role assignment
- `assignSemanticRole`: checks HC identifier/reference_key first, then structural
- All `assign*Role` functions: use HC columnRole instead of nameSignals

### negotiation.ts
- `FIELD_AFFINITY_RULES`: HC-aware — uses `(f, hcRole)` signature
- `computeFieldAffinities`: gets HC columnRole for each field
- `inferRoleForAgent`: uses HC columnRole with structural fallback
- `generatePartialBindings`: passes HC columnRole

---

## Phase 3: Classification Accuracy Verification

### Results (Meridian XLSX with Mock HC)
| Sheet | Before (Structural Only) | After (HC Override) | Expected |
|-------|-------------------------|---------------------|----------|
| Plantilla | Entity @ 85% | Entity @ 100% | entity |
| Datos_Rendimiento | Transaction @ 75% | Transaction @ 98% | transaction |
| Datos_Flota_Hub | Transaction @ 75% | Reference @ 85% | reference |

### HC Override Effects on Datos_Flota_Hub
- identifierRepeatRatio: 1.00 → 3.00 (Hub identified as reference_key)
- hasTemporalColumns: true → false (Mes/Ano suppressed as attributes)
- hasDateColumn: true → false (no genuine date columns)
- hasCurrencyColumns: 2 → 0 (capacity/loads suppressed as non-monetary)
- volumePattern: single → few

### HC Override Effects on Datos_Rendimiento
- identifierRepeatRatio: 1.00 → 3.00 (No_Empleado identified as identifier)
- hasCurrencyColumns: 1 → 0 (total deliveries suppressed as count)
- Transaction signature fires at 80%+ (was blocked by wrong identifier)

---

## Phase 4: Korean Test

### Field-name matching in scoring pipeline
```
grep -rn "nameSignals\.(containsAmount|containsRate|containsTarget|containsDate|containsId|containsName)" \
  web/src/lib/sci/agents.ts web/src/lib/sci/signatures.ts \
  web/src/lib/sci/negotiation.ts web/src/lib/sci/synaptic-ingestion-state.ts

→ ZERO RESULTS
```

### Signal arrays in content-profile.ts
AMOUNT_SIGNALS, DATE_SIGNALS, etc. still exist in content-profile.ts for Phase A type classification. These populate the `nameSignals` object on `FieldProfile`, but that object is NO LONGER READ by any scoring, negotiation, or binding logic. It is a dead interface — retained for type compatibility.

---

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-01 | Phase 0 diagnostic complete | PASS |
| PG-02 | Identifier detection checks HC first | PASS |
| PG-03 | Temporal detection suppressed when HC says attribute | PASS |
| PG-04 | Currency detection suppressed when HC says non-monetary | PASS |
| PG-05 | All overrides require HC confidence >= 0.80 | PASS |
| PG-06 | Structural fallback when HC unavailable | PASS |
| PG-07 | npm run build exits 0 | PASS |
| PG-08 | ZERO nameSignals.containsAmount/Rate/Target in scoring | PASS |
| PG-09-14 | All nameSignals replaced in scoring files | PASS |
| PG-15 | npm run build exits 0 | PASS |
| PG-16 | Datos_Flota_Hub → Reference | PASS (85%) |
| PG-17 | Plantilla → Entity >= 85% | PASS (100%) |
| PG-18 | Datos_Rendimiento → Transaction >= 80% | PASS (98%) |
| PG-20 | npm run build exits 0 | PASS |
| PG-23 | Korean Test — ZERO field-name matching in scoring | PASS |
| PG-24 | HC override requires confidence >= 0.80 | PASS |
| PG-25 | Structural fallback works when HC unavailable | PASS |
| PG-26 | PR created | PASS — PR #196 |

---

## PR
https://github.com/CCAFRICA/spm-platform/pull/196
