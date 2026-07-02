/** HF-373 EPG-A1/B1 proof — real calc run via POST /api/calculation/run on the
 * dev server, authenticated as the platform user (prior-script pattern). */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { getCookieFor } from './_hf373_authlib';

const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
const RULE_SET = '91f822b1-186e-419b-9627-64d801fe323f';
const PERIOD = process.argv[2] || '2e12b59d-7785-44d9-83ff-20a33cdf131a'; // 2025-11 default
const BASE = 'http://localhost:3001';

const getAuthCookie = () => getCookieFor('TU100@vialuce.ai');

(async () => {
  const cookie = await getAuthCookie();
  console.log('auth OK');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/calculation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ tenantId: T, ruleSetId: RULE_SET, periodId: PERIOD }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const log: string[] = Array.isArray(body.log) ? body.log : [];
  const interesting = log.filter((l: string) =>
    l.includes('[VARIANT') || l.includes('variantDistribution') || l.includes('[CalcRecon-T2]')
    || l.includes('[CalcRecon-T1]') || l.includes('Grand total') || l.includes('HF-373')
    || l.includes('HF-281') || l.includes('Convergence complete') || l.includes('excluded'));
  for (const l of interesting) console.log(l);
  if (res.status !== 200) console.log('BODY:', JSON.stringify(body).slice(0, 2000));
  else console.log('summary:', JSON.stringify(body.summary ?? body.batch?.summary ?? {}).slice(0, 600));
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
