/**
 * HF-373 Phase I (D4) — the plan's disambiguating SOURCE-SHEET identity (display data only,
 * never a predicate). Two Casa Diaz plans legitimately share the workbook banner title
 * "COMISIONES DE MAQUINARIA" (two machinery sheets); the source sheet tells them apart.
 * Reads metadata.sourceSheet (persisted at plan construction since HF-373) with a
 * backfill parse of the HF-372 supersession key metadata.contentUnitId
 * ("file.xlsx::SHEET::idx::split") for plans written before it. Pure + client-safe.
 */
export function planSourceSheet(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const explicit = metadata.sourceSheet;
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit.trim();
  const cu = metadata.contentUnitId;
  if (typeof cu === 'string') {
    const parts = cu.split('::');
    if (parts.length >= 2 && parts[1].trim().length > 0) return parts[1].trim();
  }
  return null;
}
