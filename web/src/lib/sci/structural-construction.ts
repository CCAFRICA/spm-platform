// OB-254 — Structural Construction Stage (the de-bander). Deterministic, zero LLM (Decision 158),
// zero language-literal gates (AP-25 / Korean Test). Turns a raw 2-D cell grid (banded OR clean) into
// one or more TIDY content units: a single recovered header, real column names, a lifted `__section`
// column where sections existed, junk (banner/repeated-header/subtotal/blank) moved to a sidecar
// (Carry Everything — retained, never deleted), carry-down filled, duplicate headers disambiguated,
// narrative blocks captured as a documentation unit. A clean single-header sheet is the DEGENERATE
// output of the SAME path (singular path — no banded/clean branch).
//
// Every classification is STRUCTURAL: populated-cell counts, per-column numeric/text type ratios,
// positional footprint, structural equality. No header text, no domain/language token, decides any
// outcome. (A token list MAY be consulted as a non-binding confidence hint only; none is load-bearing.)

export type RowClass = 'HEADER' | 'SECTION_LABEL' | 'DATA' | 'SUBTOTAL' | 'NARRATIVE' | 'BLANK';

export type ColumnKind = 'identity' | 'measure' | 'sparse';

export interface RemovedRow {
  sourceRowIndex: number;
  reason: Exclude<RowClass, 'DATA' | 'HEADER'> | 'REPEATED_HEADER' | 'HEADER';
  cells: unknown[];
}

/** D3 — the per-row transform map carried into the windowed-commit (commit APPLIES it, never re-derives). */
export interface RowTransform {
  sourceRowIndex: number;
  unit: number;                 // tidy-unit index this row belongs to (-1 = sidecar)
  tidy: boolean;                // true = record; false = removed (sidecar) or header
  reason?: RemovedRow['reason'];
  section?: string | null;      // the __section value lifted onto this record
  carriedIdentity?: Record<string, unknown>; // identity cells forward-filled onto this record
}

export interface TransformMap {
  columnNames: string[];        // raw-column-index → tidy column name (positional index)
  sectionColumn: string | null; // '__section' if any section was lifted, else null
  rows: RowTransform[];
}

export interface StructuralObservation {
  kind: string;                 // signal_type-ready structural observation kind
  detail: Record<string, unknown>;
}

export interface TidyUnit {
  kind: 'records' | 'documentation';
  header: string[];             // tidy column names (includes __section last, if present)
  rows: Record<string, unknown>[];
  blockIndex: number;
  headerRowIndices: number[];   // source rows that formed the header band (records units)
  sectionColumn: string | null;
}

export interface ConstructionResult {
  units: TidyUnit[];
  sidecar: RemovedRow[];
  observations: StructuralObservation[];
  transformMap: TransformMap;
  fullGrid: boolean;            // D2 — did we have the full grid (vs windowed sample only)?
  bandedBeyondCeiling: boolean; // D2 — over-ceiling sheet whose sample shows banded structure
  classes: RowClass[];          // per-source-row classification (debug/EPG)
}

export interface ConstructOptions {
  /** false when only a bounded OB-251 window of a large sheet is available (D2). Header recovery still
   *  runs; full-grid operations (section lift / carry-down / subtotal+blank removal / narrative) are
   *  skipped, and a banded-structure-in-sample signal is raised instead of silently degenerating. */
  fullGrid: boolean;
  /** XLSX merged-cell ranges (the authoritative carry-down source) — {s:{r,c}, e:{r,c}} 0-based. */
  mergedRanges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  sheetName?: string;
}

const SECTION = '__section';

// ─────────────────────────── structural primitives (Korean-clean) ───────────────────────────

function isNonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

/** A value reads as a NUMBER (after stripping currency/percent/thousands). A range/multi-value cell
 *  (e.g. "5%-10%-13%", "0.5% A 2.0%") does NOT parse → text (preserved verbatim, flagged by 2g). */
