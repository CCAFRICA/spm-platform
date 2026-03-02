import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check profile IDs vs auth user IDs for MBC tenant
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, auth_user_id, email, role")
    .eq("tenant_id", "fa6a48c5-56dc-416d-9b7d-9c93d4882251");

  console.log("MBC Profiles:");
  for (const p of profiles || []) {
    console.log(`  profile.id: ${p.id}`);
    console.log(`  auth_user_id: ${p.auth_user_id}`);
    console.log(`  email: ${p.email}`);
    console.log();
  }

  // Try inserting with profile.id instead of auth_user_id
  const adminProfile = (profiles || []).find(p => p.role === "admin");
  if (adminProfile) {
    console.log(`\nTrying with profile.id: ${adminProfile.id}`);
    const { error: err1 } = await sb.from("rule_sets").insert({
      id: "00000000-0000-0000-0000-test00000001",
      tenant_id: "fa6a48c5-56dc-416d-9b7d-9c93d4882251",
      name: "TEST_DELETE_ME",
      status: "draft",
      components: {},
      input_bindings: {},
      cadence_config: {},
      outcome_config: {},
      metadata: {},
      population_config: {},
      created_by: adminProfile.id,
    });
    console.log(`  Profile.id result: ${err1 ? "ERROR: " + err1.message : "OK"}`);

    if (!err1) {
      // Clean up
      await sb.from("rule_sets").delete().eq("id", "00000000-0000-0000-0000-test00000001");
      console.log("  Cleaned up test row");
    }

    // Try with auth_user_id
    console.log(`\nTrying with auth_user_id: ${adminProfile.auth_user_id}`);
    const { error: err2 } = await sb.from("rule_sets").insert({
      id: "00000000-0000-0000-0000-test00000002",
      tenant_id: "fa6a48c5-56dc-416d-9b7d-9c93d4882251",
      name: "TEST_DELETE_ME_2",
      status: "draft",
      components: {},
      input_bindings: {},
      cadence_config: {},
      outcome_config: {},
      metadata: {},
      population_config: {},
      created_by: adminProfile.auth_user_id,
    });
    console.log(`  Auth_user_id result: ${err2 ? "ERROR: " + err2.message : "OK"}`);

    if (!err2) {
      await sb.from("rule_sets").delete().eq("id", "00000000-0000-0000-0000-test00000002");
      console.log("  Cleaned up test row");
    }

    // Try with NULL
    console.log(`\nTrying with NULL created_by`);
    const { error: err3 } = await sb.from("rule_sets").insert({
      id: "00000000-0000-0000-0000-test00000003",
      tenant_id: "fa6a48c5-56dc-416d-9b7d-9c93d4882251",
      name: "TEST_DELETE_ME_3",
      status: "draft",
      components: {},
      input_bindings: {},
      cadence_config: {},
      outcome_config: {},
      metadata: {},
      population_config: {},
    });
    console.log(`  NULL result: ${err3 ? "ERROR: " + err3.message : "OK"}`);

    if (!err3) {
      await sb.from("rule_sets").delete().eq("id", "00000000-0000-0000-0000-test00000003");
      console.log("  Cleaned up test row");
    }
  }
}

main().catch(console.error);
