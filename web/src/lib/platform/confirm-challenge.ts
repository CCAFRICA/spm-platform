// HF-352 — server-issued destructive-confirmation challenge (I2 / SR-39).
//
// The two-step gate is SERVER-enforced, not a guessable client constant. Step 1 (GET confirm-challenge)
// returns a short-lived signed token bound to {action, tenantId}; step 2 (the destructive POST) must
// present that token AND the typed tenant name. The token is a stateless HMAC over a server-only secret
// (the service-role key — never shipped to the client), valid for a ~2-minute window, so there is no
// nonce store yet no single guessable one-shot value. The real authorization boundary remains the
// platform.system_config capability gate; this is the deliberate-action friction on top of it.

import { createHmac, timingSafeEqual } from 'node:crypto';

export type DestructiveAction = 'clean-slate' | 'delete-tenant';

const WINDOW_MS = 60_000; // one bucket = 1 minute; verification accepts current + previous bucket (~2 min)

function secret(): string {
  // Server-only. Present in every route runtime that needs it (service-role key is server-side).
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('confirm-challenge: server secret unavailable');
  return s;
}

function sign(action: DestructiveAction, tenantId: string, bucket: number): string {
  return createHmac('sha256', secret()).update(`hf352:${action}:${tenantId}:${bucket}`).digest('hex');
}

/** Issue a challenge token for {action, tenantId} valid for ~2 minutes (the current minute bucket). */
export function issueChallenge(action: DestructiveAction, tenantId: string, nowMs: number): { challenge: string; expiresInMs: number } {
  const bucket = Math.floor(nowMs / WINDOW_MS);
  return { challenge: sign(action, tenantId, bucket), expiresInMs: WINDOW_MS * 2 };
}

/** Verify a challenge for {action, tenantId} against the current + previous bucket (constant-time). */
export function verifyChallenge(action: DestructiveAction, tenantId: string, challenge: string, nowMs: number): boolean {
  if (typeof challenge !== 'string' || challenge.length !== 64) return false;
  const bucket = Math.floor(nowMs / WINDOW_MS);
  for (const b of [bucket, bucket - 1]) {
    const expected = sign(action, tenantId, b);
    try {
      if (challenge.length === expected.length && timingSafeEqual(Buffer.from(challenge), Buffer.from(expected))) return true;
    } catch { /* length/encoding mismatch → not a match */ }
  }
  return false;
}
