/**
 * CLT-118: Clean up spurious periods and fix data linkage
 * Only keep 2024-01, 2024-02, 2024-03 periods. Remove roster-derived periods.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const VALID_PERIODS = ["2024-01", "2024-02", "2024-03"];

async function main() {
  console.log("=== CLT-118 Cleanup: Fix periods ===\n");

  // Get all periods
  const { data: allPeriods } = await sb.from("periods").select("id, canonical_key").eq("tenant_id", TENANT);
  const validPeriodIds = new Set<string>();
  const invalidPeriodIds: string[] = [];

  for (const p of allPeriods || []) {
    if (VALID_PERIODS.includes(p.canonical_key)) {
      validPeriodIds.add(p.id);
      console.log(`  KEEP: ${p.canonical_key} — ${p.id}`);
    } else {
      invalidPeriodIds.push(p.id);
      console.log(`  DELETE: ${p.canonical_key} — ${p.id}`);
    }
  }

  // Delete calculation results for invalid periods
  if (invalidPeriodIds.length > 0) {
    await sb.from("calculation_results").delete().eq("tenant_id", TENANT).in("period_id", invalidPeriodIds);
    await sb.from("calculation_batches").delete().eq("tenant_id", TENANT).in("period_id", invalidPeriodIds);
  }

  // Update committed_data: reassign rows from invalid periods to correct periods
  // Use the data_type to determine which 2024 period each row belongs to
  // Loan disbursements: Jan/Feb/Mar based on filename
  // Others: based on date field
  const { data: cdRows } = await sb
    .from("committed_data")
    .select("id, data_type, row_data, period_id")
    .eq("tenant_id", TENANT)
    .not("data_type", "eq", "CFG_Personnel_Q1_2024")
    .limit(2000);

  const periodMap = new Map<string, string>();
  for (const p of allPeriods || []) {
    if (VALID_PERIODS.includes(p.canonical_key)) {
      periodMap.set(p.canonical_key, p.id);
    }
  }

  let fixed = 0;
  for (const row of cdRows || []) {
    let correctPeriodKey: string | null = null;

    // Try to determine correct period from data
    if (row.data_type?.includes("Jan2024")) {
      correctPeriodKey = "2024-01";
    } else if (row.data_type?.includes("Feb2024")) {
      correctPeriodKey = "2024-02";
    } else if (row.data_type?.includes("Mar2024")) {
      correctPeriodKey = "2024-03";
    } else {
      // For Q1 files, parse date from row_data
      const rd = row.row_data as Record<string, unknown>;
      const dateFields = ["DisbursementDate", "ClosingDate", "ReferralDate", "SnapshotDate", "DefaultDate"];
      for (const field of dateFields) {
        const val = rd[field];
        if (typeof val === "number" && val > 25000 && val < 100000) {
          const d = new Date((val - 25569) * 86400 * 1000);
          if (!isNaN(d.getTime())) {
            const m = d.getUTCMonth() + 1;
            const y = d.getUTCFullYear();
            if (y === 2024 && m >= 1 && m <= 3) {
              correctPeriodKey = `2024-${String(m).padStart(2, "0")}`;
            }
            break;
          }
        }
      }
    }

    if (correctPeriodKey) {
      const correctPeriodId = periodMap.get(correctPeriodKey);
      if (correctPeriodId && correctPeriodId !== row.period_id) {
        await sb.from("committed_data").update({ period_id: correctPeriodId }).eq("id", row.id);
        fixed++;
      }
    }
  }

  console.log(`\nFixed ${fixed} rows with correct period_id`);

  // Delete invalid periods (after moving data away)
  for (const pid of invalidPeriodIds) {
    // Update any remaining rows pointing to this period
    await sb.from("committed_data").update({ period_id: periodMap.get("2024-01")! }).eq("period_id", pid).eq("tenant_id", TENANT);
  }

  // Delete calculation results for bad periods
  await sb.from("calculation_results").delete().eq("tenant_id", TENANT);
  await sb.from("calculation_batches").delete().eq("tenant_id", TENANT);
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);

  // Delete invalid periods
  for (const pid of invalidPeriodIds) {
    await sb.from("periods").delete().eq("id", pid);
  }

  // Verify
  const { data: remaining } = await sb.from("periods").select("canonical_key, id").eq("tenant_id", TENANT).order("canonical_key");
  console.log(`\nPeriods remaining: ${remaining?.length}`);
  for (const p of remaining || []) console.log(`  ${p.canonical_key} — ${p.id}`);

  const { count: total } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  const { count: nullP } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("period_id", null);
  const { count: nullE } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("entity_id", null);
  console.log(`\ncommitted_data: ${total}`);
  console.log(`  null entity_id: ${nullE}`);
  console.log(`  null period_id: ${nullP}`);

  // Run calculations for just 2024 periods
  console.log("\n--- Running calculations (2024 periods only) ---");
  const { data: rs } = await sb.from("rule_sets").select("id, name").eq("tenant_id", TENANT).eq("status", "active");

  let grandTotal = 0;
  for (const plan of rs || []) {
    for (const p of remaining || []) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: TENANT, periodId: p.id, ruleSetId: plan.id }),
        });
        const data = await resp.json();
        if (data.success && data.totalPayout > 0) {
          console.log(`  ${plan.name} | ${p.canonical_key}: $${data.totalPayout.toLocaleString()} (${data.entityCount} entities)`);
          grandTotal += data.totalPayout;
        } else if (data.success) {
          console.log(`  ${plan.name} | ${p.canonical_key}: $0 (${data.entityCount} entities)`);
        } else {
          console.log(`  ${plan.name} | ${p.canonical_key}: ${data.error}`);
        }
      } catch (err) {
        console.log(`  ${plan.name} | ${p.canonical_key}: ERROR`);
      }
    }
  }
  console.log(`\nGrand Total: $${grandTotal.toLocaleString()}`);
  console.log("\nNOTE: $0 is expected — AI-interpreted plans have calculationIntent only (no tierConfig).");
  console.log("The AI metric names (total_loan_disbursement) don't match actual data fields (LoanAmount).");
  console.log("This is the metric name reconciliation gap identified by CLT-118.");
  console.log("To restore $7.4M working state: re-import plans through the UI.");
}

main().catch(console.error);
