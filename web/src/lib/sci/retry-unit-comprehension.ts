// OB-203 Phase 3 — retry-without-reimport (R2). A failed unit re-runs comprehension
// through the SAME decomposed dispatch (atoms claim, residue comprehends) — so a retried
// unit benefits from everything the atom flywheel learned SINCE the failure — with NO
// re-ingestion (the unit's rows come from the already-persisted storage artifact).
//
// The decomposed-dispatch function is injected (RetryDeps.comprehend), which is exactly
// `runDecomposedComprehension` in the route. The injection is what lets the test PROVE the
// retry path is the same dispatch, not a parallel one.

import { generateContentProfileStats } from './content-profile';
import { emitUnitStates, type UnitStateSignalParams } from './comprehension-state-service';
import type { ContentProfile } from './sci-types';

export interface DecomposedComprehensionResult {
  provenance: Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>;
  perSheetFailure: Map<string, string>;
}

export type DecomposedDispatch = (
  profileMap: Map<string, ContentProfile>,
  sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; rowCount: number }>,
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
) => Promise<DecomposedComprehensionResult>;

export interface RetryDeps {
  comprehend: DecomposedDispatch;                                       // THE same decomposed dispatch
  emit: (params: UnitStateSignalParams[], url: string, key: string) => Promise<void>;
}

export interface RetryUnitInput {
  tenantId: string;
  importSessionId: string;
  unitId: string;            // fileName::sheetName::tabIndex
  sheetName: string;
  tabIndex: number;
  sourceFileName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface RetryUnitResult {
  unitId: string;
  state: 'comprehended' | 'failed_interpretation';
  novelCount: number | null;
  failureClass: string | null;
}

/**
 * Re-run comprehension for ONE unit. Emits the resulting state (`comprehended` or
 * `failed_interpretation`) with a fresh timestamp — later than the prior failure, so the
 * reducer supersedes the old `failed_interpretation` naturally (no mutation of past signals).
 */
export async function retryUnitComprehension(
  input: RetryUnitInput,
  deps: RetryDeps,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<RetryUnitResult> {
  const profile = generateContentProfileStats(
    input.sheetName, input.tabIndex, input.sourceFileName, input.columns, input.rows, input.rowCount,
  );
  const profileMap = new Map<string, ContentProfile>([[input.sheetName, profile]]);

  // SAME decomposed dispatch as the analyze route — known atoms claim, novel residue comprehends.
  const dc = await deps.comprehend(
    profileMap,
    [{ sheetName: input.sheetName, columns: input.columns, rows: input.rows, rowCount: input.rowCount }],
    input.tenantId, supabaseUrl, supabaseServiceKey,
  );

  const base = {
    tenantId: input.tenantId, importSessionId: input.importSessionId, unitId: input.unitId,
    sheetName: input.sheetName, sourceFileName: input.sourceFileName, seq: 0,
  };
  const failure = dc.perSheetFailure.get(input.sheetName);
  if (failure) {
    await deps.emit([{ ...base, state: 'failed_interpretation', failureClass: failure }], supabaseUrl, supabaseServiceKey);
    return { unitId: input.unitId, state: 'failed_interpretation', novelCount: null, failureClass: failure };
  }
  const prov = dc.provenance.get(input.sheetName);
  await deps.emit([{ ...base, state: 'comprehended', novelCount: prov?.novelCount ?? null }], supabaseUrl, supabaseServiceKey);
  return { unitId: input.unitId, state: 'comprehended', novelCount: prov?.novelCount ?? null, failureClass: null };
}

/** Production deps: the SAME dispatch + the non-blocking canonical emitter. */
export const productionRetryDeps = (
  comprehend: DecomposedDispatch,
): RetryDeps => ({ comprehend, emit: emitUnitStates });
