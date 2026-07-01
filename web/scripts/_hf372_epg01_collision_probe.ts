// HF-372 Phase 0 / EPG-0.1 — atom-fingerprint collision evidence (READ-ONLY).
// Replicates the exact pipeline path: XLSX.read(dense) → debandWorksheet → computeAtomFingerprint
// (same calls as process-job/route.ts:145-167 and header-comprehension.ts:456), then reads the
// stored structural_fingerprints rows at the colliding hashes for the Casa Diaz tenant.
//   from web/:  npx tsx scripts/_hf372_epg01_collision_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { debandWorksheet } from '../src/lib/sci/deband-sheet';
import { computeAtomFingerprint } from '../src/lib/sci/atom-fingerprint';

const CASA_DIAZ_TENANT = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/2026 Customer Data/Casa Diaz/wetransfer_ventas-demo_2026-06-26_2117/COMISIONES % AUTORIZADOS - copia.xlsx';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  console.log('=== HF-372 EPG-0.1: atom-fingerprint collision probe (pipeline-identical path) ===\n');
  const buffer = readFileSync(FILE);
  const workbook = XLSX.read(buffer, { type: 'buffer', dense: true });

  // per-column fingerprints, pipeline-identical
  type Entry = { sheet: string; column: string; hash: string };
  const entries: Entry[] = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const deband = debandWorksheet(XLSX, ws, sheetName);
    for (const col of deband.columns) {
      const fp = computeAtomFingerprint(col, deband.rows.map(r => (r as Record<string, unknown>)[col]));
      entries.push({ sheet: sheetName, column: col, hash: fp.hash });
    }
  }

  // group by hash → find collisions across DISTINCT column names
  const byHash = new Map<string, Entry[]>();
  for (const e of entries) { const l = byHash.get(e.hash) ?? []; l.push(e); byHash.set(e.hash, l); }
  const collisions = [...byHash.entries()].filter(([, l]) => new Set(l.map(e => e.column)).size > 1);

  console.log(`Workbook: ${workbook.SheetNames.length} sheets, ${entries.length} column-atoms, ${byHash.size} distinct hashes`);
  console.log(`Hashes shared by DISTINCT column names: ${collisions.length}\n`);
  for (const [hash, list] of collisions) {
    console.log(`hash ${hash.slice(0, 12)}…  ← ${list.length} columns:`);
    for (const e of list) console.log(`    [${e.sheet}] "${e.column}"`);
  }

  // the directive's named collision: Componente ≡ Nombre_Completo at bf2acb98cc11
  const named = entries.filter(e => /componente|nombre/i.test(e.column));
  console.log('\nDirective-named columns:');
  for (const e of named) console.log(`  [${e.sheet}] "${e.column}" → ${e.hash.slice(0, 12)}…`);

  // stored atoms at the colliding hashes (Casa Diaz tenant)
  const hashes = collisions.map(([h]) => h);
  if (hashes.length) {
    const { data, error } = await sb
      .from('structural_fingerprints')
      .select('fingerprint_hash, column_roles, confidence, match_count, algorithm_version, updated_at')
      .eq('tenant_id', CASA_DIAZ_TENANT)
      .eq('granularity', 'atom')
      .in('fingerprint_hash', hashes);
    if (error) { console.log('\nDB read ERR:', error.message); return; }
    console.log(`\nStored structural_fingerprints rows at colliding hashes (tenant ${CASA_DIAZ_TENANT.slice(0, 8)}…): ${data?.length ?? 0}`);
    for (const r of data ?? []) {
      const cr = r.column_roles ?? {};
      console.log(`\n  hash ${String(r.fingerprint_hash).slice(0, 12)}…  v${r.algorithm_version}  match_count=${r.match_count}  conf=${r.confidence}  updated=${r.updated_at}`);
      console.log(`    role=${cr.role} @${cr.roleConfidence}  scope_role=${cr.scope_role}  nature_role=${cr.nature_role}`);
      console.log(`    identifies: ${JSON.stringify(cr.identifies)?.slice(0, 160)}`);
      console.log(`    characterization: ${JSON.stringify(cr.characterization)?.slice(0, 240)}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
