// HF-356 (RC2) — the internal/cron principal shared by the dispatcher (dispatch-jobs) and the worker
// (process-job).
//
// THE BUG THIS FIXES: the Vercel Cron sweep (dispatch-jobs) fires the worker (process-job) server-side
// with NO cookies, so the worker's getUser() returned null → 401 on EVERY cron-fired job → the dispatcher
// never advanced a single job. The worker now accepts this trusted internal caller in addition to a
// logged-in user, and the dispatcher forwards the credential when it fires the worker.
//
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` (when a CRON_SECRET env var is configured) and
// always an `x-vercel-cron` header on its scheduled invocations. A request is the trusted internal
// principal when ANY of:
//   (a) CRON_SECRET is unset (local/dev — no secret to check against), OR
//   (b) Authorization === `Bearer ${CRON_SECRET}` (production cron, the dispatcher's forwarded fire, or a
//       manual privileged call), OR
//   (c) the `x-vercel-cron` header is present (a Vercel-originated scheduled invocation).
// Once the architect sets CRON_SECRET in Vercel (I6), branch (b) tightens automatically — no code change.
//
// Korean Test: every token is a control-flow/header constant — zero domain, tenant, or role literal.

import type { NextRequest } from 'next/server';

/** True when the request is the trusted cron/internal principal (see module header for the (a)/(b)/(c) rule). */
export function isInternalCronCaller(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // (a) dev: nothing to check.
  if (req.headers.get('authorization') === `Bearer ${cronSecret}`) return true; // (b)
  if (req.headers.get('x-vercel-cron')) return true; // (c)
  return false;
}

/**
 * Headers the dispatcher attaches when it fires the worker server-side, so the worker's cookie-less
 * invocation is recognized as the internal principal. In production (CRON_SECRET set) it forwards the
 * bearer secret (branch (b)); in dev (unset) it sends nothing extra — the worker's branch (a) accepts it.
 */
export function internalCronHeaders(): Record<string, string> {
  const cronSecret = process.env.CRON_SECRET;
  return cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {};
}
