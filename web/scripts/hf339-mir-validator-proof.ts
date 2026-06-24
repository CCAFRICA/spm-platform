/**
 * HF-339 Proof M (CC-ownable slice): run the NEW (post-fix) validator over MIR's
 * REAL stored plan structures and show ZERO scale_annotation warnings, while
 * quantifying how many warnings the OLD set-membership check would have fired
 * (every bare compare-constant). No reimport, no auth-gated calc route — reads
 * the stored calculationIntent prime_dags directly (service-role).
 *
 * Run: cd web && npx tsx scripts/hf339-mir-validator-proof.ts
 */
import { createClient } from '@supabase/supabase-js';
import { validatePrimeTree } from '../src/lib/calculation/prime-grammar';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

// OLD check: a constant whose parent is a compare and which lacks meta would have
// fired scale_annotation. Walk the tree replicating the retired predicate.
function countOldScaleWarnings(node: unknown, parentPrime: string | null): { warned: number; compareConstants: number; bare: number } {
  let warned = 0, compareConstants = 0, bare = 0;
  const walk = (n: unknown, parent: string | null) => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    const prime = o.prime as string | undefined;
    if (prime === 'constant' && parent === 'compare') {
      compareConstants++;
      const hasMeta = o.meta !== undefined && o.meta !== null;
      if (!hasMeta) { bare++; warned++; } // OLD check warned here
    }
    for (const k of ['then', 'else', 'condition', 'downstream']) if (o[k]) walk(o[k], prime ?? null);
    if (Array.isArray(o.inputs)) for (const c of o.inputs) walk(c, prime ?? null);
  };
  walk(node, parentPrime);
  return { warned, compareConstants, bare };
}

async function main() {
  const { data: ruleSets, error } = await supabase
    .from('rule_sets').select('id, name, components').eq('tenant_id', MIR);
  if (error) { console.error('DB error:', error.message); process.exit(1); }
  if (!ruleSets || ruleSets.length === 0) {
    console.log('MIR has ZERO rule_sets (tenant is empty). Live reimport is architect-gated (clean-slate SQL + the 5 plan PDFs).');
    console.log('The mechanism is proven deterministically by hf339-validator-premise.test.ts; this script will re-run after the architect clean-slate+reimport.');
    process.exit(0);
  }
  let totalNewScale = 0, totalOldWarned = 0, totalCompareConst = 0, totalBare = 0, totalComponents = 0, totalCriticals = 0;
  console.log(`MIR tenant ${MIR}: ${ruleSets.length} rule_sets\n`);
  for (const rs of ruleSets) {
    const comp = rs.components as Record<string, unknown> | null;
    const variants = (comp as { variants?: unknown[] })?.variants ?? (comp ? [comp] : []);
    let planNewScale = 0, planOldWarned = 0, planCompareConst = 0, planComponents = 0, planCriticals = 0;
    for (const v of variants as Record<string, unknown>[]) {
      const components = (v.components as Record<string, unknown>[]) || [];
      for (const c of components) {
        const intent = c.calculationIntent;
        if (!intent) continue;
        planComponents++;
        const result = validatePrimeTree(intent);
        const scaleViolations = result.violations.filter(x => x.check === 'scale_annotation');
        const criticals = result.violations.filter(x => x.severity === 'critical');
        planNewScale += scaleViolations.length;
        planCriticals += criticals.length;
        const old = countOldScaleWarnings(intent, null);
        planOldWarned += old.warned;
        planCompareConst += old.compareConstants;
        totalBare += old.bare;
      }
    }
    totalNewScale += planNewScale; totalOldWarned += planOldWarned; totalCompareConst += planCompareConst;
    totalComponents += planComponents; totalCriticals += planCriticals;
    console.log(`  [${rs.name}] components=${planComponents} | compare-constants=${planCompareConst} | OLD scale_annotation warnings=${planOldWarned} | NEW scale_annotation warnings=${planNewScale} | criticals=${planCriticals}`);
  }
  console.log('\n=== TOTALS (MIR, real stored plans) ===');
  console.log(`components evaluated:        ${totalComponents}`);
  console.log(`compare-constants:           ${totalCompareConst}`);
  console.log(`bare compare-constants:      ${totalBare}`);
  console.log(`OLD scale_annotation warns:  ${totalOldWarned}   <- the false-positive registry fired on every bare value`);
  console.log(`NEW scale_annotation warns:  ${totalNewScale}   <- post-HF-339`);
  console.log(`critical violations (NEW):   ${totalCriticals}`);
  console.log(totalNewScale === 0 ? '\nPROOF M (validator slice): ZERO scale_annotation warnings on MIR real plans.' : '\nNON-ZERO scale warnings — investigate (malformed carried natures).');
}
main().catch(e => { console.error(e); process.exit(1); });
