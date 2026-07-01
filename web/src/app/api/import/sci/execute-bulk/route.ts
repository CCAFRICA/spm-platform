// OB-156: SCI Execute Bulk — Server-side file processing
// Downloads file from Supabase Storage, parses server-side, bulk inserts.
// Fixes AP-1 (no row data in HTTP bodies) and AP-2 (no sequential chunks from browser).

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
// OB-182: convergeBindings removed from import — runs at calc time
import type { Json } from '@/lib/supabase/database.types';
import type {
  SCIExecutionResult,
  ContentUnitResult,
  AgentType,
  SemanticBinding,
  ContentUnitExecution,
} from '@/lib/sci/sci-types';
// HF-231: source_date extraction, supersession, hashing, field_identities, and
// data_type resolution all moved into commitContentUnit. Only the file-hash
// helper is still needed at this layer (computed once over the raw file bytes
// and threaded into commitContentUnit per content unit).
import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
import { isSpreadsheetPath, extensionOf } from '@/lib/sci/file-format';
// HF-285-D: parse-once companion (read + best-effort write-through).
import { readParsedCompanion, writeParsedCompanion } from '@/lib/sci/parsed-companion';
// HF-300 (DIAG-071): executePostCommitConstruction (entity resolution + entity_id back-link) MOVED
// to /api/import/sci/finalize-import — it runs once in a live request; the per-file waitUntil
// background here did not complete on Vercel (99% of committed_data left NULL entity_id).
// HF-231: unified committed_data writer — sole write surface across all four
// classifications. Replaces 4 inline write sites in this route (plus 4 in
// execute/route.ts). Closes AP-17 (parallel metadata construction).
import { commitContentUnit, findHcEntityIdColumn, findHcEntityIdCandidates } from '@/lib/sci/commit-content-unit';
import { looksLikeRowIndex } from '@/lib/sci/entity-resolution';
// OB-251 (DS-016 P-C1) — bounded-window parse + commit so a large sheet never materializes its full
// row array (the 86,608×87 OOM). Gated by CELL_CHUNK_THRESHOLD above every HALT-CALC anchor's sheet.
import { openSheetWindow, exceedsCellCeiling, type SheetWindow } from '@/lib/sci/sheet-window';
import { commitUnitWindowed, commitUnitStreamed } from '@/lib/sci/windowed-commit';
// HF-360/362: hand-off — drivers stage pulses for multi-pulse units (HF-362 dynamic decision); execute-bulk
// enqueues ONE pulse_load_jobs row and the pg_cron worker loads off the serverless clock.
import { enqueuePulseLoadJob } from '@/lib/sci/pulse-load-enqueue';
import type { PulseManifestEntry } from '@/lib/sci/pulse-load-types';
// HF-358 (Part B-1): no silent commit failure — record the reason + a terminal status on the import job.
import { recordCommitFailureOnJob } from '@/lib/sci/job-failure';
import { markSessionJobs } from '@/lib/sci/job-status';
// HF-362: fire entity resolution SERVER-SIDE for the synchronous path (the internal cron principal lets
// execute-bulk POST finalize-import cookielessly, like the hand-off finalize-sweep does for the worker path).
import { internalCronHeaders } from '@/lib/sci/cron-principal';
// OB-251 HOTFIX: a file big enough to OOM XLSX.read is STREAMED (jszip) — the workbook is never
// materialized. Gated by byte size, above every HALT-CALC anchor's file (anchors stay on SheetJS).
import { isLargeByBytes } from '@/lib/sci/sheet-stream';
import { debandWorksheet } from '@/lib/sci/deband-sheet';
// OB-203 Phase C: batch entity enrichment (pure merge) + entity-phase pulses
// through the one observability spine (VERBOSE 'pulse' + session record).
import { computeEnrichmentMerge, type TemporalAttr } from '@/lib/sci/entity-enrichment';
import { accumulateUnitCommitFields, fetchSessionTelemetryRecord, unflattenUnitStates } from '@/lib/sci/session-telemetry-accumulator';
import { ob203Trace } from '@/lib/sci/ob203-verbose';
// OB-203 Phase B: idempotent resume — every invocation classifies each unit
// against the durable spine; response death cannot orphan unprocessed units.
import { classifyUnitForResume, batchLivenessMs } from '@/lib/sci/execute-resume';
// OB-203 Phase 3 (R2): terminal `bound` state on the canonical surface.
import { emitUnitStates } from '@/lib/sci/comprehension-state-service';
// HF-239 Phase 0.1: plan interpretation extracted into a shared module.
// HF-257 (AP-17): plan interpretation runs in ONE function —
// executeBatchedPlanInterpretation. The per-unit duplicate (executePlanPipeline)
// was removed; it is no longer imported or called.
import { executeBatchedPlanInterpretation } from '@/lib/sci/plan-interpretation';
// HF-239 Phase 0.2: flywheel signal emission extracted. The bulk path used
// to write zero flywheel signals; this restores fingerprint / classification
// / foundational / domain emission for every import.
import { emitFlywheelSignals } from '@/lib/sci/flywheel-signal-emission';
// HF-300 (DIAG-071): createMissingAssignments MOVED to /api/import/sci/finalize-import (live request).
// HF-239 Phase 0.4: store metadata population extracted from execute's
// per-pipeline postCommitConstruction (OB-146 Step 1b block).
import { populateStoreMetadata } from '@/lib/sci/store-metadata-population';
// OB-203 D16.1: reconcile + reclaim any stale/partial batches from a prior outage BEFORE new data lands.
import { reconcileStaleBatches } from '@/lib/sci/committed-data-visibility';

// Processing order: plan first, then entity, then data
const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

// HF-196 Phase 1D: normalizeFileNameToDataType deleted — D154 violation removed.
// data_type now derives from SCI classification via @/lib/sci/data-type-resolver
// (single canonical surface). Function definition still present in commit/route.ts
// and intelligence/wire/route.ts; those paths use commit's distinct vocabulary
// ('roster' | 'component_data' | ...) and are out of HF-196 scope per architect-
// disposition surface (see commit message + carry-forward).

// Generic role detection targets (AP-5/AP-6: no hardcoded language-specific names)
const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];

interface BulkContentUnit {
  contentUnitId: string;
  confirmedClassification: AgentType;
  confirmedBindings: SemanticBinding[];
  claimType?: string;
  ownedFields?: string[];
  sharedFields?: string[];
  originalClassification?: AgentType;
  originalConfidence?: number;
  // HF-239: optional flywheel-emission inputs. Carried through from the UI
  // so the post-import flywheel block can write classification signals and
  // refresh structural fingerprints. Bulk units that lack a fingerprint
  // simply skip emission (the emitter short-circuits on absent fingerprint).
  classificationTrace?: Record<string, unknown>;
  structuralFingerprint?: unknown;
  vocabularyBindings?: unknown;
  sourceFile?: string;
  tabName?: string;
  // HF-258 (Q5): fileBase64 retired from the request body (dead at execute — unconsumed;
  // AUD-0015/HALT-3). Plan units are read from storagePath; base64 is materialized
  // server-side from storage. mimeType marker retained (no file bytes in the body, AP-1).
  documentMetadata?: { mimeType?: string };
}

