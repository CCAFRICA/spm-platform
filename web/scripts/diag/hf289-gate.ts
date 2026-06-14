import { createClient } from '@supabase/supabase-js';
async function main(){ const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const {data}=await c.from('tenants').select('id, name, currency, locale').limit(8);
console.log(JSON.stringify(data,null,1)); }
main();