function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string') return false;
  const t = v.trim().replace(/[$€£%\s]/g, '');
  if (t === '' || !/^[+-]?\d[\d,.]*$/.test(t)) return false;
  return Number.isFinite(Number(t.replace(/,/g, '')));
}

/** A multi-value / range cell: contains ≥2 numbers separated by non-numeric runs (range/list). */
function isMultiValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const nums = v.match(/\d[\d,.]*/g);
  return !!nums && nums.length >= 2 && !isNumeric(v);
}

function textLen(v: unknown): number {
  return isNonEmpty(v) ? String(v).trim().length : 0;
}

// ─────────────────────────── column type profiling ───────────────────────────

interface ColProfile {
  kind: ColumnKind;
  numericRatio: number;
  populatedRows: number;
}

/** Build per-column type profiles from the data region. Bootstrap: candidate data rows are the rows
 *  with the richest population AND containing numbers (the record signature); column kind is then the
 *  numeric ratio over those rows. Pure structure — never a column name. */
function columnProfiles(grid: unknown[][], nCols: number): ColProfile[] {
  const activeThreshold = 2;
  const populatedPerCol = new Array(nCols).fill(0);
  for (const row of grid) for (let c = 0; c < nCols; c++) if (isNonEmpty(row[c])) populatedPerCol[c]++;
  const activeCols = populatedPerCol.filter((p) => p >= activeThreshold).length || 1;

  // candidate data rows: populated >= 35% of active columns AND at least one numeric cell.
  const candidate: unknown[][] = grid.filter((row) => {
    let pop = 0, nums = 0;
    for (let c = 0; c < nCols; c++) { if (isNonEmpty(row[c])) pop++; if (isNumeric(row[c])) nums++; }
    return pop >= Math.max(2, activeCols * 0.35) && nums >= 1;
  });

  const profiles: ColProfile[] = [];
  for (let c = 0; c < nCols; c++) {
    let nonEmpty = 0, numeric = 0;
    for (const row of candidate) { if (isNonEmpty(row[c])) { nonEmpty++; if (isNumeric(row[c])) numeric++; } }
    const numericRatio = nonEmpty > 0 ? numeric / nonEmpty : 0;
    let kind: ColumnKind = 'sparse';
    if (populatedPerCol[c] >= activeThreshold) kind = numericRatio > 0.5 ? 'measure' : 'identity';
    profiles.push({ kind, numericRatio, populatedRows: populatedPerCol[c] });
  }
  return profiles;
}

// ─────────────────────────── row classification (2a) ───────────────────────────

interface RowStats { populated: number; identPop: number; measPop: number; numCells: number; maxTextLen: number; textCells: number; }

function rowStats(row: unknown[], profiles: ColProfile[], nCols: number): RowStats {
  let populated = 0, identPop = 0, measPop = 0, numCells = 0, maxTextLen = 0, textCells = 0;
  for (let c = 0; c < nCols; c++) {
    const v = row[c];
    if (!isNonEmpty(v)) continue;
    populated++;
    const num = isNumeric(v);
    if (num) numCells++; else { textCells++; maxTextLen = Math.max(maxTextLen, textLen(v)); }
    if (profiles[c]?.kind === 'identity') identPop++;
    else if (profiles[c]?.kind === 'measure') { measPop++; }
  }
  return { populated, identPop, measPop, numCells, maxTextLen, textCells };
}

const activeColCount = (profiles: ColProfile[]) => profiles.filter((p) => p.kind !== 'sparse').length || 1;

