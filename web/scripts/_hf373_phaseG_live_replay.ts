/** HF-373 EPG-G1 — the REAL assignSemanticRole over the LIVE recognition trace of the
 * WORST blocked Datos job (Dic2025: 4 unknown roles pre-fix). Read-only. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { assignSemanticRole } from '../src/lib/sci/agents';
import type { FieldProfile } from '../src/lib/sci/sci-types';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: job } = await sb.from('processing_jobs').select('id, file_name, proposal').eq('id', 'e5c5fa9a-0000-0000-0000-000000000000').maybeSingle();
  // job ids from EPG-0.8 are truncated; find by file name instead
  const { data: jobs } = await sb.from('processing_jobs').select('id, file_name, proposal, created_at').eq('tenant_id', '5b078b52-55c9-4612-8f86-96038c198bfe').like('file_name', '%BCL_Datos_Dic2025%').order('created_at', { ascending: false }).limit(1);
  const j = jobs?.[0];
  if (!j) { console.log('job not found'); return; }
  console.log(`job ${j.id} ${j.file_name}`);
  const unit = ((j.proposal as { contentUnits?: Array<Record<string, unknown>> })?.contentUnits ?? [])[0] as {
    fieldBindings?: Array<{ sourceField: string; platformType?: string; semanticRole: string; confidence: number }>;
    classificationTrace?: { headerComprehension?: { interpretations?: Record<string, { nature_role?: string; scope_role?: string; data_nature?: string; confidence?: number }> } };
  };
  const interps = unit.classificationTrace?.headerComprehension?.interpretations ?? {};
  console.log('PRE-FIX stored roles vs POST-FIX derived roles (REAL assignSemanticRole over the LIVE recognition):');
  let unknownsBefore = 0, unknownsAfter = 0;
  for (const b of unit.fieldBindings ?? []) {
    const interp = interps[b.sourceField];
    const f: FieldProfile = {
      fieldName: b.sourceField, fieldIndex: 0, dataType: (b.platformType ?? 'text') as FieldProfile['dataType'], nullRate: 0, distinctCount: 50,
      distribution: {}, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false, looksLikePersonName: false },
    };
    const post = assignSemanticRole(f, 'transaction', interp as never, 85);
    if (b.semanticRole === 'unknown') unknownsBefore++;
    if (post.role === 'unknown') unknownsAfter++;
    const marker = b.semanticRole !== post.role ? '  <-- CHANGED' : '';
    console.log(`  ${b.sourceField.padEnd(28)} nature_role=${(interp?.nature_role ?? '-').padEnd(11)} stored=${b.semanticRole.padEnd(22)} post-fix=${post.role}${marker}`);
  }
  console.log(`unknown roles: PRE-FIX=${unknownsBefore}  POST-FIX=${unknownsAfter}  -> HF-247 write gate ${unknownsAfter === 0 ? 'PASSES (fingerprint stores)' : 'still blocks'}`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
