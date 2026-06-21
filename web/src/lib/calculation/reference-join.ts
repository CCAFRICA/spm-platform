/**
 * HF-329 — Reference-sheet resolution via a classified join path.
 *
 * The convergence resolver (resolveColumnFromBatch in calculation/run/route.ts) reads a
 * bound column from the entity-keyed batch cache. When a convergence-bound column lives in
 * NO entity-keyed batch — because it is on a dimensional REFERENCE sheet keyed by its own
 * dimensional value (e.g. Meridian's Datos_Flota_Hub keyed by Hub) — the resolver used to
 * hard-stop (column_in_no_batch → null), zeroing the component. The data exists, the binding
 * is valid, and the join path is classified: the entity's own rows carry the dimensional key
 * (a reference_key value) that the reference sheet is keyed by.
 *
 * This follows that join. The key is discovered by VALUE-OVERLAP between the entity's row
 * values and the reference rows' column values — never by column name, field name, or language
 * (Decision 154 / Korean Test; HF-329 HALT-1). Among the reference columns whose values overlap
 * an entity value, the MOST SPECIFIC join wins: the one selecting the fewest reference rows
 * (a many-to-one dimensional key — one hub row per period — over a coarse one like region),
 * tie-broken by highest distinct cardinality. The matched reference row(s) are returned so the
 * caller applies the binding-recognised reduction (snapshot/sum/...) exactly as for entity rows.
 *
 * Period scoping is the caller's responsibility and is already applied upstream: committedData
 * is fetched source_date-scoped to the calc period, so `referenceRows` are the period's rows.
 * (§6A residual: a period-AGNOSTIC reference sheet — no source_date — would need explicit
 * temporal matching; not the Meridian shape.)
 *
 * Returns null when there is no reference data, no reference row carries the column, or no
 * value-overlap join exists (HF-329 C6 graceful fallback — identical to the prior null).
 */
export function resolveReferenceJoinRows(
  column: string,
  entityRows: Array<Record<string, unknown>>,
  referenceRows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> | null {
  if (referenceRows.length === 0) return null;

  // reference rows that actually carry the bound column (the sheet it lives in)
  const refRows = referenceRows.filter(rd => rd[column] !== null && rd[column] !== undefined);
  if (refRows.length === 0) return null;

  // the distinct non-empty values the entity carries (its candidate dimensional keys)
  const entityValues = new Set<string>();
  for (const rd of entityRows) {
    for (const [k, v] of Object.entries(rd)) {
      if (k.startsWith('_')) continue; // skip _sheetName / _rowIndex sentinels
      const s = String(v ?? '').trim();
      if (s) entityValues.add(s);
    }
  }
  if (entityValues.size === 0) return null;

  // candidate join columns on the reference side: those whose values overlap an entity value.
  // Choose the join selecting the FEWEST reference rows (most specific), tie → highest cardinality.
  const refCols = new Set<string>();
  for (const rd of refRows) for (const k of Object.keys(rd)) if (!k.startsWith('_')) refCols.add(k);
  let best: Array<Record<string, unknown>> | null = null;
  let bestCount = Infinity;
  let bestCard = -1;
  for (const col of Array.from(refCols)) {
    if (col === column) continue; // never key on the measure being read
    const distinct = new Set<string>();
    let key: string | null = null;
    for (const rd of refRows) {
      const s = String(rd[col] ?? '').trim();
      if (!s) continue;
      distinct.add(s);
      if (key === null && entityValues.has(s)) key = s;
    }
    if (key === null) continue; // no overlap with the entity on this column
    const matched = refRows.filter(rd => String(rd[col] ?? '').trim() === key);
    if (matched.length === 0) continue;
    if (matched.length < bestCount || (matched.length === bestCount && distinct.size > bestCard)) {
      best = matched; bestCount = matched.length; bestCard = distinct.size;
    }
  }
  return best;
}
