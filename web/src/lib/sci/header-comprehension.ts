// Synaptic Content Ingestion — Header Comprehension Service
// OB-160B — LLM contextual understanding of column headers
// ONE LLM call per file upload — all sheets, all headers, sample values.
// Korean Test compliant: headers are content understood in real-time, not matched against dictionaries.
// Graceful fallback: if LLM unavailable, returns null. Phase A structural heuristics stand alone.
// HF-100: Migrated to AIService — single code path for all AI calls.

import type {
  ContentProfile,
  HeaderComprehension,
  HeaderInterpretation,
  HeaderComprehensionMetrics,
  FieldIdentity,
  ComprehensionFailureClass,
} from './sci-types';
import { getAIService } from '@/lib/ai/ai-service';
// OB-215 (Agent D): telemetry labels reflect the resolver's decision, not a stale literal.
import { resolveModel } from '@/lib/ai/model-policy';
import { lookupAtoms, writeAtoms, type AtomExpression } from './atom-flywheel';
import { computeAtomFingerprint } from './atom-fingerprint';
import { decomposeComprehension, type ResidueComprehender, type ComprehendedInterpretation } from './decomposed-comprehension';
// OB-203 Phase 4 (R3): atom recognition-confidence signals (fire-and-forget).
import { fireSignalBatch, buildAtomRecognitionSignal } from './comprehension-signal-vocabulary';

// OB-203 Phase 1: classify a thrown comprehension error structurally (no domain words).
export function classifyThrownFailure(error: unknown): ComprehensionFailureClass {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted') || msg.includes('etimedout')) {
    return 'timeout';
  }
  return 'unclassified_failure';
}

// ============================================================
// INPUT TYPES
// ============================================================

export interface HeaderComprehensionInput {
  sheets: Array<{
    sheetName: string;
    columns: string[];
    sampleRows: Record<string, unknown>[];  // 3-5 rows per sheet
    rowCount: number;
  }>;
}

// ============================================================
// SHEETS DESCRIPTION BUILDER
// ============================================================

function buildSheetsDescription(input: HeaderComprehensionInput): string {
  return input.sheets.map(sheet => {
    const sampleStr = sheet.sampleRows.slice(0, 3).map((row, i) => {
      const vals = sheet.columns.map(col => `${col}: ${JSON.stringify(row[col] ?? null)}`);
      return `  Row ${i + 1}: { ${vals.join(', ')} }`;
    }).join('\n');

    return `Sheet "${sheet.sheetName}" (${sheet.rowCount} rows, ${sheet.columns.length} columns):
  Columns: ${sheet.columns.join(', ')}
  Sample data:
${sampleStr}`;
  }).join('\n\n');
}

// ============================================================
// LLM CALL VIA AISERVICE
// ============================================================

export interface LLMHeaderResponse {
  sheets: Record<string, { columns: Record<string, {
    // OB-231: free-form characterization channels (no enumeration, no validation).
    characterization?: string;
    dataExpectation?: string;
    identifies?: string;
    data_nature?: string;
    // HF-368: the model's BARE structural primitives (the fixed roles/natures it names).
    scope_role?: string;
    nature_role?: string;
    plan_role?: string; // HF-372 Phase C: the bare plan primitive (rule_parameter | none)
    relationships?: string[];
    confidence: number;
  }> }>;
  crossSheetInsights: string[];
}

// OB-203 Phase 1 (DI-4): the call's outcome is a discriminated union — success carries
// the result; failure carries a NAMED structural class + duration. `null` (silent
// fallback) is retired here.
type LLMHeaderOutcome =
  // HF-350: `failedColumns` lists columns whose batch permanently failed (after retry)
  // when comprehension proceeded with the rest (partial success). Absent/undefined on a
  // clean single-call or all-batches-succeeded result. Consumers that ignore it are
  // unaffected (the failed columns are simply absent from `result` → re-attempted next import).
  | { ok: true; result: LLMHeaderResponse; duration: number; failedColumns?: string[] }
  | { ok: false; failureClass: ComprehensionFailureClass; duration: number };

// ── HF-350: Header Comprehension column batching (P-HC-BATCH) ───────────────────────
// `callLLMForHeadersSingle` sends ALL of a call's columns to the LLM at once with
// maxTokens 8192. Each column's free-form interpretation is ~130 output tokens, so the
// response truncates into malformed JSON at ~63+ columns (production: 87 cols → parse
// failure + ~116s → Vercel 300s timeout). `HC_COLUMN_BATCH_SIZE` bounds the per-call
// column count so the output always fits with valid JSON; it scales to any column count
// by adding batches (SR-2). 25 leaves a ~2.5× token margin (~3000 tokens/batch) and runs
// ~15-20s/batch. It is a tuning constant (telemetry in the diagnostic log lets the
// architect retune from production), NOT a magic number, and is STRUCTURAL — by column
// count only, never by column name or type (Korean Test).
// HF-372 Phase E: env-overridable (SCI_HC_BATCH_SIZE) — the per-batch generation time scales with
// column count (~3s/col at current API throughput with the full recognition channels), and a
// NON-STREAMED response is a QUIET socket until done: environments with a ~60s idle cut (local
// NAT; some proxies) kill batches ≥ ~18 columns. 25 stays the default (prod Vercel sockets hold);
// the knob lets an operator match the environment without a code change.
const HC_COLUMN_BATCH_SIZE = Number(process.env.SCI_HC_BATCH_SIZE ?? '') > 0 ? Number(process.env.SCI_HC_BATCH_SIZE) : 25;
// Bounded parallelism for the batch calls: wall-clock ≈ slowest batch while staying
// within the Anthropic concurrency/rate budget.
const HC_BATCH_CONCURRENCY = 4;

