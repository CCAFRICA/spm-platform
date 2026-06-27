import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { selectEntityIdFieldByOverlap, findHcEntityIdCandidates } from '../src/lib/sci/commit-content-unit';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
(async () => {
  // MIR entity domain (the carried reality)
  const { data: ents } = await sb.from('entities').select('external_id').eq('tenant_id', MIR).limit(20000);
  const domain = new Set((ents ?? []).map(e => String(e.external_id).trim()).filter(Boolean));
  // MIR Ventas transaction rows
  const { data: rows } = await sb.from('committed_data').select('row_data').eq('tenant_id', MIR).eq('data_type', 'transaction').limit(5000);
  const flat = (rows ?? []).map(r => r.row_data as Record<string, unknown>);
  console.log(`PG-3: MIR domain=${domain.size} entities, ${flat.length} transaction rows.\n`);

  // The two entity-scope identifier columns that compete on a MIR Ventas sheet
  // (DNI_Vendedor = the seller, Almacen = the branch — Almacen out-repeats DNI).
  const candidates = ['Almacen', 'DNI_Vendedor']; // emission order Almacen-first → old first-match would pick Almacen
  console.log(`Candidates (emission order): [${candidates.join(', ')}]`);
  console.log(`  → OLD first-match (positional) would pick: "${candidates[0]}" (WRONG — the branch)`);
  const sel = selectEntityIdFieldByOverlap(candidates, flat, domain);
  console.log(`  → HF-351 value-domain overlap picks: "${sel.chosen}" (${sel.reason})`);
  console.log(`\n${sel.chosen === 'DNI_Vendedor' ? '✓ PG-3 PASS — entity_id_field = DNI_Vendedor (the seller), not Almacen (the branch)' : '✗ PG-3 FAIL — picked ' + sel.chosen}`);

  // cold-start (empty domain) — proves the fallback also picks the finer-grained id, not the branch
  const cold = selectEntityIdFieldByOverlap(candidates, flat, new Set());
  console.log(`Cold-start (empty domain) → "${cold.chosen}" (${cold.reason}) ${cold.chosen === 'DNI_Vendedor' ? '✓' : '✗'}`);
})().catch(e => console.log('threw:', e instanceof Error ? e.message : String(e)));
