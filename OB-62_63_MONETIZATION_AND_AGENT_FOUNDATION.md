# OB-62/63: MONETIZATION, AGENT FOUNDATION, AND EMBEDDED TRAINING

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

OB-60 opened the front door (public landing, self-service signup). OB-61 built the activation experience (GPV wizard, trial gates). A customer can now find Vialuce, sign up, upload their plan, upload their data, see their calculations, and explore the platform — all in under 5 minutes.

**What's missing: money and intelligence.**

No payment can be collected. Trial gates say "Upgrade" but there's nowhere to upgrade TO. The platform has no way to convert a trialing tenant into a paying customer. And once they are paying, the platform is passive — it waits for users to click things instead of proactively helping them succeed.

This combined OB delivers both:

1. **Monetization** (OB-62 scope): Stripe checkout, subscription management, Google SSO for frictionless auth, and the "Convert" step of the self-service journey.
2. **Agent Foundation** (OB-63 scope): The event bus, Agent Loop (Observe → Decide → Act → Report), Agent Inbox on persona dashboards, embedded training (CoachMark + user_journey), and expansion signal detection.

Together, these complete **Steps 5-7** of the self-service customer journey — the full path from trial to paid to expanding.

| # | Mission | Phases | Priority |
|---|---------|--------|----------|
| 1 | Stripe Integration (Checkout + Webhooks + Portal) | 0-2 | P0 |
| 2 | Google SSO | 3 | P0 |
| 3 | Agent Event Bus + Agent Loop | 4-5 | P0 |
| 4 | Agent Inbox on Persona Dashboards | 6 | P0 |
| 5 | Embedded Training (CoachMark + user_journey) | 7 | P1 |
| 6 | Expansion Signal Detection | 8 | P1 |
| 7 | Verification + PR | 9 | — |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev`
5. Commit this prompt to git as first action.
6. Inline styles as primary visual strategy for anything that must not be overridden.
7. Domain-agnostic always. The engine doesn't know it's ICM.
8. Brand palette: Deep Indigo (#2D2F8F) + Gold (#E8A838). Inter font family for UI.
9. NEVER provide answer values — fix logic not data.
10. Security/scale/performance by design, not retrofitted.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## THE PROOF GATE RULE

Every proof gate must include:
1. **`curl` output** or **Supabase query result**
2. **`grep` count** — for removal/existence proofs
3. **Terminal evidence** — copy-paste from terminal

---

## CC ANTI-PATTERNS

| Anti-Pattern | Prevention |
|---|---|
| Component graveyard | Every component MUST be imported by a page.tsx |
| Self-verified proof gates | Terminal output required |
| Browser client for protected writes | Service role API routes |
| CSS class reliance | Inline styles for anything that must not be overridden |
| N+1 queries | Batch data loading, never per-row |
| Sending wrong field as ID | ALWAYS use `.id` from context objects, NEVER `.name` or `.display_name` |
| Placeholder Syndrome | ZERO "Coming Soon" buttons. If it exists, it works. |
| Report Burial | PROJECT ROOT only |

---

## PREREQUISITE: ENVIRONMENT VARIABLES

This OB requires Stripe keys. Before starting Phase 0, check:

```bash
echo "=== CHECK STRIPE ENV VARS ==="
grep -r "STRIPE" web/.env.local 2>/dev/null | head -5
grep -r "STRIPE" web/.env 2>/dev/null | head -5
grep -r "STRIPE" .env.local 2>/dev/null | head -5

echo ""
echo "=== CHECK GOOGLE AUTH PROVIDER ==="
grep -r "GOOGLE" web/.env.local 2>/dev/null | head -5
grep -r "google" web/src/lib/supabase/ --include="*.ts" | head -5
```

If Stripe keys are NOT present, create placeholder env vars and document them in the completion report. The code must be correct and deployable — only the keys need to be added. Similarly for Google OAuth — the Supabase provider may need to be enabled in the dashboard separately.

---

# ═══════════════════════════════════════════════════════
# PHASE 0: STRIPE — DATA LAYER AND CONFIGURATION
# ═══════════════════════════════════════════════════════

**What:** Set up Stripe SDK, pricing configuration, and the data layer for subscription management.

## 0A: Install Stripe SDK

```bash
cd web
npm install stripe @stripe/stripe-js
```

## 0B: Create Stripe configuration

Create `web/src/lib/stripe/config.ts`:

```typescript
// Pricing tiers mapped to Stripe Price IDs
// These IDs are set in .env.local and created in Stripe Dashboard
export const STRIPE_CONFIG = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

// Platform tier → Stripe Price mapping
// Price IDs are configured in environment because they're Stripe-specific
export const TIER_PRICE_IDS: Record<string, string> = {
  Inicio: process.env.STRIPE_PRICE_INICIO || '',
  Crecimiento: process.env.STRIPE_PRICE_CRECIMIENTO || '',
  Profesional: process.env.STRIPE_PRICE_PROFESIONAL || '',
  Empresarial: process.env.STRIPE_PRICE_EMPRESARIAL || '',
};

// Module → Stripe Price mapping (per tier)
// Format: STRIPE_PRICE_{MODULE}_{TIER}
export function getModulePriceId(module: string, tier: string): string {
  const key = `STRIPE_PRICE_${module.toUpperCase()}_${tier.toUpperCase()}`;
  return process.env[key] || '';
}

// Platform pricing (for display, independent of Stripe)
export const PLATFORM_TIERS = [
  { name: 'Free', maxEntities: 10, price: 0 },
  { name: 'Inicio', maxEntities: 100, price: 299 },
  { name: 'Crecimiento', maxEntities: 1000, price: 999 },
  { name: 'Profesional', maxEntities: 10000, price: 2999 },
  { name: 'Empresarial', maxEntities: 50000, price: 7999 },
  { name: 'Corporativo', maxEntities: Infinity, price: -1 }, // Custom
] as const;

export const MODULE_PRICES: Record<string, Record<string, number>> = {
  ICM:        { Inicio: 199, Crecimiento: 499, Profesional: 1499, Empresarial: 3999 },
  TFI:        { Inicio: 199, Crecimiento: 499, Profesional: 1499, Empresarial: 3999 },
  Projection: { Inicio: 149, Crecimiento: 0,   Profesional: 0,    Empresarial: 0 },
  Manager:    { Inicio: 99,  Crecimiento: 299, Profesional: 899,  Empresarial: 1999 },
  Dispute:    { Inicio: 99,  Crecimiento: 199, Profesional: 499,  Empresarial: 999 },
  Compliance: { Inicio: 0,   Crecimiento: 0,   Profesional: 499,  Empresarial: 999 },
};

export const BUNDLE_DISCOUNTS: Record<number, number> = { 1: 0, 2: 0.10, 3: 0.15, 4: 0.20 };
export const EXPERIENCE_RATES: Record<string, number> = {
  'Self-Service': 0,
  'Guided': 0.12,
  'Strategic': 0.17,
};
```

## 0C: Create Stripe server client

Create `web/src/lib/stripe/server.ts`:

```typescript
import Stripe from 'stripe';
import { STRIPE_CONFIG } from './config';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!STRIPE_CONFIG.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeInstance = new Stripe(STRIPE_CONFIG.secretKey, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    });
  }
  return stripeInstance;
}
```

## 0D: Add required env vars to .env.local template

Create `web/.env.stripe.example`:

```
# Stripe Configuration
# Create these in your Stripe Dashboard → Products → Prices
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Platform tier price IDs (create recurring prices in Stripe)
STRIPE_PRICE_INICIO=price_...
STRIPE_PRICE_CRECIMIENTO=price_...
STRIPE_PRICE_PROFESIONAL=price_...
STRIPE_PRICE_EMPRESARIAL=price_...

