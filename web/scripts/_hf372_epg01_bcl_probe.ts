// HF-372 Phase 0 / EPG-0.1 (BCL half) — reproduce the directive's named collision:
// plan column `Componente` ≡ roster column `Nombre_Completo` at hash bf2acb98cc11, plus the
// measure collision (Nivel ≡ Meta Colocación ($) ≡ Meta Depósitos ($)). Pipeline-identical path.
// Then read the stored VLTEST2 atoms at those hashes. READ-ONLY.
//   from web/:  npx tsx scripts/_hf372_epg01_bcl_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { debandWorksheet } from '../src/lib/sci/deband-sheet';
import { computeAtomFingerprint } from '../src/lib/sci/atom-fingerprint';

const DIR = '/Users/AndrewAfrica/Desktop/ViaLuce AI/VL Demo Environment/VL DEMO/Banco Cumbre/BCL Proof Tenant Files';
const FILES = ['BCL_Plan_Comisiones_2025.xlsx', 'BCL_Plantilla_Personal.xlsx', 'BCL_Datos_Ene2026.xlsx'];

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  console.log('=== HF-372 EPG-0.1 (BCL): named collision reproduction ===\n');
  type Entry = { file: string; sheet: string; column: string; hash: string; features: string };
  const entries: Entry[] = [];
  for (const f of FILES) {
    const workbook = XLSX.read(readFileSync(`${DIR}/${f}`), { type: 'buffer', dense: true });
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const deband = debandWorksheet(XLSX, ws, sheetName);
      for (const col of deband.columns) {
        const fp = computeAtomFingerprint(col, deband.rows.map(r => (r as Record<string, unknown>)[col]));
        entries.push({ file: f, sheet: sheetName, column: col, hash: fp.hash, features: JSON.stringify(fp.features) });
      }
    }
  }

  console.log('All column-atoms (file / sheet / column → hash12):');
  for (const e of entries) console.log(`  ${e.file.replace('BCL_', '').replace('.xlsx', '').padEnd(20)} [${e.sheet}] "${e.column}" → ${e.hash.slice(0, 12)}`);

  const byHash = new Map<string, Entry[]>();
  for (const e of entries) { const l = byHash.get(e.hash) ?? []; l.push(e); byHash.set(e.hash, l); }
  const collisions = [...byHash.entries()].filter(([, l]) => new Set(l.map(e => e.column)).size > 1);
  console.log(`\nCross-column collisions: ${collisions.length}`);
  for (const [hash, list] of collisions) {
    console.log(`\nhash ${hash.slice(0, 12)}…  ← ${list.length}:`);
    for (const e of list) console.log(`    ${e.file.replace('BCL_', '').replace('.xlsx', '')} [${e.sheet}] "${e.column}"`);
    console.log(`    shared features: ${list[0].features}`);
  }

  // stored atoms for VLTEST2 at ALL of this file-set's hashes
  const { data: allTenants } = await sb.from('tenants').select('id, name');
  const tenants = (allTenants ?? []).filter((t: { id: string }) => t.id.startsWith('5b078b52'));
  const tenantId = tenants?.[0]?.id;
  console.log(`\nVLTEST2 tenant: ${tenantId} (${tenants?.[0]?.name})`);
  if (!tenantId) return;
  const { data, error } = await sb
    .from('structural_fingerprints')
    .select('fingerprint_hash, column_roles, confidence, match_count, algorithm_version, updated_at')
    .eq('tenant_id', tenantId)
    .eq('granularity', 'atom')
    .in('fingerprint_hash', [...byHash.keys()]);
  if (error) { console.log('DB ERR:', error.message); return; }
  console.log(`Stored VLTEST2 atom rows matching this file-set's hashes: ${data?.length ?? 0}`);
  for (const r of data ?? []) {
    const cr = r.column_roles ?? {};
    const cols = (byHash.get(r.fingerprint_hash) ?? []).map(e => `"${e.column}"`).join(' ≡ ');
    console.log(`\n  ${String(r.fingerprint_hash).slice(0, 12)}…  covers: ${cols}`);
    console.log(`    v${r.algorithm_version} match_count=${r.match_count} conf=${r.confidence} updated=${r.updated_at}`);
    console.log(`    role=${cr.role} @${cr.roleConfidence}  scope_role=${cr.scope_role}  nature_role=${cr.nature_role}`);
    console.log(`    identifies: ${JSON.stringify(cr.identifies)?.slice(0, 160)}`);
    console.log(`    characterization: ${JSON.stringify(cr.characterization)?.slice(0, 280)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