interface BulkRequest {
  proposalId: string;
  tenantId: string;
  // HF-358 (Part B-1): the import-session id (processing_jobs.session_id) so a commit failure can be
  // recorded on the job. Distinct from proposalId (a fresh client-minted uuid). Absent on the sync path.
  sessionId?: string;
  storagePath?: string;  // HF-256: back-compat single-file path; superseded by storagePaths
  // HF-256 (Decision 82 multi-file): per-file storage map (fileName -> path). Every file
  // in the import is downloaded and processed by its own format. When absent, the import
  // degrades to the single-file `storagePath` (byte-identical pre-HF behavior).
  storagePaths?: Record<string, string>;
  contentUnits: BulkContentUnit[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  // HF-358 (Part B-1): kept in outer scope so the catch can record the failure on the job even if the
  // throw happened after body-parse. Service-role client + tenant from the validated body.
  let jobSessionId: string | undefined;
  let jobTenantId: string | undefined;
  let jobServiceClient: SupabaseClient | undefined;

  try {
    // Auth check
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body: BulkRequest = await req.json();
    const { proposalId, tenantId, sessionId, storagePath, storagePaths, contentUnits } = body;
    // HF-358 (Part B-1): hoist into the outer scope so the catch can record the job failure on any throw.
    jobSessionId = sessionId;
    jobTenantId = tenantId;
    jobServiceClient = supabase;

    // DIAG-070: per-phase timing trace. Instrumentation ONLY — no behavior change. `startTime` is t0.
    // Each phase logs cumulative +ms so deltas between consecutive lines = that phase's cost.
    const traceLabel = (storagePath ? storagePath.split('/').pop() : proposalId) ?? 'bulk';
    const trace = (phase: string) => console.log(`[TRACE-SERVER] ${traceLabel} | ${phase} | +${Date.now() - startTime}ms`);
    trace('body-parsed');

    // HF-256: accept either the per-file map (storagePaths) or the single path (storagePath).
    const haveAnyPath = (storagePaths && Object.keys(storagePaths).length > 0) || !!storagePath;
    if (!tenantId || !proposalId || !haveAnyPath || !contentUnits?.length) {
      return NextResponse.json(
        { error: 'tenantId, proposalId, (storagePath or storagePaths), and contentUnits required' },
        { status: 400 }
      );
    }

    // HF-090: Use auth.uid() directly for created_by attribution
    const profileId = authUser.id;

    // Verify tenant + read industry for domain flywheel (OB-160J via HF-239).
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
    const tenantDomainId = (tenantSettings.industry as string) || '';

    // HF-372 Phase D: the SERVER writes 'committing' (the browser's fire-and-forget write is removed —
    // it silently no-oped for platform operators under RLS and lied on navigate-away). proposal_id is
    // stamped onto the session's jobs so finalize-import (which knows only the proposalId) can mark
    // them 'finalized' on every dispatch path.
    await markSessionJobs(supabase, tenantId, sessionId, { status: 'committing', phase: 'committing', proposalId });

    // ── OB-203 D16.1: reconcile stale/partial batches from a prior outage, BEFORE committing new data ──
    // A batch stuck in `processing` past its liveness window (an outage killed the request mid-commit) is
    // marked `failed` truthfully, and any orphan rows it left — here or in a `failed` batch whose
    // host-killed rollback never ran — are deleted while the host is healthy. The platform self-heals at
    // the next import; nothing partial survives into this import as live data.
    trace('reconcile-start');
    try {
      const recon = await reconcileStaleBatches(supabase, tenantId);
      if (recon.reconciledProcessing || recon.rowsReclaimed || recon.failedSwept) {
        console.log(`[SCI Bulk] D16.1 reconcile: processing→failed=${recon.reconciledProcessing} failedSwept=${recon.failedSwept} rowsReclaimed=${recon.rowsReclaimed}`);
      }
    } catch (reconErr) {
      console.error('[SCI Bulk] D16.1 reconcile failed (non-blocking):', reconErr instanceof Error ? reconErr.message : reconErr);
    }
    trace('reconcile-end');

    // ── Step 1+2 (HF-256, Decision 82 multi-file): per-file download + format-aware parse ──
    // Every file in the import is downloaded and parsed by its OWN format. The per-file
    // map (storagePaths) supersedes the single storagePath; when only the single path is
    // present, the import degrades to exactly one file — byte-identical to the pre-HF path.
    type FileParse = {
      fileName: string;
      path: string;
      fileHash: string;
      fileNameFromPath: string;
      // OB-251: a windowed (large) sheet carries a bounded-window `reader` + true `totalRows`
      // instead of a materialized `rows` array (rows stays empty); the commit loop streams it.
      sheetDataMap: Map<string, { rows: Record<string, unknown>[]; columns: string[]; reader?: SheetWindow; totalRows?: number; windowed?: boolean }>;
      // OB-251 HOTFIX: an OOM-scale file is NOT parsed up-front (XLSX.read would OOM). It carries its
      // raw bytes; the commit loop STREAMS each unit's sheet via commitUnitStreamed.
      streaming?: boolean;
      buffer?: ArrayBuffer;
    };

    const fileEntries: Array<{ fileName: string; path: string }> =
      storagePaths && Object.keys(storagePaths).length > 0
        ? Object.entries(storagePaths).map(([fileName, path]) => ({ fileName, path }))
        : [{ fileName: (storagePath!.split('/').pop()?.replace(/^\d+_/, '') || 'unknown'), path: storagePath! }];

    const fileParseByName = new Map<string, FileParse>();
    trace(`download-parse-start files=${fileEntries.length}`);
    for (const { fileName, path } of fileEntries) {
      const parseStart = Date.now();
      console.log(`[SCI Bulk] Downloading from Storage: ${path}`);
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('ingestion-raw')
        .download(path);
      if (downloadErr || !fileData) {
        return NextResponse.json(
          { error: `Failed to download file from Storage: ${downloadErr?.message || 'No data'} (${path})` },
          { status: 500 }
        );
      }
      const buffer = await fileData.arrayBuffer();
      // HF-196 Phase 1F: SHA-256 of file content bytes for import_batches.file_hash_sha256
      // + supersession trigger — computed per file.
      const fileHash = computeFileHashSha256(buffer);

      // OB-251 HOTFIX: a file big enough that XLSX.read would OOM is STREAMED at commit (jszip) — never
      // parsed up-front here. Skip the companion + XLSX.read; carry the raw bytes on the FileParse.
      const streaming = isSpreadsheetPath(path) && isLargeByBytes(buffer.byteLength);
      if (streaming) {
        console.log(`[SCI Bulk] OB-251: ${fileName} is ${(buffer.byteLength / 1e6).toFixed(0)}MB ≥ threshold — STREAMED commit (workbook NOT materialized; the real OOM fix)`);
      }

      const sheetDataMap = new Map<string, { rows: Record<string, unknown>[]; columns: string[]; reader?: SheetWindow; totalRows?: number; windowed?: boolean }>();
      // HF-285-D: parse-once. If the gzipped parsed companion exists for this file's
      // content hash (written by process-job at classify, or a prior execute/resume),
      // read it instead of re-parsing the xlsx (~5s vs ~34s for the witness file). Any
      // miss/error falls through to the live parse below (no regression).
      let usedCompanion = false;
      if (!streaming && isSpreadsheetPath(path)) {
        const companion = await readParsedCompanion(supabase, tenantId, fileHash);
        if (companion) {
          for (const [sheetName, sd] of Object.entries(companion)) {
            sheetDataMap.set(sheetName, { rows: sd.rows, columns: sd.columns });
          }
          usedCompanion = true;
          const fileTotalRows = Array.from(sheetDataMap.values()).reduce((s, d) => s + d.rows.length, 0);
          console.log(`[SCI Bulk] ${fileName}: parse-once companion HIT — ${fileTotalRows} rows across ${sheetDataMap.size} sheets in ${Date.now() - parseStart}ms (xlsx parse skipped, HF-285-D)`);
        }
      }
      // HF-256: format-aware parse (file-format.ts). Documents (PDF/PPTX/DOCX) are PLAN
      // sources — NOT workbook-parsed; their plan unit routes to the format-aware plan
      // pipeline below. Workbook-parsing a document would throw "Could not find workbook".
      // Spreadsheets parse exactly as before (single XLSX file => byte-identical sheet map).
      if (!streaming && !usedCompanion && isSpreadsheetPath(path)) {
        const XLSX = await import('xlsx');
        // OB-251 P-C1: dense read halves the cell-map peak on wide files (sheet_to_json output is
        // byte-identical — sheet-window.test.ts proves it). Large sheets are NOT materialized.
        const workbook = XLSX.read(buffer, { type: 'array', dense: true });
        let anyWindowed = false;
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          if (!ws) continue;
          // Cheap dims from !ref — zero row-objects materialized.
          const dim = XLSX.utils.decode_range(ws['!ref'] || 'A1');
          const approxRows = Math.max(0, dim.e.r - dim.s.r);
          const approxCols = dim.e.c - dim.s.c + 1;
          if (exceedsCellCeiling(approxRows, approxCols)) {
            // HF-355 I2 / OB-251 P-C1: OVERSIZED — keep a bounded-window reader; the commit loop streams
            // it through commitUnitWindowed (peak ≈ one window). The full row array is NEVER built.
            const reader = openSheetWindow(XLSX, ws, sheetName);
            anyWindowed = true;
            sheetDataMap.set(sheetName, { rows: [], columns: reader.columns, reader, totalRows: reader.totalRows, windowed: true });
            console.log(`[SCI Bulk] HF-355/OB-251: ${fileName}/${sheetName} ${reader.totalRows}r×${reader.columns.length}c (${(approxRows * approxCols / 1e6).toFixed(1)}M cells) > ceiling — WINDOWED commit (no full materialization)`);
          } else {
            // HF-355 I2 (defense-in-depth, C2 fail-loud): the single-batch full sheet_to_json is reached
            // ONLY for a non-oversized sheet. This guard makes that provable — an oversized sheet here is
            // a routing defect; REFUSE rather than full-materialize (the incident's outage path).
            if (exceedsCellCeiling(approxRows, approxCols)) {
              throw new Error(`HF-355 size ceiling: ${fileName}/${sheetName} ${approxRows}×${approxCols} exceeds the cell ceiling and must be windowed, never full-materialized.`);
            }
            // OB-254 (D1/D3): de-band through the SAME helper classify used (deterministic), so a
            // companion-MISS re-parse commits exactly the rows classify saw — never re-derives a
            // different de-band. A clean sheet is byte-identical (defvalEmpty parity) → HALT-CALC anchors
            // unchanged. Companion-HIT (the usual path) already APPLIES the de-banded rows process-job wrote.
            const deband = debandWorksheet(XLSX, ws, sheetName);
            sheetDataMap.set(sheetName, { rows: deband.rows, columns: deband.columns });
          }
        }
        // HF-285-D write-through: a cache MISS on the spreadsheet path (e.g. the synchronous import
        // flow that skips process-job) writes the companion so the 300s-boundary resume re-reads it.
        // OB-251: skip when any sheet was windowed — a windowed sheet has no full array to cache, and
        // execute re-reads it windowed (bounded) on resume (the companion's 50MB cap excluded these
        // files anyway). Fire-and-forget (best-effort cache).
        if (!anyWindowed) {
          const companionSheets: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {};
          for (const [sheetName, sd] of Array.from(sheetDataMap.entries())) companionSheets[sheetName] = { columns: sd.columns, rows: sd.rows };
          void writeParsedCompanion(supabase, tenantId, fileHash, companionSheets);
        }
      } else if (!usedCompanion) {
        console.log(`[SCI Bulk] HF-256: document file (.${extensionOf(path)}) — skipping workbook parse; plan unit routes to format-aware plan pipeline`);
      }
      if (!streaming && !usedCompanion) {
        const fileTotalRows = Array.from(sheetDataMap.values()).reduce((s, d) => s + d.rows.length, 0);
        console.log(`[SCI Bulk] ${fileName}: parsed ${fileTotalRows} rows across ${sheetDataMap.size} sheets in ${Date.now() - parseStart}ms`);
      }
      fileParseByName.set(fileName, {
        fileName,
        path,
        fileHash,
        fileNameFromPath: path.split('/').pop()?.replace(/^\d+_/, '') || fileName,
        sheetDataMap,
        streaming,
        buffer: streaming ? buffer : undefined,
      });
    }

    trace('download-parse-end');
    // Resolve which file's parse a content unit belongs to. A single-file import (one
    // parse) ALWAYS resolves to that one parse — byte-identical to the pre-HF path.
    const allParses = Array.from(fileParseByName.values());
    const resolveParse = (unit: BulkContentUnit): FileParse => {
      if (fileParseByName.size === 1) return allParses[0];
      const bySource = unit.sourceFile ? fileParseByName.get(unit.sourceFile) : undefined;
      if (bySource) return bySource;
      const src = unit.contentUnitId.split('::')[0];
      return fileParseByName.get(src) ?? allParses[0];
    };

    // ── Step 3: Sort content units by processing order ──
    const sortedUnits = [...contentUnits].sort(
      (a, b) => PROCESSING_ORDER[a.confirmedClassification] - PROCESSING_ORDER[b.confirmedClassification]
    );

    // ── Step 4: Process each content unit ──
    const results: ContentUnitResult[] = [];

    // HF-239: Batched plan interpretation. Plan-classified units from the
    // same file are interpreted in ONE AI call (HF-130 pattern lifted from
    // the deleted execute/route.ts). Handled plan units are skipped by the
    // per-unit dispatch loop below.
    const planUnits = sortedUnits.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();

    // ── HF-270: comprehended-field set — the runtime anchor for plan reference resolution ──
    // The field identity a plan_component reference names MUST resolve to a column the
    // platform actually comprehended in THIS import (not free-text minted from prose).
    // Assemble the deduplicated set of HC-comprehended column identities from the non-plan
    // units (data/reference/target/entity), each carrying its sheet's HC interpretations on
    // classificationTrace.headerComprehension (Phase-1 AUD 1.2 proved presence at this seam).
    // Korean Test: every value is runtime HC output for this upload; zero enumerated field
    // names, zero synonym table. Empty set (plan-only import) triggers the orchestrator's
    // plan-declared-fields fallback (Phase 2.4).
    const comprehendedFieldMap = new Map<string, { field: string; meaning: string; role: string }>();
    let comprehendedSheetCount = 0;
    for (const unit of sortedUnits) {
      if (unit.confirmedClassification === 'plan') continue;
      const hc = (unit.classificationTrace as Record<string, unknown> | undefined)
        ?.headerComprehension as
          | { interpretations?: Record<string, { characterization?: string; data_nature?: string; confidence?: number }> }
          | null
          | undefined;
      const interps = hc?.interpretations;
      if (!interps || Object.keys(interps).length === 0) continue;
      comprehendedSheetCount++;
      for (const [colName, interp] of Object.entries(interps)) {
        if (!comprehendedFieldMap.has(colName)) {
          comprehendedFieldMap.set(colName, {
            field: colName,
            meaning: interp.characterization || '',
            role: interp.data_nature || 'unknown',
          });
        }
      }
    }
    const comprehendedFields = Array.from(comprehendedFieldMap.values());
    console.log(`[SCI Bulk] HF-270 comprehended-field set: ${comprehendedFields.length} fields from ${comprehendedSheetCount} data sheets`);

    if (planUnits.length > 0) {
      await markSessionJobs(supabase, tenantId, sessionId, { phase: 'interpreting_plan' }); // HF-372 Phase D: the REAL step
      // HF-256: group plan units by their source file; each plan file is interpreted with
      // its OWN storage path, producing its own rule set (the proven multi-plan shape).
      // For a single plan file this is one group with one path — identical to pre-HF.
      const planByPath = new Map<string, BulkContentUnit[]>();
      for (const pu of planUnits) {
        const planPath = resolveParse(pu).path;
        if (!planByPath.has(planPath)) planByPath.set(planPath, []);
        planByPath.get(planPath)!.push(pu);
      }
      for (const [planPath, group] of Array.from(planByPath.entries())) {
        try {
          const batchResults = await executeBatchedPlanInterpretation(
            supabase,
            tenantId,
            group as unknown as ContentUnitExecution[],
            profileId,
            planPath,
            comprehendedFields, // HF-270: runtime anchor for reference resolution
          );
          for (const r of batchResults) {
            results.push(r);
            handledPlanUnitIds.add(r.contentUnitId);
          }
        } catch (err) {
          // HF-257 (AP-17): the per-unit plan duplicate is removed, so the batched path is
          // the SOLE plan pipeline. On an unexpected throw, record an explicit failure for
          // each plan unit in this group — do NOT silently drop them, and do NOT re-run a
          // duplicate interpreter. (executeBatchedPlanInterpretation returns its KNOWN
          // failures as values; this catch is only for an unexpected runtime throw.)
          console.error(`[SCI Bulk] Batched plan interpretation threw for ${planPath} (units reported as failures):`, err);
          for (const pu of group) {
            results.push({
              contentUnitId: pu.contentUnitId,
              classification: 'plan',
              success: false,
              rowsProcessed: 0,
              pipeline: 'plan-interpretation',
              error: `Batched plan interpretation failed: ${err instanceof Error ? err.message : String(err)}`,
            });
            handledPlanUnitIds.add(pu.contentUnitId);
          }
        }
      }
    }

    // D18: plan units write no committed_data, so without this they never reach a terminal spine state and
    // the completion screen (which reads the durable surface) can't settle them OR show their reason. Emit
    // each plan unit's terminal state per-unit AS the batch resolved — bound on success, failed_interpretation
    // carrying the REASON on failure (e.g. "plan interpretation found zero components"). The story persists.
    if (handledPlanUnitIds.size > 0) {
      const planStates = results
        .filter(r => handledPlanUnitIds.has(r.contentUnitId))
        .map(r => {
          const cu = contentUnits.find(u => u.contentUnitId === r.contentUnitId);
          // D15.2 (1b): a plan that interprets to ZERO components is not a failure — it was never a plan
          // (a cover page misrouted here, D15.2 accepted). The atomicity guard already refuses to commit a
          // broken plan; here we give it a GRACEFUL disposition (resolved / ignored — "not a plan, nothing
          // committed") instead of a hard failure, so the witness sees an honest non-event, not an error.
          const zeroComponents = !r.success && /no (usable )?components/i.test(r.error ?? '');
          const state = r.success ? ('bound' as const)
            : zeroComponents ? ('resolved' as const)
            : ('failed_interpretation' as const);
          return {
            tenantId, importSessionId: proposalId, unitId: r.contentUnitId,
            sheetName: cu?.tabName ?? r.contentUnitId.split('::')[1] ?? null,
            sourceFileName: cu?.sourceFile ?? null,
            state, seq: 5, classification: 'plan' as const,
            failureClass: r.success || zeroComponents ? null : (r.error ?? 'plan interpretation failed'),
          };
        });
      try {
        await emitUnitStates(planStates, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      } catch (e) {
        console.warn('[SCI Bulk] plan unit-state emit failed (non-blocking):', e instanceof Error ? e.message : e);
      }
      // OB-256 (W-5): plan units write rule_sets (not committed_data), so the Intelligence Summary's
      // row/atom counters never saw them — a plan-only import read "Recognized 0 / Learned 0 / Committed
      // 0" while N active plans were created. Accumulate the plan creation so the summary tells the truth.
      // rowsProcessed on a successful plan result IS that plan's component count (plan-interpretation.ts).
      for (const r of results.filter(r => handledPlanUnitIds.has(r.contentUnitId) && r.success && (r.rowsProcessed ?? 0) > 0)) {
        try {
          await accumulateUnitCommitFields({
            tenantId, importSessionId: proposalId, unitId: r.contentUnitId,
            fields: { plansCreated: 1, componentsCreated: r.rowsProcessed ?? 0 },
          }, supabase);
        } catch (e) {
          console.warn('[SCI Bulk] plan telemetry accumulate failed (non-blocking):', e instanceof Error ? e.message : e);
        }
      }
    }

    // OB-203 Phase B: resume-disposition inputs — ONE single-row record read +
    // ONE session-batches query, O(units) not O(rows) (Amendment 2 §4). On a
    // first run nothing is terminal and nothing holds a lease, so every unit
    // classifies 'process' and the path is behavior-identical.
    const resumeRecord = await fetchSessionTelemetryRecord(tenantId, proposalId, supabase).catch(() => null);
    const resumeSnaps = unflattenUnitStates(resumeRecord?.unit_states ?? null);
    const latestBatchByUnit = new Map<string, { status: string; createdAt: string }>();
    {
      const { data: sessionBatches } = await supabase
        .from('import_batches')
        .select('status, created_at, metadata')
        .eq('tenant_id', tenantId)
        .eq('metadata->>proposalId', proposalId);
      for (const b of (sessionBatches ?? []) as Array<{ status: string; created_at: string; metadata: Record<string, unknown> | null }>) {
        const cuId = (b.metadata?.contentUnitId as string) ?? '';
        if (!cuId) continue;
        const prev = latestBatchByUnit.get(cuId);
        if (!prev || b.created_at > prev.createdAt) {
          latestBatchByUnit.set(cuId, { status: b.status, createdAt: b.created_at });
        }
      }
    }

    trace(`unit-loop-start units=${sortedUnits.length}`);
    // HF-362 (Part B): the hand-off decision is no longer a global flag — each commit driver decides per unit
    // (handOff = estTotalPulses > 1, from the byte budget). A unit that needs >1 pulse stages + hands off to
    // the pg_cron worker; a single-pulse unit commits synchronously. execute-bulk just collects whatever
    // staged pulses the drivers produced and enqueues ONE job if any (below).
    for (const unit of sortedUnits) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue; // HF-239: handled in batch

      // OB-203 Phase B: skip units the durable spine already settled or a
      // possibly-live owner holds (liveness window = the lease). The unit list
      // walked here is the REQUEST's — a unit that never created a batch
      // cannot hide (A3 closed operationally).
      const snap = resumeSnaps.get(unit.contentUnitId);
      const spineState = snap ? (snap.resolvedAt ? 'resolved' : ((snap.state as string) ?? null)) : null;
      const dispo = classifyUnitForResume({
        spineState,
        latestBatch: latestBatchByUnit.get(unit.contentUnitId) ?? null,
        livenessMs: batchLivenessMs(),
        nowMs: Date.now(),
      });
      if (dispo !== 'process') {
        console.log(`[SCI Bulk] Phase B resume: ${unit.contentUnitId} → ${dispo} (state=${spineState ?? 'none'})`);
        if (dispo === 'skip_completed_batch') {
          // The commit landed; only the bound emission died with the response.
          try {
            await emitUnitStates(
              [{
                tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
                sheetName: unit.tabName ?? unit.contentUnitId.split('::')[1] ?? null,
                sourceFileName: unit.sourceFile ?? null,
                state: 'bound' as const, seq: 5, classification: unit.confirmedClassification ?? null,
              }],
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
          } catch (e) {
            console.warn(`[SCI Bulk] resume bound re-emit failed (non-blocking) for ${unit.contentUnitId}:`, e instanceof Error ? e.message : e);
          }
        }
        continue;
      }
      try {
        // HF-256: resolve this unit's source file's parse (single-file => the one parse).
        const parse = resolveParse(unit);
        const sheetDataMap = parse.sheetDataMap;
        // Resolve sheet data for this content unit
        const parts = unit.contentUnitId.split('::');
        const tabName = parts[1] || 'Sheet1';

        let result: ContentUnitResult | null = null;
        // OB-251 HOTFIX: an OOM-scale file was NOT parsed up-front (XLSX.read would OOM) — STREAM this
        // unit's sheet straight from the bytes through commitUnitStreamed. The workbook is never
        // materialized. Entity units are never this large (rosters); they fall through.
        if (parse.streaming && parse.buffer) {
          const cls = unit.confirmedClassification;
          if (cls === 'target' || cls === 'transaction' || cls === 'reference') {
            trace(`unit:${tabName}:streamed-commit bytes=${parse.buffer.byteLength}`);
            const sres = await commitUnitStreamed(supabase, {
              unit,
              buffer: parse.buffer,
              targetSheet: tabName,
              classification: cls,
              tenantId, proposalId, tabName,
              fileName: `sci-bulk-${proposalId}`,
              fileHashSha256: parse.fileHash,
              onWindowCommitted: cls === 'reference' ? undefined : async (wrows, _o, eid) => {
                if (eid) await populateStoreMetadata(supabase, tenantId, wrows, eid);
              },
            });
            result = { contentUnitId: unit.contentUnitId, classification: cls, success: sres.success, rowsProcessed: sres.totalInserted, pipeline: cls, error: sres.error, stagedPulses: sres.stagedPulses };
            trace(`unit:${tabName}:streamed-commit-end committed=${sres.totalInserted} ok=${sres.success}`);
          }
        }

        let sheetData = result !== null ? undefined : sheetDataMap.get(tabName);
        // OB-251: a windowed (large) sheet carries rows:[] by design — resolve it by name/single-sheet
        // here, BEFORE the materialized-sheet guard below (which is written for full row arrays).
        if (result === null && !sheetData) {
          const wmatch = Array.from(sheetDataMap.entries()).find(([n]) => n.toLowerCase() === tabName.toLowerCase())?.[1]
            ?? (sheetDataMap.size === 1 ? Array.from(sheetDataMap.values())[0] : undefined);
          if (wmatch?.windowed) sheetData = wmatch;
        }
        if (result === null && sheetData?.windowed && sheetData.reader) {
          const cls = unit.confirmedClassification;
          if (cls === 'target' || cls === 'transaction' || cls === 'reference') {
            // OB-251 P-C1: stream the large sheet through commitUnitWindowed — the full row array is
            // NEVER materialized (the OOM fix). Field-filter uses the first window (columns are
            // identical across windows). populateStoreMetadata runs per window for data units.
            const sample = sheetData.reader.readWindow(0, 1);
            const effU = filterFieldsForPartialClaim(unit, sample).unit;
            trace(`unit:${tabName}:windowed-commit rows=${sheetData.totalRows}`);
            const wres = await commitUnitWindowed(supabase, {
              unit: effU,
              reader: sheetData.reader,
              classification: cls,
              tenantId, proposalId, tabName,
              fileName: `sci-bulk-${proposalId}`,
              fileHashSha256: parse.fileHash,
              onWindowCommitted: cls === 'reference' ? undefined : async (wrows, _o, eid) => {
                if (eid) await populateStoreMetadata(supabase, tenantId, wrows, eid);
              },
            });
            result = { contentUnitId: unit.contentUnitId, classification: cls, success: wres.success, rowsProcessed: wres.totalInserted, pipeline: cls, error: wres.error, stagedPulses: wres.stagedPulses };
            trace(`unit:${tabName}:windowed-commit-end committed=${wres.totalInserted} ok=${wres.success}`);
          } else {
            // Defensive: a windowed entity unit (rosters are never this large) — materialize bounded.
            sheetData = { rows: sheetData.reader.readWindow(0, sheetData.totalRows ?? 0), columns: sheetData.columns };
          }
        }
        if (result === null && (!sheetData || sheetData.rows.length === 0)) {
          // Try case-insensitive match
          const match = Array.from(sheetDataMap.entries()).find(
            ([name]) => name.toLowerCase() === tabName.toLowerCase()
          );
          if (match && match[1].rows.length > 0) {
            // HF-137: Assign matched sheet data back — was falling through with null sheetData
            sheetData = match[1];
          } else {
            // HF-137: If only 1 sheet exists, use it regardless of name (unambiguous)
            if (sheetDataMap.size === 1) {
              const onlySheet = Array.from(sheetDataMap.values())[0];
              if (onlySheet && onlySheet.rows.length > 0) {
                sheetData = onlySheet;
                console.log(`[SCI Bulk] Sheet name mismatch: "${tabName}" not found. Using only available sheet (${onlySheet.rows.length} rows)`);
              }
            }
            if (!sheetData || sheetData.rows.length === 0) {
              console.warn(`[SCI Bulk] No sheet data found for tab "${tabName}" (available: ${Array.from(sheetDataMap.keys()).join(', ')})`);
              results.push({
                contentUnitId: unit.contentUnitId,
                classification: unit.confirmedClassification,
                success: true,
                rowsProcessed: 0,
                pipeline: unit.confirmedClassification,
              });
              continue;
            }
          }
        }

        if (result === null) {
          const rows = sheetData?.rows || [];
          const effectiveUnit = filterFieldsForPartialClaim(unit, rows);

          trace(`unit:${tabName}:process-start rows=${rows.length}`);
          result = await processContentUnit(
            supabase, tenantId, proposalId, profileId,
            effectiveUnit.unit, effectiveUnit.rows, parse.fileNameFromPath, tabName,
            parse.fileHash,
          );
        }
        results.push(result);
        trace(`unit:${tabName}:process-end committed=${result.rowsProcessed} ok=${result.success}`);
        // D16 truthful completion: emit this unit's terminal `bound` state AS it commits — durable
        // per-unit, not batched at end-of-run. A mid-run infra failure (run-3's chunk-8/81 502 killed the
        // request before the end-batch ran) then still leaves a truthful durable record for every unit
        // that DID commit, so the completion screen reads the spine instead of inferring a false 0/16.
        // State-spine emission STREAMS (durability); the heavy flywheel/learning signals stay deferred to
        // post-commit below — no signal is dropped (DI-7), they are split by purpose, not discarded.
        if (result.success) {
          try {
            await emitUnitStates(
              [{
                tenantId, importSessionId: proposalId, unitId: result.contentUnitId,
                sheetName: unit.tabName ?? result.contentUnitId.split('::')[1] ?? null,
                sourceFileName: unit.sourceFile ?? null,
                state: 'bound' as const, seq: 5, classification: unit.confirmedClassification ?? null,
              }],
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
          } catch (stateErr) {
            // A state-spine write failure must never re-mark a committed unit as failed.
            console.warn(`[SCI Bulk] per-unit bound emit failed (non-blocking) for ${result.contentUnitId}:`, stateErr instanceof Error ? stateErr.message : stateErr);
          }
        } else {
          // OB-203 Phase C (combined arms, named in the ADR): a FAILED data unit
          // lands on the same spine as a committed one — terminal
          // failed_interpretation with its reason, durable, so no panel ever
          // shows a unit stuck mid-flight when the server already knows it died
          // (D16 truthful completion covers failure too; plan units already did
          // this at the batched-plan emission).
          try {
            await emitUnitStates(
              [{
                tenantId, importSessionId: proposalId, unitId: result.contentUnitId,
                sheetName: unit.tabName ?? result.contentUnitId.split('::')[1] ?? null,
                sourceFileName: unit.sourceFile ?? null,
                state: 'failed_interpretation' as const, seq: 5,
                classification: unit.confirmedClassification ?? null,
                failureClass: (result.error ?? 'unit_failed').slice(0, 300),
              }],
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
          } catch (stateErr) {
            console.warn(`[SCI Bulk] per-unit failed emit failed (non-blocking) for ${result.contentUnitId}:`, stateErr instanceof Error ? stateErr.message : stateErr);
          }
        }
      } catch (err) {
        results.push({
          contentUnitId: unit.contentUnitId,
          classification: unit.confirmedClassification,
          success: false,
          rowsProcessed: 0,
          pipeline: unit.confirmedClassification,
          error: String(err),
        });
        // Phase C combined arms: thrown failures land on the spine too.
        try {
          await emitUnitStates(
            [{
              tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
              sheetName: unit.tabName ?? unit.contentUnitId.split('::')[1] ?? null,
              sourceFileName: unit.sourceFile ?? null,
              state: 'failed_interpretation' as const, seq: 5,
              classification: unit.confirmedClassification ?? null,
              failureClass: String(err).slice(0, 300),
            }],
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
        } catch (stateErr) {
          console.warn(`[SCI Bulk] per-unit failed emit failed (non-blocking) for ${unit.contentUnitId}:`, stateErr instanceof Error ? stateErr.message : stateErr);
        }
      }
    }

    trace('unit-loop-end');

    // ── HF-360 (Part A): HAND OFF the loads. The function's final act before returning — collect every
    // unit's staged pulses (in commit order) into ONE pulse_load_jobs manifest and enqueue it. The pg_cron
    // worker performs the FDW loads off the serverless clock; this invocation NEVER spent the load duration
    // (the ceiling-kill fix). Resilient: an enqueue failure does not crash the response — the pulses are
    // staged + durable in Storage, recoverable by replay. No-op when the hand-off is off (sync path loaded
    // inline already) or when nothing staged. session_id = proposalId so the truthful surface (Part C)
    // correlates the job with the import telemetry.
    // HF-362 (Part B): collect whatever staged pulses the drivers produced — present only for the units that
    // decided to hand off (estTotalPulses > 1). Single-pulse units already committed synchronously and
    // contribute none. Only enqueue staged pulses from SUCCESSFUL units: a unit whose staging FAILED mid-way
    // returns its partial prefix + success:false (bypassing the staging-completeness HALT) — loading that
    // prefix would put PARTIAL data into committed_data (wrong calc), so its pulses are dropped (the unit is
    // reported failed via recordCommitFailureOnJob; the orphaned staged CSVs are transient). A failed-staging
    // unit is unit-atomic in hand-off: all of it loads or none does (re-import to redo it).
    let pulseLoadJob: { jobId: string; totalPulses: number; totalRows: number } | null = null;
    let pulseEnqueueFailed = false;
    const sessionPulses: Array<Omit<PulseManifestEntry, 'index'>> = results.filter((r) => r.success).flatMap((r) => r.stagedPulses ?? []);
    if (sessionPulses.length > 0) {
      pulseLoadJob = await enqueuePulseLoadJob(supabase, {
        tenantId,
        sessionId: proposalId,
        unitId: '(session)',
        fileName: traceLabel,
        stagedPulses: sessionPulses,
      });
      trace(`pulse-load-enqueued job=${pulseLoadJob?.jobId ?? 'none'} pulses=${pulseLoadJob?.totalPulses ?? 0} rows=${pulseLoadJob?.totalRows ?? 0}`);
      if (!pulseLoadJob) {
        // Staging SUCCEEDED but the job INSERT failed — the rows are staged + durable in Storage, yet nothing
        // will load them. NEVER render a false "0 rows imported" success: surface a failure (record it on the
        // job + flag the response so the client shows an error, not completion). Recoverable by re-import.
        pulseEnqueueFailed = true;
        await recordCommitFailureOnJob(supabase, tenantId, sessionId, 'Hand-off enqueue failed — staged rows were not handed to the loader (re-import to retry).');
      }
    }

    // ── DIAG-070 FIX: respond BEFORE post-commit; defer post-commit to a background task. ──
    // The per-unit commit loop is DONE and every unit's `bound` state was already streamed to the
    // spine in-loop, so the response is fully determined NOW. Build and return it immediately.
    // Everything below — entity resolution, assignment creation, input-binding clearance, flywheel,
    // the redundant end-of-run bound re-emit — is tenant-level POST-COMMIT bookkeeping the client
    // does not need in the response. Holding the response for it made the client's fetch await the
    // full ~300s post-commit window and time out (DIAG-070 trace: post-commit-construction-start
    // with no -end; client DISPATCH-START with no further lines, fetch never returned).
    const totalMs = Date.now() - startTime;
    const totalProcessed = results.reduce((s, r) => s + r.rowsProcessed, 0);
    console.log(`[SCI Bulk] Commit complete: ${totalProcessed} rows in ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s) — critical post-commit via finalize-import endpoint`);
    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success) && !pulseEnqueueFailed,
      // HF-360 (Part A): the hand-off job, so the client/surface can poll load progress (the rows are
      // staged + loading, not in committed_data yet). Absent when not handing off or nothing staged.
      ...(pulseLoadJob ? { pulseLoadJob } : {}),
      // HF-360: staging succeeded but the enqueue failed — the client must surface a failure, not completion.
      ...(pulseEnqueueFailed ? { pulseLoadEnqueueFailed: true } : {}),
    };
    trace('response');

    // HF-358 (Part B-1): NO SILENT FAILURE. Every commit-failure exit in commitContentUnit /
    // commitUnitStreamed / commitUnitWindowed surfaces here as a unit result with success:false (each
    // failCommit returns success:false and execute-bulk pushes it). If ANY unit failed, record the
    // reason + a terminal status on the import job so the failure is job-visible (DIAG-078 saw
    // error_detail=null). Awaited, non-throwing; no-op on the sync path (no session). Mechanical reasons
    // only (reconciliation-channel separation).
    if (!response.overallSuccess) {
      const reason = results.filter(r => !r.success).map(r => `${r.contentUnitId}: ${r.error ?? 'commit failed'}`).join(' | ').slice(0, 2000);
      await recordCommitFailureOnJob(supabase, tenantId, sessionId, `Commit failed — ${reason}`);
      await markSessionJobs(supabase, tenantId, sessionId, { phase: 'failed' }); // HF-372 Phase D
    } else if (pulseLoadJob) {
      // HF-372 Phase D: hand-off — rows are STAGED, not durable; the truthful status stays
      // 'committing' with phase 'loading' until the DB worker finishes and the sweep finalizes.
      await markSessionJobs(supabase, tenantId, sessionId, { phase: 'loading' });
    } else {
      // HF-372 Phase D: synchronous path — the rows ARE durable in committed_data now. The SERVER
      // writes 'committed' (this was the browser-only write that lied); finalize (dispatched below)
      // advances to 'finalized' when entity resolution + assignments complete.
      await markSessionJobs(supabase, tenantId, sessionId, { status: 'committed', phase: 'finalizing' });
    }

    // HF-362 (CRITICAL — entity construction on the synchronous path): when the import committed
    // SYNCHRONOUSLY (no hand-off — every unit fit in one pulse, the common BCL/small-file case after Part B),
    // the rows are in committed_data NOW, so entity resolution must run. HF-360 deferred finalize to the
    // CLIENT (handleExecutionComplete) for the sync path and to the finalize-sweep for the hand-off path; but
    // a client that navigates away (or never drives the commit) leaves committed_data with NULL entity_id and
    // ZERO entities — exactly the BCL regression. Fire finalize-import SERVER-SIDE here (its own invocation +
    // 300s budget, cookieless internal-cron principal) so entity resolution is GUARANTEED on the synchronous
    // path, independent of the client — mirroring the finalize-sweep on the hand-off path. waitUntil keeps
    // this invocation alive long enough to dispatch the POST; finalize-import then runs to completion on its
    // own. Idempotent (matches external_id; skips already-resolved rows) — safe alongside the client's fire.
    if (response.overallSuccess && !pulseLoadJob) {
      try {
        waitUntil(
          fetch(`${req.nextUrl.origin}/api/import/sci/finalize-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
            body: JSON.stringify({ tenantId, proposalId }),
          })
            .then((r) => console.log(`[HF-362] server-side synchronous finalize dispatched: HTTP ${r.status}`))
            .catch((err) => console.warn('[HF-362] server-side finalize dispatch failed (client fire is the fallback):', err instanceof Error ? err.message : err)),
        );
      } catch { /* non-Vercel context — the fetch still runs detached */ }
    }

    // HF-300 (C3, DIAG-071): the CRITICAL post-commit work — entity resolution + entity_id back-link
    // (executePostCommitConstruction), input_bindings invalidation, and rule_set_assignments
    // (createMissingAssignments) — has MOVED OUT of this per-file response tail to the dedicated
    // /api/import/sci/finalize-import endpoint, which the client calls ONCE after the whole import.
    // Reason: DIAG-071 proved this waitUntil background does NOT complete on Vercel (99% of
    // committed_data left with NULL entity_id; active plan 0 assignments — `TypeError: fetch failed`
    // after response flush). finalize runs that work in a LIVE request (reliable) and exactly once
    // (retiring DIAG-070's per-file 15× redundancy). PR #530's import-speed win is preserved — the
    // per-file response still returns immediately below.
    //
    // What remains here is BEST-EFFORT only (NOT calc-critical): flywheel learning signals (which need
    // the per-file parsed rows that only this route holds) and the idempotent end-of-run `bound`
    // re-emit (the per-unit emits already streamed in-loop). If the background is frozen these degrade
    // gracefully — learning is skipped; the spine already carries every committed unit's state.
    const bestEffortPostCommit = (async () => {
      // HF-239 Phase 0.2: flywheel signal emission. Per-content-unit row sample (first 5 rows of the
      // matched sheet) so the fingerprint hash matches what analyze wrote.
      const rowsByContentUnitId = new Map<string, Record<string, unknown>[]>();
      for (const unit of sortedUnits) {
        const sheetDataMap = resolveParse(unit).sheetDataMap;  // HF-256: per-file sheet map
        const parts = unit.contentUnitId.split('::');
        const tabName = parts[1] || 'Sheet1';
        let sheetData = sheetDataMap.get(tabName);
        if (!sheetData) {
          const match = Array.from(sheetDataMap.entries()).find(
            ([n]) => n.toLowerCase() === tabName.toLowerCase(),
          );
          if (match) sheetData = match[1];
          else if (sheetDataMap.size === 1) sheetData = Array.from(sheetDataMap.values())[0];
        }
        if (sheetData && sheetData.rows.length > 0) {
          rowsByContentUnitId.set(unit.contentUnitId, sheetData.rows.slice(0, 5));
        }
      }
      emitFlywheelSignals({
        contentUnits: contentUnits,
        tenantId,
        tenantDomainId,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        rowsByContentUnitId,
      });
      trace('flywheel-emitted');

      // OB-203 Phase 3: end-of-run batch `bound` re-emit — idempotent backstop; the per-unit emits
      // already streamed in-loop, so the client's response path never depended on this.
      try {
        const cuById = new Map(contentUnits.map(u => [u.contentUnitId, u]));
        await emitUnitStates(
          results.filter(r => r.success).map(r => {
            const cu = cuById.get(r.contentUnitId);
            return {
              tenantId, importSessionId: proposalId, unitId: r.contentUnitId,
              sheetName: cu?.tabName ?? r.contentUnitId.split('::')[1] ?? null,
              sourceFileName: cu?.sourceFile ?? null,
              state: 'bound' as const, seq: 5, classification: cu?.confirmedClassification ?? null,
            };
          }),
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
      } catch (err) {
        console.error('[SCI Bulk] end-of-run bound re-emit failed (background, non-blocking):', err instanceof Error ? err.message : err);
      }
      trace('bound-states-emitted');
    })();
    try { waitUntil(bestEffortPostCommit); } catch { /* non-Vercel context — promise runs detached */ }

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Bulk] Error:', err);
    // HF-358 (Part B-1): a thrown commit failure (the catchable kind — NOT an OOM kill, which Part B-2's
    // reclaim cap covers) is also recorded on the job, so no commit failure exits without a job-visible
    // reason + terminal status. jobServiceClient/jobTenantId are set once the body is parsed.
    if (jobServiceClient && jobTenantId) {
      await recordCommitFailureOnJob(jobServiceClient, jobTenantId, jobSessionId, `Commit error — ${String(err).slice(0, 1900)}`);
    }
    return NextResponse.json(
      { error: 'Bulk execution failed', details: String(err) },
      { status: 500 }
    );
  }
}

// ── Field filtering for PARTIAL claims ──
// HF-236 (DIAG-050 closure): Per T1-E902 v2 (Carry Everything, Express
// Contextually — locked 2026-05-18: Persistence scope persists ALL data;
// Hints-not-gates: AI classifications do not gate persistence) and T2-E06
// v2 (HC Override Authority — locked 2026-05-18: HC observations persist
// to committed_data irrespective of claim type; automated narrowing of
// the HC observation set during claim-type projection is a named
// violation pattern), the PARTIAL claim primitive narrows agent
// ownership semantics only. row_data persists unconditionally; the
// confirmedBindings narrow to the agent's owned + shared field set so
// downstream code that consults bindings sees the agent's semantic
// claim, while persistence-time code that reads rows sees every column
// the customer's file carries.

function filterFieldsForPartialClaim(
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return { unit, rows };
  }

  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);

  const filteredBindings = unit.confirmedBindings.filter(
    b => allowedFields.has(b.sourceField)
  );

  return {
    unit: { ...unit, confirmedBindings: filteredBindings },
    rows,
  };
}

// ── D16 unit-atomic rollback helper ──
// Deletes the entities a single entity unit just created — by their exact new external_ids, batched.
// Safe because every id in `newIds` was ABSENT from the tenant at fetch time (filtered against
// existingMap), so this never removes a pre-existing or another unit's entity. Non-throwing: a rollback
// failure is logged, never propagated (it must not convert one failure into an unhandled crash).
async function rollbackNewEntities(supabase: SupabaseClient, tenantId: string, newIds: string[]): Promise<void> {
  if (newIds.length === 0) return;
  try {
    for (let j = 0; j < newIds.length; j += 200) {
      const slice = newIds.slice(j, j + 200);
      const { error } = await supabase.from('entities').delete().eq('tenant_id', tenantId).in('external_id', slice);
      if (error) console.error(`[SCI Bulk] entity rollback batch failed: ${error.message}`);
    }
  } catch (e) {
    console.error('[SCI Bulk] entity rollback threw (non-blocking):', e instanceof Error ? e.message : e);
  }
}

// ── Process a single content unit with server-parsed data ──

async function processContentUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  profileId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  fileHashSha256: string,
  // HF-257: `storagePath` parameter removed — only the deleted per-unit `case 'plan'`
  // (executePlanPipeline) used it; the four data pipelines bind by parsed rows.
): Promise<ContentUnitResult> {
  // HF-362 (Part B): the direct path is a SINGLE commitContentUnit call (one pulse) → always synchronous.
  // Multi-pulse units go through commitUnitStreamed/Windowed (which decide hand-off). No handOff here.
  switch (unit.confirmedClassification) {
    case 'entity':
      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
    case 'target':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
    case 'transaction':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
    case 'reference':
      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
    case 'plan':
      // HF-257 (AP-17): the per-unit plan duplicate (executePlanPipeline) is REMOVED.
      // Plan interpretation runs EXCLUSIVELY in executeBatchedPlanInterpretation. The
      // batched dispatch marks every plan unit handled (success OR explicit failure), so
      // this switch arm is reached only if a plan unit was somehow not accounted for —
      // surface an explicit failure rather than silently re-running a second interpreter.
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'plan',
        success: false,
        rowsProcessed: 0,
        pipeline: 'plan-interpretation',
        error: 'Plan unit not handled by the batched plan pipeline (unexpected). The per-unit plan interpreter was removed for AP-17 single-pipeline (HF-257).',
      };
    default:
      return {
        contentUnitId: unit.contentUnitId,
        classification: unit.confirmedClassification,
        success: false,
        rowsProcessed: 0,
        pipeline: unit.confirmedClassification,
        error: `Unsupported classification for bulk processing: ${unit.confirmedClassification}`,
      };
  }
}

// ── Entity pipeline ──

async function processEntityUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: 0, pipeline: 'entity' };
  }

  const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');
  const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');

  // HF-370 (O2, Decision 158): entity creation derives ONLY from the MODEL's recognition of a genuine
  // entity identifier — findHcEntityIdColumn reads the model's bare scope_role==='entity' &&
  // nature_role==='identifier' (commit-content-unit.ts). This is now PRIMARY. The confirmedBindings
  // entity_identifier surface is a SECOND, heuristic-tainted surface: negotiation.ts assigns
  // entity_identifier via cardinality / sequential-integer / first-column fallbacks, which can pick a
  // `#` row-ordinal or a rate-table band label (`<70%`, `≥120%`) that the model recognized as a row
  // index / categorical — spawning phantom entities. So the binding is used ONLY as a fallback when the
  // model recognized NO entity id, and that fallback is row-index-guarded. The model never picks a `#`
  // or a band label (their nature_role is not 'identifier'), so the phantom paths are closed.
  // The set of columns the MODEL recognized as entity-scope identifiers (scope_role==='entity' &&
  // nature_role==='identifier'). A `#` row ordinal or a rate-table band label is NEVER in this set.
  const modelCandidates = findHcEntityIdCandidates(unit.classificationTrace);
  let idSourceField: string | null =
    // The heuristic binding is honored ONLY when it agrees with the model (preserves the multi-
    // candidate disambiguation, e.g. ID_Empleado chosen over ID_Gerente). Otherwise the model wins.
    (idBinding && modelCandidates.includes(idBinding.sourceField))
      ? idBinding.sourceField
      : (findHcEntityIdColumn(unit.classificationTrace) ?? null);
  if (!idSourceField && idBinding) {
    // The model recognized NO entity identifier and the only surface is the heuristic binding — allow
    // it ONLY if it is not a row index (a `#` / ordinal column can never spawn entities). Band labels
    // are already excluded above (they are never model candidates and a lone reference sheet has no
    // entity binding); the row-index guard closes the remaining ordinal case.
    const sample = rows.slice(0, 50).map(r => (r[idBinding.sourceField] == null ? '' : String(r[idBinding.sourceField]).trim())).filter(Boolean);
    if (looksLikeRowIndex(sample)) {
      console.warn(`[SCI Bulk][HF-370] Refused heuristic entity_identifier "${idBinding.sourceField}" for ${unit.tabName}: values look like a row index and the model recognized no entity identifier — not spawning entities.`);
    } else {
      idSourceField = idBinding.sourceField;
    }
  }
  if (!idSourceField) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: 'No model-recognized entity identifier (scope_role=entity, nature_role=identifier); the heuristic binding was absent or a row-index — refusing to spawn entities from a non-identifier column (HF-370 O2)' };
  }

  // HF-371 (Root 3, EPG-C1): the "code guarantees" half of Decision 158. A column whose VALUES ARE THE
  // ROW POSITIONS (1,2,3…N in row order) carries no identity beyond position — it can NEVER be an entity
  // key, regardless of the model's semantic guess (a plan-component sheet's `#` mis-tagged as an
  // identifier would otherwise mint phantom "people" 1,2,3…). This is a structural/arithmetic fact — zero
  // language strings (Korean Test) — applied to the FINAL chosen id column, whether it came from the model
  // or the heuristic binding. (HF-370 O2 guarded only the fallback; this guards the model candidate too.)
  const idSample = rows.slice(0, 200).map(r => (r[idSourceField as string] == null ? '' : String(r[idSourceField as string]).trim())).filter(Boolean);
  if (looksLikeRowIndex(idSample)) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: `Refusing entity key "${idSourceField}" — its values are the row ordinals (1..N); a row-position column can never identify entities (HF-371 EPG-C1 structural guard).` };
  }

  // Collect unique external IDs with metadata + enrichment attributes
  const entityData = new Map<string, { name: string; role?: string; licenses?: string; enrichment: Record<string, string> }>();
  // OB-177: Detect enrichment fields — entity_attribute bindings that are text (not ID/name)
  const enrichmentBindings = unit.confirmedBindings.filter(b =>
    b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label'
  );
  for (const row of rows) {
    const eid = row[idSourceField];
    if (eid == null || !String(eid).trim()) continue;
    const key = String(eid).trim();
    if (entityData.has(key)) continue;

    const name = nameBinding ? String(row[nameBinding.sourceField] || key).trim() : key;
    const meta: { name: string; role?: string; licenses?: string; enrichment: Record<string, string> } = { name, enrichment: {} };

    for (const binding of unit.confirmedBindings) {
      if (binding.semanticRole === 'entity_attribute') {
        const fieldLower = binding.sourceField.toLowerCase().replace(/[\s_-]+/g, '');
        if (ROLE_TARGETS.some(t => fieldLower.includes(t))) {
          meta.role = String(row[binding.sourceField] || '').trim();
        }
      }
    }
    if (licenseBinding) {
      meta.licenses = String(row[licenseBinding.sourceField] || '').trim();
    }

    // OB-177: Collect ALL enrichment field values for temporal_attributes
    for (const binding of enrichmentBindings) {
      const val = row[binding.sourceField];
      if (val != null && typeof val === 'string' && val.trim()) {
        const normalizedKey = binding.sourceField.toLowerCase().replace(/[\s]+/g, '_');
        meta.enrichment[normalizedKey] = val.trim();
      }
    }

    entityData.set(key, meta);
  }

  // Fetch existing entities in batches of 200 (Section G). OB-203 Phase C: the
  // select is WIDENED to carry the enrichment-merge inputs (temporal_attributes,
  // metadata) plus the columns the upsert must re-assert — this one batched read
  // (already happening) eliminates BOTH per-entity SELECTs the retired enrich
  // loop ran (DS-020 litmus: batch I/O, no per-entity round-trips).
  interface ExistingEntityRow {
    id: string; external_id: string | null; entity_type: string; status: string;
    display_name: string; temporal_attributes: Json; metadata: Json;
  }
  const allIds = Array.from(entityData.keys());
  const existingMap = new Map<string, string>();
  const existingRows = new Map<string, ExistingEntityRow>();
  const BATCH = 200;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id, entity_type, status, display_name, temporal_attributes, metadata')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);
    if (existing) {
      for (const e of existing as unknown as ExistingEntityRow[]) {
        if (e.external_id) {
          existingMap.set(e.external_id, e.id);
          existingRows.set(e.external_id, e);
        }
      }
    }
  }

  // OB-177: Build temporal_attributes from enrichment fields
  const importDate = new Date().toISOString().split('T')[0];
  function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
    return Object.entries(enrichment).map(([key, value]) => ({
      key,
      value,
      effective_from: importDate,
      effective_to: null,
      source: 'import',
    }));
  }

  // OB-203 Phase C: compute the ENTIRE write plan in memory BEFORE any write —
  // new-entity rows (unchanged build) plus the enrichment changed-set (pure
  // merge over the widened fetch; the retired loop's exact semantics live in
  // computeEnrichmentMerge). Knowing the plan up front makes the entity phase's
  // pulse total truthful from the first pulse.
  const newIds = allIds.filter(eid => !existingMap.has(eid));
  const newEntities = newIds.map(eid => {
    const meta = entityData.get(eid);
    return {
      tenant_id: tenantId,
      external_id: eid,
      display_name: meta?.name || eid,
      entity_type: 'individual' as const,
      status: 'active' as const,
      temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
      metadata: {
        ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
        ...(meta?.role ? { role: meta.role } : {}),
        ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
      } as Record<string, Json>,
    };
  });

  // OB-177 semantics preserved: enrich EXISTING entities — merge temporal
  // attributes (don't overwrite), spread enrichment into metadata (HF-190).
  const upsertRows: Array<Record<string, unknown>> = [];
  for (const eid of allIds) {
    const row = existingRows.get(eid);
    if (!row) continue;
    const meta = entityData.get(eid);
    if (!meta?.enrichment || Object.keys(meta.enrichment).length === 0) continue;
    const merge = computeEnrichmentMerge({
      existingAttrs: ((row.temporal_attributes ?? []) as unknown as TemporalAttr[]),
      existingMeta: ((row.metadata ?? {}) as Record<string, unknown>),
      enrichment: meta.enrichment,
      role: meta.role,
      importDate,
    });
    if (!merge.changed) continue; // idempotent — nothing to write for this entity
    upsertRows.push({
      id: row.id,
      tenant_id: tenantId,
      external_id: row.external_id,
      display_name: row.display_name,
      entity_type: row.entity_type,
      status: row.status,
      temporal_attributes: merge.temporalAttributes as unknown as Json[],
      metadata: merge.metadata as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  }

  // Entity-phase pulse plan: every WRITE chunk is a pulse on the SAME spine as
  // commit pulses (HALT-1 disposition §3: one observability spine, no
  // entity-specific vocabulary). Creation writes in 5000s; enrichment upserts
  // at the standing 200 (Amendment 2 §3).
  const INSERT_BATCH = 5000;
  const ENRICH_BATCH = 200;
  const entityPulsesTotal = Math.ceil(newEntities.length / INSERT_BATCH) + Math.ceil(upsertRows.length / ENRICH_BATCH);
  let entityPulsesLanded = 0;
  if (entityPulsesTotal > 0) {
    await accumulateUnitCommitFields({
      tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
      fields: { sheetName: tabName, pulsesTotal: entityPulsesTotal, pulsesLanded: 0 },
    }, supabase);
  }
  const landEntityPulse = async (entitiesWritten: number) => {
    entityPulsesLanded++;
    ob203Trace('pulse', { unit: unit.contentUnitId, sheet: tabName, pulse: entityPulsesLanded, ofTotal: entityPulsesTotal, rows: entitiesWritten });
    await accumulateUnitCommitFields({
      tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
      fields: { pulsesLanded: entityPulsesLanded },
    }, supabase);
  };
  const zeroEntityPulses = async () => {
    await accumulateUnitCommitFields({
      tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
      fields: { pulsesLanded: 0, pulsesTotal: 0 },
    }, supabase);
  };

  // Create new entities — bulk insert in 5000-row chunks (unchanged write shape).
  let created = 0;
  for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
    const slice = newEntities.slice(i, i + INSERT_BATCH);
    const { error: entErr } = await supabase.from('entities').insert(slice);
    if (entErr) {
      // D16 unit-atomic: roll back every entity THIS unit created (all are new — pre-existing were
      // filtered out via existingMap), so a partial entity insert retains nothing, then report truthfully.
      await rollbackNewEntities(supabase, tenantId, newIds);
      await zeroEntityPulses();
      return { contentUnitId: unit.contentUnitId, classification: 'entity' as const, success: false, rowsProcessed: 0, pipeline: 'entity', error: `${entErr.message} — entity unit rolled back (${created} partial entities removed)` };
    }
    created += slice.length;
    await landEntityPulse(created);
  }

  // Enrich changed entities — 200-row upsert chunks. The retired per-entity
  // loop's 2 SELECTs + 1 UPDATE per entity are extinct on this path: the reads
  // rode the widened batch fetch above; the writes land here, in pulses.
  // No enrich rollback (same posture as the retired loop): the merge is
  // idempotent and re-runnable; a chunk failure fails the unit truthfully.
  let enriched = 0;
  for (let i = 0; i < upsertRows.length; i += ENRICH_BATCH) {
    const slice = upsertRows.slice(i, i + ENRICH_BATCH);
    const { error: upErr } = await supabase.from('entities').upsert(slice as never[], { onConflict: 'id' });
    if (upErr) {
      await rollbackNewEntities(supabase, tenantId, newIds);
      await zeroEntityPulses();
      return { contentUnitId: unit.contentUnitId, classification: 'entity' as const, success: false, rowsProcessed: 0, pipeline: 'entity', error: `${upErr.message} — enrich upsert failed at chunk ${Math.floor(i / ENRICH_BATCH) + 1}; entity unit rolled back (${created} new entities removed)` };
    }
    enriched += slice.length;
    await landEntityPulse(created + enriched);
  }

  console.log(`[SCI Bulk] Entity: ${created} new, ${existingMap.size} existing, ${enriched} enriched`);

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // Entity creation above is a side effect; committed_data is the uniform store.
  // Classification is a hint, not a gate — all four pipelines carry the same
  // metadata shape through this single writer.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'entity',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
    // Phase C: compose entity-phase pulses with commit pulses on one number line.
    pulseBase: { landed: entityPulsesLanded, total: entityPulsesTotal },
  });
  // D16 unit-atomic + truthfulness: commitContentUnit rolls back its OWN partial rows on failure; if its
  // committed_data write failed, roll back this unit's new entities too (all-or-nothing across both
  // surfaces) and report the unit as failed rather than the prior silent success-regardless. In hand-off
  // mode a !success result means STAGING failed (the upload), which is the same all-or-nothing trigger.
  if (!commitResult.success) {
    await rollbackNewEntities(supabase, tenantId, newIds);
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: `${commitResult.error ?? 'committed_data write failed'} — entity unit rolled back (${created} entities removed)` };
  }

  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
  // The blanket wipe destroyed BCL's PASS-RECONCILED state (DIAG-052
  // captured the regression: $44,590 → $36,640 on the period that was
  // recalculated post-HF-238). Calc-time convergence has its own
  // versioning gate (convergence_version === 'HF-234') at
  // route.ts:226-308 — that gate re-derives when stale without needing a
  // blanket clear on every import.

  // HF-362 (Part B): the direct entity path is single-pulse → always synchronous (entities AND committed_data
  // both land here). Multi-pulse units take the streamed/windowed path that decides hand-off.
  return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: rows.length, pipeline: 'entity' };
}