# Module price IDs (per tier)
STRIPE_PRICE_ICM_INICIO=price_...
STRIPE_PRICE_ICM_CRECIMIENTO=price_...
# ... (add all module x tier combinations as needed)
```

## 0E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Stripe SDK installed | `grep "stripe" web/package.json \| wc -l` | ≥2 |
| PG-2 | Config file exists | `find web/src/lib/stripe -name "config.ts" \| wc -l` | 1 |
| PG-3 | Server client exists | `find web/src/lib/stripe -name "server.ts" \| wc -l` | 1 |

**Commit:** `OB-62/63 Phase 0: Stripe SDK + pricing config + server client`

---

# ═══════════════════════════════════════════════════════
# PHASE 1: STRIPE — CHECKOUT AND SUBSCRIPTION API
# ═══════════════════════════════════════════════════════

## 1A: Create Checkout Session API

Create `web/src/app/api/billing/checkout/route.ts`:

This is called when a trialing tenant clicks "Upgrade" or "View Plans" from a TrialGate.

```typescript
import { getStripe } from '@/lib/stripe/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { TIER_PRICE_IDS, getModulePriceId } from '@/lib/stripe/config';

export async function POST(request: Request) {
  const { tenantId, tier, modules, experienceTier } = await request.json();

  // Validate tenantId
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 });
  }

  // Get tenant to verify it exists
  const supabase = createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, settings')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const stripe = getStripe();

  // Build line items
  const lineItems: Array<{ price: string; quantity: number }> = [];

  // Platform tier
  const platformPriceId = TIER_PRICE_IDS[tier];
  if (platformPriceId) {
    lineItems.push({ price: platformPriceId, quantity: 1 });
  }

  // Modules
  for (const mod of modules || []) {
    const modulePriceId = getModulePriceId(mod, tier);
    if (modulePriceId) {
      lineItems.push({ price: modulePriceId, quantity: 1 });
    }
  }

  // If no valid price IDs (keys not configured), return config error
  if (lineItems.length === 0) {
    return NextResponse.json(
      { error: 'Stripe prices not configured. Contact support.' },
      { status: 503 }
    );
  }

  try {
    // Check for existing Stripe customer
    const existingCustomerId = tenant.settings?.billing?.stripe_customer_id;

    let customerId = existingCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: { vialuce_tenant_id: tenantId },
      });
      customerId = customer.id;

      // Store customer ID
      const settings = tenant.settings || {};
      settings.billing = { ...settings.billing, stripe_customer_id: customerId };
      await supabase.from('tenants').update({ settings }).eq('id', tenantId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vialuce.ai'}/admin?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vialuce.ai'}/admin?upgrade=cancelled`,
      metadata: {
        vialuce_tenant_id: tenantId,
        tier,
        modules: JSON.stringify(modules || []),
        experience_tier: experienceTier || 'Self-Service',
      },
      subscription_data: {
        metadata: {
          vialuce_tenant_id: tenantId,
          tier,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

## 1B: Create Stripe Webhook Handler

Create `web/src/app/api/billing/webhook/route.ts`:

This is the critical path — Stripe calls this endpoint when a subscription is created, updated, or cancelled. It must update the tenant's billing status in Supabase.

```typescript
import { getStripe } from '@/lib/stripe/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = getStripe();
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_CONFIG.webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tenantId = session.metadata?.vialuce_tenant_id;
      if (!tenantId) break;

      const { data: tenant } = await supabase
        .from('tenants').select('settings').eq('id', tenantId).single();
      const settings = tenant?.settings || {};

      settings.billing = {
        ...settings.billing,
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer,
        status: 'active',
        tier: session.metadata?.tier,
        modules: JSON.parse(session.metadata?.modules || '[]'),
        experience_tier: session.metadata?.experience_tier,
        activated_at: new Date().toISOString(),
      };

      // Clear trial flags — tenant is now paid
      if (settings.trial) {
        settings.trial.converted_at = new Date().toISOString();
      }

      await supabase.from('tenants')
        .update({ settings, tier: session.metadata?.tier, updated_at: new Date().toISOString() })
        .eq('id', tenantId);

      // Metering event
      await supabase.from('usage_metering').insert({
        tenant_id: tenantId,
        event_type: 'subscription_activated',
        quantity: 1,
        metadata: { tier: session.metadata?.tier, subscription_id: session.subscription },
      }).catch(() => {});

      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const tenantId = subscription.metadata?.vialuce_tenant_id;
      if (!tenantId) break;

      const { data: tenant } = await supabase
        .from('tenants').select('settings').eq('id', tenantId).single();
      const settings = tenant?.settings || {};

      settings.billing = {
        ...settings.billing,
        status: subscription.status === 'active' ? 'active'
              : subscription.status === 'past_due' ? 'past_due'
              : subscription.status === 'canceled' ? 'cancelled'
              : subscription.status,
      };

      await supabase.from('tenants')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', tenantId);

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const tenantId = subscription.metadata?.vialuce_tenant_id;
      if (!tenantId) break;

      const { data: tenant } = await supabase
        .from('tenants').select('settings').eq('id', tenantId).single();
      const settings = tenant?.settings || {};

      settings.billing = {
        ...settings.billing,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      };

      await supabase.from('tenants')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', tenantId);

      // Metering event
      await supabase.from('usage_metering').insert({
        tenant_id: tenantId,
        event_type: 'subscription_cancelled',
        quantity: 1,
        metadata: { subscription_id: subscription.id },
      }).catch(() => {});

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const tenantId = invoice.subscription_details?.metadata?.vialuce_tenant_id
                     || invoice.metadata?.vialuce_tenant_id;
      if (!tenantId) break;

      const { data: tenant } = await supabase
        .from('tenants').select('settings').eq('id', tenantId).single();
      const settings = tenant?.settings || {};

      settings.billing = {
        ...settings.billing,
        status: 'past_due',
        last_payment_failed_at: new Date().toISOString(),
      };

      await supabase.from('tenants')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', tenantId);

      break;
    }
  }

  return NextResponse.json({ received: true });
}

// Stripe webhooks send raw body — disable Next.js body parsing
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

**CRITICAL:** The webhook route must receive the raw body for signature verification. Add to `next.config.js` if needed:

```bash
echo "=== CHECK IF WEBHOOK NEEDS RAW BODY CONFIG ==="
grep -n "bodyParser\|raw\|webhook" web/next.config.js 2>/dev/null | head -5
grep -n "bodyParser\|raw\|webhook" web/next.config.mjs 2>/dev/null | head -5
```

If Next.js App Router is used (which it is), the raw body is accessible via `request.text()` — no additional config needed.

## 1C: Create Customer Portal API

Create `web/src/app/api/billing/portal/route.ts`:

This lets paying customers manage their subscription (upgrade, downgrade, cancel, update payment method).

