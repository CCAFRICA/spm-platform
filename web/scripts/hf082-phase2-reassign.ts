/**
 * HF-082 Phase 2: Delete LAB assignments and re-run via wire API
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf082-phase2-reassign.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-082 Phase 2: Re-run LAB Assignments              ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Step 1: Count before ──
  const { count: before } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB);
  console.log("Assignments before:", before);

  // ── Step 2: Delete all LAB assignments ──
  const { error } = await sb.from("rule_set_assignments").delete().eq("tenant_id", LAB);
  if (error) {
    console.error("DELETE FAILED:", error);
    process.exit(1);
  }

  const { count: after } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB);
  console.log("Assignments after delete:", after, "(should be 0)");

  // ── Step 3: Call wire API to re-create assignments ──
  console.log("\nCalling wire API...\n");

  try {
    const resp = await fetch("http://localhost:3000/api/intelligence/wire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: LAB }),
    });

    const data = await resp.json();
    console.log("Wire API response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Wire API call failed:", err);
    console.log("\nFalling back to direct assignment creation...\n");

    // Direct assignment creation using the same logic as the fixed wire API
    const NOISE_WORDS = new Set(["plan", "program", "bonus", "commission", "incentive", "cfg", "2024", "2025", "2026"]);
    const tokenizeForMatch = (s: string): string[] =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2 && !NOISE_WORDS.has(t));

    const matchLicenseToPlan = (license: string, planName: string): boolean => {
      const licTokens = tokenizeForMatch(license);
      const planTokens = tokenizeForMatch(planName);
      if (licTokens.length === 0) return false;
      const matched = licTokens.filter(lt => planTokens.some(pt => pt.includes(lt) || lt.includes(pt)));
      return matched.length === licTokens.length;
    };

    const { data: activeRuleSets } = await sb.from("rule_sets")
      .select("id, name")
      .eq("tenant_id", LAB)
      .eq("status", "active");

    const { data: allEntities } = await sb.from("entities")
      .select("id, external_id, metadata")
      .eq("tenant_id", LAB)
      .eq("status", "active");

    console.log(`Active plans: ${activeRuleSets?.length}`);
    console.log(`Active entities: ${allEntities?.length}`);

    const assignments: Array<{
      tenant_id: string;
      entity_id: string;
      rule_set_id: string;
      effective_from: string;
    }> = [];

    for (const entity of allEntities || []) {
      const meta = entity.metadata as Record<string, unknown> | null;
      const licenseStr = String(meta?.product_licenses || "");
      const licenseList = licenseStr.split(",").map(l => l.trim()).filter(l => l.length > 0);
      if (licenseList.length === 0) continue;

      for (const license of licenseList) {
        for (const rs of activeRuleSets || []) {
          if (matchLicenseToPlan(license, rs.name)) {
            assignments.push({
              tenant_id: LAB,
              entity_id: entity.id,
              rule_set_id: rs.id,
              effective_from: new Date().toISOString().split("T")[0],
            });
            console.log(`  ${entity.external_id}: "${license}" → "${rs.name}"`);
            break;
          }
        }
      }
    }

    console.log(`\nCreating ${assignments.length} assignments...`);

    if (assignments.length > 0) {
      const { error: insertErr } = await sb.from("rule_set_assignments").insert(assignments);
      if (insertErr) {
        console.error("INSERT FAILED:", insertErr);
      } else {
        console.log("INSERT SUCCESS");
      }
    }
  }

  // ── Step 4: Verify ──
  console.log("\n=== Verification ===\n");

  const { data: finalAssignments, count: finalCount } = await sb.from("rule_set_assignments")
    .select("entity_id, rule_set_id", { count: "exact" })
    .eq("tenant_id", LAB);

  const { data: rsets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const { data: ents } = await sb.from("entities")
    .select("id, external_id, metadata")
    .eq("tenant_id", LAB);

  const rsMap = new Map<string, string>();
  for (const rs of rsets || []) rsMap.set(rs.id, rs.name);
  const eMap = new Map<string, { ext: string; lic: string }>();
  for (const e of ents || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    eMap.set(e.id, { ext: e.external_id, lic: meta?.product_licenses ? String(meta.product_licenses) : "NONE" });
  }

  console.log(`Total assignments: ${finalCount}`);

  const byPlan: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  for (const a of finalAssignments || []) {
    const plan = rsMap.get(a.rule_set_id) || "?";
    byPlan[plan] = (byPlan[plan] || 0) + 1;
    const ent = eMap.get(a.entity_id);
    const ext = ent?.ext || "?";
    byEntity[ext] = (byEntity[ext] || 0) + 1;
  }

  console.log("\nPer plan:");
  for (const [plan, count] of Object.entries(byPlan).sort()) {
    console.log(`  ${plan}: ${count} entities`);
  }

  const counts = Object.values(byEntity);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  console.log(`\nAssignment range: ${min} to ${max} per entity`);
  console.log(`All same: ${counts.every(c => c === counts[0])}`);
  console.log(`VERDICT: ${max < (rsets?.length || 4) || !counts.every(c => c === counts[0]) ? "PASS — variable" : "FAIL — full coverage"}`);
}

main().catch(console.error);
