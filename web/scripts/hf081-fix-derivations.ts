/**
 * HF-081 Phase 1+2: Fix Mortgage source_pattern + Consumer Lending derivation
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf081-fix-derivations.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MORTGAGE_RS = "6a142ac3-790e-41ce-9992-e377ea3fd33b";
const CL_RS = "e2edd6c9-3eef-49a5-a010-59fddff5052d";

async function fixMortgage() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Phase 1: Fix Mortgage Source Pattern (F-02)      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const { data: rs } = await sb.from("rule_sets").select("input_bindings").eq("id", MORTGAGE_RS).single();
  const bindings = (rs?.input_bindings || {}) as Record<string, unknown>;
  const derivations = (bindings.metric_derivations || []) as Array<Record<string, unknown>>;

  console.log("BEFORE:");
  for (const d of derivations) {
    console.log("  metric:", d.metric, "| source_pattern:", d.source_pattern, "| operation:", d.operation, "| source_field:", d.source_field);
  }

  let fixed = 0;
  for (const d of derivations) {
    const sp = d.source_pattern as string;
    if (sp && sp.includes("component_data:")) {
      console.log(`\n  Fixing: "${sp}" -> "mortgage_closings"`);
      d.source_pattern = "mortgage_closings";
      fixed++;
    }
  }

  if (fixed === 0) {
    console.log("ERROR: No unnormalized source_patterns found.");
    return false;
  }

  const { error } = await sb.from("rule_sets").update({ input_bindings: bindings }).eq("id", MORTGAGE_RS);
  if (error) {
    console.error("UPDATE FAILED:", error);
    return false;
  }

  console.log("\nAFTER:");
  for (const d of derivations) {
    console.log("  metric:", d.metric, "| source_pattern:", d.source_pattern, "| operation:", d.operation, "| source_field:", d.source_field);
  }
  console.log(`\nMortgage source_pattern fixed: ${fixed} derivation(s) updated`);
  return true;
}

async function fixConsumerLending() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Phase 2: Fix Consumer Lending Derivation (F-03)  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const { data: rs } = await sb.from("rule_sets").select("input_bindings").eq("id", CL_RS).single();
  const bindings = (rs?.input_bindings || {}) as Record<string, unknown>;
  const derivations = (bindings.metric_derivations || []) as Array<Record<string, unknown>>;

  console.log("BEFORE:");
  for (const d of derivations) {
    console.log("  metric:", d.metric, "| operation:", d.operation, "| source_field:", d.source_field || "NONE", "| filters:", JSON.stringify(d.filters));
  }

  // The amount field in loan_disbursements is "LoanAmount" (confirmed from Phase 0B sample)
  let fixed = 0;
  for (const d of derivations) {
    if (d.operation === "count") {
      console.log(`\n  Fixing: "${d.metric}" count -> sum with source_field: "LoanAmount"`);
      d.operation = "sum";
      d.source_field = "LoanAmount";
      fixed++;
    }
  }

  if (fixed === 0) {
    console.log("WARNING: No count operations found to fix.");
    return false;
  }

  const { error } = await sb.from("rule_sets").update({ input_bindings: bindings }).eq("id", CL_RS);
  if (error) {
    console.error("UPDATE FAILED:", error);
    return false;
  }

  console.log("\nAFTER:");
  for (const d of derivations) {
    console.log("  metric:", d.metric, "| operation:", d.operation, "| source_field:", d.source_field || "NONE", "| filters:", JSON.stringify(d.filters));
  }
  console.log(`\nConsumer Lending derivations fixed: ${fixed} derivation(s) updated`);
  return true;
}

async function verify() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Verification: Both Fixes Applied                ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Verify Mortgage
  const { data: mRS } = await sb.from("rule_sets").select("input_bindings").eq("id", MORTGAGE_RS).single();
  const mBindings = (mRS?.input_bindings || {}) as Record<string, unknown>;
  const mDerivations = (mBindings.metric_derivations || []) as Array<Record<string, unknown>>;

  let mortgagePass = true;
  console.log("Mortgage Origination Bonus:");
  for (const d of mDerivations) {
    const sp = d.source_pattern as string;
    const hasPrefix = sp.includes("component_data:");
    console.log(`  metric: ${d.metric} | source_pattern: ${sp} ${hasPrefix ? "FAIL" : "PASS"}`);
    if (hasPrefix) mortgagePass = false;
  }

  // Verify Consumer Lending
  const { data: cRS } = await sb.from("rule_sets").select("input_bindings").eq("id", CL_RS).single();
  const cBindings = (cRS?.input_bindings || {}) as Record<string, unknown>;
  const cDerivations = (cBindings.metric_derivations || []) as Array<Record<string, unknown>>;

  let clPass = true;
  console.log("\nConsumer Lending Commission:");
  for (const d of cDerivations) {
    const op = d.operation as string;
    const sf = d.source_field as string;
    const isCount = op === "count";
    const hasSF = sf && sf !== "NONE";
    console.log(`  metric: ${d.metric} | operation: ${op} | source_field: ${sf || "NONE"} ${isCount ? "FAIL (still count)" : hasSF ? "PASS" : "FAIL (no source_field)"}`);
    if (isCount || !hasSF) clPass = false;
  }

  console.log(`\nMortgage VERDICT: ${mortgagePass ? "PASS" : "FAIL"}`);
  console.log(`Consumer Lending VERDICT: ${clPass ? "PASS" : "FAIL"}`);
}

async function main() {
  const m = await fixMortgage();
  const c = await fixConsumerLending();
  await verify();

  if (!m || !c) {
    console.error("\nOne or more fixes failed. Check output above.");
    process.exit(1);
  }
}

main().catch(console.error);
