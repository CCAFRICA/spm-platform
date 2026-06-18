# OB-204 — PHASE D: RESET + REVISED DIRECTIVE
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim. This is the operative Phase D directive — supersedes all earlier versions.

## BRANCH RESET

Hard-reset `ob-204-templates` to main and start Phase D clean:
```
git checkout ob-204-templates
git reset --hard origin/main
```
All prior Phase D work on this branch is discarded.

## STANDING RULE: NO HARDCODED DOMAINS

No system-generated URL in this build or any future code may hardcode a domain. Base URLs resolve from `process.env.NEXT_PUBLIC_SITE_URL` at runtime — no fallback string, no invented domain. If the env var is unset, the dispatch module must fail loudly (throw, not silently emit a broken link). The domain will change when INF-002 executes; zero code changes should be required when it does. This rule applies to templates, dispatch, harness scripts, and any link construction.

Harness scripts resolve the base URL the same way — from the env. If the harness needs a placeholder token in a link, construct it from the runtime base: `` `${baseUrl}/auth/callback?token=SANDBOX_TOKEN` ``.

## PHASE D: EMAIL TEMPLATES + LAYERED EMAIL ROUTING

### D.1 — Branded templates
Invite, sign-in-link, and recovery templates in the dispatch module. Two locales: en + es-MX, selected by tenant locale. Content per template: greeting, action link, expiry note, privacy-notice link (I-4) — nothing else (I-3). Every template includes an "Original recipient" line in the body when the actual delivery target differs from the intended user (see D.2) — so the recipient always knows which user account the link activates.

### D.2 — Layered email routing (architect-directed 2026-06-13)

**Industry-standard pattern:** a single resolution function in the dispatch layer determines the actual recipient. Three layers, evaluated in priority order — first non-null wins:

```
resolveRecipient(intendedEmail, { perSendOverride?, tenant?, env? }) → actualEmail

Priority:
  1. Per-send override   → explicit notifyEmail on this invocation
  2. Tenant routing      → tenant.notification_email (set once, catches all)
  3. Environment catch   → EMAIL_REDIRECT_TO env var (catches everything)
  4. Intended recipient  → the user's actual email (production default)
```

**Layer 1 — Per-send override (`notifyEmail` parameter):**
The writer's `createUser` and `sendCredentials` accept an optional `notifyEmail`. When present, dispatch sends there. The invite form and F9 actions surface this as a "Deliver to alternate email" field — because the admin may want to route to a colleague, shared inbox, or QA address.

**Layer 2 — Tenant-level routing (`tenants.notification_email`):**
New nullable column on `tenants`. When set by a platform admin, ALL system-generated emails for users in that tenant route to this address. This is the proof-tenant pattern: set it once when configuring BCL/Meridian/CRP/Sabor, and every invitation, reset, and sign-in link for that tenant's users arrives in the admin's inbox. Tenant admins within the tenant can view but not change this field (platform-level configuration). Migration: `ALTER TABLE tenants ADD COLUMN notification_email text NULL` — CC authors, architect applies (SR-44).

**Layer 3 — Environment-level catch-all (`EMAIL_REDIRECT_TO`):**
Env var checked by the dispatch module. When set (dev/staging, never production), ALL system emails across all tenants route to this address. Standard dev/staging catch-all — lets the team verify the full email flow without any email reaching external inboxes. Add to `.env.local.example` with comment: "Set to redirect all system emails (dev/staging only)."

**Layer 4 — Intended recipient (default):**
The user's email. Production tenants with no `notification_email` and no env override — emails go where they should.

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

The dispatch functions (`sendInvite`, `sendSignInLink`, `sendRecovery`) call `resolveRecipient` before sending. When `redirected` is true, the template includes the original-recipient line. The I-3 signature `{to, locale, link}` stays — `to` is the resolved address.

**Event emission (I-1):** the lifecycle event records `email_redirected: true` (boolean only — no email addresses in payloads).

**Compliance:** I-3 holds (link + recipient + account-label when redirected, nothing else). I-1 holds (no addresses in events). Auth identity is always the intended email — routing affects delivery only, never identity. `notification_email` on tenants is operational config, not PII subject to erasure.

### D.3 — Migration (CC authors, architect applies SR-44)
Author `supabase/migrations/<timestamp>_ob204_tenant_notification_email.sql`:
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notification_email text NULL;
```
Commit on the branch. Architect applies via Dashboard SQL Editor after review.

### D.4 — Harness
1. Six template sends (3 types × 2 locales) to a sandboxed inbox — paste Resend message IDs only.
2. Per-send routing: create a user with `notifyEmail` override — assert Resend targets the override; assert the link activates the user's account.
3. Tenant routing: set `notification_email` on a sandbox tenant — create a user without per-send override — assert delivery routes to the tenant address.
4. Env routing: set `EMAIL_REDIRECT_TO` — create a user for a tenant with no `notification_email` — assert delivery routes to the env address.
5. No-fallback proof: unset `NEXT_PUBLIC_SITE_URL` — assert the dispatch module throws, not silently emits a broken link.

Commit, build-verify, PR: `gh pr create --base main --head ob-204-templates --title "OB-204 Phase D: branded email templates + layered routing (en + es-MX)"`. Architect merges.

---

*OB-204 · Phase D · every email finds the right inbox, no domain invented*
*vialuce.ai · Intelligence. Acceleration. Performance.*
