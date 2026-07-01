// HF-372 Phase B — deterministic rate-table construction (Decision 158, both halves).
//
// For a component backed by a FIXED rate table, the model's job is RECOGNITION: it names the sheet,
// the axes (which grid column holds the row-band labels, which grid columns are the value bands),
// the numeric edges each band label means, the section (variant) selecting this component's rows,
// and the input metric each axis tests. THIS module is the other half: deterministic code CONSTRUCTS
// the executable PrimeNode cascade by reading every cell value from the de-banded grid — the values
// the model previously had to emit cell-by-cell (25-cell matrices at 40-52s each, with a truncation
// class the validator could only partially catch). Construction is exact, byte-identical across runs,
// and takes milliseconds; the truncation class is structurally eliminated for this surface.
//
// Korean Test: the recognition carries exact grid strings AS DATA (matched by equality against the
// grid, any language); the constructor contains zero language-specific literals. No word list.
// HALT-6: a matrix whose structure this contract cannot express is a LOUD, verbatim error
// (`inexpressible` from the model, or a construction failure here) — never a silent fallback to
// LLM graph emission and never a heuristic.

export interface RateBand {
  /** Exact grid text selecting this band's row (rowAxis) — matched by equality after trim. */
  rowLabel?: string;
  /** Exact grid column header carrying this band's cells (columnAxis). */
  gridColumn?: string;
  /** Half-open numeric edges [gte, lt) the band's label means (Decision 127). null = unbounded. */
  gte: number | null;
  lt: number | null;
  /**
   * PHYSICAL disambiguation for stacked blocks (HF-372 EPG-B1 live finding: two 6×5 matrices with
   * IDENTICAL row labels stacked in one sheet, distinguished only by position — the removed section
   * banners name the blocks). 1-based index among the grid rows matching `rowLabel`, in grid order.
   * Absent → the label must match exactly one row.
   */
  occurrence?: number;
}

export interface RateAxis {
  /** The metric this axis tests — a `reference` field name resolved by convergence at calc time. */
  inputField: string;
  /** Unit/scale of the edge constants (mirrors the emitted-DAG compare-constant meta). */
  unit?: string;
  scale?: number | null;
  bands: RateBand[];
}

export interface RateMatrixRecognition {
  /** Exact sheet name whose de-banded grid holds the table. */
  sheet: string;
  /** Exact `__section` value selecting this component's rows (banded grids), or null for all rows. */
  sectionLabel: string | null;
  /** Row axis: bands live on grid ROWS, labeled by the `gridColumn` cell text. */
  rowAxis: RateAxis & { gridColumn: string };
  /** Column axis (2D matrix): bands live on grid COLUMNS. null for a 1D band table. */
  columnAxis: RateAxis | null;
  /** 1D band table: the exact grid column holding each band's value. null for a 2D matrix. */
  valueGridColumn: string | null;
  /** Optional composition: multiply the looked-up cell by this metric (rate × base). */
  applyToField: string | null;
}

/**
 * HF-372 (EPG-B1 live finding, Carry Everything): the de-bander can misclassify a second table's
 * band rows as SUBTOTAL and remove them to the sidecar (BCL "Tablas de Tasas": the C2 captación
 * bands Nivel 1-4 were sidecar'd; only Nivel 5 survived) — the plan's data must not be narrowed by
 * that classification. The CONSTRUCTION grid is therefore assembled from the kept tidy rows AND the
 * data-shaped sidecar rows (SUBTOTAL / NARRATIVE — never banners or headers), in SOURCE ORDER
 * (occurrence selection depends on physical order), positionally keyed by the tidy column names.
 */
export function assembleConstructionGrid(db: {
  columns: string[];
  rows: Record<string, unknown>[];
  result: {
    sidecar: Array<{ sourceRowIndex: number; reason: string; cells: unknown[] }>;
    transformMap: { columnNames: string[]; rows: Array<{ sourceRowIndex: number; tidy: boolean }> };
  };
}): { columns: string[]; rows: Record<string, unknown>[] } {
  const names = db.result.transformMap.columnNames;
  const recovered = new Map<number, Record<string, unknown>>();
  // Section text per SECTION_LABEL sidecar row — recovered rows inherit the LAST label above them,
  // mirroring the de-bander's own __section carry (its surviving data rows got exactly this value).
  const sectionAt = new Map<number, string>();
  for (const s of db.result.sidecar) {
    if (s.reason === 'SECTION_LABEL') {
      const text = s.cells.map(c => String(c ?? '').trim()).filter(Boolean).join(' ');
      if (text) sectionAt.set(s.sourceRowIndex, text);
      continue;
    }
    if (s.reason !== 'SUBTOTAL' && s.reason !== 'NARRATIVE') continue;
    const rec: Record<string, unknown> = {};
    s.cells.forEach((c, i) => { const n = names[i]; if (n) rec[n] = c; });
    if (Object.values(rec).some(v => String(v ?? '').trim() !== '')) recovered.set(s.sourceRowIndex, rec);
  }
  if (recovered.size === 0) return { columns: db.columns, rows: db.rows };
  const hasSectionCol = db.columns.includes('__section');
  const rows: Record<string, unknown>[] = [];
  const tidyQueue = [...db.rows];
  let currentSection = '';
  for (const t of db.result.transformMap.rows) {
    if (sectionAt.has(t.sourceRowIndex)) currentSection = sectionAt.get(t.sourceRowIndex)!;
    if (t.tidy) { const r = tidyQueue.shift(); if (r) rows.push(r); }
    else if (recovered.has(t.sourceRowIndex)) {
      const rec = recovered.get(t.sourceRowIndex)!;
      if (hasSectionCol && rec['__section'] === undefined) rec['__section'] = currentSection;
      rows.push(rec);
    }
  }
  rows.push(...tidyQueue); // defensive: rows the transform map did not cover
  return { columns: db.columns, rows };
}

