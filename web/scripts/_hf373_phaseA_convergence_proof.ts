/**
 * HF-373 Phase A EPG-A1 proof — live convergeBindings on VLTEST2.
 * Read-mostly: convergeBindings does not persist input_bindings (run route does);
 * it emits observability signals only.
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { convergeBindings } from '../src/lib/intelligence/convergence-service';

const TENANT = '5b078b52-55c9-4612-8f86-96038c198bfe';
const RULE_SET = '91f822b1-186e-419b-9627-64d801fe323f';

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const t0 = Date.now();
  const result = await convergeBindings(TENANT, RULE_SET, sb as never);
  console.log(`\n===== EPG-A1 RESULT (${((Date.now() - t0) / 1000).toFixed(1)}s) =====`);
  console.log(`derivations: ${result.derivations.length}`);
  console.log(`gaps: ${result.gaps.length}`);
  const bindingKeys = Object.keys(result.componentBindings);
  console.log(`component bindings: ${bindingKeys.length}`);
  for (const k of bindingKeys.sort()) {
    const roles = result.componentBindings[k];
    for (const [role, b] of Object.entries(roles)) {
      const bb = b as { column?: string; match_pass?: unknown; confidence?: number; component_ref?: number; scale_factor?: number; reduction?: string };
      console.log(`  ${k}.${role} -> column='${bb.column}' pass=${bb.match_pass} conf=${bb.confidence}${bb.component_ref !== undefined ? ` component_ref=${bb.component_ref}` : ''}${bb.scale_factor !== undefined ? ` scale=${bb.scale_factor}` : ''}${bb.reduction ? ` reduction=${bb.reduction}` : ''}`);
    }
  }
  for (const g of result.gaps) console.log(`  GAP: [${g.componentIndex}] ${g.component}: ${g.reason}`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
