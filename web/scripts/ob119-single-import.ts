/**
 * OB-119 Diagnostic: Import a single transaction file and check entity linkage
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
const ADMIN_PROFILE_ID = "6b25d749-0f6a-4261-9fd5-14b823f5fcde";

async function main() {
  // Authenticate
  const { data: authData } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!authData.session) { console.error("Auth failed"); return; }

  const session = authData.session;
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
  });
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieHeader = `${cookieName}=${encodeURIComponent(sessionJson)}`;

  // Import just one loan disbursement file
  console.log("Importing CFG_Loan_Disbursements_Jan2024.csv...");
  const resp = await fetch("http://localhost:3000/api/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({
      tenantId: TENANT,
      userId: ADMIN_PROFILE_ID,
      fileName: "CFG_Loan_Disbursements_Jan2024.csv",
      storagePath: `${TENANT}/8fc08a76-e6d9-42ac-8070-492b5774523b/CFG_Loan_Disbursements_Jan2024.csv`,
      sheetMappings: {},
    }),
  });

  const data = await resp.json();
  console.log("Result:", JSON.stringify(data, null, 2));

  // Check entity linkage for the newly imported rows
  const { count: total } = await sb.from("committed_data").select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT).eq("data_type", "loan_disbursements");
  const { count: linked } = await sb.from("committed_data").select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT).eq("data_type", "loan_disbursements").not("entity_id", "is", null);
  console.log(`\nEntity linkage: ${linked}/${total} rows`);

  // Check a sample row
  const { data: sample } = await sb.from("committed_data").select("row_data, entity_id")
    .eq("tenant_id", TENANT).eq("data_type", "loan_disbursements").limit(1);
  if (sample?.[0]) {
    const rd = sample[0].row_data as Record<string, unknown>;
    console.log(`Sample row entity_id: ${sample[0].entity_id}`);
    console.log(`OfficerID in row_data: ${rd.OfficerID}`);
    console.log(`entity_id in row_data: ${rd.entity_id}`);
    console.log(`Keys: ${Object.keys(rd).join(", ")}`);
  }
}

main().catch(console.error);
