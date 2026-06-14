/**
 * OB-204 A.5 — Email dispatch (the ONE credential-delivery facility).
 *
 * Compliance is structural, not policy (DS-028 §2A, architect §4):
 *  - I-3: the only inputs are { to, locale, link }. No payout data, no role, no
 *    third-party PII transits the subprocessor. The signature IS the GDPR Art 28
 *    processor-minimization artifact — there is no parameter through which PII could.
 *  - NIST 800-63B secure delivery: the body carries a time-limited single-use LINK
 *    minted upstream (auth.admin.generateLink); a password is NEVER an input here, so
 *    a password can never appear in an email body. Per-identity rate limiting below.
 *  - F-1 (Phase 0): RESEND_API_KEY is production-only. Absent → structured warning +
 *    dry-run (no send; mock receipt) so local build + the A.8 harness pass.
 *
 * Resend is called over its REST API via fetch (no SDK dependency). Phase D brands
 * the templates; this phase ships minimal inline en / es-MX bodies (I-3: greeting,
 * link, expiry note — nothing else).
 */

export type DispatchLocale = 'en' | 'es-MX';
export type DispatchChannel = 'invite' | 'signin' | 'recovery';

export interface DispatchInput {
  to: string;            // recipient address — the ONLY recipient PII, required to deliver
  locale?: DispatchLocale;
  link: string;          // pre-minted, time-limited, single-use
}

export interface DeliveryReceipt {
  channel: DispatchChannel;
  delivery: 'sent' | 'dry_run';
  messageId: string | null;
}

const FROM = 'Vialuce <no-reply@vialuce.ai>';   // verified sender identity (DS-028 §2A)
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// ── per-identity rate limiting (in-memory; §6A residual: per-instance, not distributed) ──
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;                              // ≤3 credential emails / identity / minute
const sendLog = new Map<string, number[]>();
function rateLimited(to: string, nowMs: number): boolean {
  const key = to.toLowerCase();
  const hits = (sendLog.get(key) ?? []).filter(t => nowMs - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { sendLog.set(key, hits); return true; }
  hits.push(nowMs);
  sendLog.set(key, hits);
  return false;
}

// ── minimal inline templates (Phase D brands) — greeting + link + expiry, I-3 ──
const COPY: Record<DispatchChannel, Record<DispatchLocale, { subject: string; lead: string; cta: string; expiry: string }>> = {
  invite: {
    'en':    { subject: 'You have been invited to Vialuce', lead: 'An administrator has created an account for you.', cta: 'Accept your invitation', expiry: 'This link expires in 24 hours.' },
    'es-MX': { subject: 'Te han invitado a Vialuce', lead: 'Un administrador creó una cuenta para ti.', cta: 'Aceptar invitación', expiry: 'Este enlace expira en 24 horas.' },
  },
  signin: {
    'en':    { subject: 'Your Vialuce sign-in link', lead: 'Use the secure link below to sign in.', cta: 'Sign in', expiry: 'This link expires in 1 hour and can be used once.' },
    'es-MX': { subject: 'Tu enlace de acceso a Vialuce', lead: 'Usa el enlace seguro para iniciar sesión.', cta: 'Iniciar sesión', expiry: 'Este enlace expira en 1 hora y es de un solo uso.' },
  },
  recovery: {
    'en':    { subject: 'Reset your Vialuce password', lead: 'We received a request to reset your password.', cta: 'Reset password', expiry: 'This link expires in 1 hour.' },
    'es-MX': { subject: 'Restablece tu contraseña de Vialuce', lead: 'Recibimos una solicitud para restablecer tu contraseña.', cta: 'Restablecer contraseña', expiry: 'Este enlace expira en 1 hora.' },
  },
};

function render(channel: DispatchChannel, locale: DispatchLocale, link: string): { subject: string; html: string } {
  const c = COPY[channel][locale] ?? COPY[channel]['en'];
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
    <p>${c.lead}</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">${c.cta}</a></p>
    <p style="color:#71717a;font-size:12px">${c.expiry}</p>
  </div>`;
  return { subject: c.subject, html };
}

async function dispatch(channel: DispatchChannel, input: DispatchInput, nowMs: number): Promise<DeliveryReceipt> {
  const locale: DispatchLocale = input.locale ?? 'en';
  if (rateLimited(input.to, nowMs)) {
    throw new Error('rate_limited: too many credential emails for this identity — try again shortly');
  }
  const { subject, html } = render(channel, locale, input.link);

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // F-1: production-only key absent → dry-run (no send). Structured, PII-free warning.
    console.warn(`[dispatch] RESEND_API_KEY absent — DRY RUN (no send) channel=${channel} locale=${locale}`);
    return { channel, delivery: 'dry_run', messageId: null };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [input.to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dispatch_failed: Resend ${res.status} ${detail.slice(0, 200)}`);
  }
  const body = await res.json().catch(() => ({})) as { id?: string };
  return { channel, delivery: 'sent', messageId: body.id ?? null };
}

export function sendInvite(input: DispatchInput): Promise<DeliveryReceipt> {
  return dispatch('invite', input, Date.now());
}
export function sendSignInLink(input: DispatchInput): Promise<DeliveryReceipt> {
  return dispatch('signin', input, Date.now());
}
export function sendRecovery(input: DispatchInput): Promise<DeliveryReceipt> {
  return dispatch('recovery', input, Date.now());
}
