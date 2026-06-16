# OB-204 — PHASE D PROCEED (REVISED: LAYERED EMAIL ROUTING)
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim. Supersedes all earlier Phase D directives.

PR #495 merged. Pull main before proceeding.

## PHASE D: EMAIL TEMPLATES + LAYERED EMAIL ROUTING

Branch `ob-204-templates`. The standing directive §3.5 governs, revised with the routing architecture below.

### D.1 — Branded templates
Invite, sign-in-link, and recovery templates in the dispatch module. Two locales: en + es-MX, selected by tenant locale. Content per template: greeting, action link, expiry note, privacy-notice link (I-4) — nothing else (I-3). Every template includes an `X-Original-Recipient` line in the body when the actual delivery target differs from the intended user (see D.2) — so the recipient always knows which user account the link activates.

### D.2 — Layered email routing (architect-directed 2026-06-13)

**The industry-standard pattern:** a single resolution function in the dispatch layer determines the actual recipient. Three layers, evaluated in priority order — first non-null wins:

```
resolveRecipient(intendedEmail, { perSendOverride?, tenant?, env? }) → actualEmail

Priority:
  1. Per-send override   → explicit notifyEmail on this invocation
  2. Tenant routing      → tenant.notification_email (set once, catches all)
  3. Environment catch   → EMAIL_REDIRECT_TO env var (catches everything)
  4. Intended recipient  → the user's actual email (production default)
```

**Layer 1 — Per-send override (`notifyEmail` parameter):**
The writer's `createUser` and `sendCredentials` accept an optional `notifyEmail`. When present, dispatch sends there. The invite form and F9 actions surface this as a "Deliver to alternate email" field (not a toggle — a field, because the admin may want to route to a colleague, a shared inbox, or a QA address).

**Layer 2 — Tenant-level routing (`tenants.notification_email`):**
New nullable column on `tenants`. When set by a platform admin, ALL system-generated emails for users in that tenant route to this address. This is the proof-tenant pattern: set it once when configuring BCL/Meridian/CRP/Sabor, and every invitation, reset, and sign-in link for that tenant's users arrives in the platform admin's inbox. Tenant admins within the tenant can view but not change this field (it's a platform-level configuration). Migration: `ALTER TABLE tenants ADD COLUMN notification_email text NULL` — architect-applied (SR-44), authored by CC in this phase.

**Layer 3 — Environment-level catch-all (`EMAIL_REDIRECT_TO`):**
Env var checked by the dispatch module. When set (typically in dev/staging, never in production), ALL system emails across all tenants route to this address. This is the standard dev/staging catch-all — lets the team verify the full email flow end-to-end without any email reaching external inboxes. Add to `.env.local.example` with a comment: "Set to redirect all system emails to this address (dev/staging only)."

**Layer 4 — Intended recipient (default):**
The user's email. Production tenants with no `notification_email` set and no env override — emails go where they should.

**Implementation in dispatch.ts:**
```typescript
function resolveRecipient(
  intendedEmail: string,
  opts: { notifyEmail?: string; tenantNotificationEmail?: string }
): { to: string; redirected: boolean; originalRecipient?: string } {
  const envOverride = process.env.EMAIL_REDIRECT_TO;
  const actual = opts.notifyEmail ?? opts.tenantNotificationEmail ?? envOverride ?? intendedEmail;
  const redirected = actual !== intendedEmail;
  return { to: actual, redirected, originalRecipient: redirected ? intendedEmail : undefined };
}
```

The dispatch functions (`sendInvite`, `sendSignInLink`, `sendRecovery`) call `resolveRecipient` before sending. When `redirected` is true, the template includes the `X-Original-Recipient` line in the email body. The I-3 signature `{to, locale, link}` stays — `to` is the resolved address.

**Event emission (I-1):** the lifecycle event records `email_redirected: true` (boolean only, never the actual addresses — I-1 holds).

**Compliance notes:**
- I-3 holds: the email carries link + recipient + account-label when redirected, nothing else.
- I-1 holds: no email addresses in event payloads.
- The auth user's identity is always the intended email — routing affects delivery only, never identity.
- The `notification_email` on tenants is operational config (like locale or currency), not PII subject to erasure — it's the admin's address, set by the admin, for the admin's operational use.

### D.3 — Migration (CC authors, architect applies SR-44)
`ALTER TABLE tenants ADD COLUMN notification_email text NULL` — include in a migration file on the Phase D branch. CC commits the file; architect applies via Dashboard SQL Editor. CC verifies post-application.

### D.4 — Harness
1. Six template sends (3 types × 2 locales) to a sandboxed inbox — paste Resend message IDs only.
2. Routing proof: create a user with `notifyEmail` set to a different address — assert Resend send targets the override, not the user email; assert the link still activates the user's account.
3. Tenant routing proof: set `notification_email` on a sandbox tenant — create a user for that tenant without a per-send override — assert delivery routes to the tenant notification address.
4. Env routing proof: set `EMAIL_REDIRECT_TO` — create a user for a tenant with no notification_email — assert delivery routes to the env address.

Commit, build-verify, PR: `gh pr create --base main --head ob-204-templates --title "OB-204 Phase D: branded email templates + layered routing (en + es-MX)"`. Architect merges.

---

*OB-204 · Phase D · every email finds the right inbox*
*vialuce.ai · Intelligence. Acceleration. Performance.*
