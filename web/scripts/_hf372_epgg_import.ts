// HF-372 Phase G — the library-driven END-TO-END import runner (the same libs the routes call,
// in the same order: upload → de-band/stream parse → flywheel → decomposed comprehension →
// classification → proposal → plan interpretation (real rule_sets) + commitContentUnit (real
// committed_data via CSV+FDW RPC) → finalize claim → post-commit construction → assignments →
// complete). The browser-route arc itself is the architect's SR-44 action; this runner exercises
// the identical library path with real LLM + real persistence, and prints EPG evidence.
//   from web/:  SCI_HC_BATCH_SIZE=12 npx tsx scripts/_hf372_epgg_import.ts <tenant> <localFilePath> [--sheets a,b]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { basename } from 'path';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { debandWorksheet } from '../src/lib/sci/deband-sheet';
import { isLargeByBytes, streamSheetMeta, listSheetNames } from '../src/lib/sci/sheet-stream';
import { CHUNK_ROW_SIZE } from '../src/lib/sci/sheet-window';
import { generateContentProfileStats, generateContentProfilePatterns } from '../src/lib/sci/content-profile';
import { runDecomposedComprehension } from '../src/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '../src/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '../src/lib/sci/resolver';
import { computeStructuralFingerprint, lookupPriorSignals, lookupLexicalPrior } from '../src/lib/sci/classification-signal-service';
import { loadPromotedPatterns } from '../src/lib/sci/promoted-patterns';
import { queryTenantContext, computeEntityIdOverlap } from '../src/lib/sci/tenant-context';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '../src/lib/sci/fingerprint-flywheel';
import { computeFingerprintHashSync } from '../src/lib/sci/structural-fingerprint';
import { commitContentUnit } from '../src/lib/sci/commit-content-unit';
import { executeBatchedPlanInterpretation } from '../src/lib/sci/plan-interpretation';
import { computeFileHashSha256 } from '../src/lib/sci/file-content-hash';
import { claimFinalize, completeFinalize } from '../src/lib/sci/finalize-coalesce';
import { executePostCommitConstruction } from '../src/lib/sci/post-commit-construction';
import { createMissingAssignments } from '../src/lib/sci/assignment-creation';
import type { ContentProfile, ContentUnitExecution, AgentType, SemanticBinding } from '../src/lib/sci/sci-types';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL_, KEY, { auth: { persistSession: false } });

export interface RunResult {
  fileName: string;
  verdicts: Array<{ tab: string; classification: string; confidence: number; split: boolean }>;
  committed: Array<{ tab: string; classification: string; rows: number; ok: boolean; error?: string }>;
  planResults: Array<{ unit: string; success: boolean; error?: string }>;
  wallMs: number;
}

