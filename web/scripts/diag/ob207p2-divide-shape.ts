import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
function findNodes(node:any, pred:(n:any)=>boolean, out:any[], path:string[]=[]){
  if(!node||typeof node!=='object')return;
  if(pred(node)) out.push({path:path.join('.'), node});
  for(const [k,v] of Object.entries(node)){ if(Array.isArray(v))v.forEach((x,i)=>findNodes(x,pred,out,[...path,`${k}[${i}]`])); else if(v&&typeof v==='object')findNodes(v,pred,out,[...path,k]); }
}
async function main(){
  const {data:rs}=await c.from('rule_sets').select('components').eq('tenant_id',BCL).neq('status','draft').limit(1);
  const comp=(rs?.[0]?.components as any).variants[0].components.find((x:any)=>x.name==='Colocación de Crédito');
  const divides:any[]=[]; findNodes(comp.metadata?.intent, (n)=>n.op==='divide'||(n.prime==='arithmetic'&&n.op==='divide'), divides);
  console.log('=== divide nodes in Colocación de Crédito ===');
  for(const d of divides.slice(0,2)){ console.log('path:', d.path); console.log(JSON.stringify(d.node,null,1).slice(0,800)); }
  // also: is a divide INSIDE a condition subtree?
  const compares:any[]=[]; findNodes(comp.metadata?.intent,(n)=>n.prime==='compare'||n.op==='gte',compares);
  console.log('\n=== first compare node (the gate test) ===');
  console.log(JSON.stringify(compares[0]?.node,null,1).slice(0,700));
}
main();
