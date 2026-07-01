// HF-372 Phase 0 / EPG-0.2 — LIVE comprehension + classification on current main.
// Replicates process-job/route.ts's classify sequence call-for-call (deband → lookupFingerprint →
// generateContentProfileStats → runDecomposedComprehension (REAL LLM) → generateContentProfilePatterns →
// createIngestionState + promotedPatterns + priors + lexical priors + entity overlap →
// resolveClassification → buildProposalFromState), then prints per-column scope_role/nature_role and
// the sheet verdicts. Writes atoms to the proof tenants' flywheel exactly as a real import would.
//   from web/:  npx tsx scripts/_hf372_epg02_live_classify.ts [bcl|casa]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { debandWorksheet } from '../src/lib/sci/deband-sheet';
import { generateContentProfileStats, generateContentProfilePatterns } from '../src/lib/sci/content-profile';
import { runDecomposedComprehension } from '../src/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '../src/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '../src/lib/sci/resolver';
import { computeStructuralFingerprint, lookupPriorSignals, lookupLexicalPrior } from '../src/lib/sci/classification-signal-service';
import { loadPromotedPatterns } from '../src/lib/sci/promoted-patterns';
import { queryTenantContext, computeEntityIdOverlap } from '../src/lib/sci/tenant-context';
import { lookupFingerprint, type FlywheelLookupResult } from '../src/lib/sci/fingerprint-flywheel';
import type { ContentProfile } from '../src/lib/sci/sci-types';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SETS: Record<string, { tenant: string; fileName: string; path: string; sheets?: string[] }> = {
  bcl: {
    tenant: '5b078b52-55c9-4612-8f86-96038c198bfe',
    fileName: 'BCL_Plan_Comisiones_2025.xlsx',
    path: '/Users/AndrewAfrica/Desktop/ViaLuce AI/VL Demo Environment/VL DEMO/Banco Cumbre/BCL Proof Tenant Files/BCL_Plan_Comisiones_2025.xlsx',
  },
  casa: {
    tenant: '2d9979ba-5032-48a7-bccf-1928f3e6dadf',
    fileName: 'COMISIONES % AUTORIZADOS - copia.xlsx',
    path: '/Users/AndrewAfrica/Desktop/ViaLuce AI/2026 Customer Data/Casa Diaz/wetransfer_ventas-demo_2026-06-26_2117/COMISIONES % AUTORIZADOS - copia.xlsx',
    sheets: ['LOCALES REFAC', 'FORANEAS REFAC'], // two structurally distinct sheets per EPG-0.2(b)
  },
};