type HeaderSingleCaller = (input: HeaderComprehensionInput) => Promise<LLMHeaderOutcome>;

// Split a (possibly multi-sheet) input into batches of at most `batchSize` columns TOTAL,
// preserving each column's sheet + sampleRows context. Structural: chunks (sheet,column)
// pairs by count — no column-name or type logic (Korean Test). Each column lands in exactly
// one batch.
export function splitIntoColumnBatches(input: HeaderComprehensionInput, batchSize: number): HeaderComprehensionInput[] {
  const pairs: Array<{ sheetName: string; column: string }> = [];
  const sheetMeta = new Map<string, { sampleRows: Record<string, unknown>[]; rowCount: number }>();
  for (const s of input.sheets) {
    sheetMeta.set(s.sheetName, { sampleRows: s.sampleRows, rowCount: s.rowCount });
    for (const c of s.columns) pairs.push({ sheetName: s.sheetName, column: c });
  }
  const batches: HeaderComprehensionInput[] = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    const chunk = pairs.slice(i, i + batchSize);
    const bySheet = new Map<string, string[]>();
    for (const p of chunk) {
      if (!bySheet.has(p.sheetName)) bySheet.set(p.sheetName, []);
      bySheet.get(p.sheetName)!.push(p.column);
    }
    batches.push({
      sheets: Array.from(bySheet.entries()).map(([sheetName, columns]) => ({
        sheetName, columns, sampleRows: sheetMeta.get(sheetName)!.sampleRows, rowCount: sheetMeta.get(sheetName)!.rowCount,
      })),
    });
  }
  return batches;
}

// Shallow-merge K batch responses into one, keyed by (sheet, column). Each column appears
// in exactly one batch → no dedup, no conflict resolution. crossSheetInsights concatenated.
// The merged structure is identical to a hypothetical single-call result.
export function mergeBatchResults(results: LLMHeaderResponse[]): LLMHeaderResponse {
  const merged: LLMHeaderResponse = { sheets: {}, crossSheetInsights: [] };
  for (const r of results) {
    for (const [sheetName, sheetData] of Object.entries(r.sheets ?? {})) {
      if (!merged.sheets[sheetName]) merged.sheets[sheetName] = { columns: {} };
      Object.assign(merged.sheets[sheetName].columns, sheetData?.columns ?? {});
    }
    if (Array.isArray(r.crossSheetInsights)) merged.crossSheetInsights.push(...r.crossSheetInsights);
  }
  return merged;
}

// HF-350: the per-call LLM body (formerly `callLLMForHeaders`). One LLM call for the
// columns in `input`. `callLLMForHeaders` (below) keeps each call's column count bounded.
async function callLLMForHeadersSingle(input: HeaderComprehensionInput): Promise<LLMHeaderOutcome> {
  const startTime = Date.now();
  try {
    const sheetsDescription = buildSheetsDescription(input);

    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'header_comprehension',
      input: { sheetsDescription },
      options: { maxTokens: 8192, responseFormat: 'json' },
    }, false); // No signal capture for HC — it runs on every import

    const duration = Date.now() - startTime;

    // AIService returns { parseError: true } on JSON parse failure
    if (response.result.parseError) {
      console.log(`[SCI] Header comprehension JSON parse failed (AIService fallback). duration=${duration}ms`);
      return { ok: false, failureClass: 'parse_failure', duration };
    }

    const parsed = response.result as unknown as LLMHeaderResponse;
    if (!parsed.sheets) {
      console.log(`[SCI] Header comprehension response missing 'sheets' key. duration=${duration}ms`);
      return { ok: false, failureClass: 'schema_mismatch', duration };
    }

    console.log(`[SCI] Header comprehension completed in ${duration}ms via AIService`);
    return { ok: true, result: parsed, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const failureClass = classifyThrownFailure(error);
    console.log(`[SCI] Header comprehension error (${failureClass}, falling back to heuristics):`, error instanceof Error ? error.message : String(error));
    return { ok: false, failureClass, duration };
  }
}

