/**
 * OB-228 — shared prime-DAG field extraction (single source for normalize + analyzer).
 * Korean-Test clean: walks prime node TYPES, never field-name/value literals.
 */
type Node = Record<string, any>;
const isNode = (v: unknown): v is Node => !!v && typeof v === 'object';

/** Every implicit field reference in a prime tree (reference / aggregate / scope / filter). */
export function collectFieldRefs(node: unknown, out: { field: string; via: string }[] = []): { field: string; via: string }[] {
  if (!isNode(node)) return out;
  if (Array.isArray(node)) { for (const n of node) collectFieldRefs(n, out); return out; }
  const p = node.prime;
  if (p === 'reference' && node.field) out.push({ field: node.field, via: 'reference' });
  if (p === 'aggregate' && node.field) out.push({ field: node.field, via: `aggregate:${node.op}` });
  if (p === 'scope' && node.boundary) out.push({ field: node.boundary, via: 'scope:boundary' });
  if (p === 'filter' && node.predicate?.field) out.push({ field: node.predicate.field, via: 'filter:predicate' });
  for (const [k, v] of Object.entries(node)) {
    if (k === 'prime' || k === 'op' || k === 'field' || k === 'boundary' || k === 'value') continue;
    if (isNode(v)) collectFieldRefs(v, out);
  }
  // de-dupe by field|via
  return Array.from(new Map(out.map((r) => [`${r.field}|${r.via}`, r])).values());
}

export function findFirstAggregate(node: unknown): { field: string; op: string } | null {
  if (!isNode(node)) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findFirstAggregate(n); if (r) return r; } return null; }
  if (node.prime === 'aggregate' && node.field) return { field: node.field, op: node.op };
  for (const v of Object.values(node)) { if (isNode(v)) { const r = findFirstAggregate(v); if (r) return r; } }
  return null;
}

/** The first scope boundary (per-entity rollup) + its downstream aggregate. */
export function findScope(node: unknown): { boundary: string; aggField: string | null; aggOp: string | null } | null {
  if (!isNode(node)) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findScope(n); if (r) return r; } return null; }
  if (node.prime === 'scope' && node.boundary) {
    const agg = findFirstAggregate(node.downstream);
    return { boundary: node.boundary, aggField: agg?.field ?? null, aggOp: agg?.op ?? null };
  }
  for (const v of Object.values(node)) { if (isNode(v)) { const r = findScope(v); if (r) return r; } }
  return null;
}

/** The per-entity measure field of a scope rollup (used by the normalizer for binding.column). */
export function findScopeMeasure(node: unknown): string | null {
  return findScope(node)?.aggField ?? null;
}
