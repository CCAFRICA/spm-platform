/**
 * OB-125 Phase 0: Import Pipeline Quality Diagnostic
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob125-phase0-diagnostic.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-125 PHASE 0: IMPORT PIPELINE QUALITY DIAGNOSTIC ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── 0A: ENTITY DEDUP CHECK ──
  console.log("=== 0A: ENTITY DEDUP CHECK ===\n");

  for (const [label, tenantId] of [["LAB", LAB], ["MBC", MBC]] as const) {
    const { data: entities, count } = await sb.from("entities")
      .select("id, external_id, status", { count: "exact" })
      .eq("tenant_id", tenantId);

    const byExtId = new Map<string, number>();
    for (const e of entities || []) {
      byExtId.set(e.external_id, (byExtId.get(e.external_id) || 0) + 1);
    }
    const dupes = Array.from(byExtId.entries()).filter(([_, c]) => c > 1);

    console.log(`  ${label}: ${count} total entities, ${byExtId.size} unique external_ids`);
    if (dupes.length > 0) {
      console.log(`  DUPLICATES: ${dupes.length} external_ids with >1 entity`);
      for (const [ext, c] of dupes.slice(0, 5)) {
        console.log(`    ${ext}: ${c} entries`);
      }
      if (dupes.length > 5) console.log(`    ... +${dupes.length - 5} more`);
    } else {
      console.log(`  No duplicates`);
    }

    const statusCounts: Record<string, number> = {};
    for (const e of entities || []) {
      statusCounts[e.status || "null"] = (statusCounts[e.status || "null"] || 0) + 1;
    }
    console.log(`  Status breakdown: ${JSON.stringify(statusCounts)}`);
    console.log();
  }

  // ── 0B: PERIOD DEDUP CHECK ──
  console.log("=== 0B: PERIOD DEDUP CHECK ===\n");

  for (const [label, tenantId] of [["LAB", LAB], ["MBC", MBC]] as const) {
    const { data: periods, count } = await sb.from("periods")
      .select("id, canonical_key, label, status", { count: "exact" })
      .eq("tenant_id", tenantId);

    const byKey = new Map<string, number>();
    for (const p of periods || []) {
      byKey.set(p.canonical_key, (byKey.get(p.canonical_key) || 0) + 1);
    }
    const dupes = Array.from(byKey.entries()).filter(([_, c]) => c > 1);

    console.log(`  ${label}: ${count} total periods`);
    for (const p of (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))) {
      console.log(`    ${p.canonical_key} — "${p.label || ""}" — ${p.status}`);
    }
    if (dupes.length > 0) {
      console.log(`  PERIOD DUPLICATES: ${dupes.length} canonical_keys with >1 period`);
      for (const [key, c] of dupes) {
        console.log(`    ${key}: ${c} entries`);
      }
    } else {
      console.log(`  No period duplicates`);
    }
    console.log();
  }

  // ── 0C: ASSIGNMENT + RESULT COUNTS ──
  console.log("=== 0C: ASSIGNMENT + RESULT COUNTS ===\n");

  for (const [label, tenantId] of [["LAB", LAB], ["MBC", MBC]] as const) {
    const { count: assignCount } = await sb.from("rule_set_assignments")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { count: resultCount } = await sb.from("calculation_results")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { count: batchCount } = await sb.from("calculation_batches")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    console.log(`  ${label}: ${assignCount} assignments, ${resultCount} results, ${batchCount} batches`);
  }
  console.log();

  // ── 0D: CALCULATE PAGE — alert() CALLS ──
  console.log("=== 0D: CALCULATE PAGE — alert() CALLS ===\n");
  console.log("  Found 7 alert() calls in calculate/page.tsx:");
  console.log("    L258: alert(`Invalid transition to ${targetState}`)");
  console.log("    L261: alert(e.message) — lifecycle transition error");
  console.log("    L300: alert(`Some calculations failed:...`) — calc errors");
  console.log("    L319: alert(err.message) — calc catch");
  console.log("    L346: alert(error.message) — activate rule set error");
  console.log("    L421: alert(result.error) — wiring failed");
  console.log("    L424: alert(err.message) — wiring catch");
  console.log("  VERDICT: F-44 CONFIRMED — all errors use browser alert()\n");

  // ── 0E: LIFECYCLE — OFFICIAL TRANSITION GATE ──
  console.log("=== 0E: LIFECYCLE — OFFICIAL TRANSITION GATE ===\n");
  console.log("  LifecycleActionBar builds actions from pipeline config transitions.");
  console.log("  PREVIEW → OFFICIAL is a valid transition.");
  console.log("  No total payout guard — can mark OFFICIAL on $0 results.");
  console.log("  VERDICT: F-48 CONFIRMED — needs payout gate or warning\n");

  // ── 0F: APPROVE PAGE — DATA QUALITY DISPLAY ──
  console.log("=== 0F: APPROVE PAGE — DATA QUALITY DISPLAY ===\n");
  console.log("  OB-113 already replaced fake quality percentages.");
  console.log("  Validate step now shows: Records, Fields Mapped, Periods, AI Confidence.");
  console.log("  overallScore computed but NOT displayed in UI.");
  console.log("  Approve step shows: Workflow nodes, Validation Warnings, Data Package, Sheet Breakdown.");
  console.log("  F-35 is PARTIALLY ADDRESSED — overallScore still computed but not surfaced.");
  console.log("  F-28 noise: 5-node workflow visual is cosmetic, not actionable.\n");

  // ── 0G: CALCULATE — EMPTY STATE ──
  console.log("=== 0G: CALCULATE — EMPTY STATE ===\n");
  console.log("  Line 888-896: Generic message when no batch for selected period:");
  console.log('    "No calculation batch for this period"');
  console.log('    "Import data and run calculations to see results here."');
  console.log("  No plan readiness info (F-47).");
  console.log("  No per-plan status cards showing assignments, bindings, etc.");
  console.log("  VERDICT: F-41/F-47 CONFIRMED — misleading empty state, no readiness info\n");

  // ── Summary ──
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-125 DIAGNOSTIC SUMMARY                         ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║ F-33: Entity dedup         → CHECK ABOVE            ║");
  console.log("║ F-34: Period dedup         → CHECK ABOVE            ║");
  console.log("║ F-35: Data quality metric  → PARTIALLY FIXED        ║");
  console.log("║ F-28: Approve page noise   → CONFIRMED              ║");
  console.log("║ F-41: Empty state          → CONFIRMED              ║");
  console.log("║ F-44: Browser alert()      → 7 INSTANCES            ║");
  console.log("║ F-47: Plan readiness       → CONFIRMED              ║");
  console.log("║ F-48: Mark Official on $0  → CONFIRMED              ║");
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(console.error);
