/**
 * Quick check - run this first to verify calculation results are available
 */
(function() {
  const r = window.__VL_RESULTS;
  if (!r || !Array.isArray(r)) {
    console.log('ERROR: window.__VL_RESULTS not found');
    console.log('Run calculation first, then run this script');
    return;
  }

  console.log('=== QUICK CHECK ===');
  console.log('Employees:', r.length);

  let total = 0;
  let certified = 0;
  let nonCertified = 0;

  for (const e of r) {
    total += e.totalIncentive || 0;
    const variant = (e.variantId || e.variantName || '').toLowerCase();
    if (variant.includes('non') || variant.includes('no ')) nonCertified++;
    else certified++;
  }

  console.log('Total Incentive: $' + total.toLocaleString());
  console.log('Certified employees:', certified);
  console.log('Non-certified employees:', nonCertified);
  console.log('');
  console.log('Ready for full reconciliation script (scripts/reconcile-full.js)');
})();
