// HF-356 (I8) — client poll/retry discipline shared by the import surface's pollers.
//
// THE PROBLEM: the async-ingestion outage was COMPOUNDED by the browser. The import surface runs several
// pollers (classify progress, telemetry, proposal/settle, plan-run-status) on tight 1.5–2s intervals. When
// the endpoints started 401'ing (the worker/middleware auth gap) and 5xx'ing (the connection-pool
// exhaustion), every poller kept hammering on the same cadence — a retry storm that added load while the
// DB was already failing. None backed off, none stopped on 401, none cancelled their in-flight fetch on
// unmount.
//
// THE RULE (one shared decision for every poller): a 401/403 STOPS the poller and surfaces a message —
// auth does not heal by retrying. A 5xx or a network drop backs off EXPONENTIALLY and STOPS after a small
// cap (POLL_MAX_SERVER_ERRORS) — a failing server gets room, not a storm. A 2xx resets the backoff. Pair
// this with an AbortController aborted on unmount so no fetch outlives its component.
//
// Korean Test: every token is an HTTP/control-flow constant — zero domain, tenant, or role literal.

/** Consecutive 5xx / network errors a poller tolerates before it gives up. */
export const POLL_MAX_SERVER_ERRORS = 3;
/** Backoff ceiling — a backed-off poller never waits longer than this between attempts. */
export const POLL_BACKOFF_CEILING_MS = 30_000;

export type PollStopReason = 'unauthorized' | 'server';

export type PollVerdict =
  | { action: 'continue'; delayMs: number }
  | { action: 'stop'; reason: PollStopReason; message: string };

/** Mutable streak state — one per poller instance. */
export interface PollState { serverErrors: number }
export function newPollState(): PollState { return { serverErrors: 0 }; }

export const POLL_UNAUTHORIZED_MESSAGE =
  'Your session is no longer authorized. Please sign in again to continue.';
export const POLL_SERVER_GAVE_UP_MESSAGE =
  'The server stopped responding. We stopped checking to avoid adding load — reload the page to try again.';

/** The outcome of one poll attempt. `networkError` is a thrown fetch (no response). */
export interface PollOutcome { ok: boolean; status?: number; networkError?: boolean }

/**
 * Decide what a poller should do next given the latest attempt's outcome and the running streak state.
 * Mutates `state.serverErrors`. `baseDelayMs` is the poller's normal cadence.
 */
export function pollDecision(state: PollState, outcome: PollOutcome, baseDelayMs: number): PollVerdict {
  // Auth failure never self-heals by retrying — stop immediately and surface it.
  if (outcome.status === 401 || outcome.status === 403) {
    return { action: 'stop', reason: 'unauthorized', message: POLL_UNAUTHORIZED_MESSAGE };
  }
  // 5xx or a network drop — count it; back off; give up after the cap so we never become a retry storm.
  if (outcome.networkError || (outcome.status !== undefined && outcome.status >= 500)) {
    state.serverErrors += 1;
    if (state.serverErrors >= POLL_MAX_SERVER_ERRORS) {
      return { action: 'stop', reason: 'server', message: POLL_SERVER_GAVE_UP_MESSAGE };
    }
    return { action: 'continue', delayMs: Math.min(POLL_BACKOFF_CEILING_MS, baseDelayMs * 2 ** state.serverErrors) };
  }
  // 2xx, or a non-auth 4xx (e.g. 404/409 — the resource may simply not be ready) → reset the streak and
  // poll again on the normal cadence.
  state.serverErrors = 0;
  return { action: 'continue', delayMs: baseDelayMs };
}
