// HF-295 Part 2 — SCI per-file import failure contract + translation.
//
// One coherent invariant: per-file independence WITH per-file accountability. When a
// file fails to import, it must explain itself in terms a business user can act on —
// what failed, at what stage, expected vs. received, what to do, and what it blocks.
//
// Korean Test: this module maps internal error *classes* to i18n KEYS. It contains NO
// language literals, NO filename string-matching, and NO per-file/per-tenant lookup.
// A new/unknown signal resolves to the `unknown` class with a default message naming
// the stage — never a raw dump, never a silent pass.
//
// Collision note (see ADR §1): the SHAPE here is the shared dependency consumed by the
// dispatch keystone (Layer A), and by the presentation (Layer B2). It lands first.

// ── Structural error classes (what failed) ──────────────────────────────────
export type ImportErrorClass =
  | 'file_unreadable'         // storage download / parse failed        → stage: reading
  | 'columns_not_understood'  // header comprehension / classification  → stage: understanding
  | 'records_unmatched'       // entity resolution produced no matches  → stage: matching
  | 'data_not_saved'          // committed_data insert failed           → stage: saving
  | 'not_finalized'           // settle stalled — units never terminal  → stage: finalizing
  | 'unknown';                // anything else — default, names the stage

// ── User-facing stage vocabulary (where it failed) ──────────────────────────
export type ImportStageKey = 'reading' | 'understanding' | 'matching' | 'saving' | 'finalizing';

const STAGE_BY_CLASS: Record<ImportErrorClass, ImportStageKey> = {
  file_unreadable: 'reading',
  columns_not_understood: 'understanding',
  records_unmatched: 'matching',
  data_not_saved: 'saving',
  not_finalized: 'finalizing',
  unknown: 'finalizing',
};

// ── The render-ready failure payload ────────────────────────────────────────
// Strings are i18n KEY PATHS resolved by the presentation layer via useLocale().t().
// `fileName` is a dynamic value rendered as-is. `technicalDetail` is raw internal text
// shown only in a collapsible secondary line (for the architect) — never the primary.
export interface ImportFileFailure {
  fileName: string;
  errorClass: ImportErrorClass;
  stageKey: ImportStageKey;
  reasonKey: string;
  expectedKey: string;
  recommendationKey: string;
  blocksKey: string;
  technicalDetail?: string;
}

// Structural classification of a raw internal signal → ImportErrorClass.
// Inputs are the only signals the client can observe: an HTTP status from the bulk
// POST, the server's failed_interpretation `failureClass`, a thrown message, or a
// stall (settle exhausted without all units terminal). Structural only — no filenames.
export function classifyImportError(input: {
  httpStatus?: number | null;
  failureClass?: string | null;
  rawError?: string | null;
  stalled?: boolean;
}): ImportErrorClass {
  const { httpStatus, failureClass, rawError, stalled } = input;

  // 1) Named comprehension/server classes carried on the spine take precedence.
  const fc = (failureClass ?? '').toLowerCase();
  if (fc) {
    if (fc.includes('parse')) return 'file_unreadable';
    if (fc.includes('schema') || fc.includes('mismatch') || fc.includes('interpret') || fc.includes('comprehen') || fc.includes('classif')) return 'columns_not_understood';
    if (fc.includes('entity') || fc.includes('match') || fc.includes('resolve')) return 'records_unmatched';
    if (fc.includes('insert') || fc.includes('commit') || fc.includes('save') || fc.includes('persist')) return 'data_not_saved';
    if (fc.includes('timeout')) return 'not_finalized';
    return 'unknown';
  }

  // 2) HTTP-level: the server 500s only on a file download failure (execute-bulk:199).
  if (httpStatus != null && httpStatus >= 500) return 'file_unreadable';

  // 3) Thrown/network message text — structural keyword match, not filename match.
  const re = (rawError ?? '').toLowerCase();
  if (re) {
    if (re.includes('download') || re.includes('storage') || re.includes('parse') || re.includes('workbook')) return 'file_unreadable';
    if (re.includes('insert') || re.includes('commit') || re.includes('persist')) return 'data_not_saved';
    if (re.includes('entity') || re.includes('match')) return 'records_unmatched';
  }

  // 4) A stall with no other signal = started but never finalized.
  if (stalled) return 'not_finalized';

  return 'unknown';
}

// THE one translation function: error class → user payload (i18n keys). One place.
export function toImportFileFailure(
  fileName: string,
  errorClass: ImportErrorClass,
  technicalDetail?: string,
): ImportFileFailure {
  return {
    fileName,
    errorClass,
    stageKey: STAGE_BY_CLASS[errorClass],
    reasonKey: `sci.import.failure.${errorClass}.reason`,
    expectedKey: `sci.import.failure.${errorClass}.expected`,
    recommendationKey: `sci.import.failure.${errorClass}.recommendation`,
    blocksKey: 'sci.import.failure.blocks', // shared, param-driven ({{successCount}}/{{totalCount}})
    technicalDetail: technicalDetail?.slice(0, 600) || undefined,
  };
}

// Derive a human file label from a contentUnitId (`<prefixedSource>::<sheet>::<idx>`),
// stripping the upload prefix the same way ExecutionProgress does. Falls back when the
// id is not in the expected shape.
export function deriveFileLabel(contentUnitId: string, fallback: string): string {
  const parts = contentUnitId.split('::');
  if (parts.length >= 2) {
    const sf = parts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '');
    if (sf) return sf;
  }
  return fallback;
}
