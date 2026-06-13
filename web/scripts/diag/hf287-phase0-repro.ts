// HF-287 Phase 0 — reproduce Meridian convergence on 8affd52c and capture the real
// per-variant HF-222 score distribution (the one fact not in the DB, per DIAG-068).
// Runs the REAL convergeBindings (reads DB; emits the same provenance signals a calc does).
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/diag/hf287-phase0-repro.ts
import { createClient } from '@supabase/supabase-js';
import { convergeBindings, findIncompleteBindings } from '../../src/lib/intelligence/convergence-service';

const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULESET = '8affd52c-452b-4cba-9b98-ae4e36cf022d';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: rs } = await sb.from('rule_sets').select('components').eq('id', RULESET).single();

  console.log('=== HF-287 Phase 0: running convergeBindings on Meridian 8affd52c ===\n');
  const result = await convergeBindings(TENANT, RULESET, sb as any);

  console.log('\n=== RESULT: componentBindings ===');
  const cb = result.componentBindings;
  const keys = Object.keys(cb).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  for (const k of keys) {
    const roles = Object.entries(cb[k]).map(([role, e]: any) => `${role}→${e?.column ?? '∅'}(mp=${e?.match_pass})`).join('  ');
    console.log(`  ${k}: ${roles}`);
  }
  console.log(`  total component bindings: ${keys.length}`);

  console.log('\n=== HF-281 completeness check (findIncompleteBindings) ===');
  const incomplete = findIncompleteBindings(rs!.components, cb);
  if (incomplete.length === 0) console.log('  COMPLETE — all components map their required tokens (calc would proceed).');
  for (const ib of incomplete) {
    console.log(`  INCOMPLETE ${ib.componentKey} "${ib.componentName}" variant=${ib.variantId} missing=[${ib.missingTokens.join(', ')}]`);
  }
  console.log(`\n  gaps: ${result.gaps.length}  derivations: ${result.derivations.length}`);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
