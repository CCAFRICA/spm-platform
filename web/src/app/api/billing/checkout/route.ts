/**
 * Stripe Checkout Session API
 *
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session for subscription purchase.
 *
 * Body: { tenantId, tier, modules[], experienceTier? }
 * Returns: { url } — redirect URL to Stripe Checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { getTier, getModule, getBundleDiscount, EXPERIENCE_TIERS } from '@/lib/stripe/config';
import type { Json } from '@/lib/supabase/database.types';
import type Stripe from 'stripe';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const { tenantId, tier: tierId, modules = [], experienceTier = 'standard' } = await request.json();

    // Validate tenantId
    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
    }

    // Validate tier
    const tier = getTier(tierId);
    if (!tier || tier.contactSales) {
      return NextResponse.json({ error: `Invalid tier or contact-sales-only tier: ${tierId}` }, { status: 400 });
    }
    if (!tier.priceId) {
      return NextResponse.json({ error: `No Stripe price configured for tier: ${tierId}` }, { status: 400 });
    }

    // Verify tenant exists
    const supabase = await createServiceRoleClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const stripe = getStripe();

    // Create or retrieve Stripe customer
    let customerId = settings.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: { tenantId: tenant.id },
      });
      customerId = customer.id;

      // Store customer ID in tenant settings
      await supabase
        .from('tenants')
        .update({ settings: { ...settings, stripe_customer_id: customerId } as unknown as Json })
        .eq('id', tenantId);
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    // Platform tier
    lineItems.push({
      price: tier.priceId,
      quantity: 1,
    });

    // Modules
    const validModules = (modules as string[]).filter(id => {
      const mod = getModule(id);
      return mod && mod.priceId;
    });

    for (const moduleId of validModules) {
      const mod = getModule(moduleId)!;
      lineItems.push({
        price: mod.priceId,
        quantity: 1,
      });
    }

    // Experience tier surcharge (if not standard)
    const experience = EXPERIENCE_TIERS.find(e => e.id === experienceTier);

    // Calculate bundle discount metadata
    const bundleDiscount = getBundleDiscount(validModules.length);

    // Determine origin for redirect
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/?upgraded=true`,
      cancel_url: `${origin}/upgrade?cancelled=true`,
      metadata: {
        tenantId,
        tier: tierId,
        modules: validModules.join(','),
        experienceTier: experience?.id || 'standard',
        bundleDiscount: String(bundleDiscount),
      },
      subscription_data: {
        metadata: {
          tenantId,
          tier: tierId,
          modules: validModules.join(','),
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[POST /api/billing/checkout] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
