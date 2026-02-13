/**
 * OB-30 Step 9: Five-Layer Validation Engine
 * Paste into browser console AFTER running a calculation.
 * Reads from the same sources the real engine reads.
 */
(function() {
  'use strict';

  const results = { layers: {}, flags: [], summary: '' };
  const log = (s) => console.log(s);
  const sep = (title) => {
    log('\n' + '='.repeat(60));
    log(title);
    log('='.repeat(60));
  };

  // ── Helpers ──
  function getTenantId() {
    const raw = localStorage.getItem('entityb_current_tenant') || '';
    return raw.replace(/^_+|_+$/g, '');
  }

  function getAggregatedData(tenantId) {
    const key = 'data_layer_committed_aggregated_' + tenantId;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  function getPlans() {
    const tenantId = getTenantId();
    const raw = localStorage.getItem('compensation_plans');
    if (!raw) return [];
    try {
      // Deserialize with INFINITY restoration (plan-storage.ts uses "INFINITY" placeholder)
      const all = JSON.parse(raw, (k, v) => v === 'INFINITY' ? Infinity : v);
      // Filter by tenantId to match orchestrator's getPlans(tenantId) behavior
      return all.filter(p => p.tenantId === tenantId);
    } catch { return []; }
  }

  function getVLResults() {
    return window.__VL_RESULTS || [];
  }

  // ════════════════════════════════════════════════════
  // LAYER 1: PLAN INTERPRETATION
  // ════════════════════════════════════════════════════
  function validateLayer1() {
    sep('LAYER 1: PLAN INTERPRETATION VALIDATION');
    const plans = getPlans();
    if (plans.length === 0) {
      log('ERROR: No plans found in localStorage key "compensation_plans"');
      results.flags.push('[L1] NO PLANS FOUND');
      return;
    }

    const activePlan = plans.find(p => p.status === 'active') || plans[0];
    const config = activePlan.configuration;
    log('Plan: ' + activePlan.name + ' | Status: ' + activePlan.status +
        ' | Type: ' + config.type + ' | Variants: ' + config.variants.length);

    const layer1 = { planName: activePlan.name, variants: [] };

    for (const variant of config.variants) {
      log('\n--- Variant: ' + variant.variantName + ' (' + variant.variantId + ') ---');
      log('Components: ' + variant.components.length);
      const variantData = { name: variant.variantName, id: variant.variantId, components: [] };

      for (const comp of variant.components) {
        log('\n  Component ' + comp.order + ': ' + comp.name + ' (' + comp.componentType + ')');
        log('    ID: ' + comp.id);
        log('    measurementLevel: ' + comp.measurementLevel);
        log('    enabled: ' + comp.enabled);

        const compData = { name: comp.name, id: comp.id, type: comp.componentType };

        if (comp.componentType === 'matrix_lookup' && comp.matrixConfig) {
          const mc = comp.matrixConfig;
          log('    Row metric: ' + mc.rowMetric + ' (' + mc.rowBands.length + ' bands)');
          log('    Col metric: ' + mc.columnMetric + ' (' + mc.columnBands.length + ' bands)');
          log('    Row bands:');
          mc.rowBands.forEach((b, i) => log('      [' + i + '] ' + b.min + ' - ' + b.max + '  "' + b.label + '"'));
          log('    Col bands:');
          mc.columnBands.forEach((b, i) => log('      [' + i + '] ' + b.min + ' - ' + b.max + '  "' + b.label + '"'));
          log('    Payout grid (' + mc.values.length + ' x ' + (mc.values[0]||[]).length + '):');
          mc.values.forEach((row, ri) => log('      row[' + ri + ']: ' + JSON.stringify(row)));
          compData.rows = mc.rowBands.length;
          compData.cols = mc.columnBands.length;
          compData.gridSize = mc.values.length + 'x' + (mc.values[0]||[]).length;
          compData.rowMetric = mc.rowMetric;
          compData.colMetric = mc.columnMetric;

          // Check monotonicity
          const rowMins = mc.rowBands.map(b => b.min);
          const colMins = mc.columnBands.map(b => b.min);
          const rowMono = rowMins.every((v, i) => i === 0 || v >= rowMins[i-1]);
          const colMono = colMins.every((v, i) => i === 0 || v >= colMins[i-1]);
          if (!rowMono) results.flags.push('[L1] ' + comp.name + ' row bands NOT monotonic');
          if (!colMono) results.flags.push('[L1] ' + comp.name + ' col bands NOT monotonic');
        }

        if (comp.componentType === 'tier_lookup' && comp.tierConfig) {
          const tc = comp.tierConfig;
          log('    Metric: ' + tc.metric + ' (' + tc.tiers.length + ' tiers)');
          tc.tiers.forEach((t, i) => {
            log('      [' + i + '] ' + t.min + '% - ' + t.max + '%  -> $' + t.value + '  "' + t.label + '"');
          });
          compData.metric = tc.metric;
          compData.tierCount = tc.tiers.length;
          compData.tiers = tc.tiers.map(t => ({ min: t.min, max: t.max, value: t.value }));

          // Check monotonicity
          const tierMins = tc.tiers.map(t => t.min);
          const mono = tierMins.every((v, i) => i === 0 || v >= tierMins[i-1]);
          if (!mono) results.flags.push('[L1] ' + comp.name + ' tiers NOT monotonic');
          // Check payout monotonicity
          const payouts = tc.tiers.map(t => t.value);
          const payMono = payouts.every((v, i) => i === 0 || v >= payouts[i-1]);
          if (!payMono) results.flags.push('[L1] ' + comp.name + ' payout values NOT monotonic');
        }

        if (comp.componentType === 'conditional_percentage' && comp.conditionalConfig) {
          const cc = comp.conditionalConfig;
          log('    Applied to: ' + cc.appliedTo);
          log('    Conditions (' + cc.conditions.length + '):');
          cc.conditions.forEach((c, i) => {
            log('      [' + i + '] ' + c.metric + ' ' + c.min + '%-' + c.max + '% -> rate=' + (c.rate*100).toFixed(1) + '% "' + c.label + '"');
          });
          compData.appliedTo = cc.appliedTo;
          compData.conditions = cc.conditions.map(c => ({ min: c.min, max: c.max, rate: c.rate }));
        }

        if (comp.componentType === 'percentage' && comp.percentageConfig) {
          const pc = comp.percentageConfig;
          log('    Rate: ' + (pc.rate*100).toFixed(1) + '%');
          log('    Applied to: ' + pc.appliedTo);
          if (pc.minThreshold !== undefined) log('    Min threshold: ' + pc.minThreshold);
          compData.rate = pc.rate;
          compData.appliedTo = pc.appliedTo;
        }

        variantData.components.push(compData);
      }
      layer1.variants.push(variantData);
    }

    // Flags
    for (const v of layer1.variants) {
      const compCount = v.components.length;
      if (compCount !== 6) results.flags.push('[L1] Variant ' + v.name + ' has ' + compCount + ' components (expected 6)');
      const matrixComps = v.components.filter(c => c.type === 'matrix_lookup');
      matrixComps.forEach(mc => {
        if (mc.gridSize !== '5x5') results.flags.push('[L1] ' + mc.name + ' matrix is ' + mc.gridSize + ' (expected 5x5)');
      });
    }
    results.flags.push('[L1] Component counts: ' + layer1.variants.map(v => v.name + '=' + v.components.length).join(', '));
    results.layers.layer1 = layer1;
  }

  // ════════════════════════════════════════════════════
  // LAYER 2: METRIC RESOLUTION
  // ════════════════════════════════════════════════════
  function validateLayer2() {
    sep('LAYER 2: METRIC RESOLUTION for Employee 90198149');
    const tenantId = getTenantId();
    const aggregated = getAggregatedData(tenantId);
    const vlResults = getVLResults();

    log('Tenant: ' + tenantId);
    log('Total aggregated records: ' + aggregated.length);
    log('Total VL results: ' + vlResults.length);

    // Find all records for employee 90198149
    const empRecords = aggregated.filter(r =>
      String(r.employeeId || '').includes('90198149')
    );

    log('\nRecords found for employee 90198149: ' + empRecords.length);

    const layer2 = { empRecordCount: empRecords.length, records: [], vlOutput: null };

    empRecords.forEach((rec, idx) => {
      log('\n  Record ' + (idx + 1) + ':');
      log('    employeeId: ' + rec.employeeId);
      log('    storeId: ' + rec.storeId);
      log('    month: ' + rec.month + '  year: ' + rec.year);
      log('    role: ' + rec.role);
      log('    _hasData: ' + rec._hasData);

      const cm = rec.componentMetrics || {};
      const recData = {
        month: rec.month, year: rec.year, storeId: rec.storeId,
        role: rec.role, sheets: {}
      };

      log('    componentMetrics keys: ' + Object.keys(cm).join(', '));
      for (const [sheetName, metrics] of Object.entries(cm)) {
        const m = metrics || {};
        log('    ' + sheetName + ': att=' + m.attainment + '  amt=' + m.amount + '  goal=' + m.goal);
        recData.sheets[sheetName] = {
          attainment: m.attainment, amount: m.amount, goal: m.goal
        };
      }
      layer2.records.push(recData);
    });

    // Find VL result for 90198149
    const empResults = vlResults.filter(r =>
      String(r.employeeId || '').includes('90198149')
    );

    log('\nVL Results for 90198149: ' + empResults.length);
    empResults.forEach((r, idx) => {
      log('\n  Result ' + (idx + 1) + ':');
      log('    variantId: ' + r.variantId + '  variantName: ' + r.variantName);
      log('    period: ' + r.period);
      log('    totalIncentive: $' + (r.totalIncentive || 0).toLocaleString());
      if (r.components) {
        r.components.forEach(c => {
          log('    ' + c.componentName + ' (' + c.componentType + '): $' + c.outputValue);
          if (c.metrics) {
            log('      metrics: ' + JSON.stringify(c.metrics));
          }
          if (c.calculation) {
            log('      calc: ' + c.calculation);
          }
        });
      }
      layer2.vlOutput = {
        variantId: r.variantId,
        period: r.period,
        totalIncentive: r.totalIncentive,
        components: (r.components || []).map(c => ({
          name: c.componentName, type: c.componentType,
          output: c.outputValue, metrics: c.metrics,
          calculation: c.calculation
        }))
      };
    });

    // Layer 2 flags
    if (empRecords.length > 1) {
      results.flags.push('[L2] MULTI-PERIOD: ' + empRecords.length + ' records for 90198149 in aggregated data');
    }
    if (empRecords.length === 1) {
      results.flags.push('[L2] Single record for 90198149 (expected for single-period calc)');
    }
    if (empResults.length > 1) {
      results.flags.push('[L2] MULTI-RESULT: ' + empResults.length + ' VL results for 90198149');
    }

    // Check tienda attainment
    empRecords.forEach((rec, idx) => {
      const cm = rec.componentMetrics || {};
      for (const [sheet, m] of Object.entries(cm)) {
        if (sheet.toLowerCase().includes('tienda') || sheet.toLowerCase().includes('venta_tienda')) {
          const att = (m || {}).attainment;
          const amt = (m || {}).amount;
          if (att !== undefined) {
            const label = 'Record ' + (idx+1) + ' month=' + rec.month;
            if (Math.abs(att - 97.11) < 0.5) {
              results.flags.push('[L2] ' + label + ': Tienda att=' + att + ' (POLLUTED all-period average!)');
            } else if (Math.abs(att - 101.80) < 0.5) {
              results.flags.push('[L2] ' + label + ': Tienda att=' + att + ' (CORRECT Jan value)');
            } else {
              results.flags.push('[L2] ' + label + ': Tienda att=' + att + ' (UNEXPECTED)');
            }
            results.flags.push('[L2] ' + label + ': Tienda amt=' + amt);
          }
        }
      }
    });

    results.layers.layer2 = layer2;
  }

  // ════════════════════════════════════════════════════
  // LAYER 3: COMPONENT CALCULATION
  // ════════════════════════════════════════════════════
  function validateLayer3() {
    sep('LAYER 3: COMPONENT CALCULATION VALIDATION');
    const vlResults = getVLResults();

    // Find VL result for employee 90198149
    const empResult = vlResults.find(r =>
      String(r.employeeId || '').includes('90198149')
    );

    if (!empResult) {
      log('ERROR: No VL result found for employee 90198149');
      results.flags.push('[L3] NO RESULT for 90198149');
      return;
    }

    log('Employee 90198149 | Variant: ' + empResult.variantName + ' | Total: $' + empResult.totalIncentive);

    // Reference tier tables from spec
    const refTables = {
      storeSales: [
        { min: 0, max: 100, value: 0 },
        { min: 100, max: 105, value: 150 },
        { min: 105, max: 110, value: 300 },
        { min: 110, max: Infinity, value: 500 }
      ],
      newCustomers: [
        { min: 0, max: 100, value: 0 },
        { min: 100, max: 105, value: 150 },
        { min: 105, max: 110, value: 200 },
        { min: 110, max: 115, value: 250 },
        { min: 115, max: 120, value: 300 },
        { min: 120, max: 125, value: 350 },
        { min: 125, max: Infinity, value: 400 }
      ],
      collections: [
        { min: 0, max: 100, value: 0 },
        { min: 100, max: 105, value: 150 },
        { min: 105, max: 110, value: 200 },
        { min: 110, max: 115, value: 250 },
        { min: 115, max: 120, value: 300 },
        { min: 120, max: 125, value: 350 },
        { min: 125, max: Infinity, value: 400 }
      ]
    };

    function lookupTier(tiers, attainment) {
      for (const t of tiers) {
        if (attainment >= t.min && attainment < t.max) return t.value;
      }
      return tiers[tiers.length - 1].value; // max tier
    }

    const layer3 = { components: [] };

    for (const comp of (empResult.components || [])) {
      const entry = {
        name: comp.componentName,
        type: comp.componentType,
        vlOutput: comp.outputValue,
        metrics: comp.metrics || {},
        calculation: comp.calculation
      };

      log('\n  ' + comp.componentName + ' (' + comp.componentType + '):');
      log('    VL output: $' + comp.outputValue);
      log('    Metrics: ' + JSON.stringify(comp.metrics || {}));
      log('    Calculation: ' + comp.calculation);

      // For tier_lookup, compute expected from metrics
      if (comp.componentType === 'tier_lookup' && comp.metrics) {
        const metricKeys = Object.keys(comp.metrics);
        const attKey = metricKeys.find(k => k.includes('attainment'));
        if (attKey) {
          const att = comp.metrics[attKey];
          log('    Input attainment (' + attKey + '): ' + att + '%');

          // Determine which reference table to use
          // Strip accents for matching: "Óptica" -> "optica", "Captación" -> "captacion"
          var compNameNorm = (comp.componentName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          let ref = null;
          let refName = '';
          // Check collections BEFORE store to avoid "cobranza en tienda" matching 'tienda'
          if (attKey.includes('collection') || compNameNorm.includes('cobr') || compNameNorm.includes('collection')) {
            ref = refTables.collections;
            refName = 'Collections';
          } else if (attKey.includes('store_sales') || compNameNorm.includes('venta de tienda') || compNameNorm.includes('store sale')) {
            ref = refTables.storeSales;
            refName = 'Store Sales';
          } else if (attKey.includes('new_customer') || compNameNorm.includes('cliente') || compNameNorm.includes('customer')) {
            ref = refTables.newCustomers;
            refName = 'New Customers';
          }

          if (ref) {
            const expected = lookupTier(ref, att);
            entry.expectedFromRef = expected;
            entry.refTable = refName;
            log('    Reference table: ' + refName);
            log('    Expected from ref: $' + expected);
            if (comp.outputValue !== expected) {
              log('    *** MISMATCH: VL=$' + comp.outputValue + ' vs expected=$' + expected);
              results.flags.push('[L3] ' + comp.componentName + ': VL=$' + comp.outputValue + ' vs expected=$' + expected + ' (att=' + att + '%)');
            } else {
              log('    MATCH');
              results.flags.push('[L3] ' + comp.componentName + ': MATCH VL=$' + comp.outputValue + ' for att=' + att + '%');
            }
          }
        }
      }

      // For matrix_lookup, show the row/col lookup path
      if (comp.componentType === 'matrix_lookup' && comp.metrics) {
        const metricKeys = Object.keys(comp.metrics);
        log('    Matrix input metrics: ' + metricKeys.join(', '));
        metricKeys.forEach(k => log('      ' + k + ' = ' + comp.metrics[k]));
      }

      // For conditional_percentage, show condition evaluation
      if (comp.componentType === 'conditional_percentage' && comp.metrics) {
        const metricKeys = Object.keys(comp.metrics);
        log('    Conditional metrics: ' + metricKeys.join(', '));
        metricKeys.forEach(k => log('      ' + k + ' = ' + comp.metrics[k]));
      }

      // For percentage, show base * rate
      if (comp.componentType === 'percentage' && comp.metrics) {
        const metricKeys = Object.keys(comp.metrics);
        log('    Percentage metrics: ' + metricKeys.join(', '));
        metricKeys.forEach(k => log('      ' + k + ' = ' + comp.metrics[k]));
      }

      layer3.components.push(entry);
    }

    // Scenario comparison
    log('\n  --- Scenario Comparison ---');
    log('  Scenario A (correct Jan per-period): store_sales_att=101.80 -> expected $150');
    log('  Scenario B (polluted all-period):    store_sales_att=97.11  -> expected $0');
    const storeComp = layer3.components.find(c =>
      c.name.toLowerCase().includes('venta de tienda') || c.name.toLowerCase().includes('store sale')
    );
    if (storeComp) {
      if (storeComp.vlOutput === 0) {
        log('  VL produced $0 -> MATCHES Scenario B (polluted data)');
        results.flags.push('[L3] Store Sales $0 -> Scenario B (polluted data reaching orchestrator)');
      } else if (storeComp.vlOutput === 150) {
        log('  VL produced $150 -> MATCHES Scenario A (correct data)');
        results.flags.push('[L3] Store Sales $150 -> Scenario A (correct per-period data)');
      } else {
        log('  VL produced $' + storeComp.vlOutput + ' -> NEITHER scenario');
        results.flags.push('[L3] Store Sales $' + storeComp.vlOutput + ' -> unexpected value');
      }
    }

    results.layers.layer3 = layer3;
  }

  // ════════════════════════════════════════════════════
  // LAYER 4: POPULATION
  // ════════════════════════════════════════════════════
  function validateLayer4() {
    sep('LAYER 4: POPULATION VALIDATION');
    const tenantId = getTenantId();
    const aggregated = getAggregatedData(tenantId);
    const vlResults = getVLResults();

    log('Committed Aggregated Data:');
    log('  Total records: ' + aggregated.length);

    const uniqueEmpIds = new Set(aggregated.map(r => String(r.employeeId || '')));
    log('  Unique employee IDs: ' + uniqueEmpIds.size);

    // Period distribution
    const periodMap = {};
    aggregated.forEach(r => {
      const key = (r.month || '?') + '/' + (r.year || '?');
      periodMap[key] = (periodMap[key] || 0) + 1;
    });
    log('  Periods present:');
    Object.entries(periodMap).sort().forEach(([k, v]) => log('    ' + k + ': ' + v + ' records'));

    // Role distribution
    const roleMap = {};
    aggregated.forEach(r => {
      const role = String(r.role || 'unknown').substring(0, 40);
      roleMap[role] = (roleMap[role] || 0) + 1;
    });
    log('  Role distribution:');
    Object.entries(roleMap).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => log('    ' + k + ': ' + v));

    log('\nCalculation Results (window.__VL_RESULTS):');
    log('  Total results: ' + vlResults.length);

    const resultEmpIds = vlResults.map(r => String(r.employeeId || ''));
    const uniqueResultIds = new Set(resultEmpIds);
    log('  Unique employee IDs: ' + uniqueResultIds.size);

    // Check for duplicates
    const idCounts = {};
    resultEmpIds.forEach(id => { idCounts[id] = (idCounts[id] || 0) + 1; });
    const duplicates = Object.entries(idCounts).filter(([, c]) => c > 1);
    log('  Duplicate employee IDs: ' + duplicates.length);
    if (duplicates.length > 0 && duplicates.length <= 5) {
      duplicates.forEach(([id, c]) => log('    ' + id + ': ' + c + ' times'));
    } else if (duplicates.length > 5) {
      log('    (showing first 5)');
      duplicates.slice(0, 5).forEach(([id, c]) => log('    ' + id + ': ' + c + ' times'));
    }

    // Variant distribution
    const variantMap = {};
    vlResults.forEach(r => {
      const v = r.variantName || r.variantId || 'unknown';
      variantMap[v] = (variantMap[v] || 0) + 1;
    });
    log('  Variant distribution:');
    Object.entries(variantMap).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => log('    ' + k + ': ' + v));

    // Period distribution in results
    const resultPeriodMap = {};
    vlResults.forEach(r => {
      const p = r.period || 'unknown';
      resultPeriodMap[p] = (resultPeriodMap[p] || 0) + 1;
    });
    log('  Period distribution in results:');
    Object.entries(resultPeriodMap).sort().forEach(([k, v]) => log('    ' + k + ': ' + v));

    // Store distribution
    const storeMap = {};
    vlResults.forEach(r => {
      const s = r.storeId || 'unknown';
      storeMap[s] = (storeMap[s] || 0) + 1;
    });
    const storeCounts = Object.values(storeMap).map(Number);
    log('\n  Store distribution:');
    log('    Unique stores: ' + Object.keys(storeMap).length);
    if (storeCounts.length > 0) {
      log('    Employees per store: min=' + Math.min(...storeCounts) +
          ' max=' + Math.max(...storeCounts) +
          ' avg=' + (storeCounts.reduce((a, b) => a + b, 0) / storeCounts.length).toFixed(1));
    }

    // Layer 4 flags
    const layer4 = {
      aggregatedTotal: aggregated.length,
      aggregatedUnique: uniqueEmpIds.size,
      resultsTotal: vlResults.length,
      resultsUnique: uniqueResultIds.size,
      duplicateCount: duplicates.length,
      periods: periodMap,
      resultPeriods: resultPeriodMap
    };

    if (aggregated.length > uniqueEmpIds.size * 1.5) {
      results.flags.push('[L4] MULTI-PERIOD: ' + aggregated.length + ' records for ' + uniqueEmpIds.size + ' unique employees');
    } else {
      results.flags.push('[L4] Aggregated records: ' + aggregated.length + ' for ' + uniqueEmpIds.size + ' unique employees');
    }

    if (vlResults.length > uniqueResultIds.size) {
      results.flags.push('[L4] DUPLICATE RESULTS: ' + vlResults.length + ' results for ' + uniqueResultIds.size + ' unique IDs (' + duplicates.length + ' duplicated)');
    } else {
      results.flags.push('[L4] Results: ' + vlResults.length + ' for ' + uniqueResultIds.size + ' unique IDs (no duplicates)');
    }

    if (vlResults.length !== aggregated.length) {
      results.flags.push('[L4] MISMATCH: ' + vlResults.length + ' results vs ' + aggregated.length + ' aggregated records');
    }

    results.layers.layer4 = layer4;
  }

  // ════════════════════════════════════════════════════
  // LAYER 5: OUTCOME
  // ════════════════════════════════════════════════════
  function validateLayer5() {
    sep('LAYER 5: OUTCOME VALIDATION');
    const vlResults = getVLResults();

    log('window.__VL_RESULTS length: ' + vlResults.length);

    if (vlResults.length === 0) {
      log('ERROR: No results found. Run a calculation first.');
      results.flags.push('[L5] NO RESULTS');
      return;
    }

    // First and last entries
    const first = vlResults[0];
    const last = vlResults[vlResults.length - 1];
    log('First result: id=' + first.employeeId + ' period=' + first.period + ' total=$' + first.totalIncentive);
    log('Last result:  id=' + last.employeeId + ' period=' + last.period + ' total=$' + last.totalIncentive);

    // Check for multiple entries per employee
    const empIdSet = {};
    let multiCount = 0;
    vlResults.forEach(r => {
      const id = String(r.employeeId || '');
      if (empIdSet[id]) multiCount++;
      empIdSet[id] = (empIdSet[id] || 0) + 1;
    });
    log('Employees with multiple entries: ' + multiCount);

    // Aggregate totals by component
    const componentTotals = {};
    vlResults.forEach(r => {
      (r.components || []).forEach(c => {
        const key = c.componentName || c.componentId || 'unknown';
        componentTotals[key] = (componentTotals[key] || 0) + (c.outputValue || 0);
      });
    });

    log('\nComponent Totals (sum across ALL results):');
    Object.entries(componentTotals).forEach(([name, total]) => {
      log('  ' + name + ': $' + total.toLocaleString());
    });

    // Grand total
    const grandTotal = vlResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    log('\nGrand Total: $' + grandTotal.toLocaleString());

    // If multi-period, show per-period totals
    const periodTotals = {};
    vlResults.forEach(r => {
      const p = r.period || 'unknown';
      if (!periodTotals[p]) periodTotals[p] = { count: 0, total: 0, components: {} };
      periodTotals[p].count++;
      periodTotals[p].total += (r.totalIncentive || 0);
      (r.components || []).forEach(c => {
        const key = c.componentName || 'unknown';
        periodTotals[p].components[key] = (periodTotals[p].components[key] || 0) + (c.outputValue || 0);
      });
    });

    if (Object.keys(periodTotals).length > 1) {
      log('\nPer-Period Breakdown:');
      Object.entries(periodTotals).sort().forEach(([period, data]) => {
        log('  Period ' + period + ' (' + data.count + ' employees): $' + data.total.toLocaleString());
        Object.entries(data.components).forEach(([name, total]) => {
          log('    ' + name + ': $' + total.toLocaleString());
        });
      });
      results.flags.push('[L5] MULTI-PERIOD RESULTS: ' + Object.keys(periodTotals).length + ' periods in results');
    }

    // Store results for inspection
    const layer5 = {
      totalResults: vlResults.length,
      grandTotal: grandTotal,
      componentTotals: componentTotals,
      periodTotals: periodTotals,
      multiEntryCount: multiCount
    };

    results.layers.layer5 = layer5;
    results.flags.push('[L5] Grand total: $' + grandTotal.toLocaleString());
    results.flags.push('[L5] Results contain ' + Object.keys(periodTotals).length + ' period(s)');
  }

  // ════════════════════════════════════════════════════
  // RUN ALL LAYERS
  // ════════════════════════════════════════════════════
  try { validateLayer1(); } catch (e) { log('LAYER 1 ERROR: ' + e.message); results.flags.push('[L1] ERROR: ' + e.message); }
  try { validateLayer2(); } catch (e) { log('LAYER 2 ERROR: ' + e.message); results.flags.push('[L2] ERROR: ' + e.message); }
  try { validateLayer3(); } catch (e) { log('LAYER 3 ERROR: ' + e.message); results.flags.push('[L3] ERROR: ' + e.message); }
  try { validateLayer4(); } catch (e) { log('LAYER 4 ERROR: ' + e.message); results.flags.push('[L4] ERROR: ' + e.message); }
  try { validateLayer5(); } catch (e) { log('LAYER 5 ERROR: ' + e.message); results.flags.push('[L5] ERROR: ' + e.message); }

  // ════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════
  sep('FIVE-LAYER VALIDATION SUMMARY');
  log('All flags:');
  results.flags.forEach((f, i) => log('  ' + (i + 1) + '. ' + f));

  // Save to window for further inspection
  window.__VL_FIVE_LAYER = results;
  log('\nFull results saved to window.__VL_FIVE_LAYER');
  log('Inspect with: JSON.stringify(window.__VL_FIVE_LAYER, null, 2)');

})();
