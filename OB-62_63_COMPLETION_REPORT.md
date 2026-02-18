# OB-62/63 Completion Report

## MONETIZATION, AGENT FOUNDATION, AND EMBEDDED TRAINING

**Date**: 2026-02-18
**Branch**: dev
**Commits**: 9 (d2f021a..0ae8a1f)

---

## Mission Summary

| # | Mission | Phase | Status |
|---|---------|-------|--------|
| 1 | Stripe SDK + Config | 0 | COMPLETE |
| 2 | Stripe Checkout + Webhook + Portal | 1 | COMPLETE |
| 3 | Upgrade UI + Trial Gate Wiring | 2 | COMPLETE |
| 4 | Google SSO | 3 | COMPLETE |
| 5 | Agent Event Bus | 4 | COMPLETE |
| 6 | Agent Loop (ODAR) | 5 | COMPLETE |
| 7 | Agent Inbox on Dashboards | 6 | COMPLETE |
| 8 | Embedded Training | 7 | COMPLETE |
| 9 | Expansion Signal Detection | 8 | COMPLETE |
| 10 | Verification + PR | 9 | COMPLETE |

---

## Commits

| SHA | Phase | Description |
|-----|-------|-------------|
| `282a4f5` | — | Commit prompt for traceability |
| `d2f021a` | 0 | Stripe SDK + pricing config + server client |
| `0105e11` | 1 | Stripe checkout + webhook + portal API routes |
| `a3f2233` | 2 | Upgrade page + trial gate wiring + post-upgrade success |
| `332c4e0` | 3 | Google SSO — OAuth button + callback + auto-provisioning |
| `c3a2025` | 4 | Agent event bus — platform_events + emitter + instrumentation |
| `4a90f9c` | 5 | Agent Loop — ODAR runtime with 4 agents + inbox schema |
| `7034b76` | 6 | Agent Inbox — hook + API + UI on persona dashboards |
| `8fe2ed6` | 7 | Embedded training — CoachMark + user_journey + milestones |
| `0ae8a1f` | 8 | Expansion signal detection — 3 signals in 5th agent |

---

## Files Created

| File | Purpose |
|------|---------|
| `web/src/lib/stripe/config.ts` | PLATFORM_TIERS, MODULE_PRICES, BUNDLE_DISCOUNTS, EXPERIENCE_TIERS |
| `web/src/lib/stripe/server.ts` | getStripe() singleton (Stripe v20.3.1, API v2026-01-28.clover) |
| `web/.env.stripe.example` | Stripe environment variable template |
| `web/src/app/api/billing/checkout/route.ts` | POST — creates Stripe Checkout Session |
| `web/src/app/api/billing/webhook/route.ts` | POST — handles 4 Stripe subscription events |
| `web/src/app/api/billing/portal/route.ts` | POST — creates Stripe Customer Portal session |
| `web/src/app/upgrade/page.tsx` | Pricing/upgrade page with tier cards + module selection |
| `web/src/app/auth/callback/route.ts` | OAuth code exchange + auto-provisioning for Google SSO |
| `web/src/lib/events/schema.sql` | platform_events table SQL with indexes |
| `web/src/lib/events/emitter.ts` | 25 event types + emitEvent() server + emitEventClient() client |
| `web/src/app/api/platform/events/route.ts` | POST/GET platform events API |
| `web/src/lib/agents/types.ts` | AgentDefinition, AgentContext, AgentAction, AgentInboxItem |
| `web/src/lib/agents/registry.ts` | 5 agents: Compensation, Coaching, Resolution, Compliance, Expansion |
| `web/src/lib/agents/runner.ts` | ODAR loop: Observe → Decide → Act → Report |
| `web/src/lib/agents/schema.sql` | agent_inbox table SQL with UNIQUE constraint |
| `web/src/hooks/useAgentInbox.ts` | Agent inbox hook with fetch, dismiss, markRead |
| `web/src/app/api/platform/agent-inbox/route.ts` | GET/PATCH agent inbox API |
| `web/src/components/agents/AgentInbox.tsx` | Agent Intelligence card with severity dots + actions |
| `web/src/lib/training/schema.sql` | user_journey table SQL |
| `web/src/lib/training/milestones.ts` | 18 milestones across 6 categories |
| `web/src/hooks/useUserJourney.ts` | User journey hook with completeMilestone + hasCompleted |
| `web/src/components/training/CoachMark.tsx` | Positioned tooltip with gold border + arrow |
| `web/src/app/api/platform/journey/route.ts` | GET/POST user journey API |

