/**
 * CLT-118 STEP 2B: Direct data import via service role
 * Replicates the import/commit pipeline logic:
 * - Download from storage
 * - Parse XLSX/CSV
 * - Entity resolution (create entities from data)
 * - Period detection
 * - data_type assignment (using filename stem since no AI context)
 * - committed_data insertion
 * - Rule set assignment via ProductLicenses
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

// Import order: roster first, then data
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

const ENTITY_ID_TARGETS = ["employeeid", "employee_id", "entityid", "entity_id", "officercode", "officer_code"];
const YEAR_TARGETS = ["year", "period_year"];
const MONTH_TARGETS = ["month", "period_month"];
const NAME_TARGETS = ["name", "entity_name", "display_name", "employee_name", "nombre"];
const ROLE_TARGETS = ["role", "position", "puesto", "title", "cargo"];
const LICENSE_TARGETS = ["productlicenses", "product_licenses", "licenses", "products"];

async function main() {
  console.log("=== CLT-118 STEP 2B: Direct Data Import ===\n");

  const entityIdMap = new Map<string, string>();  // externalId → UUID
  const rosterMeta = new Map<string, { name?: string; role?: string; licenses?: string }>();
  const periodKeyMap = new Map<string, string>();  // "2024-01" → UUID

  for (const file of FILES) {
    console.log(`\n--- ${file.name} ---`);

    // Download from storage
    const storagePath = `${TENANT}/${file.uuid}/${file.name}`;
    const { data: blob, error: dlErr } = await sb.storage.from("imports").download(storagePath);
    if (dlErr || !blob) {
      console.log(`  DOWNLOAD FAILED: ${dlErr?.message}`);
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellFormula: false });

    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: true });
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0]);
      console.log(`  Sheet: ${sheetName} | Rows: ${rows.length} | Headers: ${headers.join(", ")}`);

      // Detect entity ID column
      let entityCol: string | null = null;
      for (const h of headers) {
        if (ENTITY_ID_TARGETS.includes(h.toLowerCase().replace(/[\s_-]+/g, "_"))) {
          entityCol = h;
          break;
        }
      }
      console.log(`  Entity column: ${entityCol || "NOT FOUND"}`);

      // Detect year/month columns
      let yearCol: string | null = null;
      let monthCol: string | null = null;
      for (const h of headers) {
        const lower = h.toLowerCase().replace(/[\s_-]+/g, "_");
        if (YEAR_TARGETS.includes(lower)) yearCol = h;
        if (MONTH_TARGETS.includes(lower)) monthCol = h;
      }

      // For roster: extract entity metadata
      if (file.isRoster) {
        let nameCol: string | null = null;
        let roleCol: string | null = null;
        let licenseCol: string | null = null;
        for (const h of headers) {
          const lower = h.toLowerCase().replace(/[\s_-]+/g, "");
          if (NAME_TARGETS.some(t => lower.includes(t))) nameCol = h;
          if (ROLE_TARGETS.some(t => lower.includes(t))) roleCol = h;
          if (LICENSE_TARGETS.some(t => lower.includes(t))) licenseCol = h;
        }
        console.log(`  Roster: name=${nameCol}, role=${roleCol}, licenses=${licenseCol}`);

        for (const row of rows) {
          if (entityCol && row[entityCol]) {
            const eid = String(row[entityCol]).trim();
            rosterMeta.set(eid, {
              name: nameCol && row[nameCol] ? String(row[nameCol]).trim() : undefined,
              role: roleCol && row[roleCol] ? String(row[roleCol]).trim() : undefined,
              licenses: licenseCol && row[licenseCol] ? String(row[licenseCol]).trim() : undefined,
            });
          }
        }
        console.log(`  Roster metadata: ${rosterMeta.size} entities`);
      }

      // Collect unique entity IDs
      const fileEntityIds = new Set<string>();
      for (const row of rows) {
        if (entityCol && row[entityCol]) {
          fileEntityIds.add(String(row[entityCol]).trim());
        }
      }

      // Create entities that don't exist yet
      const newEntityIds = Array.from(fileEntityIds).filter(eid => !entityIdMap.has(eid));
      if (newEntityIds.length > 0) {
        const entities = newEntityIds.map(eid => {
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

        const { data: inserted, error: entErr } = await sb.from("entities").insert(entities).select("id, external_id");
        if (entErr) {
          console.log(`  Entity create ERROR: ${entErr.message}`);
        } else if (inserted) {
          for (const e of inserted) {
            if (e.external_id) entityIdMap.set(e.external_id, e.id);
          }
          console.log(`  Created ${inserted.length} entities`);
        }
      }

      // Also fetch any entities that already existed
      const existingIds = Array.from(fileEntityIds).filter(eid => !entityIdMap.has(eid));
      if (existingIds.length > 0) {
        const { data: existing } = await sb.from("entities").select("id, external_id").eq("tenant_id", TENANT).in("external_id", existingIds);
        for (const e of existing || []) {
          if (e.external_id) entityIdMap.set(e.external_id, e.id);
        }
      }

      // Detect periods
      const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

      for (const row of rows) {
        let year: number | null = null;
        let month: number | null = null;
        if (yearCol && row[yearCol] != null) {
          const n = Number(row[yearCol]);
          if (n >= 2020 && n <= 2030) year = n;
        }
        if (monthCol && row[monthCol] != null) {
          const n = Number(row[monthCol]);
          if (n >= 1 && n <= 12) month = n;
        }
        if (year && month) {
          const key = `${year}-${String(month).padStart(2, "0")}`;
          if (!periodKeyMap.has(key)) {
            // Check if period already exists
            const { data: existing } = await sb.from("periods").select("id").eq("tenant_id", TENANT).eq("canonical_key", key).single();
            if (existing) {
              periodKeyMap.set(key, existing.id);
            } else {
              const lastDay = new Date(year, month, 0).getDate();
              const { data: p, error: pErr } = await sb.from("periods").insert({
                tenant_id: TENANT,
                canonical_key: key,
                label: `${MONTH_NAMES[month]} ${year}`,
                period_type: "monthly",
                start_date: `${year}-${String(month).padStart(2, "0")}-01`,
                end_date: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
                status: "open",
                metadata: { year, month },
              }).select("id").single();
              if (p) {
                periodKeyMap.set(key, p.id);
                console.log(`  Created period: ${key} (${MONTH_NAMES[month]} ${year})`);
              } else if (pErr) {
                console.log(`  Period error: ${pErr.message}`);
              }
            }
          }
        }
      }

      // Resolve data_type from filename (no AI context — this IS the gap)
      const dataType = file.name.replace(/\.[^.]+$/, "");

      // Build and insert committed_data
      const insertRows = rows.map((row, i) => {
        let entityId: string | null = null;
        if (entityCol && row[entityCol]) {
          entityId = entityIdMap.get(String(row[entityCol]).trim()) || null;
        }

        let periodId: string | null = null;
        if (yearCol && monthCol && row[yearCol] && row[monthCol]) {
          const key = `${Number(row[yearCol])}-${String(Number(row[monthCol])).padStart(2, "0")}`;
          periodId = periodKeyMap.get(key) || null;
        }
        // Fallback for files without year/month: use first period
        if (!periodId && periodKeyMap.size > 0) {
          periodId = Array.from(periodKeyMap.values())[0];
        }

        return {
          tenant_id: TENANT,
          entity_id: entityId,
          period_id: periodId,
          data_type: dataType,
          row_data: { ...row, _sheetName: sheetName, _rowIndex: i },
          metadata: { source_file: file.name, source_sheet: sheetName },
        };
      });

      const CHUNK = 5000;
      let totalInserted = 0;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const slice = insertRows.slice(i, i + CHUNK);
        const { error: insErr } = await sb.from("committed_data").insert(slice);
        if (insErr) {
          console.log(`  Insert ERROR at chunk ${Math.floor(i / CHUNK)}: ${insErr.message}`);
          break;
        }
        totalInserted += slice.length;
      }

      console.log(`  Inserted: ${totalInserted} rows (data_type: ${dataType})`);
    }
  }

  // Rule set assignments via ProductLicenses
  console.log("\n--- Rule Set Assignments ---");
  const { data: allRS } = await sb.from("rule_sets").select("id, name").eq("tenant_id", TENANT).eq("status", "active");
  console.log(`Active rule sets: ${allRS?.length ?? 0}`);

  if (allRS && allRS.length > 0) {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
    const rsNameMap = new Map(allRS.map(rs => [normalize(rs.name || ""), rs.id]));

    const assignments: Array<{ tenant_id: string; entity_id: string; rule_set_id: string; effective_from: string }> = [];
    const existingAssign = new Set<string>();

    for (const [externalId, entityUuid] of Array.from(entityIdMap.entries())) {
      const meta = rosterMeta.get(externalId);
      const licenses = meta?.licenses;

      if (licenses) {
        const licenseList = licenses.split(",").map(l => l.trim()).filter(Boolean);
        for (const license of licenseList) {
          const normalizedLicense = normalize(license);
          let matchedRsId: string | undefined;
          for (const [rsNorm, rsId] of Array.from(rsNameMap.entries())) {
            if (rsNorm.includes(normalizedLicense) || normalizedLicense.includes(rsNorm)) {
              matchedRsId = rsId;
              break;
            }
          }
          if (matchedRsId && !existingAssign.has(`${entityUuid}:${matchedRsId}`)) {
            assignments.push({ tenant_id: TENANT, entity_id: entityUuid, rule_set_id: matchedRsId, effective_from: "2024-01-01" });
            existingAssign.add(`${entityUuid}:${matchedRsId}`);
          }
        }
      } else {
        // No licenses — assign to all rule sets
        for (const rs of allRS) {
          if (!existingAssign.has(`${entityUuid}:${rs.id}`)) {
            assignments.push({ tenant_id: TENANT, entity_id: entityUuid, rule_set_id: rs.id, effective_from: "2024-01-01" });
            existingAssign.add(`${entityUuid}:${rs.id}`);
          }
        }
      }
    }

    if (assignments.length > 0) {
      const { error: aErr } = await sb.from("rule_set_assignments").insert(assignments);
      if (aErr) {
        console.log(`  Assignment ERROR: ${aErr.message}`);
      } else {
        console.log(`  Created ${assignments.length} assignments`);
        const byRS = new Map<string, number>();
        for (const a of assignments) {
          byRS.set(a.rule_set_id, (byRS.get(a.rule_set_id) || 0) + 1);
        }
        for (const [rsId, count] of Array.from(byRS.entries())) {
          const rs = allRS.find(r => r.id === rsId);
          console.log(`    ${rs?.name ?? rsId}: ${count}`);
        }
      }
    }
  }

  // Final summary
  console.log("\n\n=== STEP 2 FINAL STATE ===\n");

  const { data: cdData } = await sb.from("committed_data").select("data_type, entity_id, period_id").eq("tenant_id", TENANT);
  const byType = new Map<string, { rows: number; entities: Set<string>; periods: Set<string> }>();
  for (const row of cdData || []) {
    const key = row.data_type || "null";
    if (!byType.has(key)) byType.set(key, { rows: 0, entities: new Set(), periods: new Set() });
    const e = byType.get(key)!;
    e.rows++;
    if (row.entity_id) e.entities.add(row.entity_id);
    if (row.period_id) e.periods.add(row.period_id);
  }

  console.log("| data_type | rows | entities | periods |");
  console.log("|-----------|------|----------|---------|");
  for (const [dt, info] of Array.from(byType.entries()).sort()) {
    console.log(`| ${dt} | ${info.rows} | ${info.entities.size} | ${info.periods.size} |`);
  }

  const { count: ec } = await sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  const { data: pds } = await sb.from("periods").select("canonical_key, label, id").eq("tenant_id", TENANT);
  const { count: ac } = await sb.from("rule_set_assignments").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);

  console.log(`\nTotal rows: ${cdData?.length ?? 0}`);
  console.log(`Entities: ${ec}`);
  console.log(`Periods: ${pds?.length ?? 0}`);
  for (const p of pds || []) console.log(`  ${p.canonical_key} (${p.label}) — ${p.id}`);
  console.log(`Assignments: ${ac}`);
}

main().catch(console.error);
