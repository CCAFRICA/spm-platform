/**
 * OB-204 A.5 / D — Email dispatch (the ONE credential-delivery facility) + layered routing.
 *
 * Compliance is structural (DS-028 §2A, architect §4):
 *  - I-3: the subprocessor (Resend) receives only the RESOLVED `to`, the link, subject/html. No
 *    payout data, no role detail, no third-party PII. When delivery is REDIRECTED (D.2 routing),
 *    the body carries an "original recipient" account-label so the alternate inbox knows which
 *    account the link activates — and nothing else.
 *  - NIST 800-63B: the body carries a time-limited single-use LINK minted upstream; a password is
 *    never an input here, so it can never appear in an email body.
 *  - NO HARDCODED DOMAINS: every system URL resolves from NEXT_PUBLIC_SITE_URL at runtime with NO
 *    fallback. If it is unset, dispatch THROWS (never silently emits a broken link). The domain
 *    changes when INF-002 executes; zero code change required.
 *  - F-1: RESEND_API_KEY is production-only. Absent → dry-run (no send) so local build/harness pass.
 *
 * D.2 layered routing — resolveRecipient picks the actual target, FIRST NON-NULL WINS:
 *   1. per-send override (notifyEmail) · 2. tenant routing (tenants.notification_email)
 *   3. env catch-all (EMAIL_REDIRECT_TO, dev/staging) · 4. intended recipient (production default)
 * Routing affects DELIVERY only — the auth identity is always the intended email.
 */

export type DispatchLocale = 'en' | 'es-MX';
export type DispatchChannel = 'invite' | 'signin' | 'recovery';

export interface DispatchInput {
  to: string;                        // INTENDED recipient (the user's email = the auth identity)
  locale?: DispatchLocale;
  link: string;                      // pre-minted, time-limited, single-use
  notifyEmail?: string;              // D.2 Layer 1 — per-send override
  tenantNotificationEmail?: string;  // D.2 Layer 2 — tenant routing
}

export interface DeliveryReceipt {
  channel: DispatchChannel;
  delivery: 'sent' | 'dry_run';
  messageId: string | null;
  redirected: boolean;               // true when delivered to other than the intended recipient
}

const FROM = 'Vialuce <no-reply@vialuce.ai>';   // verified sender identity (DS-028 §2A)
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Base origin for every system URL — runtime env ONLY, NO fallback. Throws if unset (loud, never a broken link). */
function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  if (!u) throw new Error('dispatch: NEXT_PUBLIC_SITE_URL is not set — refusing to emit a system email with an unresolved origin (no hardcoded domain fallback)');
  return u.replace(/\/+$/, '');
}

/** D.2 — resolve the actual delivery target. First non-null wins: override → tenant → env → intended. */
export function resolveRecipient(
  intendedEmail: string,
  opts: { notifyEmail?: string; tenantNotificationEmail?: string },
): { to: string; redirected: boolean; originalRecipient?: string } {
  const envOverride = process.env.EMAIL_REDIRECT_TO;
  const actual = opts.notifyEmail ?? opts.tenantNotificationEmail ?? envOverride ?? intendedEmail;
  const redirected = actual.toLowerCase() !== intendedEmail.toLowerCase();
  return { to: actual, redirected, originalRecipient: redirected ? intendedEmail : undefined };
}