// HF-350: header-comprehension entry — bounds the per-LLM-call column count by batching.
// ≤ HC_COLUMN_BATCH_SIZE columns → ONE call (byte-identical to the pre-HF-350 path; small
// files / single-column SQL sheets are untouched). More → split into column batches, call
// each (bounded-parallel) with one retry, and shallow-merge. A batch that permanently fails
// (after its retry) does not abort the others (C2 error isolation): its columns are reported
// and absent from the merged result (re-attempted next import). `ok:false` only if EVERY
// batch failed. `singleCaller` is injectable for deterministic testing. The result is
// structurally identical to what a single call would return if the LLM could handle it.
export async function callLLMForHeaders(
  input: HeaderComprehensionInput,
  singleCaller: HeaderSingleCaller = callLLMForHeadersSingle,
): Promise<LLMHeaderOutcome> {
  const totalCols = input.sheets.reduce((n, s) => n + s.columns.length, 0);
  if (totalCols <= HC_COLUMN_BATCH_SIZE) {
    // Small input: one call. The residue path's own retry loop still applies (unchanged).
    return singleCaller(input);
  }

  const batches = splitIntoColumnBatches(input, HC_COLUMN_BATCH_SIZE);
  const start = Date.now();

  // Each batch: one call, one retry on failure (P4). Independent — a batch failure is local.
  const callBatchWithRetry = async (b: HeaderComprehensionInput): Promise<{ ok: boolean; result?: LLMHeaderResponse; columns: string[] }> => {
    const columns = b.sheets.flatMap(s => s.columns);
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = await singleCaller(b);
      if (outcome.ok) return { ok: true, result: outcome.result, columns };
    }
    return { ok: false, columns };
  };

  // Bounded-parallel pool (P5): a shared cursor hands batches to HC_BATCH_CONCURRENCY workers.
  const results: Array<{ ok: boolean; result?: LLMHeaderResponse; columns: string[] }> = new Array(batches.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= batches.length) return;
      results[i] = await callBatchWithRetry(batches[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(HC_BATCH_CONCURRENCY, batches.length) }, () => worker()));
  const duration = Date.now() - start;

  const okResults = results.filter(r => r.ok).map(r => r.result!);
  const failedColumns = results.filter(r => !r.ok).flatMap(r => r.columns);

  if (okResults.length === 0) {
    // Every batch failed — fail loud (the caller writes one failed_interpretation).
    console.log(`[SCI] Header comprehension: ALL ${batches.length} column-batch(es) failed (${totalCols} cols, ${duration}ms).`);
    return { ok: false, failureClass: 'parse_failure', duration };
  }
  if (failedColumns.length > 0) {
    // C2: report the gap; proceed with the comprehended columns (no atoms for the failed ones).
    console.log(`[SCI] Header comprehension: ${failedColumns.length} column(s) in failed batch(es) NOT comprehended (proceeding with ${totalCols - failedColumns.length}/${totalCols}): ${failedColumns.join(', ')}`);
  }
  console.log(`[SCI] Header comprehension completed in ${duration}ms via ${batches.length} column-batch(es) of ≤${HC_COLUMN_BATCH_SIZE} (${totalCols} cols${failedColumns.length ? `, ${failedColumns.length} failed` : ''})`);
  return { ok: true, result: mergeBatchResults(okResults), duration, failedColumns: failedColumns.length ? failedColumns : undefined };
}

// ============================================================
// VOCABULARY BINDING INTERFACE (Phase E wires storage)
// ============================================================

// HF-254 Fix 1 (Principle 1 / AP-7): `lookupVocabularyBindings` DELETED. It
// fabricated columnRole='unknown', confidence=0.85, confirmationCount=2 to wrap
// the meaning-only recalled strings into VocabularyBinding objects, then the
// Step-2 skip gate in comprehendHeaders used those rigged values to skip the LLM —
// resolving every role to 'unknown' and corrupting warm imports to entity. The
// vocabulary cache is no longer an LLM-skip authority (that is solely the
// fingerprint flywheel). The cache is completed as an additive classification
// prior in HF-254 Phase 6 (consumed in the resolver via recallVocabularyBindings),
// never re-fabricating a role.

// HF-254 Fix 3a: `prepareVocabularyBindings` DELETED. It was uncalled scaffolding (the
// "Phase E wires storage" comment never wired). Cache B is completed inline at
// emitFlywheelSignals, which builds the role-bearing vocabulary_bindings map
// ({semanticMeaning, columnRole, confidence}) directly from the trace HC — the same
// source as the fingerprint fieldBindings enrichment (AP-17). No dead scaffolding remains.

// ============================================================
// HF-372 Phase C — BARE-PRIMITIVE READERS (registry subtraction).
// The OB-231 bilingual word-regexes over the model's prose (incl. the scopeIsEntity
// seller/vendedor/employee synonym list — a Korean Test violation) are DELETED. Each predicate
// reads the model's OWN bare primitive by EQUALITY against the fixed structural set. Absent
// primitive → false (the structural pattern arms these feed keep their own detection).
// ============================================================

function natureIsTemporal(interp: HeaderInterpretation): boolean {
  return interp.nature_role === 'temporal';
}
function natureIsMeasure(interp: HeaderInterpretation): boolean {
  return interp.nature_role === 'measure';
}
function natureIsName(interp: HeaderInterpretation): boolean {
  return interp.nature_role === 'name';
}
function natureIsIdentifier(interp: HeaderInterpretation): boolean {
  return interp.nature_role === 'identifier';
}
function scopeIsEntity(interp: HeaderInterpretation): boolean {
  return interp.scope_role === 'entity';
}
function scopeIsReference(interp: HeaderInterpretation): boolean {
  return interp.scope_role === 'reference';
}

// ============================================================
// COMPREHENSION FROM LLM RESPONSE
// ============================================================

function buildComprehensionFromLLM(
  llmResult: LLMHeaderResponse,
  duration: number,
  crossSheetInsights: string[],
): Map<string, HeaderComprehension> {
  const result = new Map<string, HeaderComprehension>();

  for (const [sheetName, sheetData] of Object.entries(llmResult.sheets)) {
    const interpretations = new Map<string, HeaderInterpretation>();

    for (const [colName, interp] of Object.entries(sheetData.columns)) {
      interpretations.set(colName, {
        columnName: colName,
        characterization: interp.characterization || 'unknown',
        dataExpectation: interp.dataExpectation || 'unknown',
        data_nature: interp.data_nature || 'unknown',
        identifies: interp.identifies || 'nothing',
        // HF-368: carry the model's bare primitives through verbatim (undefined if the model
        // omitted them → the bridge fails loud; never defaulted here). HF-372: plan_role too.
        scope_role: interp.scope_role,
        nature_role: interp.nature_role,
        plan_role: interp.plan_role,
        relationships: Array.isArray(interp.relationships) ? interp.relationships : [],
        confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
      });
    }

    result.set(sheetName, {
      interpretations,
      crossSheetInsights,
      llmCallDuration: duration,
      llmModel: resolveModel('header_comprehension'),
      fromVocabularyBinding: false,
    });
  }

  return result;
}

