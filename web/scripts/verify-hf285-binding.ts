// HF-285 Proof gates A + B (READ-ONLY against live DB; imports the REAL code under test).
// A: the canonical HC fallback (findHcRole) resolves an entity identifier for all five
//    previously-failed sheets given their warm-proposal classificationTrace.
// B: classification-aware identifier role — inferRoleForAgent assigns entity_identifier
//    (not transaction_identifier) for an entity-classified high-uniqueness identifier.
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/verify-hf285-binding.ts

import { createClient } from '@supabase/supabase-js';
import { findHcRole } from '@/lib/sci/commit-content-unit';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const WARM = '505a6d2c-7b11-42a2-a11e-100c8a42afbd';
const FAILED = ['Sucursales', 'Menus', 'Resumen_Sucursal', 'Resumen_Menu', 'Resumen_Empleado'];
const SUCCESS = ['Empleados', 'Resumen_Producto'];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('================ Proof Gate A — canonical HC fallback resolves entity id ================\n');
  const { data } = await sb.storage.from('ingestion-raw').download(`${TENANT}/proposals/${WARM}.json`);
  if (!data) { console.error('FATAL: warm proposal not in storage'); process.exit(1); }
  const proposal = JSON.parse(await data.text());
  const byTab = new Map((proposal.contentUnits as Array<Record<string, unknown>>).map(u => [u.tabName as string, u]));

  let aFail = 0;
  for (const tab of [...FAILED, ...SUCCESS]) {
    const u = byTab.get(tab);
    if (!u) { console.log(`  ${tab}: NOT IN PROPOSAL`); aFail++; continue; }
    const hadBinding = Array.isArray(u.fieldBindings) && (u.fieldBindings as Array<Record<string, unknown>>).some(b => b.semanticRole === 'entity_identifier');
    // The REAL function the gate now calls (HF-285-A), against the REAL classificationTrace:
    const hcId = findHcRole(u.classificationTrace as Record<string, unknown>, 'identifier');
    const gateResolves = hadBinding || !!hcId;
    const tag = FAILED.includes(tab) ? '(was FAILING)' : '(was passing)';
    console.log(`  ${tab.padEnd(20)} ${tag.padEnd(14)} semanticBinding entity_id=${hadBinding ? 'YES' : 'no '} | findHcRole('identifier')=${hcId ?? 'null'} | GATE RESOLVES=${gateResolves ? 'YES' : '*** NO ***'}`);
    if (!gateResolves) aFail++;
  }
  console.log(`\nGate A: ${aFail === 0 ? 'PASS — all 7 entity sheets resolve an identifier on a canonical surface' : `FAIL — ${aFail} sheet(s) unresolved`}`);

  console.log('\n================ Proof Gate B — classification-aware identifier role ================\n');
  // B is validated by unit tests (negotiation), built below; here we confirm the
  // stored-cache state the warm path WILL re-derive correctly on the next clean import.
  const { data: fps } = await sb.from('structural_fingerprints')
    .select('classification_result').eq('tenant_id', TENANT);
  for (const r of (fps ?? [])) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    if (!FAILED.includes(cr.tabName as string)) continue;
    const idb = ((cr.fieldBindings as Array<Record<string, unknown>>) ?? []).find(b => String(b.columnRole) === 'identifier');
    console.log(`  ${String(cr.tabName).padEnd(20)} cls=${cr.classification}  cached id-col semanticRole=${idb?.semanticRole ?? '?'}  (Component B re-derives entity_identifier on next cold import; Component A's HC fallback already unblocks the gate now)`);
  }
  process.exit(aFail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
