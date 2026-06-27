import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function trunc(v: any, n = 200): any {
  if (typeof v === 'string' && v.length > n) return v.slice(0, n) + `…[+${v.length - n} chars]`;
  return v;
}

function redactRow(row: any, n = 200): any {
  if (!row || typeof row !== 'object') return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object') {
      const s = JSON.stringify(v);
      out[k] = s.length > 600 ? JSON.parse(JSON.stringify(v)) && (s.slice(0, 600) + `…[+${s.length - 600} chars]`) : v;
    } else {
      out[k] = trunc(v, n);
    }
  }
  return out;
}

async function count(table: string, filter?: (q: any) => any): Promise<number | string> {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) return `ERROR: ${error.message}`;
  return c ?? -1;
}

async function main() {
  console.log('================ OB-249 GATE 0 PROBE ================');
  console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('time:', new Date().toISOString());
  console.log('');

  // ---------------- 1. structural_fingerprints ----------------
  console.log('========== 1. structural_fingerprints ==========');
  {
    const { data: oneRow, error: e1 } = await sb.from('structural_fingerprints').select('*').limit(1);
    if (e1) {
      console.log('ERROR select one row:', e1.message);
    } else {
      const cols = oneRow && oneRow[0] ? Object.keys(oneRow[0]) : [];
      console.log('columns:', JSON.stringify(cols));
      console.log('total row count:', await count('structural_fingerprints'));
      console.log('sample row (first):', JSON.stringify(redactRow(oneRow?.[0]), null, 2));

      // atom granularity
      const atomCount = await count('structural_fingerprints', (q) => q.eq('granularity', 'atom'));
      console.log('granularity=atom count:', atomCount);

      // distinct tenant_id among atom rows
      const { data: atomTenants, error: eAT } = await sb
        .from('structural_fingerprints')
        .select('tenant_id')
        .eq('granularity', 'atom')
        .limit(10000);
      if (eAT) {
        console.log('ERROR atom tenant fetch:', eAT.message);
      } else {
        const distinct = Array.from(new Set((atomTenants || []).map((r: any) => r.tenant_id)));
        console.log('distinct tenant_id among atom rows:', distinct.length);
        console.log('atom tenant_ids:', JSON.stringify(distinct));
      }

      // one atom sample row
      const { data: atomSample, error: eAS } = await sb
        .from('structural_fingerprints')
        .select('*')
        .eq('granularity', 'atom')
        .limit(1);
      if (eAS) {
        console.log('ERROR atom sample:', eAS.message);
      } else {
        console.log('ATOM sample row:', JSON.stringify(redactRow(atomSample?.[0], 400), null, 2));
        if (atomSample?.[0]) {
          console.log('ATOM column_roles:', JSON.stringify(atomSample[0].column_roles, null, 2));
          console.log('ATOM atom_features:', JSON.stringify(atomSample[0].atom_features, null, 2));
        }
      }
    }
  }
  console.log('');

  // ---------------- 2. classification_signals ----------------
  console.log('========== 2. classification_signals ==========');
  {
    const { data: oneRow, error: e1 } = await sb.from('classification_signals').select('*').limit(1);
    if (e1) {
      console.log('ERROR select one row:', e1.message);
    } else {
      const cols = oneRow && oneRow[0] ? Object.keys(oneRow[0]) : [];
      console.log('columns:', JSON.stringify(cols));
      console.log('total row count:', await count('classification_signals'));
      const { data: sigTypes, error: eST } = await sb.from('classification_signals').select('signal_type').limit(50);
      if (eST) {
        console.log('ERROR signal_type fetch:', eST.message);
      } else {
        const distinct = Array.from(new Set((sigTypes || []).map((r: any) => r.signal_type)));
        console.log('distinct signal_type (from first 50):', JSON.stringify(distinct));
      }
      console.log('sample row:', JSON.stringify(redactRow(oneRow?.[0], 400), null, 2));
    }
  }
  console.log('');

  // ---------------- 3. committed_data ----------------
  console.log('========== 3. committed_data ==========');
  let topTenant: string | null = null;
  {
    const { data: oneRow, error: e1 } = await sb.from('committed_data').select('*').limit(1);
    if (e1) {
      console.log('ERROR select one row:', e1.message);
    } else {
      const cols = oneRow && oneRow[0] ? Object.keys(oneRow[0]) : [];
      console.log('columns:', JSON.stringify(cols));
      console.log('total row count:', await count('committed_data'));

      // distinct tenant_id count + find top tenant by row count
      const { data: tenantRows, error: eTR } = await sb.from('committed_data').select('tenant_id').limit(100000);
      if (eTR) {
        console.log('ERROR tenant fetch:', eTR.message);
      } else {
        const tally: Record<string, number> = {};
        for (const r of tenantRows || []) {
          const t = (r as any).tenant_id;
          tally[t] = (tally[t] || 0) + 1;
        }
        const distinct = Object.keys(tally);
        console.log('distinct tenant_id count (sampled up to 100k rows):', distinct.length);
        const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        console.log('tenant row tally (top 10):', JSON.stringify(sorted.slice(0, 10)));
        topTenant = sorted[0]?.[0] ?? null;
        console.log('TOP tenant by committed_data rows:', topTenant);

        if (topTenant) {
          // distinct data_type for top tenant
          const { data: dtRows, error: eDT } = await sb
            .from('committed_data')
            .select('data_type')
            .eq('tenant_id', topTenant)
            .limit(100000);
          if (eDT) {
            console.log('ERROR data_type fetch:', eDT.message);
          } else {
            const dtDistinct = Array.from(new Set((dtRows || []).map((r: any) => r.data_type)));
            console.log(`TOP tenant distinct data_type values:`, JSON.stringify(dtDistinct));
          }
          // 3 sample rows for top tenant
          const { data: sampleRows, error: eSR } = await sb
            .from('committed_data')
            .select('*')
            .eq('tenant_id', topTenant)
            .limit(3);
          if (eSR) {
            console.log('ERROR sample rows:', eSR.message);
          } else {
            console.log('TOP tenant 3 sample rows:');
            (sampleRows || []).forEach((r, i) => {
              console.log(`  --- sample ${i + 1} ---`);
              console.log(JSON.stringify(redactRow(r, 400), null, 2));
            });
          }
        }
      }
    }
  }
  console.log('');

  // ---------------- 4. file_objects ----------------
  console.log('========== 4. file_objects ==========');
  {
    const { data: oneRow, error: e1 } = await sb.from('file_objects').select('*').limit(1);
    if (e1) {
      console.log('ERROR select one row:', e1.message);
    } else {
      const cols = oneRow && oneRow[0] ? Object.keys(oneRow[0]) : [];
      console.log('columns:', JSON.stringify(cols));
      console.log('total row count:', await count('file_objects'));
      const { data: stateRows, error: eS } = await sb.from('file_objects').select('state').limit(10000);
      if (eS) {
        console.log('ERROR state fetch:', eS.message);
      } else {
        const distinct = Array.from(new Set((stateRows || []).map((r: any) => r.state)));
        console.log('distinct state values:', JSON.stringify(distinct));
      }
      console.log('sample row:', JSON.stringify(redactRow(oneRow?.[0], 300), null, 2));
    }
  }
  console.log('');

  // ---------------- 5. tenantWithAtomData: intersection + normalization candidate ----------------
  console.log('========== 5. tenantWithAtomData (atom ∩ committed_data) ==========');
  {
    const { data: atomTenants } = await sb
      .from('structural_fingerprints')
      .select('tenant_id')
      .eq('granularity', 'atom')
      .limit(10000);
    const atomSet = new Set((atomTenants || []).map((r: any) => r.tenant_id));

    const { data: cdTenants } = await sb.from('committed_data').select('tenant_id').limit(100000);
    const cdSet = new Set((cdTenants || []).map((r: any) => r.tenant_id));

    const both = Array.from(atomSet).filter((t) => cdSet.has(t));
    console.log('tenants with BOTH atom rows AND committed_data:', JSON.stringify(both));

    // prefer the top committed tenant if it qualifies, else first intersection
    const chosen = both.includes(topTenant as any) ? topTenant : both[0];
    console.log('CHOSEN tenantWithAtomData:', chosen);

    if (chosen) {
      const { data: rows } = await sb.from('committed_data').select('*').eq('tenant_id', chosen).limit(50);
      console.log(`Fetched ${rows?.length ?? 0} committed_data rows for variance inspection.`);
      // Try to find a column whose values vary in representation (text-ish, multiple distinct, casing/spelling variance)
      if (rows && rows.length) {
        const cols = Object.keys(rows[0]);
        for (const c of cols) {
          const vals = rows.map((r: any) => r[c]).filter((v) => v !== null && v !== undefined);
          const strVals = vals.filter((v) => typeof v === 'string') as string[];
          if (strVals.length < 3) continue;
          const distinct = Array.from(new Set(strVals));
          // casing collision check
          const lowerMap: Record<string, Set<string>> = {};
          for (const s of strVals) {
            const k = s.toLowerCase().trim();
            (lowerMap[k] ||= new Set()).add(s);
          }
          const casingVariants = Object.entries(lowerMap).filter(([, set]) => set.size > 1);
          console.log(`  col "${c}": ${distinct.length} distinct / ${strVals.length} str vals; casing/trim-collision groups: ${casingVariants.length}`);
          if (casingVariants.length) {
            console.log(`    -> VARIANT GROUPS in "${c}":`, JSON.stringify(casingVariants.map(([k, set]) => [k, Array.from(set)]).slice(0, 10)));
          }
          if (distinct.length > 1 && distinct.length <= 30) {
            console.log(`    sample distinct values:`, JSON.stringify(distinct.slice(0, 20).map((s) => trunc(s, 60))));
          }
        }
      }
    }
  }
  console.log('');
  console.log('================ PROBE COMPLETE ================');
}

main().catch((e) => {
  console.error('FATAL PROBE ERROR:', e?.message || e);
  process.exit(1);
});
