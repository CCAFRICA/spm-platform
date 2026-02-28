import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const RULE_SETS: Record<string, string> = {
  "Consumer Lending": "04cb665c-fc92-4634-9177-87520be5f217",
  "Insurance Referral": "5a7947f5-d032-40fa-9b26-9ef6f1e44956",
  "Mortgage": "d556a4b2-025e-414d-b5d7-ac6c53bf2713",
  "Deposit Growth": "354a93b1-59c6-4fbd-bf09-71fd7927bd07",
};

async function main() {
  // Get all periods
  const { data: periods } = await sb
    .from("periods")
    .select("id, label")
    .eq("tenant_id", T)
    .order("start_date", { ascending: true });

  if (!periods?.length) {
    console.log("No periods found");
    return;
  }

  console.log(`=== Running calculations across ${periods.length} periods ===\n`);

  const planTotals: Record<string, number> = {};
  const planEntityCounts: Record<string, number> = {};

  for (const [planName, rsId] of Object.entries(RULE_SETS)) {
    planTotals[planName] = 0;
    planEntityCounts[planName] = 0;

    for (const period of periods) {
      const resp = await fetch("http://localhost:3000/api/calculation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: T, periodId: period.id, ruleSetId: rsId }),
      });

      if (resp.ok) {
        const result = await resp.json();
        const payout = result.totalPayout || 0;
        planTotals[planName] += payout;
        planEntityCounts[planName] += result.entityCount || 0;
        console.log(`  ${planName} / ${period.label}: $${payout.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${result.entityCount} entities)`);
      } else {
        console.log(`  ${planName} / ${period.label}: HTTP ${resp.status}`);
      }
    }

    console.log(`  → ${planName} TOTAL: $${planTotals[planName].toLocaleString("en-US", { minimumFractionDigits: 2 })} (${planEntityCounts[planName]} entity-periods)\n`);
  }

  const grandTotal = Object.values(planTotals).reduce((s, v) => s + v, 0);

  console.log("=".repeat(60));
  console.log("GRAND TOTALS ACROSS ALL PERIODS");
  console.log("=".repeat(60));
  for (const [name, total] of Object.entries(planTotals)) {
    console.log(`  ${name}: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }
  console.log(`  GRAND TOTAL: $${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  console.log("\n=== PROOF GATES ===");
  console.log(`  PG-02 Consumer Lending > $1M: ${planTotals["Consumer Lending"] > 1_000_000 ? "PASS ✓" : "FAIL ✗"} ($${planTotals["Consumer Lending"]?.toLocaleString()})`);
  console.log(`  PG-03 Mortgage > $500K: ${planTotals["Mortgage"] > 500_000 ? "PASS ✓" : "FAIL ✗"} ($${planTotals["Mortgage"]?.toLocaleString()})`);
  console.log(`  PG-04 Insurance Referral > $0: ${planTotals["Insurance Referral"] > 0 ? "PASS ✓" : "FAIL ✗"} ($${planTotals["Insurance Referral"]?.toLocaleString()})`);
  console.log(`  PG-06 Grand total > $2M: ${grandTotal > 2_000_000 ? "PASS ✓" : "FAIL ✗"} ($${grandTotal.toLocaleString()})`);
}

main().catch(console.error);
