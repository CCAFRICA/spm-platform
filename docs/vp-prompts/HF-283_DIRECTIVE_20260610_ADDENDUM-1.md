# HF-283 DIRECTIVE — ADDENDUM 1: ARCHITECT DISPOSITIONS (HALT-1, HALT-2, EPG-1-PRE)

**Date:** 2026-06-10
**Parent directive:** `docs/vp-prompts/HF-283_DIRECTIVE_20260610.md` — all parent terms remain binding except as amended here.
**This file:** save verbatim at `docs/vp-prompts/HF-283_DIRECTIVE_20260610_ADDENDUM-1.md`; commit within Phase 2's commit. Resume execution at Phase 2.

---

## A1.1 — HALT-1 DISPOSITION: FOLD IN, DERIVATION-ONLY

1. In `web/src/lib/auth/resolve-identity.ts`, export the platform alias set as a named constant if not already exported: `export const PLATFORM_ROLE_VALUES = ['platform', 'vl_admin'] as const;` — `resolveRole` derives its alias mapping from this constant. This constant is the single app-side canonical declaration; the migration header comment (Phase 3.1a) is updated to name `PLATFORM_ROLE_VALUES` explicitly as the paired declaration of `public.is_platform()`.
2. `web/src/app/api/lifecycle/transition/route.ts:89` — replace the dual-literal check with membership derived from the constant: `(PLATFORM_ROLE_VALUES as readonly string[]).includes(profile.role)`. Truth table identical to the current `=== 'platform' || === 'vl_admin'`; behavior byte-preserved (DD-7).
3. `web/src/app/api/lifecycle/transition/route.ts:127` — `.in('role', ['admin', ...PLATFORM_ROLE_VALUES])`. Identical set; `'admin'` preserved verbatim.
4. No other change to the route. If its profile acquisition is a divergent read shape (not `resolveIdentity`), record the observation in KNOWN ISSUES and §6A — do not refactor it in this HF.
5. Execution slot: Phase 4 sub-step **4.0**, inside Phase 4's single commit (Rule 28 preserved). Commit message: `HF-283 Phase 4: tenant-entry visibility + observability + lifecycle-route canonical-literal derivation`.
6. New retirement EPG — **EPG-2** (evidence at Phase 8; re-confirmed at Phase 9): `grep -rn "vl_admin" web/src/ web/scripts/` — permitted hits ONLY: (a) the declaration site in `resolve-identity.ts`, (b) the non-gating display/audit-string sites already classified in the Phase 1 table, cited by `file:line`. Any other hit = FAIL.
7. New hard gate — add to the §5 report skeleton:
   `| HG-8 | EPG-2 grep output shows 'vl_admin' only at the canonical declaration site in resolve-identity.ts and the Phase-1-classified non-gating strings | | (grep paste) |`

## A1.2 — HALT-2 DISPOSITION: 021 JOINS THE OR-DISJUNCT FAMILY; NO SECOND PREDICATE

1. **Scope clarification (binding):** this HF's retirement set is the LEGACY ALIAS literal `'vl_admin'` only. Live canonical role vocabulary (`'admin'`, and `'platform'` where it appears outside the predicate) is NOT in the retirement set and is preserved byte-for-byte.
2. For each migration-021 storage policy: rewrite the `vl_admin`-bearing membership as the disjunction `( public.is_platform() OR <admin-membership clause byte-preserved> )` — i.e. `EXISTS (... role IN ('platform','vl_admin','admin'))` ≡ `public.is_platform() OR EXISTS (... role = 'admin')`. The tenant-admin folder-scoped branch (`role = 'admin' AND <folder scoping>`) is untouched. Set semantics identical; DD-7 satisfied. Storage policies are schema-qualified in DROP/CREATE (`ON storage.objects`).
3. The Phase 3.1c global assertion is UNCHANGED and unrelaxed: zero `vl_admin` in any `pg_policies` `qual`/`with_check`. With (2), the migration passes its own assertion with 021 fully handled.
4. Rejected options, recorded for the ADR: **(b)** leaves the literal — breaks class closure and the migration's own assertion; **(c)** a named-exception list inside the assertion re-forms a registry at the verification layer (AUD-009 anti-pattern class) — prohibited; **(a)** `is_tenant_admin()` creates a second canonical DB surface with no paired app-side declaration for the `'admin'` concept — scope expansion under a fix HF (DD-7 / T1-E947).
5. Append to §6A Residuals: "Live canonical role literals (`'admin'`; raw `'platform'` outside `is_platform()`) remain inline in policies by design this HF. A role-predicate family consolidation — DB predicates paired with app-side declarations per role concept — is a named forward candidate (Platform-Created-Users OB or a dedicated slice)."

## A1.3 — EPG-1-PRE: AUTHOR AGAINST LIVE POLICY TEXT

1. Approved. Before any Phase 3 authoring, the architect supplies the Supabase Dashboard output of the Phase-6 EPG-1 query (text unchanged), labeled **EPG-1-PRE**.
2. Reconcile live vs committed for every `vl_admin`-bearing policy. **Live text is authoritative for byte-preservation.** Any live-only policy joins the re-key set from its live text. Any live-vs-committed text divergence is tabled in an appendix to `docs/diagnostics/HF-283_PHASE1_INVENTORY.md` (committed within Phase 2's commit). A live policy whose byte-preserving rewrite is ambiguous → HALT-2 applies to it.
3. Phase 6 EPG-1 (post-apply) is unchanged and still runs. EPG-1-PRE / EPG-1 pre-post symmetry is the class-closure proof; paste both in the report.

## A1.4 — BOOKKEEPING

1. The Phase 2 ADR records dispositions A1.1–A1.3, including the rejected options and grounds in A1.2(4).
2. Phase 2's single commit contains: the ADR, this addendum file, and the inventory appendix from A1.3(2).
3. §5 report skeleton gains HG-8 (A1.1.7); STANDING RULE COMPLIANCE gains the line `Addendum-1 dispositions executed: {verdict}`.
4. All other parent-directive terms, phases, numbering, HALTs, and gates unchanged. Resume at Phase 2.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-283_DIRECTIVE_20260610_ADDENDUM-1.md · dispositions are binding · the retirement set is the legacy alias, the closure is the class*
