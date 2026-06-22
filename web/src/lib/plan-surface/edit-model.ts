/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: edits walk untyped prime-DAG JSONB
/**
 * OB-228 Phase 4 — the deterministic edit model (Decision 158: edits are construction,
 * read from / written to rule_sets.components exactly). Extracts the editable scalar
 * constants from a component's calculationIntent prime-DAG (rates, thresholds,
 * multipliers, flat amounts) by PATH, and applies edits immutably — producing an edited
 * calculationIntent + a value-synced compositional_intent so the canvas re-renders
 * consistently after commit. Korean-Test clean: classification is structural (prime
 * node types + parent context), never a field/value dictionary.
 */
import type { CanonicalComponent } from './types';

type Node = Record<string, any>;
const isNode = (v: unknown): v is Node => !!v && typeof v === 'object';

export type EditableRole = 'rate' | 'threshold' | 'multiplier' | 'amount' | 'constant';
export interface EditableValue {
  id: string;
  path: (string | number)[];
  value: number;
  role: EditableRole;
  label: string;
  context?: string;
}

function nearestField(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.prime === 'reference' && node.field) return node.field;
  if (node.prime === 'aggregate' && node.field) return node.field;
  if (node.prime === 'scope' && node.boundary) return node.boundary;
  for (const v of Object.values(node)) { if (isNode(v)) { const f = nearestField(v); if (f) return f; } }
  return null;
}

function classify(value: number, parent: Node | null, key: string | number | null, field: string | null): { role: EditableRole; label: string } {
  const f = field ? ` · ${field}` : '';
  if (parent?.prime === 'compare') return { role: 'threshold', label: `Threshold${f}` };
  if (parent?.prime === 'arithmetic' && parent.op === 'multiply') {
    if (Math.abs(value) <= 1) return { role: 'rate', label: `Rate${f}` };
    if (Number.isInteger(value) && Math.abs(value) >= 10) return { role: 'amount', label: `Amount${f}` };
    return { role: 'multiplier', label: `Multiplier${f}` };
  }
  if (parent?.prime === 'conditional' && (key === 'then' || key === 'else')) {
    return Math.abs(value) <= 1 ? { role: 'rate', label: `Rate (${key})${f}` } : { role: 'amount', label: `Payout (${key})${f}` };
  }
  return { role: 'constant', label: `Value${f}` };
}

/** Walk the prime-DAG and collect every numeric constant with its path + structural role. */
export function extractEditableValues(component: CanonicalComponent): EditableValue[] {
  const intent = component.calculationIntent ?? (component.config?.raw as any)?.calculationIntent;
  const out: EditableValue[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, path: (string | number)[], parent: Node | null, key: string | number | null, fieldCtx: string | null) {
    if (!isNode(node)) return;
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, [...path, i], parent, i, fieldCtx)); return; }
    // update field context when this subtree names a field
    const localField = node.prime === 'reference' || node.prime === 'aggregate' ? node.field
      : node.prime === 'scope' ? node.boundary
      : node.prime === 'compare' ? nearestField(node) : fieldCtx;
    if (node.prime === 'constant' && typeof node.value === 'number') {
      const p = [...path, 'value'];
      const id = p.join('.');
      if (!seen.has(id)) {
        seen.add(id);
        const { role, label } = classify(node.value, parent, key, fieldCtx ?? localField ?? null);
        out.push({ id, path: p, value: node.value, role, label, context: fieldCtx ?? localField ?? undefined });
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'prime' || k === 'op' || k === 'field' || k === 'boundary') continue;
      if (isNode(v)) walk(v, [...path, k], node, k, localField);
    }
  }
  walk(intent, [], null, null, null);
  return out;
}

/** Immutable deep-set: returns a clone of `obj` with `path` set to `value`. */
export function setAtPath(obj: any, path: (string | number)[], value: any): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone: any = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  clone[head] = setAtPath(obj?.[head], rest, value);
  return clone;
}

export interface AppliedEdit { path: (string | number)[]; from: number; to: number; role: EditableRole; label: string }

/**
 * Apply edits to a component. Returns the edited calculationIntent + a value-synced
 * compositional_intent (band outputs/breaks replaced by matching old→new value) so the
 * rendered canvas reflects the edit after commit. Deterministic (D158).
 */
export function applyEdits(component: CanonicalComponent, edits: { path: (string | number)[]; value: number }[]): {
  calculationIntent: any;
  compositionalIntent: any;
  applied: AppliedEdit[];
} {
  const editable = extractEditableValues(component);
  let intent = component.calculationIntent ?? (component.config?.raw as any)?.calculationIntent;
  const applied: AppliedEdit[] = [];
  const valueMap = new Map<number, number>(); // old → new (for compositional sync)

  for (const e of edits) {
    const meta = editable.find((ev) => ev.id === e.path.join('.'));
    const from = meta?.value ?? Number(getAtPath(intent, e.path));
    if (from === e.value || !Number.isFinite(e.value)) continue;
    intent = setAtPath(intent, e.path, e.value);
    valueMap.set(from, e.value);
    applied.push({ path: e.path, from, to: e.value, role: meta?.role ?? 'constant', label: meta?.label ?? 'Value' });
  }

  // Sync compositional_intent.structure outputs/breaks by value match (display consistency).
  let compositionalIntent = component.config?.compositionalIntent ?? (component.metadata as any)?.compositional_intent ?? null;
  if (compositionalIntent && valueMap.size > 0) {
    compositionalIntent = syncNumbers(compositionalIntent, valueMap);
  }
  return { calculationIntent: intent, compositionalIntent, applied };
}

function getAtPath(obj: any, path: (string | number)[]): any {
  return path.reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Recursively replace any number in `outputs`/`breaks` arrays that matches an old value. */
function syncNumbers(node: any, map: Map<number, number>): any {
  if (Array.isArray(node)) return node.map((n) => (typeof n === 'number' && map.has(n) ? map.get(n)! : syncNumbers(n, map)));
  if (isNode(node)) { const c: any = {}; for (const [k, v] of Object.entries(node)) c[k] = syncNumbers(v, map); return c; }
  if (typeof node === 'number' && map.has(node)) return map.get(node)!;
  return node;
}
