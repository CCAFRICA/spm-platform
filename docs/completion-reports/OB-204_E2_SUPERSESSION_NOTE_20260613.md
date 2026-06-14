# OB-204 — E2 Supersession Note (Q-G)

**Date:** 2026-06-13 · **Recorded by:** CC (OB-204 Phase E close).

**E2 (User invitation / credential-delivery flow) is delivered by OB-204, effective 2026-06-13.**

The prior ad-hoc invitation surfaces are superseded by the single-door path:
- `createUser({mode:'invite'})` mints the credential link and delivers it through the one dispatch
  facility (`dispatch.ts`), with branded en/es-MX templates and D.2 layered routing
  (per-send override → tenant `notification_email` → env catch-all → intended recipient).
- Resend is the credential subprocessor (I-3: link + recipient only).

**⚠ Canonical target absent.** This note's intended home, `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md`,
is **not present in the repo** (architect-held). The architect should fold this entry into that
document's living-criteria section; it is recorded here standalone so the supersession is on record.
