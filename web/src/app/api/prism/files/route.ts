/**
 * GET /api/prism/files — the user's file lifecycle, for the live spine to poll.
 *
 * Realtime is not used anywhere in this stack, so the In-Progress surface polls
 * this endpoint. Visibility is enforced by the file_objects RLS SELECT policy:
 * this route queries with the RLS-bound SESSION client (not service-role), so
 * an owner sees only their own files, a tenant admin/finance sees all tenant
 * files, platform sees all (Invariant 5). No service-role scoping to re-derive.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveActor } from '@/lib/prism/actor';
import { hasCapability } from '@/lib/auth/permissions';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT_COLS =
  'id, original_filename, mime_detected, byte_size, state, scan_verdict, scan_engine_version, scanned_at, promoted_at, content_sha256, classification, created_at';

export async function GET() {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  // OB-247 R2: defense in depth atop the RLS SELECT policy — only membrane-delivery
  // roles (operator + CDA, who hold data.upload) list files. RLS still scopes the rows.
  if (!hasCapability(actor.role, 'data.upload')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sb = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const { data, error } = await sb
    .from('file_objects')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data ?? [] });
}