// HF-254 Fix 1: `buildComprehensionFromBindings` DELETED — it materialized the
// fabricated `fromVocabularyBinding: true` comprehension that the skip gate returned.
// With the skip gate gone, comprehendHeaders always produces comprehension from the
// LLM (or null when the LLM is unavailable).

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Comprehend column headers across all sheets in one LLM call.
 * Returns Map<sheetName, HeaderComprehension> or null if LLM unavailable.
 */
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string,
): Promise<{
  comprehensions: Map<string, HeaderComprehension> | null;
  metrics: HeaderComprehensionMetrics;
}> {
  const allColumns = input.sheets.flatMap(s => s.columns);

  // HF-254 Fix 1: the vocabulary-binding LLM-skip gate (former Step 1-2) is REMOVED.
  // The fingerprint flywheel is the sole LLM-skip authority; comprehendHeaders is only
  // invoked for sheets the flywheel did NOT skip (analyze's `sheetsNeedingHC`), so it
  // must always produce real interpretation — never a fabricated 'unknown' skip.
  void tenantId; // retained in signature for call-site compatibility

  // Call LLM via AIService for all headers
  const llmResponse = await callLLMForHeaders(input);

  if (!llmResponse.ok) {
    // OB-203 Phase 1 (DI-4): comprehension failed — carry the NAMED structural class +
    // duration up so the route writes one `failed_interpretation` signal per affected
    // unit. This replaces the silent `null` fallback (the unit is no longer presented as
    // if comprehended).
    const metrics: HeaderComprehensionMetrics = {
      llmCalled: false,
      llmCallDuration: llmResponse.duration,
      llmModel: null,
      columnsInterpreted: 0,
      columnsFromBindings: 0,
      columnsFromLLM: 0,
      averageConfidence: 0,
      crossSheetInsightCount: 0,
      timestamp: new Date().toISOString(),
      failure: { failureClass: llmResponse.failureClass, durationMs: llmResponse.duration },
    };
    return { comprehensions: null, metrics };
  }

  const crossSheetInsights = llmResponse.result.crossSheetInsights || [];
  const comprehensions = buildComprehensionFromLLM(
    llmResponse.result,
    llmResponse.duration,
    crossSheetInsights,
  );

  const metrics: HeaderComprehensionMetrics = {
    llmCalled: true,
    llmCallDuration: llmResponse.duration,
    llmModel: resolveModel('header_comprehension'),
    columnsInterpreted: allColumns.length,
    columnsFromBindings: 0,
    columnsFromLLM: allColumns.length,
    averageConfidence: computeAverageConfidence(comprehensions),
    crossSheetInsightCount: crossSheetInsights.length,
    timestamp: new Date().toISOString(),
  };

  return { comprehensions, metrics };
}

// ============================================================
// OB-203 Phase 2 (5b) — DECOMPOSED COMPREHENSION DISPATCH
//
// Replaces the single all-sheets LLM call. Per sheet: atoms (FULL rows — Deviation 2, load-bearing
// for DI-2/DI-8 accuracy) → known atoms claim roles (no LLM) → only the novel residue is
// comprehended (bounded, one repair retry) → a residue failure marks THAT sheet failed_interpretation,
// siblings proceed (DI-4). `profile.headerComprehension` is reconstructed to the EXACT current shape:
// known columns get the Tier-1-precedent structural label (Deviation 1, DI-10), novel columns get the
// full LLM interpretation (so suppressFalseCurrency fires on novel/LLM columns, not on recognized ones).
// Atoms accumulate via writeAtoms only for succeeded units (hold a — failed runs don't seed the store).
// ============================================================

/**
 * OB-203 Phase 5 — dev-only comprehension fault-injection gate (hard-gated; testable).
 * TRUE only when ALL hold: not a production build, OB203_FAULT_SHEET is set, and it names this sheet.
 * Used to force a genuine `failed_interpretation` through the production failure path for the CLT.
 */
export function ob203FaultInjected(sheetName: string): boolean {
  return process.env.NODE_ENV !== 'production'
    && !!process.env.OB203_FAULT_SHEET
    && sheetName === process.env.OB203_FAULT_SHEET;
}

