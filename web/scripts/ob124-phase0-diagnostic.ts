/**
 * OB-124 Phase 0: Architecture-level diagnostic — file processing pipeline trace
 *
 * This script traces the XLSX/CSV file processing pipeline to identify
 * where multi-tab and multi-file data gets lost.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob124-phase0-diagnostic.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  OB-124 Phase 0: File Processing Pipeline Diagnostic     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // ── 1. Check committed_data data_types for LAB ──
  console.log("=== 1. LAB committed_data data_types ===\n");

  const { data: dtRows } = await sb.from("committed_data")
    .select("data_type, metadata")
    .eq("tenant_id", LAB)
    .not("data_type", "is", null)
    .limit(5000);

  const byDataType: Record<string, { count: number; sheets: Set<string> }> = {};
  for (const r of dtRows || []) {
    const dt = r.data_type as string;
    if (!byDataType[dt]) byDataType[dt] = { count: 0, sheets: new Set() };
    byDataType[dt].count++;
    const meta = r.metadata as Record<string, unknown> | null;
    if (meta?.source_sheet) byDataType[dt].sheets.add(meta.source_sheet as string);
  }

  for (const [dt, info] of Object.entries(byDataType).sort()) {
    console.log(`  ${dt}: ${info.count} rows (sheets: ${Array.from(info.sheets).join(", ") || "unknown"})`);
  }
  console.log(`  TOTAL: ${dtRows?.length || 0} rows across ${Object.keys(byDataType).length} data_types`);

  // ── 2. Check for Deposit Growth data specifically ──
  console.log("\n=== 2. Deposit Growth data trace ===\n");

  const { data: depositRows } = await sb.from("committed_data")
    .select("data_type, metadata, row_data")
    .eq("tenant_id", LAB)
    .ilike("data_type", "%deposit%")
    .limit(20);

  if (!depositRows || depositRows.length === 0) {
    console.log("  NO deposit-related data found in committed_data");
  } else {
    console.log(`  Found ${depositRows.length} deposit rows`);
    for (const r of depositRows.slice(0, 5)) {
      const meta = r.metadata as Record<string, unknown> | null;
      const rd = r.row_data as Record<string, unknown> | null;
      console.log(`  data_type: ${r.data_type}`);
      console.log(`    source_sheet: ${meta?.source_sheet || "unknown"}`);
      console.log(`    _sheetName: ${rd?._sheetName || "unknown"}`);
      console.log(`    sample keys: ${rd ? Object.keys(rd).slice(0, 8).join(", ") : "none"}`);
    }
  }

  // ── 3. Check if any data_type has rows from MULTIPLE sheets ──
  console.log("\n=== 3. Multi-sheet collision check ===\n");

  let collisions = 0;
  for (const [dt, info] of Object.entries(byDataType)) {
    if (info.sheets.size > 1) {
      collisions++;
      console.log(`  COLLISION: data_type "${dt}" has rows from ${info.sheets.size} sheets: ${Array.from(info.sheets).join(", ")}`);
    }
  }
  if (collisions === 0) {
    console.log("  No multi-sheet collisions found (each data_type maps to 1 sheet)");
  }

  // ── 4. Check import_batches for multi-sheet files ──
  console.log("\n=== 4. Import batch analysis ===\n");

  const { data: batches } = await sb.from("import_batches")
    .select("id, file_name, status, record_count, metadata")
    .eq("tenant_id", LAB)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const b of batches || []) {
    const meta = b.metadata as Record<string, unknown> | null;
    const aiContext = meta?.aiContext as Record<string, unknown> | null;
    const sheets = (aiContext?.sheets || []) as Array<Record<string, unknown>>;
    console.log(`  Batch: ${b.file_name} | status: ${b.status} | records: ${b.record_count}`);
    if (sheets.length > 0) {
      console.log(`    AI context sheets: ${sheets.map(s => `${s.sheetName} (${s.classification})`).join(", ")}`);
    }
  }

  // ── 5. Check _sheetName distribution in row_data ──
  console.log("\n=== 5. Sheet name distribution in row_data ===\n");

  const { data: allRows } = await sb.from("committed_data")
    .select("row_data")
    .eq("tenant_id", LAB)
    .limit(5000);

  const sheetNameCounts: Record<string, number> = {};
  for (const r of allRows || []) {
    const rd = r.row_data as Record<string, unknown> | null;
    const sn = (rd?._sheetName as string) || "MISSING";
    sheetNameCounts[sn] = (sheetNameCounts[sn] || 0) + 1;
  }

  for (const [sn, count] of Object.entries(sheetNameCounts).sort()) {
    console.log(`  _sheetName="${sn}": ${count} rows`);
  }

  // ── 6. resolveDataType analysis ──
  console.log("\n=== 6. resolveDataType bottleneck analysis ===\n");
  console.log("  Location: web/src/app/api/import/commit/route.ts:757-779");
  console.log("  Bug: Priority 3 uses normalizeFileNameToDataType(fileName) — the FILE name, not SHEET name");
  console.log("  Effect: ALL tabs in a multi-tab XLSX get the SAME data_type");
  console.log("  Example: CFG_Deposit_Growth_Q1_2024.xlsx → Tab 1 & Tab 2 BOTH get 'deposit_growth'");
  console.log("");
  console.log("  Priority chain:");
  console.log("    1. AI matchedComponent (per-sheet) — WORKS but often absent for targets tabs");
  console.log("    2. AI classification + filename stem — WORKS but produces same prefix for all tabs");
  console.log("    3. normalizeFileNameToDataType(fileName) — BUG: ignores sheetName entirely");
  console.log("    4. Sheet name fallback — NEVER REACHED (Priority 3 always returns for real files)");

  // ── 7. files[0] / SheetNames[0] inventory ──
  console.log("\n=== 7. files[0] / SheetNames[0] bottleneck inventory ===\n");
  console.log("  enhanced/page.tsx:1420 — files[0] in single-file path (correct behavior)");
  console.log("  enhanced/page.tsx:1429 — files[0] for commit compat ref (not a bottleneck)");
  console.log("  plan-import/page.tsx:323 — files[0] only (plan import, out of scope)");
  console.log("  forensics/ComparisonUpload.tsx:76 — SheetNames[0] (forensics, out of scope)");
  console.log("  reconciliation/page.tsx:275 — SheetNames[0] (reconciliation, out of scope)");
  console.log("  file-parser.ts:446 — SheetNames[0] default (not used by enhanced import)");

  // ── 8. Verdict ──
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  VERDICT                                                  ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║                                                           ║");
  console.log("║  Multi-tab PARSING works — all sheets iterated in:        ║");
  console.log("║    • parseAllSheets() (client, line 1258)                 ║");
  console.log("║    • commit API (server, line 138)                        ║");
  console.log("║                                                           ║");
  console.log("║  Multi-file PARSING works — OB-111 processes all files    ║");
  console.log("║                                                           ║");
  console.log("║  ROOT CAUSE: resolveDataType() in commit API (line 757)   ║");
  console.log("║  Priority 3 uses fileName, not sheetName → ALL tabs get   ║");
  console.log("║  the SAME data_type → convergence can't distinguish       ║");
  console.log("║  Tab 1 (actuals) from Tab 2 (targets)                     ║");
  console.log("║                                                           ║");
  console.log("║  FIX: When workbook has >1 sheet, incorporate sheetName   ║");
  console.log("║  into data_type: normalizedFile__normalizedSheet          ║");
  console.log("║                                                           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
