// OB-203 Phase 6 — SURGICAL removal of the inadvertent holdout import from sandbox 24103940.
// The holdout (datos-cadena-restaurantes-mx.xlsx, session 6844224d) was analyze-ONLY — it wrote 16
// sheet fingerprints, 38 atoms, and 115 signals into the Meridian EPG sandbox, but committed NO
// rows/entities/batches. This removes ONLY those artifacts; the Meridian/CLT sandbox state is preserved.
//
// DRY-RUN by default (prints the authored SQL + exact counts for architect review). Pass `--execute`
// to apply — intended AFTER the witness runs complete, post-review.
//   npx tsx scripts/ob203-sandbox-holdout-cleanup.ts          (dry-run / review)
//   npx tsx scripts/ob203-sandbox-holdout-cleanup.ts --execute (apply)
import { createClient } from '@supabase/supabase-js';

const T = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const SESSION = '6844224d-5cb9-4e16-99fb-36f955e43bf1';
const HOLDOUT_FILE = 'datos-cadena-restaurantes-mx.xlsx';
const EXECUTE = process.argv.includes('--execute');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  console.log(`OB-203 SANDBOX HOLDOUT CLEANUP — tenant ${T}  session ${SESSION}  (${EXECUTE ? 'EXECUTE' : 'DRY-RUN'})\n`);

  // ── bound the holdout analyze window from its session signals (for atom attribution) ──
  const { data: ss } = await sb.from('classification_signals').select('created_at')
    .eq('tenant_id', T).eq('context->>importSessionId', SESSION).order('created_at');
  const times = (ss ?? []).map(r => r.created_at as string);
  if (times.length === 0) { console.log('No holdout session signals found — nothing to clean (already reset?).'); return; }
  const winStart = times[0], winEnd = times[times.length - 1];

  // ── census ──
  const { data: sheetFps } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash').eq('tenant_id', T).eq('granularity', 'sheet').eq('source_file_sample', HOLDOUT_FILE);
  const { data: atoms } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, created_at').eq('tenant_id', T).eq('granularity', 'atom').gte('created_at', winStart).lte('created_at', winEnd);
  const { count: sigCount } = await sb.from('classification_signals').select('*', { count: 'exact', head: true })
    .eq('tenant_id', T).eq('context->>importSessionId', SESSION);

  // SAFETY: confirm the holdout committed nothing (analyze-only) before we touch anything.
  const { data: cdHoldout } = await sb.from('committed_data').select('id, row_data').eq('tenant_id', T).limit(5000);
  const holdoutSheets = new Set(['Portada', 'Sucursales', 'Productos_SKU', 'Menus', 'Menu_Componentes', 'Empleados', 'Resumen_Sucursal', 'Resumen_Mensual', 'Resumen_Turno', 'Resumen_DiaSemana', 'Resumen_Categoria', 'Resumen_Producto', 'Resumen_Menu', 'Resumen_Empleado', 'Resumen_Diario', 'Ventas_Transaccional']);
  const holdoutCommitted = (cdHoldout ?? []).filter(r => holdoutSheets.has(String((r.row_data as Record<string, unknown>)?._sheetName ?? '')));

  console.log('=== CENSUS (holdout artifacts to remove) ===');
  console.log(`  sheet fingerprints (source=${HOLDOUT_FILE}): ${sheetFps?.length ?? 0}`);
  console.log(`  atoms created in holdout window [${winStart} .. ${winEnd}]: ${atoms?.length ?? 0}`);
  console.log(`  classification_signals (session ${SESSION.slice(0, 8)}): ${sigCount ?? 0}`);
  console.log(`  committed_data rows with a datos-cadena _sheetName: ${holdoutCommitted.length}  ${holdoutCommitted.length === 0 ? '(analyze-only — none to remove)' : '⚠ COMMITTED ROWS PRESENT'}`);

  console.log('\n=== AUTHORED SQL (review) ===');
  console.log(`DELETE FROM structural_fingerprints WHERE tenant_id='${T}' AND granularity='sheet' AND source_file_sample='${HOLDOUT_FILE}';  -- ${sheetFps?.length ?? 0} rows`);
  console.log(`DELETE FROM structural_fingerprints WHERE tenant_id='${T}' AND granularity='atom' AND created_at >= '${winStart}' AND created_at <= '${winEnd}';  -- ${atoms?.length ?? 0} rows (preserves the 26 pre-holdout atoms)`);
  console.log(`DELETE FROM classification_signals WHERE tenant_id='${T}' AND context->>'importSessionId' = '${SESSION}';  -- ${sigCount ?? 0} rows`);
  if (holdoutCommitted.length > 0) console.log(`-- ⚠ committed_data present for datos-cadena _sheetName — author a row/entity delete too (re-run census).`);

  if (!EXECUTE) { console.log('\nDRY-RUN — no rows modified. Re-run with --execute after the witness runs + your review.'); return; }

  console.log('\n=== EXECUTING ===');
  const r1 = await sb.from('structural_fingerprints').delete({ count: 'exact' }).eq('tenant_id', T).eq('granularity', 'sheet').eq('source_file_sample', HOLDOUT_FILE);
  console.log(`  sheet fingerprints deleted: ${r1.count ?? 0}`);
  const r2 = await sb.from('structural_fingerprints').delete({ count: 'exact' }).eq('tenant_id', T).eq('granularity', 'atom').gte('created_at', winStart).lte('created_at', winEnd);
  console.log(`  atoms deleted: ${r2.count ?? 0}`);
  const r3 = await sb.from('classification_signals').delete({ count: 'exact' }).eq('tenant_id', T).eq('context->>importSessionId', SESSION);
  console.log(`  signals deleted: ${r3.count ?? 0}`);
  // verify
  const { count: shAfter } = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('granularity', 'sheet');
  const { count: atAfter } = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('granularity', 'atom');
  console.log(`\n=== AFTER ===  sheet fps: ${shAfter} (expect 19 Meridian/CLT)   atoms: ${atAfter} (expect 26)`);
  console.log('Sandbox returned to pre-holdout state.');
})();
