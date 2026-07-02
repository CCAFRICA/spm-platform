/** HF-373: re-run the idempotent post-commit construction (entity resolution +
 * entity_id back-link) for VLTEST2 — the step the D9 pre-data finalize ran too
 * early. Same call finalize-import makes (route.ts:78). */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { executePostCommitConstruction } from '../src/lib/sci/post-commit-construction';
import { createMissingAssignments } from '../src/lib/sci/assignment-creation';

const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  await executePostCommitConstruction({ supabase: sb as never, tenantId: T, source: 'sci-bulk' });
  console.log('post-commit construction done');
  const a = await createMissingAssignments(sb as never, T);
  console.log(`assignments: created=${a.newlyCreatedPairs} ruleSets=${a.ruleSetCount} entities=${a.entityCount}`);
  for (const dt of ['transaction', 'entity', 'reference']) {
    const { count: total } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('data_type', dt);
    const { count: linked } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', T).eq('data_type', dt).not('entity_id', 'is', null);
    console.log(`${dt}: total=${total} linked=${linked}`);
  }
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
