/**
 * GET /api/insights?batchId=...&persona=admin|manager|rep
 *
 * Retrieves stored insight analysis for a calculation batch.
 * Filters by persona if specified.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { routeToPersona, type FullAnalysis } from '@/lib/agents/insight-agent';
import { resolveCallerTenant } from '@/lib/auth/api-tenant'; // OB-246 AP3 — session-derived tenant

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batchId');
  const persona = request.nextUrl.searchParams.get('persona') as 'admin' | 'manager' | 'rep' | null;

  // OB-246 AP3: tenant from the authenticated session, never query tenantId.
  const auth = await resolveCallerTenant(request.nextUrl.searchParams.get('tenantId'));
  if (!auth.ok) return auth.response;
  const tenantId = auth.caller.tenantId;

  if (!batchId) {
    return NextResponse.json(
      { error: 'Missing required query param: batchId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // Read analysis from batch config
  const { data: batch, error } = await supabase
    .from('calculation_batches')
    .select('config, summary')
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !batch) {
    return NextResponse.json(
      { error: 'Batch not found' },
      { status: 404 }
    );
  }

  const config = batch.config as Record<string, unknown> | null;
  const analysis = config?.insightAnalysis as FullAnalysis | undefined;

  if (!analysis) {
    return NextResponse.json({
      status: 'not_available',
      message: 'Insight analysis has not been generated for this batch yet',
    });
  }

  // Route to persona if specified
  if (persona && ['admin', 'manager', 'rep'].includes(persona)) {
    const filtered = routeToPersona(analysis, persona);
    return NextResponse.json({
      batchId,
      persona,
      ...filtered,
    });
  }

  return NextResponse.json({
    batchId,
    analysis,
  });
}
