/**
 * CLT-118: Inspect data files to understand entity/period columns
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const FILES = [
  { uuid: "8fc08a76-e6d9-42ac-8070-492b5774523b", name: "CFG_Loan_Disbursements_Jan2024.csv" },
  { uuid: "47183303-3b8f-416d-8914-009e79535eb3", name: "CFG_Mortgage_Closings_Q1_2024.csv" },
  { uuid: "2746ff55-d7ca-4c22-a23a-5da510463abb", name: "CFG_Insurance_Referrals_Q1_2024.csv" },
  { uuid: "7ca2fcde-9180-4c43-aecd-191403e448f5", name: "CFG_Deposit_Balances_Q1_2024.csv" },
  { uuid: "0b9d64e6-55e0-4f10-bd9d-682342cb9067", name: "CFG_Loan_Defaults_Q1_2024.csv" },
];

async function main() {
  for (const file of FILES) {
    const storagePath = `${TENANT}/${file.uuid}/${file.name}`;
    const { data: blob } = await sb.storage.from("imports").download(storagePath);
    if (!blob) continue;

    const buffer = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });

    console.log(`\n=== ${file.name} ===`);
    console.log(`Headers: ${Object.keys(rows[0] || {}).join(", ")}`);
    console.log(`Sample row 1: ${JSON.stringify(rows[0])}`);
    if (rows[1]) console.log(`Sample row 2: ${JSON.stringify(rows[1])}`);

    // Check date-like fields
    for (const [key, val] of Object.entries(rows[0] || {})) {
      if (typeof val === "number" && val > 25000 && val < 100000) {
        const d = new Date((val - 25569) * 86400 * 1000);
        console.log(`  ${key}: ${val} → Excel date → ${d.toISOString().substring(0, 10)}`);
      }
      if (typeof val === "string" && /\d{4}[-\/]\d{2}/.test(val)) {
        console.log(`  ${key}: "${val}" → ISO-like date string`);
      }
    }

    // Check if OfficerID values match EmployeeID values from roster
    const officerIds = new Set(rows.slice(0, 5).map(r => r.OfficerID || r.EmployeeID).filter(Boolean).map(String));
    console.log(`  Officer/Entity IDs sample: ${Array.from(officerIds).join(", ")}`);
  }

  // Also check what the roster EmployeeIDs look like
  const rosterPath = `${TENANT}/4e080bf2-37c7-4df0-ad1a-a8279e2b63ec/CFG_Personnel_Q1_2024.xlsx`;
  const { data: rBlob } = await sb.storage.from("imports").download(rosterPath);
  if (rBlob) {
    const rBuf = Buffer.from(await rBlob.arrayBuffer());
    const rWb = XLSX.read(rBuf, { type: "buffer" });
    const rRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(rWb.Sheets[rWb.SheetNames[0]], { defval: null, raw: true });
    const empIds = rRows.slice(0, 5).map(r => r.EmployeeID).filter(Boolean).map(String);
    console.log(`\nRoster EmployeeIDs sample: ${empIds.join(", ")}`);
    console.log(`Roster sample: ${JSON.stringify(rRows[0])}`);
  }

  // Check current committed_data state
  const { count } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT);
  console.log(`\nTotal committed_data: ${count}`);

  // Check nulls
  const { count: nullEntity } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("entity_id", null);
  const { count: nullPeriod } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).is("period_id", null);
  console.log(`  null entity_id: ${nullEntity}`);
  console.log(`  null period_id: ${nullPeriod}`);
}

main().catch(console.error);
