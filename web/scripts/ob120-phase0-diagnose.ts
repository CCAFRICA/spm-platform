/**
 * OB-120 Phase 0: Diagnostic — Read actual DB state for MBC tenant
 * Confirms root causes before implementing fixes.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("=== OB-120 PHASE 0 DIAGNOSTIC ===\n");

  // 1. All active rule_sets with component details
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name, components, input_bindings, status")
    .eq("tenant_id", TENANT)
    .eq("status", "active");

  for (const rs of ruleSets || []) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`RULE SET: ${rs.name}`);
    console.log(`ID: ${rs.id}`);
    console.log(`${"=".repeat(60)}`);

    const componentsJson = rs.components as Record<string, unknown>;
    const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
    const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

    console.log(`  Variants: ${variants.length}, Components: ${components.length}`);

    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const name = (comp.name || comp.id || `Component ${i}`) as string;
      const enabled = comp.enabled;
      const compType = comp.componentType as string | undefined;

      // Extract tierConfig.metric
      const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
      const tierMetric = tierConfig?.metric as string | undefined;
      const tiers = tierConfig?.tiers as Array<Record<string, unknown>> | undefined;

      // Extract calculationIntent
      const calcIntent = comp.calculationIntent as Record<string, unknown> | undefined;
      const intentOp = calcIntent?.operation as string | undefined;
      const intentInput = calcIntent?.input as Record<string, unknown> | undefined;
      const intentRate = calcIntent?.rate as Record<string, unknown> | undefined;
      const isMarginal = (calcIntent as any)?.isMarginal;

      // Extract metric from multiple paths
      const intentMetric = intentInput?.sourceSpec as Record<string, unknown> | undefined;
      const calcMethod = comp.calculationMethod as Record<string, unknown> | undefined;

      console.log(`\n  [${i}] "${name}"`);
      console.log(`      type: ${compType}, enabled: ${enabled}`);
      console.log(`      tierConfig.metric: ${tierMetric || "NONE"}`);
      if (tiers) {
        console.log(`      tiers: ${tiers.length} → values: [${tiers.map(t => (t.value ?? t.payout ?? "?")).join(", ")}]`);
        const allRates = tiers.every(t => {
          const v = Number(t.value ?? t.payout ?? 0);
          return v > 0 && v < 1.0;
        });
        console.log(`      allRates < 1.0: ${allRates}`);
      }
      console.log(`      calculationIntent.operation: ${intentOp || "NONE"}`);
      console.log(`      calculationIntent.isMarginal: ${isMarginal}`);
      if (intentOp) {
        console.log(`      intent structure: ${JSON.stringify(calcIntent).substring(0, 400)}`);
      }
      if (intentRate && typeof intentRate === "object") {
        console.log(`      intent.rate.operation: ${(intentRate as any).operation || "scalar"}`);
      }
      if (intentMetric) {
        console.log(`      intent.input.sourceSpec: ${JSON.stringify(intentMetric)}`);
      }
      if (calcMethod) {
        console.log(`      calculationMethod: ${JSON.stringify(calcMethod).substring(0, 200)}`);
      }
    }

    // Current input_bindings
    const bindings = rs.input_bindings as any;
    const derivations = bindings?.metric_derivations || [];
    console.log(`\n  input_bindings: ${derivations.length} derivations`);
    for (const d of derivations) {
      console.log(`    → metric="${d.metric}", op=${d.operation}, source=${d.source_pattern}, field=${d.source_field || "N/A"}, filters=${d.filters?.length || 0}`);
    }
  }

  // 2. Insurance Referral data inventory
  console.log(`\n${"=".repeat(60)}`);
  console.log("INSURANCE REFERRALS DATA INVENTORY");
  console.log(`${"=".repeat(60)}`);

  const { data: insSample } = await sb
    .from("committed_data")
    .select("row_data")
    .eq("tenant_id", TENANT)
    .eq("data_type", "insurance_referrals")
    .limit(5);

  if (insSample?.length) {
    const firstRow = insSample[0].row_data as Record<string, unknown>;
    console.log(`\n  Fields: ${Object.keys(firstRow).filter(k => !k.startsWith("_")).join(", ")}`);
    console.log(`  Sample row: ${JSON.stringify(firstRow).substring(0, 300)}`);

    // Find categorical fields
    const { data: allInsRows } = await sb
      .from("committed_data")
      .select("row_data")
      .eq("tenant_id", TENANT)
      .eq("data_type", "insurance_referrals")
      .limit(200);

    const fieldValues: Record<string, Set<string>> = {};
    for (const row of allInsRows || []) {
      const rd = row.row_data as Record<string, unknown>;
      for (const [key, val] of Object.entries(rd)) {
        if (key.startsWith("_")) continue;
        if (typeof val === "string") {
          if (!fieldValues[key]) fieldValues[key] = new Set();
          fieldValues[key].add(val);
        }
      }
    }

    console.log(`\n  Categorical fields (string values):`);
    for (const [field, values] of Object.entries(fieldValues)) {
      if (values.size <= 20) {
        console.log(`    ${field}: [${Array.from(values).join(", ")}] (${values.size} distinct)`);
      }
    }
  } else {
    console.log("  No insurance_referrals rows found");
  }

  // 3. Loan disbursements sample
  console.log(`\n${"=".repeat(60)}`);
  console.log("LOAN DISBURSEMENTS DATA SAMPLE");
  console.log(`${"=".repeat(60)}`);

  const { data: loanSample } = await sb
    .from("committed_data")
    .select("row_data, entity_id")
    .eq("tenant_id", TENANT)
    .eq("data_type", "loan_disbursements")
    .limit(3);

  if (loanSample?.length) {
    const firstRow = loanSample[0].row_data as Record<string, unknown>;
    console.log(`  Fields: ${Object.keys(firstRow).filter(k => !k.startsWith("_")).join(", ")}`);
    for (const row of loanSample) {
      const rd = row.row_data as Record<string, unknown>;
      const numericFields = Object.entries(rd)
        .filter(([k, v]) => !k.startsWith("_") && typeof v === "number")
        .map(([k, v]) => `${k}=${v}`);
      console.log(`  entity=${row.entity_id?.substring(0, 8)}: ${numericFields.join(", ")}`);
    }
  }

  // 4. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("DIAGNOSTIC SUMMARY");
  console.log(`${"=".repeat(60)}`);

  const consumerLending = (ruleSets || []).find(rs => rs.name.includes("Consumer Lending"));
  if (consumerLending) {
    const clComponents = ((consumerLending.components as any)?.variants?.[0]?.components ?? []) as Array<Record<string, unknown>>;
    const firstComp = clComponents[0];
    const tierMetric = (firstComp?.tierConfig as any)?.metric;
    const derivMetric = ((consumerLending.input_bindings as any)?.metric_derivations?.[0])?.metric;

    console.log(`\n  Consumer Lending:`);
    console.log(`    tierConfig.metric = "${tierMetric}"`);
    console.log(`    derivation.metric = "${derivMetric}"`);
    console.log(`    MATCH: ${tierMetric === derivMetric ? "YES ✓" : `NO ✗ — THIS IS THE BUG`}`);

    const intentOp = (firstComp?.calculationIntent as any)?.operation;
    const intentIsMarginal = (firstComp?.calculationIntent as any)?.isMarginal;
    console.log(`    calculationIntent.operation = "${intentOp}"`);
    console.log(`    calculationIntent.isMarginal = ${intentIsMarginal}`);
    if (intentOp === "bounded_lookup_1d" && !intentIsMarginal) {
      console.log(`    → FLAT bounded_lookup_1d WITHOUT isMarginal — returns raw rate`);
    }
    if (intentOp === "scalar_multiply") {
      console.log(`    → NESTED scalar_multiply — should work if metric resolves`);
    }
  }
}

main().catch(console.error);
