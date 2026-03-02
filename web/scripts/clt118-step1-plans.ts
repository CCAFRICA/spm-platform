/**
 * CLT-118 STEP 1: Import Plan Documents through AI Intelligence Pipeline
 *
 * Sends text descriptions of 4 compensation plans to /api/interpret-plan,
 * then saves via /api/plan/import. Records what the AI produces.
 */
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

function uuidv4() { return crypto.randomUUID(); }

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const BASE_URL = "http://localhost:3000";

// Plan document text content — equivalent to what the AI would extract from PDFs
const PLANS = [
  {
    name: "Consumer Lending Commission",
    fileName: "CFG_Consumer_Lending_Commission_2024.pdf",
    content: `
CONSUMER LENDING COMMISSION PLAN 2024
Mexican Bank Co (Caribe Financial)

PURPOSE
This plan establishes the commission structure for loan officers based on their personal loan disbursement volume.

ELIGIBILITY
All licensed loan officers in the Consumer Lending division.

COMMISSION STRUCTURE
Commission is calculated as a tiered percentage of total loan disbursement amount per month.

TIER TABLE:
- Tier 1: $0 - $499,999 in disbursements → 0.8% commission rate
- Tier 2: $500,000 - $999,999 in disbursements → 1.0% commission rate
- Tier 3: $1,000,000+ in disbursements → 1.2% commission rate

The tier is determined by the officer's total monthly loan disbursement volume. The commission rate applies to the ENTIRE volume (non-marginal).

METRIC
Primary metric: Total Loan Amount disbursed per officer per month.

CLAWBACK PROVISION
Commissions are subject to a 90-day clawback period. If a loan defaults within 90 days of disbursement, the commission on that loan is reversed.

PAYMENT SCHEDULE
Monthly, paid in arrears by the 15th of the following month.

EFFECTIVE PERIOD
January 1, 2024 through December 31, 2024.
`,
  },
  {
    name: "Mortgage Origination Bonus",
    fileName: "CFG_Mortgage_Origination_Bonus_2024.pdf",
    content: `
MORTGAGE ORIGINATION BONUS PLAN 2024
Mexican Bank Co (Caribe Financial)

PURPOSE
Incentivize mortgage loan officers based on closed mortgage volume.

ELIGIBILITY
Mortgage-licensed officers.

BONUS STRUCTURE
Bonus is calculated as a RATE multiplied by the total mortgage closing amount.

RATE TABLE (tiered by quarterly volume):
- Tier 1: $0 - $4,999,999 → 0.2% rate (0.002)
- Tier 2: $5,000,000 - $9,999,999 → 0.3% rate (0.003)
- Tier 3: $10,000,000+ → 0.4% rate (0.004)

IMPORTANT: These are RATES, not flat amounts. The rate is multiplied against the total mortgage closing volume.
The tier lookup is NON-MARGINAL — once you reach a tier, that rate applies to ALL volume.

METRIC
Primary metric: Total Mortgage Closing Amount per officer per quarter.

PAYMENT SCHEDULE
Quarterly, deferred payment with quarterly reconciliation.

EFFECTIVE PERIOD
January 1, 2024 through December 31, 2024.
`,
  },
  {
    name: "Insurance Referral Program",
    fileName: "CFG_Insurance_Referral_Program_2024.xlsx",
    content: `
INSURANCE REFERRAL PROGRAM 2024
Mexican Bank Co (Caribe Financial)

PURPOSE
Reward officers for qualified insurance product referrals.

ELIGIBILITY
All officers with insurance referral license.

FEE SCHEDULE
Each qualified referral earns a flat fee per insurance product type:

1. Term Life Insurance (INS-VIDA): $850 per qualified referral
2. Auto Insurance (INS-AUTO): $450 per qualified referral
3. Home Insurance (INS-HOGAR): $650 per qualified referral
4. Health Insurance (INS-SALUD): $1,200 per qualified referral (cap: 15 referrals per period)
5. SME Business Insurance (INS-PYME): $1,500 per qualified referral (cap: 10 referrals per period)

QUALIFICATION CRITERIA
A referral is "qualified" when the Qualified field = "Yes" in the referral tracking system.

CALCULATION METHOD
For each product type:
  count = number of rows where ProductCode = [product code] AND Qualified = "Yes"
  payout = count × fee per referral

For Health and SME products, a cap applies:
  if count > cap, payout = cap × fee (not count × fee)

METRIC
Derived metrics: Count of qualified referrals per product type from referral data.
Source: Insurance referral transaction data, filtered by ProductCode and Qualified status.

PAYMENT SCHEDULE
Monthly.

EFFECTIVE PERIOD
January 1, 2024 through December 31, 2024.
`,
  },
  {
    name: "Deposit Growth Incentive",
    fileName: "CFG_Deposit_Growth_Incentive_Q1_2024.xlsx",
    content: `
DEPOSIT GROWTH INCENTIVE — Q1 2024
Mexican Bank Co (Caribe Financial)

PURPOSE
Incentivize officers to grow their deposit portfolio.

ELIGIBILITY
All officers with deposit product responsibilities.

INCENTIVE STRUCTURE
Based on attainment ratio: Actual Deposit Growth / Target Deposit Growth

TIER TABLE:
- Below 80% attainment: $0 incentive
- 80% - 99% attainment: $5,000 incentive
- 100% - 119% attainment: $10,000 incentive
- 120%+ attainment: $18,000 incentive

ATTAINMENT CALCULATION
Attainment = (Current Period Balance - Previous Period Balance) / Growth Target × 100%

Each officer has an individual growth target assigned for the quarter.

TARGET DATA (Tab 2 of workbook):
Per-officer quarterly growth targets are provided in a separate data tab.
These targets should be used as the denominator in the attainment calculation.

METRIC
Primary: Attainment ratio (requires both actual deposit growth and individual target)
Source: Deposit balance snapshots (point-in-time) + individual growth targets

PAYMENT SCHEDULE
Quarterly.

EFFECTIVE PERIOD
Q1 2024 (January - March 2024).
`,
  },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await sb.auth.signInWithPassword({
    email: "admin@caribefinancial.mx",
    password: "demo-password-VL1",
  });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const token = data.session!.access_token;
  const refresh = data.session!.refresh_token;

  // Supabase SSR reads cookies: sb-<ref>-auth-token
  // The value is the raw JSON session string (may be chunked)
  const PROJECT_REF = "bayqxeiltnpjrvflksfa";
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000) + 3600,
    provider_token: null,
    provider_refresh_token: null,
    user: data.user,
  });

  // Chunk if needed (Supabase SSR uses 3180 byte chunks)
  const CHUNK_SIZE = 3180;
  const cookies: string[] = [];
  if (sessionJson.length <= CHUNK_SIZE) {
    cookies.push(`${cookieName}=${encodeURIComponent(sessionJson)}`);
  } else {
    const chunks = Math.ceil(sessionJson.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      const chunk = sessionJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      cookies.push(`${cookieName}.${i}=${encodeURIComponent(chunk)}`);
    }
  }

  return {
    "Content-Type": "application/json",
    "Cookie": cookies.join("; "),
  };
}

