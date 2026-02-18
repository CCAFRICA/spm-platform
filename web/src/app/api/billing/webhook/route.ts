/**
 * Stripe Webhook Handler
 *
 * POST /api/billing/webhook
 * Handles Stripe subscription events:
 *   - checkout.session.completed → activate subscription
 *   - customer.subscription.updated → update billing status
 *   - customer.subscription.deleted → mark cancelled
 *   - invoice.payment_failed → mark past_due
 *
 * Uses raw body for signature verification (Next.js App Router).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import type { Json } from '@/lib/supabase/database.types';
import type Stripe from 'stripe';

// Disable body parsing — Stripe requires raw body for signature verification
export const dynamic = 'force-dynamic';

async function updateTenantBilling(
  tenantId: string,
  billingUpdate: Record<string, unknown>,
) {
  const supabase = await createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    console.error(`[Webhook] Tenant not found: ${tenantId}`);
    return;
  }

  const settings = (tenant.settings || {}) as Record<string, unknown>;
  const billing = (settings.billing || {}) as Record<string, unknown>;

  await supabase
    .from('tenants')
    .update({
      settings: {
        ...settings,
        billing: { ...billing, ...billingUpdate },
      } as unknown as Json,
    })
    .eq('id', tenantId);
}

function getTenantIdFromMetadata(obj: { metadata?: Record<string, string> | null }): string | null {
  return obj.metadata?.tenantId || null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const tenantId = getTenantIdFromMetadata(session);
  if (!tenantId) {
    console.error('[Webhook] checkout.session.completed: no tenantId in metadata');
    return;
  }

  await updateTenantBilling(tenantId, {
    status: 'active',
    subscription_id: session.subscription,
    tier: session.metadata?.tier || 'inicio',
    modules: session.metadata?.modules ? session.metadata.modules.split(',') : [],
    activated_at: new Date().toISOString(),
    trial_end: null,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const tenantId = getTenantIdFromMetadata(subscription);
  if (!tenantId) return;

  await updateTenantBilling(tenantId, {
    status: subscription.status === 'active' ? 'active' : subscription.status,
    updated_at: new Date().toISOString(),
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const tenantId = getTenantIdFromMetadata(subscription);
  if (!tenantId) return;

  await updateTenantBilling(tenantId, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // In Stripe v20+, subscription is on invoice.parent.subscription_details
  const stripe = getStripe();
  const parent = invoice.parent;
  if (!parent?.subscription_details) return;

  const subRef = parent.subscription_details.subscription;
  if (!subRef) return;

  const subscriptionId = typeof subRef === 'string' ? subRef : subRef.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) return;

  await updateTenantBilling(tenantId, {
    status: 'past_due',
    last_payment_failed_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    if (!STRIPE_CONFIG.webhookSecret) {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_CONFIG.webhookSecret);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}
