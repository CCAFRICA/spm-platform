/**
 * CLT-118: Check storage bucket structure
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // List buckets
  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  console.log("=== Storage Buckets ===");
  for (const b of buckets || []) {
    console.log(`  ${b.id} (${b.name}) — public: ${b.public}`);
  }
  if (bErr) console.log("Bucket error:", bErr.message);

  // Try listing root of imports bucket
  console.log("\n=== imports bucket root ===");
  const { data: rootFiles, error: rErr } = await sb.storage.from("imports").list("", { limit: 50 });
  if (rErr) console.log("Error:", rErr.message);
  for (const f of rootFiles || []) {
    console.log(`  ${f.name} — id:${f.id} — type:${f.metadata?.mimetype || "folder?"}`);
  }

  // Try listing tenant subfolder
  console.log(`\n=== imports/${TENANT} ===`);
  const { data: tenantFiles, error: tErr } = await sb.storage.from("imports").list(TENANT, { limit: 50 });
  if (tErr) console.log("Error:", tErr.message);
  for (const f of tenantFiles || []) {
    console.log(`  ${f.name} — id:${f.id} — metadata:${JSON.stringify(f.metadata)}`);
  }

  // Try downloading one file with full path
  if (tenantFiles && tenantFiles.length > 0) {
    const firstFile = tenantFiles[0];
    console.log(`\n=== Try download: ${TENANT}/${firstFile.name} ===`);
    const { data, error } = await sb.storage.from("imports").download(`${TENANT}/${firstFile.name}`);
    if (error) {
      console.log("Download error:", JSON.stringify(error));
    } else if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      console.log(`  Size: ${buf.length} bytes`);
      console.log(`  First bytes: ${buf.slice(0, 20).toString("hex")}`);
    }
  }

  // Also check ingestion-raw bucket
  console.log("\n=== ingestion-raw bucket ===");
  const { data: ingFiles, error: iErr } = await sb.storage.from("ingestion-raw").list("", { limit: 20 });
  if (iErr) console.log("Error:", iErr.message);
  for (const f of ingFiles || []) {
    console.log(`  ${f.name}`);
  }

  // Check if files might be in a different bucket path
  console.log("\n=== Try other path patterns ===");
  const patterns = [
    `${TENANT}/plans`,
    `${TENANT}/data`,
    `plans/${TENANT}`,
    `data/${TENANT}`,
    "plans",
    "data",
  ];
  for (const p of patterns) {
    const { data, error } = await sb.storage.from("imports").list(p, { limit: 5 });
    if (data && data.length > 0) {
      console.log(`  ${p}: ${data.length} files — ${data.map(f => f.name).join(", ")}`);
    }
  }
}

main().catch(console.error);
