/**
 * POST /api/rule-set-assignments
 *
 * OB-103: Bulk rule set assignment from license-to-plan mapping.
 * Accepts a mapping of license names to rule set IDs and assigns
 * entities based on their ProductLicenses compound field.
 *
 * Body: {
 *   tenantId: string,
 *   licenseMapping: Record<string, string>,  // licenseName → ruleSetId
 * }
 *
 * Also supports direct assignment:
 * Body: {
 *   tenantId: string,
 *   assignments: Array<{ entityId: string, ruleSetId: string }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { tenantId, licenseMapping, assignments } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      supabase = authClient;
    }

    // Mode 1: Direct assignments
    if (assignments && Array.isArray(assignments)) {
      const inserts = assignments.map((a: { entityId: string; ruleSetId: string }) => ({
        tenant_id: tenantId,
        entity_id: a.entityId,
        rule_set_id: a.ruleSetId,
        effective_from: new Date().toISOString().split('T')[0],
      }));

      const BATCH = 5000;
      let count = 0;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const slice = inserts.slice(i, i + BATCH);
        const { error } = await supabase.from('rule_set_assignments').insert(slice);
        if (error) {
          return NextResponse.json({ error: 'Assignment failed', details: error.message }, { status: 500 });
        }
        count += slice.length;
      }

      return NextResponse.json({ success: true, assignmentCount: count });
    }

    // Mode 2: License-based mapping
    if (licenseMapping && typeof licenseMapping === 'object') {
      // Fetch all entities with product_licenses in metadata
      const { data: entities, error: entErr } = await supabase
        .from('entities')
        .select('id, external_id, metadata')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      if (entErr) {
        return NextResponse.json({ error: 'Failed to fetch entities', details: entErr.message }, { status: 500 });
      }

      // Fetch existing assignments
      const existingSet = new Set<string>();
      const entityIds = (entities || []).map(e => e.id);
      const CHECK_BATCH = 200;
      for (let i = 0; i < entityIds.length; i += CHECK_BATCH) {
        const slice = entityIds.slice(i, i + CHECK_BATCH);
        const { data: existing } = await supabase
          .from('rule_set_assignments')
          .select('entity_id, rule_set_id')
          .eq('tenant_id', tenantId)
          .in('entity_id', slice);

        if (existing) {
          for (const a of existing) existingSet.add(`${a.entity_id}:${a.rule_set_id}`);
        }
      }

      // Build assignments from license mapping
      const newAssignments: Array<{
        tenant_id: string;
        entity_id: string;
        rule_set_id: string;
        effective_from: string;
      }> = [];

      const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

      for (const entity of (entities || [])) {
        const meta = entity.metadata as Record<string, unknown> | null;
        const licenses = meta?.product_licenses ? String(meta.product_licenses) : null;
        if (!licenses) continue;

        const licenseList = licenses.split(',').map(l => l.trim()).filter(Boolean);

        for (const license of licenseList) {
          const normalizedLicense = normalizeForMatch(license);
          // Check each license mapping entry
          for (const [mappedLicense, ruleSetId] of Object.entries(licenseMapping)) {
            if (normalizeForMatch(mappedLicense) === normalizedLicense) {
              const key = `${entity.id}:${ruleSetId}`;
              if (!existingSet.has(key)) {
                newAssignments.push({
                  tenant_id: tenantId,
                  entity_id: entity.id,
                  rule_set_id: ruleSetId as string,
                  effective_from: new Date().toISOString().split('T')[0],
                });
                existingSet.add(key);
              }
              break;
            }
          }
        }
      }

      if (newAssignments.length > 0) {
        const BATCH = 5000;
        for (let i = 0; i < newAssignments.length; i += BATCH) {
          const slice = newAssignments.slice(i, i + BATCH);
          const { error } = await supabase.from('rule_set_assignments').insert(slice);
          if (error) {
            return NextResponse.json({ error: 'Assignment failed', details: error.message }, { status: 500 });
          }
        }
      }

      return NextResponse.json({
        success: true,
        assignmentCount: newAssignments.length,
        entityCount: (entities || []).length,
      });
    }

    return NextResponse.json({ error: 'Provide either assignments or licenseMapping' }, { status: 400 });
  } catch (err) {
    console.error('[rule-set-assignments] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rule-set-assignments?tenantId=xxx
 * Returns all rule set assignments for the tenant, grouped by entity
 */
export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      supabase = authClient;
    }

    const { data, error } = await supabase
      .from('rule_set_assignments')
      .select('id, entity_id, rule_set_id, effective_from, effective_to')
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignments: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
