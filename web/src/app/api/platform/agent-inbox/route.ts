/**
 * Agent Inbox API
 *
 * GET   /api/platform/agent-inbox?tenantId=<uuid>&persona=<admin|manager|rep>
 * PATCH /api/platform/agent-inbox { id, action: 'dismiss'|'read'|'act' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveCallerTenant } from '@/lib/auth/api-tenant'; // OB-246 AP3 — session-derived tenant

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// OB-246 5c: a caller may read inbox items only for personas at or below their authenticated role —
// a member cannot request the admin (or manager) inbox; a manager cannot request the admin inbox.
function gateInboxPersona(requested: string, role: string): string {
  if (['platform', 'vl_admin', 'admin'].includes(role)) return requested; // any
  if (role === 'manager') return requested === 'admin' ? 'manager' : requested; // not admin
  return 'rep'; // member / viewer / sales_rep → own only
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPersona = searchParams.get('persona') || 'admin';

  // OB-246 AP3 + 5c: tenant from the authenticated session (never query tenantId); persona gated by role.
  const auth = await resolveCallerTenant(searchParams.get('tenantId'));
  if (!auth.ok) return auth.response;
  const tenantId = auth.caller.tenantId;
  if (!UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
  }
  const persona = gateInboxPersona(requestedPersona, auth.caller.role);

  const supabase = await createServiceRoleClient();
  // agent_inbox table created via SQL migration — not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('agent_inbox')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`persona.eq.${persona},persona.eq.all`)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, action } = await request.json();

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Valid id (UUID) required' }, { status: 400 });
    }

    const validActions = ['dismiss', 'read', 'act'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Valid: ${validActions.join(', ')}` }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const now = new Date().toISOString();

    const updateField: Record<string, string> = {};
    if (action === 'dismiss') updateField.dismissed_at = now;
    if (action === 'read') updateField.read_at = now;
    if (action === 'act') updateField.acted_at = now;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as unknown as { from: (t: string) => any })
      .from('agent_inbox')
      .update(updateField)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/platform/agent-inbox] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
