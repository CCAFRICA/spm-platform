// OB-156: SCI Execute Bulk — Server-side file processing
// Downloads file from Supabase Storage, parses server-side, bulk inserts.
// Fixes AP-1 (no row data in HTTP bodies) and AP-2 (no sequential chunks from browser).

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
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
// HF-196 Phase 1: post-commit construction unified across both import endpoints.
// Closes Break #3 (import surface fragmentation): execute-bulk now runs the same
// post-commit work as execute (entity resolution + entity_id back-link).
import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
// HF-231: unified committed_data writer — sole write surface across all four
// classifications. Replaces 4 inline write sites in this route (plus 4 in
// execute/route.ts). Closes AP-17 (parallel metadata construction).
import { commitContentUnit } from '@/lib/sci/commit-content-unit';
// OB-203 Phase C: batch entity enrichment (pure merge) + entity-phase pulses
// through the one observability spine (VERBOSE 'pulse' + session record).
import { computeEnrichmentMerge, type TemporalAttr } from '@/lib/sci/entity-enrichment';
import { accumulateUnitCommitFields } from '@/lib/sci/session-telemetry-accumulator';
import { ob203Trace } from '@/lib/sci/ob203-verbose';
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
// HF-239 Phase 0.3: rule_set_assignments creation extracted (HF-126 block).
import { createMissingAssignments } from '@/lib/sci/assignment-creation';
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
  storagePath?: string;  // HF-256: back-compat single-file path; superseded by storagePaths
  // HF-256 (Decision 82 multi-file): per-file storage map (fileName -> path). Every file
  // in the import is downloaded and processed by its own format. When absent, the import
  // degrades to the single-file `storagePath` (byte-identical pre-HF behavior).
  storagePaths?: Record<string, string>;
  contentUnits: BulkContentUnit[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

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
    const { proposalId, tenantId, storagePath, storagePaths, contentUnits } = body;

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

    // ── OB-203 D16.1: reconcile stale/partial batches from a prior outage, BEFORE committing new data ──
    // A batch stuck in `processing` past its liveness window (an outage killed the request mid-commit) is
    // marked `failed` truthfully, and any orphan rows it left — here or in a `failed` batch whose
    // host-killed rollback never ran — are deleted while the host is healthy. The platform self-heals at
    // the next import; nothing partial survives into this import as live data.
    try {
      const recon = await reconcileStaleBatches(supabase, tenantId);
      if (recon.reconciledProcessing || recon.rowsReclaimed || recon.failedSwept) {
        console.log(`[SCI Bulk] D16.1 reconcile: processing→failed=${recon.reconciledProcessing} failedSwept=${recon.failedSwept} rowsReclaimed=${recon.rowsReclaimed}`);
      }
    } catch (reconErr) {
      console.error('[SCI Bulk] D16.1 reconcile failed (non-blocking):', reconErr instanceof Error ? reconErr.message : reconErr);
    }

    // ── Step 1+2 (HF-256, Decision 82 multi-file): per-file download + format-aware parse ──
    // Every file in the import is downloaded and parsed by its OWN format. The per-file
    // map (storagePaths) supersedes the single storagePath; when only the single path is
    // present, the import degrades to exactly one file — byte-identical to the pre-HF path.
    type FileParse = {
      fileName: string;
      path: string;
      fileHash: string;
      fileNameFromPath: string;
      sheetDataMap: Map<string, { rows: Record<string, unknown>[]; columns: string[] }>;
    };

    const fileEntries: Array<{ fileName: string; path: string }> =
      storagePaths && Object.keys(storagePaths).length > 0
        ? Object.entries(storagePaths).map(([fileName, path]) => ({ fileName, path }))
        : [{ fileName: (storagePath!.split('/').pop()?.replace(/^\d+_/, '') || 'unknown'), path: storagePath! }];

    const fileParseByName = new Map<string, FileParse>();
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

      const sheetDataMap = new Map<string, { rows: Record<string, unknown>[]; columns: string[] }>();
      // HF-256: format-aware parse (file-format.ts). Documents (PDF/PPTX/DOCX) are PLAN
      // sources — NOT workbook-parsed; their plan unit routes to the format-aware plan
      // pipeline below. Workbook-parsing a document would throw "Could not find workbook".
      // Spreadsheets parse exactly as before (single XLSX file => byte-identical sheet map).
      if (isSpreadsheetPath(path)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          if (!ws) continue;
          const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          sheetDataMap.set(sheetName, { rows: jsonData, columns });
        }
      } else {
        console.log(`[SCI Bulk] HF-256: document file (.${extensionOf(path)}) — skipping workbook parse; plan unit routes to format-aware plan pipeline`);
      }
      const fileTotalRows = Array.from(sheetDataMap.values()).reduce((s, d) => s + d.rows.length, 0);
      console.log(`[SCI Bulk] ${fileName}: parsed ${fileTotalRows} rows across ${sheetDataMap.size} sheets in ${Date.now() - parseStart}ms`);
      fileParseByName.set(fileName, {
        fileName,
        path,
        fileHash,
        fileNameFromPath: path.split('/').pop()?.replace(/^\d+_/, '') || fileName,
        sheetDataMap,
      });
    }

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
          | { interpretations?: Record<string, { semanticMeaning?: string; columnRole?: string; confidence?: number }> }
          | null
          | undefined;
      const interps = hc?.interpretations;
      if (!interps || Object.keys(interps).length === 0) continue;
      comprehendedSheetCount++;
      for (const [colName, interp] of Object.entries(interps)) {
        if (!comprehendedFieldMap.has(colName)) {
          comprehendedFieldMap.set(colName, {
            field: colName,
            meaning: interp.semanticMeaning || '',
            role: interp.columnRole || 'unknown',
          });
        }
      }
    }
    const comprehendedFields = Array.from(comprehendedFieldMap.values());
    console.log(`[SCI Bulk] HF-270 comprehended-field set: ${comprehendedFields.length} fields from ${comprehendedSheetCount} data sheets`);

    if (planUnits.length > 0) {
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
    }

    for (const unit of sortedUnits) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue; // HF-239: handled in batch
      try {
        // HF-256: resolve this unit's source file's parse (single-file => the one parse).
        const parse = resolveParse(unit);
        const sheetDataMap = parse.sheetDataMap;
        // Resolve sheet data for this content unit
        const parts = unit.contentUnitId.split('::');
        const tabName = parts[1] || 'Sheet1';

        let sheetData = sheetDataMap.get(tabName);
        if (!sheetData || sheetData.rows.length === 0) {
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

        const rows = sheetData?.rows || [];
        const effectiveUnit = filterFieldsForPartialClaim(unit, rows);

        const result = await processContentUnit(
          supabase, tenantId, proposalId, profileId,
          effectiveUnit.unit, effectiveUnit.rows, parse.fileNameFromPath, tabName,
          parse.fileHash,
        );
        results.push(result);
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

    // HF-196 Phase 1: post-commit construction — entity resolution + back-link.
    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });

    // HF-269 Phase C (OB-195 cache invalidation): new data was just imported, so any persisted
    // input_bindings are stale — they may bind columns that no longer resolve against the new data,
    // and the HF-165 calc gate would skip convergence and re-use them, producing zero. Clear them
    // (write {} — rule_sets.input_bindings is jsonb NOT NULL) so convergence RE-DERIVES on the next
    // calculation (Decision 92 keeps binding at calc time; it re-runs because the bindings are empty,
    // not because the gate changed). Scoped STRICTLY to the importing tenant's active/draft rule_sets —
    // never touches other tenants. (HF-239 deleted a BLANKET wipe that masked stale bindings; this is
    // the scoped OB-195-correct form, now that Phase B's filter-carrying bindings re-derive correctly.)
    try {
      const { data: clearedRs, error: clearErr } = await supabase
        .from('rule_sets')
        .update({ input_bindings: {} })
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'draft'])
        .select('id');
      if (clearErr) {
        console.error('[SCI Bulk] input_bindings invalidation failed (non-blocking):', clearErr.message);
      } else {
        console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRs?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
      }
    } catch (err) {
      console.error('[SCI Bulk] input_bindings invalidation threw (non-blocking):', err instanceof Error ? err.message : String(err));
    }

    // HF-239 Phase 0.3: HF-126 rule_set_assignments creation. Calculation
    // engine requires assignments to route entities to plans. Fire-and-forget
    // at the surface level — failures are logged but do not block.
    try {
      await createMissingAssignments(supabase, tenantId);
    } catch (err) {
      console.error('[SCI Bulk] Assignment creation failed (non-blocking):', err);
    }

    // HF-239 Phase 0.2: flywheel signal emission. Build a per-content-unit
    // row sample (first 5 rows of the matched sheet) so the fingerprint
    // hash matches what the analyze step wrote. Fire-and-forget: never
    // blocks import.
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

    const totalMs = Date.now() - startTime;
    const totalProcessed = results.reduce((s, r) => s + r.rowsProcessed, 0);
    console.log(`[SCI Bulk] Complete: ${totalProcessed} rows in ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);

    // OB-203 Phase 3: `bound` — committed rows are durable; the unit reaches the terminal spine
    // state. importSessionId aliases proposalId (SAME comprehension session as analyze), kept
    // distinct from the per-unit import_batch_id minted at commit (HF-213 supersession lineage).
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

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Bulk] Error:', err);
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

  if (!idBinding) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: 'No entity_identifier binding found' };
  }

  // Collect unique external IDs with metadata + enrichment attributes
  const entityData = new Map<string, { name: string; role?: string; licenses?: string; enrichment: Record<string, string> }>();
  // OB-177: Detect enrichment fields — entity_attribute bindings that are text (not ID/name)
  const enrichmentBindings = unit.confirmedBindings.filter(b =>
    b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label'
  );
  for (const row of rows) {
    const eid = row[idBinding.sourceField];
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
  // surfaces) and report the unit as failed rather than the prior silent success-regardless.
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
  // store-level data per entity.
  if (totalInserted > 0 && commitResult.entityIdField) {
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

  return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: totalInserted, pipeline: 'reference' };
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
