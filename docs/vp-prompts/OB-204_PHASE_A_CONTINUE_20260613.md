# OB-204 — PHASE A CONTINUE
**Date:** 2026-06-13 · **Amends:** OB-204 standing directive + Phase 0 dispositions (both in context)
**Issued by:** Architect, couriered verbatim.

## FINDING DISPOSITIONS

### Finding 1 — No lib-path writer exists
Confirmed. The scripts/provision-user.ts is a harness, not the canonical writer. Create the lifecycle service fresh at `web/src/lib/auth/provision-user.ts` per the directive's §3.1 A.2. Reuse the harness's atomicity pattern (createUser → profile insert → auth.admin.deleteUser rollback on failure). The harness becomes a consumer of the service, not its source.

### Finding 2 — mapProfileToUser permissionMap shrinkage
Acknowledged, and correctly flagged. The authorization path (`hasCapability` → `ROLE_CAPABILITIES`) is role-based and unaffected by stored-array normalization — authz does not break. The vestigial `user.permissions` object in `mapProfileToUser` shrinking is a symptom of a legacy consumer reading from the wrong source; it is lossless per DS-028 §1.2 because the PDP is `permissions.ts`, not the stored array. Do not compensate for it — do not inflate the stored array to feed the legacy consumer. The matrix is the truth; the consumer adapts or is retired. This is an explicit A1 verification point: architect will confirm at the browser that the shrinkage causes no user-facing regression.

## BUILD ORDER: APPROVED — CONTINUE STRAIGHT THROUGH

Your derived sequence is dependency-correct. Execute steps 1–6 as listed, committing per step with build verification before each commit. Single Phase-A PR at the end per the standing directive: `gh pr create --base main --head ob-204-writer --title "OB-204 Phase A: single-door user lifecycle service, contracts, Resend dispatch"`.

No smaller PRs — the single door is one vertical slice; a half-committed auth surface is the risk you correctly identified, and splitting the PR re-creates it at the review boundary. Land the whole sequence, then PR.

Proceed now.

---

*OB-204 · Phase A continue · the single door is one vertical slice*
*vialuce.ai · Intelligence. Acceleration. Performance.*