function classifyRow(row: unknown[], profiles: ColProfile[], nCols: number): RowClass {
  const s = rowStats(row, profiles, nCols);
  if (s.populated === 0) return 'BLANK';
  const active = activeColCount(profiles);

  // SUBTOTAL: aggregate columns filled, identity columns empty (a summary line, no entity).
  if (s.identPop === 0 && s.measPop >= 1 && s.textCells === 0) return 'SUBTOTAL';

  // NARRATIVE: a single long sentence-like text cell, no measures, ≤1 identity cell.
  if (s.measPop === 0 && s.numCells === 0 && s.populated <= 2 && s.maxTextLen >= 30) return 'NARRATIVE';

  // SECTION_LABEL: a NARROW text label (≤2 populated cells) with NO numbers and a short value. A header
  // sub-row populates ≥3 aligned columns → it stays HEADER (below); a data row carries a number → DATA.
  // So "no number + ≤2 cells + short" is a positional label (branch/section), not a record or a header
  // sub-row. Pure structure (cell count + numeric presence + length), no word match.
  if (s.populated <= 2 && s.numCells === 0 && s.maxTextLen < 40 && s.textCells >= 1) {
    return 'SECTION_LABEL';
  }

  // HEADER: text-heavy, few/no numeric cells, spans a meaningful share of the active footprint.
  //   A header row labels columns → its cells are predominantly text and NOT data numbers. We require
  //   it to be mostly-text AND to cover ≳ a third of active columns OR ≥3 text cells with zero measures.
  const mostlyText = s.numCells <= Math.max(1, Math.floor(s.populated * 0.2));
  const coversFootprint = s.populated >= Math.max(2, active * 0.33);
  if (mostlyText && s.measPop === 0 && (coversFootprint || s.textCells >= 3)) return 'HEADER';
  if (mostlyText && coversFootprint && s.numCells === 0) return 'HEADER';

  return 'DATA';
}

// ─────────────────────────── construction ───────────────────────────

