/**
 * Revenue Data Service — client-side API layer for the Revenue pages (OB-257).
 *
 * Mirrors lib/financial/financial-data-service.ts: one typed loader per mode, each a single
 * POST to the server route. All aggregation is server-side (MSP invariant — the route reads
 * materialized summary_rollups; render-time code never touches committed_data). Unlike the
 * financial service, the tenant is session-derived server-side (resolveCallerTenant, ADR
 * minor decisions), so no tenantId crosses the wire.
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

/** Optional per-mode parameters (bridge/mix drill) — the non-mode half of RevenueRequest. */
export type RevenueLoadOpts = Omit<RevenueRequest, 'mode'>;

// ═══════════════════════════════════════════════════════════════════
// API caller
// ═══════════════════════════════════════════════════════════════════

/**
 * Shared caller. Non-OK responses (403 un-entitled included) THROW with the server's error
 * string so pages surface the named reason — never a silent null that decays into zeros
 * (C2 discipline). Callers catch and render the message.
 */
async function fetchRevenueData<T>(mode: RevenueMode, opts?: RevenueLoadOpts): Promise<T> {
  const res = await fetch('/api/revenue/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ...(opts ?? {}) }),
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

export async function loadPulse(): Promise<PulseResponse> {
  return fetchRevenueData<PulseResponse>('pulse');
}

export async function loadBridge(opts?: RevenueLoadOpts): Promise<BridgeResponse> {
  return fetchRevenueData<BridgeResponse>('bridge', opts);
}

export async function loadMix(opts?: RevenueLoadOpts): Promise<MixResponse> {
  return fetchRevenueData<MixResponse>('mix', opts);
}

export async function loadSellers(): Promise<SellersResponse> {
  return fetchRevenueData<SellersResponse>('sellers');
}

export async function loadConcentration(): Promise<ConcentrationResponse> {
  return fetchRevenueData<ConcentrationResponse>('concentration');
}

export async function loadYield(): Promise<YieldResponse> {
  return fetchRevenueData<YieldResponse>('yield');
}

export async function loadPatterns(): Promise<PatternsResponse> {
  return fetchRevenueData<PatternsResponse>('patterns');
}

export async function loadGeography(): Promise<GeographyResponse> {
  return fetchRevenueData<GeographyResponse>('geography');
}