// ── Target/Transaction pipeline (committed_data bulk insert) ──

async function processDataUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  classification: 'target' | 'transaction',
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification, success: true, rowsProcessed: 0, pipeline: classification };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification,
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  const totalInserted = commitResult.totalInserted;

  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
  // See processEntityUnit for rationale (DIAG-052 regression evidence).

  // HF-239 Phase 0.4: OB-146 Step 1b store metadata population — extracted
  // from execute/route.ts's per-pipeline postCommitConstruction helper.
  // Reads STORE_FIELDS / TIER_FIELDS / VOLUME_KEY_FIELDS from each row and
  // updates entities.metadata so the calculation engine can resolve
  // store-level data per entity. HF-360: it operates on the in-memory `rows` +
  // the entities table (independent of the deferred committed_data load), so it
  // must run for a STAGED unit too — gate on commit SUCCESS + rows, not on the
  // loaded count (which is 0 at stage time). Byte-identical for the sync path
  // (success ⟺ totalInserted == rows.length there).
  if (commitResult.success && rows.length > 0 && commitResult.entityIdField) {
    try {
      await populateStoreMetadata(supabase, tenantId, rows, commitResult.entityIdField);
    } catch (err) {
      console.error('[SCI Bulk] populateStoreMetadata failed (non-blocking):', err);
    }
  }

  return {
    contentUnitId: unit.contentUnitId,
    classification,
    success: true,
    rowsProcessed: totalInserted,
    pipeline: classification,
  };
}

