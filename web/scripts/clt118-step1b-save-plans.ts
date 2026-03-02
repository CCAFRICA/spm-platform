/**
 * CLT-118 STEP 1B: Save AI-interpreted plans as rule_sets via service role
 * (Bypasses the FK constraint issue with the API route)
 */
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";
import * as fs from "fs";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const AUTH_USER_ID = "5e271084-2300-41d3-82bc-7a8955bc83ca"; // admin@caribefinancial.mx

async function main() {
  console.log("=== CLT-118 STEP 1B: Save AI-Interpreted Plans ===\n");

  // Read the AI interpretation results from Step 1
  const results = JSON.parse(fs.readFileSync("/tmp/clt118-step1-results.json", "utf-8")) as Array<{
    plan: string;
    interpretSuccess: boolean;
    components: unknown[];
    ruleSetId: string | null;
    saveSuccess: boolean;
    raw: Record<string, unknown>;
  }>;

  for (const r of results) {
    if (!r.interpretSuccess || !r.raw) {
      console.log(`  SKIP ${r.plan}: AI interpretation failed`);
      continue;
    }

    const interpretation = r.raw;
    const ruleSetId = crypto.randomUUID();
    const name = (interpretation.ruleSetName as string) || r.plan;

    console.log(`\n--- ${name} ---`);
    console.log(`  ID: ${ruleSetId}`);

    const components = interpretation.components as Array<Record<string, unknown>>;
    console.log(`  Components: ${components.length}`);
    for (const c of components) {
      console.log(`    - ${c.name} (${c.type})`);
      if (c.tierConfig) {
        const tc = c.tierConfig as Record<string, unknown>;
        console.log(`      tierConfig.metric: ${tc.metric}`);
        console.log(`      tiers: ${((tc.tiers as unknown[]) || []).length}`);
        // Show tier details
        for (const tier of ((tc.tiers as Record<string, unknown>[]) || []).slice(0, 4)) {
          console.log(`        min:${tier.min} max:${tier.max} value:${tier.value}`);
        }
      }
      if (c.calculationIntent) {
        console.log(`      calculationIntent: ${JSON.stringify(c.calculationIntent).substring(0, 200)}`);
      }
    }

    // Save to rule_sets table
    const { error } = await sb.from("rule_sets").insert({
      id: ruleSetId,
      tenant_id: TENANT,
      name,
      description: `AI-interpreted from ${r.plan} plan document`,
      status: "active",
      version: 1,
      effective_from: "2024-01-01",
      effective_to: "2024-12-31",
      population_config: { eligible_roles: interpretation.employeeTypes || [] },
      input_bindings: {},  // NOTE: Empty! This is the CLT-118 gap to observe.
      components: {
        type: "additive_lookup",
        variants: [{
          variantId: "default",
          components: interpretation.components,
        }],
      },
      cadence_config: {},
      outcome_config: {},
      metadata: { plan_type: "additive_lookup" },
      created_by: null,
    });

    if (error) {
      console.log(`  SAVE ERROR: ${error.message}`);
    } else {
      console.log(`  SAVED OK`);
    }
  }

  // Post-save check
  console.log("\n\n=== Post-Plan Import: Database Check ===\n");
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name, status, input_bindings, components")
    .eq("tenant_id", TENANT)
    .order("name");

  console.log(`Rule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) {
    const comps = rs.components as Record<string, unknown>;
    const variants = (comps?.variants || []) as Array<Record<string, unknown>>;
    const components = variants[0]?.components ? (variants[0].components as unknown[]) : [];
    const hasBindings = rs.input_bindings && Object.keys(rs.input_bindings as object).length > 0;
    console.log(`\n  ${rs.name} (${rs.status}) — ${rs.id}`);
    console.log(`    Components: ${components.length}`);
    console.log(`    input_bindings: ${hasBindings ? JSON.stringify(rs.input_bindings).substring(0, 100) : "EMPTY {}"}`);

    // Check each component for tierConfig and calculationIntent
    for (const c of components as Record<string, unknown>[]) {
      const hasTier = !!c.tierConfig && Object.keys(c.tierConfig as object).length > 0;
      const hasIntent = !!c.calculationIntent && Object.keys(c.calculationIntent as object).length > 0;
      const tc = c.tierConfig as Record<string, unknown> | null;
      const tierCount = tc?.tiers ? (tc.tiers as unknown[]).length : 0;
      console.log(`    ${c.name}: tierConfig=${hasTier ? `yes(${tierCount} tiers)` : "EMPTY"} | calculationIntent=${hasIntent ? "yes" : "EMPTY"}`);
    }
  }
}

main().catch(console.error);
