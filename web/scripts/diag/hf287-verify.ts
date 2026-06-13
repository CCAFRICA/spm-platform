// HF-287 verification — runs the REAL convergeBindings for Meridian (fix target) and
// BCL (DD-7 behavior-preservation gate). Reports completeness + whether the HF-287
// recovery path fired. For BCL, "no HF-287 line + COMPLETE" ⇒ byte-identical binding
// path ⇒ calc unchanged. Run from web/: set -a && source .env.local && set +a && npx tsx scripts/diag/hf287-verify.ts
import { createClient } from '@supabase/supabase-js';
import { convergeBindings, findIncompleteBindings } from '../../src/lib/intelligence/convergence-service';

const TENANTS = [
  { name: 'Meridian (fix target)', tenant: '5035b1e8-0754-4527-b7ec-9f93f85e4c79', ruleSet: '8affd52c-452b-4cba-9b98-ae4e36cf022d' },
  { name: 'BCL (DD-7 gate)', tenant: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', ruleSet: '54fe1094-89fc-4ea9-a439-14ce44af3911' },
];

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const t of TENANTS) {
    // capture HF-287 recovery lines emitted during this tenant's convergence
    const recoveries: string[] = [];
    const orig = console.log;
    console.log = (...a: any[]) => { const s = a.join(' '); if (s.includes('[Convergence] HF-287')) recoveries.push(s); orig(...a); };

    const { data: rs } = await sb.from('rule_sets').select('components').eq('id', t.ruleSet).single();
    const result = await convergeBindings(t.tenant, t.ruleSet, sb as any);
    console.log = orig;

    const incomplete = rs ? findIncompleteBindings(rs.components, result.componentBindings) : [];
    const keys = Object.keys(result.componentBindings);
    console.log(`\n================ ${t.name} ================`);
    console.log(`  component bindings: ${keys.length}`);
    console.log(`  completeness: ${incomplete.length === 0 ? 'COMPLETE (calc proceeds)' : 'INCOMPLETE — ' + incomplete.map(i => `${i.componentKey} missing [${i.missingTokens.join(',')}]`).join('; ')}`);
    console.log(`  HF-287 recovery fired: ${recoveries.length === 0 ? 'NO (binding path byte-identical to pre-fix)' : 'YES ×' + recoveries.length}`);
    for (const r of recoveries) console.log(`     ${r.replace('[Convergence] ', '')}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
