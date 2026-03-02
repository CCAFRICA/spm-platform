/**
 * CLT-118 STEP 2: Import Transaction Data Files through Pipeline
 *
 * Re-uploads data files from storage and imports via /api/import/commit.
 * Tests: AI classification, entity resolution, period detection, data commit.
 */
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const BASE_URL = "http://localhost:3000";
const PROJECT_REF = "bayqxeiltnpjrvflksfa";

// Map of UUID folder → filename (from storage deep scan)
const STORAGE_FILES: Array<{ uuid: string; fileName: string; type: "roster" | "data" }> = [
  { uuid: "4e080bf2-37c7-4df0-ad1a-a8279e2b63ec", fileName: "CFG_Personnel_Q1_2024.xlsx", type: "roster" },
  { uuid: "8fc08a76-e6d9-42ac-8070-492b5774523b", fileName: "CFG_Loan_Disbursements_Jan2024.csv", type: "data" },
  { uuid: "949fddf0-ad7c-4220-a642-627efcb52b33", fileName: "CFG_Loan_Disbursements_Feb2024.csv", type: "data" },
  { uuid: "e6bfacfd-3b60-45b9-9b52-4f19ec2a68e6", fileName: "CFG_Loan_Disbursements_Mar2024.csv", type: "data" },
  { uuid: "47183303-3b8f-416d-8914-009e79535eb3", fileName: "CFG_Mortgage_Closings_Q1_2024.csv", type: "data" },
  { uuid: "2746ff55-d7ca-4c22-a23a-5da510463abb", fileName: "CFG_Insurance_Referrals_Q1_2024.csv", type: "data" },
  { uuid: "7ca2fcde-9180-4c43-aecd-191403e448f5", fileName: "CFG_Deposit_Balances_Q1_2024.csv", type: "data" },
  { uuid: "0b9d64e6-55e0-4f10-bd9d-682342cb9067", fileName: "CFG_Loan_Defaults_Q1_2024.csv", type: "data" },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await sb.auth.signInWithPassword({
    email: "admin@caribefinancial.mx",
    password: "demo-password-VL1",
  });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const token = data.session!.access_token;
  const refresh = data.session!.refresh_token;

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

async function classifyFile(headers: Record<string, string>, fileName: string, preview: string) {
  try {
    const resp = await fetch(`${BASE_URL}/api/ai/classify-file`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName, contentPreview: preview, tenantId: TENANT }),
    });
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function interpretImport(headers: Record<string, string>, headerRow: string, sampleData: string) {
  try {
    const resp = await fetch(`${BASE_URL}/api/interpret-import`, {
      method: "POST",
      headers,
      body: JSON.stringify({ headers: headerRow, sampleData, tenantId: TENANT }),
    });
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function main() {
  console.log("=== CLT-118 STEP 2: Import Transaction Data ===\n");

  const headers = await getAuthHeaders();
  console.log("Authenticated\n");

  // Import roster FIRST (entities must exist before data)
  const importOrder = [
    ...STORAGE_FILES.filter(f => f.type === "roster"),
    ...STORAGE_FILES.filter(f => f.type === "data"),
  ];

  const results: Array<{
    fileName: string;
    classification: string | null;
    recordCount: number;
    entityCount: number;
    periodCount: number;
    periods: string[];
    assignmentCount: number;
    success: boolean;
    error: string | null;
  }> = [];

  for (const file of importOrder) {
    console.log(`\n--- ${file.fileName} ---`);

    // Step A: Download file from storage to get preview
    const storagePath = `${TENANT}/${file.uuid}/${file.fileName}`;
    const { data: blob } = await sb.storage.from("imports").download(storagePath);
    if (!blob) {
      console.log("  DOWNLOAD FAILED");
      results.push({ fileName: file.fileName, classification: null, recordCount: 0, entityCount: 0, periodCount: 0, periods: [], assignmentCount: 0, success: false, error: "download failed" });
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const isXLSX = buffer[0] === 0x50 && buffer[1] === 0x4B;
    let preview = "";
    if (!isXLSX) {
      const text = buffer.toString("utf-8");
      const lines = text.split("\n").slice(0, 5);
      preview = lines.join("\n");
    } else {
      preview = `[XLSX file: ${file.fileName}, ${(buffer.length/1024).toFixed(1)}KB]`;
    }

    // Step B: AI classify file
    console.log("  Classifying...");
    const classification = await classifyFile(headers, file.fileName, preview);
    const fileType = classification.fileType || classification.classification?.fileType || "unknown";
    const sugModule = classification.suggestedModule || classification.classification?.suggestedModule || "unknown";
    console.log(`  Classification: ${fileType} → ${sugModule}`);

    // Step C: AI interpret field mappings (for CSV/data files)
    let sheetMappings: Record<string, Record<string, string>> = {};
    let aiContext: Record<string, unknown> | undefined;

    if (!isXLSX && preview) {
      const lines = buffer.toString("utf-8").split("\n").filter(l => l.trim());
      const headerLine = lines[0] || "";
      const sampleLines = lines.slice(1, 4).join("\n");

      console.log("  Interpreting field mappings...");
      const interpretation = await interpretImport(headers, headerLine, sampleLines);
      if (interpretation.mappings || interpretation.interpretation?.mappings) {
        const mappings = interpretation.mappings || interpretation.interpretation?.mappings;
        if (Array.isArray(mappings)) {
          const mappingObj: Record<string, string> = {};
          for (const m of mappings) {
            if (m.sourceColumn && m.suggestedMapping) {
              mappingObj[m.sourceColumn] = m.suggestedMapping;
            }
          }
          sheetMappings = { Sheet1: mappingObj };
          console.log(`  Mappings: ${Object.entries(mappingObj).map(([k,v]) => `${k}→${v}`).join(", ")}`);
        }
      }

      // Build AI context for the import commit
      const isRoster = file.type === "roster";
      const sheetClassification = isRoster ? "roster" : "component_data";
      aiContext = {
        tenantId: TENANT,
        timestamp: new Date().toISOString(),
        rosterSheet: isRoster ? "Sheet1" : null,
        rosterEmployeeIdColumn: isRoster ? "EmployeeID" : null,
        sheets: [{
          sheetName: isXLSX ? "Personnel" : "Sheet1",
          classification: sheetClassification,
          matchedComponent: null,
          matchedComponentConfidence: null,
          fieldMappings: Object.entries(sheetMappings.Sheet1 || {}).map(([source, target]) => ({
            sourceColumn: source,
            semanticType: target,
            confidence: 0.9,
          })),
        }],
      };
    } else if (isXLSX) {
      // XLSX roster — auto-detect
      aiContext = {
        tenantId: TENANT,
        timestamp: new Date().toISOString(),
        rosterSheet: "Personnel",
        rosterEmployeeIdColumn: "EmployeeID",
        sheets: [{
          sheetName: "Personnel",
          classification: "roster",
          matchedComponent: null,
          matchedComponentConfidence: null,
          fieldMappings: [
            { sourceColumn: "EmployeeID", semanticType: "employee_id", confidence: 1 },
            { sourceColumn: "Name", semanticType: "name", confidence: 1 },
            { sourceColumn: "Position", semanticType: "role", confidence: 1 },
            { sourceColumn: "ProductLicenses", semanticType: "productlicenses", confidence: 1 },
          ],
        }],
      };
      sheetMappings = {
        Personnel: {
          EmployeeID: "employee_id",
          Name: "name",
          Position: "role",
          ProductLicenses: "productlicenses",
        },
      };
    }

    // Step D: Commit via /api/import/commit
    console.log("  Committing...");
    try {
      const resp = await fetch(`${BASE_URL}/api/import/commit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId: TENANT,
          userId: "5e271084-2300-41d3-82bc-7a8955bc83ca",
          fileName: file.fileName,
          storagePath,
          sheetMappings,
          aiContext,
        }),
      });

      const data = await resp.json();
      if (data.success) {
        const periods = (data.periods || []).map((p: { key: string }) => p.key);
        console.log(`  OK: ${data.recordCount} records, ${data.entityCount} entities, ${data.periodCount} periods [${periods.join(", ")}], ${data.assignmentCount} assignments`);
        results.push({
          fileName: file.fileName,
          classification: `${fileType}:${sugModule}`,
          recordCount: data.recordCount,
          entityCount: data.entityCount,
          periodCount: data.periodCount,
          periods,
          assignmentCount: data.assignmentCount,
          success: true,
          error: null,
        });
      } else {
        console.log(`  FAIL: ${data.error}`);
        results.push({
          fileName: file.fileName,
          classification: `${fileType}:${sugModule}`,
          recordCount: 0, entityCount: 0, periodCount: 0, periods: [], assignmentCount: 0,
          success: false, error: data.error,
        });
      }
    } catch (err) {
      console.log(`  ERROR: ${err}`);
      results.push({
        fileName: file.fileName, classification: null,
        recordCount: 0, entityCount: 0, periodCount: 0, periods: [], assignmentCount: 0,
        success: false, error: String(err),
      });
    }
  }

  // Summary
  console.log("\n\n=== STEP 2 SUMMARY ===\n");
  console.log("| File | Records | Entities | Periods | Assignments | Status |");
  console.log("|------|---------|----------|---------|-------------|--------|");
  for (const r of results) {
    console.log(`| ${r.fileName} | ${r.recordCount} | ${r.entityCount} | ${r.periods.join(",")} | ${r.assignmentCount} | ${r.success ? "OK" : "FAIL"} |`);
  }

  // Post-import DB check
  console.log("\n--- Post-Data Import: Database Check ---");
  const { data: cdData } = await sb
    .from("committed_data")
    .select("data_type, entity_id, period_id")
    .eq("tenant_id", TENANT);

  const byType = new Map<string, { rows: number; entities: Set<string>; periods: Set<string> }>();
  for (const row of cdData || []) {
    const key = row.data_type || "null";
    if (!byType.has(key)) byType.set(key, { rows: 0, entities: new Set(), periods: new Set() });
    const entry = byType.get(key)!;
    entry.rows++;
    if (row.entity_id) entry.entities.add(row.entity_id);
    if (row.period_id) entry.periods.add(row.period_id);
  }

  console.log("\n| data_type | rows | entities | periods |");
  console.log("|-----------|------|----------|---------|");
  for (const [dt, info] of Array.from(byType.entries()).sort()) {
    console.log(`| ${dt} | ${info.rows} | ${info.entities.size} | ${info.periods.size} |`);
  }

  console.log(`\nTotal: ${cdData?.length ?? 0} rows`);

  // Entity count
  const { count: entityCount } = await sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  console.log(`Entities: ${entityCount}`);

  // Period count
  const { data: periods } = await sb.from("periods").select("id, canonical_key, label").eq("tenant_id", TENANT);
  console.log(`Periods: ${periods?.length ?? 0}`);
  for (const p of periods || []) {
    console.log(`  ${p.canonical_key} (${p.label}) — ${p.id}`);
  }

  // Assignment count
  const { data: assignments } = await sb
    .from("rule_set_assignments")
    .select("rule_set_id")
    .eq("tenant_id", TENANT);
  const rsByAssign = new Map<string, number>();
  for (const a of assignments || []) {
    rsByAssign.set(a.rule_set_id, (rsByAssign.get(a.rule_set_id) || 0) + 1);
  }
  console.log(`\nAssignments: ${assignments?.length ?? 0}`);
  for (const [rsId, count] of Array.from(rsByAssign.entries())) {
    const { data: rs } = await sb.from("rule_sets").select("name").eq("id", rsId).single();
    console.log(`  ${rs?.name ?? rsId}: ${count}`);
  }
}

main().catch(console.error);
