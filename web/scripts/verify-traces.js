/**
 * verify-traces.js
 *
 * Browser-paste script to verify forensic trace emission.
 * Run in browser console after a calculation completes.
 *
 * Usage: Copy this entire file content, paste in browser console.
 */
(function() {
  'use strict';

  console.log('='.repeat(60));
  console.log('FORENSICS TRACE VERIFICATION');
  console.log('Generated:', new Date().toISOString());
  console.log('='.repeat(60));

  // 1. Find trace metadata
  var tenantId = '';
  try {
    var tenantStr = localStorage.getItem('entityb_current_tenant');
    if (tenantStr) {
      var tenant = JSON.parse(tenantStr);
      tenantId = tenant.id || '';
    }
  } catch(e) {}

  if (!tenantId) {
    console.error('ERROR: No current tenant found');
    return;
  }

  console.log('\nTenant ID:', tenantId);

  var metaKey = 'vialuce_forensics_' + tenantId + '_traces_meta';
  var metaStr = localStorage.getItem(metaKey);

  if (!metaStr) {
    console.error('ERROR: No trace metadata found at key:', metaKey);
    console.log('Run a calculation first, then re-run this script.');
    return;
  }

  var meta = JSON.parse(metaStr);
  console.log('\n>>> TRACE METADATA');
  console.log('  Run ID:      ', meta.runId);
  console.log('  Total Traces:', meta.totalTraces);
  console.log('  Chunks:      ', meta.chunkCount);
  console.log('  Saved At:    ', meta.savedAt);

  // 2. Load all traces
  var traces = [];
  for (var i = 0; i < meta.chunkCount; i++) {
    var key = 'vialuce_forensics_' + tenantId + '_traces_' + meta.runId + '_' + i;
    var chunk = localStorage.getItem(key);
    if (!chunk) break;
    var parsed = JSON.parse(chunk);
    if (Array.isArray(parsed)) {
      traces = traces.concat(parsed);
    }
  }

  console.log('\n>>> LOADED TRACES:', traces.length);

  if (traces.length === 0) {
    console.error('ERROR: No traces loaded');
    return;
  }

  // 3. First trace summary
  var first = traces[0];
  console.log('\n>>> FIRST TRACE SAMPLE');
  console.log('  Employee ID:  ', first.employeeId);
  console.log('  Employee Name:', first.employeeName);
  console.log('  Employee Role:', first.employeeRole);
  console.log('  Store ID:     ', first.storeId || '(none)');
  console.log('  Variant:      ', first.variant.variantId, '-', first.variant.variantName);
  console.log('  Components:   ', first.components.length);
  console.log('  Total:        ', '$' + first.totalIncentive.toLocaleString());
  console.log('  Currency:     ', first.currency);
  console.log('  Flags:        ', first.flags.length > 0 ? first.flags.join('; ') : '(none)');

  // 4. Per-component detail for first trace
  console.log('\n>>> COMPONENT BREAKDOWN (first employee)');
  for (var c = 0; c < first.components.length; c++) {
    var comp = first.components[c];
    console.log('  [' + (c + 1) + '] ' + comp.componentName);
    console.log('      Type:         ', comp.calculationType);
    console.log('      Output:       ', '$' + comp.outputValue.toLocaleString());
    console.log('      Metrics:      ', comp.metrics.length);
    for (var m = 0; m < comp.metrics.length; m++) {
      var met = comp.metrics[m];
      console.log('        - ' + met.metricName + ': ' + met.resolvedValue + ' (' + met.resolutionPath + ')');
    }
    console.log('      Lookup Type:  ', comp.lookup.type);
    if (comp.lookup.tierLabel) console.log('      Tier Label:   ', comp.lookup.tierLabel);
    if (comp.lookup.rowLabel) console.log('      Row Band:     ', comp.lookup.rowLabel);
    if (comp.lookup.columnLabel) console.log('      Col Band:     ', comp.lookup.columnLabel);
    console.log('      Sentence:     ', comp.calculationSentence);
    if (comp.flags.length > 0) {
      console.log('      Flags:        ', comp.flags.map(function(f) { return f.message; }).join('; '));
    }
  }

  // 5. Aggregate stats
  var totalFromTraces = traces.reduce(function(s, t) { return s + t.totalIncentive; }, 0);
  var vlResults = window.__VL_RESULTS;
  var totalFromResults = vlResults
    ? vlResults.reduce(function(s, r) { return s + r.totalIncentive; }, 0)
    : null;

  console.log('\n>>> AGGREGATE VERIFICATION');
  console.log('  Traces Total:  $' + totalFromTraces.toLocaleString());
  if (totalFromResults !== null) {
    console.log('  Results Total: $' + totalFromResults.toLocaleString());
    console.log('  Match:         ', totalFromTraces === totalFromResults ? 'YES' : 'NO - MISMATCH!');
  } else {
    console.log('  Results Total: (window.__VL_RESULTS not available)');
  }

  // 6. Component name inventory (dynamic, no hardcoding)
  var componentNames = {};
  traces.forEach(function(t) {
    t.components.forEach(function(c) {
      if (!componentNames[c.componentId]) {
        componentNames[c.componentId] = { name: c.componentName, count: 0, total: 0 };
      }
      componentNames[c.componentId].count++;
      componentNames[c.componentId].total += c.outputValue;
    });
  });

  console.log('\n>>> COMPONENT INVENTORY (from plan, not hardcoded)');
  Object.keys(componentNames).forEach(function(id) {
    var info = componentNames[id];
    console.log('  ' + info.name.padEnd(30) + ' Employees: ' + info.count + '  Total: $' + info.total.toLocaleString());
  });

  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
})();
