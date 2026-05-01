# Bridge edit specification — `web/src/lib/compensation/ai-plan-interpreter.ts`

**Phase:** OB-196 Phase 1.5.1 P1.5.1 — Revision 6.4 (validate wiring at the bridge boundary).

**Scope:** two surgical edits to a single file:
1. **Import statement** at top of file (additive extension to existing `primitive-registry` import).
2. **Validate call** inside `normalizeComponents` (insertion of ~9 lines after `comp` object construction, before `return comp;`).

---

## Edit 1 — Import statement

### Current state (line 9, surfaced verbatim from current HEAD)

```typescript
import { isRegisteredPrimitive } from '@/lib/calculation/primitive-registry';
```

Polish 3 finding: **case (c)** — `primitive-registry` is already imported with one symbol (`isRegisteredPrimitive`); extend additively to add `lookupPrimitive` and `InvalidPrimitiveShapeError`. No new import statement, no duplicate import, no symbol re-import.

### Proposed updated state

```typescript
import { isRegisteredPrimitive, lookupPrimitive, InvalidPrimitiveShapeError } from '@/lib/calculation/primitive-registry';
```

Single import line, three named exports, alphabetical-ish (existing pattern preserves source-of-introduction order — `isRegisteredPrimitive` first).

---

## Edit 2 — Validate call inside `normalizeComponents`

### Current state (lines 206–228, surfaced verbatim with context)

```typescript
  private normalizeComponents(components: unknown): InterpretedComponent[] {
    if (!Array.isArray(components)) return [];

    return components.map((c, index) => {
      const comp: InterpretedComponent = {
        id: String(c.id || `component-${index}`),
        name: String(c.name || `Component ${index + 1}`),
        nameEs: c.nameEs ? String(c.nameEs) : undefined,
        type: this.normalizeComponentType(c.type),
        appliesToEmployeeTypes: Array.isArray(c.appliesToEmployeeTypes)
          ? c.appliesToEmployeeTypes.map(String)
          : ['all'],
        calculationMethod: this.normalizeCalculationMethod(c.type, c.calculationMethod),
        // OB-77: Preserve AI-produced structural intent (validated downstream)
        calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
          ? c.calculationIntent as Record<string, unknown>
          : undefined,
        confidence: Number(c.confidence) || 50,
        reasoning: String(c.reasoning || ''),
      };
      return comp;
    });
  }
```

The `comp` object is fully constructed by lines 210–225 (post-`reasoning`); `return comp` follows at line 226. The validate call inserts between those two — after `comp` is fully formed but before the map callback returns it.

`comp.type` is the foundational primitive identifier (already validated by `normalizeComponentType` upstream — guaranteed to be a registered primitive by the time we reach this point). `comp.calculationMethod` is the structural payload to validate.

### Proposed updated state

```typescript
  private normalizeComponents(components: unknown): InterpretedComponent[] {
    if (!Array.isArray(components)) return [];

    return components.map((c, index) => {
      const comp: InterpretedComponent = {
        id: String(c.id || `component-${index}`),
        name: String(c.name || `Component ${index + 1}`),
        nameEs: c.nameEs ? String(c.nameEs) : undefined,
        type: this.normalizeComponentType(c.type),
        appliesToEmployeeTypes: Array.isArray(c.appliesToEmployeeTypes)
          ? c.appliesToEmployeeTypes.map(String)
          : ['all'],
        calculationMethod: this.normalizeCalculationMethod(c.type, c.calculationMethod),
        // OB-77: Preserve AI-produced structural intent (validated downstream)
        calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
          ? c.calculationIntent as Record<string, unknown>
          : undefined,
        confidence: Number(c.confidence) || 50,
        reasoning: String(c.reasoning || ''),
      };

      // OB-196 Phase 1.5.1 — Decision 154 structured-failure obligation: validate
      // structural invariants on the emitted calculationMethod payload that
      // allowedKeys cannot catch (weights summing to 1.0, axis dimensions
      // matching grid dimensions, segments contiguous, etc.). Recursive primitives
      // (conditional_gate.onTrue / onFalse) recurse inside their own validate body.
      const primitiveEntry = lookupPrimitive(comp.type);
      if (primitiveEntry) {
        const validationResult = primitiveEntry.validate(
          (comp.calculationMethod ?? {}) as Record<string, unknown>,
        );
        if (!validationResult.valid) {
          throw new InvalidPrimitiveShapeError(
            comp.type,
            validationResult.violations,
            { boundary: 'ai_plan_interpreter.normalizeComponents' },
          );
        }
      }

      return comp;
    });
  }
```

### Notes on the edit

- **Unconditional `if (primitiveEntry)` guard** despite `normalizeComponentType` having already validated the identifier upstream: defense-in-depth. If a future refactor changes the upstream guarantee, the validate call gracefully no-ops rather than silently NPE'ing on `lookupPrimitive(comp.type).validate(...)`. Cost is one nullable check; benefit is structural robustness.
- **`comp.calculationMethod ?? {}`** fallback: `normalizeCalculationMethod` may return undefined if the AI emission is malformed at the calculation-method level. Validate sees an empty object instead of crashing. The validate body's per-field checks then surface what's missing as structural violations, which is the correct failure mode.
- **`boundary: 'ai_plan_interpreter.normalizeComponents'`** in the error context: structured failure surface for telemetry (matches the directive's spec). Tenant_id is not in scope at this call site (the bridge function `bridgeAIToEngineFormat` receives `tenantId` but `normalizeComponents` is called via `validateAndNormalize` which doesn't carry it through). The context object's `tenant_id` is optional in the constructor signature; omitting it here is correct. Alternative: thread tenantId through validateAndNormalize → normalizeComponents — defer to architect disposition if richer telemetry is wanted.

### Build expectations

Compile-clean expected. `InvalidPrimitiveShapeError extends Error` — TypeScript accepts `throw new InvalidPrimitiveShapeError(...)` as a thrown Error subclass. `lookupPrimitive` returns `PrimitiveEntry | null` — the truthy check before calling `.validate(...)` satisfies the type-narrowing. No new TS5+ syntax; no async surface.

---

## Holding for architect verification

Both edit specs surfaced. No file mutation in this turn. Architect verifies revised registry content (`/tmp/primitive-registry-revised.md`) and bridge edit spec (this file), then dispositions whether P1.5.1.1 commits or revisions.

After architect approval, P1.5.1.1 lands as one or two commits (per architect choice — the registry refactor is a coherent unit; the bridge edit can fold in or be a sibling). P1.5.1.2 (prompt refactor in `anthropic-adapter.ts`) follows on the approved registry surface.