// ── per-identity rate limiting (in-memory; §6A residual: per-instance, not distributed) ──
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;                              // ≤3 credential emails / target / minute
const sendLog = new Map<string, number[]>();
function rateLimited(to: string, nowMs: number): boolean {
  const key = to.toLowerCase();
  const hits = (sendLog.get(key) ?? []).filter(t => nowMs - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { sendLog.set(key, hits); return true; }
  hits.push(nowMs); sendLog.set(key, hits); return false;
}

// ── branded templates (D.1) — greeting · action link · expiry · privacy link (I-4) · redirected note. ──
interface Copy { subject: string; greeting: string; lead: string; cta: string; expiry: string; privacy: string; redirected: string }
const COPY: Record<DispatchChannel, Record<DispatchLocale, Copy>> = {
  invite: {
    'en':    { subject: 'You have been invited to Vialuce', greeting: 'Welcome to Vialuce', lead: 'An administrator has created an account for you. Use the secure button below to set up your access.', cta: 'Accept your invitation', expiry: 'This invitation link expires in 24 hours.', privacy: 'Privacy notice', redirected: 'This message was redirected. The link activates the account for' },
    'es-MX': { subject: 'Te han invitado a Vialuce', greeting: 'Te damos la bienvenida a Vialuce', lead: 'Un administrador creó una cuenta para ti. Usa el botón seguro de abajo para configurar tu acceso.', cta: 'Aceptar invitación', expiry: 'Este enlace de invitación expira en 24 horas.', privacy: 'Aviso de privacidad', redirected: 'Este mensaje fue redirigido. El enlace activa la cuenta de' },
  },
  signin: {
    'en':    { subject: 'Your Vialuce sign-in link', greeting: 'Hello', lead: 'Use the secure link below to sign in to Vialuce.', cta: 'Sign in', expiry: 'This link expires in 1 hour and can be used once.', privacy: 'Privacy notice', redirected: 'This message was redirected. The link signs in the account for' },
    'es-MX': { subject: 'Tu enlace de acceso a Vialuce', greeting: 'Hola', lead: 'Usa el enlace seguro de abajo para iniciar sesión en Vialuce.', cta: 'Iniciar sesión', expiry: 'Este enlace expira en 1 hora y es de un solo uso.', privacy: 'Aviso de privacidad', redirected: 'Este mensaje fue redirigido. El enlace inicia sesión en la cuenta de' },
  },
  recovery: {
    'en':    { subject: 'Reset your Vialuce password', greeting: 'Hello', lead: 'We received a request to reset your password. If this was you, use the secure button below.', cta: 'Reset password', expiry: 'This link expires in 1 hour. If you did not request this, you can ignore this email.', privacy: 'Privacy notice', redirected: 'This message was redirected. The link resets the account for' },
    'es-MX': { subject: 'Restablece tu contraseña de Vialuce', greeting: 'Hola', lead: 'Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, usa el botón seguro de abajo.', cta: 'Restablecer contraseña', expiry: 'Este enlace expira en 1 hora. Si no lo solicitaste, puedes ignorar este correo.', privacy: 'Aviso de privacidad', redirected: 'Este mensaje fue redirigido. El enlace restablece la cuenta de' },
  },
};

function render(channel: DispatchChannel, locale: DispatchLocale, link: string, originalRecipient?: string): { subject: string; html: string } {
  const c = COPY[channel][locale] ?? COPY[channel].en;
  const privacyUrl = `${siteUrl()}/legal/privacy`;   // throws if NEXT_PUBLIC_SITE_URL is unset (no-fallback rule)
  const redirectedBlock = originalRecipient
    ? `<p style="font-size:12px;color:#9a6a00;background:#fff7e6;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;margin:0 0 18px">${c.redirected}: <b>${originalRecipient}</b></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#0a0e1a">
  <div style="padding:28px 12px;font-family:'Helvetica Neue',Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#4f46e5;padding:18px 28px"><span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Vialuce</span></div>
      <div style="padding:28px">
        ${redirectedBlock}
        <p style="font-size:16px;color:#18181b;margin:0 0 14px;font-weight:600">${c.greeting}</p>
        <p style="font-size:14px;color:#3f3f46;margin:0 0 24px;line-height:1.55">${c.lead}</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">${c.cta}</a>
        <p style="font-size:12px;color:#71717a;margin:24px 0 0;line-height:1.5">${c.expiry}</p>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #f1f1f3;background:#fafafa">
        <a href="${privacyUrl}" style="font-size:11px;color:#a1a1aa;text-decoration:underline">${c.privacy}</a>
      </div>
    </div>
  </div></body></html>`;
  return { subject: c.subject, html };
}

/** Render-only (no send) — lets the harness paste the branded HTML per type × locale (and redirected variant). */
export function previewEmail(channel: DispatchChannel, locale: DispatchLocale, link: string, originalRecipient?: string): { subject: string; html: string } {
  return render(channel, locale, link, originalRecipient);
}

async function dispatch(channel: DispatchChannel, input: DispatchInput, nowMs: number): Promise<DeliveryReceipt> {
  const locale: DispatchLocale = input.locale ?? 'en';
  // D.2 — resolve the actual delivery target (routing affects delivery only, never identity)
  const { to, redirected, originalRecipient } = resolveRecipient(input.to, { notifyEmail: input.notifyEmail, tenantNotificationEmail: input.tenantNotificationEmail });
  if (rateLimited(to, nowMs)) throw new Error('rate_limited: too many credential emails for this target — try again shortly');
  const { subject, html } = render(channel, locale, input.link, originalRecipient);   // throws here if NEXT_PUBLIC_SITE_URL unset

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[dispatch] RESEND_API_KEY absent — DRY RUN (no send) channel=${channel} locale=${locale} redirected=${redirected}`);
    return { channel, delivery: 'dry_run', messageId: null, redirected };
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) { const detail = await res.text().catch(() => ''); throw new Error(`dispatch_failed: Resend ${res.status} ${detail.slice(0, 200)}`); }
  const body = await res.json().catch(() => ({})) as { id?: string };
  return { channel, delivery: 'sent', messageId: body.id ?? null, redirected };
}

export function sendInvite(input: DispatchInput): Promise<DeliveryReceipt> { return dispatch('invite', input, Date.now()); }
export function sendSignInLink(input: DispatchInput): Promise<DeliveryReceipt> { return dispatch('signin', input, Date.now()); }
export function sendRecovery(input: DispatchInput): Promise<DeliveryReceipt> { return dispatch('recovery', input, Date.now()); }
