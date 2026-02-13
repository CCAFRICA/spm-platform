/**
 * verify-forensics.js
 *
 * Browser-paste script to verify the full forensics environment.
 * Run in browser console after a calculation + reconciliation completes.
 *
 * Usage: Copy this entire file content, paste in browser console.
 */
(function() {
  'use strict';

  console.log('='.repeat(60));
  console.log('FORENSICS ENVIRONMENT VERIFICATION');
  console.log('Generated:', new Date().toISOString());
  console.log('='.repeat(60));

  // 1. Find tenant
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

  // 2. Check traces
  var traceMetaKey = 'vialuce_forensics_' + tenantId + '_traces_meta';
  var traceMeta = null;
  try {
    var metaStr = localStorage.getItem(traceMetaKey);
    if (metaStr) traceMeta = JSON.parse(metaStr);
  } catch(e) {}

  console.log('\n>>> TRACES');
  if (traceMeta) {
    console.log('  Run ID:      ', traceMeta.runId);
    console.log('  Total Traces:', traceMeta.totalTraces);
    console.log('  Chunks:      ', traceMeta.chunkCount);
    console.log('  Saved At:    ', traceMeta.savedAt);

    // Load first trace
    var firstChunkKey = 'vialuce_forensics_' + tenantId + '_traces_' + traceMeta.runId + '_0';
    var firstChunk = localStorage.getItem(firstChunkKey);
    if (firstChunk) {
      var traces = JSON.parse(firstChunk);
      if (traces.length > 0) {
        var first = traces[0];
        console.log('  Sample:       ', first.employeeName, '-', first.variant.variantName, '- $' + first.totalIncentive);
        console.log('  Components:   ', first.components.length);
        first.components.forEach(function(c) {
          console.log('    - ' + c.componentName + ': $' + c.outputValue + ' (' + c.calculationType + ')');
        });
      }
    }
  } else {
    console.log('  No traces found. Run a calculation first.');
  }

  // 3. Check comparison data
  var compKey = 'vialuce_forensics_' + tenantId + '_comparison';
  var compData = null;
  try {
    var compStr = localStorage.getItem(compKey);
    if (compStr) compData = JSON.parse(compStr);
  } catch(e) {}

  console.log('\n>>> COMPARISON DATA');
  if (compData) {
    console.log('  Rows:    ', compData.data.length);
    console.log('  Mappings:', compData.mapping.mappings.length);
    compData.mapping.mappings.forEach(function(m) {
      console.log('    ' + m.sourceColumn + ' -> ' + m.mappedTo + ' (confidence: ' + m.confidence + ')');
    });
  } else {
    console.log('  No comparison data uploaded yet.');
  }

  // 4. Check reconciliation session
  var sessionKey = 'vialuce_forensics_' + tenantId + '_session';
  var session = null;
  try {
    var sessionStr = localStorage.getItem(sessionKey);
    if (sessionStr) session = JSON.parse(sessionStr);
  } catch(e) {}

  console.log('\n>>> RECONCILIATION SESSION');
  if (session) {
    console.log('  Session ID:    ', session.sessionId);
    console.log('  VL Total:      $' + session.aggregates.vlTotal.toLocaleString());
    if (session.aggregates.gtTotal !== undefined) {
      console.log('  GT Total:      $' + session.aggregates.gtTotal.toLocaleString());
      console.log('  Difference:    $' + (session.aggregates.difference || 0).toLocaleString());
    }
    console.log('  True Matches:  ', session.population.trueMatches);
    console.log('  Coincidental:  ', session.population.coincidentalMatches);
    console.log('  Mismatches:    ', session.population.mismatches);
    console.log('  Unmatched VL:  ', session.population.unmatchedVL.length);
    console.log('  Unmatched GT:  ', session.population.unmatchedGT.length);

    console.log('\n  Component Totals (dynamic from plan):');
    session.aggregates.componentTotals.forEach(function(ct) {
      var line = '    ' + ct.componentName.padEnd(25) + ' VL: $' + ct.vlTotal.toLocaleString();
      if (ct.gtTotal !== undefined) line += '  GT: $' + ct.gtTotal.toLocaleString();
      if (ct.difference !== undefined) line += '  Diff: $' + ct.difference.toLocaleString();
      console.log(line);
    });

    console.log('\n  Pipeline Health:', session.pipelineHealth.overallStatus);
    Object.entries(session.pipelineHealth.layers).forEach(function(entry) {
      console.log('    ' + entry[0] + ': ' + entry[1].status + ' (' + entry[1].flagCount + ' flags)');
    });
  } else {
    console.log('  No reconciliation session. Upload comparison data first.');
  }

  // 5. Check plan
  console.log('\n>>> ACTIVE PLAN');
  try {
    var plansStr = localStorage.getItem('compensation_plans');
    if (plansStr) {
      var plans = JSON.parse(plansStr, function(_, v) { return v === 'INFINITY' ? Infinity : v; });
      var activePlan = plans.find(function(p) { return p.tenantId === tenantId && p.status === 'active'; });
      if (activePlan) {
        console.log('  Plan:', activePlan.name);
        var config = activePlan.configuration;
        if (config.type === 'additive_lookup') {
          config.variants.forEach(function(v) {
            console.log('  Variant:', v.variantName, '-', v.components.length, 'components');
            v.components.forEach(function(c) {
              console.log('    - ' + c.name + ' (' + c.componentType + ', ' + c.measurementLevel + ')');
            });
          });
        }
      } else {
        console.log('  No active plan for tenant');
      }
    }
  } catch(e) {
    console.log('  Error reading plans:', e.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
})();
