// OB-204 A.4 — PUBLIC POST /api/auth/forgot-password.
// No authorize. Per-IP + per-email rate limiting. UNIFORM success regardless of whether
// the account exists (anti-enumeration — OWASP / NIST 800-63B). On a real account, mints a
// recovery link and dispatches it; never reveals existence either way.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendRecovery, type DispatchLocale } from '@/lib/email/dispatch';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60_000;
const MAX = 5;                                   // ≤5 attempts / key / 15 min
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr); return false;
}

const UNIFORM = { ok: true, message: 'If an account exists for that address, a reset link has been sent.' };

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!email || typeof email !== 'string') {
    return NextResponse.json(UNIFORM); // uniform even on malformed input — no signal
  }
  // rate limit on BOTH dimensions; uniform 429 (rate state is not an existence oracle)
  if (limited(`ip:${ip}`) || limited(`email:${email.toLowerCase()}`)) {
    return NextResponse.json({ ok: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  try {
    const sb = await createServiceRoleClient();
    const { data: prof } = await sb.from('profiles').select('id, locale, email').ilike('email', email).maybeSingle();
    if (prof && !String(prof.email ?? '').endsWith('@anon.invalid')) {
      const { data: linkData } = await sb.auth.admin.generateLink({ type: 'recovery', email });
      const link = (linkData?.properties?.action_link as string) ?? '';
      if (link) await sendRecovery({ to: email, locale: (prof.locale as DispatchLocale) ?? 'en', link }).catch(() => { /* swallow — never leak */ });
    }
  } catch { /* swallow — uniform success regardless */ }
  return NextResponse.json(UNIFORM);
}
