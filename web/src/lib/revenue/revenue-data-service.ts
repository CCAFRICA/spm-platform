/**
 * Revenue Data Service — client-side API layer for the Revenue pages (OB-257).
 *
 * Mirrors lib/financial/financial-data-service.ts: one typed loader per mode, each a single
 * POST to the server route. All aggregation is server-side (MSP invariant — the route reads
 * materialized summary_rollups; render-time code never touches committed_data). The tenant
 * CROSSES THE WIRE exactly as in the financial service (HF-374): sourced from the
 * switcher-effective tenant context (useTenant().currentTenant), validated server-side by
 * resolveCallerTenant — platform admins may target the switched tenant; everyone else is
 * pinned/verified same-tenant.
 *
 * Response shapes are the shared contracts in @/lib/revenue/types — this file adds none.
 */

import type {
  RevenueMode,
  RevenueRequest,
  PulseResponse,
  BridgeResponse,
  MixResponse,
  SellersResponse,
  ConcentrationResponse,
  YieldResponse,
  PatternsResponse,
  GeographyResponse,
} from '@/lib/revenue/types';

/** Optional shared parameters (bridge/mix drill + SR-39 scopeEntityIds) — the non-mode,
 *  non-tenant half of RevenueRequest (tenantId is the loaders' required first arg, HF-374).
 *  scopeEntityIds is forwarded only when defined: non-admins send an EXPLICIT scope (even
 *  empty = fail-closed); admins send none. */
export type RevenueLoadOpts = Omit<RevenueRequest, 'mode' | 'tenantId'>;

// ═══════════════════════════════════════════════════════════════════
// API caller
// ═══════════════════════════════════════════════════════════════════

/**
 * Shared caller. Non-OK responses (403 un-entitled included) THROW with the server's error
 * string so pages surface the named reason — never a silent null that decays into zeros
 * (C2 discipline). Callers catch and render the message.
 */
async function fetchRevenueData<T>(
  tenantId: string,
  mode: RevenueMode,
  opts?: RevenueLoadOpts,
): Promise<T> {
  const res = await fetch('/api/revenue/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, mode, ...(opts ?? {}) }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === 'string') detail = body.error;
    } catch {
      // non-JSON error body — fall through to the status fallback
    }
    throw new Error(detail || `Revenue data request failed (HTTP ${res.status})`);
  }

  const body = (await res.json()) as unknown;
  // Tolerate a `{ data }` wrapper (financial-route idiom) as well as the bare response object
  // (mode-discriminated per @/lib/revenue/types).
  if (body && typeof body === 'object' && !('mode' in body) && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

// ═══════════════════════════════════════════════════════════════════
// Loader functions — 1 API call each, typed per mode
// ═══════════════════════════════════════════════════════════════════

export async function loadPulse(tenantId: string, opts?: RevenueLoadOpts): Promise<PulseResponse> {
  return fetchRevenueData<PulseResponse>(tenantId, 'pulse', opts);
}

export async function loadBridge(tenantId: string, opts?: RevenueLoadOpts): Promise<BridgeResponse> {
  return fetchRevenueData<BridgeResponse>(tenantId, 'bridge', opts);
}

export async function loadMix(tenantId: string, opts?: RevenueLoadOpts): Promise<MixResponse> {
  return fetchRevenueData<MixResponse>(tenantId, 'mix', opts);
}

export async function loadSellers(tenantId: string, opts?: RevenueLoadOpts): Promise<SellersResponse> {
  return fetchRevenueData<SellersResponse>(tenantId, 'sellers', opts);
}

export async function loadConcentration(tenantId: string, opts?: RevenueLoadOpts): Promise<ConcentrationResponse> {
  return fetchRevenueData<ConcentrationResponse>(tenantId, 'concentration', opts);
}

export async function loadYield(tenantId: string, opts?: RevenueLoadOpts): Promise<YieldResponse> {
  return fetchRevenueData<YieldResponse>(tenantId, 'yield', opts);
}

export async function loadPatterns(tenantId: string, opts?: RevenueLoadOpts): Promise<PatternsResponse> {
  return fetchRevenueData<PatternsResponse>(tenantId, 'patterns', opts);
}

export async function loadGeography(tenantId: string, opts?: RevenueLoadOpts): Promise<GeographyResponse> {
  return fetchRevenueData<GeographyResponse>(tenantId, 'geography', opts);
}
