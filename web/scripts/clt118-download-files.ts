/**
 * CLT-118: Download all storage files, identify them, save locally for re-import
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const OUT_DIR = "/tmp/clt118-files";

async function main() {
  console.log("=== CLT-118: Download & Identify Storage Files ===\n");

  // Create output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data: files } = await sb.storage
    .from("imports")
    .list(TENANT, { limit: 100 });

  if (!files || files.length === 0) {
    console.log("No files found in storage!");
    return;
  }

  console.log(`Found ${files.length} files. Downloading and identifying...\n`);

  for (const f of files) {
    const storagePath = `${TENANT}/${f.name}`;
    const { data: blob, error } = await sb.storage
      .from("imports")
      .download(storagePath);

    if (error || !blob) {
      console.log(`  ${f.name}: DOWNLOAD ERROR — ${error?.message}`);
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const size = buffer.length;

    // Detect file type by magic bytes
    const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50; // %P
    const isXLSX = buffer[0] === 0x50 && buffer[1] === 0x4B; // PK (zip)
    const isCSV = !isPDF && !isXLSX;

    let fileType = isCSV ? "csv" : isPDF ? "pdf" : "xlsx";
    let identity = "UNKNOWN";
    let headers = "";
    let rowCount = 0;
    let sheetNames: string[] = [];

    if (isCSV) {
      const text = buffer.toString("utf-8");
      const lines = text.split("\n").filter(l => l.trim());
      headers = lines[0] || "";
      rowCount = lines.length - 1;

      // Identify by headers
      const h = headers.toLowerCase();
      if (h.includes("loanamount") && h.includes("loanid")) {
        // Check for month indicators
        const sample = lines.slice(1, 5).join(" ");
        if (sample.includes("2024-01") || sample.includes("Jan")) identity = "CFG_Loan_Disbursements_Jan2024";
        else if (sample.includes("2024-02") || sample.includes("Feb")) identity = "CFG_Loan_Disbursements_Feb2024";
        else if (sample.includes("2024-03") || sample.includes("Mar")) identity = "CFG_Loan_Disbursements_Mar2024";
        else identity = "CFG_Loan_Disbursements_UNKNOWN";
      } else if (h.includes("mortgageamount") || h.includes("closingdate")) {
        identity = "CFG_Mortgage_Closings_Q1_2024";
      } else if (h.includes("productcode") && h.includes("qualified")) {
        identity = "CFG_Insurance_Referrals_Q1_2024";
      } else if (h.includes("depositbalance") || h.includes("totaldeposit")) {
        identity = "CFG_Deposit_Balances_Q1_2024";
      } else if (h.includes("defaultamount") || h.includes("default")) {
        identity = "CFG_Loan_Defaults_Q1_2024";
      }
    } else if (isXLSX) {
      try {
        const wb = XLSX.read(buffer, { type: "buffer" });
        sheetNames = wb.SheetNames;
        const firstSheet = wb.Sheets[sheetNames[0]];
        const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
        headers = (data[0] || []).join(", ");
        rowCount = data.length - 1;

        const h = headers.toLowerCase();
        if (h.includes("employeeid") && h.includes("name")) {
          identity = "CFG_Personnel_Q1_2024";
        } else if (h.includes("insurance") || h.includes("referral") || h.includes("productcode")) {
          identity = "CFG_Insurance_Referral_Program_2024";
        } else if (h.includes("deposit") || h.includes("growth") || h.includes("incentive") || h.includes("target")) {
          identity = "CFG_Deposit_Growth_Incentive_Q1_2024";
        } else if (sheetNames.length > 1) {
          // Multi-tab — might be deposit growth with targets
          identity = `MULTI_TAB_XLSX (${sheetNames.length} sheets)`;
        }
      } catch (e) {
        identity = "XLSX_PARSE_ERROR";
      }
    } else if (isPDF) {
      // Can't easily parse PDF content, but save it
      const text = buffer.toString("utf-8", 0, 2000);
      if (text.toLowerCase().includes("consumer") || text.toLowerCase().includes("lending")) {
        identity = "CFG_Consumer_Lending_Commission_2024";
      } else if (text.toLowerCase().includes("mortgage")) {
        identity = "CFG_Mortgage_Origination_Bonus_2024";
      } else {
        identity = "UNKNOWN_PDF";
      }
    }

    // Save file locally
    const ext = fileType;
    const localName = `${identity}.${ext}`;
    const localPath = path.join(OUT_DIR, localName);
    fs.writeFileSync(localPath, buffer);

    // Also save with UUID name for reference
    const uuidPath = path.join(OUT_DIR, `${f.name}.${ext}`);
    fs.writeFileSync(uuidPath, buffer);

    console.log(`  ${f.name}`);
    console.log(`    Type: ${fileType} | Size: ${(size/1024).toFixed(1)}KB | Rows: ${rowCount}`);
    console.log(`    Identity: ${identity}`);
    if (headers) console.log(`    Headers: ${headers.substring(0, 120)}`);
    if (sheetNames.length > 0) console.log(`    Sheets: ${sheetNames.join(", ")}`);
    console.log(`    Saved: ${localPath}`);
    console.log();
  }

  // List all identified files
  console.log("--- IDENTIFIED FILES ---");
  const saved = fs.readdirSync(OUT_DIR).filter(f => !f.match(/^[0-9a-f]{8}-/));
  for (const f of saved.sort()) {
    const stat = fs.statSync(path.join(OUT_DIR, f));
    console.log(`  ${f} (${(stat.size/1024).toFixed(1)}KB)`);
  }
}

main().catch(console.error);
