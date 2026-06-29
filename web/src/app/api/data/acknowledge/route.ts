/**
 * OB-253 Phase 4 — POST /api/data/acknowledge (the operator feedback loop, the learning surface).
 *
 * When an operator acts on a precision-weighted trust flag (confirm = it was fine / correct = it was a
 * real error), the decision writes back to the signal surface as a `thalamus:acknowledgment` signal.
 * GET /api/data/overview reads these to refine the precision-weighting calibration (refineCalibration):
 * corrections make the surface MORE eager to surface that consequence band; confirmations less eager —
 * the threshold converges from real operator judgment instead of a hardcoded constant (architect Q2).
 * This also feeds exposure: a confirmed pattern is a pattern the operator has now genuinely seen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/prism/actor';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // HF-357: canonical PRISM tenant resolution — platform admin resolves the selected-tenant cookie
  // (resolveActor), exactly like the overview route + every /api/prism/* route. Class-layer fix.
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'No tenant context — select a tenant first' }, { status: 401 });
  const tenantId = actor.tenantId;

  const body = (await request.json()) as { column?: string; value?: string; facet?: string; feedback?: string };
  if (body.feedback !== 'confirmed' && body.feedback !== 'corrected') {
    return NextResponse.json({ error: "feedback must be 'confirmed' or 'corrected'" }, { status: 400 });
  }

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { error } = await sb.from('classification_signals').insert({
    tenant_id: tenantId,
    signal_type: 'thalamus:acknowledgment',
    source: 'thalamus',
    decision_source: 'operator',
    scope: 'tenant',
    confidence: body.feedback === 'confirmed' ? 1 : 0,
    signal_value: { column: body.column ?? null, value: body.value ?? null, facet: body.facet ?? null, feedback: body.feedback, by: actor.profileId },
    context: { ob: 'OB-253', phase: 4, kind: 'precision_weighting_feedback' },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, feedback: body.feedback });
}
