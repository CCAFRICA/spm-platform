/**
 * OB-123: End-to-end verification — Wire LAB tenant + MBC regression check
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob123-verify.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB_TENANT = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC_TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const MBC_RULE_SETS = [
  { id: "9ab2c0d1-ced5-4dab-bda1-7de50dbbce94", name: "Consumer Lending Commission" },
  { id: "af511146-604f-4400-ad18-836eb13aace8", name: "Mortgage Origination Bonus" },
  { id: "ecc2507b-8012-49a7-ab3c-83b9ddeaeaec", name: "Deposit Growth Incentive" },
  { id: "574faa83-6f14-4975-baca-36e7e3fd4937", name: "Insurance Referral Program" },
];
const MBC_PERIODS = [
  { id: "251c00c3-0a1d-41c1-8add-d7eafa83a5e9", name: "Jan 2024" },
  { id: "7c23fa1e-2a07-4ebd-bd85-e41c615bd695", name: "Feb 2024" },
  { id: "59a6c2c1-5d94-404a-a355-8760677fcebc", name: "Mar 2024" },
];

const MBC_EXPECTED_GRAND_TOTAL = 3256677.69;

interface ProofGate {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

const gates: ProofGate[] = [];

function gate(id: string, name: string, pass: boolean, detail: string) {
  gates.push({ id, name, status: pass ? "PASS" : "FAIL", detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} ${id}: ${name} — ${detail}`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  OB-123: Data Intelligence Pipeline Verification ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── Part 1: Wire LAB tenant ──
  console.log("=== Part 1: Wire LAB Tenant ===\n");

  console.log("Calling POST /api/intelligence/wire for LAB...");
  let wireReport: Record<string, unknown> | null = null;
  try {
    const resp = await fetch("http://localhost:3000/api/intelligence/wire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: LAB_TENANT }),
    });
    const data = await resp.json();
    gate("PG-02", "Wire API returns 200", resp.status === 200 && data.success, `status=${resp.status}`);
    wireReport = data.report || null;
    if (wireReport) {
      console.log("\n  Wiring Report:");
      const steps = (wireReport.steps || []) as Array<{ step: string; detail: string }>;
      for (const s of steps) {
        console.log(`    ${s.step}: ${s.detail}`);
      }
    }
  } catch (err) {
    gate("PG-02", "Wire API returns 200", false, `Error: ${err}`);
  }

  // ── PG-03: LAB rule_sets all active ──
  console.log("\n--- PG-03: LAB Rule Sets ---");
  const { data: labRuleSets } = await sb
    .from("rule_sets")
    .select("id, name, status")
    .eq("tenant_id", LAB_TENANT);

  const activeCount = (labRuleSets || []).filter(rs => rs.status === "active").length;
  const totalCount = (labRuleSets || []).length;
  gate("PG-03", "LAB rule_sets all active", activeCount > 0 && activeCount === totalCount,
    `${activeCount}/${totalCount} active`);
  for (const rs of labRuleSets || []) {
    console.log(`    ${rs.name}: ${rs.status}`);
  }

  // ── PG-04: LAB data_types normalized ──
  console.log("\n--- PG-04: LAB Data Types ---");
  const { count: prefixedCount } = await sb
    .from("committed_data")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", LAB_TENANT)
    .like("data_type", "component_data:%");

  gate("PG-04", "LAB data_types normalized", (prefixedCount || 0) === 0,
    `${prefixedCount || 0} rows still have component_data: prefix`);

  // Show current data types
  const { data: dtSample } = await sb
    .from("committed_data")
    .select("data_type")
    .eq("tenant_id", LAB_TENANT)
    .not("data_type", "is", null)
    .limit(100);
  const dtSet = new Set((dtSample || []).map(r => r.data_type as string));
  console.log(`    Distinct data_types: ${Array.from(dtSet).join(", ")}`);

  // ── PG-05: LAB entities have metadata ──
  console.log("\n--- PG-05: LAB Entity Metadata ---");
  const { data: labEntities } = await sb
    .from("entities")
    .select("id, external_id, metadata")
    .eq("tenant_id", LAB_TENANT)
    .eq("status", "active")
    .limit(100);

  const enrichedCount = (labEntities || []).filter(e => {
    const meta = e.metadata as Record<string, unknown> | null;
    return meta && Object.keys(meta).length > 0;
  }).length;
  gate("PG-05", "LAB entities have metadata", enrichedCount > 0,
    `${enrichedCount}/${(labEntities || []).length} entities have metadata`);

  // ── PG-06: LAB assignments > 0 ──
  console.log("\n--- PG-06: LAB Assignments ---");
  const { count: assignmentCount } = await sb
    .from("rule_set_assignments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", LAB_TENANT);

  gate("PG-06", "LAB assignments > 0", (assignmentCount || 0) > 0,
    `${assignmentCount || 0} assignments`);

  // ── PG-07: LAB input_bindings non-empty ──
  console.log("\n--- PG-07: LAB Input Bindings ---");
  const activeLabRS = (labRuleSets || []).filter(rs => rs.status === "active");
  let totalDerivations = 0;
  for (const rs of activeLabRS) {
    const { data: rsData } = await sb
      .from("rule_sets")
      .select("input_bindings")
      .eq("id", rs.id)
      .single();
    const bindings = rsData?.input_bindings as Record<string, unknown> | null;
    const derivations = (bindings?.metric_derivations ?? []) as unknown[];
    totalDerivations += derivations.length;
    console.log(`    ${rs.name}: ${derivations.length} derivations`);
  }
  gate("PG-07", "LAB input_bindings non-empty", totalDerivations > 0,
    `${totalDerivations} total derivations`);

  // ── Part 2: Calculate LAB ──
  console.log("\n=== Part 2: Calculate LAB Tenant ===\n");

  // Get LAB periods
  const { data: labPeriods } = await sb
    .from("periods")
    .select("id, canonical_key")
    .eq("tenant_id", LAB_TENANT);

  if (labPeriods && labPeriods.length > 0 && activeLabRS.length > 0) {
    for (const rs of activeLabRS) {
      for (const p of labPeriods) {
        try {
          const resp = await fetch("http://localhost:3000/api/calculation/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: LAB_TENANT, periodId: p.id, ruleSetId: rs.id }),
          });
          const data = await resp.json();
          if (data.success) {
            console.log(`  OK ${rs.name} | ${p.canonical_key}: $${(data.totalPayout || 0).toLocaleString()} (${data.entityCount || 0} entities)`);
          } else {
            console.log(`  FAIL ${rs.name} | ${p.canonical_key}: ${data.error}`);
          }
        } catch (err) {
          console.log(`  FAIL ${rs.name} | ${p.canonical_key}: ${err}`);
        }
      }
    }
  } else {
    console.log("  SKIP: No periods or active rule sets for LAB");
  }

  // ── PG-08: LAB calculation results > 0 ──
  console.log("\n--- PG-08: LAB Calculation Results ---");
  const { count: labResultCount } = await sb
    .from("calculation_results")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", LAB_TENANT);

  const { data: labTotals } = await sb
    .from("calculation_results")
    .select("total_payout")
    .eq("tenant_id", LAB_TENANT);

  const labGrandTotal = (labTotals || []).reduce((s, r) => s + (r.total_payout || 0), 0);
  gate("PG-08", "LAB calculation results > 0", (labResultCount || 0) > 0,
    `${labResultCount || 0} results, grand total: $${labGrandTotal.toLocaleString()}`);

  // ── Part 3: MBC Regression Check ──
  console.log("\n=== Part 3: MBC Regression Check ===\n");

  // Clear old MBC results and re-run
  await sb.from("calculation_results").delete().eq("tenant_id", MBC_TENANT);
  await sb.from("calculation_batches").delete().eq("tenant_id", MBC_TENANT);
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", MBC_TENANT);
  console.log("Cleared MBC calculation results");

  let mbcGrandTotal = 0;
  for (const rs of MBC_RULE_SETS) {
    for (const p of MBC_PERIODS) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: MBC_TENANT, periodId: p.id, ruleSetId: rs.id }),
        });
        const data = await resp.json();
        if (data.success) {
          mbcGrandTotal += data.totalPayout || 0;
          console.log(`  OK ${rs.name} | ${p.name}: $${(data.totalPayout || 0).toLocaleString()} (${data.entityCount || 0} entities)`);
        } else {
          console.log(`  FAIL ${rs.name} | ${p.name}: ${data.error}`);
        }
      } catch (err) {
        console.log(`  FAIL ${rs.name} | ${p.name}: ${err}`);
      }
    }
  }

  // ── PG-09: MBC regression check ──
  console.log("\n--- PG-09: MBC Regression Check ---");
  const tolerance = 1.0; // $1 tolerance for floating point
  const mbcPass = Math.abs(mbcGrandTotal - MBC_EXPECTED_GRAND_TOTAL) < tolerance;
  gate("PG-09", `MBC grand total = $${MBC_EXPECTED_GRAND_TOTAL.toLocaleString()}`, mbcPass,
    `Actual: $${mbcGrandTotal.toFixed(2)}, diff: $${Math.abs(mbcGrandTotal - MBC_EXPECTED_GRAND_TOTAL).toFixed(2)}`);

  // ── Summary ──
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║         PROOF GATE SUMMARY           ║");
  console.log("╠══════════════════════════════════════╣");
  for (const g of gates) {
    const icon = g.status === "PASS" ? "✓" : g.status === "FAIL" ? "✗" : "—";
    console.log(`║ ${icon} ${g.id}: ${g.name.padEnd(30)} ║`);
  }
  const passCount = gates.filter(g => g.status === "PASS").length;
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║ ${passCount}/${gates.length} gates passed${" ".repeat(22)}║`);
  console.log("╚══════════════════════════════════════╝");
}

main().catch(console.error);
