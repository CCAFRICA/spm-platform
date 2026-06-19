#!/usr/bin/env npx tsx
/**
 * OB-218: prove retrieveOriginalTrace against REAL persisted BCL traces (OB-217 produced 510).
 * Dynamically picks real traces, reconstructs their composite key (ID_Empleado + Periodo within
 * the source sheet) from the source committed_data row, retrieves via retrieveOriginalTrace, and
 * confirms it returns the exact row + correct contribution / rate / inputs. Read-only.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob218-verify-bcl-retrieval.ts
 */
import { createClient } from '@supabase/supabase-js';
import { retrieveOriginalTrace } from '@/lib/calculation/clawback';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  const { data: traces } = await supabase
    .from('calculation_traces').select('committed_data_id, output, inputs')
    .eq('tenant_id', BCL).not('committed_data_id', 'is', null).limit(5);
  if (!traces || traces.length === 0) throw new Error('no BCL traces found');

  let pass = 0; const lines: string[] = [];
  for (const t of traces as Array<{ committed_data_id: string; output: Record<string, unknown>; inputs: Record<string, unknown> }>) {
    const { data: cd } = await supabase.from('committed_data').select('row_data').eq('id', t.committed_data_id).single();
    const rd = (cd?.row_data ?? {}) as Record<string, unknown>;
    const sheet = String(rd._sheetName ?? '');
    const emp = String(rd.ID_Empleado ?? rd.DNI_Vendedor ?? '');
    const periodo = rd.Periodo !== undefined ? String(rd.Periodo) : undefined;
    const keyCol = rd.ID_Empleado !== undefined ? 'ID_Empleado' : 'DNI_Vendedor';

    // Retrieve the ORIGINAL trace by its composite key (entity + period within the sheet).
    const r = await retrieveOriginalTrace(supabase, BCL, keyCol, emp, {
      originalSheet: sheet || undefined,
      extraFilters: periodo !== undefined ? { Periodo: periodo } : undefined,
    });

    const expC = Number(t.output.contribution); const gotC = r.contribution?.toNumber() ?? null;
    const ok = r.found
      && r.committedDataId === t.committed_data_id
      && gotC === expC
      && r.rate === (t.output.rate as number)
      && JSON.stringify(r.inputs) === JSON.stringify(t.inputs);
    if (ok) pass++;
    lines.push(`${ok ? 'OK' : 'FAIL'} ${keyCol}=${emp} Periodo=${periodo} -> cdId match=${r.committedDataId === t.committed_data_id} contribution ${gotC}===${expC} rate ${r.rate}===${t.output.rate} inputsMatch=${JSON.stringify(r.inputs) === JSON.stringify(t.inputs)}`);
  }

  console.log('===== OB-218 retrieveOriginalTrace vs REAL BCL traces =====');
  lines.forEach(l => console.log('  ' + l));
  console.log(`\nRESULT: ${pass}/${traces.length} ${pass === traces.length ? 'PASS — retrieveOriginalTrace returns the exact original trace (contribution/rate/inputs)' : 'REVIEW'}`);
  if (pass !== traces.length) process.exit(1);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
