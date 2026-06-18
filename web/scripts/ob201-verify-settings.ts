// OB-201 FP-49 SQL Verification Gate — read-only schema probe of platform_settings.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob201-verify-settings.ts
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await sb.from('platform_settings').select('*').limit(1);
  if (error) {
    console.log('ERROR:', error.message);
    return;
  }
  console.log('columns:', data && data[0] ? Object.keys(data[0]) : 'empty table (no rows)');
  // Also report whether active_ui_theme already exists (idempotency check for the seed).
  const { data: existing } = await sb
    .from('platform_settings')
    .select('key, value')
    .eq('key', 'active_ui_theme');
  console.log('active_ui_theme present:', existing && existing.length > 0 ? JSON.stringify(existing) : 'NO (seed needed)');
}

main().catch((e) => console.log('THREW:', e?.message || String(e)));
