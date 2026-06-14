import { formatTenantCurrency } from '../../src/types/tenant';
const cases: Array<[number, string]> = [
  [150000,  'PDR-01 >=10k whole -> no cents'],
  [8500.50, '<10k -> cents retained'],
];
let pass = 0, fail = 0;
for (const [amt, label] of cases) {
  const out = formatTenantCurrency(amt, 'PEN', 'es-PE');
  console.log(`  ${label}: formatTenantCurrency(${amt},'PEN','es-PE') = ${JSON.stringify(out)}`);
}
const big = formatTenantCurrency(150000, 'PEN', 'es-PE');
const small = formatTenantCurrency(8500.50, 'PEN', 'es-PE');
const checks: Array<[boolean,string]> = [
  [big.includes('S/'), 'symbol S/ present'],
  [big.includes('/'), 'forward slash intact (not escaped/truncated)'],
  [!big.includes('.'), 'PDR-01: >=10k renders without cents'],
  [!big.includes('$'), 'no $ symbol leaked'],
  [big.toUpperCase() !== 'PEN', 'not the literal string PEN'],
  [small.includes('.50') || small.includes(',50'), '<10k retains cents'],
];
for (const [ok, name] of checks) { console.log(`  [${ok?'PASS':'FAIL'}] ${name}`); ok?pass++:fail++; }
console.log(`\n  RESULT: ${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