export async function runDecomposedComprehension(
  profiles: Map<string, ContentProfile>,
  sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; rowCount: number }>,
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  // OB-203 D13: streamed per-unit completion (sheetName + status) as each sheet finishes.
  onUnitDone?: (u: { sheetName: string; status: 'recognized' | 'comprehended' | 'failed_interpretation'; recognizedFraction: number; novelCount: number; failureClass?: ComprehensionFailureClass }) => void,
): Promise<{
  metrics: HeaderComprehensionMetrics;
  perSheetFailure: Map<string, ComprehensionFailureClass>;
  provenance: Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>;
}> {
  // 1. atom fingerprints per column on FULL rows (Deviation 2), collect hashes for the lookup.
  const hashes: string[] = [];
  for (const s of sheets) for (const c of s.columns) hashes.push(computeAtomFingerprint(c, s.rows.map(r => r[c])).hash);

  // 2. read-before-derive: known atoms for this tenant.
  const known = await lookupAtoms(tenantId, hashes, supabaseUrl, supabaseServiceKey);

  // 3. residue comprehender: callLLMForHeaders on the bounded (novel-only, sample-bounded) input,
  //    one repair retry, then failed_interpretation.
  let llmDispatches = 0;
  let totalLlmDuration = 0;
  const residue: ResidueComprehender = async (req) => {
    // OB-203 Phase 5 — DEV-ONLY fault injection (hard-gated). When OB203_FAULT_SHEET names this
    // sheet, short-circuit to a genuine comprehension failure BEFORE the LLM call, so the failure
    // traverses the REAL Phase 1 path (decomposed dispatch → perSheetFailure → failed_interpretation
    // → emitComprehensionFailureSignals). Inert without the env var; NEVER active in production
    // builds (NODE_ENV guard). Durable test instrumentation for the observer/resolution CLT.
    if (ob203FaultInjected(req.sheetName)) {
      console.warn(`[OB-203][fault-injection] forcing comprehension failure for sheet=${req.sheetName} (OB203_FAULT_SHEET)`);
      return { ok: false, failureClass: 'parse_failure' };
    }
    let lastFailure: ComprehensionFailureClass = 'unclassified_failure';
    for (let attempt = 0; attempt < 2; attempt++) {
      llmDispatches++;
      const outcome = await callLLMForHeaders({ sheets: [{ sheetName: req.sheetName, columns: req.columns, sampleRows: req.sampleRows, rowCount: req.rowCount }] });
      totalLlmDuration += outcome.duration;
      if (outcome.ok) {
        const sheetData = outcome.result.sheets[req.sheetName];
        if (sheetData?.columns) {
          const interpretations: Record<string, ComprehendedInterpretation> = {};
          for (const [col, interp] of Object.entries(sheetData.columns)) {
            interpretations[col] = {
              characterization: interp.characterization || 'unknown',
              dataExpectation: interp.dataExpectation || 'unknown',
              data_nature: interp.data_nature || 'unknown',
              identifies: interp.identifies || 'nothing',
              scope_role: interp.scope_role,
              nature_role: interp.nature_role,
              plan_role: interp.plan_role, // HF-372 Phase C
              relationships: Array.isArray(interp.relationships) ? interp.relationships : [],
              confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
            };
          }
          return { ok: true, interpretations };
        }
        lastFailure = 'schema_mismatch';
      } else {
        lastFailure = outcome.failureClass;
      }
    }
    return { ok: false, failureClass: lastFailure };
  };

  // 4. per-unit decomposed dispatch (atoms computed on full rows inside the planner).
  const results = await decomposeComprehension(sheets, known, residue, 0.5, (r) => {
    onUnitDone?.({
      sheetName: r.sheetName,
      status: r.status,
      recognizedFraction: r.recognizedFraction,
      novelCount: r.comprehendedColumns?.length ?? 0,
      failureClass: r.failure?.failureClass,
    });
  });

  // 5. reconstruct headerComprehension + enhance; collect failures, provenance, atoms-to-write.
  const perSheetFailure = new Map<string, ComprehensionFailureClass>();
  const provenance = new Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>();
  const atomsToWrite: Array<{ atom: ReturnType<typeof computeAtomFingerprint>; role: string; roleConfidence: number } & AtomExpression> = [];
  let columnsInterpreted = 0, confTotal = 0, confCount = 0;

  for (const r of results) {
    provenance.set(r.sheetName, { recognizedFraction: r.recognizedFraction, novelCount: r.comprehendedColumns?.length ?? 0, llmCalled: r.status !== 'recognized' });
    if (r.status === 'failed_interpretation') {
      perSheetFailure.set(r.sheetName, r.failure!.failureClass);
      continue; // no headerComprehension set — Phase 1 surface (failed_interpretation) handles it
    }
    const profile = profiles.get(r.sheetName);
    if (!profile) continue;

    const interpretations = new Map<string, HeaderInterpretation>();
    // HF-341 R4 (the core comprehension-eradication fix): a CLAIMED (cached) atom reconstructs the LLM's
    // FULL recognition from the stored OB-231 EXPRESSION — `identifies` (entity-scope), `characterization`,
    // `relationships` — NOT a fabricated `identifies:'nothing'`. The prior hard-coded 'nothing' destroyed
    // the entity-scope signal on warm imports, so a cached sheet classified differently than the same sheet
    // fresh (the 10/12 MIR Ventas/Cobranza target misclassification). Legacy atoms (no stored expression)
    // fall back to the old behavior: identifies undefined → 'nothing', characterization → the role label.
    for (const k of r.knownColumns) {
      interpretations.set(k.columnName, {
        columnName: k.columnName,
        // HF-373 Phase G (D10): data_nature is the CARRIED prose (k.data_nature); k.role is now
        // the bare nature_role stability key. Legacy pre-v6 atoms (prose in role) fall back.
        characterization: k.characterization ?? k.data_nature ?? k.role,
        dataExpectation: '',
        data_nature: k.data_nature ?? k.role,
        identifies: k.identifies ?? 'nothing',
        // HF-368: the model's bare primitives, recalled from the atom (legacy atoms → undefined →
        // the bridge fails loud → the sheet re-imports fresh with the primitives). HF-372: plan_role too.
        scope_role: k.scope_role,
        nature_role: k.nature_role,
        plan_role: k.plan_role,
        relationships: k.relationships ?? [],
        confidence: k.confidence,
      });
    }
    // novel atoms -> full LLM interpretation (characterization text present -> currency suppression can fire here).
    for (const c of (r.comprehendedColumns ?? [])) {
      const i = c.interpretation;
      interpretations.set(c.columnName, { columnName: c.columnName, characterization: i.characterization, dataExpectation: i.dataExpectation, data_nature: i.data_nature, identifies: i.identifies, scope_role: i.scope_role, nature_role: i.nature_role, plan_role: i.plan_role, relationships: i.relationships ?? [], confidence: i.confidence });
    }

    profile.headerComprehension = {
      interpretations,
      crossSheetInsights: [],
      llmCallDuration: 0,
      llmModel: r.status === 'comprehended' ? resolveModel('header_comprehension') : 'flywheel-atom',
      fromVocabularyBinding: false,
    };
    for (const [colName, interp] of Array.from(interpretations.entries())) {
      profile.observations.push({
        columnName: colName,
        observationType: 'header_comprehension',
        observedValue: interp.characterization,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `Comprehended "${colName}" as ${interp.characterization} [nature=${interp.data_nature}, identifies=${interp.identifies}]`,
      });
      confTotal += interp.confidence; confCount++;
    }
    enhanceProfileWithComprehension(profile);
    columnsInterpreted += interpretations.size;

    // hold (a): succeeded units only — recompute the full atom (with features) on full rows for the write.
    const sheet = sheets.find(s => s.sheetName === r.sheetName)!;
    for (const a of r.atomsToWrite) {
      // HF-341 R4: carry the OB-231 expression into the atom write so the recognition survives the cache.
      // HF-372 (F-NEW-2): carry the model's bare primitives too — dropping them here persisted every
      // fresh atom WITHOUT scope_role/nature_role, so the very next warm recall served incomplete
      // recognition and the classifier fail-louded (MissingRecognitionError on any re-import).
      atomsToWrite.push({ atom: computeAtomFingerprint(a.columnName, sheet.rows.map(row => row[a.columnName])), role: a.role, roleConfidence: a.roleConfidence, identifies: a.identifies, characterization: a.characterization, relationships: a.relationships, scope_role: a.scope_role, nature_role: a.nature_role, plan_role: a.plan_role });
    }
  }

  // 6. accumulate atoms (gated by success — failed units contributed none).
  await writeAtoms(tenantId, atomsToWrite, supabaseUrl, supabaseServiceKey);

  // OB-203 Phase 4 (R3): atom recognition-confidence signals (fire-and-forget batch; DI-5 write-side).
  // recognitionConfidence tracks the resolved role confidence for the accumulated atoms.
  fireSignalBatch(
    atomsToWrite.map(a => buildAtomRecognitionSignal({
      tenantId, atomHash: a.atom.hash, role: a.role, recognitionConfidence: a.roleConfidence, roleConfidence: a.roleConfidence,
    })),
    supabaseUrl, supabaseServiceKey,
  );

  const metrics: HeaderComprehensionMetrics = {
    llmCalled: llmDispatches > 0,
    llmCallDuration: totalLlmDuration, // sum of per-sheet residue dispatch durations (metric fix)
    llmModel: llmDispatches > 0 ? resolveModel('header_comprehension') : null,
    columnsInterpreted,
    columnsFromBindings: 0,
    columnsFromLLM: columnsInterpreted,
    averageConfidence: confCount > 0 ? confTotal / confCount : 0,
    crossSheetInsightCount: 0,
    timestamp: new Date().toISOString(),
  };
  return { metrics, perSheetFailure, provenance };
}

