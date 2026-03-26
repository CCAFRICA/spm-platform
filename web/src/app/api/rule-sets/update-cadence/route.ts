// OB-188: Plan cadence update API
// Allows inline cadence editing from the period detection panel.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VALID_CADENCES = ['monthly', 'biweekly', 'weekly', 'quarterly', 'annual'];

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { ruleSetId, tenantId, cadence } = await req.json();

    if (!ruleSetId || !tenantId || !cadence) {
      return NextResponse.json({ error: 'ruleSetId, tenantId, and cadence are required' }, { status: 400 });
    }

    if (!VALID_CADENCES.includes(cadence)) {
      return NextResponse.json({ error: `Invalid cadence: ${cadence}. Valid: ${VALID_CADENCES.join(', ')}` }, { status: 400 });
    }

    // Verify the rule_set belongs to the tenant
    const { data: existing } = await supabase
      .from('rule_sets')
      .select('id, cadence_config')
      .eq('id', ruleSetId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Rule set not found for this tenant' }, { status: 404 });
    }

    // Update cadence_config
    const currentConfig = (existing.cadence_config as Record<string, unknown>) || {};
    const updatedConfig = { ...currentConfig, period_type: cadence };

    const { error } = await supabase
      .from('rule_sets')
      .update({ cadence_config: updatedConfig })
      .eq('id', ruleSetId)
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cadence_config: updatedConfig });
  } catch (err) {
    console.error('[RuleSets/UpdateCadence] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