## Files Modified

| File | Changes |
|------|---------|
| `web/src/components/trial/TrialGate.tsx` | Navigate to /upgrade instead of /landing#pricing |
| `web/src/components/dashboards/AdminDashboard.tsx` | AgentInbox + post-upgrade toast + billing portal |
| `web/src/components/dashboards/ManagerDashboard.tsx` | AgentInbox for manager persona |
| `web/src/components/dashboards/RepDashboard.tsx` | AgentInbox for rep persona |
| `web/src/app/login/page.tsx` | Google SSO button |
| `web/src/app/signup/page.tsx` | Google SSO button |
| `web/src/middleware.ts` | /auth/callback added to PUBLIC_PATHS |
| `web/src/app/api/plan/import/route.ts` | emitEvent('plan.imported') |
| `web/src/app/api/gpv/route.ts` | emitEvent on GPV step advancement |
| `web/src/app/api/auth/signup/route.ts` | emitEvent('user.signed_up') |
| `web/src/app/api/billing/webhook/route.ts` | emitEvent('billing.subscription_activated') |

---

## Proof Gates

### Phase 0 — Stripe Config
| # | Gate | Result |
|---|------|--------|
| PG-1 | stripe in package.json | PASS — grep count = 1 |
| PG-2 | config.ts exists | PASS — file found |
| PG-3 | server.ts exists | PASS — file found |

### Phase 1 — Stripe APIs
| # | Gate | Result |
|---|------|--------|
| PG-4 | checkout route exists | PASS — 3 billing routes total |
| PG-5 | webhook route exists | PASS |
| PG-6 | portal route exists | PASS |
| PG-7 | webhook handles 4 events | PASS — grep count = 9 (4 types, some referenced multiple times) |
| PG-8 | UUID validation on checkout | PASS — UUID_REGEX defined and used |

### Phase 2 — Upgrade UI
| # | Gate | Result |
|---|------|--------|
| PG-9 | /upgrade page exists | PASS — file found |
| PG-10 | TrialGate links to /upgrade | PASS — grep count = 1 |
| PG-11 | Post-upgrade toast | PASS — grep "upgraded" count = 2 in AdminDashboard |
| PG-12 | Tier cards rendered | PASS — PLATFORM_TIERS.filter in page |
| PG-13 | Module checkboxes | PASS — MODULE_PRICES.filter in page |

### Phase 3 — Google SSO
| # | Gate | Result |
|---|------|--------|
| PG-14 | Google SSO on login | PASS — signInWithOAuth count = 1 |
| PG-15 | Google SSO on signup | PASS — signInWithOAuth count = 1 |
| PG-16 | Auth callback route | PASS — file found |
| PG-17 | /auth/callback in PUBLIC_PATHS | PASS — middleware updated |

### Phase 4 — Event Bus
| # | Gate | Result |
|---|------|--------|
| PG-18 | Event emitter exists | PASS — file found |
| PG-19 | 25 event types defined | PASS — grep count = 25 |
| PG-20 | Events API route exists | PASS — file found |
| PG-21 | emitEvent in 4+ API routes | PASS — grep count = 4 routes |
| PG-22 | Schema SQL exists | PASS — file found |

### Phase 5 — Agent Loop
| # | Gate | Result |
|---|------|--------|
| PG-23 | Agent types file exists | PASS |
| PG-24 | Agent registry file exists | PASS |
| PG-25 | Agent runner file exists | PASS |
| PG-26 | 5 agents in registry | PASS — grep "id: '" count = 5 |
| PG-27 | agent_inbox schema exists | PASS |
| PG-28 | Runner wired to events API | PASS — runAgentLoop count = 2 |