```typescript
import { getStripe } from '@/lib/stripe/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { tenantId } = await request.json();

  const supabase = createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants').select('settings').eq('id', tenantId).single();

  const customerId = tenant?.settings?.billing?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vialuce.ai'}/admin`,
  });

  return NextResponse.json({ url: session.url });
}
```

## 1D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4 | Checkout API exists | `find web/src/app/api/billing/checkout -name "route.ts" \| wc -l` | 1 |
| PG-5 | Webhook handler exists | `find web/src/app/api/billing/webhook -name "route.ts" \| wc -l` | 1 |
| PG-6 | Portal API exists | `find web/src/app/api/billing/portal -name "route.ts" \| wc -l` | 1 |
| PG-7 | Webhook handles 4 event types | `grep -c "case '" web/src/app/api/billing/webhook/route.ts` | ≥4 |
| PG-8 | Checkout sends tenant metadata to Stripe | `grep -c "vialuce_tenant_id" web/src/app/api/billing/checkout/route.ts` | ≥2 |

**Commit:** `OB-62/63 Phase 1: Stripe checkout + webhook + portal API routes`

---

# ═══════════════════════════════════════════════════════
# PHASE 2: STRIPE — UPGRADE UI AND TRIAL GATE WIRING
# ═══════════════════════════════════════════════════════

## 2A: Create Pricing / Upgrade page

Create `web/src/app/upgrade/page.tsx`:

This is the page that TrialGate's "View Plans →" button navigates to. It shows pricing, lets the user select a tier and modules, and initiates Stripe Checkout.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Choose Your Plan                                                   │
│  Your trial includes everything. Pick what fits when you're ready.  │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │   Inicio    │  │ Crecimiento │  │ Profesional │  │Empresarial│ │
│  │  $299/mo    │  │   $999/mo   │  │  $2,999/mo  │  │ $7,999/mo │ │
│  │  ≤100       │  │   ≤1,000    │  │   ≤10,000   │  │  ≤50,000  │ │
│  │  entities   │  │   entities  │  │   entities  │  │  entities │ │
│  │ [Select →]  │  │  [Select →] │  │  [Select →] │  │[Contact →]│ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │
│                                                                     │
│  ┌─ Add Agents ──────────────────────────────────────────────────┐  │
│  │ ☑ Compensation Agent   $199/mo                                │  │
│  │ ☐ Financial Agent      $199/mo                                │  │
│  │ ☐ Forecasting Agent    $149/mo                                │  │
│  │ ☐ Coaching Agent       $99/mo                                 │  │
│  │ ☐ Resolution Agent     $99/mo                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Monthly Total: $498 (Inicio + Compensation Agent)                  │
│  [Subscribe →]                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Page reads current tenant tier and entity count from context
- Auto-recommends tier based on entity count (highlight the matching tier card)
- Module selection checkboxes with per-tier pricing
- Bundle discount shown when ≥2 modules selected
- "Subscribe →" calls `/api/billing/checkout` and redirects to Stripe Checkout
- Empresarial shows "Contact Us" instead of Subscribe (links to support email)
- ALL INLINE STYLES

**Styling:**
- Background: #020617
- Tier cards: #0F172A, border #1E293B, selected card has gold (#E8A838) border
- Recommended tier: subtle gold glow + "Recommended" badge
- Agent checkboxes: gold accent color
- Subscribe button: #2D2F8F background, white text, 16px, bold
- Total: 24px, white, with gold accent on the number

## 2B: Wire TrialGate to upgrade page

Update the existing `TrialGate` component (from OB-61) so that `onUpgrade` navigates to `/upgrade`:

```bash
echo "=== FIND TRIALGATE COMPONENT ==="
find web/src/components/trial -name "*.tsx" | head -5
grep -n "onUpgrade" web/src/components/trial/TrialGate.tsx 2>/dev/null | head -5
```

Ensure every TrialGate's `onUpgrade` prop is wired to `router.push('/upgrade')`.

## 2C: Post-upgrade success handling

When the user returns from Stripe Checkout with `?upgraded=true`:

```bash
echo "=== FIND ADMIN DASHBOARD ==="
find web/src/app/admin -name "page.tsx" | head -3
find web/src/app -name "page.tsx" -path "*/admin/*" | head -3
```

On the admin dashboard, detect the `upgraded` query param and show a success toast:

```typescript
// On the admin dashboard page
const searchParams = useSearchParams();
const justUpgraded = searchParams.get('upgraded') === 'true';

// Show success notification
if (justUpgraded) {
  // Render a subtle inline banner (not a browser alert):
  // "🎉 Welcome to [tier]! Your subscription is active."
  // Auto-dismiss after 8 seconds
  // Remove ?upgraded from URL via router.replace
}
```

## 2D: Billing management for paid tenants

Add a "Manage Subscription" button somewhere accessible to admin users. When clicked, it calls `/api/billing/portal` and redirects to Stripe's Customer Portal.

```bash
echo "=== FIND WHERE TO ADD BILLING MANAGEMENT ==="
grep -rn "billing\|subscription\|Billing" web/src/components/ --include="*.tsx" | grep -v node_modules | head -10
```

The button should appear:
1. In the admin dashboard header area (if tenant is paid)
2. In the Configure section (if it exists)
3. As a replacement for TrialBadge when tenant is paid (show "Inicio Plan" instead of "14d remaining")

## 2E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | Upgrade page exists | `find web/src/app/upgrade -name "page.tsx" \| wc -l` | 1 |
| PG-10 | Upgrade page shows tier cards | `grep -c "Inicio\|Crecimiento\|Profesional\|Empresarial" web/src/app/upgrade/page.tsx` | ≥4 |
| PG-11 | Upgrade page calls checkout API | `grep -c "api/billing/checkout" web/src/app/upgrade/page.tsx` | ≥1 |
| PG-12 | TrialGate wired to /upgrade | `grep -c "upgrade\|/upgrade" web/src/components/trial/TrialGate.tsx` | ≥1 |
| PG-13 | Post-upgrade detection | `grep -c "upgraded" web/src/app/admin/page.tsx 2>/dev/null \|\| grep -c "upgraded" web/src/app/*/page.tsx 2>/dev/null` | ≥1 |

**Commit:** `OB-62/63 Phase 2: Upgrade page + trial gate wiring + post-upgrade success`

---

# ═══════════════════════════════════════════════════════
# PHASE 3: GOOGLE SSO
# ═══════════════════════════════════════════════════════

**What:** Add Google as a sign-in option alongside email/password. This reduces signup friction and is expected by enterprise users.

## 3A: Diagnose current auth setup

```bash
echo "=== CURRENT AUTH CONFIGURATION ==="
grep -rn "signInWith\|signUp\|auth\." web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== LOGIN PAGE ==="
find web/src/app -name "page.tsx" -path "*login*" -o -name "page.tsx" -path "*signin*" -o -name "page.tsx" -path "*auth*" | head -5

echo ""
echo "=== SIGNUP PAGE ==="
find web/src/app -name "page.tsx" -path "*signup*" -o -name "page.tsx" -path "*register*" | head -5

echo ""
echo "=== SUPABASE AUTH CONFIG ==="
grep -rn "supabaseUrl\|supabaseAnonKey\|createClient" web/src/lib/supabase/ --include="*.ts" | head -10
```

## 3B: Add Google OAuth button to login and signup pages

On both login and signup pages, add a "Continue with Google" button ABOVE the email/password form:

```typescript
const handleGoogleSignIn = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  if (error) console.error('Google sign-in error:', error);
};
```

**Button styling:**
- White background, #333 text, 1px #DDD border
- Google "G" logo (inline SVG — don't import an external image)
- "Continue with Google" text
- Full width, matching the email/password form width
- Divider below: "— or —" in #94A3B8

## 3C: Create auth callback handler

Create `web/src/app/auth/callback/route.ts` (if it doesn't exist):

```bash
echo "=== CHECK FOR EXISTING CALLBACK ==="
find web/src/app/auth -name "route.ts" -o -name "page.tsx" | head -5
cat web/src/app/auth/callback/route.ts 2>/dev/null | head -20
```

If it doesn't exist:

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(requestUrl.origin);
}
```

## 3D: Handle Google SSO for new users (auto-provisioning)

When a user signs in via Google who doesn't have a profile yet, they need the same auto-provisioning that the signup form provides. Check if OB-60's signup flow handles this:

```bash
echo "=== SIGNUP AUTO-PROVISIONING ==="
grep -rn "auto.*provision\|createProfile\|createTenant\|after.*signup\|on.*auth.*state" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -10
```

If Google SSO users bypass the signup page, they'll need a profile creation step. Options:
1. **Post-auth middleware** — check if user has a profile, redirect to onboarding if not
2. **Dashboard guard** — the GPV wizard (from OB-61) naturally handles this since it checks tenant state

The most robust approach: in the auth callback or in the dashboard layout, check for profile existence. If missing, redirect to a lightweight onboarding page that asks for org name and entity count estimate (the same fields from OB-60 signup), then auto-provisions.

```bash
echo "=== EXISTING PROFILE CHECK ==="
grep -rn "profile.*null\|no.*profile\|!profile\|!.*user_profile" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -10
```

## 3E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-14 | Google button on login page | `grep -c "google\|Google\|signInWithOAuth" web/src/app/*login*/page.tsx web/src/app/*signin*/page.tsx 2>/dev/null` | ≥1 |
| PG-15 | Google button on signup page | `grep -c "google\|Google\|signInWithOAuth" web/src/app/*signup*/page.tsx web/src/app/*register*/page.tsx 2>/dev/null` | ≥1 |
| PG-16 | Auth callback route exists | `find web/src/app/auth -name "route.ts" \| wc -l` | ≥1 |
| PG-17 | Build passes with Google auth | `npm run build` exit code | 0 |

**Commit:** `OB-62/63 Phase 3: Google SSO — OAuth button + callback + auto-provisioning guard`

---

# ═══════════════════════════════════════════════════════
# PHASE 4: AGENT EVENT BUS — platform_events TABLE
# ═══════════════════════════════════════════════════════

**What:** The foundation for the Agent architecture. Every meaningful platform action emits an event. Agents observe events and decide whether to act.

## 4A: Create the platform_events table

This table is the nervous system. Every action that matters writes an event here.

Create a migration or add via API route (since we can't run raw SQL from the dev environment, create an API route that bootstraps the table):

Create `web/src/app/api/platform/bootstrap-events/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createServiceRoleClient();

  // Create platform_events table if not exists
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS platform_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor_id UUID,
        entity_id UUID,
        payload JSONB DEFAULT '{}',
        processed_by JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_tenant ON platform_events(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON platform_events(event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON platform_events(tenant_id, created_at DESC)
        WHERE processed_by = '[]'::jsonb;
    `
  });

  if (error) {
    // If rpc doesn't exist, try direct insert test
    return NextResponse.json({ error: error.message, hint: 'Create table manually in Supabase SQL editor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

**IMPORTANT:** If the `exec_sql` RPC doesn't exist in Supabase, document the CREATE TABLE SQL in the completion report and instruct Andrew to run it in the Supabase SQL editor. The code must work once the table exists.

**Alternative approach (preferred if RPC doesn't exist):** Write the SQL to a file, and have the event-emitting code gracefully handle the table not existing yet:

Create `web/src/lib/events/schema.sql`:
```sql
-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  entity_id UUID,
  payload JSONB DEFAULT '{}',
  processed_by JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tenant ON platform_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON platform_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON platform_events(tenant_id, created_at DESC)
  WHERE processed_by = '[]'::jsonb;
```

## 4B: Create the event emitter

Create `web/src/lib/events/emitter.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';

export type PlatformEventType =
  // Data events
  | 'data.imported'
  | 'data.committed'
  | 'data.anomaly_detected'
  // Plan events
  | 'plan.imported'
  | 'plan.interpreted'
  | 'plan.confirmed'
  // Calculation events
  | 'calculation.started'
  | 'calculation.completed'
  | 'calculation.outlier_detected'
  // Lifecycle events
  | 'lifecycle.advanced'
  | 'lifecycle.approval_requested'
  | 'lifecycle.approved'
  // User events
  | 'user.signed_up'
  | 'user.invited'
  | 'user.first_login'
  | 'user.feature_used'
  // Billing events
  | 'billing.trial_started'
  | 'billing.trial_expiring'
  | 'billing.subscription_activated'
  | 'billing.subscription_cancelled'
  // Dispute events
  | 'dispute.submitted'
  | 'dispute.resolved'
  // Agent events
  | 'agent.recommendation'
  | 'agent.action_taken'
  | 'agent.insight_generated';

export interface PlatformEvent {
  tenant_id: string;
  event_type: PlatformEventType;
  actor_id?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
}

export async function emitEvent(event: PlatformEvent): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from('platform_events').insert({
      tenant_id: event.tenant_id,
      event_type: event.event_type,
      actor_id: event.actor_id || null,
      entity_id: event.entity_id || null,
      payload: event.payload || {},
      processed_by: [],
    });
  } catch (error) {
    // Gracefully handle — event emission must never break the caller
    console.error('Event emission failed:', error);
  }
}

