import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
function parse(components:any){ return Array.isArray(components)? components.map((x:any)=>({name:String(x.componentName??x.name),payout:Number(x.payout??0)})):[]; }
async function main(){
  const { data } = await c.from('calculation_results').select('entity_id,total_payout,components').eq('tenant_id',BCL).limit(40);
  const parsed = (data??[]).map((r:any)=>({r,comps:parse(r.components)}));
  const cols:string[]=[]; const seen=new Set<string>();
  for (const {comps} of parsed) for (const x of comps) if(!seen.has(x.name)){seen.add(x.name);cols.push(x.name);}
  const peerMax=new Map<string,number>(); for(const {comps} of parsed) for(const x of comps) peerMax.set(x.name,Math.max(peerMax.get(x.name)??0,x.payout));
  const rows = parsed.map(({r,comps}:any)=>{ const by=new Map(comps.map((x:any)=>[x.name,x.payout])); let score=0; const cells=cols.map(n=>{const p=Number(by.get(n)??0);score+=Math.max(0,(peerMax.get(n)??0)-p);return {n,p};}); return {ent:r.entity_id.slice(0,8),total:r.total_payout,cells,score}; });
  rows.sort((a,b)=>b.score-a.score);
  console.log('COLUMNS (from data componentName):', JSON.stringify(cols));
  console.log('peerMax:', JSON.stringify(Array.from(peerMax.entries())));
  console.log('\nTop-5 coaching priority (biggest gap first) — cells show PAYOUT (no dashes):');
  for (const r of rows.slice(0,5)) console.log(`  ${r.ent} total=${r.total} gap=${r.score} | ${r.cells.map((x:any)=>x.n.split(' ')[0]+'='+x.p).join('  ')}`);
}
main();