// ── Reference pipeline ──

async function processReferenceUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  // OB-195 Layer 1: Reference pipeline → committed_data (Decision 111)
  // Previously wrote to reference_data + reference_items (deprecated).
  // Now follows processDataUnit pattern: all data → committed_data.
  // Engine aggregates all numeric fields at calc time (aggregateMetrics sums across all rows).
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: 0, pipeline: 'reference' };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'reference',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  if (!commitResult.success && commitResult.totalInserted === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: false,
      rowsProcessed: 0,
      pipeline: 'reference',
      error: commitResult.error,
    };
  }
  const totalInserted = commitResult.totalInserted;

  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
  // See processEntityUnit for rationale (DIAG-052 regression evidence).

  return {
    contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: totalInserted, pipeline: 'reference',
  };
}

// HF-196 Phase 1: dead-code retirement.
// The legacy `_postCommitConstruction_REMOVED` function (deferred-by-OB-182,
// retained as dead code reference at this position pending calc-time
// replacement) is superseded by `executePostCommitConstruction` in
// `@/lib/sci/post-commit-construction`. It carried Korean-Test violations
// (hardcoded Spanish/English store-metadata field names) that must not
// be re-introduced. Deleted in HF-196 Phase 1 per directive SR-41 disposition
// (function never reached production under this name; clean deletion).
// Any future store-metadata population must derive field names from
// field_identities metadata (Korean Test compliant) rather than hardcoded lists.