// Client-side version that calls an API route
export async function emitEventClient(event: Omit<PlatformEvent, 'tenant_id'> & { tenantId: string }): Promise<void> {
  try {
    await fetch('/api/platform/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: event.tenantId,
        event_type: event.event_type,
        actor_id: event.actor_id,
        entity_id: event.entity_id,
        payload: event.payload,
      }),
    });
  } catch (error) {
    console.error('Client event emission failed:', error);
  }
}
```

## 4C: Create client-side event API route

Create `web/src/app/api/platform/events/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const event = await request.json();

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!event.tenant_id || !UUID_REGEX.test(event.tenant_id)) {
    return NextResponse.json({ error: 'Invalid tenant_id' }, { status: 400 });
  }
  if (!event.event_type) {
    return NextResponse.json({ error: 'event_type required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('platform_events').insert({
    tenant_id: event.tenant_id,
    event_type: event.event_type,
    actor_id: event.actor_id || null,
    entity_id: event.entity_id || null,
    payload: event.payload || {},
    processed_by: [],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET — fetch recent events for a tenant (for Agent Loop to observe)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const since = searchParams.get('since'); // ISO timestamp
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  let query = supabase
    .from('platform_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
```

## 4D: Instrument existing actions with event emission

Add `emitEvent()` calls to key existing API routes. Search for the routes and add event emission at the success path:

```bash
echo "=== KEY API ROUTES TO INSTRUMENT ==="
echo "--- Plan import ---"
find web/src/app/api -path "*plan*import*" -name "route.ts" | head -3
echo "--- Calculation ---"
find web/src/app/api -path "*calculat*" -name "route.ts" | head -3
echo "--- Data import ---"
find web/src/app/api -path "*data*import*" -o -path "*data*commit*" -o -path "*ingest*" | grep "route.ts" | head -3
echo "--- Lifecycle ---"
find web/src/app/api -path "*lifecycle*" -name "route.ts" | head -3
echo "--- GPV ---"
find web/src/app/api -path "*gpv*" -name "route.ts" | head -3
echo "--- Signup ---"
find web/src/app/api -path "*signup*" -o -path "*register*" -o -path "*provision*" | grep "route.ts" | head -3
```

For each route found, add an `emitEvent()` call after the successful operation. Examples:

- Plan import success → `emitEvent({ tenant_id, event_type: 'plan.imported', payload: { plan_name, components_count } })`
- Calculation complete → `emitEvent({ tenant_id, event_type: 'calculation.completed', payload: { entity_count, total_payout } })`
- Lifecycle advance → `emitEvent({ tenant_id, event_type: 'lifecycle.advanced', payload: { from_state, to_state } })`
- GPV step advance → `emitEvent({ tenant_id, event_type: 'user.feature_used', payload: { feature: 'gpv', step } })`

**CRITICAL:** Event emission must NEVER block or fail the parent operation. Always use `.catch(() => {})` or try/catch with swallowed error. The event bus is observational — it must never break the thing it's observing.

## 4E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-18 | Event emitter exists | `find web/src/lib/events -name "emitter.ts" \| wc -l` | 1 |
| PG-19 | Event types defined | `grep -c "event_type" web/src/lib/events/emitter.ts` | ≥5 |
| PG-20 | Events API route exists | `find web/src/app/api/platform/events -name "route.ts" \| wc -l` | 1 |
| PG-21 | Schema SQL file exists | `find web/src/lib/events -name "schema.sql" \| wc -l` | 1 |
| PG-22 | At least 3 existing routes instrumented | `grep -rl "emitEvent" web/src/app/api/ --include="*.ts" \| wc -l` | ≥3 |

**Commit:** `OB-62/63 Phase 4: Agent event bus — platform_events table + emitter + API + instrumentation`

---

# ═══════════════════════════════════════════════════════
# PHASE 5: AGENT LOOP — OBSERVE → DECIDE → ACT → REPORT
# ═══════════════════════════════════════════════════════

**What:** The core Agent runtime. Each Agent has a defined scope (which events it observes), a decision function (what to do about them), an action function (doing it), and a report function (recording what it did).

## 5A: Create the Agent framework

Create `web/src/lib/agents/types.ts`:

```typescript
export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  observes: string[];           // Event types this agent watches
  enabled: boolean;
  // The decision function determines if action is needed
  // Returns null if no action, or an AgentAction if action is warranted
  evaluate: (events: PlatformEvent[], context: AgentContext) => Promise<AgentAction | null>;
}

export interface AgentContext {
  tenantId: string;
  tenantSettings: Record<string, unknown>;
  recentEvents: PlatformEvent[];
}

export interface AgentAction {
  agentId: string;
  type: 'recommendation' | 'alert' | 'automation' | 'insight';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  actionUrl?: string;           // Deep link to relevant page
  actionLabel?: string;         // Button text
  metadata?: Record<string, unknown>;
  persona?: 'admin' | 'manager' | 'rep' | 'all';
  expiresAt?: string;           // ISO timestamp — auto-dismiss after this
}

export interface AgentInboxItem extends AgentAction {
  id: string;
  tenantId: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
}
```

## 5B: Create the Agent registry

Create `web/src/lib/agents/registry.ts`:

```typescript
import { AgentDefinition } from './types';

// Agent definitions — each agent is declarative
const agents: AgentDefinition[] = [
  {
    id: 'compensation-agent',
    name: 'Compensation Agent',
    description: 'Monitors calculation accuracy, detects outliers, flags anomalies before approval.',
    observes: ['calculation.completed', 'calculation.outlier_detected', 'data.committed', 'lifecycle.advanced'],
    enabled: true,
    evaluate: async (events, context) => {
      // Check for calculation completion events
      const calcEvents = events.filter(e => e.event_type === 'calculation.completed');
      if (calcEvents.length === 0) return null;

      const latest = calcEvents[0];
      const entityCount = (latest.payload as any)?.entity_count || 0;
      const outliers = (latest.payload as any)?.outlier_count || 0;

      if (outliers > 0) {
        return {
          agentId: 'compensation-agent',
          type: 'alert',
          title: `${outliers} outlier${outliers > 1 ? 's' : ''} detected in latest calculation`,
          description: `Review ${outliers} entities with payout deviations > 2 standard deviations from mean.`,
          severity: outliers > 5 ? 'critical' : 'warning',
          actionUrl: '/admin',
          actionLabel: 'Review Outliers',
          persona: 'admin',
        };
      }

      // Positive feedback — calculation went smoothly
      if (entityCount > 0) {
        return {
          agentId: 'compensation-agent',
          type: 'insight',
          title: `${entityCount} entities calculated successfully`,
          description: 'All outcomes within expected ranges. Ready for review.',
          severity: 'info',
          actionUrl: '/admin',
          actionLabel: 'View Results',
          persona: 'admin',
        };
      }

      return null;
    },
  },
  {
    id: 'coaching-agent',
    name: 'Coaching Agent',
    description: 'Surfaces performance patterns and suggests coaching actions for managers.',
    observes: ['calculation.completed', 'data.committed'],
    enabled: true,
    evaluate: async (events, context) => {
      const calcEvents = events.filter(e => e.event_type === 'calculation.completed');
      if (calcEvents.length === 0) return null;

      // When a new calculation completes, suggest manager review
      return {
        agentId: 'coaching-agent',
        type: 'recommendation',
        title: 'New calculation results available for team review',
        description: 'Performance data is current. Review team standings and identify coaching opportunities.',
        severity: 'info',
        actionUrl: '/manager',
        actionLabel: 'View Team Performance',
        persona: 'manager',
      };
    },
  },
  {
    id: 'resolution-agent',
    name: 'Resolution Agent',
    description: 'Pre-screens disputes, suggests resolutions, tracks patterns.',
    observes: ['dispute.submitted', 'calculation.completed'],
    enabled: true,
    evaluate: async (events, context) => {
      const disputes = events.filter(e => e.event_type === 'dispute.submitted');
      if (disputes.length === 0) return null;

      return {
        agentId: 'resolution-agent',
        type: 'alert',
        title: `${disputes.length} new dispute${disputes.length > 1 ? 's' : ''} submitted`,
        description: 'Review and resolve pending disputes before period close.',
        severity: disputes.length > 3 ? 'warning' : 'info',
        actionUrl: '/admin',
        actionLabel: 'Review Disputes',
        persona: 'admin',
      };
    },
  },
  {
    id: 'compliance-agent',
    name: 'Compliance Agent',
    description: 'Validates audit trails, flags separation-of-duty violations, monitors approval workflows.',
    observes: ['lifecycle.advanced', 'lifecycle.approved', 'lifecycle.approval_requested'],
    enabled: true,
    evaluate: async (events, context) => {
      // Check for lifecycle events without proper approval chain
      const advances = events.filter(e => e.event_type === 'lifecycle.advanced');
      for (const event of advances) {
        const payload = event.payload as any;
        if (payload?.to_state === 'APPROVED' && !payload?.approver_id) {
          return {
            agentId: 'compliance-agent',
            type: 'alert',
            title: 'Lifecycle advanced without recorded approver',
            description: 'An approval was recorded without approver attribution. Review for compliance.',
            severity: 'critical',
            actionUrl: '/admin',
            actionLabel: 'Review Audit Trail',
            persona: 'admin',
          };
        }
      }
      return null;
    },
  },
];

export function getAgent(id: string): AgentDefinition | undefined {
  return agents.find(a => a.id === id);
}

export function getAgentsForEvent(eventType: string): AgentDefinition[] {
  return agents.filter(a => a.enabled && a.observes.includes(eventType));
}

export function getAllAgents(): AgentDefinition[] {
  return agents;
}
```

## 5C: Create the Agent Loop runner

Create `web/src/lib/agents/runner.ts`:

The runner is called after events are emitted. It finds relevant agents, evaluates them, and writes actions to the Agent Inbox.

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAgentsForEvent, getAllAgents } from './registry';
import { AgentAction, AgentContext } from './types';

export async function runAgentLoop(tenantId: string, triggerEventType?: string): Promise<AgentAction[]> {
  const supabase = createServiceRoleClient();

  // 1. OBSERVE — Get recent events for this tenant
  const since = new Date();
  since.setHours(since.getHours() - 24); // Look at last 24 hours

  const { data: recentEvents } = await supabase
    .from('platform_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  const context: AgentContext = {
    tenantId,
    tenantSettings: tenant?.settings || {},
    recentEvents: recentEvents || [],
  };

  // 2. DECIDE — Run relevant agents
  const agents = triggerEventType
    ? getAgentsForEvent(triggerEventType)
    : getAllAgents().filter(a => a.enabled);

  const actions: AgentAction[] = [];

  for (const agent of agents) {
    try {
      const action = await agent.evaluate(recentEvents || [], context);
      if (action) {
        actions.push(action);
      }
    } catch (error) {
      console.error(`Agent ${agent.id} evaluation failed:`, error);
    }
  }

  // 3. ACT — Write actions to agent_inbox table
  for (const action of actions) {
    await supabase.from('agent_inbox').upsert({
      tenant_id: tenantId,
      agent_id: action.agentId,
      type: action.type,
      title: action.title,
      description: action.description,
      severity: action.severity,
      action_url: action.actionUrl || null,
      action_label: action.actionLabel || null,
      metadata: action.metadata || {},
      persona: action.persona || 'all',
      expires_at: action.expiresAt || null,
      created_at: new Date().toISOString(),
    }, {
      onConflict: 'tenant_id,agent_id,title',
      ignoreDuplicates: false,
    }).catch(err => console.error('Agent inbox write failed:', err));
  }

  // 4. REPORT — Emit agent events
  for (const action of actions) {
    await supabase.from('platform_events').insert({
      tenant_id: tenantId,
      event_type: 'agent.recommendation',
      payload: { agent_id: action.agentId, action_type: action.type, title: action.title },
    }).catch(() => {});
  }

  return actions;
}
```

## 5D: Create agent_inbox schema

Create `web/src/lib/agents/schema.sql`:

```sql
-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS agent_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('recommendation', 'alert', 'automation', 'insight')),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  persona TEXT DEFAULT 'all',
  expires_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, agent_id, title)
);

CREATE INDEX IF NOT EXISTS idx_inbox_tenant ON agent_inbox(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_persona ON agent_inbox(tenant_id, persona, dismissed_at)
  WHERE dismissed_at IS NULL;
```

## 5E: Wire Agent Loop to event emission

After events are emitted in the event API route, trigger the Agent Loop:

In `web/src/app/api/platform/events/route.ts`, after the successful insert, add:

```typescript
import { runAgentLoop } from '@/lib/agents/runner';

// After successful event insert:
// Fire-and-forget — agent loop runs async, never blocks the event emission
runAgentLoop(event.tenant_id, event.event_type).catch(err =>
  console.error('Agent loop failed:', err)
);
```

## 5F: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-23 | Agent types defined | `find web/src/lib/agents -name "types.ts" \| wc -l` | 1 |
| PG-24 | Agent registry with ≥4 agents | `grep -c "id:" web/src/lib/agents/registry.ts` | ≥4 |
| PG-25 | Agent runner exists | `find web/src/lib/agents -name "runner.ts" \| wc -l` | 1 |
| PG-26 | Runner implements ODAR loop | `grep -c "OBSERVE\|DECIDE\|ACT\|REPORT" web/src/lib/agents/runner.ts` | ≥4 |
| PG-27 | Agent loop triggered from events API | `grep -c "runAgentLoop" web/src/app/api/platform/events/route.ts` | ≥1 |
| PG-28 | Agent inbox schema exists | `find web/src/lib/agents -name "schema.sql" \| wc -l` | 1 |

**Commit:** `OB-62/63 Phase 5: Agent Loop — ODAR runtime with 4 agents + inbox schema`

---

# ═══════════════════════════════════════════════════════
# PHASE 6: AGENT INBOX ON PERSONA DASHBOARDS
# ═══════════════════════════════════════════════════════

**What:** Each persona dashboard (Admin, Manager, Rep) shows an Agent Inbox panel with persona-filtered recommendations, alerts, and insights.

## 6A: Create Agent Inbox hook

Create `web/src/hooks/useAgentInbox.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';

export interface InboxItem {
  id: string;
  agent_id: string;
  type: 'recommendation' | 'alert' | 'automation' | 'insight';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  action_url: string | null;
  action_label: string | null;
  persona: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

export function useAgentInbox(tenantId: string | undefined, persona: string) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/platform/agent-inbox?tenantId=${tenantId}&persona=${persona}`)
      .then(r => r.json())
      .then(data => { setItems(data.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId, persona]);

  const dismiss = useCallback(async (itemId: string) => {
    await fetch('/api/platform/agent-inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, action: 'dismiss' }),
    });
    setItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const markRead = useCallback(async (itemId: string) => {
    await fetch('/api/platform/agent-inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, action: 'read' }),
    });
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, read_at: new Date().toISOString() } : i));
  }, []);

  const unreadCount = items.filter(i => !i.read_at).length;

  return { items, loading, dismiss, markRead, unreadCount };
}
```

## 6B: Create Agent Inbox API route

Create `web/src/app/api/platform/agent-inbox/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const persona = searchParams.get('persona') || 'all';

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const supabase = createServiceRoleClient();
  let query = supabase
    .from('agent_inbox')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  // Filter by persona
  if (persona !== 'all') {
    query = query.or(`persona.eq.${persona},persona.eq.all`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}

export async function PATCH(request: Request) {
  const { itemId, action } = await request.json();
  if (!itemId || !action) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const update: Record<string, string> = {};
  if (action === 'dismiss') update.dismissed_at = now;
  if (action === 'read') update.read_at = now;
  if (action === 'act') update.acted_at = now;

  const { error } = await supabase
    .from('agent_inbox')
    .update(update)
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

## 6C: Create Agent Inbox UI component

Create `web/src/components/agents/AgentInbox.tsx`:

A card component that renders on each persona dashboard.

```
┌─ Agent Intelligence ──────────────────────────────────────────┐
│                                                                │
│  🔴 CRITICAL  3 outliers detected in latest calculation       │
│  Compensation Agent · 2 min ago          [Review Outliers →]  │
│                                                    [Dismiss]  │
│  ────────────────────────────────────────────────────────────  │
│  🟡 WARNING   New dispute submitted by Carlos Rodríguez       │
│  Resolution Agent · 15 min ago           [Review Disputes →]  │
│                                                    [Dismiss]  │
│  ────────────────────────────────────────────────────────────  │
│  🔵 INSIGHT   22 entities calculated — all within range       │
│  Compensation Agent · 1 hour ago         [View Results →]     │
│                                                    [Dismiss]  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Card: #0F172A background, #1E293B border, rounded-lg
- Header: "Agent Intelligence" in 13px, #94A3B8, uppercase tracking
- Severity dots: critical=#EF4444, warning=#F59E0B, info=#3B82F6
- Title: 14px, #F8FAFC, semibold
- Description (on expand): 13px, #CBD5E1
- Agent name + time: 12px, #64748B
- Action button: ghost button, gold text (#E8A838)
- Dismiss: 11px, #475569
- Empty state: "All clear — no agent recommendations right now." in #64748B
- ALL INLINE STYLES

## 6D: Wire Agent Inbox to persona dashboards

```bash
echo "=== FIND PERSONA DASHBOARDS ==="
find web/src/components/dashboards -name "*.tsx" | head -10
find web/src/app -name "page.tsx" -path "*admin*" | head -3
find web/src/app -name "page.tsx" -path "*manager*" | head -3
find web/src/app -name "page.tsx" -path "*rep*" | head -3
```

Add `<AgentInbox tenantId={tenant.id} persona="admin" />` to the admin dashboard, and similarly for manager and rep dashboards with their respective personas. Position it prominently — either at the top of the dashboard or in a sidebar column.

## 6E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-29 | Agent Inbox hook exists | `find web/src/hooks -name "useAgentInbox*" \| wc -l` | 1 |
| PG-30 | Agent Inbox API exists | `find web/src/app/api/platform/agent-inbox -name "route.ts" \| wc -l` | 1 |
| PG-31 | Agent Inbox component exists | `find web/src/components/agents -name "AgentInbox*" \| wc -l` | ≥1 |
| PG-32 | Inbox imported by ≥1 dashboard | `grep -rl "AgentInbox" web/src/components/dashboards/ web/src/app/ --include="*.tsx" \| wc -l` | ≥1 |

**Commit:** `OB-62/63 Phase 6: Agent Inbox — hook + API + UI component on persona dashboards`

---

# ═══════════════════════════════════════════════════════
# PHASE 7: EMBEDDED TRAINING — CoachMark + user_journey
# ═══════════════════════════════════════════════════════

**What:** Contextual in-flow guidance that teaches users at the moment of need. No help docs, no video tutorials. The platform itself teaches.

## 7A: Create user_journey tracking table

Create `web/src/lib/training/schema.sql`:

```sql
-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS user_journey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, tenant_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_journey_user ON user_journey(user_id, tenant_id);
```

## 7B: Define milestones

Create `web/src/lib/training/milestones.ts`:

```typescript
export const MILESTONES = {
  // Onboarding
  'first_login': { label: 'First login', persona: 'all' },
  'profile_viewed': { label: 'Viewed profile', persona: 'all' },
  'gpv_completed': { label: 'Completed Guided Proof of Value', persona: 'admin' },

  // Data
  'plan_imported': { label: 'Imported first plan', persona: 'admin' },
  'data_uploaded': { label: 'Uploaded first data file', persona: 'admin' },
  'field_mapping_reviewed': { label: 'Reviewed AI field mapping', persona: 'admin' },

  // Calculation
  'first_calculation': { label: 'Ran first calculation', persona: 'admin' },
  'outlier_reviewed': { label: 'Reviewed a calculation outlier', persona: 'admin' },
  'calculation_approved': { label: 'Approved a calculation', persona: 'admin' },

  // Manager
  'team_viewed': { label: 'Viewed team performance', persona: 'manager' },
  'coaching_insight_read': { label: 'Read a coaching insight', persona: 'manager' },

  // Rep
  'payout_viewed': { label: 'Viewed personal payout', persona: 'rep' },
  'dispute_submitted': { label: 'Submitted a dispute', persona: 'rep' },
  'forensics_explored': { label: 'Explored calculation forensics', persona: 'rep' },

  // Advanced
  'lifecycle_advanced': { label: 'Advanced a lifecycle stage', persona: 'admin' },
  'canvas_explored': { label: 'Explored Organizational Canvas', persona: 'admin' },
  'agent_recommendation_acted': { label: 'Acted on an agent recommendation', persona: 'all' },
} as const;

export type MilestoneKey = keyof typeof MILESTONES;
```

## 7C: Create user journey hook

Create `web/src/hooks/useUserJourney.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { MilestoneKey } from '@/lib/training/milestones';

export function useUserJourney(userId: string | undefined, tenantId: string | undefined) {
  const [completedMilestones, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !tenantId) return;
    fetch(`/api/platform/journey?userId=${userId}&tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        setCompleted(new Set((data.milestones || []).map((m: any) => m.milestone)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId, tenantId]);

  const completeMilestone = useCallback(async (milestone: MilestoneKey) => {
    if (!userId || !tenantId || completedMilestones.has(milestone)) return;
    await fetch('/api/platform/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tenantId, milestone }),
    }).catch(() => {});
    setCompleted(prev => new Set([...prev, milestone]));
  }, [userId, tenantId, completedMilestones]);

  const hasCompleted = useCallback((milestone: MilestoneKey) => {
    return completedMilestones.has(milestone);
  }, [completedMilestones]);

  return { completedMilestones, loading, completeMilestone, hasCompleted };
}
```

## 7D: Create CoachMark component

Create `web/src/components/training/CoachMark.tsx`:

A subtle, non-intrusive tooltip that appears once for each milestone — guiding the user through their first experience with each feature.

```typescript
'use client';
import React, { useState } from 'react';

interface CoachMarkProps {
  milestone: string;        // Which milestone this teaches toward
  title: string;            // "Import Your Plan"
  description: string;      // "Upload a PPTX, PDF, or image of your compensation plan..."
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  visible: boolean;         // Controlled by parent (show only if milestone not completed)
  onDismiss: () => void;
}

export function CoachMark({ milestone, title, description, position = 'bottom', children, visible, onDismiss }: CoachMarkProps) {
  if (!visible) return <>{children}</>;

  const positionStyles: Record<string, React.CSSProperties> = {
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 },
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <div style={{
        position: 'absolute', ...positionStyles[position],
        background: '#1E293B', border: '1px solid #E8A838', borderRadius: 8,
        padding: '12px 16px', width: 280, zIndex: 50,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5, marginBottom: 8 }}>{description}</div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: '#E8A838',
            fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600,
          }}
        >
          Got it ✓
        </button>
      </div>
    </div>
  );
}
```

## 7E: Create journey API route

Create `web/src/app/api/platform/journey/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const tenantId = searchParams.get('tenantId');

  if (!userId || !tenantId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('user_journey')
    .select('milestone, completed_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  return NextResponse.json({ milestones: data || [] });
}

export async function POST(request: Request) {
  const { userId, tenantId, milestone } = await request.json();

  if (!userId || !tenantId || !milestone) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('user_journey')
    .upsert({ user_id: userId, tenant_id: tenantId, milestone }, {
      onConflict: 'user_id,tenant_id,milestone',
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

## 7F: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-33 | Milestones defined | `grep -c "label:" web/src/lib/training/milestones.ts` | ≥10 |
| PG-34 | CoachMark component exists | `find web/src/components/training -name "CoachMark*" \| wc -l` | ≥1 |
| PG-35 | User journey hook exists | `find web/src/hooks -name "useUserJourney*" \| wc -l` | 1 |
| PG-36 | Journey API route exists | `find web/src/app/api/platform/journey -name "route.ts" \| wc -l` | 1 |
| PG-37 | Journey schema SQL exists | `find web/src/lib/training -name "schema.sql" \| wc -l` | 1 |

**Commit:** `OB-62/63 Phase 7: Embedded training — CoachMark + user_journey + milestones`

---

# ═══════════════════════════════════════════════════════
# PHASE 8: EXPANSION SIGNAL DETECTION
# ═══════════════════════════════════════════════════════

**What:** The platform detects usage patterns that indicate a tenant is ready for additional modules or a tier upgrade, and surfaces these as Agent recommendations.

## 8A: Create Expansion Signal Agent

Add to the agent registry (`web/src/lib/agents/registry.ts`):

```typescript
{
  id: 'expansion-agent',
  name: 'Expansion Agent',
  description: 'Detects usage patterns suggesting readiness for additional modules or tier upgrade.',
  observes: ['calculation.completed', 'user.feature_used', 'data.committed', 'user.first_login'],
  enabled: true,
  evaluate: async (events, context) => {
    const settings = context.tenantSettings as any;
    const modules = settings?.billing?.modules || settings?.modules_enabled || [];
    const tier = settings?.billing?.tier || settings?.tier || 'Inicio';
    const entityCount = (settings?.entity_count || 0);

    // Signal 1: Entity count approaching tier limit
    const tierLimits: Record<string, number> = {
      'Free': 10, 'Inicio': 100, 'Crecimiento': 1000,
      'Profesional': 10000, 'Empresarial': 50000,
    };
    const limit = tierLimits[tier] || 100;
    if (entityCount > limit * 0.8) {
      return {
        agentId: 'expansion-agent',
        type: 'recommendation',
        title: `Approaching ${tier} entity limit`,
        description: `You're using ${entityCount} of ${limit} entities. Consider upgrading to unlock more capacity.`,
        severity: 'warning',
        actionUrl: '/upgrade',
        actionLabel: 'View Plans',
        persona: 'admin',
      };
    }

    // Signal 2: Multiple calculations completed but no Manager Intelligence module
    const calcEvents = events.filter(e => e.event_type === 'calculation.completed');
    const hasManagerModule = Array.isArray(modules)
      ? modules.includes('Manager')
      : !!modules?.Manager;

    if (calcEvents.length >= 3 && !hasManagerModule) {
      return {
        agentId: 'expansion-agent',
        type: 'recommendation',
        title: 'Unlock Coaching Agent for your managers',
        description: `You've run ${calcEvents.length} calculations. The Coaching Agent generates team insights and 1:1 talking points automatically.`,
        severity: 'info',
        actionUrl: '/upgrade',
        actionLabel: 'Explore Agents',
        persona: 'admin',
      };
    }

    // Signal 3: Multiple users active but no Dispute Resolution module
    const userEvents = events.filter(e => e.event_type === 'user.first_login');
    const hasDisputeModule = Array.isArray(modules)
      ? modules.includes('Dispute')
      : !!modules?.Dispute;

    if (userEvents.length >= 5 && !hasDisputeModule) {
      return {
        agentId: 'expansion-agent',
        type: 'recommendation',
        title: 'Enable Resolution Agent for your team',
        description: `${userEvents.length} users are active. The Resolution Agent pre-screens disputes and reduces unnecessary claims by up to 80%.`,
        severity: 'info',
        actionUrl: '/upgrade',
        actionLabel: 'Add Resolution Agent',
        persona: 'admin',
      };
    }

    return null;
  },
},
```

## 8B: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-38 | Expansion agent in registry | `grep -c "expansion-agent" web/src/lib/agents/registry.ts` | ≥1 |
| PG-39 | Expansion agent detects ≥3 signals | `grep -c "Signal" web/src/lib/agents/registry.ts` | ≥3 |

**Commit:** `OB-62/63 Phase 8: Expansion signal detection — tier limit, module recommendations`

---

# ═══════════════════════════════════════════════════════
# PHASE 9: VERIFICATION AND COMPLETION
# ═══════════════════════════════════════════════════════

## 9A: Build verification

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

## 9B: Full test sequence

```bash
echo "=== OB-62/63 VERIFICATION ==="

echo "1. Stripe config:"
find web/src/lib/stripe -name "*.ts" | wc -l

echo ""
echo "2. Billing API routes:"
find web/src/app/api/billing -name "route.ts" | wc -l

echo ""
echo "3. Upgrade page:"
find web/src/app/upgrade -name "page.tsx" | wc -l

echo ""
echo "4. Google SSO:"
grep -rl "signInWithOAuth\|google" web/src/app/ --include="*.tsx" | wc -l

echo ""
echo "5. Event bus:"
find web/src/lib/events -type f | wc -l
find web/src/app/api/platform/events -name "route.ts" | wc -l

echo ""
echo "6. Agent framework:"
find web/src/lib/agents -type f | wc -l

echo ""
echo "7. Agent inbox:"
find web/src/app/api/platform/agent-inbox -name "route.ts" | wc -l
find web/src/components/agents -name "*.tsx" | wc -l
find web/src/hooks -name "useAgentInbox*" | wc -l

echo ""
echo "8. Embedded training:"
find web/src/lib/training -type f | wc -l
find web/src/components/training -name "*.tsx" | wc -l
find web/src/hooks -name "useUserJourney*" | wc -l

echo ""
echo "9. Agent count in registry:"
grep -c "id:" web/src/lib/agents/registry.ts

echo ""
echo "10. Event emission instrumented:"
grep -rl "emitEvent" web/src/app/api/ --include="*.ts" | wc -l

echo ""
echo "11. Build clean:"
echo $?
```

## 9C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-40 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-41 | Build: clean | `npm run build` exit code | 0 |
| PG-42 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

## 9D: Completion report

Create `OB-62_63_COMPLETION_REPORT.md` at PROJECT ROOT with all 42 proof gates and terminal evidence.

## 9E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-62/63: Monetization + Agent Foundation + Embedded Training" \
  --body "## What This OB Delivers

### Mission 1: Stripe Integration (Phases 0-2)
- Stripe SDK + pricing config matching VVSP v3.1 tiers
- Checkout API (creates session with tenant metadata)
- Webhook handler (4 event types: checkout.completed, subscription.updated/deleted, invoice.payment_failed)
- Customer Portal API (subscription management)
- Upgrade page with tier cards, module selection, bundle discounts
- TrialGate → /upgrade wiring
- Post-upgrade success handling

### Mission 2: Google SSO (Phase 3)
- Google OAuth button on login + signup pages
- Auth callback handler
- Auto-provisioning guard for Google SSO new users

### Mission 3: Agent Event Bus (Phase 4)
- platform_events table schema
- Event emitter (server + client versions, 25+ event types)
- Events API route (GET + POST)
- Instrumented existing API routes (plan import, calculation, lifecycle, GPV)

### Mission 4: Agent Loop (Phase 5)
- Agent type system (AgentDefinition, AgentAction, AgentInboxItem)
- Agent registry with 4 agents: Compensation, Coaching, Resolution, Compliance
- ODAR runtime (Observe → Decide → Act → Report)
- agent_inbox table schema
- Agent Loop auto-triggered from event emission

### Mission 5: Agent Inbox (Phase 6)
- useAgentInbox hook with read/dismiss
- Agent Inbox API route (GET + PATCH)
- AgentInbox UI component (severity dots, action buttons, dismiss)
- Wired to all 3 persona dashboards

### Mission 6: Embedded Training (Phase 7)
- user_journey table schema
- 18 milestones across 4 categories (onboarding, data, calculation, advanced)
- useUserJourney hook
- CoachMark component (gold-bordered tooltip, one-time display)
- Journey API route (GET + POST)

### Mission 7: Expansion Signals (Phase 8)
- Expansion Agent in registry
- 3 detection signals: tier limit approach, module recommendations, team size growth

## Self-Service Journey — COMPLETE
- Step 1 (Land) ← OB-60 ✓
- Step 2 (Sign Up) ← OB-60 ✓
- Step 3 (Activation) ← OB-61 ✓
- Step 4 (Explore/Trial) ← OB-61 ✓
- **Step 5 (Convert) ← THIS OB ✓**
- **Step 6 (Configure) ← THIS OB ✓**
- **Step 7 (Expand) ← THIS OB ✓**

## Architecture Note
The Agent architecture follows the VVSP v3.1 specification:
- Agents are NOT modules — they are proactive, autonomous, inter-communicating
- The event bus is the nervous system; agents are peripheral oscillators
- Every agent implements the Observe → Decide → Act → Report loop
- The platform_events table + agent_inbox table form the backbone for all future agent development

## Supabase Tables Required (SQL files included)
- platform_events (web/src/lib/events/schema.sql)
- agent_inbox (web/src/lib/agents/schema.sql)
- user_journey (web/src/lib/training/schema.sql)

Run these in the Supabase SQL Editor before testing.

## Proof Gates: 42 — see OB-62_63_COMPLETION_REPORT.md"
```

**Commit:** `OB-62/63 Phase 9: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (42 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-3 | Stripe Config | 0 | 3 |
| PG 4-8 | Stripe APIs | 1 | 5 |
| PG 9-13 | Upgrade UI | 2 | 5 |
| PG 14-17 | Google SSO | 3 | 4 |
| PG 18-22 | Event Bus | 4 | 5 |
| PG 23-28 | Agent Loop | 5 | 6 |
| PG 29-32 | Agent Inbox | 6 | 4 |
| PG 33-37 | Embedded Training | 7 | 5 |
| PG 38-39 | Expansion Signals | 8 | 2 |
| PG 40-42 | Build + Verification | 9 | 3 |

---

## SUPABASE TABLES REQUIRED

Run these SQL scripts in the Supabase SQL Editor BEFORE running this OB:

1. `web/src/lib/events/schema.sql` → `platform_events` table
2. `web/src/lib/agents/schema.sql` → `agent_inbox` table
3. `web/src/lib/training/schema.sql` → `user_journey` table

The code handles graceful failure if tables don't exist, but the Agent Loop won't produce results without them.

---

## OUT OF SCOPE

| Item | When |
|------|------|
| Compensation Agent full autonomy (auto-flag, pre-calc impact) | OB-64 |
| Coaching Agent weekly agendas + 1:1 talking points | OB-64 |
| Resolution Agent dispute pre-screening (80% auto-resolution) | OB-65 |
| Compliance Agent SOC2 validation + audit report generation | OB-65 |
| Clawbacks, reversals, retroactive adjustments | OB-66 |
| Structured Dispute Resolution UI (7 categories) | OB-67 |
| Calculation Forensics drill-down (5-layer) | OB-68 |
| Multi-period management | OB-69 |

---

## SELF-SERVICE CUSTOMER JOURNEY — COMPLETE

```
STEP 1: LAND          ← OB-60 ✓
STEP 2: SIGN UP       ← OB-60 ✓
STEP 3: ACTIVATION    ← OB-61 ✓
STEP 4: EXPLORE       ← OB-61 ✓
STEP 5: CONVERT       ← OB-62/63 ★ (Stripe checkout)
STEP 6: CONFIGURE     ← OB-62/63 ★ (embedded training + CoachMark)
STEP 7: EXPAND        ← OB-62/63 ★ (expansion signals + agent recs)
```

After this OB, the entire self-service customer journey is wired end-to-end. A customer can find Vialuce → sign up → see their calculations in 5 minutes → explore with trial gates → upgrade and pay via Stripe → receive contextual training → get proactive agent recommendations → expand their usage.

---

*OB-62/63 — February 18, 2026*
*"Money flows in. Intelligence flows out. The platform is alive."*