// ============================================================
// OB-162: FIELD IDENTITY EXTRACTION (Decision 111)
// ============================================================

/**
 * Extract field identities from HC comprehension results for a specific sheet.
 * Returns Record<columnName, FieldIdentity> suitable for committed_data.metadata.field_identities
 */
export function extractFieldIdentities(
  comprehensions: Map<string, HeaderComprehension> | null,
  sheetName: string,
): Record<string, FieldIdentity> | null {
  if (!comprehensions) return null;

  const hc = comprehensions.get(sheetName);
  if (!hc) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    identities[colName] = {
      structuralType: interp.data_nature,
      contextualIdentity: interp.characterization,
      confidence: interp.confidence,
      natureRole: interp.nature_role, // HF-368: bare nature primitive — remediation reads THIS, not the prose
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
}

/**
 * Extract field identities from a classificationTrace's headerComprehension data.
 * This is used in the execute pipeline where we have the trace but not the full HC maps.
 */
export function extractFieldIdentitiesFromTrace(
  classificationTrace: Record<string, unknown> | undefined,
): Record<string, FieldIdentity> | null {
  if (!classificationTrace) return null;

  const hcData = classificationTrace.headerComprehension as
    { interpretations?: Record<string, { data_nature?: string; characterization?: string; confidence?: number; nature_role?: string; scope_role?: string }> } | null;

  if (!hcData?.interpretations) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Object.entries(hcData.interpretations)) {
    identities[colName] = {
      structuralType: interp.data_nature || 'unknown',
      contextualIdentity: interp.characterization || 'unknown',
      confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
      natureRole: interp.nature_role, // HF-368: bare nature primitive for remediation
      scopeRole: interp.scope_role,   // HF-372: bare scope primitive for entity resolution
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
}

function computeAverageConfidence(
  comprehensions: Map<string, HeaderComprehension> | null,
): number {
  if (!comprehensions) return 0;
  let total = 0;
  let count = 0;
  for (const comp of Array.from(comprehensions.values())) {
    for (const interp of Array.from(comp.interpretations.values())) {
      total += interp.confidence;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ============================================================
// PROFILE ENHANCEMENT
// ============================================================

/**
 * Enhance Content Profiles with header comprehension results.
 * Called AFTER generateContentProfile, BEFORE agent scoring.
 * Emits ProfileObservation signals for each header interpretation.
 */
export async function enhanceWithHeaderComprehension(
  profiles: Map<string, ContentProfile>,
  sheets: HeaderComprehensionInput['sheets'],
  tenantId: string,
): Promise<HeaderComprehensionMetrics> {
  const { comprehensions, metrics } = await comprehendHeaders({ sheets }, tenantId);

  if (!comprehensions) return metrics;

  for (const [sheetName, comprehension] of Array.from(comprehensions.entries())) {
    const profile = profiles.get(sheetName);
    if (!profile) continue;

    profile.headerComprehension = comprehension;

    // Emit ProfileObservation for each header interpretation
    for (const [colName, interp] of Array.from(comprehension.interpretations.entries())) {
      profile.observations.push({
        columnName: colName,
        observationType: 'header_comprehension',
        observedValue: interp.characterization,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM characterized "${colName}" as ${interp.characterization} [nature=${interp.data_nature}, identifies=${interp.identifies}], expects ${interp.dataExpectation}`,
      });
    }

    // Enhance profile from comprehension
    enhanceProfileWithComprehension(profile);
  }

  return metrics;
}

// HC confidence threshold for override authority (Decision 108)
const HC_OVERRIDE_THRESHOLD = 0.80;

// OB-203 Phase 2 (Deviation 1) — the gate that distinguishes a currency suppression. It matches
// RICH characterization text (novel/LLM columns), never a bare recalled nature label. This is why
// suppressFalseCurrencyColumns fires on novel/LLM columns and NOT on atom-recognized columns:
// the latter carry characterization = the recalled data_nature label, which never matches.
const NON_MONETARY_MEASURE_PATTERNS = /capacity|count|volume|utilization|rate|quantity|units|loads|deliveries|incidents/i;
export function isNonMonetaryMeasureMeaning(characterization: string): boolean {
  return NON_MONETARY_MEASURE_PATTERNS.test(characterization);
}

function enhanceProfileWithComprehension(profile: ContentProfile): void {
  if (!profile.headerComprehension) return;

  const hc = profile.headerComprehension;

  // ────────────────────────────────────────────────────────
  // Decision 108: HC OVERRIDE AUTHORITY
  // When HC produces column roles with confidence >= 0.80,
  // those roles OVERRIDE structural detection.
  // ────────────────────────────────────────────────────────

  // OVERRIDE 1: Identifier detection
  // OB-231: when HC characterizes a column with identifier-nature OR an entity/reference scope at
  // high confidence, use it for identifierRepeatRatio — even if structural uniqueness picked another.
  const hcIdentifierCol = findHCIdentifierColumn(hc, HC_OVERRIDE_THRESHOLD);
  if (hcIdentifierCol) {
    const idField = profile.fields.find(f => f.fieldName === hcIdentifierCol.colName);
    if (idField && idField.distinctCount > 0) {
      const oldRatio = profile.structure.identifierRepeatRatio;
      const newRatio = profile.structure.rowCount / idField.distinctCount;
      if (Math.abs(oldRatio - newRatio) > 0.01) {
        profile.structure.identifierRepeatRatio = newRatio;
        // Update volume pattern to match new ratio
        profile.patterns.volumePattern =
          newRatio === 0 ? 'unknown' :
          newRatio <= 1.5 ? 'single' :
          newRatio <= 3.0 ? 'few' :
          'many';
        profile.observations.push({
          columnName: hcIdentifierCol.colName,
          observationType: 'hc_identifier_override',
          observedValue: newRatio,
          confidence: hcIdentifierCol.confidence,
          alternativeInterpretations: { structuralRatio: oldRatio },
          structuralEvidence: `HC characterized "${hcIdentifierCol.colName}" as ${hcIdentifierCol.characterization} [nature=${hcIdentifierCol.dataNature}, identifies=${hcIdentifierCol.identifies}] — overriding structural identifier. Ratio: ${oldRatio.toFixed(2)} → ${newRatio.toFixed(2)}`,
        });
      }
    }
    if (!profile.patterns.hasEntityIdentifier) {
      profile.patterns.hasEntityIdentifier = true;
    }
  }

  // OVERRIDE 2: Temporal suppression
  // If structural analysis flagged columns as temporal, but HC says they are NOT temporal
  // (e.g., 'attribute' or 'measure'), suppress the temporal detection for those columns.
  if (profile.patterns.hasTemporalColumns) {
    const suppressedTemporal = suppressFalseTemporalColumns(profile, hc);
    if (suppressedTemporal) {
      // Re-evaluate hasDateColumn: only true if a genuine date-typed or HC-confirmed temporal column remains
      const hasGenuineDateColumn = profile.fields.some(f => f.dataType === 'date');
      const hasHCTemporalColumn = Array.from(hc.interpretations.values()).some(
        interp => natureIsTemporal(interp) && interp.confidence >= HC_OVERRIDE_THRESHOLD,
      );
      profile.patterns.hasDateColumn = hasGenuineDateColumn || hasHCTemporalColumn;
      profile.patterns.hasTemporalColumns = hasGenuineDateColumn || hasHCTemporalColumn;
    }
  }

  // OVERRIDE 3: Currency suppression
  // If structural analysis typed a column as currency based on header substring ("total", "amount"),
  // but HC says it's a non-monetary measure (capacity, count, utilization), suppress currency classification.
  suppressFalseCurrencyColumns(profile, hc);

  // ────────────────────────────────────────────────────────
  // REINFORCEMENT (existing behavior — only adds, never removes)
  // ────────────────────────────────────────────────────────

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Reinforcement 1: Temporal column reinforcement (HC adds temporal that structural missed)
    if (natureIsTemporal(interp) && interp.confidence >= HC_OVERRIDE_THRESHOLD && !profile.patterns.hasTemporalColumns) {
      profile.patterns.hasTemporalColumns = true;
      profile.patterns.hasDateColumn = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'temporal_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM characterized "${colName}" as temporal (${interp.characterization}) — structural detection missed this`,
      });
    }

    // Reinforcement 2: Name column reinforcement
    if (natureIsName(interp) && interp.confidence >= HC_OVERRIDE_THRESHOLD && !profile.patterns.hasStructuralNameColumn) {
      profile.patterns.hasStructuralNameColumn = true;
      field.nameSignals.looksLikePersonName = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'name_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM characterized "${colName}" as person name — structural detection missed this`,
      });
    }

    // Reinforcement 3: Identifier reinforcement (existing — low-confidence HC also adds)
    if ((natureIsIdentifier(interp) || scopeIsEntity(interp)) && !profile.patterns.hasEntityIdentifier) {
      profile.patterns.hasEntityIdentifier = true;
    }
  }
}

// ============================================================
// HC OVERRIDE HELPERS
// ============================================================

// OB-231: the first column the LLM characterized with identifier-nature OR an entity/reference scope.
function findHCIdentifierColumn(
  hc: HeaderComprehension,
  minConfidence: number,
): { colName: string; characterization: string; dataNature: string; identifies: string; confidence: number } | null {
  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if ((natureIsIdentifier(interp) || scopeIsEntity(interp) || scopeIsReference(interp)) && interp.confidence >= minConfidence) {
      return { colName, characterization: interp.characterization, dataNature: interp.data_nature, identifies: interp.identifies, confidence: interp.confidence };
    }
  }
  return null;
}

/**
 * Suppress temporal detection for columns that HC identifies as non-temporal.
 * Returns true if any temporal columns were suppressed.
 */
function suppressFalseTemporalColumns(
  profile: ContentProfile,
  hc: HeaderComprehension,
): boolean {
  let anySuppressed = false;

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if (interp.confidence < HC_OVERRIDE_THRESHOLD) continue;
    if (natureIsTemporal(interp)) continue; // HC agrees it's temporal — no suppression

    // HC characterized this column as NOT temporal (some other nature).
    // Check if structural analysis flagged this column as temporal via integer range detection
    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Check if this field's values are in temporal ranges (1-12 or 2000-2040)
    const dist = field.distribution;
    if (dist.min === undefined || dist.max === undefined) continue;
    const min = Number(dist.min);
    const max = Number(dist.max);
    const isYearRange = min >= 2000 && max <= 2040;
    const isMonthRange = min >= 1 && max <= 12;

    if (isYearRange || isMonthRange) {
      // Structural analysis would have flagged this as temporal, but HC says otherwise
      anySuppressed = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'hc_temporal_suppression',
        observedValue: false,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `HC characterized "${colName}" as ${interp.data_nature} (${interp.characterization}), not temporal — suppressing structural temporal detection (values ${min}-${max})`,
      });
    }
  }

  return anySuppressed;
}

