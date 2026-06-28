/**
 * HF-352 — POST /api/platform/tenants/[tenantId]/clean-slate
 * Selective per-category wipe; tenant + profiles PRESERVED (I4). Platform-admin only (I5).
 * Two-step server-enforced (I2): requires the signed challenge AND the typed tenant name. Cascade-
 * dependency validated (B1). Audit fail-closed (I6). Every delete tenant-scoped (I1). Per-table
 * reporting + partial-failure safe (I8).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import { verifyChallenge } from '@/lib/platform/confirm-challenge';
import {
  runCleanSlate, validateCleanSlateSelection, CLEAN_SLATE_CATEGORIES,
  type CleanSlateCategoryKey,
} from '@/lib/platform/tenant-deletion';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KEYS = new Set(CLEAN_SLATE_CATEGORIES.map((c) => c.key));

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { tenantId } = await params;

  let body: { categories?: unknown; confirmName?: unknown; challenge?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const categories = Array.isArray(body.categories) ? (body.categories.filter((c) => typeof c === 'string' && VALID_KEYS.has(c as CleanSlateCategoryKey)) as CleanSlateCategoryKey[]) : [];
  if (categories.length === 0) return NextResponse.json({ error: 'no valid categories selected' }, { status: 400 });

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;

  // Fetch the target tenant FIRST — confirmation + audit need the authoritative name.
  const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // I2 — server-enforced confirmation: typed name (non-empty, exact) AND the signed challenge. Both
  // checked BEFORE any delete; the UI gate is not the boundary.
  const confirmName = typeof body.confirmName === 'string' ? body.confirmName : '';
  if (!confirmName || !tenant.name || confirmName !== tenant.name) {
    return NextResponse.json({ error: 'confirmation name does not match the tenant' }, { status: 403 });
  }
  if (typeof body.challenge !== 'string' || !verifyChallenge('clean-slate', tenantId, body.challenge, Date.now())) {
    return NextResponse.json({ error: 'missing or invalid confirmation challenge' }, { status: 403 });
  }

  // B1 — cascade-dependency: a category may not be wiped without the categories its DELETE cascades
  // would otherwise silently destroy (entity ⇒ calc + plan).
  const valid = validateCleanSlateSelection(categories);
  if (!valid.ok) {
    return NextResponse.json({ error: 'category dependency violation', required: valid.missing, message: 'The Entity layer cascades into Calculation and Plan — include them.' }, { status: 422 });
  }

  // I6 — audit FAIL-CLOSED: write the intent row and check it; if it fails, abort with NO deletes.
  const { error: auditErr } = await sb.from('audit_logs').insert({
    tenant_id: tenantId, profile_id: gate.caller.profileId, action: 'tenant.clean_slate',
    resource_type: 'tenant', resource_id: tenantId,
    changes: { categories, phase: 'initiated' },
    metadata: { actor: gate.caller.email },
  });
  if (auditErr) return NextResponse.json({ error: 'aborted: audit write failed (fail-closed)', detail: auditErr.message }, { status: 500 });

  // Destructive sweep — tenant-scoped, dependents-first, per-table reported (I1/I3/I8).
  const result = await runCleanSlate(sb, tenantId, categories);

  // Result audit (best-effort; the intent row above is the I6 guarantee).
  await writeAuditLog(sb, {
    tenant_id: tenantId, profile_id: gate.caller.profileId, action: 'tenant.clean_slate',
    resource_type: 'tenant', resource_id: tenantId,
    changes: { categories, phase: 'completed', totalDeleted: result.totalDeleted, unlinkedCalcTraces: result.unlinkedCalcTraces, collateralEffects: result.collateralEffects, perTable: result.results },
    metadata: { actor: gate.caller.email, hadError: result.hadError },
  });

  return NextResponse.json({
    ok: !result.hadError, tenantId, tenantName: tenant.name, categories,
    results: result.results, totalDeleted: result.totalDeleted, unlinkedCalcTraces: result.unlinkedCalcTraces,
    collateralEffects: result.collateralEffects, audited: true,
  });
}
