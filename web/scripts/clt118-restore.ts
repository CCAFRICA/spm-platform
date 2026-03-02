/**
 * CLT-118 POST-TEST: Restore MBC tenant to working state
 *
 * The clean pipeline test left the tenant with unlinked data ($0 payouts).
 * This script clears the CLT-118 state and re-imports with proper field mappings.
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const AUTH_USER = "5e271084-2300-41d3-82bc-7a8955bc83ca";

const FILES = [
  { uuid: "4e080bf2-37c7-4df0-ad1a-a8279e2b63ec", name: "CFG_Personnel_Q1_2024.xlsx", isRoster: true },
  { uuid: "8fc08a76-e6d9-42ac-8070-492b5774523b", name: "CFG_Loan_Disbursements_Jan2024.csv", isRoster: false },
  { uuid: "949fddf0-ad7c-4220-a642-627efcb52b33", name: "CFG_Loan_Disbursements_Feb2024.csv", isRoster: false },
  { uuid: "e6bfacfd-3b60-45b9-9b52-4f19ec2a68e6", name: "CFG_Loan_Disbursements_Mar2024.csv", isRoster: false },
  { uuid: "47183303-3b8f-416d-8914-009e79535eb3", name: "CFG_Mortgage_Closings_Q1_2024.csv", isRoster: false },
  { uuid: "2746ff55-d7ca-4c22-a23a-5da510463abb", name: "CFG_Insurance_Referrals_Q1_2024.csv", isRoster: false },
  { uuid: "7ca2fcde-9180-4c43-aecd-191403e448f5", name: "CFG_Deposit_Balances_Q1_2024.csv", isRoster: false },
  { uuid: "0b9d64e6-55e0-4f10-bd9d-682342cb9067", name: "CFG_Loan_Defaults_Q1_2024.csv", isRoster: false },
];

// OfficerID → employee_id mapping (the critical AI field mapping that's missing)
function resolveEntityCol(headers: string[]): string | null {
  for (const h of headers) {
    const lower = h.toLowerCase().replace(/[\s_-]+/g, "_");
    if (["employeeid", "employee_id", "officerid", "officer_id"].includes(lower)) return h;
  }
  return null;
}

// Date → period extraction (the critical temporal mapping that's missing)
function extractPeriod(row: Record<string, unknown>, headers: string[]): { year: number; month: number } | null {
  // Look for date-like columns
  const dateCols = headers.filter(h => /date|fecha|period|snapshot/i.test(h));
  for (const col of dateCols) {
    const val = row[col];
    if (typeof val === "number" && val > 25000 && val < 100000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    }
    if (typeof val === "string") {
      const m = val.match(/(\d{4})-(\d{2})/);
      if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) };
    }
  }
  // Try Year/Month columns
  const yearCol = headers.find(h => /^year$/i.test(h));
  const monthCol = headers.find(h => /^month$/i.test(h));
  if (yearCol && monthCol && row[yearCol] && row[monthCol]) {
    return { year: Number(row[yearCol]), month: Number(row[monthCol]) };
  }
  return null;
}

async function main() {
  console.log("=== CLT-118 RESTORE: Re-import with proper field mappings ===\n");

  // Step 1: Clear CLT-118 state
  console.log("--- Clearing CLT-118 state ---");
  await sb.from("calculation_results").delete().eq("tenant_id", TENANT);
  await sb.from("calculation_batches").delete().eq("tenant_id", TENANT);
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);

  const { data: rsIds } = await sb.from("rule_sets").select("id").eq("tenant_id", TENANT);
  if (rsIds && rsIds.length > 0) {
    await sb.from("rule_set_assignments").delete().in("rule_set_id", rsIds.map(r => r.id));
  }
  await sb.from("rule_sets").delete().eq("tenant_id", TENANT);
  await sb.from("committed_data").delete().eq("tenant_id", TENANT);
  await sb.from("import_batches").delete().eq("tenant_id", TENANT);
  await sb.from("entities").delete().eq("tenant_id", TENANT);
  await sb.from("periods").delete().eq("tenant_id", TENANT);
  console.log("Cleared all data\n");

  // Step 2: Re-create rule sets from AI interpretation results
  console.log("--- Re-creating rule sets from AI interpretation ---");
  const fs = await import("fs");
  const aiResults = JSON.parse(fs.readFileSync("/tmp/clt118-step1-results.json", "utf-8")) as Array<{
    plan: string; interpretSuccess: boolean; raw: Record<string, unknown>;
  }>;

  const ruleSetIds = new Map<string, string>();
  const crypto = await import("crypto");

  for (const r of aiResults) {
    if (!r.interpretSuccess || !r.raw) continue;
    const rsId = crypto.randomUUID();
    const name = (r.raw.ruleSetName as string) || r.plan;

    const { error } = await sb.from("rule_sets").insert({
      id: rsId,
      tenant_id: TENANT,
      name,
      description: `AI-interpreted from ${r.plan}`,
      status: "active",
      version: 1,
      effective_from: "2024-01-01",
      effective_to: "2024-12-31",
      population_config: { eligible_roles: r.raw.employeeTypes || [] },
      input_bindings: {},
      components: {
        type: "additive_lookup",
        variants: [{ variantId: "default", components: r.raw.components }],
      },
      cadence_config: {},
      outcome_config: {},
      metadata: { plan_type: "additive_lookup" },
    });

    if (error) {
      console.log(`  ${name}: ERROR ${error.message}`);
    } else {
      console.log(`  ${name}: ${rsId}`);
      ruleSetIds.set(name, rsId);
    }
  }

  // Write Insurance Referral metric_derivations (OB-118)
  const insRsId = Array.from(ruleSetIds.entries()).find(([k]) => k.includes("Insurance"))?.[1];
  if (insRsId) {
    const metricDerivations = [
      { metric: "ins_vida_qualified_referrals", operation: "count", source_pattern: "insurance|referral",
        filters: [{ field: "ProductCode", operator: "eq", value: "INS-VIDA" }, { field: "Qualified", operator: "eq", value: "Yes" }] },
      { metric: "ins_auto_qualified_referrals", operation: "count", source_pattern: "insurance|referral",
        filters: [{ field: "ProductCode", operator: "eq", value: "INS-AUTO" }, { field: "Qualified", operator: "eq", value: "Yes" }] },
      { metric: "ins_hogar_qualified_referrals", operation: "count", source_pattern: "insurance|referral",
        filters: [{ field: "ProductCode", operator: "eq", value: "INS-HOGAR" }, { field: "Qualified", operator: "eq", value: "Yes" }] },
      { metric: "ins_salud_qualified_referrals", operation: "count", source_pattern: "insurance|referral",
        filters: [{ field: "ProductCode", operator: "eq", value: "INS-SALUD" }, { field: "Qualified", operator: "eq", value: "Yes" }] },
      { metric: "ins_pyme_qualified_referrals", operation: "count", source_pattern: "insurance|referral",
        filters: [{ field: "ProductCode", operator: "eq", value: "INS-PYME" }, { field: "Qualified", operator: "eq", value: "Yes" }] },
    ];
    await sb.from("rule_sets").update({ input_bindings: { metric_derivations: metricDerivations } }).eq("id", insRsId);
    console.log(`  Insurance Referral: metric_derivations written`);
  }

  // Step 3: Import data with proper field mappings
  console.log("\n--- Importing data with field mappings ---");

  const entityIdMap = new Map<string, string>();
  const rosterMeta = new Map<string, { name?: string; role?: string; licenses?: string }>();
  const periodKeyMap = new Map<string, string>();
  const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  for (const file of FILES) {
    const storagePath = `${TENANT}/${file.uuid}/${file.name}`;
    const { data: blob } = await sb.storage.from("imports").download(storagePath);
    if (!blob) continue;

    const buffer = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: true });
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0]);
      const entityCol = resolveEntityCol(headers);

      // Roster metadata
      if (file.isRoster && entityCol) {
        const nameCol = headers.find(h => /^(first|last)?name$/i.test(h));
        const fnCol = headers.find(h => /^firstname$/i.test(h));
        const lnCol = headers.find(h => /^lastname$/i.test(h));
        const roleCol = headers.find(h => /^(title|position|role)$/i.test(h));
        const licCol = headers.find(h => /productlicenses/i.test(h));

        for (const row of rows) {
          const eid = String(row[entityCol]).trim();
          let displayName = eid;
          if (fnCol && lnCol && row[fnCol] && row[lnCol]) {
            displayName = `${row[fnCol]} ${row[lnCol]}`;
          } else if (nameCol && row[nameCol]) {
            displayName = String(row[nameCol]);
          }
          rosterMeta.set(eid, {
            name: displayName,
            role: roleCol ? String(row[roleCol] || "") : undefined,
            licenses: licCol ? String(row[licCol] || "") : undefined,
          });
        }
      }

      // Create entities
      const fileEntityIds = new Set<string>();
      for (const row of rows) {
        if (entityCol && row[entityCol]) fileEntityIds.add(String(row[entityCol]).trim());
      }

      const newIds = Array.from(fileEntityIds).filter(eid => !entityIdMap.has(eid));
      if (newIds.length > 0) {
        const entities = newIds.map(eid => {
          const meta = rosterMeta.get(eid) || {};
          return {
            tenant_id: TENANT,
            external_id: eid,
            display_name: meta.name || eid,
            entity_type: "individual" as const,
            status: "active" as const,
            temporal_attributes: [] as unknown[],
            metadata: {
              ...(meta.role ? { role: meta.role } : {}),
              ...(meta.licenses ? { product_licenses: meta.licenses } : {}),
            },
          };
        });
        const { data: inserted } = await sb.from("entities").insert(entities).select("id, external_id");
        for (const e of inserted || []) {
          if (e.external_id) entityIdMap.set(e.external_id, e.id);
        }
      }

      // Detect and create periods
      for (const row of rows) {
        const p = extractPeriod(row, headers);
        if (p) {
          const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
          if (!periodKeyMap.has(key)) {
            const { data: existing } = await sb.from("periods").select("id").eq("tenant_id", TENANT).eq("canonical_key", key).single();
            if (existing) {
              periodKeyMap.set(key, existing.id);
            } else {
              const lastDay = new Date(p.year, p.month, 0).getDate();
              const { data: np } = await sb.from("periods").insert({
                tenant_id: TENANT,
                canonical_key: key,
                label: `${MONTH_NAMES[p.month]} ${p.year}`,
                period_type: "monthly",
                start_date: `${p.year}-${String(p.month).padStart(2, "0")}-01`,
                end_date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
                status: "open",
                metadata: { year: p.year, month: p.month },
              }).select("id").single();
              if (np) periodKeyMap.set(key, np.id);
            }
          }
        }
      }

      // data_type: use filename stem (same as OB-116)
      const dataType = file.name.replace(/\.[^.]+$/, "");

      // Build committed_data with entity and period linkage
      const insertRows = rows.map((row, i) => {
        let entityId: string | null = null;
        if (entityCol && row[entityCol]) {
          entityId = entityIdMap.get(String(row[entityCol]).trim()) || null;
        }

        let periodId: string | null = null;
        const p = extractPeriod(row, headers);
        if (p) {
          const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
          periodId = periodKeyMap.get(key) || null;
        }
        if (!periodId && periodKeyMap.size > 0) {
          periodId = Array.from(periodKeyMap.values())[0];
        }

        return {
          tenant_id: TENANT,
          entity_id: entityId,
          period_id: periodId,
          data_type: dataType,
          row_data: { ...row, _sheetName: sheetName, _rowIndex: i },
          metadata: { source_file: file.name },
        };
      });

      const CHUNK = 5000;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        await sb.from("committed_data").insert(insertRows.slice(i, i + CHUNK));
      }
      console.log(`  ${file.name}: ${insertRows.length} rows (entity: ${entityCol || "N/A"})`);
    }
  }

  // Step 4: Rule set assignments
  console.log("\n--- Rule set assignments ---");
  const allRS = Array.from(ruleSetIds.entries()).map(([name, id]) => ({ name, id }));
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const rsNameMap = new Map(allRS.map(rs => [normalize(rs.name), rs.id]));

  const assignments: Array<{ tenant_id: string; entity_id: string; rule_set_id: string; effective_from: string }> = [];
  const existingAssign = new Set<string>();

  for (const [extId, uuid] of Array.from(entityIdMap.entries())) {
    const meta = rosterMeta.get(extId);
    const licenses = meta?.licenses;

    if (licenses) {
      const licenseList = licenses.split(",").map(l => l.trim()).filter(Boolean);
      for (const license of licenseList) {
        const nl = normalize(license);
        let matchedId: string | undefined;
        for (const [rsNorm, rsId] of Array.from(rsNameMap.entries())) {
          if (rsNorm.includes(nl) || nl.includes(rsNorm)) {
            matchedId = rsId;
            break;
          }
        }
        // Fallback: "Deposits" → "Deposit Growth"
        if (!matchedId && nl === "deposits") {
          matchedId = Array.from(rsNameMap.entries()).find(([k]) => k.includes("deposit"))?.[1];
        }
        if (matchedId && !existingAssign.has(`${uuid}:${matchedId}`)) {
          assignments.push({ tenant_id: TENANT, entity_id: uuid, rule_set_id: matchedId, effective_from: "2024-01-01" });
          existingAssign.add(`${uuid}:${matchedId}`);
        }
      }
    }
  }

  if (assignments.length > 0) {
    await sb.from("rule_set_assignments").insert(assignments);
    console.log(`  ${assignments.length} assignments created`);
    const byRS = new Map<string, number>();
    for (const a of assignments) byRS.set(a.rule_set_id, (byRS.get(a.rule_set_id) || 0) + 1);
    for (const [id, count] of Array.from(byRS.entries())) {
      const name = allRS.find(r => r.id === id)?.name;
      console.log(`    ${name}: ${count}`);
    }
  }

  // Step 5: Verification
  console.log("\n--- Verification ---");
  const { count: cdCount } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  const { count: nullE } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("entity_id", null);
  const { count: nullP } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("period_id", null);
  const { count: entCount } = await sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  const { data: pds } = await sb.from("periods").select("canonical_key").eq("tenant_id", TENANT);

  console.log(`committed_data: ${cdCount}`);
  console.log(`  null entity_id: ${nullE}`);
  console.log(`  null period_id: ${nullP}`);
  console.log(`entities: ${entCount}`);
  console.log(`periods: ${pds?.length} — ${(pds || []).map(p => p.canonical_key).join(", ")}`);

  // Step 6: Run calculations
  console.log("\n--- Running calculations ---");
  const { data: allPeriods } = await sb.from("periods").select("id, canonical_key").eq("tenant_id", TENANT).order("canonical_key");

  let grandTotal = 0;
  for (const rs of allRS) {
    for (const p of allPeriods || []) {
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
        console.log(`  ${rs.name} | ${p.canonical_key}: ERROR`);
      }
    }
  }
  console.log(`\nGrand Total: $${grandTotal.toLocaleString()}`);
}

main().catch(console.error);
