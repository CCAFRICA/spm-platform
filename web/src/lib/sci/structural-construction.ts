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
  /** Behavior-preservation parity (DD-7): fill EVERY recovered column with '' when the cell is empty,
   *  exactly as `sheet_to_json(ws,{defval:''})` does. A CLEAN sheet (header at row 1, all columns named,
   *  no sections/carry-down) then produces byte-identical records to the legacy keyed read — the
   *  de-bander is the identity transform on a clean sheet (singular path, no regression). */
  defvalEmpty?: boolean;
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
    // A column is 'measure' when its DATA cells are mostly numeric, else 'identity' (a barely-populated
    // one stays 'sparse'). A label column that merely catches a stray numeric (e.g. a subtotal value) is
    // NOT mis-driven by it, because rowStats counts toward measPop only a NUMERIC cell in a measure
    // column — a text label sitting in a measure column contributes nothing, so section/header detection
    // on that column is not suppressed (that is the load-bearing guard, not a numeric-support threshold).
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
    // measPop counts a real MEASURE VALUE — a NUMERIC cell in a measure column. A TEXT cell in a measure
    // column (a header label like "% AUTORIZADO", or a section label that happens to sit in that column)
    // is NOT a measure value and must not count — otherwise it suppresses header/section detection.
    else if (profiles[c]?.kind === 'measure' && num) measPop++;
  }
  return { populated, identPop, measPop, numCells, maxTextLen, textCells };
}

const activeColCount = (profiles: ColProfile[]) => profiles.filter((p) => p.kind !== 'sparse').length || 1;

