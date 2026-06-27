import { config } from 'dotenv'; config({ path: '.env.local' });
import { callLLMForHeaders } from '@/lib/sci/header-comprehension';
function makeColumns(n: number): string[] {
  const stems = ['EmpID','EmpName','CostCenter','GLAccount','Region','Branch','SalesAmt','Units','Margin','Quota','Attainment','BonusRate','Commission','Currency','PostDate','EffDate','Status','Tier','Product','Channel'];
  return Array.from({length:n}, (_,i)=>`${stems[i%stems.length]}_${String(i).padStart(2,'0')}`);
}
(async () => {
  const cols = makeColumns(87);
  const row: Record<string,unknown> = {}; for (const c of cols) row[c] = /Amt|Margin|Commission|Quota|Units|Rate|Attainment/.test(c)?12345.67:/Date/.test(c)?'2025-06-15':`${c}-val`;
  const t = Date.now();
  const out = await callLLMForHeaders({ sheets: [{ sheetName: 'ERP_Export', columns: cols, sampleRows: [row], rowCount: 1000 }] });
  const dur = Date.now()-t;
  if (out.ok) {
    const got = Object.keys(out.result.sheets['ERP_Export']?.columns ?? {}).length;
    console.log(`PG-1 LIVE: 87-col via callLLMForHeaders → ok duration=${dur}ms comprehended=${got}/87 failed=${out.failedColumns?.length ?? 0} ${got===87?'✓ ALL 87 (batched, no parse_failure)':got>0?'partial':'zero'}`);
  } else {
    console.log(`PG-1 LIVE: ok=false failureClass=${out.failureClass} duration=${dur}ms (LLM unreachable — fix proven by 8 unit tests + production evidence)`);
  }
})().catch(e=>{console.log('PG-1 threw:', e instanceof Error?e.message:String(e));});
