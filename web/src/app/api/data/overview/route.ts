/**
 * OB-253 Phase 3+4 — GET /api/data/overview (wire the Data Operations workspace LIVE, HALT-3).
 *
 * Replaces the hardcoded mock that /data/page.tsx shipped (OB-250) with real reads of the co-present
 * signal surface: ingestion metrics + jobs, recognition activity by facet, and the precision-weighted
 * TRUST FLAGS (high-consequence + thin-exposure values surfaced for operator judgment, Phase 4). This
 * is NOT a new surface — the route/nav/gate already exist; only the data source changes (Vertical Slice).
 *
 * Gate: authenticated operator with PRISM enabled for their tenant (data.import / prism_enabled).
 * Read-only (no calc-engine touch, G9). The trust-flag recognition pass is deterministic (no apex LLM
 * in the request path) and bounded (SR-2).
 */

import { NextResponse } from 'next/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveActor } from '@/lib/prism/actor';
import { isFeatureEnabled } from '@/lib/tenant/feature-flags';
import { PRISM_FEATURE_KEY } from '@/lib/prism/capability';
import { readCoPresentSurface, exposureFromSurface } from '@/lib/thalamus/signal-surface';
import { buildColumnContext, recognizeColumn } from '@/lib/thalamus/joint-recognition';
import { precisionWeight, DEFAULT_CALIBRATION, refineCalibration, type PrecisionCalibration, type OperatorFeedback } from '@/lib/thalamus/precision-weighting';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_ROWS = 400;
const MAX_TRUST_FLAGS = 40;

/** Derive the live calibration from accumulated operator acknowledgments (the learning surface). */
function calibrationFromFeedback(feedbackSignals: { signalValue: unknown }[]): PrecisionCalibration {
  let cal = DEFAULT_CALIBRATION;
  for (const s of feedbackSignals) {
    const fb = (s.signalValue as { feedback?: unknown } | null)?.feedback;
    if (fb === 'confirmed' || fb === 'corrected') cal = refineCalibration(cal, fb as OperatorFeedback);
  }
  return cal;
}

export async function GET() {
  // HF-357: resolve the EFFECTIVE tenant via the canonical PRISM resolver. For a platform admin
  // (profile.tenant_id NULL) this is the tenant selected in the switcher (vialuce-tenant-id cookie) —
  // exactly like every other /api/prism/* route. The OB-253 route read profile.tenant_id directly,
  // which is NULL for platform admins → "No tenant context". Class-layer fix (SR-34, the HF-352/353/354 class).
  const actor = await resolveActor();
  if (!actor) {
    const state = await getServerAuthState();
    if (!state.isAuthenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // authenticated but no tenant selected (platform admin at platform scope) — friendly empty state.
    return NextResponse.json({ needsTenant: true }, { status: 200 });
  }
  const tenantId = actor.tenantId;

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;

  // PRISM gate (the Data Operations workspace feature)
  const { data: tenant } = await sb.from('tenants').select('features').eq('id', tenantId).maybeSingle();
  if (!isFeatureEnabled((tenant?.features as Record<string, unknown>) ?? null, PRISM_FEATURE_KEY)) {
    return NextResponse.json({ error: 'Data Operations not enabled for this tenant' }, { status: 403 });
  }

  // ── co-present surface + ingestion facts ──
  const surface = await readCoPresentSurface(sb, { tenantId, signalLimit: 400 });
  const exposure = exposureFromSurface(surface);
  const [{ count: committedCount }, { count: fpCount }, jobsRes, sampleRes, ackRes] = await Promise.all([
    sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    sb.from('structural_fingerprints').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    sb.from('processing_jobs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(12),
    sb.from('committed_data').select('row_data').eq('tenant_id', tenantId).limit(SAMPLE_ROWS),
    sb.from('classification_signals').select('signal_value').eq('tenant_id', tenantId).eq('signal_type', 'thalamus:acknowledgment').order('created_at', { ascending: false }).limit(500),
  ]);

  // recognition activity by facet (from the persisted surface)
  const signalsByFacet: Record<string, number> = {};
  for (const s of surface.signals) {
    if (s.signalType.startsWith('remediation:') || s.signalType === 'thalamus:recognition') {
      const facet = s.signalType === 'thalamus:recognition' ? ((s.signalValue as { resolvedFacet?: string } | null)?.resolvedFacet ?? 'recognition') : s.signalType.replace('remediation:', '');
      signalsByFacet[facet] = (signalsByFacet[facet] ?? 0) + 1;
    }
  }

  // ── precision-weighted trust flags: a bounded LIVE deterministic recognition pass over a sample ──
  const cal = calibrationFromFeedback((ackRes.data as { signal_value: unknown }[] ?? []).map((r) => ({ signalValue: r.signal_value })));
  const recs = ((sampleRes.data as { row_data: unknown }[]) ?? []).map((r) => (r.row_data ?? {}) as Record<string, unknown>).filter((r) => r && typeof r === 'object');
  const allCols = Array.from(new Set(recs.flatMap((r) => Object.keys(r)))).filter((c) => c !== '_rowIndex' && c !== '_sheetName');
  const trustFlags: Array<{ column: string; value: string; facet: string; action: string; consequence: number; consequenceFactors: string[]; reason: string }> = [];
  for (const col of allCols) {
    if (trustFlags.length >= MAX_TRUST_FLAGS) break;
    const ctx = buildColumnContext(recs, col, allCols);
    if (ctx.distinct.length < 2 || ctx.distinct.length > 400) continue;
    const resolutions = await recognizeColumn(ctx); // deterministic only (no apex in request)
    for (const r of resolutions) {
      if (r.resolvedFacet === 'none') continue;
      // density confidence proxy: a recognized-and-matched structure reads as high baseline (silent-zone)
      const verdict = precisionWeight({ baselineConfidence: 0.96, resolution: r, surface, calibration: cal });
      if (verdict.surfaced) {
        trustFlags.push({ column: col, value: String(r.value).slice(0, 80), facet: r.resolvedFacet, action: r.action, consequence: Number(verdict.consequence.score.toFixed(2)), consequenceFactors: verdict.consequence.factors, reason: verdict.reason });
        if (trustFlags.length >= MAX_TRUST_FLAGS) break;
      }
    }
  }
  trustFlags.sort((a, b) => b.consequence - a.consequence);

  return NextResponse.json({
    metrics: {
      committedRecords: committedCount ?? 0,
      knownStructures: fpCount ?? 0,
      recognitionSignals: surface.signals.length,
      maxRecall: exposure.matchCount, // how many files a learned structure has been recognized in
      lastSeen: exposure.lastSeen,
    },
    jobs: ((jobsRes.data as Record<string, unknown>[]) ?? []).map((j) => ({ id: j.id as string, status: (j.status as string) ?? 'unknown', fileName: (j.file_name as string) ?? (j.source_file_name as string) ?? null, createdAt: (j.created_at as string) ?? null, completedAt: (j.completed_at as string) ?? null })),
    signalsByFacet,
    trustFlags,
    calibration: cal,
  });
}
