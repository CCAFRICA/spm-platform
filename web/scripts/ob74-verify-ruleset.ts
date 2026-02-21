#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function verify() {
  const { data, error } = await s
    .from('rule_sets')
    .select('id, name, status, components, created_at')
    .eq('tenant_id', TENANT_ID);

  if (error) { console.log('Error:', error.message); return; }
  if (!data || data.length === 0) { console.log('NO RULE SETS FOUND'); return; }

  for (const rs of data) {
    console.log('=== Rule Set ===');
    console.log('ID:', rs.id);
    console.log('Name:', rs.name);
    console.log('Status:', rs.status);
    console.log('Created:', rs.created_at);

    const comp = rs.components as Record<string, unknown>;
    if (comp && typeof comp === 'object') {
      const variants = (comp.variants as Array<Record<string, unknown>>) || [];
      console.log('Variants:', variants.length);
      if (variants[0]) {
        const components = (variants[0].components as Array<Record<string, unknown>>) || [];
        console.log('Components:', components.length);
        components.forEach((c: Record<string, unknown>, i: number) => {
          console.log(`  ${i + 1}. ${c.name} (${c.componentType}) ${c.enabled ? 'ENABLED' : 'DISABLED'}`);
          const tier = c.tierConfig as Record<string, unknown> | undefined;
          const matrix = c.matrixConfig as Record<string, unknown> | undefined;
          const pct = c.percentageConfig as Record<string, unknown> | undefined;
          const cond = c.conditionalConfig as Record<string, unknown> | undefined;
          if (tier) console.log('     tierConfig.metric:', tier.metric);
          if (matrix) console.log('     matrixConfig.row:', matrix.rowMetric, 'col:', matrix.columnMetric);
          if (pct) console.log('     percentageConfig.appliedTo:', pct.appliedTo);
          if (cond) console.log('     conditionalConfig.appliedTo:', cond.appliedTo);
        });
      }
    }
  }
}

verify().catch(console.error);
