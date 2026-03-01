/**
 * HF-083 Phase 0: Diagnostic — Identify junk data from DG import #eae63444
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf083-phase0-diagnostic.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-083 PHASE 0: DG JUNK DATA DIAGNOSTIC           ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Step 0.1: Find import batch matching #eae63444
  console.log("═══ STEP 0.1: FIND IMPORT BATCH ═══");
  const { data: batches } = await sb.from("import_batches")
    .select("id, status, file_name, created_at, metadata")
    .eq("tenant_id", LAB)
    .like("id", "eae63444%");

  if (!batches || batches.length === 0) {
    console.log("No import_batches matching eae63444%. Trying broader search...");
    const { data: allBatches } = await sb.from("import_batches")
      .select("id, status, file_name, created_at")
      .eq("tenant_id", LAB)
      .order("created_at", { ascending: false })
      .limit(10);
    console.log("Recent LAB import batches:");
    for (const b of allBatches || []) {
      console.log(`  ${b.id.slice(0, 8)} | ${b.file_name || "?"} | ${b.status} | ${b.created_at}`);
    }
  } else {
    for (const b of batches) {
      console.log(`  Batch: ${b.id}`);
      console.log(`  File: ${(b as Record<string, unknown>).file_name || "?"}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Created: ${b.created_at}`);
    }
  }

  // Step 0.2: Query committed_data for this import
  console.log("\n═══ STEP 0.2: COMMITTED DATA FROM IMPORT ═══");
  const { data: importRows } = await sb.from("committed_data")
    .select("id, data_type, row_data, metadata, entity_id, period_id, import_batch_id")
    .eq("tenant_id", LAB)
    .like("import_batch_id", "eae63444%");

  if (!importRows || importRows.length === 0) {
    console.log("No committed_data rows with import_batch_id matching eae63444%");
    console.log("Searching for deposit_growth data types...");
    const { data: dgRows } = await sb.from("committed_data")
      .select("id, data_type, row_data, metadata, import_batch_id, created_at")
      .eq("tenant_id", LAB)
      .ilike("data_type", "%deposit_growth__%")
      .limit(50);
    if (dgRows && dgRows.length > 0) {
      console.log(`Found ${dgRows.length} rows with deposit_growth__ data_types:`);
      const byType: Record<string, number> = {};
      const byBatch: Record<string, number> = {};
      for (const r of dgRows) {
        byType[r.data_type] = (byType[r.data_type] || 0) + 1;
        byBatch[r.import_batch_id || "null"] = (byBatch[r.import_batch_id || "null"] || 0) + 1;
      }
      for (const [t, c] of Object.entries(byType)) console.log(`  ${t}: ${c} rows`);
      console.log("By import_batch_id:");
      for (const [b, c] of Object.entries(byBatch)) console.log(`  ${b.slice(0, 8)}: ${c} rows`);
    }
  } else {
    console.log(`Found ${importRows.length} rows from import #eae63444`);
    const byType: Record<string, { count: number; rows: typeof importRows }> = {};
    for (const r of importRows) {
      if (!byType[r.data_type]) byType[r.data_type] = { count: 0, rows: [] };
      byType[r.data_type].count++;
      byType[r.data_type].rows.push(r);
    }

    for (const [dtype, info] of Object.entries(byType)) {
      console.log(`\n  data_type: ${dtype} (${info.count} rows)`);
      // Show field names from first row
      const sampleRow = info.rows[0]?.row_data as Record<string, unknown>;
      if (sampleRow) {
        const fields = Object.keys(sampleRow).filter(k => !k.startsWith("_"));
        console.log(`  Fields: ${fields.join(", ")}`);
      }
      // Show first 3 rows
      for (const r of info.rows.slice(0, 3)) {
        const rd = r.row_data as Record<string, unknown>;
        const preview = JSON.stringify(rd).slice(0, 200);
        console.log(`    Row ${r.id.slice(0, 8)}: ${preview}`);
      }
      if (info.rows.length > 3) console.log(`    ... and ${info.rows.length - 3} more rows`);
    }
  }

  // Step 0.3: Identify junk rows specifically
  console.log("\n═══ STEP 0.3: IDENTIFY JUNK ROWS ═══");
  // Search for __EMPTY fields or plan rule text in ALL recent DG-related committed_data
  const PAGE = 1000;
  let offset = 0;
  let allDgData: Array<Record<string, unknown>> = [];
  while (true) {
    const { data: page } = await sb.from("committed_data")
      .select("id, data_type, row_data, import_batch_id, entity_id, period_id, created_at")
      .eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    // Filter for rows with __EMPTY or plan-rule-like content
    for (const r of page) {
      const rdStr = JSON.stringify(r.row_data);
      if (rdStr.includes("__EMPTY") || rdStr.includes("ATTAINMENT") || rdStr.includes("CARIBE FINANCIAL GROUP")) {
        allDgData.push(r as Record<string, unknown>);
      }
    }
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Found ${allDgData.length} rows with junk indicators (__EMPTY, ATTAINMENT, CARIBE)`);
  for (const r of allDgData.slice(0, 5)) {
    const preview = JSON.stringify(r.row_data).slice(0, 200);
    console.log(`  ${(r.id as string).slice(0, 8)} | ${r.data_type} | batch:${((r.import_batch_id as string) || "null").slice(0, 8)} | ${preview}`);
  }
  if (allDgData.length > 5) console.log(`  ... and ${allDgData.length - 5} more`);

  // Step 0.4: Verify existing DG data (deposit_balances)
  console.log("\n═══ STEP 0.4: ALL DEPOSIT-RELATED DATA ═══");
  offset = 0;
  const allTypeCount: Record<string, number> = {};
  let totalRows = 0;
  while (true) {
    const { data: page } = await sb.from("committed_data")
      .select("data_type")
      .eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const r of page) allTypeCount[r.data_type] = (allTypeCount[r.data_type] || 0) + 1;
    totalRows += page.length;
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  console.log("All data_types in LAB:");
  for (const [t, c] of Object.entries(allTypeCount).sort()) {
    const marker = t.toLowerCase().includes("deposit") ? " ← DEPOSIT" : "";
    console.log(`  ${t}: ${c} rows${marker}`);
  }
  console.log(`Total: ${totalRows} rows (OB-126 baseline: 1588)`);

  // Step 0.5: Current DG calculation results
  console.log("\n═══ STEP 0.5: CURRENT DG CALCULATION RESULTS ═══");
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const dgPlan = (rsMap || []).find(rs => rs.name.toLowerCase().includes("deposit growth"));
  if (dgPlan) {
    console.log("DG plan:", dgPlan.name, "|", dgPlan.id.slice(0, 8));
    const { data: dgResults } = await sb.from("calculation_results")
      .select("entity_id, period_id, total_payout")
      .eq("tenant_id", LAB)
      .eq("rule_set_id", dgPlan.id);
    const payouts = (dgResults || []).map(r => Number(r.total_payout) || 0);
    const total = payouts.reduce((s, v) => s + v, 0);
    const unique = new Set(payouts);
    console.log("Results:", dgResults?.length, "(expected 48)");
    console.log("Total: $" + total.toFixed(2), "(expected $1,440,000)");
    console.log("Unique payout values:", Array.from(unique).map(v => "$" + v.toFixed(2)).join(", "));
    console.log("Uniform:", unique.size === 1 ? "YES — all $" + payouts[0]?.toFixed(2) : "NO — variable payouts");
  } else {
    console.log("ERROR: No DG plan found");
  }

  // Step 0.6: DG input_bindings (derivations referencing deposit data)
  console.log("\n═══ STEP 0.6: DG INPUT BINDINGS ═══");
  if (dgPlan) {
    const { data: fullRs } = await sb.from("rule_sets")
      .select("input_bindings, components")
      .eq("id", dgPlan.id).single();
    const bindings = (fullRs?.input_bindings as Record<string, unknown>) || {};
    const derivations = (bindings.metric_derivations as Array<Record<string, unknown>>) || [];
    console.log("Derivations:", derivations.length);
    for (const d of derivations) {
      console.log(`  ${d.metricName || d.metric} → ${d.operation} on ${d.source_pattern} .${d.source_field || "?"}`);
    }
    // Check if any derivation references the new target data type
    const targetTypes = Object.keys(allTypeCount).filter(k => k.includes("deposit_growth__"));
    if (targetTypes.length > 0) {
      console.log("\nNew deposit_growth__ data types:", targetTypes.join(", "));
      const referencedPatterns = derivations.map(d => String(d.source_pattern));
      for (const t of targetTypes) {
        const referenced = referencedPatterns.some(p => t.includes(p) || p.includes(t));
        console.log(`  ${t}: ${referenced ? "REFERENCED by derivation ✓" : "NOT referenced — engine won't use it"}`);
      }
    }
  }
}

main().catch(console.error);
