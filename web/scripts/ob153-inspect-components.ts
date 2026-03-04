import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const tid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const { data } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', tid);
  for (const rs of (data || [])) {
    console.log('Rule set:', rs.name, rs.id);
    const c = rs.components;
    console.log('  typeof:', typeof c);
    console.log('  isArray:', Array.isArray(c));
    if (typeof c === 'object' && c !== null) {
      console.log('  keys:', Object.keys(c));
      if ((c as Record<string, unknown>).components) {
        const inner = (c as Record<string, unknown>).components;
        console.log('  c.components isArray:', Array.isArray(inner));
        console.log('  c.components length:', Array.isArray(inner) ? inner.length : 'N/A');
        if (Array.isArray(inner) && inner[0]) {
          console.log('  first component:', JSON.stringify(inner[0]).substring(0, 300));
        }
      }
      if ((c as Record<string, unknown>).variants) {
        const variants = (c as Record<string, unknown>).variants;
        console.log('  c.variants isArray:', Array.isArray(variants));
      }
    }
  }
}

run();
