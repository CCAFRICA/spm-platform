// OB-204 F.3 — POST /api/entities/relationships/[id]/reject — end-date an inferred edge (temporal).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rejectRelationship } from '@/lib/entities/relationships';
import { authorizeUserMgmt } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: edge } = await sb.from('entity_relationships').select('tenant_id').eq('id', id).maybeSingle();
  if (!edge) return NextResponse.json({ error: 'edge not found' }, { status: 404 });
  const authz = await authorizeUserMgmt({ tenantId: edge.tenant_id as string | null });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  const r = await rejectRelationship(id, sb);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'reject failed' }, { status: 500 });
}
