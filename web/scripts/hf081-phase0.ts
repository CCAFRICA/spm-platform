/**
 * HF-081 Phase 0: Diagnostic — current LAB state before fixes
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf081-phase0.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  HF-081 Phase 0: LAB State Diagnostic            ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── 0A: Identify LAB Tenant ──
  console.log("=== 0A: LAB Tenant Identification ===\n");
  const { data: tenants } = await sb.from("tenants").select("id, name").ilike("name", "%latin%");
  let labId = tenants?.[0]?.id;
  let labName = tenants?.[0]?.name;

  if (!labId) {
    const { data: t2 } = await sb.from("tenants").select("id, name").order("created_at", { ascending: false }).limit(5);
    console.log("No 'Latin' match. Recent tenants:", t2?.map(t => `${t.name} (${t.id})`));
    // Try known ID
    labId = "a630404c-0777-4f6d-b760-b8a190ecd63c";
    labName = "(using known ID)";
  }
  console.log("LAB tenant:", labId, labName);

  // ── 0A: Get ALL rule_sets with full input_bindings ──
  console.log("\n=== 0A: Rule Sets with Input Bindings ===\n");
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name, status, input_bindings, components")
    .eq("tenant_id", labId);

  for (const rs of ruleSets || []) {
    console.log("\n════════════════════════════════════════");
    console.log("Plan:", rs.name, "|", rs.status);
    console.log("ID:", rs.id);

    const bindings = (rs.input_bindings || {}) as Record<string, unknown>;
    const derivations = ((bindings.metric_derivations || bindings.derivations || []) as Array<Record<string, unknown>>);

    if (Array.isArray(derivations) && derivations.length > 0) {
      console.log("\nDERIVATIONS:");
      for (const d of derivations) {
        console.log("  metric:", d.metric || d.metric_name);
        console.log("  operation:", d.operation);
        console.log("  source_pattern:", d.source_pattern || d.data_type || "NONE");
        console.log("  source_field:", d.source_field || d.field || "NONE");
        console.log("  filters:", JSON.stringify(d.filters || d.filter || "NONE"));
        console.log("  ---");
      }
    } else {
      console.log("DERIVATIONS: NONE");
      console.log("Top-level binding keys:", Object.keys(bindings));
    }
  }

  // ── 0B: Committed Data Types ──
  console.log("\n\n=== 0B: Committed Data Types ===\n");
  const { data: allData } = await sb.from("committed_data")
    .select("data_type")
    .eq("tenant_id", labId)
    .limit(5000);

  const types: Record<string, number> = {};
  for (const r of allData || []) {
    const dt = r.data_type as string;
    types[dt] = (types[dt] || 0) + 1;
  }
  console.log("Committed data types:");
  for (const [t, c] of Object.entries(types).sort()) {
    console.log("  ", t, ":", c, "rows");
  }

  // ── 0B: Sample fields for mortgage data ──
  console.log("\nMortgage data sample:");
  const { data: mortgageSample } = await sb.from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", labId)
    .or("data_type.ilike.%mortgage%,data_type.ilike.%closing%")
    .limit(3);

  for (const row of mortgageSample || []) {
    const rd = row.row_data as Record<string, unknown>;
    console.log("  type:", row.data_type, "| fields:", Object.keys(rd || {}));
    console.log("  sample:", JSON.stringify(rd));
  }

  // ── 0B: Sample fields for loan disbursement data ──
  console.log("\nLoan disbursement data sample:");
  const { data: loanSample } = await sb.from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", labId)
    .or("data_type.ilike.%loan%,data_type.ilike.%disburs%")
    .limit(3);

  for (const row of loanSample || []) {
    const rd = row.row_data as Record<string, unknown>;
    console.log("  type:", row.data_type, "| fields:", Object.keys(rd || {}));
    console.log("  sample:", JSON.stringify(rd));
  }

  // ── 0B: Sample fields for insurance data ──
  console.log("\nInsurance data sample:");
  const { data: insSample } = await sb.from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", labId)
    .or("data_type.ilike.%insurance%,data_type.ilike.%referral%")
    .limit(3);

  for (const row of insSample || []) {
    const rd = row.row_data as Record<string, unknown>;
    console.log("  type:", row.data_type, "| fields:", Object.keys(rd || {}));
    console.log("  sample:", JSON.stringify(rd));
  }

  // ── 0B: Sample fields for deposit data ──
  console.log("\nDeposit data sample:");
  const { data: depSample } = await sb.from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", labId)
    .or("data_type.ilike.%deposit%,data_type.ilike.%balance%")
    .limit(3);

  for (const row of depSample || []) {
    const rd = row.row_data as Record<string, unknown>;
    console.log("  type:", row.data_type, "| fields:", Object.keys(rd || {}));
    console.log("  sample:", JSON.stringify(rd));
  }

  // ── 0C: Current calculation results ──
  console.log("\n\n=== 0C: Current Calculation Results ===\n");
  const { data: calcResults, count: calcCount } = await sb.from("calculation_results")
    .select("total_payout, rule_set_id", { count: "exact" })
    .eq("tenant_id", labId);

  console.log("Total results:", calcCount);

  // Group by rule_set
  const byRS: Record<string, { count: number; total: number; nonZero: number }> = {};
  for (const r of calcResults || []) {
    const rsId = r.rule_set_id as string;
    if (!byRS[rsId]) byRS[rsId] = { count: 0, total: 0, nonZero: 0 };
    const payout = Number(r.total_payout) || 0;
    byRS[rsId].count++;
    byRS[rsId].total += payout;
    if (payout > 0) byRS[rsId].nonZero++;
  }

  // Map rule_set IDs to names
  for (const [rsId, stats] of Object.entries(byRS)) {
    const rs = (ruleSets || []).find(r => r.id === rsId);
    console.log(`  ${rs?.name || rsId}: ${stats.count} results, ${stats.nonZero} non-zero, total: $${stats.total.toFixed(2)}`);
  }

  const grandTotal = Object.values(byRS).reduce((s, v) => s + v.total, 0);
  console.log(`\nGrand total: $${grandTotal.toFixed(2)}`);
}

main().catch(console.error);
