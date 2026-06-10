# HF-283 DIRECTIVE — ADDENDUM 4: CREDENTIAL-FREE HARNESS (HALT-6 VOID; SERVICE-ROLE SESSION MINT)

**Date:** 2026-06-10
**Parent:** `docs/vp-prompts/HF-283_DIRECTIVE_20260610.md` + Addenda 1–3 — all prior terms binding except as amended here.
**This file:** save verbatim at `docs/vp-prompts/HF-283_DIRECTIVE_20260610_ADDENDUM-4.md`; commit within the Phase 5 amendment commit (A4.3).

---

## A4.1 — RULING: HALT-6 AND THE CREDENTIAL-KEY MECHANISM ARE VOID

Phase 5.1's `web/.env.local` credential keys (`HF283_*_PW`, `HF283_SABOR_EMAIL`) are WITHDRAWN. **No human password may be written to an env file, a shell command line, a transcript, or any file — for this HF and as standing posture.** The harness requirement was never the password; it was a user-scoped JWT, and that is mintable without one. Root cause: architect directive defect (Phase 5.1 specified credential persistence where a machine-credential session mint sufficed) — record in KNOWN ISSUES and the Meta-candidate set alongside the arc's other incomplete-surface defects.

## A4.2 — REPLACEMENT MECHANISM: SERVICE-ROLE SESSION MINT

1. **Identities (emails are identities, not secrets — constants in the script):** `tdadmin@vialuce.com`, `eoadmin@vialuce.com` (required); `platform@vialuce.com` (run it — no credential barrier remains; if its mint fails, record and continue); Sabor G-B control — self-derive a Sabor Grupo user email via a service-role read of `profiles` for the Sabor tenant (best-effort per A3.4).
2. **Mint, per identity, per run:** admin client (`SUPABASE_SERVICE_ROLE_KEY`) → `auth.admin.generateLink({ type: 'magiclink', email })` → extract the returned hashed token → anon-key client → `auth.verifyOtp({ type: 'magiclink', token_hash })` → session. No email is dispatched by `generateLink`; the token is single-use and consumed by the run. Fallback if the magiclink type is unavailable in project settings: `type: 'recovery'` with the matching `verifyOtp` type. Verify the exact call signatures against the installed `@supabase/supabase-js` before running — the MECHANISM is binding, not a literal snippet.
3. **Session properties:** the minted session is aal1; sufficient — DIAG-061 established the RLS check is `auth.uid()`-on-`profiles.role` and AAL-independent. State this in the report.
4. **Hygiene:** run the G-A/G-B reads under the minted JWT exactly as previously specified; `signOut()` each identity at run end; disclose the session/`last_sign_in_at` side-effect in the report (same class as DIAG-061 §3.2, previously accepted by the architect).
5. **Prohibitions:** never prompt for, accept, read, or log a password; never fall back to password auth. If BOTH required identities (tdadmin, eoadmin) fail to mint → **HALT-7** with the API errors pasted; a single optional-identity failure is recorded and execution continues.

## A4.3 — BOOKKEEPING

1. Amend via a NEW commit on the branch — `HF-283 Phase 5 amendment: credential-free session mint (Addendum-4)` — no history rewrite.
2. Re-run the pre-apply baseline immediately after the amendment (no architect action required). Expected: platform identities 0 rows — G-A FAIL as the honest negative control. The baseline must be posted BEFORE the architect applies; A3.5 ordering otherwise intact with its step 1 deleted.
3. Report updates: HG-3/HG-4 unchanged; STANDING RULE COMPLIANCE gains `Addendum-4 executed: {verdict}`; KNOWN ISSUES gains the A4.1 design-defect note.
4. §6A gains the standing-posture line: "Verification harnesses obtain user-scoped sessions via service-role admin mint; human credentials are never persisted or transmitted — promotion candidate for CC_STANDING_ARCHITECTURE_RULES."
5. HALT-6 is closed-void; HALT-7 (A4.2.5) replaces it in the §4 enumeration. All other terms unchanged.

## A4.4 — ARCHITECT PATH AFTER THIS ADDENDUM

No action before apply. Sequence: CC posts the credential-free pre-apply baseline → architect pastes the migration SQL into the Dashboard SQL Editor → replies "applied" + Dashboard output + post-apply R2 paste → CC proceeds to Phase 7.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-283_DIRECTIVE_20260610_ADDENDUM-4.md · the requirement was the JWT, never the password · mint, test, sign out*
