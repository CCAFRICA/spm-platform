/**
 * GET /api/revenue/insights — OB-257 O4 serving read.
 *
 * Serves the Revenue insight namespace (intelligence_artifacts, source='revenue-insight') for the
 * caller's session-derived tenant. Entitlement is the FUNCTIONAL gate (isRevenueEnabledForTenant —
 * PRISM precedent): a deep-linked shell gets 403, never data. Returns DATA and machine keys only
 * (context.kind); display labels are localized client-side (InsightSlot).
 *
 * KOREAN TEST: zero tenant field names — rows are read whole and passed through; entity display
 * names come from the entities table at runtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveCallerTenant } from '@/lib/auth/api-tenant'; // OB-246 AP3 — session-derived tenant
import { isRevenueEnabledForTenant } from '@/lib/revenue/tenant-feature';
import { REVENUE_INSIGHT_SOURCE } from '@/lib/revenue/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ArtifactRow {
  id: string;
  entity_id: string | null;
  title: string;
  narrative: string | null;
  severity: string | null;
  data_references: unknown;
  context: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  // platform/vl_admin may target another tenant via ?tenantId= (Observatory case); everyone else is
  // pinned to their session tenant — resolveCallerTenant rejects a mismatched claim.
  const auth = await resolveCallerTenant(request.nextUrl.searchParams.get('tenantId'));
  if (!auth.ok) return auth.response;
  const tenantId = auth.caller.tenantId;

  if (!(await isRevenueEnabledForTenant(tenantId))) {
    return NextResponse.json({ error: 'Revenue agent is not enabled for this tenant' }, { status: 403 });
  }

  try {
    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data, error } = await sb
      .from('intelligence_artifacts')
      .select('id, entity_id, title, narrative, severity, data_references, context, created_at')
      .eq('tenant_id', tenantId)
      .eq('source', REVENUE_INSIGHT_SOURCE)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as ArtifactRow[];

    // one entities read to enrich entity-scoped insights with display names
    const entityIds = Array.from(new Set(rows.map((r) => r.entity_id).filter((x): x is string => !!x)));
    const names = new Map<string, string>();
    if (entityIds.length > 0) {
      const { data: ents } = await sb
        .from('entities')
        .select('id, display_name')
        .eq('tenant_id', tenantId)
        .in('id', entityIds);
      for (const e of (ents ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (e.display_name) names.set(e.id, e.display_name);
      }
    }

    const insights = rows.map((r) => {
      const ctx = r.context ?? {};
      return {
        id: r.id,
        kind: typeof ctx.kind === 'string' ? ctx.kind : null,
        title: r.title,
        narrative: r.narrative,
        severity: r.severity,
        entityId: r.entity_id,
        entityName: r.entity_id ? names.get(r.entity_id) ?? null : null,
        dataReferences: Array.isArray(r.data_references) ? r.data_references : [],
        createdAt: r.created_at,
        periodStart: typeof ctx.period_start === 'string' ? ctx.period_start : null,
        periodEnd: typeof ctx.period_end === 'string' ? ctx.period_end : null,
      };
    });

    return NextResponse.json({ insights });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'insights read failed' },
      { status: 500 },
    );
  }
}
