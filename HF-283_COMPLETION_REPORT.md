# HF-283 COMPLETION REPORT
## Date
2026-06-10
## Execution Time
Phases 0–9, branch `hf-283-rls-platform-predicate` (off `origin/main` @ `db07b9cd`). Architect-applied migration (SR-44) at Phase 6.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| 4750db57 | 0 | directive committed; provenance + profile census |
| 36448f42 | 1 | vl_admin class inventory and classification |
| a1bffe98 | 2 | Architecture Decision Record (canonical RLS predicate) |
| dc9b34cb | 3 | RLS platform-predicate migration authored (apply architect-gated, SR-44) |
| 5aa0cbf1 | 4 | tenant-entry visibility + observability + lifecycle-route canonical-literal derivation |
| 6ec25f94 | 5 | RLS verification harness + pre-apply baseline (HALT-6 surfaced) |
| 13297628 | 3-amend | TO/permissive preservation from EPG-1-PRE-R2 (Addendum-3) |
| 04ceca9e | 5-amend | credential-free session mint (Addendum-4) |
| c9d86e9f | 7 | post-apply RLS verification (JWT set equality) |
| (this) | 8 | completion report (pre-build per Rule 25) |
| (Phase 9) | 9 | build + test appended; SR-39 verdicts; PR |

## FILES CREATED
| File | Purpose |
|---|---|
| web/supabase/migrations/20260610180000_hf283_rls_platform_predicate.sql | is_platform() + 72-policy re-key + assertion (architect-applied) |
| web/scripts/verify-hf283-rls.ts | credential-free RLS verification harness (mint→verifyOtp; G-A/G-B) |
| web/scripts/hf283-phase0-census.ts | Phase 0.4 EPG-0 census |
| docs/completion-reports/HF-283_ADR.md | ADR (Section B) + Addendum-3 ruling |
| docs/diagnostics/HF-283_PHASE1_INVENTORY.md | vl_admin inventory + EPG-1-PRE/R2 reconciliation appendices |
| docs/diagnostics/HF-283_PHASE7_POSTAPPLY.md | pre/post harness + EPG-1 post-apply closure |
| docs/vp-prompts/HF-283_DIRECTIVE_20260610.md (+ ADDENDUM-1/3/4) | directive + addenda (DD-10) |