function classifyRow(row: unknown[], profiles: ColProfile[], nCols: number): RowClass {
  const s = rowStats(row, profiles, nCols);
  if (s.populated === 0) return 'BLANK';
  const active = activeColCount(profiles);
  const firstPop = row.find((c) => isNonEmpty(c));
  const firstText = firstPop !== undefined && !isNumeric(firstPop);

  // SUBTOTAL: aggregate columns filled, identity columns empty (a summary line, no entity).
  if (s.identPop === 0 && s.measPop >= 1 && s.textCells === 0) return 'SUBTOTAL';
  // SUBTOTAL (aggregate-with-label): a NARROW row that is mostly measure numbers with at most one text
  // cell — a per-section "totals" line. Real records carry several descriptive text cells (policy /
  // formula / observations); a totals line carries ≤1. Structural (cell counts), no word match.
  if (s.measPop >= 1 && s.numCells >= 2 && s.textCells <= 1 && s.populated <= 4) return 'SUBTOTAL';

  // NARRATIVE: a single long sentence-like text cell, no measures, ≤1 identity cell.
  if (s.measPop === 0 && s.numCells === 0 && s.populated <= 2 && s.maxTextLen >= 30) return 'NARRATIVE';

  // SECTION_LABEL: a NARROW row (≤2 populated) whose FIRST populated cell is TEXT (a branch/section
  // label) and which fills NO measure column. An incidental second cell (a date serial, or an authorizer
  // name landing in an identity column) is allowed — it does not make the row a record. A header sub-row
  // (≥3 populated, or a text-only row sitting above numeric data) is separated by the block-context pass.
  if (s.populated <= 2 && s.measPop === 0 && firstText && s.maxTextLen >= 2) {
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

  // ── BLOCK-CONTEXT PASS (positional, structural — not word matching). A per-row rule cannot tell a
  //    header sub-row (text-only, sits ABOVE numeric data) from a text-only DATA row (a sheet whose
  //    records are textual). The discriminator is POSITION relative to numeric data: a text-only row that
  //    PRECEDES a numeric data-anchor (a row carrying a real number in a measure column) within a short
  //    window is a header sub-row → HEADER; a text-only row with no numeric data after it is genuine text
  //    data (left as classified). Section labels (narrow, text-first) are already separated by classifyRow.
  const isAnchor = (i: number): boolean => { const a = rowStats(rows[i], profiles, nCols); return a.numCells >= 1 && a.measPop >= 1; };
  const anchorAhead = (i: number, fwd: number): boolean => {
    let seen = 0;
    for (let j = i + 1; j < rows.length && seen < fwd; j++) {
      if (classes[j] === 'BLANK') continue;
      if (isAnchor(j)) return true;
      seen++;
    }
    return false;
  };
  for (let i = 0; i < rows.length; i++) {
    if (classes[i] !== 'HEADER' && classes[i] !== 'DATA') continue;
    const s = rowStats(rows[i], profiles, nCols);
    if (s.numCells === 0 && s.populated >= 2 && anchorAhead(i, 3)) classes[i] = 'HEADER';
  }

  // title BANNER = the first non-blank row when it is a single populated cell (a sheet title above the
  // header). Sidecar'd, never lifted as a data section and never merged into the header band.
  const firstNonBlank = classes.findIndex((c) => c !== 'BLANK');
  let bannerIdx = -1;
  if (firstNonBlank >= 0) {
    const bs = rowStats(rows[firstNonBlank], profiles, nCols);
    if (bs.populated === 1 && bs.numCells === 0) bannerIdx = firstNonBlank;
  }

  // ── HF-366: all-text records sheet — recover the header/data split the numeric heuristic cannot ──
  //    classifyRow (2a) labels a mostly-text, footprint-covering row a HEADER, which is right for a real
  //    header. But a records sheet whose cells are ALL non-numeric — an employee/customer master with
  //    alphanumeric IDs (EMP001), text-formatted dates (2020-01-15), branch/category codes, and NO measure
  //    value anywhere — has no 'measure' column, so every data row has measPop===0 AND numCells===0 and
  //    trips the SAME rule. No row is DATA, firstDataIdx is -1, canonicalBand swallows the whole sheet, and
  //    every record is sidecar'd as one giant header → zero records (the BCL Plantilla regression). A sheet
  //    with ANY numeric data keeps its anchor-based separation untouched — this guard is skipped entirely.
  //    Structural discriminator (no word/language match, Korean-clean): a real header labels the columns and
  //    REPEATS verbatim as a per-section header (Casa Diaz FORANEAS); a text DATA row carries DISTINCT values.
  //    So when nothing is DATA, keep the LEADING HEADER row as the header and demote every LATER HEADER row
  //    that is not byte-equal to it (a genuine repeated header — equal — stays sidecar'd). Runs BEFORE header
  //    recovery so firstDataIdx, canonicalBand, and the walk all see the corrected classes.
  if (classes.findIndex((c, i) => c === 'DATA' && i !== bannerIdx) < 0) {
    let lead = 0;
    while (lead < rows.length && (classes[lead] !== 'HEADER' || lead === bannerIdx)) lead++;
    if (lead < rows.length) {
      const rowSig = (i: number): string => {
        const cells: (string | null)[] = [];
        for (let c = 0; c < nCols; c++) cells.push(isNonEmpty(rows[i][c]) ? String(rows[i][c]).trim() : null);
        return JSON.stringify(cells);
      };
      const headerSig = rowSig(lead);
      for (let i = lead + 1; i < rows.length; i++) {
        if (classes[i] === 'HEADER' && rowSig(i) !== headerSig) classes[i] = 'DATA';
        // HF-372 (Metas Mensuales class): on a ZERO-DATA sheet, a 'SUBTOTAL' row cannot be a
        // subtotal — there is nothing to total; it IS the data (currency-string cells under the
        // header tripped the subtotal heuristic and the whole sheet's records were sidecar'd).
        // Same guard scope as HF-366: sheets with ANY real DATA row keep their SUBTOTAL
        // classification untouched (this branch never runs for them).
        if (classes[i] === 'SUBTOTAL') classes[i] = 'DATA';
      }
    }
  }

  const observations: StructuralObservation[] = [];

  // ── header recovery (2a–2b): the CANONICAL header band is the contiguous run of HEADER rows
  //    immediately above the FIRST data row (skipping a blank gap), bounded by a section label / data.
  //    The column name is the column-wise merge of THAT band only — NOT a union of every header-ish row
  //    on the sheet (which over-concatenates banner/section text). Per-section repeated header bands are
  //    handled as repeated headers (sidecar), not merged into the name. ──
  const firstDataIdx = classes.findIndex((c, i) => c === 'DATA' && i !== bannerIdx);
  // canonical header band = ALL header rows above the first data row (excluding the title banner). The
  // section labels interleaved between them (FORANEAS's per-branch labels) are NOT headers and are
  // skipped; per-section REPEATED header bands sit AFTER the first data row → sidecar, never merged into
  // the names. A column with no header cell anywhere still gets a positional name (never __EMPTY).
  let canonicalBand: number[] = classes.map((c, i) => (c === 'HEADER' ? i : -1)).filter((i) => i >= 0 && (firstDataIdx < 0 || i < firstDataIdx) && i !== bannerIdx);
  if (canonicalBand.length === 0 && firstDataIdx > 0) {
    // No HEADER was classified above the first data row — e.g. a NARROW header (a row whose only ≤2
    // populated cells made it look like a section label). The row(s) directly above the data ARE the
    // header: promote the contiguous non-blank run to HEADER (so they are not lifted as a data section).
    let i = firstDataIdx - 1;
    while (i >= 0 && classes[i] === 'BLANK') i--;
    const promoted: number[] = [];
    while (i >= 0 && classes[i] !== 'BLANK' && classes[i] !== 'DATA' && i !== bannerIdx) { classes[i] = 'HEADER'; promoted.unshift(i); i--; }
    canonicalBand = promoted;
  }
  const headerRowIdx: number[] = classes.map((c, i) => (c === 'HEADER' ? i : -1)).filter((i) => i >= 0);
  const bands: number[][] = [];
  for (const i of headerRowIdx) {
    const last = bands[bands.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else bands.push([i]);
  }
  if (canonicalBand.length === 0 && bands.length) canonicalBand = bands[0].filter((i) => i !== bannerIdx);

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

  // forward state for section lift (full-grid only — D2)
  let currentSection: string | null = null;

  const headerSet = new Set(headerRowIdx);
  const canonicalSet = new Set(canonicalBand);

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
      // carry-down (2d): AUTHORITATIVE merged ranges ONLY — a merged cell genuinely spans its rows. NO
      // forward-fill heuristic: guessing a blank identity cell from the row above FABRICATES data and
      // breaks behavior-preservation on a clean sheet (the __section lift already carries the branch /
      // section context onto every record without inventing cell values).
      if (prof?.kind === 'identity' && !isNonEmpty(v) && opts.fullGrid) {
        const mv = mergeFill.get(`${i},${c}`);
        if (isNonEmpty(mv)) { v = mv; carried[rawNames[c]] = mv; }
      }
      if (isNonEmpty(v)) rec[rawNames[c]] = v;
      // DD-7 parity: a PRESENT-but-blank cell (e.g. a space-padded fixed-width field) is preserved RAW
      // exactly as sheet_to_json(defval:'') would; only an ABSENT cell (null) becomes '' (the defval).
      else if (opts.defvalEmpty) rec[rawNames[c]] = rows[i][c] == null ? '' : rows[i][c];
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