async function main() {
  const which = process.argv[2] ?? 'bcl';
  const cfg = SETS[which];
  if (!cfg) throw new Error(`unknown set ${which}`);
  const tenantId = cfg.tenant;
  console.log(`=== HF-372 EPG-0.2 LIVE classify: ${cfg.fileName} (tenant ${tenantId.slice(0, 8)}…) ===\n`);

  const workbook = XLSX.read(readFileSync(cfg.path), { type: 'buffer', dense: true });
  const sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; totalRowCount: number }> = [];
  for (const sheetName of workbook.SheetNames) {
    if (cfg.sheets && !cfg.sheets.includes(sheetName)) continue;
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const deband = debandWorksheet(XLSX, ws, sheetName);
    sheets.push({ sheetName, columns: deband.columns, rows: deband.rows as Record<string, unknown>[], totalRowCount: deband.rows.length });
  }

  // flywheel lookup (tier per sheet) — route lines 205-217
  const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
  for (const sheet of sheets) {
    const result = await lookupFingerprint(tenantId, sheet.columns, sheet.rows, URL_, KEY);
    sheetFlywheelResults.set(sheet.sheetName, result);
    console.log(`sheet=${sheet.sheetName} fingerprint=${result.fingerprintHash.substring(0, 12)} tier=${result.tier} match=${result.match} confidence=${result.confidence}`);
  }
  const sheetMatchTier1 = (n: string) => { const r = sheetFlywheelResults.get(n); return r?.tier === 1 && r.match; };

  // profiles — route lines 240-250
  const profileMap = new Map<string, ContentProfile>();
  const sampleBySheet = new Map<string, Record<string, unknown>[]>();
  const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const sampleRows = s.rows.slice(0, 100);
    profileMap.set(s.sheetName, generateContentProfileStats(s.sheetName, i, cfg.fileName, s.columns, sampleRows, s.totalRowCount));
    sampleBySheet.set(s.sheetName, sampleRows);
    fileSheets.push({ sourceFile: cfg.fileName, sheetName: s.sheetName });
  }

  // decomposed comprehension (REAL LLM) — route lines 267-293 (HF-372: all sheets, warm atoms claim)
  const t0 = Date.now();
  const sheetsNeedingHC = sheets;
  void sheetMatchTier1;
  if (sheetsNeedingHC.length > 0) {
    const dc = await runDecomposedComprehension(
      profileMap,
      sheetsNeedingHC.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })),
      tenantId, URL_, KEY,
    );
    for (const [sheetName, failureClass] of dc.perSheetFailure.entries()) console.log(`FAILED interpretation: ${sheetName} → ${failureClass}`);
    for (const [sheetName, prov] of dc.provenance.entries()) console.log(`provenance: ${sheetName} recognizedFraction=${prov.recognizedFraction} novelCount=${prov.novelCount} llmCalled=${prov.llmCalled}`);
  } else {
    console.log('All sheets Tier-1 matched — HC SKIPPED');
  }
  console.log(`comprehension: ${Date.now() - t0}ms\n`);

  // per-column recognition — what the classifier reads
  for (const [sheetName, profile] of profileMap.entries()) {
    console.log(`── ${sheetName}: per-column recognition ──`);
    const interpMap = profile.headerComprehension?.interpretations;
    const interps = interpMap ? Array.from(interpMap.values()) : [];
    for (const it of interps as unknown as Array<Record<string, unknown>>) {
      console.log(`  "${it.columnName}"  scope_role=${it.scope_role}  nature_role=${it.nature_role}  src=${it.decisionSource ?? ''}`);
      console.log(`      identifies: ${String(it.identifies ?? '').slice(0, 110)}`);
    }
    console.log('');
  }

  // patterns — route lines 297-301
  for (const [sheetName, profile] of profileMap.entries()) {
    generateContentProfilePatterns(profile, profile.headerComprehension?.interpretations, sampleBySheet.get(sheetName) ?? []);
  }

  // state + priors + overlap + classification — route lines 306-366
  const promotedPatterns = await loadPromotedPatterns(URL_, KEY);
  const state = createIngestionState(tenantId, cfg.fileName, profileMap);
  state.promotedPatterns = promotedPatterns;
  for (const [, profile] of profileMap.entries()) {
    const fp = computeStructuralFingerprint(profile);
    const priors = await lookupPriorSignals(tenantId, fp, URL_, KEY, '');
    const lexicalPriors = await lookupLexicalPrior(tenantId, profile.fields.map(f => f.fieldName), URL_, KEY);
    const allPriors = [...priors, ...lexicalPriors];
    if (allPriors.length > 0) state.priorSignals.set(profile.contentUnitId, allPriors);
  }
  try {
    const tenantCtx = await queryTenantContext(tenantId, URL_, KEY);
    if (tenantCtx.existingEntityExternalIds.size > 0) {
      const overlapMap = new Map<string, ReturnType<typeof computeEntityIdOverlap> & object>();
      for (const sheet of sheets) {
        const profile = profileMap.get(sheet.sheetName);
        if (profile) {
          const overlap = computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds);
          if (overlap) overlapMap.set(profile.contentUnitId, overlap);
        }
      }
      if (overlapMap.size > 0) state.entityIdOverlaps = overlapMap as never;
    }
  } catch { /* non-blocking, as in route */ }

  resolveClassification(state);
  const contentUnits = buildProposalFromState(state, fileSheets)
    .filter(cu => !(cu.contentUnitId.includes('::split') && cu.classification !== 'plan'));

  console.log('── SHEET VERDICTS ──');
  for (const cu of contentUnits) {
    console.log(`  [${cu.tabName}] → ${cu.classification} @${cu.confidence}  (unit ${cu.contentUnitId.slice(0, 40)})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