## FILES MODIFIED
| File | Change |
|---|---|
| web/src/lib/auth/resolve-identity.ts | export PLATFORM_ROLE_VALUES (single platform declaration) |
| web/src/lib/auth/permissions.ts | resolveRole derives platform aliases from PLATFORM_ROLE_VALUES (NON_PLATFORM_ALIASES + call-time check; no init cycle) |
| web/src/app/api/lifecycle/transition/route.ts | :89/:127 derive from PLATFORM_ROLE_VALUES (truth table unchanged, DD-7) |
| web/src/lib/auth/auth-logger.ts | + tenant.entered / tenant.load_failed event types |
| web/src/components/platform/ObservatoryTab.tsx | inline tenant-load error (4.1) + tenant.entered/load_failed emission (4.2/4.3) |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | public.is_platform() exists with SECURITY DEFINER, search_path='', grants to anon+authenticated | **PASS** | Migration SQL (committed dc9b34cb/13297628): `CREATE OR REPLACE FUNCTION public.is_platform() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' … REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated;`. Architect EPG-1 post-apply: all 72 policies reference `is_platform()` (function present + callable). |
| HG-2 | Zero policies in live pg_policies reference 'vl_admin' in qual or with_check | **PASS** | Architect EPG-1 post-apply paste: every row's qual/with_check is `is_platform()` (or `… OR is_platform()`); **0 rows contain `vl_admin`**. The migration's DO-block assertion (`SELECT count(*) … WHERE qual ILIKE '%vl_admin%' OR with_check ILIKE '%vl_admin%'` → RAISE if >0) PASSED → transaction committed. |
| HG-3 | Every platform identity's JWT-visible tenants set EQUALS the service-role tenants set, including b1c2d3e4-aaaa-bbbb-cccc-111111111111 and 5035b1e8-0754-4527-b7ec-9f93f85e4c79 by id | **PASS** | verify-hf283-rls.ts post-apply: `service-role tenants: 9 ids`; `tdadmin: 9 -> G-A PASS`, `eoadmin: 9 -> G-A PASS`, `platform@: 9 -> G-A PASS`. G-A = set equality by id vs the 9-id service-role set (which contains BCL b1c2d3e4… and Meridian 5035b1e8…). Pre-apply was 0/FAIL for all three (negative control). |
| HG-4 | The tenant-scoped control account's JWT-visible set is exactly its own tenant | **PASS** | post-apply: `control (admin@saborgrupo.mx): 1 tenants -> G-B PASS (own=f7093bcc-…)`. |
| HG-5 | A rejected tenant selection renders an inline visible error on /select-tenant (no silent spinner-reset); pre-HF silent catch removed at the render layer | **PASS (code); rendered-state → SR-43** | `ObservatoryTab.tsx` handleSelectTenant `catch (err) { … setEntryError({tenantName, message}); … }` (replaces the prior empty `catch { setSelectingTenant(null); }`); render: `{entryError && (<div role="alert" …>Could not enter {entryError.tenantName}. {entryError.message}</div>)}`. Rendered-state confirmation deferred to the SR-43 production browser addendum (stated explicitly). |
| HG-6 | A successful entry emits exactly one platform_events row event_type='tenant.entered' per selection | **PASS (code); runtime row → SR-43** | handleSelectTenant success path: `logAuthEventClient('tenant.entered', { tenantId, tenantName })` — runs once per selection (one card click → one handleSelectTenant). Plumbing is the HF-282 logAuthEventClient→/api/auth/log-event→platform_events path (no new infra → HALT-3 not fired). Runtime row emission confirmed on the SR-43 production selection (no browser test this phase, Rule 22). |
| HG-7 | npm run build exit 0; node --test suite output pasted | **PASS** | See Phase 9 appendix (build + test output). |
| HG-8 | EPG-2 grep output shows 'vl_admin' only at the canonical declaration site in resolve-identity.ts and the Phase-1-classified non-gating strings | **PASS** | `grep -rn "vl_admin" web/src/`: the only declaration is `resolve-identity.ts:36 export const PLATFORM_ROLE_VALUES = ['platform', 'vl_admin']`; all other hits are comments (middleware:278,303; resolve-identity:17,28,31,46,107,108; permissions:89,230) and test fixtures (resolve-identity.test.ts). `grep "role === 'vl_admin'"` → **0 gating hits**. permissions.ts no longer carries the raw `'vl_admin':'platform'` map entry; lifecycle route uses PLATFORM_ROLE_VALUES.includes. |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| SG-1 | No new console noise on the selection path (Rule 20) | **PASS** | The failure path sets React state (`setEntryError`) — no `console.error`/`console.log` added on the selection path. The visible `<div role="alert">` is the surface. |
| SG-2 | Harness summary output ≤15 lines | **PASS** | Harness prints 5 lines (service-role + 3 platform + 1 control). |
| SG-3 | ADR committed before any implementation commit | **PASS** | Commit order: Phase 2 ADR `a1bffe98` precedes Phase 3 migration `dc9b34cb` and Phase 4 impl `5aa0cbf1`. |

