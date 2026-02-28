/**
 * OB-121 Phase 1: Purge stale results + add unique constraint + re-run calculation
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const RULE_SETS: Record<string, string> = {
  "Consumer Lending": "04cb665c-fc92-4634-9177-87520be5f217",
  "Insurance Referral": "5a7947f5-d032-40fa-9b26-9ef6f1e44956",
  "Mortgage": "d556a4b2-025e-414d-b5d7-ac6c53bf2713",
  "Deposit Growth": "354a93b1-59c6-4fbd-bf09-71fd7927bd07",
};

async function main() {
  console.log("=== OB-121 PHASE 1: PURGE STALE RESULTS ===\n");

  // ── Step 1A: Pre-cleanup count ──
  const { count: preBefore } = await sb
    .from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`Pre-cleanup rows: ${preBefore}`);

  // ── Step 1B: Delete ALL calculation_results for MBC ──
  console.log("\nDeleting all MBC calculation_results...");
  const { error: delErr1 } = await sb
    .from("calculation_results")
    .delete()
    .eq("tenant_id", TENANT);
  if (delErr1) console.error(`  DELETE error: ${delErr1.message}`);

  // Also clean entity_period_outcomes and calculation_batches
  console.log("Deleting MBC entity_period_outcomes...");
  const { error: delErr2 } = await sb
    .from("entity_period_outcomes")
    .delete()
    .eq("tenant_id", TENANT);
  if (delErr2) console.error(`  DELETE error: ${delErr2.message}`);

  // Verify clean
  const { count: postClean } = await sb
    .from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`\nPost-cleanup rows: ${postClean}`);

  // ── Step 1C: Add unique constraint via raw SQL ──
  console.log("\nAdding unique constraint...");
  const { error: constraintErr } = await sb.rpc("exec_sql", {
    sql: `
      ALTER TABLE calculation_results
      DROP CONSTRAINT IF EXISTS calculation_results_unique_entity_period_plan;

      ALTER TABLE calculation_results
      ADD CONSTRAINT calculation_results_unique_entity_period_plan
      UNIQUE (tenant_id, entity_id, period_id, rule_set_id);
    `,
  });

  if (constraintErr) {
    console.warn(`  Constraint via RPC failed: ${constraintErr.message}`);
    console.log("  (Constraint may need to be added via Supabase dashboard or migration)");
  } else {
    console.log("  Unique constraint added successfully");
  }

  // ── Step 1D: Re-run calculation for all plans × all periods ──
  console.log("\n── RE-RUNNING CALCULATION (all plans × all periods) ──\n");

  const { data: periods } = await sb
    .from("periods")
    .select("id, label")
    .eq("tenant_id", TENANT)
    .order("start_date", { ascending: true });

  if (!periods?.length) {
    console.error("No periods found!");
    return;
  }

  const planTotals: Record<string, number> = {};
  const planRows: Record<string, number> = {};

  for (const [planName, rsId] of Object.entries(RULE_SETS)) {
    planTotals[planName] = 0;
    planRows[planName] = 0;

    for (const period of periods) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: TENANT, periodId: period.id, ruleSetId: rsId }),
        });
        if (resp.ok) {
          const result = await resp.json();
          planTotals[planName] += result.totalPayout || 0;
          planRows[planName] += result.entityCount || 0;
          console.log(`  ${planName} × ${period.label}: $${(result.totalPayout || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${result.entityCount || 0} entities)`);
        } else {
          const text = await resp.text();
          console.log(`  ${planName} × ${period.label}: HTTP ${resp.status} — ${text.substring(0, 100)}`);
        }
      } catch (err) {
        console.error(`  ${planName} × ${period.label}: FAILED — ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`  → ${planName} TOTAL: $${planTotals[planName].toLocaleString("en-US", { minimumFractionDigits: 2 })}\n`);
  }

  // ── Step 1E: Verify clean baseline ──
  console.log("\n── POST-CALCULATION VERIFICATION ──\n");

  const { count: postCalcRows } = await sb
    .from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`Total rows after recalculation: ${postCalcRows}`);

  // Duplicate check
  const { data: allResults } = await sb
    .from("calculation_results")
    .select("entity_id, period_id, rule_set_id")
    .eq("tenant_id", TENANT);

  if (allResults) {
    const dupeMap = new Map<string, number>();
    for (const r of allResults) {
      const key = `${r.entity_id}|${r.period_id}|${r.rule_set_id}`;
      dupeMap.set(key, (dupeMap.get(key) || 0) + 1);
    }
    const dupes = Array.from(dupeMap.values()).filter(v => v > 1).length;
    console.log(`Unique combos: ${dupeMap.size}`);
    console.log(`Combos with duplicates: ${dupes}`);
    console.log(`DUPLICATE CHECK: ${dupes === 0 ? "PASS — zero duplicates" : `FAIL — ${dupes} duplicates`}`);
  }

  // Grand total
  const grandTotal = Object.values(planTotals).reduce((s, v) => s + v, 0);

  console.log("\n── CLEAN BASELINE ──\n");
  console.log("| Plan | Total | Rows |");
  console.log("|------|-------|------|");
  for (const [name, total] of Object.entries(planTotals)) {
    console.log(`| ${name} | $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} | ${planRows[name]} |`);
  }
  console.log(`| **Grand Total** | **$${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}** | ${Object.values(planRows).reduce((s, v) => s + v, 0)} |`);

  console.log(`\nPre-cleanup rows: ${preBefore}`);
  console.log(`Post-cleanup rows: ${postCalcRows}`);
  console.log(`Stale rows eliminated: ${(preBefore || 0) - (postCalcRows || 0)}`);
}

main().catch(console.error);
