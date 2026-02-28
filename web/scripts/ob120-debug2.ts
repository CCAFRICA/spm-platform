import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const PERIOD = "cca258aa-5620-4b6b-884e-7573df635785"; // March 2024

const RULE_SETS: Record<string, string> = {
  "Consumer Lending": "04cb665c-fc92-4634-9177-87520be5f217",
  "Insurance Referral": "5a7947f5-d032-40fa-9b26-9ef6f1e44956",
  "Mortgage": "d556a4b2-025e-414d-b5d7-ac6c53bf2713",
  "Deposit Growth": "354a93b1-59c6-4fbd-bf09-71fd7927bd07",
};

async function main() {
  // Run calculations and collect API totals
  console.log("=== Running calculations for all plans ===\n");

  const apiTotals: Record<string, number> = {};

  for (const [name, rsId] of Object.entries(RULE_SETS)) {
    const resp = await fetch("http://localhost:3000/api/calculation/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: T, periodId: PERIOD, ruleSetId: rsId }),
    });

    if (resp.ok) {
      const result = await resp.json();
      apiTotals[name] = result.totalPayout || 0;
      console.log(`${name}: $${(result.totalPayout || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${result.entityCount} entities)`);
    } else {
      const text = await resp.text();
      console.log(`${name}: HTTP ${resp.status} — ${text.substring(0, 200)}`);
      apiTotals[name] = 0;
    }
  }

  // Check calculation_results table
  console.log("\n=== calculation_results by rule_set ===\n");
  for (const [name, rsId] of Object.entries(RULE_SETS)) {
    const { data: results } = await sb
      .from("calculation_results")
      .select("payout_amount, status")
      .eq("tenant_id", T)
      .eq("period_id", PERIOD)
      .eq("rule_set_id", rsId);

    const total = (results || []).reduce((s, r) => s + (Number(r.payout_amount) || 0), 0);
    console.log(`${name}: ${(results || []).length} results, total: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }

  // Grand total from API
  const grandTotal = Object.values(apiTotals).reduce((s, v) => s + v, 0);
  console.log(`\n=== SUMMARY ===`);
  for (const [name, total] of Object.entries(apiTotals)) {
    console.log(`  ${name}: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }
  console.log(`  Grand Total: $${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  // Proof gates
  console.log(`\n=== PROOF GATES ===`);
  console.log(`  PG-02 Consumer Lending > $1M: ${apiTotals["Consumer Lending"] > 1_000_000 ? "PASS" : "FAIL"} ($${apiTotals["Consumer Lending"]?.toLocaleString()})`);
  console.log(`  PG-03 Mortgage > $500K: ${apiTotals["Mortgage"] > 500_000 ? "PASS" : "FAIL"} ($${apiTotals["Mortgage"]?.toLocaleString()})`);
  console.log(`  PG-04 Insurance Referral > $0: ${apiTotals["Insurance Referral"] > 0 ? "PASS" : "FAIL"} ($${apiTotals["Insurance Referral"]?.toLocaleString()})`);
  console.log(`  PG-06 Grand total > $2M: ${grandTotal > 2_000_000 ? "PASS" : "FAIL"} ($${grandTotal.toLocaleString()})`);
}

main().catch(console.error);
