# OB-204 — PR #497 MERGED + PHASE E: CLOSE THE ARC
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim.

PR #497 merged. Pull main before proceeding. This is the final phase.

## PHASE E: VERIFICATION + SR-39 + COMPLETION REPORT

Branch `ob-204-close`. The standing directive §3.7 governs.

### E.1 — Re-run harnesses on main
Pull merged main. Run the full mint harness (Phase A.8) and the hierarchy harness (Phase F.5) against main. Paste outputs. Both must pass on the merged codebase, not just their feature branches.

### E.2 — EPG re-run
EPG-1 (service-only profile inserts), EPG-2 (deriveCapabilities call sites), EPG-3 (zero PII in emitter payloads) — on main. Paste outputs.

### E.3 — SR-39 §7A compliance walk
Walk DS-028 §7A row by row. For each mechanism, paste the implementing artifact (file path + line number, or harness assertion name + result). The rows:

| Mechanism | Artifact to cite |
|---|---|
| Single writer + contracts (§2, §3) | provision-user.ts + constraint names from Phase B verify |
| Closed PII field set (I-2) | createUser input type |
| uuid spine, PII-free payloads (I-1) | emitLifecycleEvent signature + A.8 harness @ grep |
| F10 erase with tombstone (Art 17) | erase method + A.8 tombstone assertion |
| Rectification (Art 16) | changeRole method; email-change seam noted in §9 |
| Link-based credential delivery (I-3) | dispatch.ts sendInvite/sendSignInLink/sendRecovery signatures |
| Notice presentation (I-4) | first-login hook + privacy_notice.presented event |
| Data map + subprocessor register (Art 30) | DS-028 §2A table (cite the design doc) |
| AAL2 + MFA + lockout guard (CC6) | authorizeUserMgmt + lockout guard + MFA_REQUIRED_ROLES |
| Bounded ip retention (Q-I) | Phase B migration item 6 (PII cleanse) |
| Encryption at rest / TLS | Inherited platform control — name Supabase |

Any row without a concrete artifact → named gap in the report, not a silent pass.

### E.4 — Completion report
Author `docs/completion-reports/OB-204_COMPLETION_REPORT_20260613.md`. Mandatory structure per Rules 25–28:

1. **Summary:** OB-204 scope, DS-028 R7 executed, defect class closed.
2. **Phase 0 findings:** classification table from 0.7, capability-shape probe values, consumer-contract read.
3. **Per-phase evidence:** pasted code for every new/changed function named in the directive; pasted terminal output for every harness/verify run; pasted EPG outputs. Reference the branch commits — do not re-paste everything already evidenced in earlier reports; cite the PR numbers and commit SHAs.
4. **Phase B:** migration text + architect-application confirmation (2026-06-13) + post-application verification (10/10) + failing-write probe output.
5. **SR-39 §7A walk:** the E.3 table with artifacts filled.
6. **Acceptance evidence:**
   - A1: architect browser-verified 2026-06-13 — three Sabor users, production, role-correct workspaces. RCA: capabilities JSONB object → .includes() TypeError; normalized to arrays; contract constraints prevent recurrence.
   - A2: invite end-to-end (cite harness). Resend + sign-in link (cite D.4 harness).
   - A3: platform→tenant-admin→self-service chain (cite harness).
   - A4: zero-violation audit (cite Phase B verify 10/10) + mint harness 45/0.
   - A5: platform-user invite + refused last-platform-disable (cite harness).
   - A6: erase proof + estate PII grep zero (cite A.8 harness @ grep = 0).
   - A7: hierarchy proof — CPI → confirm → promote → scope set-equality (cite F.5 harness 7/0).
7. **Merged SHAs:** every PR (#492–#497) with merge commit SHA.
8. **Residuals:** carry forward from §6A + the F.1 roster email-sourcing residual.
9. **Q-G supersession note:** append to `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` living section — E2 (invitation flow) delivered by OB-204, effective 2026-06-13.
10. **SR-43 statement:** OB-204 shipped — merge + production verification + completion report with SHAs.

Commit the completion report + the E2 supersession note. PR: `gh pr create --base main --head ob-204-close --title "OB-204 Phase E: SR-39 compliance walk + completion report"`. Architect merges. OB-204 is closed.

---

*OB-204 · Phase E · the arc closes · one door, proven end to end*
*vialuce.ai · Intelligence. Acceleration. Performance.*
