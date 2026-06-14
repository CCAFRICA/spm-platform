import { createClient } from '@supabase/supabase-js';
import { classifyRuleSetRegimes } from '../../src/lib/results/performance-regime';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const {data:rs}=await c.from('rule_sets').select('components,input_bindings').eq('tenant_id',BCL).neq('status','draft').limit(1);
  const regimes = classifyRuleSetRegimes(rs?.[0]?.components);
  const cb = (rs?.[0]?.input_bindings as any)?.convergence_bindings ?? {};
  // flatten all bindings: dagField -> column (across components)
  const fieldToColumn = new Map<string,string>();
  for (const comp of Object.values(cb) as any[]) for (const [f,b] of Object.entries(comp as any)) if((b as any)?.column) fieldToColumn.set(f,(b as any).column);
  console.log('=== canonical binding: DAG field -> persisted column (sample) ===');
  for (const [f,col] of Array.from(fieldToColumn).slice(0,12)) console.log(`  ${f.padEnd(24)} -> ${col}`);
  // a calc_result's metrics
  const {data:cr}=await c.from('calculation_results').select('metrics,components').eq('tenant_id',BCL).limit(1);
  const metrics = (cr?.[0]?.metrics as any) ?? {};
  console.log('\n=== D-1 SR-38: regime-3 attainment computed via canonical binding (no name-matching) ===');
  for (const [name, cls] of regimes) {
    if (cls.regime === 3 && cls.attainmentFields) {
      const aCol = fieldToColumn.get(cls.attainmentFields.actual);
      const tCol = fieldToColumn.get(cls.attainmentFields.target);
      const actual = aCol ? metrics[aCol] : undefined;
      const target = tCol ? metrics[tCol] : undefined;
      const att = (typeof actual==='number'&&typeof target==='number'&&target!==0) ? (actual/target*100) : null;
      console.log(`  ${name}: ${cls.attainmentFields.actual}->${aCol}=${actual}  ÷  ${cls.attainmentFields.target}->${tCol}=${target}  =  ${att!=null?att.toFixed(1)+'% attainment':'n/a'}`);
    }
  }
}
main();