export class RateMatrixConstructionError extends Error {
  constructor(detail: string) {
    super(`HF-372 rate-matrix construction failed — ${detail}. The model's recognition and the ` +
      `de-banded grid disagree, or the structure is outside the recognition contract (HALT-6): ` +
      `report the case verbatim; there is NO silent fallback to LLM graph emission.`);
    this.name = 'RateMatrixConstructionError';
  }
}

// ── deterministic numeric-cell parsing (documented, unit-tested; throws on unparseable) ──
export function parseNumericCell(v: unknown): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new RateMatrixConstructionError(`non-finite numeric cell ${String(v)}`);
    return v;
  }
  const raw = String(v ?? '').trim();
  if (!raw) throw new RateMatrixConstructionError('empty cell where a rate value was expected');
  const negativeParens = /^\(.*\)$/.test(raw);
  const percent = /%\s*$/.test(raw) || /%/.test(raw);
  const m = raw.match(/-?[\d.,]+/);
  if (!m) throw new RateMatrixConstructionError(`unparseable cell "${raw}" (no numeric token)`);
  let tok = m[0];
  const hasComma = tok.includes(','), hasDot = tok.includes('.');
  if (hasComma && hasDot) {
    // the LAST separator is the decimal separator; the other is thousands
    if (tok.lastIndexOf(',') > tok.lastIndexOf('.')) tok = tok.replace(/\./g, '').replace(',', '.');
    else tok = tok.replace(/,/g, '');
  } else if (hasComma) {
    // a single comma followed by 1-2 digits is a decimal comma; otherwise thousands
    tok = /,\d{1,2}$/.test(tok) && (tok.match(/,/g) ?? []).length === 1
      ? tok.replace(',', '.')
      : tok.replace(/,/g, '');
  } else if (hasDot && (tok.match(/\./g) ?? []).length > 1) {
    // multiple dots = thousands dots (1.234.567) unless the last group is 1-2 digits (decimal)
    const last = tok.lastIndexOf('.');
    tok = /\.\d{1,2}$/.test(tok)
      ? tok.slice(0, last).replace(/\./g, '') + '.' + tok.slice(last + 1)
      : tok.replace(/\./g, '');
  }
  let n = Number(tok);
  if (!Number.isFinite(n)) throw new RateMatrixConstructionError(`unparseable cell "${raw}"`);
  if (percent) n = n / 100;
  if (negativeParens) n = -n;
  return n;
}

// ── recognition-shape validation (loud; the LLM response is untrusted input) ──
function bad(detail: string): never { throw new RateMatrixConstructionError(`invalid recognition: ${detail}`); }

