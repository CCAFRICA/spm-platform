# OB-204 — PHASE 0 DISPOSITIONS & PHASE A PROCEED

> **ARCHITECT NOTE — DO NOT PASTE THIS LINE**
> Everything below the delimiter is the CC-consumable directive. Paste verbatim from the delimiter to EOF.

---

## ═══════════════════════════════════════════════════════════
## CC DIRECTIVE START — PASTE FROM HERE TO END OF FILE
## ═══════════════════════════════════════════════════════════

**Date:** 2026-06-13 · **Amends:** OB-204_DIRECTIVE_20260611.md (standing; read it first if not already in context)
**Issued by:** Architect, couriered verbatim. These dispositions are binding and supersede any conflicting text in the standing directive.

---

## 1 — PHASE 0 HALT STATUS: ALL CLEAR

No halts fired. Phase 0 evidence accepted. PR #492 merged.

## 2 — FINDING DISPOSITIONS

### F-1: RESEND_API_KEY absent locally
Confirmed present in Vercel production. Add a `.env.local.example` entry documenting the key requirement (never the value). The dispatch module (A.5) guards on `RESEND_API_KEY` presence: if absent, log a structured warning and dry-run (no send, return a mock delivery receipt) so the build and harness pass locally. Actual sends require the key — production-only is acceptable for this build.

### F-2: Historical PII in platform_events payloads
Confirmed (4/50 sampled: email, ip, user_agent in idle-timeout events). Phase B cleanse proceeds per §3.2.5 — no change to the directive.

### F-3: Q-I target correction (audit_logs empty; PII lives in platform_events.payload)
**Corrected:** B.1.4 drops the `UPDATE audit_logs SET ip_address = NULL` statement (no-op against an empty table). Replace with:
```sql
UPDATE platform_events
SET payload = payload - 'email' - 'ip_address' - 'ip' - 'user_agent'
WHERE created_at < now() - interval '90 days'
  AND (payload ? 'email' OR payload ? 'ip_address' OR payload ? 'ip' OR payload ? 'user_agent');
```
90-day window (Q-I) governs. Scheduling automation remains a §6A residual. The I-1 invariant enforcement in Phase A.2 emitter code prevents these keys from entering future payloads — the periodic cleanse is retroactive-only and decays to a no-op.

## 3 — HALT-2 ORPHAN DISPOSITION (REVISED — ARCHITECT STEP BACK)

**Delete ALL users and their profile rows EXCEPT the three platform personas:**
- `platform@vialuce.ai` — KEEP
- `tdadmin@vialuce.ai` — KEEP
- `eoadmin@vialuce.ai` — KEEP

**Every other orphan — valentina@, fernando@, admin@bancocumbre.ec, admin@vialuce.ai, and any additional residue the census returns — DELETE.** No provisioning, no repair. These are seed artifacts from the retired creation path. The single door (Phase A) is how all non-platform users enter from this point forward. Execute deletions through the service-role admin API (`auth.admin.deleteUser` + profile row cleanup), not raw SQL. Emit a PII-free deletion event per user (uuid + "orphan_cleanup" action, no email/name in payload). Paste the census + deletion confirmations.

## 4 — ARCHITECTURAL COMPLIANCE: BINDING CONSTRAINT, NOT BACKGROUND CONTEXT

This is not a reminder — it is a structural directive that governs every line of code in Phase A and beyond.

**The five §2A invariants (I-1 through I-5) are write-time enforcement, not post-hoc policy.** They are the same class of constraint as the capability-derivation contract and the single-writer rule: violations are structurally impossible through the platform, not merely prohibited by documentation. Specifically:

- **I-1 (uuid spine):** Every event, audit row, and JSONB payload references users by `profile_id`/`auth_user_id` uuid and structural facts (role, tenant) ONLY. No email, no display_name, no IP address, no user_agent in any payload constructor. This is what makes GDPR Art 17 erasure a one-row tombstone instead of a forensic sweep, and what lets SOC 2 / GAAP / MX-fiscal legally-retained records coexist with deletion rights by construction. **Enforce:** the emitter module's payload-builder function accepts uuid + role + tenant + action — no string-typed PII parameter exists in the signature. If PII can't enter the function, it can't enter the payload. Test: the A.8 harness grepping event payloads for `@` is not a nice-to-have — it is the I-1 proof artifact.

- **I-2 (minimization as contract):** The §2 field set is the collection boundary. The writer's `createUser` input type accepts `{email, displayName, role, tenantId, entityId?, mode, locale?}` — that closed set IS the collection notice. No additional fields accepted; no behavioral data, no device fingerprints, no location. The TypeScript type is the GDPR Art 5(1)(c) artifact.

- **I-3 (email carries link + recipient, nothing else):** The dispatch module (A.5) function signature is `{to, locale, link}`. No payout data, no role detail, no third-party PII transits the subprocessor. The function signature IS the Art 28 processor-minimization artifact.

- **I-4 (notice at collection):** First-login hook emits `privacy_notice.presented` with a version stamp. Ships in A.7.

- **I-5 (residency named):** The completion report names the Supabase production region. No code change; the naming is the Art 30 records-of-processing contribution.

**SOC 2 CC6 user-lifecycle controls** are not checked at Phase E — they are BUILT in Phase A: the writer's atomicity (create-or-rollback), the lockout guard (zero-platform-user prevention), the authorization helper (capability + tenant scoping + AAL2), the role-change audit trail (before/after in uuid-keyed events), and the disable/erase lifecycle with its tombstone contract. Phase E's §7A walk VERIFIES what Phase A CONSTRUCTS. If Phase A code doesn't embody the control, Phase E cannot paper over it.

**NIST 800-63B secure delivery** is built into the dispatch module: time-limited single-use links, never passwords in email bodies, per-identity rate limiting, uniform-success on public routes (anti-enumeration). These are code constructs in A.4/A.5, not policy statements.

CC: treat I-1 through I-5 and the SOC/NIST controls as you treat the Korean Test — structural invariants that shape the code's type signatures and function boundaries, not comments above the code. A violation is a build-blocking defect, same priority class as a TypeScript type error.

## 5 — PHASE A: PROCEED

Begin Phase A on branch `ob-204-writer`. The standing directive §3.1 governs in full, amended by:
- HALT-2 dispositions per §3 above (delete, don't provision)
- F-1 dry-run guard on dispatch module
- F-3 emitter I-1 enforcement (payload signature accepts no PII parameters)
- §4 compliance framing binding throughout

The ~10 seed-path profile writers from the Phase 0 inventory are the EPG-1 retirement targets. `p3-profiles.ts` is the confirmed primary offender (object-literal capabilities, legacy `sales_rep` role). Convert to service calls or delete per the A.6 classification. The single door closes all of them.

Commit + push after every change. Build verification before completion claim. PR at phase end: `gh pr create --base main --head ob-204-writer --title "OB-204 Phase A: single-door user lifecycle service, contracts, Resend dispatch"`.

---

*OB-204 · Phase 0 dispositions · Phase A proceed*
*One door for users · contracts at the door · the door is the fix*
*vialuce.ai · Intelligence. Acceleration. Performance.*