export function constructStructure(grid: unknown[][], opts: ConstructOptions): ConstructionResult {
  // trim trailing all-blank rows (the SheetJS grid pads to the used range)
  let end = grid.length;
  while (end > 0 && grid[end - 1].every((c) => !isNonEmpty(c))) end--;
  const rows = grid.slice(0, end);
  const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const profiles = columnProfiles(rows, nCols);
  const classes: RowClass[] = rows.map((r) => classifyRow(r, profiles, nCols));

  const observations: StructuralObservation[] = [];

  // ── header recovery (2a–2b): the CANONICAL header band is the contiguous run of HEADER rows
  //    immediately above the FIRST data row (skipping a blank gap), bounded by a section label / data.
  //    The column name is the column-wise merge of THAT band only — NOT a union of every header-ish row
  //    on the sheet (which over-concatenates banner/section text). Per-section repeated header bands are
  //    handled as repeated headers (sidecar), not merged into the name. ──
  const headerRowIdx: number[] = classes.map((c, i) => (c === 'HEADER' ? i : -1)).filter((i) => i >= 0);
  const bands: number[][] = [];
  for (const i of headerRowIdx) {
    const last = bands[bands.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else bands.push([i]);
  }
  const firstDataIdx = classes.indexOf('DATA');
  let canonicalBand: number[] = [];
  if (firstDataIdx > 0) {
    let i = firstDataIdx - 1;
    while (i >= 0 && classes[i] === 'BLANK') i--;        // skip a blank gap directly above the data
    while (i >= 0 && classes[i] === 'HEADER') { canonicalBand.unshift(i); i--; } // contiguous header band
  }
  if (canonicalBand.length === 0 && bands.length) canonicalBand = bands[0]; // fallback: first header band

  // name per column = column-wise merge of the CANONICAL band cells only
  const perColParts: string[][] = Array.from({ length: nCols }, () => []);
  for (const i of canonicalBand) {
    for (let c = 0; c < nCols; c++) {
      const v = rows[i][c];
      if (isNonEmpty(v)) { const t = String(v).trim(); if (!perColParts[c].includes(t)) perColParts[c].push(t); }
    }
  }
  // tidy column names (positional index → name); a data-bearing column with no header cell gets a
  // structural positional name (never '__EMPTY'); disambiguate duplicates by positional suffix.
  const rawNames: string[] = [];
  const seen = new Map<string, number>();
  for (let c = 0; c < nCols; c++) {
    let base = perColParts[c].join(' ').replace(/\s+/g, ' ').trim();
    if (base === '') base = `col_${c + 1}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    rawNames.push(n === 1 ? base : `${base}__${n}`);
  }

  // Header rows outside the canonical band (per-section repeated headers, secondary banners) are
  // sidecar'd as REPEATED_HEADER in the walk (canonicalSet membership decides) — they never become a
  // record and never pollute the column names (which come from the canonical band only).

  // ── merged-cell carry-down source (2d): map a covered identity cell → its merge's top-left value ──
  const mergeFill = new Map<string, unknown>(); // `${r},${c}` → value
  for (const m of opts.mergedRanges ?? []) {
    const v = rows[m.s.r]?.[m.s.c];
    if (!isNonEmpty(v)) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (!(r === m.s.r && c === m.s.c)) mergeFill.set(`${r},${c}`, v);
  }

  const sidecar: RemovedRow[] = [];
  const transformRows: RowTransform[] = [];
  const recordUnit: TidyUnit = { kind: 'records', header: [...rawNames], rows: [], blockIndex: 0, headerRowIndices: canonicalBand, sectionColumn: null };
  let anySection = false;

  // narrative runs → a documentation unit (collected after the main walk)
  const narrativeRows: number[] = [];

  // forward state for section + carry-down (full-grid only — D2)
  let currentSection: string | null = null;
  const lastIdentity: Record<number, unknown> = {}; // raw col index → last seen identity value (for carry-down)

  const headerSet = new Set(headerRowIdx);
  const canonicalSet = new Set(canonicalBand);
  // The title BANNER is the first non-blank row when it is a single populated cell (a sheet title sitting
  // above the header). It is sidecar'd and NEVER lifted as a data section (positional, structural — not a
  // word match). All OTHER section labels DO lift, including FORANEAS's per-branch labels that precede
  // their repeated header band.
  const firstNonBlank = classes.findIndex((c) => c !== 'BLANK');
  let bannerIdx = -1;
  if (firstNonBlank >= 0) {
    const s = rowStats(rows[firstNonBlank], profiles, nCols);
    if (s.populated === 1 && s.numCells === 0) bannerIdx = firstNonBlank;
  }

  for (let i = 0; i < rows.length; i++) {
    const cls = classes[i];
    if (i === bannerIdx) { // title banner — retained in sidecar, never a record, never a lifted section
      sidecar.push({ sourceRowIndex: i, reason: 'SECTION_LABEL', cells: rows[i].slice(0, nCols) });
      transformRows.push({ sourceRowIndex: i, unit: -1, tidy: false, reason: 'SECTION_LABEL' });
      continue;
    }
    if (cls === 'HEADER') {
      const reason = canonicalSet.has(i) ? 'HEADER' : 'REPEATED_HEADER';
      sidecar.push({ sourceRowIndex: i, reason, cells: rows[i].slice(0, nCols) });
      transformRows.push({ sourceRowIndex: i, unit: -1, tidy: false, reason });
      continue;
    }
    if (cls === 'BLANK') { sidecar.push({ sourceRowIndex: i, reason: 'BLANK', cells: [] }); transformRows.push({ sourceRowIndex: i, unit: -1, tidy: false, reason: 'BLANK' }); continue; }
    if (cls === 'SUBTOTAL') { sidecar.push({ sourceRowIndex: i, reason: 'SUBTOTAL', cells: rows[i].slice(0, nCols) }); transformRows.push({ sourceRowIndex: i, unit: -1, tidy: false, reason: 'SUBTOTAL' }); continue; }
    if (cls === 'NARRATIVE') { narrativeRows.push(i); transformRows.push({ sourceRowIndex: i, unit: 1, tidy: false, reason: 'NARRATIVE' }); continue; }
    if (cls === 'SECTION_LABEL') {
      if (opts.fullGrid) {
        currentSection = String(rows[i].find((c) => isNonEmpty(c)) ?? '').trim();
        anySection = true;
      }
      sidecar.push({ sourceRowIndex: i, reason: 'SECTION_LABEL', cells: rows[i].slice(0, nCols) });
      transformRows.push({ sourceRowIndex: i, unit: -1, tidy: false, reason: 'SECTION_LABEL', section: currentSection });
      continue;
    }
    // DATA → a record
    const rec: Record<string, unknown> = {};
    const carried: Record<string, unknown> = {};
    for (let c = 0; c < nCols; c++) {
      if (headerSet.has(i)) break;
      let v: unknown = rows[i][c];
      const prof = profiles[c];
      if (prof?.kind === 'identity') {
        if (!isNonEmpty(v) && opts.fullGrid) {
          // carry-down (2d): authoritative merged range first, else forward-fill within the run.
          const mv = mergeFill.get(`${i},${c}`);
          if (isNonEmpty(mv)) { v = mv; carried[rawNames[c]] = mv; }
          else if (isNonEmpty(lastIdentity[c])) { v = lastIdentity[c]; carried[rawNames[c]] = lastIdentity[c]; }
        }
        if (isNonEmpty(v)) lastIdentity[c] = v;
      }
      // measure columns are NEVER forward-filled (only identity carry-down)
      if (isNonEmpty(v)) rec[rawNames[c]] = v;
      if (isMultiValue(rows[i][c])) observations.push({ kind: 'structure:multi_value_cell', detail: { row: i, column: rawNames[c], value: String(rows[i][c]) } });
    }
    if (opts.fullGrid && anySection) rec[SECTION] = currentSection;
    recordUnit.rows.push(rec);
    transformRows.push({ sourceRowIndex: i, unit: 0, tidy: true, section: opts.fullGrid && anySection ? currentSection : null, carriedIdentity: Object.keys(carried).length ? carried : undefined });
  }

  if (anySection) { recordUnit.sectionColumn = SECTION; recordUnit.header.push(SECTION); }

  const units: TidyUnit[] = [recordUnit];

  // documentation unit (2f) — the narrative run, captured (not discarded)
  if (narrativeRows.length > 0 && opts.fullGrid) {
    const docRows = narrativeRows.map((i) => ({ line: String(rows[i].find((c) => isNonEmpty(c)) ?? '').trim(), sourceRow: i }));
    units.push({ kind: 'documentation', header: ['line', 'sourceRow'], rows: docRows, blockIndex: 1, headerRowIndices: [], sectionColumn: null });
  } else if (narrativeRows.length > 0) {
    // windowed (no full grid) but narrative present in sample → still capture
    for (const i of narrativeRows) sidecar.push({ sourceRowIndex: i, reason: 'NARRATIVE', cells: rows[i].slice(0, nCols) });
  }

  // ── observations (3a raw material) ──
  observations.unshift({ kind: 'structure:header_recovered', detail: { sheet: opts.sheetName, headerRows: canonicalBand, columns: rawNames.length, autoGenerated: rawNames.some((n) => n.startsWith('col_')) } });
  observations.push({ kind: 'structure:blocks', detail: { headerBands: bands.length, sectionsLifted: anySection ? countSections(transformRows) : 0, sidecarByReason: tally(sidecar) } });

  // D2 — over-ceiling sheet whose sample shows banded structure (section/subtotal) → flag, don't degrade silently
  const bandedBeyondCeiling = !opts.fullGrid && classes.some((c) => c === 'SECTION_LABEL' || c === 'SUBTOTAL');
  if (bandedBeyondCeiling) observations.push({ kind: 'structure:banded_beyond_ceiling', detail: { sheet: opts.sheetName, note: 'banded structure in windowed sample; full-grid de-band skipped (over OB-251 cell ceiling)' } });

  const transformMap: TransformMap = { columnNames: anySection ? [...rawNames, SECTION] : rawNames, sectionColumn: anySection ? SECTION : null, rows: transformRows };

  return { units, sidecar, observations, transformMap, fullGrid: opts.fullGrid, bandedBeyondCeiling, classes };
}

function tally(sidecar: RemovedRow[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const r of sidecar) t[r.reason] = (t[r.reason] ?? 0) + 1;
  return t;
}
function countSections(transforms: RowTransform[]): number {
  return new Set(transforms.filter((t) => t.tidy && t.section).map((t) => t.section)).size;
}
