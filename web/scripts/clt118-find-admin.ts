/**
 * CLT-118: Find admin user for MBC tenant
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Find profiles for this tenant
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, auth_user_id, email, role, display_name, tenant_id")
    .eq("tenant_id", TENANT);

  console.log("=== MBC Tenant Profiles ===");
  for (const p of profiles || []) {
    console.log(`  ${p.email} | role: ${p.role} | name: ${p.display_name} | auth_id: ${p.auth_user_id}`);
  }

  // Also check auth.users for these
  if (profiles && profiles.length > 0) {
    console.log("\n=== Auth Users ===");
    for (const p of profiles) {
      if (p.auth_user_id) {
        const { data: authUser } = await sb.auth.admin.getUserById(p.auth_user_id);
        if (authUser?.user) {
          console.log(`  ${authUser.user.email} | confirmed: ${!!authUser.user.email_confirmed_at} | created: ${authUser.user.created_at}`);
        }
      }
    }
  }
}

main().catch(console.error);