/**
 * Suppress currency classification for columns that HC identifies as non-monetary measures.
 * Recalculates hasCurrencyColumns after suppression.
 */
function suppressFalseCurrencyColumns(
  profile: ContentProfile,
  hc: HeaderComprehension,
): void {
  let currencyCountAdjustment = 0;

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if (interp.confidence < HC_OVERRIDE_THRESHOLD) continue;

    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Check if field was typed as currency but HC says it's a non-monetary measure
    const isCurrencyTyped = field.dataType === 'currency' ||
      (field.nameSignals.containsAmount && ['decimal', 'integer', 'currency'].includes(field.dataType));

    if (!isCurrencyTyped) continue;

    // HC characterized this as a measure with non-monetary meaning (capacity, count, utilization, etc.)
    if (natureIsMeasure(interp) && isNonMonetaryMeasureMeaning(interp.characterization)) {
      currencyCountAdjustment++;
      profile.observations.push({
        columnName: colName,
        observationType: 'hc_currency_suppression',
        observedValue: false,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `HC characterized "${colName}" as non-monetary measure (${interp.characterization}) — suppressing currency classification`,
      });
    }
  }

  if (currencyCountAdjustment > 0) {
    profile.patterns.hasCurrencyColumns = Math.max(0, profile.patterns.hasCurrencyColumns - currencyCountAdjustment);
  }
}
