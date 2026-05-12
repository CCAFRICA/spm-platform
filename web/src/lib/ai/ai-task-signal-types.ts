/**
 * HF-219 — AI task → signal_type mapping.
 *
 * Small closed enum (16 entries) per architect directive guidance:
 * "small closed enums are OK; the REGISTRY pattern is what's eradicated"
 * (HF-219 directive Out-of-Scope clause re: SignalSource enum).
 *
 * Pre-HF-219 this map lived in `signal-registry.ts` via `registerAITaskMapping()`
 * and `lookupAITaskSignalType()`. The registry pattern is eradicated per AP-26.
 * The data — a stable 16-entry mapping bound to the AITaskType type union — moves
 * to this standalone module as a plain Record lookup. No register/lookup framework;
 * just a constant table.
 *
 * To add a new AI task: extend AITaskType in `./types.ts` AND add an entry below.
 * Lookup returns the mapped signal_type or null (caller decides fallback).
 */

const AI_TASK_TO_SIGNAL_TYPE: Record<string, string> = {
  file_classification: 'classification:ai_file_classification',
  sheet_classification: 'classification:ai_sheet_classification',
  document_analysis: 'classification:ai_document_analysis',
  field_mapping: 'comprehension:ai_field_mapping',
  field_mapping_second_pass: 'comprehension:ai_field_mapping_second_pass',
  import_field_mapping: 'comprehension:ai_import_field_mapping',
  header_comprehension: 'comprehension:ai_header_comprehension',
  plan_interpretation: 'comprehension:ai_plan_interpretation',
  workbook_analysis: 'comprehension:ai_workbook_analysis',
  entity_extraction: 'comprehension:ai_entity_extraction',
  convergence_mapping: 'convergence:ai_convergence_mapping',
  anomaly_detection: 'convergence:ai_anomaly_detection',
  recommendation: 'lifecycle:ai_recommendation',
  narration: 'lifecycle:ai_narration',
  dashboard_assessment: 'lifecycle:ai_dashboard_assessment',
  natural_language_query: 'lifecycle:ai_natural_language_query',
};

export function lookupAITaskSignalType(aiTaskType: string): string | null {
  return AI_TASK_TO_SIGNAL_TYPE[aiTaskType] ?? null;
}