export async function runImport(tenantId: string, filePath: string, onlySheets?: string[]): Promise<RunResult> {
  const t0 = Date.now();
  const fileName = basename(filePath);
  const buffer = readFileSync(filePath);
  const fileHash = computeFileHashSha256(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);

  // 0. upload the raw file (the plan interpreter + streamed commit read from storage)
  const storagePath = `${tenantId}/hf372-g/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const up = await sb.storage.from('ingestion-raw').upload(storagePath, buffer, { upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  // 1. parse (size-gated, pipeline-identical)
  const sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; totalRowCount: number }> = [];
  if (isLargeByBytes(buffer.byteLength)) {
    const names = await listSheetNames(buffer);
    for (const sheetName of names.length ? names : [undefined]) {
      const meta = await streamSheetMeta(buffer, { sampleRows: CHUNK_ROW_SIZE, targetSheet: sheetName });
      sheets.push({ sheetName: meta.sheetName, columns: meta.headers, rows: meta.sample as Record<string, unknown>[], totalRowCount: meta.totalRows });
    }
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer', dense: true });
    for (const sheetName of workbook.SheetNames) {
      if (onlySheets && !onlySheets.includes(sheetName)) continue;
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const deband = debandWorksheet(XLSX, ws, sheetName);
      if (deband.rows.length === 0) continue;
      sheets.push({ sheetName, columns: deband.columns, rows: deband.rows as Record<string, unknown>[], totalRowCount: deband.rows.length });
    }
  }

  // 2. flywheel + profiles + comprehension (ALL sheets — warm atoms claim) + classification
  const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
  for (const sheet of sheets) {
    sheetFlywheelResults.set(sheet.sheetName, await lookupFingerprint(tenantId, sheet.columns, sheet.rows, URL_, KEY));
  }
  const profileMap = new Map<string, ContentProfile>();
  const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];
  const sampleBySheet = new Map<string, Record<string, unknown>[]>();
  sheets.forEach((s, i) => {
    const sample = s.rows.slice(0, 100);
    profileMap.set(s.sheetName, generateContentProfileStats(s.sheetName, i, fileName, s.columns, sample, s.totalRowCount));
    sampleBySheet.set(s.sheetName, sample);
    fileSheets.push({ sourceFile: fileName, sheetName: s.sheetName });
  });
  await runDecomposedComprehension(
    profileMap,
    sheets.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })),
    tenantId, URL_, KEY,
  );
  for (const [sheetName, profile] of profileMap.entries()) {
    generateContentProfilePatterns(profile, profile.headerComprehension?.interpretations, sampleBySheet.get(sheetName) ?? []);
  }
  const state = createIngestionState(tenantId, fileName, profileMap);
  state.promotedPatterns = await loadPromotedPatterns(URL_, KEY);
  for (const [, profile] of profileMap.entries()) {
    const fp = computeStructuralFingerprint(profile);
    const priors = await lookupPriorSignals(tenantId, fp, URL_, KEY, '');
    const lex = await lookupLexicalPrior(tenantId, profile.fields.map(f => f.fieldName), URL_, KEY);
    if (priors.length + lex.length > 0) state.priorSignals.set(profile.contentUnitId, [...priors, ...lex]);
  }
  try {
    const ctx = await queryTenantContext(tenantId, URL_, KEY);
    if (ctx.existingEntityExternalIds.size > 0) {
      const overlapMap = new Map();
      for (const sheet of sheets) {
        const profile = profileMap.get(sheet.sheetName);
        if (profile) { const o = computeEntityIdOverlap(profile, sheet.rows, ctx.existingEntityExternalIds); if (o) overlapMap.set(profile.contentUnitId, o); }
      }
      if (overlapMap.size > 0) state.entityIdOverlaps = overlapMap as never;
    }
  } catch { /* non-blocking, as in the route */ }
  resolveClassification(state);
  const contentUnits = buildProposalFromState(state, fileSheets)
    .filter(cu => !(cu.contentUnitId.includes('::split') && cu.classification !== 'plan'));

  const verdicts = contentUnits.map(cu => ({
    tab: cu.tabName, classification: String(cu.classification), confidence: cu.confidence,
    split: cu.contentUnitId.includes('::split'),
  }));

  // 3. flywheel write (per-sheet, mirroring process-job/route.ts:432-467)
  for (const cu of contentUnits) {
    if (cu.contentUnitId.includes('::split')) continue;
    if (!cu.fieldBindings || cu.fieldBindings.length === 0) continue;
    const sheet = sheets.find(s => s.sheetName === cu.tabName);
    if (!sheet) continue;
    const unitHash = computeFingerprintHashSync(sheet.columns, sheet.rows);
    const columnRoles: Record<string, string> = {};
    for (const b of cu.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
    await writeFingerprint(
      tenantId, unitHash,
      { classification: cu.classification, confidence: cu.confidence, fieldBindings: cu.fieldBindings, tabName: cu.tabName },
      columnRoles, fileName, URL_, KEY,
    ).catch(() => {});
  }

  // 4. commit: plan units → real plan interpretation; data units → real commitContentUnit
  const proposalId = randomUUID();
  const { data: profs } = await sb.from('profiles').select('id').limit(1);
  const userId = profs?.[0]?.id as string;

  const planUnits = contentUnits.filter(cu => cu.classification === 'plan');
  const planResults: RunResult['planResults'] = [];
  if (planUnits.length > 0) {
    const pu = planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      confirmedClassification: 'plan',
      confirmedBindings: (u.fieldBindings ?? []) as SemanticBinding[],
      rawData: [],
      tabName: u.tabName,
    })) as unknown as ContentUnitExecution[];
    const rs = await executeBatchedPlanInterpretation(sb, tenantId, pu, userId, storagePath);
    for (const r of rs) planResults.push({ unit: r.contentUnitId, success: r.success, error: r.error });
  }

  const committed: RunResult['committed'] = [];
  for (const cu of contentUnits) {
    const cls = cu.classification as Exclude<AgentType, 'plan'>;
    if (cu.classification === 'plan') continue;
    const sheet = sheets.find(s => s.sheetName === cu.tabName);
    if (!sheet) continue;
    try {
      const res = await commitContentUnit(sb, {
        unit: {
          contentUnitId: cu.contentUnitId,
          confirmedBindings: (cu.fieldBindings ?? []) as SemanticBinding[],
          classificationTrace: cu.classificationTrace as Record<string, unknown> | undefined,
        },
        rows: sheet.rows,
        classification: cls,
        tenantId, proposalId,
        tabName: cu.tabName,
        fileName,
        source: 'sci-bulk',
        fileHashSha256: fileHash,
      });
      committed.push({ tab: cu.tabName, classification: cls, rows: res.totalInserted, ok: true });
    } catch (e) {
      committed.push({ tab: cu.tabName, classification: cls, rows: 0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 5. finalize — ONE pass behind the claim (the same steps finalize-import runs)
  const claim = await claimFinalize(sb, tenantId, proposalId);
  console.log(`claim: ${claim.reason}`);
  if (claim.granted) {
    await executePostCommitConstruction({ supabase: sb, tenantId, source: 'sci-bulk' });
    await createMissingAssignments(sb, tenantId);
    await completeFinalize(sb, tenantId, proposalId, true);
  }

  return { fileName, verdicts, committed, planResults, wallMs: Date.now() - t0 };
}

async function main() {
  const [tenantArg, filePath, ...rest] = process.argv.slice(2);
  const tenants: Record<string, string> = { vltest2: '5b078b52-55c9-4612-8f86-96038c198bfe', casa: '2d9979ba-5032-48a7-bccf-1928f3e6dadf' };
  const tenantId = tenants[tenantArg] ?? tenantArg;
  const sheetsFlag = rest.indexOf('--sheets');
  const onlySheets = sheetsFlag >= 0 ? rest[sheetsFlag + 1].split(',') : undefined;
  const r = await runImport(tenantId, filePath, onlySheets);
  console.log(`\n=== ${r.fileName} (${(r.wallMs / 1000).toFixed(1)}s) ===`);
  for (const v of r.verdicts) console.log(`  verdict: [${v.tab}] → ${v.classification}@${v.confidence}${v.split ? ' (::split)' : ''}`);
  for (const c of r.committed) console.log(`  commit:  [${c.tab}] ${c.classification} rows=${c.rows} ok=${c.ok} ${c.error ?? ''}`);
  for (const p of r.planResults) console.log(`  plan:    ${p.unit} success=${p.success} ${String(p.error ?? '').slice(0, 160)}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
