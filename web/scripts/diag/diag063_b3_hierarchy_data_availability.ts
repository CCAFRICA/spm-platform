/**
 * DIAG-063 / B3 — Hierarchy data availability for export delta (READ-ONLY).
 * Structural only: metadata KEY names and row counts. No values printed.
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: ents, error } = await supabase
    .from('entities')
    .select('metadata, temporal_attributes')
    .eq('tenant_id', TENANT_ID)
    .limit(3);
  if (error) throw error;
  ents?.forEach((e, i) => {
    console.log(
      `entity[${i}] metadata keys:`,
      e.metadata ? Object.keys(e.metadata as object).join(', ') : '(null)'
    );
    console.log(
      `entity[${i}] temporal_attributes keys:`,
      e.temporal_attributes ? Object.keys(e.temporal_attributes as object).join(', ') : '(null)'
    );
  });

  const { count: relCount, error: relErr } = await supabase
    .from('entity_relationships')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  if (relErr) throw relErr;
  console.log('entity_relationships rows for tenant:', relCount);
}

main().catch((e) => {
  console.error('SCRIPT_ERROR:', e?.message ?? e);
  process.exit(1);
});