async function main() {
  console.log("=== CLT-118 STEP 1: Plan Import Through AI Intelligence ===\n");

  const headers = await getAuthHeaders();
  console.log("Authenticated as admin@caribefinancial.mx\n");

  const results: Array<{
    plan: string;
    interpretSuccess: boolean;
    components: Array<{ name: string; type: string; confidence: number }>;
    ruleSetId: string | null;
    saveSuccess: boolean;
    raw: unknown;
  }> = [];

  for (const plan of PLANS) {
    console.log(`\n--- ${plan.name} ---`);

    // Step 1A: Send to AI interpret-plan
    console.log("  Sending to /api/interpret-plan...");
    let interpretation: Record<string, unknown> | null = null;
    let interpretSuccess = false;

    try {
      const resp = await fetch(`${BASE_URL}/api/interpret-plan`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          documentContent: plan.content,
          tenantId: TENANT,
        }),
      });

      const data = await resp.json();
      if (data.success && data.interpretation) {
        interpretation = data.interpretation;
        interpretSuccess = true;
        console.log(`  AI Confidence: ${data.confidence?.toFixed(1)}%`);
        console.log(`  Plan Name: ${(interpretation as Record<string, unknown>).ruleSetName}`);

        const components = (interpretation as Record<string, unknown>).components as Array<Record<string, unknown>> || [];
        console.log(`  Components: ${components.length}`);
        for (const c of components) {
          console.log(`    - ${c.name} (${c.type}) — ${c.calculationMethod || "?"} — conf: ${c.confidence}%`);
          if (c.tierConfig) {
            const tc = c.tierConfig as Record<string, unknown>;
            console.log(`      tierConfig.metric: ${tc.metric}`);
            const tiers = tc.tiers as unknown[] || [];
            console.log(`      tiers: ${tiers.length}`);
            for (const tier of tiers.slice(0, 3) as Record<string, unknown>[]) {
              console.log(`        min:${tier.min} max:${tier.max} value:${tier.value}`);
            }
          }
          if (c.calculationIntent) {
            console.log(`      calculationIntent: ${JSON.stringify(c.calculationIntent).substring(0, 200)}`);
          }
        }
      } else {
        console.log(`  AI FAILED: ${data.error || JSON.stringify(data).substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`  AI ERROR: ${err}`);
    }

    // Step 1B: Save as rule_set via /api/plan/import
    let ruleSetId: string | null = null;
    let saveSuccess = false;

    if (interpretation) {
      ruleSetId = uuidv4();
      console.log(`  Saving as rule_set ${ruleSetId}...`);

      try {
        const resp = await fetch(`${BASE_URL}/api/plan/import`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            planConfig: {
              id: ruleSetId,
              tenantId: TENANT,
              name: (interpretation.ruleSetName as string) || plan.name,
              description: `AI-interpreted from ${plan.fileName}`,
              status: "active",
              version: 1,
              effectiveDate: "2024-01-01",
              endDate: "2024-12-31",
              eligibleRoles: (interpretation.employeeTypes as string[]) || [],
              ruleSetType: "additive_lookup",
              configuration: {
                type: "additive_lookup",
                variants: [{
                  variantId: "default",
                  components: interpretation.components,
                }],
              },
            },
            activate: true,
          }),
        });

        const data = await resp.json();
        if (data.ruleSet) {
          saveSuccess = true;
          console.log(`  Saved: ${data.ruleSet.name} (${data.ruleSet.status})`);
        } else {
          console.log(`  SAVE FAILED: ${data.error || JSON.stringify(data).substring(0, 200)}`);
        }
      } catch (err) {
        console.log(`  SAVE ERROR: ${err}`);
      }
    }

    const components = interpretation?.components
      ? (interpretation.components as Array<Record<string, unknown>>).map(c => ({
          name: String(c.name || ""),
          type: String(c.type || ""),
          confidence: Number(c.confidence || 0),
        }))
      : [];

    results.push({
      plan: plan.name,
      interpretSuccess,
      components,
      ruleSetId,
      saveSuccess,
      raw: interpretation,
    });
  }

  // Summary
  console.log("\n\n=== STEP 1 SUMMARY ===\n");
  console.log("| Plan | AI Interpret | Components | Saved |");
  console.log("|------|-------------|------------|-------|");
  for (const r of results) {
    console.log(`| ${r.plan} | ${r.interpretSuccess ? "OK" : "FAIL"} | ${r.components.length} | ${r.saveSuccess ? "OK" : "FAIL"} |`);
  }

  // Post-import DB check
  console.log("\n--- Post-Plan Import: Database Check ---");
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name, status, input_bindings, components")
    .eq("tenant_id", TENANT)
    .order("name");

  console.log(`\nRule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) {
    const comps = rs.components as Record<string, unknown>;
    const variants = (comps?.variants || []) as Array<Record<string, unknown>>;
    const compCount = variants[0]?.components ? (variants[0].components as unknown[]).length : 0;
    const hasBindings = rs.input_bindings && Object.keys(rs.input_bindings as object).length > 0;
    console.log(`  ${rs.name} (${rs.status})`);
    console.log(`    Components: ${compCount}`);
    console.log(`    input_bindings: ${hasBindings ? JSON.stringify(rs.input_bindings).substring(0, 100) : "EMPTY {}"}`);
  }

  // Write raw results to file for analysis
  const fs = await import("fs");
  fs.writeFileSync("/tmp/clt118-step1-results.json", JSON.stringify(results, null, 2));
  console.log("\nFull results written to /tmp/clt118-step1-results.json");
}

main().catch(console.error);
