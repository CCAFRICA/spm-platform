ARCHITECTURE DECISION RECORD — HF-283
=====================================
RLS role-vocabulary canonicalization (tenant entry). Section B gate; committed
before any implementation code (Phase 2). Records Addendum-1 dispositions
A1.1–A1.3 + the Phase 4.2 observability surface choice.

PROBLEM
-------
RLS policies key on the legacy literal 'vl_admin'; the canonical role since HF-282
is 'platform' (resolveRole). 72 live policies (EPG-1-PRE) gate on 'vl_admin' via
EXISTS/scalar-subselect; the tenant SELECT (tenants_select_vl_admin) therefore
returns 0 rows for platform users, so tenant entry is dead for every platform
account (DIAG-061 §3.2, empirically both testers 0 rows). Defect-class lineage:
HF-282 canonicalized role vocabulary in the READER (resolveRole: 'vl_admin' is a
legacy alias of 'platform'); the DB policy layer still encodes the raw literal —
role-vocabulary drift between the app's one canonical declaration and the policy
layer. Closing only `tenants` is instance closure (AP-D2); this HF re-keys the class.

OPTIONS (Section B template lines per option)
---------------------------------------------
Option A — per-policy literal expansion (`role IN ('vl_admin','platform')` edited
  into each policy):
  - Scale 10x: ok (no row work). AI-first: n/a. Transport: no HTTP bodies.
    Atomicity: per-policy edits, no single barrier.
  - REJECTED: scatters the alias set across N sites; registry anti-pattern at the
    RLS layer; fails Korean-Test derivation-from-one-declaration; every future alias
    change is an N-site edit.
Option B — ONE canonical predicate `public.is_platform()` mirroring resolveRole;
  every platform-gated policy re-keyed to call it:                       [CHOSEN]
  - Scale 10x: ok (STABLE function, index-eligible EXISTS). AI-first: n/a.
    Transport: none. Atomicity: single transactional migration with DO-block
    assertion rollback → all-or-nothing.
  - CHOSEN: one declaration, N derivations; the alias set lives in exactly two
    named, paired surfaces (app `PLATFORM_ROLE_VALUES` in resolve-identity.ts +
    DB `public.is_platform()`), each naming the other; assertion-enforced class
    closure (pg_policies sweep = 0 'vl_admin').
Option C — re-role the data (set platform rows to 'vl_admin'):
  - REJECTED: reverses HF-282's canonicalization; SR-34 bypass; leaves the
    structural drift in place.

ADDENDUM-1 DISPOSITIONS (binding)
---------------------------------
A1.1 (HALT-1, fold-in derivation-only): `web/src/app/api/lifecycle/transition/
  route.ts:89,127` gates on the raw 'vl_admin' literal outside resolveRole. Folded
  in as a DERIVATION: export `PLATFORM_ROLE_VALUES = ['platform','vl_admin']` from
  resolve-identity.ts (resolveRole derives its platform aliases from it); the route
  uses `PLATFORM_ROLE_VALUES.includes(profile.role)` and `[...]` spread. Truth table
  identical (DD-7). Executed in Phase 4 sub-step 4.0. New EPG-2 + HG-8 enforce that
  'vl_admin' survives in code ONLY at the declaration site + classified non-gating
  strings.
A1.2 (HALT-2, 021 joins the OR-disjunct family; NO second predicate): the retirement
  set is the legacy 'vl_admin' literal ONLY; 'admin' and raw 'platform' preserved.
  021 storage policies (live: "ingestion_raw_insert/select 13cn3lr_0") rewrite
  `role=ANY('platform','vl_admin','admin')` ≡ `public.is_platform() OR EXISTS(role=
  'admin')`; inner `role=ANY('platform','vl_admin')` ≡ `public.is_platform()`;
  folder-scoped admin branch byte-preserved. Global assertion unchanged/unrelaxed.
  REJECTED: (b) leave the literal — breaks class closure + the migration's own
  assertion; (c) named-exception list in the assertion — registry at the
  verification layer (AUD-009 class); (a) is_tenant_admin() — a second canonical DB
  surface with no paired app-side declaration for 'admin' = scope expansion under a
  fix HF (DD-7 / T1-E947).
A1.3 (EPG-1-PRE, author against live text): live `pg_policies` is authoritative for
  byte-preservation; 72 live policies categorized A–G in the inventory appendix
  (the Phase 3 authoring spec). Live-only policies join the set; divergences tabled
  (profiles_select_vl_admin absent live; storage name auto-naming; id-join tenant
  clauses preserved verbatim). No new HALT-2 beyond the pre-dispositioned 021.

PHASE 4.2 OBSERVABILITY SURFACE (ADR addendum, parent §4.2)
----------------------------------------------------------
Chosen surface: CLIENT emission at the setTenant success/failure boundary
(tenant-context.tsx), via the existing HF-282 `logAuthEventClient` ->
POST /api/auth/log-event -> platform_events plumbing. Rationale: `setTenant` is
invoked exactly once per card selection, so `tenant.entered` (on success, after the
RLS fix lets loadTenant resolve) and `tenant.load_failed` (on rejection) emit
exactly once per selection — naturally spam-guarded (NOT once-per-request on
/operate, which a middleware marker would risk). No NEW infrastructure is required
(platform_events + log-event route exist since HF-282) -> HALT-3 does NOT fire.
AAL note (DIAG-061 §3.2): the RLS check is auth.uid()-on-profiles.role and
AAL-independent; emission does not depend on AAL.

KOREAN TEST / SR-39
-------------------
One DB predicate + one app constant, paired and cross-naming; zero scattered role
literals post-apply (assertion-enforced). No privilege widening: is_platform() =
platform OR vl_admin (the prior set); tenant-isolation/admin/folder clauses
byte-preserved. SOC 2 CC6 single canonical authorization predicate. The
UNIQUE(auth_user_id) data constraint remains deferred to the Platform-Created-Users
OB (out of scope, §6).
