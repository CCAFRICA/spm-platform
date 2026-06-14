import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
// Walk a DAG node, collecting: field references, ops used, whether any division/ratio (attainment signal)
function walk(node:any, acc:{fields:Set<string>,ops:Set<string>,primes:Set<string>}){
  if(!node||typeof node!=='object')return;
  if(node.prime)acc.primes.add(node.prime);
  if(node.op)acc.ops.add(node.op);
  if(node.prime==='reference'&&node.field)acc.fields.add(node.field);
  for(const k of Object.keys(node)){const v=node[k]; if(Array.isArray(v))v.forEach(x=>walk(x,acc)); else if(typeof v==='object')walk(v,acc);}
}
async function main(){
  const {data:rs}=await c.from('rule_sets').select('components').eq('tenant_id',BCL).neq('status','draft').limit(1);
  const variants=(rs?.[0]?.components as any)?.variants ?? [];
  console.log(`variants: ${variants.length}`);
  // dedupe components by name across variants, show structural signature
  const seen=new Set<string>();
  for(const v of variants){
    for(const comp of (v.components??[])){
      if(seen.has(comp.name))continue; seen.add(comp.name);
      const acc={fields:new Set<string>(),ops:new Set<string>(),primes:new Set<string>()};
      walk(comp.metadata?.intent, acc);
      console.log(`\n[${comp.name}] (variant ${v.variantId})`);
      console.log(`  primes: ${[...acc.primes].join(',')}`);
      console.log(`  ops: ${[...acc.ops].join(',')}`);
      console.log(`  field refs: ${[...acc.fields].join(', ')}`);
      console.log(`  has-division(ratio/attainment op)?: ${acc.ops.has('div')||acc.ops.has('divide')||acc.ops.has('ratio')||acc.primes.has('ratio')}`);
    }
  }
  // attainment shape across several rows
  console.log('\n=== attainment shapes (10 rows) ===');
  const {data:cr}=await c.from('calculation_results').select('attainment').eq('tenant_id',BCL).limit(10);
  const shapes=new Set((cr??[]).map((r:any)=>JSON.stringify(r.attainment)));
  console.log([...shapes].join('\n'));
  // metrics keys (what fields exist in the data)
  const {data:m}=await c.from('calculation_results').select('metrics').eq('tenant_id',BCL).limit(1);
  console.log('\nmetrics keys:', Object.keys((m?.[0]?.metrics as any)??{}).join(', '));
}
main();