export function parseRateMatrixRecognition(raw: unknown): RateMatrixRecognition {
  if (!raw || typeof raw !== 'object') bad('not an object');
  const r = raw as Record<string, unknown>;
  const sheet = typeof r.sheet === 'string' && r.sheet.trim() ? r.sheet : bad('missing sheet');
  const sectionLabel = typeof r.sectionLabel === 'string' && r.sectionLabel.trim() ? r.sectionLabel : null;
  const parseAxis = (a: unknown, which: string, needGridColumn: boolean): RateAxis & { gridColumn: string } => {
    if (!a || typeof a !== 'object') bad(`${which} axis missing`);
    const ax = a as Record<string, unknown>;
    const inputField = typeof ax.inputField === 'string' && ax.inputField.trim() ? ax.inputField : bad(`${which}.inputField missing`);
    const gridColumn = typeof ax.gridColumn === 'string' ? ax.gridColumn : '';
    if (needGridColumn && !gridColumn) bad(`${which}.gridColumn missing`);
    const bandsRaw = Array.isArray(ax.bands) && ax.bands.length > 0 ? ax.bands : bad(`${which}.bands empty`);
    const bands: RateBand[] = bandsRaw.map((b, i) => {
      const bb = (b ?? {}) as Record<string, unknown>;
      const gte = typeof bb.gte === 'number' ? bb.gte : null;
      const lt = typeof bb.lt === 'number' ? bb.lt : null;
      if (gte === null && lt === null) bad(`${which}.bands[${i}] has neither gte nor lt`);
      if (gte !== null && lt !== null && gte >= lt) bad(`${which}.bands[${i}] edges incoherent (gte ${gte} >= lt ${lt})`);
      const occurrence = typeof bb.occurrence === 'number' && Number.isInteger(bb.occurrence) && bb.occurrence >= 1
        ? bb.occurrence : undefined;
      return {
        rowLabel: typeof bb.rowLabel === 'string' ? bb.rowLabel : undefined,
        gridColumn: typeof bb.gridColumn === 'string' ? bb.gridColumn : undefined,
        gte, lt, occurrence,
      };
    });
    if (bands.filter(b => b.gte === null).length > 1) bad(`${which} has multiple unbounded-below bands`);
    if (bands.filter(b => b.lt === null).length > 1) bad(`${which} has multiple unbounded-above bands`);
    return { inputField, gridColumn, unit: typeof ax.unit === 'string' ? ax.unit : undefined, scale: typeof ax.scale === 'number' ? ax.scale : null, bands };
  };
  const rowAxis = parseAxis(r.rowAxis, 'rowAxis', true);
  rowAxis.bands.forEach((b, i) => { if (!b.rowLabel) bad(`rowAxis.bands[${i}].rowLabel missing`); });
  const columnAxis = r.columnAxis == null ? null : parseAxis(r.columnAxis, 'columnAxis', false);
  if (columnAxis) columnAxis.bands.forEach((b, i) => { if (!b.gridColumn) bad(`columnAxis.bands[${i}].gridColumn missing`); });
  const valueGridColumn = typeof r.valueGridColumn === 'string' && r.valueGridColumn.trim() ? r.valueGridColumn : null;
  if (!columnAxis && !valueGridColumn) bad('neither columnAxis (2D) nor valueGridColumn (1D) present');
  if (columnAxis && valueGridColumn) bad('both columnAxis and valueGridColumn present — ambiguous');
  const applyToField = typeof r.applyToField === 'string' && r.applyToField.trim() ? r.applyToField : null;
  return { sheet, sectionLabel, rowAxis, columnAxis, valueGridColumn, applyToField };
}

// ── construction ──

type Node = Record<string, unknown>;
const constant = (value: number, meta?: { unit?: string; scale?: number | null }): Node =>
  meta && (meta.unit || meta.scale != null)
    ? { prime: 'constant', value, meta: { ...(meta.unit ? { unit: meta.unit } : {}), scale: meta.scale ?? 1, confidence: 0.9 } }
    : { prime: 'constant', value };
const reference = (field: string): Node => ({ prime: 'reference', field });
const compare = (op: 'gte' | 'lt', field: string, edge: number, meta?: { unit?: string; scale?: number | null }): Node =>
  ({ prime: 'compare', op, inputs: [reference(field), constant(edge, meta)] });

/** A band's boolean condition per Decision 127: gte lower AND lt upper; single compare when one edge. */
function bandCondition(axis: RateAxis, band: RateBand): Node {
  const meta = { unit: axis.unit, scale: axis.scale };
  const parts: Node[] = [];
  if (band.gte !== null) parts.push(compare('gte', axis.inputField, band.gte, meta));
  if (band.lt !== null) parts.push(compare('lt', axis.inputField, band.lt, meta));
  return parts.length === 2 ? { prime: 'logical', op: 'and', inputs: parts } : parts[0];
}

/**
 * Build the half-open cascade over an axis: bands sorted by lower edge DESCENDING (unbounded-below
 * last). When the last band is unbounded below, it IS the terminal else (a total function over the
 * axis); otherwise the terminal else is constant(0) (Decision 127 / grammar terminal completeness).
 */
function buildCascade(axis: RateAxis, bands: RateBand[], valueOf: (band: RateBand) => Node): Node {
  const sorted = [...bands].sort((a, b) => (b.gte ?? -Infinity) - (a.gte ?? -Infinity));
  const bottomUnbounded = sorted.length > 0 && sorted[sorted.length - 1].gte === null;
  let node: Node = bottomUnbounded ? valueOf(sorted[sorted.length - 1]) : { prime: 'constant', value: 0 };
  const explicit = bottomUnbounded ? sorted.slice(0, -1) : sorted;
  for (let i = explicit.length - 1; i >= 0; i--) {
    node = { prime: 'conditional', condition: bandCondition(axis, explicit[i]), then: valueOf(explicit[i]), else: node };
  }
  return node;
}

