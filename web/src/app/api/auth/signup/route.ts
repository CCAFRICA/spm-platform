/**
 * POST /api/auth/signup
 *
 * Self-service signup: creates auth user → tenant → profile → metering event.
 * Uses service role client to bypass RLS (the user has no session yet).
 *
 * OB-60 Phase 2: The first self-service signup in the ICM/SPM category.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { emitEvent } from '@/lib/events/emitter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, orgName, entityCount } = body;

    // ── Validation ──
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!orgName || typeof orgName !== 'string' || orgName.trim().length < 2) {
      return NextResponse.json({ error: 'Organization name is required (min 2 characters)' }, { status: 400 });
    }

    const trimmedOrg = orgName.trim();
    const count = Math.max(1, Math.min(100000, Number(entityCount) || 50));

    const supabase = await createServiceRoleClient();

    // ── 1. Check if email already exists ──
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in.' },
        { status: 409 }
      );
    }

    // ── 2. Create Supabase auth user ──
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Skip email verification for PLG frictionless signup
      user_metadata: {
        display_name: email.split('@')[0],
        org_name: trimmedOrg,
      },
    });

    if (authError) {
      console.error('[POST /api/auth/signup] Auth user creation failed:', authError.message);
      if (authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Account creation failed: ${authError.message}` },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // ── 3. Generate slug from org name ──
    const baseSlug = trimmedOrg
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // Ensure uniqueness by appending random suffix
    const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

    // ── 4. Detect platform tier ──
    const tier = count <= 100 ? 'Inicio'
      : count <= 1000 ? 'Crecimiento'
      : count <= 10000 ? 'Profesional'
      : 'Empresarial';

    // ── 5. Create tenant ──
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: trimmedOrg,
        slug,
        settings: {
          billing: { tier, experience_tier: 'self-service' },
          trial: {
            started_at: now.toISOString(),
            expires_at: trialEnd.toISOString(),
          },
          entity_estimate: count,
          created_via: 'self-service-signup',
        },
        currency: 'USD',
        locale: 'en',
        features: {},
        hierarchy_labels: {},
        entity_type_labels: {},
      })
      .select('id, name, slug')
      .single();

    if (tenantError) {
      console.error('[POST /api/auth/signup] Tenant creation failed:', tenantError.message);
      // Clean up auth user on tenant failure
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: `Organization creation failed: ${tenantError.message}` },
        { status: 500 }
      );
    }

    // ── 6. Create profile linked to tenant ──
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: userId,
        tenant_id: tenant.id,
        display_name: email.split('@')[0],
        email: email.toLowerCase(),
        role: 'tenant_admin',
        capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments', 'import_data'],
        scope_level: 'tenant',
        locale: 'en',
        status: 'active',
        settings: {},
      });

    if (profileError) {
      console.error('[POST /api/auth/signup] Profile creation failed:', profileError.message);
      // Non-fatal — the user can still log in and we can fix this
    }

    // ── 7. Create metering entry ──
    try {
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await supabase.from('usage_metering').insert({
        tenant_id: tenant.id,
        metric_name: 'tenant_created',
        metric_value: 1,
        period_key: periodKey,
        metadata: {
          created_by: email.toLowerCase(),
          source: 'self-service-signup',
          entity_estimate: count,
        },
      });
    } catch {
      // Non-fatal metering error
    }

    console.log(`[POST /api/auth/signup] Signup complete: ${email} → ${tenant.name} (${tenant.slug})`);

    // Emit user.signed_up event (fire-and-forget)
    emitEvent({
      tenant_id: tenant.id,
      event_type: 'user.signed_up',
      payload: { email, org_name: tenant.name },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/auth/signup] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
