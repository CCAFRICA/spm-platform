// HF-256: canonical file-format resolution for the ingestion path.
//
// Decision 82 / DS-005 boundary: documents (PDF/PPTX/DOCX) are PLAN sources routed to
// the Plan Agent; tabular files (XLSX/XLS/CSV/TSV) carry structured data. The execute
// path resolves a file's format from its name/path so it parses spreadsheets as
// workbooks and routes documents to the format-aware plan pipeline instead of throwing
// on a non-workbook.
//
// Korean Test: this is STRUCTURAL format dispatch keyed on file extension — the same
// extension-as-structural-property approach already used in plan-interpretation.ts.
// It is NOT a filename/language/domain literal. The document-extension set is the single
// canonical declaration (mirrors SCIUpload's DOCUMENT_EXTENSIONS); consumers import it
// rather than re-declaring extension literals.

/** Document formats — routed to the Plan Agent (self-extracted by the plan pipeline). */
export const DOCUMENT_EXTENSIONS = ['pdf', 'pptx', 'docx'] as const;

/** Extract the lowercase extension (no dot) from a storage path or file name. */
export function extensionOf(pathOrName: string): string {
  return pathOrName.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * True when the file is a document (PDF/PPTX/DOCX) — a PLAN source that must NOT be
 * workbook-parsed and instead routes to the plan pipeline's format-aware extractor.
 */
export function isDocumentPath(pathOrName: string): boolean {
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(extensionOf(pathOrName));
}

/** True when the file is a spreadsheet (workbook-parseable: xlsx/xls/csv/tsv or other). */
export function isSpreadsheetPath(pathOrName: string): boolean {
  return !isDocumentPath(pathOrName);
}
