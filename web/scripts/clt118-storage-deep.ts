/**
 * CLT-118: Deep storage exploration — check if UUIDs are folders
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  const { data: uuids } = await sb.storage.from("imports").list(TENANT, { limit: 50 });

  for (const u of uuids || []) {
    const subPath = `${TENANT}/${u.name}`;
    console.log(`--- ${subPath} ---`);

    // Try listing it as a folder
    const { data: subFiles, error } = await sb.storage.from("imports").list(subPath, { limit: 10 });
    if (error) {
      console.log(`  List error: ${JSON.stringify(error)}`);
    }
    if (subFiles && subFiles.length > 0) {
      for (const sf of subFiles) {
        console.log(`  FILE: ${sf.name} — metadata: ${JSON.stringify(sf.metadata)}`);
        // Try to download
        const dlPath = `${subPath}/${sf.name}`;
        const { data: blob, error: dlErr } = await sb.storage.from("imports").download(dlPath);
        if (dlErr) {
          console.log(`    Download error: ${JSON.stringify(dlErr)}`);
        } else if (blob) {
          const buf = Buffer.from(await blob.arrayBuffer());
          console.log(`    Size: ${buf.length} bytes`);
          console.log(`    First 4 bytes: ${buf.slice(0, 4).toString("hex")} (${buf.slice(0, 4).toString("ascii")})`);
        }
      }
    } else {
      console.log("  (empty or not a folder)");
    }
  }
}

main().catch(console.error);
