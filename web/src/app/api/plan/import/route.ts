/**
 * POST /api/plan/import
 *
 * Save and activate a compensation plan rule set using service role client.
 * Bypasses RLS that blocks browser-client inserts to rule_sets table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { RuleSetStatus, Json } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate authenticated user
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { planConfig, activate } = body as {
      planConfig: {
        id: string;
        tenantId: string;
        name: string;
        description?: string;
        status?: string;
        version?: number;
        effectiveDate?: string;
        endDate?: string | null;
        eligibleRoles?: string[];
        ruleSetType?: string;
        previousVersionId?: string | null;
        createdBy?: string;
        updatedBy?: string;
        approvedAt?: string | null;
        configuration: Record<string, unknown>;
      };
      activate?: boolean;
    };

    if (!planConfig?.id || !planConfig?.tenantId || !planConfig?.name) {
      return NextResponse.json(
        { error: 'Missing required fields: planConfig.id, planConfig.tenantId, planConfig.name' },
        { status: 400 }
      );
    }

    // CLT-59: Validate tenantId is a UUID — prevents cryptic Postgres errors
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(planConfig.tenantId)) {
      return NextResponse.json(
        { error: `Invalid tenantId: expected UUID, received "${String(planConfig.tenantId).substring(0, 50)}"` },
        { status: 400 }
      );
    }

    // 3. Service role client (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 4. Build insert row (same decomposition as planConfigToRuleSetInsert)
    const row = {
      id: planConfig.id,
      tenant_id: planConfig.tenantId,
      name: planConfig.name,
      description: planConfig.description || '',
      status: (planConfig.status || 'draft') as RuleSetStatus,
      version: planConfig.version || 1,
      effective_from: planConfig.effectiveDate || undefined,
      effective_to: planConfig.endDate || undefined,
      population_config: {
        eligible_roles: planConfig.eligibleRoles || [],
      } as unknown as Json,
      input_bindings: {} as Json,
      components: planConfig.configuration as unknown as Json,
      cadence_config: {} as Json,
      outcome_config: {} as Json,
      metadata: {
        plan_type: planConfig.ruleSetType || 'additive_lookup',
        previous_version_id: planConfig.previousVersionId || null,
        updated_by: planConfig.updatedBy || user.email || 'system',
        approved_at: planConfig.approvedAt || null,
      } as unknown as Json,
      created_by: planConfig.createdBy || user.email || 'system',
    };

    // 5. Upsert rule set
    const { error: upsertError } = await supabase
      .from('rule_sets')
      .upsert(row);

    if (upsertError) {
      console.error('[POST /api/plan/import] Upsert failed:', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // 6. Activate if requested (deactivate others, activate this one)
    if (activate) {
      // Archive all other active rule sets for this tenant
      await supabase
        .from('rule_sets')
        .update({ status: 'archived' as RuleSetStatus })
        .eq('tenant_id', planConfig.tenantId)
        .eq('status', 'active' as RuleSetStatus)
        .neq('id', planConfig.id);

      // Activate this rule set
      const { error: activateError } = await supabase
        .from('rule_sets')
        .update({ status: 'active' as RuleSetStatus })
        .eq('tenant_id', planConfig.tenantId)
        .eq('id', planConfig.id);

      if (activateError) {
        console.error('[POST /api/plan/import] Activate failed:', activateError);
        // Non-blocking — plan was saved, just not activated
      }
    }

    // 7. Write metering event (non-blocking)
    try {
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await supabase.from('usage_metering').insert({
        tenant_id: planConfig.tenantId,
        metric_name: 'plan_import',
        metric_value: 1,
        period_key: periodKey,
        metadata: {
          rule_set_id: planConfig.id,
          rule_set_name: planConfig.name,
          imported_by: user.email || 'system',
        },
      });
    } catch (meterErr) {
      console.error('[POST /api/plan/import] Metering failed (non-blocking):', meterErr);
    }

    return NextResponse.json({
      ruleSet: { id: planConfig.id, name: planConfig.name, status: activate ? 'active' : (planConfig.status || 'draft') },
    });
  } catch (err) {
    console.error('[POST /api/plan/import] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
