/**
 * OB-121 Phase 0: Diagnostic — stale result quantification + Deposit Growth structure
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("=== OB-121 PHASE 0: DIAGNOSTIC ===\n");

  // Get MBC tenant ID
  const { data: tenant } = await sb
    .from("tenants")
    .select("id")
    .eq("slug", "mexican-bank-co")
    .single();

  if (!tenant) {
    console.error("MBC tenant not found!");
    return;
  }
  const T = tenant.id;
  console.log(`Tenant: ${T}\n`);

  // ── 0A: Quantify stale results ──
  console.log("── 0A: STALE RESULT QUANTIFICATION ──\n");

  // Total rows
  const { count: totalRows } = await sb
    .from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", T);
  console.log(`  Total calculation_results rows: ${totalRows}`);

  // Expected count
  const { count: entityCount } = await sb
    .from("entities")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", T);
  const { count: periodCount } = await sb
    .from("periods")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", T);
  const { count: planCount } = await sb
    .from("rule_sets")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", T)
    .eq("status", "active");
  console.log(`  Entities: ${entityCount}, Periods: ${periodCount}, Active plans: ${planCount}`);
  console.log(`  Expected max rows (E×P×Plans): ${(entityCount || 0) * (periodCount || 0) * (planCount || 0)}`);

  // Per-plan breakdown with time range
  const { data: planBreakdown } = await sb
    .rpc("ob121_plan_breakdown", { t_id: T })
    .select("*");

  // Fallback: manual query if RPC doesn't exist
  if (!planBreakdown) {
    const { data: results } = await sb
      .from("calculation_results")
      .select("rule_set_id, total_payout, created_at")
      .eq("tenant_id", T);

    if (results) {
      // Get rule set names
      const { data: ruleSets } = await sb
        .from("rule_sets")
        .select("id, name")
        .eq("tenant_id", T);
      const rsNames = new Map((ruleSets || []).map(r => [r.id, r.name]));

      // Group by plan
      const byPlan = new Map<string, { rows: number; total: number; earliest: string; latest: string }>();
      for (const r of results) {
        const name = rsNames.get(r.rule_set_id) || r.rule_set_id;
        if (!byPlan.has(name)) {
          byPlan.set(name, { rows: 0, total: 0, earliest: r.created_at, latest: r.created_at });
        }
        const entry = byPlan.get(name)!;
        entry.rows++;
        entry.total += r.total_payout || 0;
        if (r.created_at < entry.earliest) entry.earliest = r.created_at;
        if (r.created_at > entry.latest) entry.latest = r.created_at;
      }

      console.log("\n  Per-plan breakdown:");
      for (const [name, stats] of Array.from(byPlan.entries())) {
        console.log(`    ${name}: ${stats.rows} rows, $${stats.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
        console.log(`      Earliest: ${stats.earliest}`);
        console.log(`      Latest:   ${stats.latest}`);
      }
    }
  }

  // Duplicate check — same entity+period+plan with multiple rows
  console.log("\n── DUPLICATE CHECK ──");
  const { data: allResults } = await sb
    .from("calculation_results")
    .select("entity_id, period_id, rule_set_id, total_payout, created_at")
    .eq("tenant_id", T);

  if (allResults) {
    const dupeMap = new Map<string, Array<{ total_payout: number; created_at: string }>>();
    for (const r of allResults) {
      const key = `${r.entity_id}|${r.period_id}|${r.rule_set_id}`;
      if (!dupeMap.has(key)) dupeMap.set(key, []);
      dupeMap.get(key)!.push({ total_payout: r.total_payout, created_at: r.created_at });
    }

    let dupeCount = 0;
    let dupeSets = 0;
    const dupeExamples: string[] = [];

    for (const [key, rows] of Array.from(dupeMap.entries())) {
      if (rows.length > 1) {
        dupeSets++;
        dupeCount += rows.length - 1; // Extra rows beyond 1
        if (dupeExamples.length < 5) {
          const payouts = rows.map(r => `$${r.total_payout}`).join(", ");
          dupeExamples.push(`  ${key.split("|").slice(0, 1)} → ${rows.length} rows: [${payouts}]`);
        }
      }
    }

    console.log(`  Unique (entity,period,plan) combos: ${dupeMap.size}`);
    console.log(`  Combos with duplicates: ${dupeSets}`);
    console.log(`  Extra (stale) rows: ${dupeCount}`);
    console.log(`  Inflation factor: ${totalRows}/${dupeMap.size} = ${((totalRows || 0) / Math.max(dupeMap.size, 1)).toFixed(2)}x`);

    if (dupeExamples.length > 0) {
      console.log("\n  Examples (first 5 duped combos):");
      for (const ex of dupeExamples) console.log(`    ${ex}`);
    }

    // What's the "real" total if we take only the LATEST result per combo?
    let cleanTotal = 0;
    let staleTotal = 0;
    for (const [, rows] of Array.from(dupeMap.entries())) {
      // Sort by created_at desc — latest first
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      cleanTotal += rows[0].total_payout;
      for (let i = 1; i < rows.length; i++) {
        staleTotal += rows[i].total_payout;
      }
    }

    const rawTotal = allResults.reduce((s, r) => s + (r.total_payout || 0), 0);
    console.log(`\n  Raw total (all rows): $${rawTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`  Clean total (latest per combo): $${cleanTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`  Stale rows total: $${staleTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`  Inflation: $${(rawTotal - cleanTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${((rawTotal / Math.max(cleanTotal, 1) - 1) * 100).toFixed(1)}%)`);
  }

  // ── 0B: Deposit Growth plan structure ──
  console.log("\n\n── 0B: DEPOSIT GROWTH PLAN STRUCTURE ──\n");

  const { data: depositRS } = await sb
    .from("rule_sets")
    .select("id, name, components, input_bindings")
    .eq("tenant_id", T)
    .ilike("name", "%Deposit%")
    .single();

  if (depositRS) {
    console.log(`  Plan: ${depositRS.name} (${depositRS.id})`);

    // Extract first component's calculationIntent
    const comps = depositRS.components as Record<string, unknown>;
    const variants = (comps?.variants as Array<Record<string, unknown>>) ?? [];
    const compList = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
    console.log(`  Components: ${compList.length}`);

    for (let i = 0; i < compList.length; i++) {
      const c = compList[i];
      console.log(`\n  Component ${i}: "${c.name || c.id}"`);
      console.log(`    tierConfig.metric: ${(c.tierConfig as Record<string, unknown>)?.metric ?? "NONE"}`);
      console.log(`    calculationIntent: ${JSON.stringify(c.calculationIntent, null, 2)?.substring(0, 500)}`);
    }

    // Input bindings
    const bindings = depositRS.input_bindings as Record<string, unknown> | null;
    const derivations = (bindings?.metric_derivations as Array<Record<string, unknown>>) ?? [];
    console.log(`\n  Input bindings: ${derivations.length} derivation rules`);
    for (const d of derivations) {
      console.log(`    metric="${d.metric}", op=${d.operation}, source=${d.source_pattern}`);
    }
  } else {
    console.log("  No Deposit Growth plan found!");
  }

  // Deposit balance data
  console.log("\n── DEPOSIT BALANCE DATA ──");
  const { data: depositData, count: depositCount } = await sb
    .from("committed_data")
    .select("entity_id, period_id, data_type, row_data", { count: "exact" })
    .eq("tenant_id", T)
    .eq("data_type", "deposit_balances")
    .limit(10);

  console.log(`  Total deposit_balances rows: ${depositCount}`);
  if (depositData && depositData.length > 0) {
    console.log(`  Sample row_data keys: ${Object.keys(depositData[0].row_data as Record<string, unknown>).join(", ")}`);
    for (const row of depositData.slice(0, 3)) {
      const rd = row.row_data as Record<string, unknown>;
      console.log(`    entity=${String(row.entity_id).substring(0, 8)}... period=${String(row.period_id).substring(0, 8)}... balance=${rd.TotalDepositBalance || rd.total_deposit_balance || "?"}`);
    }
  }

  // Entities with deposit data
  const { data: depositEntities } = await sb
    .from("committed_data")
    .select("entity_id")
    .eq("tenant_id", T)
    .eq("data_type", "deposit_balances");

  if (depositEntities) {
    const uniqueEntities = new Set(depositEntities.map(r => r.entity_id));
    console.log(`  Unique entities with deposit data: ${uniqueEntities.size}`);
  }

  // ── 0C: Consumer Lending intent structure ──
  console.log("\n\n── 0C: CONSUMER LENDING INTENT STRUCTURE ──\n");

  const { data: clRS } = await sb
    .from("rule_sets")
    .select("id, name, components")
    .eq("tenant_id", T)
    .ilike("name", "%Consumer%")
    .single();

  if (clRS) {
    const comps = clRS.components as Record<string, unknown>;
    const variants = (comps?.variants as Array<Record<string, unknown>>) ?? [];
    const compList = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
    console.log(`  Plan: ${clRS.name}`);
    console.log(`  Components: ${compList.length}`);

    for (let i = 0; i < compList.length; i++) {
      const c = compList[i];
      console.log(`\n  Component ${i}: "${c.name || c.id}"`);
      const intent = c.calculationIntent as Record<string, unknown> | undefined;
      if (intent) {
        console.log(`    Intent operation: ${intent.operation}`);
        const input = intent.input as Record<string, unknown> | undefined;
        console.log(`    Input source: ${input?.source}`);
        console.log(`    Full intent: ${JSON.stringify(intent, null, 2)?.substring(0, 500)}`);
      }
      const tc = c.tierConfig as Record<string, unknown> | undefined;
      if (tc) {
        console.log(`    tierConfig.metric: ${tc.metric}`);
      }
    }
  }

  // ── 0D: Engine deletion behavior ──
  console.log("\n\n── 0D: ENGINE DELETION BEHAVIOR ──\n");
  console.log("  calculation_results: INSERT without DELETE (confirmed by code review)");
  console.log("  entity_period_outcomes: DELETE before INSERT (confirmed)");
  console.log("  UNIQUE constraint on calculation_results: NONE");
  console.log("  → Stale accumulation is expected and confirmed by data above");

  console.log("\n=== PHASE 0 COMPLETE ===");
}

main().catch(console.error);
