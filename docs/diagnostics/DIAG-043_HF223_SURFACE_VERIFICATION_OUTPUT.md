# DIAG-043 -- HF-223 Implementation Surface Verification Output

**Date:** 2026-05-14T03:15:48Z
**Branch:** main (Phase 0 scaffolded on main; remote main is branch-protected so subsequent commits ride feature branch `diag-043-hf223-surface-verification` per CC standing PR-path discipline)
**HEAD commit at scaffold:** 70bf9c2abb77aa0ac2efaeaf913dacb28931be1a
**Predecessor:** DIAG-041 (pre-HF-222 code audit)
**Scope:** Three surfaces: IntentModifier type, applyModifiers function, plan_interpretation prompt

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- IntentModifier type definition (current)

**File:** `web/src/lib/calculation/intent-types.ts`
**Grep locate:**
```
203:export type IntentModifier =
239:  modifiers: IntentModifier[];
```

**Lines 203-207 (type union, verbatim):**

```typescript
export type IntentModifier =
  | { modifier: 'cap'; maxValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'floor'; minValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'proration'; numerator: IntentSource; denominator: IntentSource }
  | { modifier: 'temporal_adjustment'; lookbackPeriods: number; triggerCondition: IntentSource; adjustmentType: 'full_reversal' | 'partial' | 'prorated' };
```

**Surrounding usage context, lines 207-239 (verbatim):**

```typescript

// ──────────────────────────────────────────────
// Variant Routing — route to different operations
// based on entity attribute
// ──────────────────────────────────────────────

export interface VariantRouting {
  routingAttribute: IntentSource;
  routes: Array<{
    matchValue: string | number | boolean;
    intent: IntentOperation;
  }>;
  noMatchBehavior: 'error' | 'skip' | 'first';
}

// ──────────────────────────────────────────────
// Complete Component Intent
// ──────────────────────────────────────────────

export interface ComponentIntent {
  componentIndex: number;
  label: string;
  confidence: number;
  dataSource: {
    sheetClassification: string;
    entityScope: 'entity' | 'group';
    requiredMetrics: string[];
    groupLinkField?: string;
  };
  variants?: VariantRouting;
  intent?: IntentOperation;       // used when no variants
  modifiers: IntentModifier[];
```

## Phase 1.2 -- Delta from DIAG-041

DIAG-041 Phase 5.5 extracted lines 203-207. Current extraction (lines 203-207, this file) is byte-identical at the type-discriminant level.

Fields present in `cap` discriminant: `modifier`, `maxValue`, `scope`.

`applyTo` field grep over intent-types.ts:
```
$ grep -c "applyTo" web/src/lib/calculation/intent-types.ts
0
```
Zero hits. The `applyTo` field is structurally absent from the IntentModifier type union.

## Phase 1.3 -- IntentModifier consumers

```
$ grep -rn "IntentModifier\|\.modifier\b.*cap\|mod\.maxValue\|mod\.minValue\|mod\.modifier" \
    web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts"

web/src/lib/calculation/intent-executor.ts:28:  IntentModifier,
web/src/lib/calculation/intent-executor.ts:574:  modifiers: IntentModifier[],
web/src/lib/calculation/intent-executor.ts:583:    switch (mod.modifier) {
web/src/lib/calculation/intent-executor.ts:585:        const cap = toDecimal(mod.maxValue);
web/src/lib/calculation/intent-executor.ts:590:        const floor = toDecimal(mod.minValue);
web/src/lib/calculation/intent-executor.ts:606:    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
web/src/lib/calculation/intent-transformer.ts:17:  IntentModifier,
web/src/lib/calculation/intent-transformer.ts:183:  const modifiers: IntentModifier[] = [];
web/src/lib/calculation/intent-transformer.ts:188:      if (m.modifier === 'cap' && m.maxValue != null) {
web/src/lib/calculation/intent-types.ts:203:export type IntentModifier =
web/src/lib/calculation/intent-types.ts:239:  modifiers: IntentModifier[];
```

**Consumer count by file:**
- `intent-executor.ts`: 6 references (import, parameter signature, switch dispatch, two field reads, modifierLog emission)
- `intent-transformer.ts`: 3 references (import, local-array typing, modifier-rewrite condition)
- `intent-types.ts`: 2 references (type definition, ComponentIntent field)
