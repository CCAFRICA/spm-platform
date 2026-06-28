/**
 * OB-252 — GET/PATCH /api/platform/tenants/[tenantId]
 *
 * The Observatory Tenant Admin surface's IDENTITY endpoint (Section A). Platform-admin only
 * (authorizePlatformObservability → platform.system_config). Reads/writes the tenant's identity:
 *   - name, locale, currency       → real `tenants` columns (FP-49 verified)
 *   - country, industry, logo      → `tenants.settings` JSONB under the EXISTING keys
 *                                    country_code / industry / logo_url (zero migration; the create
 *                                    wizard already writes these keys)
 *   - slug, id                     → read-only reference (slug is the immutable tenant key)
 *
 * Every PATCH writes a before→after row to audit_logs (I4). Deterministic, no LLM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Settings = Record<string, unknown>;

/** Shape the surface reads/edits — semantic names mapped to storage on write. */
interface TenantIdentity {
  id: string;
  name: string;
  slug: string;          // read-only
  locale: string;
  currency: string;
  country: string;       // settings.country_code
  industry: string;      // settings.industry
  logo: string;          // settings.logo_url
}

function readIdentity(row: { id: string; name: string; slug: string; locale: string | null; currency: string | null; settings: Settings | null }): TenantIdentity {
  const s = (row.settings || {}) as Settings;
  return {
    id: row.id,
    name: row.name ?? '',
    slug: row.slug ?? '',
    locale: row.locale ?? 'en',
    currency: row.currency ?? 'USD',
    country: (s.country_code as string) ?? '',
    industry: (s.industry as string) ?? '',
    logo: (s.logo_url as string) ?? '',
  };
}

/** GET — the tenant's editable identity + raw features (so the surface can render all sections in one fetch). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, slug, locale, currency, settings, features')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  return NextResponse.json({
    identity: readIdentity(tenant),
    features: (tenant.features as Record<string, boolean>) || {},
  });
}

/** PATCH — update identity. Only supplied fields change; before→after is audited. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const gate = await authorizePlatformObservability();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await request.json()) as Partial<{
      name: string; locale: string; currency: string; country: string; industry: string; logo: string;
    }>;

    const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data: tenant, error: readErr } = await supabase
      .from('tenants')
      .select('id, name, slug, locale, currency, settings')
      .eq('id', tenantId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const before = readIdentity(tenant);
    const settings: Settings = { ...((tenant.settings as Settings) || {}) };

    // Column updates (only when supplied + non-empty for required-ish columns).
    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim().length > 0) update.name = body.name.trim();
    if (typeof body.locale === 'string' && body.locale.trim().length > 0) update.locale = body.locale.trim();
    if (typeof body.currency === 'string' && body.currency.trim().length > 0) update.currency = body.currency.trim();

    // JSONB identity (country/industry/logo) — exact existing keys; empty string clears the key.
    if (typeof body.country === 'string') settings.country_code = body.country.trim();
    if (typeof body.industry === 'string') settings.industry = body.industry.trim();
    if (typeof body.logo === 'string') settings.logo_url = body.logo.trim();

    update.settings = settings;
    update.updated_at = new Date().toISOString();

    const { data: updated, error: writeErr } = await supabase
      .from('tenants')
      .update(update)
      .eq('id', tenantId)
      .select('id, name, slug, locale, currency, settings')
      .single();
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    const after = readIdentity(updated);

    // I4 audit: only the fields that actually changed.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    (Object.keys(after) as (keyof TenantIdentity)[]).forEach((k) => {
      if (k === 'id' || k === 'slug') return; // immutable references
      if (before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
    });
    if (Object.keys(changes).length > 0) {
      await writeAuditLog(supabase, {
        tenant_id: tenantId,
        profile_id: gate.caller.profileId,
        action: 'tenant.identity_updated',
        resource_type: 'tenant',
        resource_id: tenantId,
        changes,
        metadata: { source: 'observatory-tenant-admin', actor_auth_user_id: gate.caller.authUserId },
      });
    }

    return NextResponse.json({ identity: after, changed: Object.keys(changes) });
  } catch (err) {
    console.error('[PATCH /api/platform/tenants/[tenantId]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
