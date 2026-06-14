// OB-204 F.3 — GET /api/entities/inferred-edges — confidence-ranked inferred edges for the review panel.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listInferredEdges } from '@/lib/entities/relationships';
import { authorizeUserRead } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function GET() {
  const authz = await authorizeUserRead();
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  if (!authz.caller.tenantId) return NextResponse.json({ edges: [] });   // platform: review is per-tenant via /configure
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const edges = await listInferredEdges(authz.caller.tenantId, sb);
  return NextResponse.json({ edges });
}
