/**
 * HF-082 Phase 0: Assignment Matching Diagnostic
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf082-phase0.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-082 PHASE 0: ASSIGNMENT MATCHING DIAGNOSTIC     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── 0A: Current assignments per entity ──
  console.log("=== 0A: CURRENT LAB ASSIGNMENTS ===\n");

  const { data: assignments } = await sb.from("rule_set_assignments")
    .select("entity_id, rule_set_id")
    .eq("tenant_id", LAB);

  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const { data: entities } = await sb.from("entities")
    .select("id, external_id, metadata")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const rsMap = new Map<string, string>();
  for (const rs of ruleSets || []) rsMap.set(rs.id, rs.name);

  const entityMap = new Map<string, { external_id: string; licenses: string }>();
  for (const e of entities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    entityMap.set(e.id, {
      external_id: e.external_id,
      licenses: meta?.product_licenses ? String(meta.product_licenses) : "NONE",
    });
  }

  const byEntity: Record<string, { licenses: string; plans: string[] }> = {};
  for (const a of assignments || []) {
    const ent = entityMap.get(a.entity_id);
    const ext = ent?.external_id || "?";
    if (!byEntity[ext]) byEntity[ext] = { licenses: ent?.licenses || "NONE", plans: [] };
    byEntity[ext].plans.push(rsMap.get(a.rule_set_id) || "?");
  }

  console.log("Entity assignments (sample):");
  const entries = Object.entries(byEntity).slice(0, 8);
  for (const [ext, info] of entries) {
    console.log(`  Officer ${ext}: ${info.plans.length} plans | licenses: ${info.licenses}`);
    for (const p of info.plans) console.log(`    → ${p}`);
  }

  console.log(`\nTotal assignments: ${assignments?.length}`);
  const counts = Object.values(byEntity).map(e => e.plans.length);
  const allSame = counts.length > 0 && counts.every(c => c === counts[0]);
  console.log(`All entities have same count: ${allSame} (${counts[0]})`);
  console.log(`VERDICT: ${allSame ? "FULL-COVERAGE FALLBACK ACTIVE" : "Variable assignment — license-based working"}`);

  // ── 0B: License distribution ──
  console.log("\n=== 0B: LICENSE DISTRIBUTION ===\n");

  const licenseCount: Record<string, number> = {};
  for (const e of entities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    const licenses = meta?.product_licenses ? String(meta.product_licenses) : "";
    const list = licenses.split(",").map(l => l.trim()).filter(Boolean);
    for (const l of list) licenseCount[l] = (licenseCount[l] || 0) + 1;
  }

  for (const [lic, count] of Object.entries(licenseCount).sort()) {
    console.log(`  ${lic}: ${count} entities`);
  }

  // ── 0C: Trace the matching bug ──
  console.log("\n=== 0C: MATCHING BUG TRACE ===\n");

  console.log("Plan names in licenseMapping (after normalizeForMatch):");
  for (const rs of ruleSets || []) {
    const normalized = rs.name.toLowerCase().replace(/[\s_-]+/g, "");
    console.log(`  "${rs.name}" → "${normalized}"`);
  }

  console.log("\nLicense names (after normalizeForMatch):");
  const uniqueLicenses = new Set<string>();
  for (const e of entities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    const licenses = meta?.product_licenses ? String(meta.product_licenses) : "";
    for (const l of licenses.split(",").map(s => s.trim()).filter(Boolean)) {
      uniqueLicenses.add(l);
    }
  }

  for (const lic of Array.from(uniqueLicenses).sort()) {
    const normalizedLic = lic.toLowerCase().replace(/[\s_-]+/g, "");
    console.log(`  "${lic}" → "${normalizedLic}"`);

    for (const rs of ruleSets || []) {
      const normalizedPlan = rs.name.toLowerCase().replace(/[\s_-]+/g, "");
      const fwd = normalizedPlan.includes(normalizedLic);
      const rev = normalizedLic.includes(normalizedPlan);
      if (fwd || rev) {
        console.log(`    ✓ MATCH: "${rs.name}" (fwd=${fwd}, rev=${rev})`);
      } else {
        console.log(`    ✗ NO MATCH: "${rs.name}"`);
      }
    }
  }

  // ── 0D: Fallback bug trace ──
  console.log("\n=== 0D: FALLBACK BUG ANALYSIS ===\n");
  console.log("wire/route.ts line 289:");
  console.log("  if (!usedLicenseMapping || newAssignments.length === 0)");
  console.log("");
  console.log("Bug: If wire API is called TWICE:");
  console.log("  1st call: License matching creates ~55 assignments → fallback skipped");
  console.log("  2nd call: All 55 already in existingSet → newAssignments.length === 0");
  console.log("            → fallback triggers → adds 45 more → total 100 (full coverage)");
  console.log("");
  console.log("Fix: Gate fallback on whether entities HAVE license metadata,");
  console.log("     not on whether new assignments were created in this run.");
}

main().catch(console.error);