### Phase 6 — Agent Inbox
| # | Gate | Result |
|---|------|--------|
| PG-29 | useAgentInbox hook exists | PASS |
| PG-30 | Agent inbox API route exists | PASS |
| PG-31 | AgentInbox component exists | PASS |
| PG-32 | AgentInbox on 3 dashboards | PASS — grep count = 3 files |

### Phase 7 — Embedded Training
| # | Gate | Result |
|---|------|--------|
| PG-33 | user_journey schema exists | PASS |
| PG-34 | 18 milestones defined | PASS — grep count = 18 |
| PG-35 | useUserJourney hook exists | PASS |
| PG-36 | CoachMark component exists | PASS |
| PG-37 | Journey API route exists | PASS |

### Phase 8 — Expansion Signals
| # | Gate | Result |
|---|------|--------|
| PG-38 | Expansion agent in registry | PASS — grep "expansion" count = 6 |
| PG-39 | 3 expansion signals | PASS — grep "Signal" count = 3 |

### Phase 9 — Build & Verification
| # | Gate | Result |
|---|------|--------|
| PG-40 | TypeScript: zero errors | PASS — npx tsc --noEmit clean |
| PG-41 | Build: clean | PASS — npm run build exit 0 |
| PG-42 | Only pre-existing warnings | PASS — 6 warnings (all pre-OB-62/63) |

---

## Architecture Decisions

### Stripe Integration
- Stripe v20.3.1 with API v2026-01-28.clover
- Checkout creates subscription with platform tier + module add-ons
- Webhook handles checkout.completed, subscription.updated/deleted, invoice.payment_failed
- Customer Portal for self-service subscription management
- Customer ID stored in tenant settings.stripe_customer_id

### Google SSO
- Uses Supabase `signInWithOAuth({ provider: 'google' })`
- Auth callback exchanges code for session
- Auto-provisions tenant + profile for new Google SSO users (no separate signup form needed)
- Redirect to `/auth/callback` handled by route handler, not API route

### Event-Driven Architecture
- `platform_events` table as central nervous system
- 25 event types across Data, Plan, Calculation, Lifecycle, User, Billing, Dispute, Agent
- `emitEvent()` is fire-and-forget — never blocks parent operations
- Events API triggers agent loop on every insert

### Agent Framework (ODAR)
- 5 declarative agents with `evaluate()` functions
- Agent loop: Observe (fetch events) → Decide (run agents) → Act (write inbox) → Report (emit events)
- `agent_inbox` with UNIQUE(tenant_id, agent_id, title) for idempotent upserts
- AgentInbox component on all 3 persona dashboards
- Expansion agent detects 3 signals: tier limit, module recommendations, team growth

### Embedded Training
- `user_journey` table with UNIQUE(user_id, tenant_id, milestone)
- 18 milestones across 6 categories (onboarding, data, calculation, manager, rep, advanced)
- CoachMark component: positioned tooltip with gold border, arrow indicator, "Got it" dismiss
- Journey API: GET milestones + POST complete milestone

## SQL Tables Required

Before deploying, run these SQL scripts in Supabase SQL Editor:
1. `web/src/lib/events/schema.sql` → `platform_events` table
2. `web/src/lib/agents/schema.sql` → `agent_inbox` table
3. `web/src/lib/training/schema.sql` → `user_journey` table

## Self-Service Customer Journey — COMPLETE

```
STEP 1: LAND          ← OB-60 ✓
STEP 2: SIGN UP       ← OB-60 ✓
STEP 3: ACTIVATION    ← OB-61 ✓
STEP 4: EXPLORE       ← OB-61 ✓
STEP 5: CONVERT       ← OB-62/63 ✓ (Stripe checkout)
STEP 6: CONFIGURE     ← OB-62/63 ✓ (embedded training + CoachMark)
STEP 7: EXPAND        ← OB-62/63 ✓ (expansion signals + agent recs)
```

Money flows in. Intelligence flows out. The platform is alive.
