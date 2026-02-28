/**
 * OB-119 Phase 5: Integrated test — clean reset and reimport through intelligence pipeline
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const PROJECT_REF = "bayqxeiltnpjrvflksfa";
const ADMIN_EMAIL = "admin@caribefinancial.mx";
const ADMIN_PASSWORD = "demo-password-VL1";
const ADMIN_PROFILE_ID = "6b25d749-0f6a-4261-9fd5-14b823f5fcde"; // profiles.id (NOT auth.users.id)

async function main() {
  console.log("=== OB-119 Phase 5: Integrated Test ===\n");

  // ── Step 1: Clean Reset ──
  console.log("--- Step 1: Clean Reset ---");
  await sb.from("calculation_results").delete().eq("tenant_id", TENANT);
  await sb.from("calculation_batches").delete().eq("tenant_id", TENANT);
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);
  await sb.from("committed_data").delete().eq("tenant_id", TENANT);
  await sb.from("rule_set_assignments").delete().eq("tenant_id", TENANT);
  await sb.from("entities").delete().eq("tenant_id", TENANT);
  await sb.from("periods").delete().eq("tenant_id", TENANT);
  await sb.from("import_batches").delete().eq("tenant_id", TENANT);
  console.log("  All data cleared (keeping rule_sets).");

  // ── Step 2: Reset input_bindings ──
  console.log("\n--- Step 2: Reset input_bindings ---");
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name")
    .eq("tenant_id", TENANT)
    .eq("status", "active");
  for (const rs of ruleSets || []) {
    await sb.from("rule_sets").update({ input_bindings: {} }).eq("id", rs.id);
    console.log(`  Reset: ${rs.name}`);
  }

  // ── Step 3: List files in storage ──
  console.log("\n--- Step 3: Discover files in storage ---");
  const { data: folders } = await sb.storage.from("imports").list(TENANT);
  const files: Array<{ uuid: string; name: string; storagePath: string }> = [];

  for (const folder of folders || []) {
    if (!folder.name || folder.name.startsWith(".")) continue;
    const { data: items } = await sb.storage.from("imports").list(`${TENANT}/${folder.name}`);
    for (const item of items || []) {
      if (item.name && !item.name.startsWith(".")) {
        files.push({
          uuid: folder.name,
          name: item.name,
          storagePath: `${TENANT}/${folder.name}/${item.name}`,
        });
      }
    }
  }

  // Deduplicate by filename (keep first occurrence)
  const seenNames = new Set<string>();
  const uniqueFiles: typeof files = [];
  for (const f of files) {
    if (!seenNames.has(f.name)) {
      seenNames.add(f.name);
      uniqueFiles.push(f);
    }
  }

  // Sort: roster first, then alphabetically
  uniqueFiles.sort((a, b) => {
    const aRoster = /personnel|roster|employee/i.test(a.name) ? 0 : 1;
    const bRoster = /personnel|roster|employee/i.test(b.name) ? 0 : 1;
    if (aRoster !== bRoster) return aRoster - bRoster;
    return a.name.localeCompare(b.name);
  });

  console.log(`  Found ${uniqueFiles.length} unique files (${files.length} total in storage):`);
  for (const f of uniqueFiles) console.log(`    ${f.name} → ${f.storagePath}`);

  // ── Step 4: Sign in and get auth cookies ──
  console.log("\n--- Step 4: Authenticate ---");
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authErr || !authData.session) {
    console.error("  Auth failed:", authErr?.message);
    return;
  }
  const session = authData.session;
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
  });
  const encodedSession = encodeURIComponent(sessionJson);
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const CHUNK_SIZE = 3180;
  const cookieParts: string[] = [];
  if (encodedSession.length <= CHUNK_SIZE) {
    cookieParts.push(`${cookieName}=${encodedSession}`);
  } else {
    const chunks = Math.ceil(encodedSession.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      cookieParts.push(
        `${cookieName}.${i}=${encodedSession.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)}`
      );
    }
  }
  const cookieHeader = cookieParts.join("; ");
  console.log(`  Authenticated as ${session.user.email} (${cookieParts.length} cookie chunks)`);

  // ── Step 5: Import each file through commit pipeline ──
  console.log("\n--- Step 5: Import files through commit pipeline ---");

  for (const file of uniqueFiles) {
    console.log(`\n  Importing: ${file.name}`);
    try {
      const resp = await fetch("http://localhost:3000/api/import/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          tenantId: TENANT,
          userId: ADMIN_PROFILE_ID,
          fileName: file.name,
          storagePath: file.storagePath,
          sheetMappings: {}, // Empty — force AI field mapping
          // No aiContext — force the pipeline to call AI
        }),
      });

      const data = await resp.json();
      if (data.success) {
        console.log(
          `    ✓ ${data.recordCount} records, ${data.entityCount} entities, ${data.periodCount} periods, ${data.assignmentCount} assignments`
        );
      } else {
        console.log(`    ✗ FAILED: ${data.error} — ${data.details || ""}`);
      }
    } catch (err) {
      console.log(`    ✗ ERROR: ${err}`);
    }
  }

  // ── Step 6: Verify Results ──
  console.log("\n\n=== VERIFICATION ===\n");

  // 6a: Entity linkage
  const { count: totalRows } = await sb
    .from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  const { count: entityLinked } = await sb
    .from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .not("entity_id", "is", null);
  const entityPct = totalRows ? ((entityLinked || 0) / totalRows * 100).toFixed(1) : "0";
  console.log(`Entity linkage: ${entityLinked}/${totalRows} (${entityPct}%) — target: >90%`);

  // 6b: Period linkage
  const { count: periodLinked } = await sb
    .from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .not("period_id", "is", null);
  const periodPct = totalRows ? ((periodLinked || 0) / totalRows * 100).toFixed(1) : "0";
  console.log(`Period linkage: ${periodLinked}/${totalRows} (${periodPct}%) — target: >90%`);

  // 6c: Data types
  const { data: dtRows } = await sb
    .from("committed_data")
    .select("data_type")
    .eq("tenant_id", TENANT);
  const dataTypes = new Set((dtRows || []).map((r) => r.data_type));
  console.log(`\nData types (${dataTypes.size}):`);
  for (const dt of Array.from(dataTypes).sort()) {
    const count = (dtRows || []).filter((r) => r.data_type === dt).length;
    console.log(`  ${dt}: ${count} rows`);
  }

  // 6d: Periods
  const { data: periods } = await sb
    .from("periods")
    .select("canonical_key, id")
    .eq("tenant_id", TENANT)
    .order("canonical_key");
  console.log(`\nPeriods (${periods?.length || 0}):`);
  for (const p of periods || []) console.log(`  ${p.canonical_key} — ${p.id}`);

  // 6e: input_bindings
  const { data: rsBindings } = await sb
    .from("rule_sets")
    .select("name, input_bindings")
    .eq("tenant_id", TENANT)
    .eq("status", "active")
    .order("name");
  console.log(`\ninput_bindings:`);
  let nonEmptyBindings = 0;
  for (const rs of rsBindings || []) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const isEmpty = !bindings || Object.keys(bindings).length === 0;
    if (!isEmpty) nonEmptyBindings++;
    console.log(`  ${rs.name}: ${isEmpty ? "{} (EMPTY)" : JSON.stringify(bindings).substring(0, 120) + "..."}`);
  }
  console.log(`  Non-empty: ${nonEmptyBindings}/${rsBindings?.length || 0} — target: ≥2`);

  // 6f: Entities
  const { count: entityCount } = await sb
    .from("entities")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`\nEntities: ${entityCount}`);

  // 6g: Rule set assignments
  const { count: assignCount } = await sb
    .from("rule_set_assignments")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`Rule set assignments: ${assignCount}`);

  // ── Step 7: Run Calculations ──
  console.log("\n\n=== CALCULATIONS ===\n");

  let grandTotal = 0;
  for (const rs of ruleSets || []) {
    for (const p of periods || []) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: TENANT, periodId: p.id, ruleSetId: rs.id }),
        });
        const data = await resp.json();
        if (data.success && data.totalPayout > 0) {
          console.log(`  ${rs.name} | ${p.canonical_key}: $${data.totalPayout.toLocaleString()} (${data.entityCount} entities)`);
          grandTotal += data.totalPayout;
        } else if (data.success) {
          console.log(`  ${rs.name} | ${p.canonical_key}: $0 (${data.entityCount} entities)`);
        } else {
          console.log(`  ${rs.name} | ${p.canonical_key}: ${data.error}`);
        }
      } catch (err) {
        console.log(`  ${rs.name} | ${p.canonical_key}: ERROR — ${err}`);
      }
    }
  }
  console.log(`\nGrand Total: $${grandTotal.toLocaleString()}`);

  // ── Summary ──
  console.log("\n\n=== OB-119 PHASE 5 SUMMARY ===\n");
  console.log(`| Metric | Value | Target | Pass? |`);
  console.log(`|--------|-------|--------|-------|`);
  console.log(`| Entity linkage | ${entityPct}% | >90% | ${parseFloat(entityPct) > 90 ? "✓" : "✗"} |`);
  console.log(`| Period linkage | ${periodPct}% | >90% | ${parseFloat(periodPct) > 90 ? "✓" : "✗"} |`);
  console.log(`| Semantic data_types | ${dataTypes.size} | >1 | ${dataTypes.size > 1 ? "✓" : "✗"} |`);
  console.log(`| Non-empty input_bindings | ${nonEmptyBindings} | ≥2 | ${nonEmptyBindings >= 2 ? "✓" : "✗"} |`);
  console.log(`| Grand total > $0 | $${grandTotal.toLocaleString()} | >$0 | ${grandTotal > 0 ? "✓" : "✗"} |`);
  console.log(`| Periods | ${periods?.length || 0} | ≤5 | ${(periods?.length || 0) <= 5 ? "✓" : "✗"} |`);
}

main().catch(console.error);