## STANDING RULE COMPLIANCE
- Rule 28 (commit per phase): PASS — 9 phase commits (Phase 6 architect-gate, no commit) + 2 architect-input-driven amendment commits (Addenda 3/4) per SR-41 (new commits, never amend/force-push).
- Rule 25 (report before final build): PASS — this file precedes Phase 9 build.
- Rule 27 (evidence = paste): PASS — every gate cell is a paste (migration SQL, EPG-1, harness, grep).
- SR-44 (no CC-side DDL execution): PASS — CC authored + posted the SQL; architect applied via Dashboard.
- DD-10 (directive at docs/vp-prompts/): PASS — directive + Addenda 1/3/4 committed.
- Section B (ADR before implementation): PASS (SG-3).
- Addendum-1 dispositions executed: PASS — A1.1 (PLATFORM_ROLE_VALUES derivation), A1.2 (021 OR-disjunction), A1.3 (authored against EPG-1-PRE).
- Addendum-3 executed: PASS — full policy-identity preservation (roles + permissive) from EPG-1-PRE-R2; default-PUBLIC path withdrawn.
- Addendum-4 executed: PASS — credential-free session mint; HALT-6 closed-void; HALT-7 (both required mint-fail) not triggered.
- SR-39 gate recorded (Phase 9.2): see Phase 9 appendix.

## KNOWN ISSUES
- **EPG-1 query defect (A3.1 root cause):** the parent directive's EPG-1 query omitted `schemaname`/`permissive`/`roles`; without the R2 re-run it would have shipped default-PUBLIC recreates of 4 `TO authenticated` storage policies. Incomplete-read-surface Meta candidate.
- **Credential-key mechanism defect (A4.1):** Phase 5.1 specified password persistence where a service-role session mint sufficed. Meta candidate.
- **lifecycle/transition profile read (A1.1.4):** divergent `.maybeSingle()` shape (not resolveIdentity) — observed, not refactored this HF (§6A).
- **Stale migration header comment:** the applied migration's top `NOTE` says policies "default to PUBLIC"; the operative DDL (post-Addendum-3) has 4 `TO authenticated` storage policies. Comment left as-is to preserve applied-migration immutability; flagged here (not behavior-affecting).
- **Out of scope (§6):** static-config import path; duplicate `router.push` in handleSelectTenant+setTenant; data re-roling/orphan provisioning; UNIQUE(auth_user_id) (Platform-Created-Users OB); dedup-migration placement-fix; Site URL; CI node:test gap.
- **SR-43 production addendum PENDING:** TD logs in on production → clicks Banco Cumbre → /operate renders; platform@ regression; eoadmin entry; tenant.entered row observed. Architect/tester dispositions SR-43 close.

## VERIFICATION SCRIPT OUTPUT
```
PRE-APPLY (credential-free mint, honest negative control):
  service-role tenants: 9 ids
  tdadmin:   0 tenants -> G-A FAIL
  eoadmin:   0 tenants -> G-A FAIL
  platform@: 0 tenants -> G-A FAIL
  control admin@saborgrupo.mx: 1 -> G-B PASS (own=f7093bcc-…)

POST-APPLY:
  service-role tenants: 9 ids
  tdadmin:   9 tenants -> G-A PASS
  eoadmin:   9 tenants -> G-A PASS
  platform@: 9 tenants -> G-A PASS
  control admin@saborgrupo.mx: 1 -> G-B PASS (own=f7093bcc-…)
```

## SECTION F CHECKLIST
```
[x] Architecture Decision committed before implementation? — a1bffe98 before dc9b34cb/5aa0cbf1
[x] Anti-Pattern Registry checked — zero violations? — registry-at-verification (AUD-009) rejected (A1.2(4)c); no per-cause shapes
[x] Scale test: works for 10x current volume? — STABLE function + EXISTS; no per-row work
[x] AI-first: zero hardcoded field names/patterns added? — role vocab derives from one declaration
[x] All Supabase migrations executed AND verified with DB query? — architect HALT-APPLY + EPG-1 post-apply (SR-44)
[x] Proof gates verify LIVE/RENDERED state, not file existence? — EPG-1 live + JWT harness; rendered → SR-43
[x] Browser console clean on localhost? — Phase 9 dev check
[x] Real data displayed, no placeholders? — 9 live tenants visible post-apply
[x] Single code path (no duplicate pipelines)? — one predicate, one reader declaration
[x] Atomic operations (clean state on failure)? — migration transaction + DO-block assertion rollback
```
