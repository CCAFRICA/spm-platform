# HF-119 Phase 0: Architecture Decision Record
## Variant Routing via Token Overlap Matching

### Problem
Plan variant names (English) don't match data field values (Spanish).
HF-117's exact-match scan finds no match. All employees default to Senior.

**Plan variants:**
- Variant 0: variantName="Senior Logistics Coordinator", description="Coordinador de Logistica Senior"
- Variant 1: variantName="Standard Logistics Coordinator", description="Coordinador de Logistica"

**Data values:** "Coordinador Senior", "Coordinador"

HF-117 compared `"Coordinador Senior"` against `"senior logistics coordinator"` — no exact match.

### Approach: Token Overlap with Discriminant Resolution

1. **Tokenize** variant (name + description + id) and entity field values
2. **Discriminant tokens** = tokens unique to one variant, not shared with any other
3. **Score** = count of discriminant token matches in entity data
4. **Highest score wins.** Ties resolved by total overlap, then default to last variant.

**Worked example:**
```
Variant 0 all tokens: {senior, logistics, coordinator, coordinador, logistica}
Variant 1 all tokens: {standard, logistics, coordinator, coordinador, logistica}

Variant 0 discriminants (unique to V0): {senior}
Variant 1 discriminants (unique to V1): {standard}

Entity "Coordinador Senior" tokens: {coordinador, senior}
  → V0 discriminant matches: {senior} = 1
  → V1 discriminant matches: {} = 0
  → Result: Variant 0 (Senior) ✓

Entity "Coordinador" tokens: {coordinador}
  → V0 discriminant matches: {} = 0
  → V1 discriminant matches: {} = 0
  → Tie → total overlap V0: {coordinador} = 1, V1: {coordinador} = 1
  → Still tied → default to last variant (Standard) ✓
```

### Intent Path Concordance Fix

`componentIntents` is computed once at route.ts:152 from `defaultComponents` (= `variants[0].components`). Per-entity variant selection only changes `selectedComponents` for the `evaluateComponent` path. The intent path at line 1135 always uses the global `componentIntents` — ignoring variant selection entirely.

Fix: when a non-default variant is selected, re-transform its components to intents for that entity.

### Korean Test
Zero hardcoded tokens. Discriminant tokens discovered structurally from variant metadata. Works for any language combination.

### Scale
Token sets built once per variant (outside entity loop). Per-entity scoring is O(fields × tokens) — negligible.

---
*HF-119 Phase 0 | March 9, 2026*
