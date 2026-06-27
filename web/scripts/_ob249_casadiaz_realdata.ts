// OB-249 — REAL-DATA secondary proof (READ-ONLY, no writes).
//
// Reads the ACTUAL committed_data.row_data.Nombre values for Casa Diaz (the one live tenant where the
// Gate-0 probe found genuine variant representations — trailing/leading whitespace padding of the same
// person's name) and runs the in-memory Normalizer (identify → propose with NO LLM needed for pure
// structural noise → construct). Demonstrates the stage collapses real production variance and retains
// the original. Casa Diaz's committed_data is NOT modified (this script only SELECTs).
//
// Run:  cd web && npx tsx scripts/_ob249_casadiaz_realdata.ts

import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { createNormalizer } from '@/lib/remediation/agents/normalizer';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

(async () => {
  const { data } = await sb.from('committed_data')
    .select('row_data').eq('tenant_id', CASA_DIAZ).limit(2000);
  const rows = (data ?? [])
    .map((r) => ({ Nombre: (r.row_data as Record<string, unknown>).Nombre }))
    .filter((r) => typeof r.Nombre === 'string');

  console.log(`OB-249 REAL-DATA PROOF — Casa Diaz (READ-ONLY)`);
  console.log(`read ${rows.length} committed rows with a Nombre value`);

  // structural-only run: whitespace variants need no LLM. (createNormalizer() default expresser is
  // the live LLM, but the residue here collapses structurally so the LLM is not consulted.)
  const agent = createNormalizer();
  const input = { tenantId: CASA_DIAZ, rows, columns: ['Nombre'], allowedColumns: ['Nombre'] };

  const targets = agent.identify(input);
  console.log(`identify → candidate columns: ${JSON.stringify(targets)}`);

  const proposal = await agent.propose(targets, input);
  const nombre = proposal?.columns.find((c) => c.column === 'Nombre');
  const structuralGroups = (nombre?.groups ?? []).filter((g) => g.variants.length > 1);
  console.log(`propose → ${structuralGroups.length} variant group(s) found (basis: ${Array.from(new Set((nombre?.groups ?? []).map((g) => g.basis))).join(',') || 'none'})`);

  if (proposal) {
    const { changes } = agent.construct(proposal, input);
    console.log(`construct → ${changes.length} cell(s) would be canonicalized (Casa Diaz committed_data NOT modified)`);
    // show the distinct collapses
    const seen = new Set<string>();
    for (const ch of changes) {
      const k = `${ch.original}→${ch.canonical}`;
      if (seen.has(k)) continue; seen.add(k);
      console.log(`   "${ch.original}"  →  "${ch.canonical}"   [${ch.basis}]`);
    }
    // assert every canonical is observed (no fabrication)
    const observed = new Set(rows.map((r) => r.Nombre));
    const allObserved = changes.every((c) => observed.has(c.canonical as string));
    console.log(`every canonical is an OBSERVED value (no fabrication, I3): ${allObserved}`);
  } else {
    console.log('no variants found in this slice of Casa Diaz data');
  }
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
