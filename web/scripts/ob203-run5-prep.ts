// OB-203 run-5 prep: verify D16 atomicity held live (run-4), THEN cold-reset for run-5.
// Safety: if a failed batch still has retained rows (atomicity BREACH), STOP — do not reset,
// preserve the evidence. Retries through the flaky host.
import { createClient } from '@supabase/supabase-js';
const T='3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function withRetry<X>(label:string,fn:()=>Promise<X>):Promise<X>{
  for(let a=1;a<=10;a++){ try{ return await fn(); }catch(e:any){ console.log(`  [${label}] host down a${a} (${String(e.message).slice(0,30)})`); await sleep(4000*a);} }
  throw new Error(`${label}: host never answered`);
}
(async()=>{
  // ── 1. ATOMICITY CENSUS ──
  const batches = await withRetry('census', async()=>{
    const {data,error}=await sb.from('import_batches').select('id,status,row_count,error_summary').eq('tenant_id',T).order('created_at');
    if(error) throw new Error(error.message); return data??[];
  });
  const {count:cd}=await sb.from('committed_data').select('*',{count:'exact',head:true}).eq('tenant_id',T);
  const {count:ents}=await sb.from('entities').select('*',{count:'exact',head:true}).eq('tenant_id',T);
  console.log(`\n=== ATOMICITY CENSUS (run-4, new D16 code) ===`);
  console.log(`committed_data=${cd} entities=${ents} batches=${batches.length}\n`);
  let breaches=0, completed=0, rolledBack=0;
  for(const b of batches){
    const {count:actual}=await sb.from('committed_data').select('*',{count:'exact',head:true}).eq('tenant_id',T).eq('import_batch_id',b.id);
    const es:any=b.error_summary;
    // BREACH = any non-completed batch that still has rows (failed OR stuck 'processing'). The original
    // check missed 'processing' — a host outage that kills the rollback delete leaves the batch exactly
    // there (never finalized to 'failed', rows never deleted). That is the real partial-retention case.
    const breach = b.status!=='completed' && (actual??0)>0;
    if(breach) breaches++;
    if(b.status==='completed') completed++;
    if(es?.rolledBack) rolledBack++;
    console.log(`  ${b.id.slice(0,8)} | ${b.status} | row_count=${b.row_count} | ACTUAL=${actual}${es?.rolledBack!==undefined?` | rolledBack=${es.rolledBack} rb=${es.rolledBackRows}`:''}${breach?'  ⚠BREACH':''}`);
  }
  console.log(`\nVERDICT: completed=${completed} rolledBack=${rolledBack} atomicity-breaches=${breaches}`);
  if(breaches>0){ console.log('\n⛔ ATOMICITY BREACH — failed batch retains rows. NOT resetting; evidence preserved for architect.'); return; }
  console.log('✅ Atomicity held: every failed/partial unit fully rolled back. Proceeding to cold reset.\n');

  // ── 2. COLD RESET ──
  console.log('=== COLD RESET (tenants/profiles/rule_sets/periods preserved) ===');
  for(const t of ['structural_fingerprints','classification_signals','committed_data','entities','import_batches']){
    await withRetry(`del ${t}`, async()=>{ const {error}=await sb.from(t).delete().eq('tenant_id',T); if(error) throw new Error(error.message); });
    console.log(`  ${t}: cleared`);
  }
  console.log('\n=== AFTER ===');
  for(const t of ['structural_fingerprints','classification_signals','committed_data','entities','import_batches']){
    const {count}=await sb.from(t).select('*',{count:'exact',head:true}).eq('tenant_id',T);
    console.log(`  ${t}: ${count}`);
  }
  console.log('\nTenant 3d354bfa COLD. Ready for RUN 5.');
})();
