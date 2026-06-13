// OB-203 Phase 6B / Phase C — entity enrichment merge (pure).
//
// The EXACT merge semantics the per-entity enrich loop applied in
// execute-bulk/route.ts (OB-177 + HF-190), extracted to a pure function so the
// batch rewrite computes the changed-set in memory and flushes it in 200-row
// upsert chunks (DS-020 litmus: batch I/O, no per-entity round-trips).
//
// Semantics preserved byte-for-byte (DD-7):
//   - temporal_attributes: for each enrichment key, the OPEN entry
//     (effective_to === null) with the same value is idempotent (skip);
//     a different value CLOSES the open entry (effective_to = importDate)
//     and APPENDS a new open entry; a missing key appends.
//   - metadata: spread-merge {existing, ...enrichment, ...(role && {role})}.
//   - changed = metadata content changed OR temporal entries were appended
//     (the original loop's `metaChanged || newAttrs.length !== existingAttrs.length`).

import type { Json } from '@/lib/supabase/database.types';

export interface TemporalAttr {
  key: string;
  value: Json;
  effective_from: string;
  effective_to: string | null;
}

export interface EnrichMergeResult {
  changed: boolean;
  temporalAttributes: TemporalAttr[];
  metadata: Record<string, unknown>;
}

export function computeEnrichmentMerge(params: {
  existingAttrs: TemporalAttr[];
  existingMeta: Record<string, unknown>;
  enrichment: Record<string, string>;
  role?: string;
  importDate: string;
}): EnrichMergeResult {
  const { existingAttrs, existingMeta, enrichment, role, importDate } = params;

  // Clone elements so the merge never mutates the fetched row (the original
  // loop mutated shared refs; output is identical, ownership is cleaner).
  const newAttrs: TemporalAttr[] = existingAttrs.map(a => ({ ...a }));
  for (const [key, value] of Object.entries(enrichment)) {
    const open = newAttrs.find(a => a.key === key && a.effective_to === null);
    if (open && open.value === value) continue; // same value, idempotent
    if (open) open.effective_to = importDate;   // close current entry
    newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
  }

  const mergedMeta: Record<string, unknown> = {
    ...existingMeta,
    ...enrichment,
    ...(role ? { role } : {}),
  };
  const metaChanged = JSON.stringify(existingMeta) !== JSON.stringify(mergedMeta);
  const changed = metaChanged || newAttrs.length !== existingAttrs.length;
  return { changed, temporalAttributes: newAttrs, metadata: mergedMeta };
}
