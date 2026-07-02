/**
 * GET /api/import/sci/upload-budget — HF-372 Phase E: the REAL admission limit, surfaced.
 *
 * The upload gate must name the actual limit (C2 — never a silent stall, never a hardcoded guess):
 * the browser cannot read the bucket configuration (storage admin API), so this route exposes the
 * same discovery the pulse budget uses (`discoverUploadByteBudget`): the ingestion-raw bucket's
 * file_size_limit when set, else the conservative 40MB fallback floor (limitSource: 'fallback' —
 * the signal that the ARCHITECT should set the bucket limit, SR-44).
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { discoverUploadByteBudget } from '@/lib/sci/pulse-budget';

export async function GET() {
  const authClient = await createServerSupabaseClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const budget = await discoverUploadByteBudget(supabase, 'ingestion-raw');
  return NextResponse.json({
    effectiveLimit: budget.effectiveLimit,
    limitSource: budget.limitSource,
    byteBudget: budget.byteBudget,
  });
}
