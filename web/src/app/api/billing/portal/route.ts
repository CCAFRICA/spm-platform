/**
 * Stripe Customer Portal API
 *
 * POST /api/billing/portal
 * Creates a Stripe Billing Portal session for subscription management.
 *
 * Body: { tenantId }
 * Returns: { url } — redirect URL to Stripe Customer Portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await request.json();

    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const customerId = settings.stripe_customer_id as string | undefined;

    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing account found. Subscribe first.' },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[POST /api/billing/portal] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create portal session' },
      { status: 500 },
    );
  }
}
