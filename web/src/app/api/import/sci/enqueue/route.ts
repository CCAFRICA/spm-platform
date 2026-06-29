/**
 * POST /api/import/sci/enqueue
 *
 * HF-355 (I3/I4, SR-39) — the ONE place ingestion jobs are minted. Replaces the client-side
 * `processing_jobs` insert that hit a 403 for platform operators (and was AP-3: a browser Supabase
 * write). The write now happens SERVER-SIDE under the service-role client (which bypasses RLS), gated
 * by an EXPLICIT capability check in code:
 *
 *   authorized = caller is a member of the target tenant
 *                OR caller holds the `platform.data_operations` capability (a deliberate grant).
 *
 * The gate keys on the named capability, NOT the structural `tenant_id IS NULL` proxy (I3) — an
 * auditor reads "they hold platform.data_operations" (SOC 2 CC6 / OWASP A01 / DS-014). The RLS policy
 * on processing_jobs carries the same capability rule as defense-in-depth (Phase 3 migration).
 *
 * Decision 158 / I6: the authorization is pure synchronous boolean logic — zero LLM, zero domain
 * literals. I7: on a refuse (403) the route returns BEFORE opening any DB write handle — nothing leaks.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// The named capability that authorizes cross-tenant ingestion by a platform operator (I3).
const PLATFORM_DATA_OPERATIONS = 'platform.data_operations';

interface EnqueueFile {
  storagePath: string;
  fileName: string;
  fileSizeBytes?: number;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the caller (user session).
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as { tenantId?: string; sessionId?: string; files?: EnqueueFile[] };
    const { tenantId, files } = body;
    const sessionId = body.sessionId ?? crypto.randomUUID();
    if (!tenantId || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'tenantId and a non-empty files[] are required.' }, { status: 400 });
    }

    // Service-role client — the ONLY writer to processing_jobs from this surface (bypasses RLS).
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 2. Resolve the caller's profile (tenant_id + capabilities) and AUTHORIZE — before any write (I7).
    const { data: profile, error: profErr } = await service
      .from('profiles')
      .select('tenant_id, capabilities')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (profErr) {
      return NextResponse.json({ error: 'Could not resolve your profile to authorize the import.' }, { status: 500 });
    }
    const caps: string[] = Array.isArray(profile?.capabilities) ? (profile!.capabilities as string[]) : [];
    const isTenantMember = !!profile?.tenant_id && profile.tenant_id === tenantId;
    const isPlatformOperator = caps.includes(PLATFORM_DATA_OPERATIONS);
    if (!isTenantMember && !isPlatformOperator) {
      // Refuse — explicit, actionable. Nothing was written (I7: no handle opened on this branch).
      return NextResponse.json({
        error: 'Not authorized to import for this tenant. A platform operator needs the platform.data_operations capability; a tenant member can import only their own tenant.',
        code: 'ENQUEUE_FORBIDDEN',
      }, { status: 403 });
    }

    // 3. Mint the processing_jobs rows (service-role; one per file). crypto.randomUUID for ids (AP-12).
    const rows = files
      .filter(f => f.storagePath && f.fileName)
      .map(f => ({
        tenant_id: tenantId,
        status: 'pending' as const,
        file_storage_path: f.storagePath,
        file_name: f.fileName,
        file_size_bytes: f.fileSizeBytes ?? null,
        session_id: sessionId,
        uploaded_by: authUser.id,
      }));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid files to enqueue (each needs storagePath + fileName).' }, { status: 400 });
    }

    const { data: jobs, error: insErr } = await service
      .from('processing_jobs')
      .insert(rows)
      .select('id');
    if (insErr || !jobs) {
      return NextResponse.json({ error: `Failed to enqueue the import: ${insErr?.message ?? 'no rows returned'}.` }, { status: 500 });
    }

    return NextResponse.json({
      sessionId,
      jobIds: jobs.map(j => j.id as string),
      authorizedAs: isPlatformOperator ? 'platform_operator' : 'tenant_member',
    });
  } catch (err) {
    return NextResponse.json({ error: `Enqueue failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