export interface ConstructedRateMatrix {
  intent: Node;
  /** Exact number of CELL constants read from the grid (rows × cols for 2D; rows for 1D). */
  cellCount: number;
  /** Every cell value read from the grid (deterministic build order) — for evidence/diffing. */
  cells: Array<{ rowLabel: string; gridColumn: string; value: number }>;
}

export function constructRateMatrixIntent(
  rec: RateMatrixRecognition,
  grid: { columns: string[]; rows: Record<string, unknown>[] },
): ConstructedRateMatrix {
  // 1. select this component's rows (variant section, if banded)
  let rows = grid.rows;
  if (rec.sectionLabel !== null) {
    if (!grid.columns.includes('__section')) throw new RateMatrixConstructionError(`recognition names sectionLabel "${rec.sectionLabel}" but the grid has no __section column (sheet "${rec.sheet}")`);
    rows = rows.filter(r => String(r['__section'] ?? '').trim() === rec.sectionLabel!.trim());
    if (rows.length === 0) throw new RateMatrixConstructionError(`no grid rows carry __section "${rec.sectionLabel}" (sheet "${rec.sheet}")`);
  }
  if (!grid.columns.includes(rec.rowAxis.gridColumn)) {
    throw new RateMatrixConstructionError(`rowAxis.gridColumn "${rec.rowAxis.gridColumn}" is not a grid column of sheet "${rec.sheet}" (columns: ${grid.columns.join(', ')})`);
  }

  // 2. resolve each row band to EXACTLY ONE grid row by its exact label (+ occurrence for stacked blocks)
  const rowFor = new Map<RateBand, Record<string, unknown>>();
  for (const band of rec.rowAxis.bands) {
    const matches = rows.filter(r => String(r[rec.rowAxis.gridColumn] ?? '').trim() === band.rowLabel!.trim());
    if (band.occurrence !== undefined) {
      if (matches.length < band.occurrence) {
        throw new RateMatrixConstructionError(`row band "${band.rowLabel}" occurrence ${band.occurrence} requested but only ${matches.length} grid rows match in sheet "${rec.sheet}"${rec.sectionLabel ? ` section "${rec.sectionLabel}"` : ''}`);
      }
      rowFor.set(band, matches[band.occurrence - 1]);
    } else {
      if (matches.length !== 1) {
        throw new RateMatrixConstructionError(`row band "${band.rowLabel}" matched ${matches.length} grid rows (need exactly 1 — give each band its "occurrence" when identical label blocks stack) in sheet "${rec.sheet}"${rec.sectionLabel ? ` section "${rec.sectionLabel}"` : ''}`);
      }
      rowFor.set(band, matches[0]);
    }
  }

  // 3. read every cell from the grid and build the cascade(s)
  const cells: ConstructedRateMatrix['cells'] = [];
  let intent: Node;
  if (rec.columnAxis) {
    for (const b of rec.columnAxis.bands) {
      if (!grid.columns.includes(b.gridColumn!)) throw new RateMatrixConstructionError(`columnAxis band column "${b.gridColumn}" is not a grid column of sheet "${rec.sheet}"`);
    }
    const cellValue = (rowBand: RateBand, colBand: RateBand): number => {
      const v = parseNumericCell(rowFor.get(rowBand)![colBand.gridColumn!]);
      cells.push({ rowLabel: rowBand.rowLabel!, gridColumn: colBand.gridColumn!, value: v });
      return v;
    };
    intent = buildCascade(rec.rowAxis, rec.rowAxis.bands, rowBand =>
      buildCascade(rec.columnAxis!, rec.columnAxis!.bands, colBand => constant(cellValue(rowBand, colBand))));
  } else {
    if (!grid.columns.includes(rec.valueGridColumn!)) throw new RateMatrixConstructionError(`valueGridColumn "${rec.valueGridColumn}" is not a grid column of sheet "${rec.sheet}"`);
    const cellValue = (rowBand: RateBand): number => {
      const v = parseNumericCell(rowFor.get(rowBand)![rec.valueGridColumn!]);
      cells.push({ rowLabel: rowBand.rowLabel!, gridColumn: rec.valueGridColumn!, value: v });
      return v;
    };
    intent = buildCascade(rec.rowAxis, rec.rowAxis.bands, rowBand => constant(cellValue(rowBand)));
  }

  // 4. optional composition: looked-up rate × base metric
  if (rec.applyToField) {
    intent = { prime: 'arithmetic', op: 'multiply', inputs: [intent, reference(rec.applyToField)] };
  }

  return { intent, cellCount: cells.length, cells };
}
