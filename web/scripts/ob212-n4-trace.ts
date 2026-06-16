// OB-212 N4 trajectory trace — wrap handlers to log every tool call so we can see why the agent
// did not converge to a final text turn. Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n4-trace.ts
import { createClient } from '@supabase/supabase-js';
import { runAgent, type AgentDefinition } from '../src/lib/ai/agent/agent-runner';
import { createReconciliationDiagnosisAgent } from '../src/lib/ai/agent/reconciliation-diagnosis-agent';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  const base = createReconciliationDiagnosisAgent({ supabase: sb as any, tenantId: BCL });
  let n = 0;
  const wrapped: AgentDefinition = {
    ...base,
    handlers: Object.fromEntries(
      Object.entries(base.handlers).map(([name, h]) => [
        name,
        async (input: Record<string, unknown>) => {
          n++;
          console.log(`#${n} TOOL ${name}(${JSON.stringify(input)})`);
          const r = await h(input);
          console.log(`     -> ${JSON.stringify(r).slice(0, 160)}`);
          return r;
        },
      ]),
    ),
  };
  const kickoff =
    'Investigate reconciliation session 120b50ad-063f-4729-8def-bd9944e139c2, entity BCL-5027, focusing on component "Productos Cruzados". Determine why the engine (platform) value differs from the expected (benchmark) value, using the tools. Then give a concise structural diagnosis.';
  try {
    const run = await runAgent(wrapped, kickoff);
    console.log(`\nCONVERGED turnCount=${run.turnCount} tools=${run.turns.length} tokens=${JSON.stringify(run.tokenUsage)}`);
    console.log('FINAL TEXT:\n' + run.finalText);
  } catch (e) {
    console.log(`\nTHREW: ${e instanceof Error ? e.message : String(e)} (after ${n} tool calls)`);
  }
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
