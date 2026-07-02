// HF-368 — the platform's FIXED STRUCTURAL PRIMITIVES (the calc skeleton). This is NOT a
// vocabulary registry and NOT a relocation of the deleted scope-predicates.ts synonym lists.
//
// The distinction is the whole point of HF-368:
//   • scope-predicates.ts (DELETED) mapped a developer-typed list of SYNONYMS to a primitive
//     (entity = entidad = seller = vendedor = employee = …). A developer decided which WORDS
//     mean which primitive — a Korean Test violation (breaks for any unlisted word/language).
//   • This file enumerates ONLY the platform's three fixed scopes and five fixed natures — the
//     architecture the calculation partitions on. It lists NO synonyms. The MODEL names which
//     primitive a column is (the bare `scope_role` / `nature_role` it emits, in any language);
//     the code compares that bare judgment to the fixed token. No developer maps words → primitive.
//
// Korean Test: a Korean/Portuguese/novel-word roster still classifies, because the multilingual
// model renders `scope_role: 'entity'` from its own recognition — no developer edit, no word list.

// The three structural SCOPES a column can identify (+ `none` = identifies no scope).
export const SCOPE_PRIMITIVES = ['entity', 'transaction', 'reference', 'none'] as const;
export type ScopePrimitive = typeof SCOPE_PRIMITIVES[number];

// The five structural NATURES a column's values can be.
export const NATURE_PRIMITIVES = ['identifier', 'measure', 'temporal', 'name', 'categorical'] as const;
export type NaturePrimitive = typeof NATURE_PRIMITIVES[number];

// HF-372 Phase C: the PLAN dimension — whether a column is a parameter OF the compensation plan
// (a rate, a payout base/formula, a payment policy, a tier boundary, a cadence) or business data.
// This is the plan-vs-data architectural distinction (Decision 158); the MODEL names it per column
// (any language); code reads it by equality. It replaces the OB-255 natureIsPlanRule word-regex.
export const PLAN_PRIMITIVES = ['rule_parameter', 'none'] as const;
export type PlanPrimitive = typeof PLAN_PRIMITIVES[number];

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPE_PRIMITIVES);
const NATURE_SET: ReadonlySet<string> = new Set(NATURE_PRIMITIVES);
const PLAN_SET: ReadonlySet<string> = new Set(PLAN_PRIMITIVES);

// C2 fail-loud: raised when a needed bare primitive is absent (the model rendered nothing) or
// NOVEL (the model rendered a value OUTSIDE the fixed set — a "recognized something beyond our
// primitives" signal). NEVER a cue to word-match or default.
export class PrimitiveRecognitionError extends Error {
  constructor(sheet: string, field: string, detail: string) {
    super(`HF-368: cannot read the ${field} primitive for sheet "${sheet}" — ${detail}. ` +
      `The classification/resolution reads the model's bare scope_role/nature_role; there is no ` +
      `word-list fallback and no default. Fix at the comprehension layer (the model must render ` +
      `one of the platform's fixed primitives), not here.`);
    this.name = 'PrimitiveRecognitionError';
  }
}

// Is this bare value one of the fixed scope/nature primitives? (Equality against the FIXED
// architecture — not a synonym match.) `none` is a valid scope value (no scope), never novel.
export const isScopePrimitive = (v: string | undefined): v is ScopePrimitive => !!v && SCOPE_SET.has(v);
export const isNaturePrimitive = (v: string | undefined): v is NaturePrimitive => !!v && NATURE_SET.has(v);

// Validate a column's bare scope, raising on novel (non-empty but outside the set). Returns the
// value (possibly empty/undefined → the caller's "absent" handling decides fail-loud vs. skip).
export function validateScope(sheet: string, column: string, scope: string | undefined): string | undefined {
  const v = (scope ?? '').trim();
  if (v && !SCOPE_SET.has(v)) {
    throw new PrimitiveRecognitionError(sheet, `scope_role (column "${column}")`, `the model rendered a NOVEL scope "${v}" outside {${SCOPE_PRIMITIVES.join(', ')}}`);
  }
  return v || undefined;
}

// Validate a column's bare nature, raising on novel.
export function validateNature(sheet: string, column: string, nature: string | undefined): string | undefined {
  const v = (nature ?? '').trim();
  if (v && !NATURE_SET.has(v)) {
    throw new PrimitiveRecognitionError(sheet, `nature_role (column "${column}")`, `the model rendered a NOVEL nature "${v}" outside {${NATURE_PRIMITIVES.join(', ')}}`);
  }
  return v || undefined;
}

// HF-372 Phase C: validate a column's bare plan primitive, raising on novel.
export function validatePlanRole(sheet: string, column: string, planRole: string | undefined): string | undefined {
  const v = (planRole ?? '').trim();
  if (v && !PLAN_SET.has(v)) {
    throw new PrimitiveRecognitionError(sheet, `plan_role (column "${column}")`, `the model rendered a NOVEL plan role "${v}" outside {${PLAN_PRIMITIVES.join(', ')}}`);
  }
  return v || undefined;
}
