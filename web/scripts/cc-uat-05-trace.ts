/**
 * CC-UAT-05: Post OB-123 Forensic Wiring Trace
 * 8-layer verification that traces individual records through every table.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/cc-uat-05-trace.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Will be populated in Layer 0
let LAB = "";
let MBC = "";

async function layer0() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 0: TENANT DISCOVERY               ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const { data: tenants } = await sb.from("tenants").select("id, name, created_at").order("created_at");
  for (const t of tenants || []) {
    const [entities, ruleSets, assignments, committed, results] = await Promise.all([
      sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", t.id),
      sb.from("rule_sets").select("*", { count: "exact", head: true }).eq("tenant_id", t.id),
      sb.from("rule_set_assignments").select("*", { count: "exact", head: true }).eq("tenant_id", t.id),
      sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", t.id),
      sb.from("calculation_results").select("*", { count: "exact", head: true }).eq("tenant_id", t.id),
    ]);
    console.log(`\nTenant: ${t.name} [${t.id}]`);
    console.log(`  Created: ${t.created_at}`);
    console.log(`  Entities: ${entities.count}`);
    console.log(`  Rule Sets: ${ruleSets.count}`);
    console.log(`  Assignments: ${assignments.count}`);
    console.log(`  Committed Data: ${committed.count}`);
    console.log(`  Calculation Results: ${results.count}`);

    // Identify LAB and MBC
    const name = (t.name || "").toLowerCase();
    if (name.includes("latin") || name.includes("lab") || name.includes("caribe")) {
      LAB = t.id;
    }
    if ((committed.count || 0) > 5000 && (results.count || 0) > 100) {
      MBC = t.id; // tenant with most data is MBC
    }
  }

  // Fallback: LAB is known ID
  if (!LAB) LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
  if (!MBC) MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

  console.log(`\n=== IDENTIFIED ===`);
  console.log(`LAB_TENANT_ID: ${LAB}`);
  console.log(`MBC_TENANT_ID: ${MBC}`);
}

async function layer1() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 1: ENTITY VERIFICATION            ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 1A: ENTITY COUNT ===");
  const { data: entities, count } = await sb.from("entities")
    .select("*", { count: "exact" }).eq("tenant_id", LAB).order("external_id");
  console.log("Total entities:", count);
  console.log("Expected: 25");
  console.log("VERDICT:", count === 25 ? "PASS" : "FAIL — count mismatch");

  console.log("\n=== LAYER 1B: ENTITY DETAIL (first 10) ===");
  for (const e of (entities || []).slice(0, 10)) {
    console.log(`  ${e.external_id} | ${e.display_name || "NO NAME"} | metadata: ${JSON.stringify(e.metadata)}`);
  }

  console.log("\n=== LAYER 1C: ENTITY METADATA QUALITY ===");
  let hasName = 0, hasRole = 0, hasLicenses = 0;
  const licenseCounts: Record<string, number> = {};
  for (const e of entities || []) {
    if (e.display_name && e.display_name !== "Unknown" && e.display_name !== "") hasName++;
    const m = (e.metadata || {}) as Record<string, unknown>;
    if (m.role || m.Role) hasRole++;
    const licenses = m.licenses || m.product_licenses || m.ProductLicenses;
    if (licenses) {
      hasLicenses++;
      const licArray = Array.isArray(licenses) ? licenses : String(licenses).split(",").map(s => s.trim());
      for (const lic of licArray) {
        licenseCounts[lic] = (licenseCounts[lic] || 0) + 1;
      }
    }
  }
  console.log(`  Has name:     ${hasName}/${count}`);
  console.log(`  Has role:     ${hasRole}/${count}`);
  console.log(`  Has licenses: ${hasLicenses}/${count} (${hasLicenses === count ? "PASS" : "FAIL — license metadata critical for assignments"})`);
  console.log("  License distribution:", licenseCounts);

  console.log("\n=== LAYER 1D: SPECIFIC ENTITY TRACE — Officer 1001 ===");
  const officer1001 = entities?.find(e => String(e.external_id) === "1001");
  if (officer1001) {
    console.log("  Found:", JSON.stringify(officer1001, null, 2));
  } else {
    console.log("  NOT FOUND — checking available external_ids:");
    console.log("  ", entities?.slice(0, 5).map(e => e.external_id));
  }

  console.log("\n=== LAYER 1E: DEDUPLICATION CHECK ===");
  const extIds = entities?.map(e => e.external_id) || [];
  const uniqueIds = new Set(extIds);
  console.log(`  Unique external_ids: ${uniqueIds.size}`);
  console.log(`  Total entities: ${extIds.length}`);
  console.log(`  VERDICT: ${uniqueIds.size === extIds.length ? "PASS — no duplicates" : "FAIL — duplicates exist"}`);
}

async function layer2() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 2: RULE SET VERIFICATION           ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 2A: ALL RULE SETS FOR LAB ===");
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name, status, created_at, components, input_bindings")
    .eq("tenant_id", LAB).order("name");

  for (const rs of ruleSets || []) {
    console.log(`\n  Plan: ${rs.name}`);
    console.log(`    ID: ${rs.id}`);
    console.log(`    Status: ${rs.status}`);

    const config = rs.components as Record<string, unknown> | null;
    const variants = ((config?.variants || []) as Array<Record<string, unknown>>);
    const comps = (variants[0]?.components || []) as Array<Record<string, unknown>>;
    console.log(`    Components: ${comps.length}`);
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      const intent = c.calculationIntent as Record<string, unknown> | undefined;
      console.log(`      [${i}]: ${c.name || "UNNAMED"} | op: ${intent?.operation || "NONE"}`);
    }

    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = ((bindings?.metric_derivations || []) as unknown[]);
    console.log(`    Input Bindings: ${derivations.length} derivations`);
    for (const d of derivations.slice(0, 5)) {
      console.log(`      ${JSON.stringify(d)}`);
    }
  }

  console.log("\n=== LAYER 2B: PLAN COUNT VERDICT ===");
  const activeCount = ruleSets?.filter(rs => rs.status === "active").length || 0;
  console.log(`  Active plans: ${activeCount}`);
  console.log(`  Expected: 4`);
  console.log(`  VERDICT: ${activeCount === 4 ? "PASS" : "FAIL"}`);

  console.log("\n=== LAYER 2C: INPUT BINDINGS VERDICT ===");
  for (const rs of ruleSets || []) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = ((bindings?.metric_derivations || []) as unknown[]);
    console.log(`  ${rs.name}: ${derivations.length > 0 ? derivations.length + " derivations" : "EMPTY"}`);
  }
}

async function layer3() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 3: ASSIGNMENT VERIFICATION         ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 3A: TOTAL ASSIGNMENTS ===");
  const { count } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  console.log("Total assignments:", count);

  // Fetch assignments with entity + rule_set info
  const { data: assignments } = await sb.from("rule_set_assignments")
    .select("entity_id, rule_set_id").eq("tenant_id", LAB);

  // Fetch entities and rule_sets separately to join
  const { data: entities } = await sb.from("entities")
    .select("id, external_id, metadata").eq("tenant_id", LAB);
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB);

  const entityMap = new Map((entities || []).map(e => [e.id, e]));
  const rsMap = new Map((ruleSets || []).map(r => [r.id, r]));

  console.log("\n=== LAYER 3B: ASSIGNMENTS PER PLAN ===");
  const byPlan: Record<string, number> = {};
  for (const a of assignments || []) {
    const planName = rsMap.get(a.rule_set_id)?.name || "UNKNOWN";
    byPlan[planName] = (byPlan[planName] || 0) + 1;
  }
  for (const [plan, planCount] of Object.entries(byPlan).sort()) {
    console.log(`  ${plan}: ${planCount} entities assigned`);
  }

  console.log("\n=== LAYER 3C: FULL-COVERAGE FALLBACK CHECK ===");
  const allPlansPerEntity: Record<string, string[]> = {};
  for (const a of assignments || []) {
    const extId = entityMap.get(a.entity_id)?.external_id || "UNKNOWN";
    const plan = rsMap.get(a.rule_set_id)?.name || "UNKNOWN";
    if (!allPlansPerEntity[extId]) allPlansPerEntity[extId] = [];
    allPlansPerEntity[extId].push(plan);
  }

  const planCounts = Object.values(allPlansPerEntity).map(plans => plans.length);
  const uniquePlanCounts = new Set(planCounts);
  const planNames = Object.keys(byPlan);

  if (uniquePlanCounts.size === 1 && planCounts[0] === planNames.length) {
    console.log(`  FULL-COVERAGE FALLBACK DETECTED: Every entity assigned to all ${planCounts[0]} plans`);
    console.log("  This means license-based mapping FAILED and fallback was used.");
    console.log("  VERDICT: FAIL — assignments are functionally wrong even though rows exist.");
  } else {
    console.log("  Assignments vary by entity — license-based mapping appears active.");
    const minAssign = Math.min(...planCounts);
    const maxAssign = Math.max(...planCounts);
    console.log(`  Range: ${minAssign} to ${maxAssign} plans per entity`);
    console.log(`  Unique assignment counts: ${Array.from(uniquePlanCounts).sort().join(", ")}`);
  }

  console.log("\n=== LAYER 3D: OFFICER 1001 ASSIGNMENT TRACE ===");
  const entity1001 = entities?.find(e => String(e.external_id) === "1001");
  if (entity1001) {
    const officer1001Assignments = (assignments || []).filter(a => a.entity_id === entity1001.id);
    console.log(`  Officer 1001 assignments: ${officer1001Assignments.length}`);
    for (const a of officer1001Assignments) {
      console.log(`    -> ${rsMap.get(a.rule_set_id)?.name || a.rule_set_id}`);
    }
    const meta = entity1001.metadata as Record<string, unknown>;
    console.log(`  Metadata licenses: ${meta?.product_licenses || "NONE"}`);
  } else {
    console.log("  Officer 1001 not found in entities table");
  }

  console.log("\n=== LAYER 3E: OFFICER WITH FEWER LICENSES ===");
  const fewerAssignment = Object.entries(allPlansPerEntity).find(([_, plans]) => plans.length < planNames.length);
  if (fewerAssignment) {
    console.log(`  Officer ${fewerAssignment[0]}: ${fewerAssignment[1].length} assignments -> ${fewerAssignment[1].join(", ")}`);
    console.log("  This confirms license-based (not full-coverage) assignment.");
  } else {
    console.log("  No officer found with fewer than max assignments.");
    console.log("  This suggests full-coverage fallback was used.");
  }
}

async function layer4() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 4: COMMITTED DATA VERIFICATION     ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 4A: COMMITTED DATA OVERVIEW ===");
  const { count: totalRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  console.log("Total committed_data rows:", totalRows);

  console.log("\n=== LAYER 4B: DATA TYPES ===");
  const { data: dtSample } = await sb.from("committed_data")
    .select("data_type").eq("tenant_id", LAB).limit(1000);
  const typeCount: Record<string, number> = {};
  for (const row of dtSample || []) {
    typeCount[String(row.data_type || "NULL")] = (typeCount[String(row.data_type || "NULL")] || 0) + 1;
  }
  for (const [dt, dtCount] of Object.entries(typeCount).sort()) {
    console.log(`  ${dt}: ${dtCount} rows`);
  }

  console.log("\n=== LAYER 4C: DATA_TYPE NORMALIZATION CHECK ===");
  const rawPrefixed = Object.keys(typeCount).filter(k => k.startsWith("component_data:"));
  if (rawPrefixed.length > 0) {
    console.log(`  UNNORMALIZED data_types found: ${rawPrefixed.join(", ")}`);
    console.log("  VERDICT: FAIL");
  } else {
    console.log("  All data_types normalized (no component_data: prefix).");
    console.log("  VERDICT: PASS");
  }

  console.log("\n=== LAYER 4D: OFFICER 1001 DATA TRACE ===");
  const { data: entity1001 } = await sb.from("entities")
    .select("id").eq("tenant_id", LAB).eq("external_id", "1001").limit(1);
  if (entity1001 && entity1001.length > 0) {
    const entityUuid = entity1001[0].id;
    const { data: dataRows, count: dataCount } = await sb.from("committed_data")
      .select("data_type, row_data, period_id", { count: "exact" })
      .eq("tenant_id", LAB).eq("entity_id", entityUuid).limit(20);
    console.log(`  Rows for Officer 1001 (entity UUID ${entityUuid}): ${dataCount}`);
    for (const row of (dataRows || []).slice(0, 5)) {
      const rd = row.row_data as Record<string, unknown>;
      const keys = Object.keys(rd || {}).slice(0, 6);
      console.log(`    ${row.data_type} | period: ${row.period_id?.slice(0, 8)} | fields: ${keys.join(", ")}`);
    }
  } else {
    console.log("  Officer 1001 entity not found");
  }

  console.log("\n=== LAYER 4E: DEPOSIT GROWTH TAB 2 CHECK ===");
  const depositTypes = Object.keys(typeCount).filter(k =>
    k.toLowerCase().includes("deposit") || k.toLowerCase().includes("growth") || k.toLowerCase().includes("target")
  );
  console.log("  Deposit-related data_types:", depositTypes.length > 0 ? depositTypes : "NONE FOUND");

  // Check for target fields
  const { data: sampleRows } = await sb.from("committed_data")
    .select("data_type, row_data").eq("tenant_id", LAB).limit(200);
  let hasTargetField = false;
  for (const row of sampleRows || []) {
    const rd = row.row_data as Record<string, unknown>;
    if (!rd) continue;
    const keys = Object.keys(rd);
    if (keys.some(k => k.toLowerCase().includes("target") || k.toLowerCase().includes("growth_target"))) {
      hasTargetField = true;
      console.log(`  FOUND target field in ${row.data_type}: ${keys.filter(k => k.toLowerCase().includes("target"))}`);
      break;
    }
  }
  if (!hasTargetField) {
    console.log("  NO TARGET DATA FOUND in committed_data");
    console.log("  VERDICT: KNOWN GAP — multi-tab XLSX not addressed by OB-123");
  }

  console.log("\n=== LAYER 4F: PERIODS ===");
  const { data: periods } = await sb.from("periods")
    .select("*").eq("tenant_id", LAB).order("start_date");
  console.log("  Periods:", periods?.length || 0);
  for (const p of periods || []) {
    console.log(`    ${p.label || "UNLABELED"} (${p.canonical_key}): ${p.start_date} -> ${p.end_date}`);
  }
}

async function layer5() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 5: CALCULATION TRACE               ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 5A: EXISTING CALCULATION RESULTS ===");
  const { count } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  console.log("Total calculation results:", count);

  if (!count || count === 0) {
    console.log("  NO RESULTS — calculation not yet run or produced zero results.");
    console.log("  Checking if prerequisites exist for calculation...");
    const { data: rs } = await sb.from("rule_sets").select("id, name").eq("tenant_id", LAB).eq("status", "active");
    const { data: periods } = await sb.from("periods").select("id, label").eq("tenant_id", LAB);
    const { count: assignCount } = await sb.from("rule_set_assignments")
      .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
    console.log(`  Active plans: ${rs?.length || 0}`);
    console.log(`  Periods: ${periods?.length || 0}`);
    console.log(`  Assignments: ${assignCount || 0}`);
    return;
  }

  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, rule_set_id, total_payout, components, metrics, metadata")
    .eq("tenant_id", LAB);

  const { data: entities } = await sb.from("entities").select("id, external_id").eq("tenant_id", LAB);
  const { data: ruleSets } = await sb.from("rule_sets").select("id, name").eq("tenant_id", LAB);
  const entityMap = new Map((entities || []).map(e => [e.id, e]));
  const rsMap = new Map((ruleSets || []).map(r => [r.id, r]));

  console.log("\n=== LAYER 5B: RESULTS BY PLAN ===");
  const byPlan: Record<string, { count: number; total: number; nonZero: number; min: number; max: number }> = {};
  for (const r of results || []) {
    const planName = rsMap.get(r.rule_set_id)?.name || "UNKNOWN";
    if (!byPlan[planName]) byPlan[planName] = { count: 0, total: 0, nonZero: 0, min: Infinity, max: -Infinity };
    const payout = Number(r.total_payout) || 0;
    byPlan[planName].count++;
    byPlan[planName].total += payout;
    if (payout > 0) byPlan[planName].nonZero++;
    byPlan[planName].min = Math.min(byPlan[planName].min, payout);
    byPlan[planName].max = Math.max(byPlan[planName].max, payout);
  }

  let grandTotal = 0;
  for (const [plan, stats] of Object.entries(byPlan).sort()) {
    grandTotal += stats.total;
    console.log(`  ${plan}:`);
    console.log(`    Results: ${stats.count} | Non-zero: ${stats.nonZero} | Total: $${stats.total.toFixed(2)}`);
    console.log(`    Range: [$${stats.min.toFixed(2)}, $${stats.max.toFixed(2)}]`);
    if (stats.nonZero === 0) console.log(`    ALL ZERO`);
    if (stats.max <= 1 && stats.nonZero > 0) console.log(`    MAX <= $1 — possible rate-not-volume bug`);
  }
  console.log(`\n  GRAND TOTAL: $${grandTotal.toFixed(2)}`);
  console.log(`  Total results: ${(results || []).length}`);

  console.log("\n=== LAYER 5C: OFFICER 1001 CALCULATION TRACE ===");
  const entity1001 = entities?.find(e => String(e.external_id) === "1001");
  if (entity1001) {
    const officer1001Results = (results || []).filter(r => r.entity_id === entity1001.id);
    console.log(`  Officer 1001 results: ${officer1001Results.length}`);
    for (const r of officer1001Results) {
      const planName = rsMap.get(r.rule_set_id)?.name || "UNKNOWN";
      const comps = Array.isArray(r.components) ? r.components : [];
      console.log(`    ${planName}: $${Number(r.total_payout).toFixed(2)}`);
      for (const c of comps as Array<Record<string, unknown>>) {
        console.log(`      ${c.componentName || c.component_name}: payout=$${c.payout || c.outputValue || 0}`);
      }
    }
  } else {
    console.log("  Officer 1001 entity not found");
  }
}

async function layer6() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  CC-UAT-05 LAYER 6: MBC REGRESSION                  ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  console.log("\n=== LAYER 6A: MBC GRAND TOTAL ===");
  const { data: results, count } = await sb.from("calculation_results")
    .select("total_payout, rule_set_id", { count: "exact" }).eq("tenant_id", MBC);

  const grandTotal = (results || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
  console.log(`  Grand total: $${grandTotal.toFixed(2)}`);
  console.log(`  Expected:    $3,245,212.64 (post OB-123 verified baseline)`);
  console.log(`  Delta:       $${Math.abs(grandTotal - 3245212.64).toFixed(2)}`);
  console.log(`  VERDICT:     ${Math.abs(grandTotal - 3245212.64) < 1.0 ? "PASS" : "FAIL — regression detected"}`);

  console.log("\n=== LAYER 6B: MBC RESULT COUNT ===");
  console.log(`  Total results: ${count}`);

  console.log("\n=== LAYER 6C: MBC PER-PLAN TOTALS ===");
  const { data: ruleSets } = await sb.from("rule_sets").select("id, name").eq("tenant_id", MBC);
  const rsMap = new Map((ruleSets || []).map(r => [r.id, r]));
  const byPlan: Record<string, { count: number; total: number }> = {};
  for (const r of results || []) {
    const planName = rsMap.get(r.rule_set_id)?.name || "UNKNOWN";
    if (!byPlan[planName]) byPlan[planName] = { count: 0, total: 0 };
    byPlan[planName].count++;
    byPlan[planName].total += Number(r.total_payout) || 0;
  }
  for (const [plan, stats] of Object.entries(byPlan).sort()) {
    console.log(`  ${plan}: ${stats.count} results, $${stats.total.toFixed(2)}`);
  }

  console.log("\n=== LAYER 6D: MBC ENTITY/ASSIGNMENT/BINDING STATE ===");
  const [entitiesR, assignmentsR, ruleSetsFull] = await Promise.all([
    sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", MBC),
    sb.from("rule_set_assignments").select("*", { count: "exact", head: true }).eq("tenant_id", MBC),
    sb.from("rule_sets").select("name, input_bindings, status").eq("tenant_id", MBC),
  ]);
  console.log(`  Entities: ${entitiesR.count}`);
  console.log(`  Assignments: ${assignmentsR.count}`);
  for (const rs of ruleSetsFull.data || []) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = ((bindings?.metric_derivations || []) as unknown[]);
    console.log(`  ${rs.name} [${rs.status}]: ${derivations.length} derivations`);
  }
}

async function main() {
  await layer0();
  await layer1();
  await layer2();
  await layer3();
  await layer4();
  await layer5();
  await layer6();

  // Layer 7 and 8 are grep/code review — printed as instructions
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  LAYERS 7-8: See grep output below                  ║");
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(console.error);
