/**
 * OB-235 P8 — Recognition Curve API (read-only). Renders non-amnesiac behaviour per tenant: per-pattern
 * synaptic density + execution-mode distribution (calculation layer), comprehension recall-skip rate
 * (comprehension layer), comprehension-fingerprint count (the structural recall keys), and the
 * expression-binding cold-start INHERITANCE rate (expression layer) + the foundational/domain flywheel
 * scope. NO fixed vocabulary — it renders whatever structural patterns exist (Korean Test).
 *
 * GET /api/observatory/recognition-curve            → { tenants: [{id,name}] } (selector)
 * GET /api/observatory/recognition-curve?tenantId=X → the curve for one tenant
 *
 * VL-admin gated; service-role for cross-tenant reads. Read-only (no writes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  try {
    // 1. VL-admin gate (mirror of /api/platform/observatory)
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: profiles } = await authClient.from('profiles').select('role').eq('auth_user_id', user.id).limit(10);
    if (!profiles?.some((p) => p.role === 'platform')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabaseTyped = await createServiceRoleClient();
    // The learning tables (synaptic_density, foundational/domain_patterns, structural_fingerprints,
    // surface_bindings, comprehension_artifacts) are not in the generated database.types.ts (same note as
    // synaptic-density.ts) — use an untyped handle for them.
    const supabase = supabaseTyped as any;
    const tenantId = request.nextUrl.searchParams.get('tenantId');

    // No tenant → return the selector list.
    if (!tenantId) {
      const { data: tenants } = await supabase.from('tenants').select('id, name').order('name');
      return NextResponse.json({ tenants: tenants ?? [] });
    }

    // 2. Calculation layer — synaptic density + execution-mode distribution.
    const { data: density } = await supabase.from('synaptic_density')
      .select('signature, confidence, execution_mode, total_executions').eq('tenant_id', tenantId);
    const densityRows = (density ?? []) as any[];
    const modeDist = { full_trace: 0, light_trace: 0, silent: 0 } as Record<string, number>;
    for (const d of densityRows) modeDist[d.execution_mode ?? 'full_trace'] = (modeDist[d.execution_mode ?? 'full_trace'] ?? 0) + 1;
    const patterns = densityRows
      .map((d) => ({ signature: String(d.signature).slice(0, 18), confidence: Number(d.confidence ?? 0), executionMode: d.execution_mode ?? 'full_trace', totalExecutions: d.total_executions ?? 0 }))
      .sort((a, b) => b.confidence - a.confidence).slice(0, 50);

    // 3. Comprehension layer — recall-skip rate (fields with label+method are warm-recallable, no LLM next time).
    const { data: comp } = await supabase.from('comprehension_artifacts')
      .select('field_name, display_label, aggregation_method').eq('tenant_id', tenantId);
    const compRows = (comp ?? []) as any[];
    const recallable = compRows.filter((c) => c.display_label && c.aggregation_method).length;
    const skipRate = compRows.length > 0 ? recallable / compRows.length : 0;

    // comprehension fingerprints recorded (the structural recall keys — OB-235 P3)
    const { count: fpCount } = await supabase.from('structural_fingerprints')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('classification_result->>kind', 'comprehension');

    // 4. Expression layer — cold-start inheritance rate (recognized_by='inherited').
    const { data: bindings } = await supabase.from('surface_bindings')
      .select('surface_id, recognized_by, confidence').eq('tenant_id', tenantId);
    const bindRows = (bindings ?? []) as any[];
    const inherited = bindRows.filter((b) => b.recognized_by === 'inherited').length;
    const inheritanceRate = bindRows.length > 0 ? inherited / bindRows.length : 0;

    // 5. Flywheel scope (cross-tenant compound moat — counts only, structural).
    const { count: foundationalCount } = await supabase.from('foundational_patterns').select('id', { count: 'exact', head: true });
    const { count: domainCount } = await supabase.from('domain_patterns').select('id', { count: 'exact', head: true });

    return NextResponse.json({
      tenantId,
      calculation: { patterns, modeDistribution: modeDist, patternCount: densityRows.length },
      comprehension: { totalFields: compRows.length, recallableFields: recallable, skipRate, fingerprints: fpCount ?? 0 },
      expression: { totalBindings: bindRows.length, inherited, inheritanceRate },
      flywheel: { foundationalPatterns: foundationalCount ?? 0, domainPatterns: domainCount ?? 0 },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'recognition-curve failed' }, { status: 500 });
  }
}
