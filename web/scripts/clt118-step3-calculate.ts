/**
 * CLT-118 STEP 3: Run Calculations — What Does the Engine Produce?
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("=== CLT-118 STEP 3: Run Calculations ===\n");

  // Get rule sets and periods
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name")
    .eq("tenant_id", TENANT)
    .eq("status", "active")
    .order("name");

  const { data: periods } = await sb
    .from("periods")
    .select("id, canonical_key, label")
    .eq("tenant_id", TENANT)
    .order("canonical_key");

  console.log(`Rule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) console.log(`  ${rs.name} — ${rs.id}`);

  console.log(`\nPeriods: ${periods?.length ?? 0}`);
  for (const p of periods || []) console.log(`  ${p.canonical_key} (${p.label}) — ${p.id}`);

  if (!periods || periods.length === 0) {
    console.log("\n  NO PERIODS — Cannot run calculations.");
    console.log("  ROOT CAUSE: Period detection failed because date fields weren't mapped.");
    console.log("  The data has Excel serial dates (e.g., DisbursementDate=45308 → 2024-01-17)");
    console.log("  but the import pipeline only detects periods from fields mapped to 'year'/'month'/'period' targets.");
    console.log("  OfficerID wasn't recognized as entity_id, so OfficerID→employee_id mapping never happened.");
    console.log("  Without AI field mapping, both entity_id and period_id are NULL for all data rows.");
    console.log("\n  CREATING PERIODS MANUALLY for calculation test...");

    // Create periods so we can at least test the calculation engine
    const MONTH_NAMES = ["", "January", "February", "March"];
    const createdPeriods: Array<{ id: string; key: string }> = [];
    for (let m = 1; m <= 3; m++) {
      const key = `2024-${String(m).padStart(2, "0")}`;
      const lastDay = new Date(2024, m, 0).getDate();
      const { data: p } = await sb.from("periods").insert({
        tenant_id: TENANT,
        canonical_key: key,
        label: `${MONTH_NAMES[m]} 2024`,
        period_type: "monthly",
        start_date: `2024-${String(m).padStart(2, "0")}-01`,
        end_date: `2024-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        status: "open",
        metadata: { year: 2024, month: m },
      }).select("id").single();
      if (p) {
        createdPeriods.push({ id: p.id, key });
        console.log(`  Created: ${key} — ${p.id}`);
      }
    }

    // Now try to run calculations anyway
    // The engine will find committed_data WHERE entity_id matches and period_id matches
    // Since entity_id and period_id are NULL on all data rows, it will find NOTHING
  }

  // Re-fetch periods
  const { data: allPeriods } = await sb
    .from("periods")
    .select("id, canonical_key, label")
    .eq("tenant_id", TENANT)
    .order("canonical_key");

  console.log("\n--- Running Calculations ---");
  const calcResults: Array<{ rs: string; period: string; total: number; entities: number; success: boolean; error?: string }> = [];

  for (const rs of ruleSets || []) {
    for (const p of allPeriods || []) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: TENANT, periodId: p.id, ruleSetId: rs.id }),
        });
        const data = await resp.json();
        if (data.success) {
          calcResults.push({ rs: rs.name, period: p.canonical_key, total: data.totalPayout, entities: data.entityCount, success: true });
          console.log(`  ${rs.name} | ${p.canonical_key}: $${data.totalPayout?.toLocaleString()} (${data.entityCount} entities)`);
        } else {
          calcResults.push({ rs: rs.name, period: p.canonical_key, total: 0, entities: 0, success: false, error: data.error });
          console.log(`  ${rs.name} | ${p.canonical_key}: FAIL — ${data.error}`);
        }
      } catch (err) {
        calcResults.push({ rs: rs.name, period: p.canonical_key, total: 0, entities: 0, success: false, error: String(err) });
        console.log(`  ${rs.name} | ${p.canonical_key}: ERROR — ${err}`);
      }
    }
  }

  // Summary
  console.log("\n\n=== STEP 3 SUMMARY ===\n");
  console.log("| Rule Set | Period | Entities | Payout | Status |");
  console.log("|----------|--------|----------|--------|--------|");

  let grandTotal = 0;
  for (const r of calcResults) {
    const status = r.success ? (r.total > 0 ? "NON-ZERO" : "$0") : `FAIL: ${r.error?.substring(0, 50)}`;
    console.log(`| ${r.rs} | ${r.period} | ${r.entities} | $${r.total.toLocaleString()} | ${status} |`);
    grandTotal += r.total;
  }
  console.log(`\nGrand Total: $${grandTotal.toLocaleString()}`);

  // Check if any calculation_results exist
  const { count: crCount } = await sb.from("calculation_results").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  console.log(`\ncalculation_results rows: ${crCount}`);

  // Root cause analysis
  console.log("\n\n=== ROOT CAUSE ANALYSIS ===\n");

  // Check entity_id/period_id coverage
  const { count: total } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  const { count: nullE } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("entity_id", null);
  const { count: nullP } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("period_id", null);

  console.log(`committed_data: ${total} total rows`);
  console.log(`  null entity_id: ${nullE} (${((nullE || 0) / (total || 1) * 100).toFixed(0)}%)`);
  console.log(`  null period_id: ${nullP} (${((nullP || 0) / (total || 1) * 100).toFixed(0)}%)`);

  console.log("\nThe calculation engine queries committed_data WHERE entity_id = [entity] AND period_id = [period].");
  console.log("Since entity_id and period_id are NULL on 98%+ of rows, no data is found for any entity.");
  console.log("\nCascading failure chain:");
  console.log("  1. OfficerID not in ENTITY_ID_TARGETS → not recognized as entity column");
  console.log("  2. No entity column → no entity linkage (entity_id = NULL)");
  console.log("  3. DisbursementDate not mapped to 'period' target → no period detection");
  console.log("  4. No period detection → period_id = NULL");
  console.log("  5. Engine finds 0 rows for each entity/period combination → $0 for everything");
  console.log("\nWhat's needed (Decision 64 scope):");
  console.log("  A. AI field mapping: OfficerID → employee_id (data-to-entity binding)");
  console.log("  B. AI field mapping: DisbursementDate → period (date-to-period binding)");
  console.log("  C. AI input_bindings: auto-generate from plan + data schema analysis");
  console.log("  D. Metric derivation rules: auto-generate (OB-118 manually wired these)");
  console.log("  E. Semantic data_type: AI-assigned, matches SHEET_COMPONENT_PATTERNS or input_bindings");
}

main().catch(console.error);
