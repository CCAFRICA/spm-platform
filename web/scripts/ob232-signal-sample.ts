import { createClient } from '@supabase/supabase-js';
import { recordUiSignal } from '../src/lib/signals/ui-signal';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const {data:loc}=await sb.from('entities').select('id').eq('tenant_id',SABOR).eq('entity_type','location').limit(1);
  const entityId=loc?.[0]?.id ?? null;
  const ok=await recordUiSignal(sb,{tenantId:SABOR,signalType:'selection',surface:'financial.patterns',entityId,metricKey:'revenue',actorId:'sample-actor'});
  console.log('PG-6 recordUiSignal ok:', ok);
  const {data:rows}=await sb.from('classification_signals').select('signal_type,signal_value,source,context,entity_id').eq('tenant_id',SABOR).eq('source','ui').order('created_at',{ascending:false}).limit(1);
  console.log('PG-6 sample signal row:', JSON.stringify(rows?.[0]));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
