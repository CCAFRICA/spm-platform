# HF-283 DIRECTIVE — ADDENDUM 3: FULL POLICY-IDENTITY PRESERVATION (TO / PERMISSIVE), EPG-1-PRE-R2

**Date:** 2026-06-10
**Parent:** `docs/vp-prompts/HF-283_DIRECTIVE_20260610.md` + Addenda 1–2 — all prior terms binding except as amended here.
**This file:** save verbatim at `docs/vp-prompts/HF-283_DIRECTIVE_20260610_ADDENDUM-3.md`; commit within the Phase 3 amendment commit (A3.2).

---

## A3.1 — RULING ON THE TO-CLAUSE CAVEAT

The behavioral-equivalence argument is REJECTED as a basis for shipping default-PUBLIC policies. Grounds, recorded for the ADR: (1) the Phase-7 harness probes authenticated identities only — it cannot evidence the anon surface, so harness PASS does not prove the divergence harmless (verification-by-structure, not by favorable totals); (2) at least one live clause is auth-independent (`alias_registry.tenant_iso_alias`'s `tenant_id IS NULL` disjunct) — under an original `TO authenticated`, a PUBLIC recreate widens anon; (3) `permissive` is equally unverified, and a RESTRICTIVE→PERMISSIVE recreate is a semantic inversion invisible to the tested identities. Byte-preservation (DD-7) extends to the FULL policy identity: `roles` and `permissive`, not only `qual`/`with_check`. Root cause is an architect directive defect (EPG-1-PRE query omitted `schemaname`, `permissive`, `roles`) — log in KNOWN ISSUES as such; it joins the incomplete-read-surface Meta candidate.

## A3.2 — MECHANICS

1. The architect supplies **EPG-1-PRE-R2**: the widened query output (`schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check`, same WHERE/ORDER). R2 is now the authoritative re-key source, superseding EPG-1-PRE for the columns it adds; `qual`/`with_check` text must reconcile with the prior paste — any divergence is tabled and, if it changes a transformation, HALT-2 applies.
2. Thread preservation into the migration: every recreated policy carries its live `TO <roles>` exactly (`{public}` → omit/TO public; `{authenticated}` → TO authenticated; multi-role lists verbatim) and its live `permissive` disposition (`RESTRICTIVE` → `AS RESTRICTIVE`). No exceptions, no normalization.
3. Commit as a **new commit** on the branch — `HF-283 Phase 3 amendment: TO/permissive preservation from EPG-1-PRE-R2` — never amend/force-push (SR-41 spirit). Update the pasted-SQL evidence for the report.
4. If R2 reveals any RESTRICTIVE policy or any roles list other than `{public}`/`{authenticated}`, state it explicitly in the HALT-APPLY package (it is evidence, not a blocker, once preserved verbatim).
5. Re-post the Phase 6 HALT-APPLY package with the updated SQL. The architect applies only after this re-post.

## A3.3 — PHASE 6/7 SYMMETRY UPDATE

The post-apply EPG-1 query is SUPERSEDED by the R2 text (same widened columns). Expected post-apply: zero `vl_admin` rows; the re-keyed set present on `is_platform()` with `roles` and `permissive` matching R2 row-for-row. HG-2's evidence now includes the roles/permissive symmetry statement.

## A3.4 — HALT-6 DISPOSITION

Key names approved as emitted: `HF283_TDADMIN_PW`, `HF283_EOADMIN_PW` (required); `HF283_PLATFORM_PW`, `HF283_SABOR_EMAIL`, `HF283_SABOR_PW` (optional). Architect supplies values in `web/.env.local`; values never committed. G-B remains best-effort: if the Sabor control fails for tenant-side reasons unrelated to this HF (auth provider state, reseed drift), record best-effort-unavailable in KNOWN ISSUES — do not HALT on it.

## A3.5 — ORDERING (preserves pre/post symmetry)

(1) creds added → pre-apply baseline run and pasted (expected platform identities 0 rows; honest negative control). (2) R2 pasted → TO/permissive threaded → amendment commit → HALT-APPLY re-post. (3) architect applies → replies "applied" + Dashboard output + post-apply R2 paste. (4) Phase 7 onward unchanged. All other terms unchanged.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-283_DIRECTIVE_20260610_ADDENDUM-3.md · the policy is its whole identity · preserve, then prove*
