import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Check outcomes by period
  const { data: epo } = await sb
    .from("entity_period_outcomes")
    .select("period_id, rule_set_id, final_payout")
    .eq("tenant_id", T);

  if (epo?.length) {
    const pids = Array.from(new Set(epo.map(r => r.period_id)));
    const rsids = Array.from(new Set(epo.map(r => r.rule_set_id)));
    const { data: periods } = await sb.from("periods").select("id, label").in("id", pids);
    const { data: ruleSets } = await sb.from("rule_sets").select("id, name").in("id", rsids);
    const pMap = Object.fromEntries((periods || []).map(p => [p.id, p.label]));
    const rsMap = Object.fromEntries((ruleSets || []).map(r => [r.id, r.name]));

    const groups: Record<string, { count: number; total: number }> = {};
    for (const r of epo) {
      const key = `${pMap[r.period_id] || r.period_id.substring(0, 8)} / ${rsMap[r.rule_set_id] || r.rule_set_id.substring(0, 8)}`;
      if (!groups[key]) groups[key] = { count: 0, total: 0 };
      groups[key].count++;
      groups[key].total += Number(r.final_payout) || 0;
    }

    console.log("EXISTING entity_period_outcomes:");
    for (const [k, v] of Object.entries(groups)) {
      console.log(`  ${k} → ${v.count} entities, total: $${v.total.toFixed(2)}`);
    }
  } else {
    console.log("No entity_period_outcomes");
  }

  // Check the calc API response for Consumer Lending / March 2024
  console.log("\nCalc API test (Consumer Lending / March 2024):");
  try {
    const resp = await fetch("http://localhost:3000/api/calculation/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: T,
        periodId: "cca258aa-5620-4b6b-884e-7573df635785",
        ruleSetId: "04cb665c-fc92-4634-9177-87520be5f217",
      }),
    });
    const result = await resp.json();
    console.log(`  Status: ${resp.status}`);
    console.log(`  Response: ${JSON.stringify(result).substring(0, 600)}`);
  } catch (err) {
    console.error("  Fetch failed:", err);
  }

  // Also check what rule_set_assignments look like
  console.log("\nRule set assignments:");
  const { data: rsa } = await sb
    .from("rule_set_assignments")
    .select("entity_id, rule_set_id")
    .eq("tenant_id", T)
    .limit(10);
  if (rsa?.length) {
    const rsids = Array.from(new Set(rsa.map(r => r.rule_set_id)));
    const { data: rsNames } = await sb.from("rule_sets").select("id, name").in("id", rsids);
    const rsMap = Object.fromEntries((rsNames || []).map(r => [r.id, r.name]));
    const counts: Record<string, number> = {};
    for (const r of rsa) {
      const name = rsMap[r.rule_set_id] || r.rule_set_id.substring(0, 8);
      counts[name] = (counts[name] || 0) + 1;
    }
    console.log("  Assignment counts:", counts);
  }
}

main().catch(console.error);
