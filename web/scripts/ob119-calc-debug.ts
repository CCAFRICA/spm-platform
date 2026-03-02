/**
 * Debug: What does the calculation engine see?
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Get first entity
  const { data: entities } = await sb.from("entities").select("id, external_id").eq("tenant_id", TENANT).limit(1);
  if (!entities?.length) { console.log("No entities"); return; }
  const entity = entities[0];
  console.log(`Entity: ${entity.external_id} (${entity.id})`);

  // Get periods
  const { data: periods } = await sb.from("periods").select("id, canonical_key").eq("tenant_id", TENANT).order("canonical_key");
  console.log(`Periods: ${periods?.map(p => p.canonical_key).join(", ")}`);

  const periodId = periods?.find(p => p.canonical_key === "2024-01")?.id;
  if (!periodId) { console.log("No 2024-01 period"); return; }

  // Get committed_data for this entity + period
  const { data: rows } = await sb.from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", TENANT)
    .eq("entity_id", entity.id)
    .eq("period_id", periodId);

  console.log(`\nRows for entity ${entity.external_id}, period 2024-01: ${rows?.length}`);

  // Group by data_type
  const byType: Record<string, any[]> = {};
  for (const r of rows || []) {
    if (!byType[r.data_type]) byType[r.data_type] = [];
    byType[r.data_type].push(r.row_data);
  }

  for (const [dt, dtRows] of Object.entries(byType)) {
    console.log(`\n  ${dt}: ${dtRows.length} rows`);
    // Show first row keys and values
    if (dtRows[0]) {
      const keys = Object.keys(dtRows[0]);
      console.log(`    Keys: ${keys.join(", ")}`);
      console.log(`    LoanAmount: ${dtRows[0].LoanAmount}`);
      console.log(`    TotalDepositBalance: ${dtRows[0].TotalDepositBalance}`);
      console.log(`    OriginalAmount: ${dtRows[0].OriginalAmount}`);
    }

    // Sum LoanAmount if it exists
    if (dt === "loan_disbursements") {
      const sum = dtRows.reduce((s: number, r: any) => s + (typeof r.LoanAmount === "number" ? r.LoanAmount : 0), 0);
      console.log(`    SUM(LoanAmount): ${sum.toLocaleString()}`);
    }
  }

  // Check input_bindings
  const { data: rs } = await sb.from("rule_sets").select("name, input_bindings")
    .eq("tenant_id", TENANT).eq("name", "Consumer Lending Commission Plan 2024");
  if (rs?.[0]) {
    console.log(`\ninput_bindings: ${JSON.stringify(rs[0].input_bindings, null, 2)}`);
  }

  // Now simulate what applyMetricDerivations would do
  const bindings = rs?.[0]?.input_bindings as any;
  const derivations = bindings?.metric_derivations || [];
  console.log(`\n=== Simulating applyMetricDerivations ===`);
  for (const rule of derivations) {
    console.log(`Rule: metric=${rule.metric}, op=${rule.operation}, source_pattern=${rule.source_pattern}, source_field=${rule.source_field}`);
    const regex = new RegExp(rule.source_pattern, "i");
    for (const [dt, dtRows] of Object.entries(byType)) {
      if (regex.test(dt)) {
        console.log(`  Matched data_type "${dt}" (${dtRows.length} rows)`);
        let total = 0;
        for (const row of dtRows) {
          const val = row[rule.source_field];
          if (typeof val === "number") total += val;
          else console.log(`  Non-numeric value for ${rule.source_field}: ${val} (${typeof val})`);
        }
        console.log(`  SUM(${rule.source_field}): ${total.toLocaleString()}`);
      }
    }
  }
}

main().catch(console.error);
