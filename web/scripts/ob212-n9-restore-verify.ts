// OB-212 N9 — verify session-restore-by-URL end-to-end (real GET handler + hydration + report regen),
// bypassing only the auth middleware. Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n9-restore-verify.ts
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/reconciliation/session/route';
import { generateReconciliationReport, type ComparisonResultInput } from '../src/lib/reconciliation/report-engine';

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SESSION = '120b50ad-063f-4729-8def-bd9944e139c2';

async function call(sessionId: string, tenantId: string) {
  const res = await GET(new NextRequest(`http://localhost/api/reconciliation/session?sessionId=${sessionId}&tenantId=${tenantId}`));
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('================ OB-212 N9 RESTORE VERIFY ================');

  // 1. happy path: BCL fetches its own session
  const ok1 = await call(SESSION, BCL);
  console.log(`GET (BCL) -> http=${ok1.status} periodLabel=${JSON.stringify(ok1.body.periodLabel)}`);
  const s = ok1.body.session ?? {};
  const results = s.results ?? {}, summary = s.summary ?? {}, config = s.config ?? {};
  const hydrated = {
    employees: results.employees ?? [], summary, falseGreenCount: summary.falseGreenCount ?? 0,
    findings: results.findings ?? [], periodsCompared: config.periodsCompared ?? [], depthAchieved: config.depthAchieved ?? 2,
  };
  const report = generateReconciliationReport(hydrated as unknown as ComparisonResultInput, { periodLabel: ok1.body.periodLabel ?? '?', tenantName: 'Banco Cumbre del Litoral' });
  const matched = hydrated.employees.filter((e: any) => e.population === 'matched');
  const withCompDelta = matched.filter((e: any) => (e.components ?? []).some((c: any) => Math.abs(c.delta) > 0));
  console.log(`  batch_id=${s.batch_id} status=${s.status}`);
  console.log(`  employees=${hydrated.employees.length} matched=${matched.length} withComponentDelta=${withCompDelta.length}`);
  console.log(`  report.components=${report.components.length} [${report.components.map((c: any) => c.name).join(', ')}]`);
  console.log(`  report.findings=${report.findings.length} top="${report.findings[0]?.title ?? ''}"`);
  console.log(`  sample entity with deltas: ${withCompDelta[0]?.entityId}`);

  // 2. tenant-scope guard: wrong tenant must NOT get the session
  const bogus = await call(SESSION, '00000000-0000-4000-8000-000000000999');
  console.log(`\nGET (wrong tenant) -> http=${bogus.status} (expect 404) error=${JSON.stringify(bogus.body.error)}`);

  const ok =
    ok1.status === 200 && matched.length >= 3 && report.components.length >= 1 && withCompDelta.length >= 3 &&
    ok1.body.periodLabel === 'February 2026' && bogus.status === 404;
  console.log(`\n================ ${ok ? 'PASS — restores into a renderable results view (component deltas) + tenant-scope enforced' : 'FAIL — inspect above'} ================`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
