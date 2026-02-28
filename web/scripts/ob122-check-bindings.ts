import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb
    .from("rule_sets")
    .select("id, name, status, input_bindings, tenant_id, tenants(slug)")
    .eq("status", "active")
    .order("tenant_id");

  if (!data) { console.log("No data"); return; }

  console.log("| Tenant | Plan | Has Bindings | Derivation Count |");
  console.log("|--------|------|-------------|-----------------|");
  for (const rs of data) {
    const slug = (rs as any).tenants?.slug || "unknown";
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const hasBindings = bindings !== null && JSON.stringify(bindings) !== '{}' && JSON.stringify(bindings) !== 'null';
    const derivations = (bindings?.metric_derivations as unknown[])?.length ?? 0;
    console.log(`| ${slug} | ${rs.name} | ${hasBindings} | ${derivations} |`);
  }
}
main().catch(console.error);
