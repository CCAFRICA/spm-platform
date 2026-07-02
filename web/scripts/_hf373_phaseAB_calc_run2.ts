import { config } from 'dotenv'; config({ path: '.env.local' });
import { getCookieFor } from './_hf373_authlib';
const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
const RULE_SET = '91f822b1-186e-419b-9627-64d801fe323f';
const PERIOD = process.argv[2] || '2e12b59d-7785-44d9-83ff-20a33cdf131a';
(async () => {
  const cookie = await getCookieFor('TU100@vialuce.ai');
  const res = await fetch('http://localhost:3001/api/calculation/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ tenantId: T, ruleSetId: RULE_SET, periodId: PERIOD }),
  });
  const body = await res.json().catch(() => ({}));
  console.log('status', res.status, 'keys:', Object.keys(body).join(','));
  console.log(JSON.stringify(body).slice(0, 1500));
})().catch(e => console.log('threw:', e instanceof Error ? e.message : String(e)));
