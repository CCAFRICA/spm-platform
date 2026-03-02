/**
 * Debug: Why aren't input_bindings being generated?
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

// Replicate SHEET_COMPONENT_PATTERNS from metric-resolver
const SHEET_COMPONENT_PATTERNS = [
  {
    sheetPatterns: [/loan.*disbursement/i, /lending/i, /loan_portfolio/i],
    componentPatterns: [/consumer.*lend/i, /loan.*disbursement/i, /lending/i, /portfolio.*growth/i],
  },
  {
    sheetPatterns: [/mortgage/i, /closing/i],
    componentPatterns: [/mortgage/i, /origination/i, /closing/i],
  },
  {
    sheetPatterns: [/referral/i, /insurance/i],
    componentPatterns: [/referral/i, /insurance/i],
  },
  {
    sheetPatterns: [/deposit/i, /balance/i],
    componentPatterns: [/deposit/i, /balance.*growth/i, /savings/i],
  },
];

async function main() {
  const { data: ruleSetsFull } = await sb
    .from("rule_sets")
    .select("id, name, components, input_bindings")
    .eq("tenant_id", TENANT)
    .eq("status", "active");

  const dataTypes = ["loan_disbursements", "mortgage_closings", "insurance_referrals", "deposit_balances", "loan_defaults"];

  for (const rs of ruleSetsFull || []) {
    console.log(`\n=== ${rs.name} ===`);
    const componentsJson = rs.components as Record<string, unknown>;
    const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
    const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

    console.log(`  Variants: ${variants.length}`);
    console.log(`  Components: ${components.length}`);

    if (components.length === 0) {
      // Maybe components is at a different level
      console.log(`  Raw components structure: ${JSON.stringify(componentsJson).substring(0, 300)}`);
    }

    for (const comp of components) {
      const compName = (comp.name || comp.id || "") as string;
      const intent = comp.calculationIntent as Record<string, unknown> | undefined;
      const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
      const intentInput = intent?.input as Record<string, unknown> | undefined;
      const metricName = (tierConfig?.metric || intent?.metric || intentInput?.metric) as string | undefined;

      console.log(`  Component: "${compName}" metric: ${metricName || "NONE"}`);

      // Try matching
      let matchedDT: string | null = null;
      for (const pattern of SHEET_COMPONENT_PATTERNS) {
        const compMatch = pattern.componentPatterns.some(p => p.test(compName));
        if (compMatch) {
          for (const dt of dataTypes) {
            const dtMatch = pattern.sheetPatterns.some(p => p.test(dt));
            if (dtMatch) { matchedDT = dt; break; }
          }
        }
        if (matchedDT) break;
      }
      console.log(`    → Matched data_type: ${matchedDT || "NONE"}`);
    }
  }
}

main().catch(console.error);
