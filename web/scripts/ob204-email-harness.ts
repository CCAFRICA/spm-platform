// OB-204 Phase D — email templates + layered routing harness (sandbox; cleans up).
//  1) six template sends (3×2) → Resend message IDs (dry-run if RESEND_API_KEY absent, F-1)
//  2) resolveRecipient 4-layer priority (override → tenant → env → intended)
//  3) E2E: createUser w/ notifyEmail → identity stays intended, delivery redirected
//  4) tenant routing (live notification_email lookup; tolerant pre-migration 018)
//  5) no-fallback proof: unset NEXT_PUBLIC_SITE_URL → dispatch THROWS (no broken link)
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob204-email-harness.ts
import { createClient } from '@supabase/supabase-js';
import { previewEmail, resolveRecipient, sendInvite, type DispatchChannel, type DispatchLocale } from '../src/lib/email/dispatch';
import { createUser, erase } from '../src/lib/auth/provision-user';

// Per the no-hardcoded-domain rule, the base origin is the runtime env. For local harness runs the
// env is typically unset, so we stamp a clearly-SANDBOX origin (never a production domain) for the
// render/send tests, then UNSET it for the no-fallback proof.
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sandbox.vialuce.test';
const BASE = process.env.NEXT_PUBLIC_SITE_URL;
const LINK = `${BASE}/auth/callback?token=SANDBOX_TOKEN`;
const SANDBOX_TENANT = 'a0b1c2d3-e4f5-4a6b-8c7d-000000000204';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0, skip = 0;
const check = (n: string, ok: boolean, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const skipped = (n: string, d = '') => { skip++; console.log(`  SKIP ${n}${d ? ' — ' + d : ''}`); };

async function main() {
  console.log('================ OB-204 Phase D — EMAIL + ROUTING HARNESS ================');
  console.log(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'PRESENT (real sends)' : 'ABSENT (F-1 dry-run; HTML is the evidence)'} · base=${BASE}\n`);
  await sb.from('tenants').upsert({ id: SANDBOX_TENANT, name: 'OB-204 D Sandbox', slug: 'ob204-d', currency: 'USD', locale: 'en', features: {}, settings: {} });

  // 1) six sends + contract checks
  console.log('=== 1) six template sends (3 types × 2 locales) ===');
  const receipts: Array<{ k: string; delivery: string; messageId: string | null }> = [];
  for (const channel of ['invite', 'signin', 'recovery'] as DispatchChannel[]) {
    for (const locale of ['en', 'es-MX'] as DispatchLocale[]) {
      const { subject, html } = previewEmail(channel, locale, LINK);
      check(`${channel}/${locale}: greeting·link·expiry·privacy(I-4)·no-PII(I-3)`,
        html.includes('>Vialuce<') && html.includes(LINK) && /expire|expira/i.test(html) && html.includes('/legal/privacy')
        && !/payout|salary|\$[0-9]|role:|tenant_id/i.test(html), subject);
      const r = await sendInvite({ to: `d-${channel}-${locale}@vialuce.test`, locale, link: LINK }); // identity = intended
      receipts.push({ k: `${channel}/${locale}`, delivery: r.delivery, messageId: r.messageId });
    }
  }

  // 2) resolveRecipient 4-layer priority
  console.log('\n=== 2) resolveRecipient — layer priority (override → tenant → env → intended) ===');
  process.env.EMAIL_REDIRECT_TO = 'env@catch.test';
  check('L1 override wins over tenant+env', resolveRecipient('user@x.test', { notifyEmail: 'over@x.test', tenantNotificationEmail: 'ten@x.test' }).to === 'over@x.test');
  check('L2 tenant wins over env', resolveRecipient('user@x.test', { tenantNotificationEmail: 'ten@x.test' }).to === 'ten@x.test');
  check('L3 env catch-all when no override/tenant', resolveRecipient('user@x.test', {}).to === 'env@catch.test');
  delete process.env.EMAIL_REDIRECT_TO;
  const intended = resolveRecipient('user@x.test', {});
  check('L4 intended recipient (production default), redirected=false', intended.to === 'user@x.test' && intended.redirected === false);
  const red = resolveRecipient('user@x.test', { notifyEmail: 'over@x.test' });
  check('redirected=true + originalRecipient captured when routed', red.redirected === true && red.originalRecipient === 'user@x.test');

  // 3) E2E: createUser w/ notifyEmail — identity stays intended, delivery redirected
  console.log('\n=== 3) E2E per-send override — identity unchanged, delivery redirected ===');
  const intendedEmail = 'd-e2e-1781400000@vialuce.test';
  const created = await createUser({ email: intendedEmail, displayName: 'D E2E', role: 'member', tenantId: SANDBOX_TENANT, mode: 'invite', notifyEmail: 'qa-inbox@vialuce.test' });
  const { data: prof } = await sb.from('profiles').select('email').eq('id', created.profileId).single();
  check('auth identity is the INTENDED email (routing never changes identity)', prof?.email === intendedEmail, `profile.email=${prof?.email}`);
  check('per-send override redirects delivery', resolveRecipient(intendedEmail, { notifyEmail: 'qa-inbox@vialuce.test' }).redirected === true);
  await erase({ targetProfileId: created.profileId });
  await sb.from('profiles').delete().eq('id', created.profileId);

  // 4) tenant routing — live notification_email lookup (tolerant pre-migration)
  console.log('\n=== 4) tenant routing (notification_email) ===');
  const { error: setErr } = await sb.from('tenants').update({ notification_email: 'tenant-inbox@vialuce.test' }).eq('id', SANDBOX_TENANT);
  if (setErr) {
    skipped('tenant routing E2E', `notification_email column absent → PENDING migration 018 (Layer-2 logic proven in step 2)`);
  } else {
    const { data: t } = await sb.from('tenants').select('notification_email').eq('id', SANDBOX_TENANT).single();
    check('tenants.notification_email persists + routes (L2)', t?.notification_email === 'tenant-inbox@vialuce.test'
      && resolveRecipient('user@x.test', { tenantNotificationEmail: t?.notification_email as string }).to === 'tenant-inbox@vialuce.test');
  }

  // 5) no-fallback proof
  console.log('\n=== 5) no-hardcoded-domain proof — unset NEXT_PUBLIC_SITE_URL → THROW ===');
  delete process.env.NEXT_PUBLIC_SITE_URL;
  let threw = false;
  try { previewEmail('invite', 'en', LINK); } catch { threw = true; }
  check('dispatch THROWS when origin unset (never a broken link)', threw);
  process.env.NEXT_PUBLIC_SITE_URL = BASE;

  await sb.from('tenants').delete().eq('id', SANDBOX_TENANT);

  console.log('\n================ RESEND RECEIPTS (6 sends; message IDs only — no recipient PII) ================');
  for (const r of receipts) console.log(`  ${r.k}: delivery=${r.delivery} messageId=${r.messageId ?? '(dry-run)'}`);
  console.log('\n──── rendered HTML sample (invite / en, redirected variant) ────');
  console.log(previewEmail('invite', 'en', LINK, 'real.user@example.com').html);
  console.log(`\n================ RESULT: ${pass} PASS / ${fail} FAIL / ${skip} SKIP (pending migration 018) ================`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
