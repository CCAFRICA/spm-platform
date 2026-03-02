/**
 * OB-118: Write metric_derivations rules to Insurance Referral rule_set.input_bindings
 *
 * These rules tell the engine HOW to derive numeric metrics from categorical data.
 * Domain-agnostic structure: any field names, any values, any language.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INSURANCE_RS = "574faa83-6f14-4975-baca-36e7e3fd4937";

async function main() {
  // The metric_derivations array: each entry defines how to derive one numeric metric
  // from committed_data rows via count + filter conditions.
  //
  // Schema:
  //   metric: string       — target metric name (what calculationIntent expects)
  //   operation: "count"   — derivation operation (count matching rows)
  //   source_pattern: string — regex pattern to match data_type (which sheet to use)
  //   filters: Array<{field, operator, value}> — conditions rows must match
  //
  // Korean Test: All field names and values come from this config, not from code.
  // If the data had 제품코드: "보험-생명" and 적격: "예", you'd put those here.

  const metricDerivations = [
    {
      metric: "ins_vida_qualified_referrals",
      operation: "count",
      source_pattern: "insurance|referral",
      filters: [
        { field: "ProductCode", operator: "eq", value: "INS-VIDA" },
        { field: "Qualified", operator: "eq", value: "Yes" },
      ],
    },
    {
      metric: "ins_auto_qualified_referrals",
      operation: "count",
      source_pattern: "insurance|referral",
      filters: [
        { field: "ProductCode", operator: "eq", value: "INS-AUTO" },
        { field: "Qualified", operator: "eq", value: "Yes" },
      ],
    },
    {
      metric: "ins_hogar_qualified_referrals",
      operation: "count",
      source_pattern: "insurance|referral",
      filters: [
        { field: "ProductCode", operator: "eq", value: "INS-HOGAR" },
        { field: "Qualified", operator: "eq", value: "Yes" },
      ],
    },
    {
      metric: "ins_salud_qualified_referrals",
      operation: "count",
      source_pattern: "insurance|referral",
      filters: [
        { field: "ProductCode", operator: "eq", value: "INS-SALUD" },
        { field: "Qualified", operator: "eq", value: "Yes" },
      ],
    },
    {
      metric: "ins_pyme_qualified_referrals",
      operation: "count",
      source_pattern: "insurance|referral",
      filters: [
        { field: "ProductCode", operator: "eq", value: "INS-PYME" },
        { field: "Qualified", operator: "eq", value: "Yes" },
      ],
    },
  ];

  const inputBindings = { metric_derivations: metricDerivations };

  const { error } = await sb
    .from("rule_sets")
    .update({ input_bindings: inputBindings })
    .eq("id", INSURANCE_RS);

  if (error) {
    console.error("Failed to update input_bindings:", error);
    return;
  }

  console.log("Updated input_bindings with", metricDerivations.length, "metric_derivations");

  // Verify
  const { data: rs } = await sb
    .from("rule_sets")
    .select("input_bindings")
    .eq("id", INSURANCE_RS)
    .single();

  console.log("\nVerification:");
  console.log(JSON.stringify(rs?.input_bindings, null, 2));
}

main().catch(console.error);
