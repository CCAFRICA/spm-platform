# DIAG-061 — TENANT-ENTRY DIVERGENCE: two identical platform profiles, opposite outcomes

**Type:** DIAG (read-only diagnostic — produces evidence, never ships code)
**Date:** 2026-06-10
**Repo:** `CCAFRICA/spm-platform`, branch `main` @ `6c968ad` (post-HF-282 #469/#470)
**Governing protocol:** `CC_DIAGNOSTIC_PROTOCOL.md` Rules 19–24 — binding throughout
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md`; drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`
**Output artifact:** `docs/diagnostics/DIAG-061_TENANT_ENTRY_DIVERGENCE_OUTPUT.md`

---

## §0 — MODE AND CONSTRAINTS

READ-ONLY. **ZERO code changes** (Rule 23 — no diagnostic code committed; any runtime trace is removed before exit and this DIAG ships none). Evidence is pasted code with `file:line`, pasted query output, pasted git output. **No fix. No ranked hypotheses. No theories.** HALT after §3 evidence is assembled.

This DIAG exists because the human-as-debugger loop (CC_DIAGNOSTIC_PROTOCOL.md anti-pattern) was actively running in the architect channel: the bug was theorized across many turns from logs and DB rows instead of from the code path. Rule 21 (trace the actual code path before any fix) and Rule 24 (stop after 3 diagnostic rounds, write failure analysis not a 4th attempt) were both breached. This DIAG resets to evidence-from-code.

---

## §1 — THE FACT TO EXPLAIN (no interpretation)

On production `6c968ad`, two accounts with **byte-identical `profiles` rows** behave oppositely at tenant entry. Verified-identical fields (live query, this session): `role='platform'`, `tenant_id=NULL`, **zero** `profile_scope` rows, `capabilities=[]` — for BOTH.

- **`eoadmin@vialuce.com`** (auth id `e6e13eee-5a85-4b01-bc3d-b2b5c1a6fc58`): first login 09:48 (after #470 live). `platform_events`: `login.success → redirect.mfa_verify → redirect.tenant_select` once, then normal `session.expired.idle` ~30 min later. **Enters / proceeds.**
- **`tdadmin@vialuce.com`** (auth id `ee18f0e5-db8b-4c81-b167-b9215811d87b`): same morning, same build. `platform_events`: the sequence `login.success → redirect.mfa_verify → redirect.tenant_select` **repeats six times in 16 minutes**, across **both Chrome 148 and Safari 605** (browser-axis eliminated by the tester). **`/operate` never appears in any request.** **No `auth.shell.loop_break`.** Clicking a tenant card does not enter; `/select-tenant` re-renders. Console at click time (captured earlier this session): font-preload warnings only — no error, no exception.

**Established (do not re-derive):** the click path dies **client-side before navigation** — `/operate` never reaching middleware proves `router.push('/operate')` never completes a server request. eoadmin succeeding on the identical profile shape proves the path **can** succeed for `platform`/NULL-tenant/no-scope. **The question is strictly: what varies at runtime between these two accounts to make the same click path complete for one and not the other.** The DB layer is exhausted — every comparable column is identical. The variance is therefore in (a) the client click-path runtime, (b) `auth.users`-layer state the path reads, or (c) the tenant-load authorization the path performs. Items in §3 target exactly these.

---

## §2 — RULE 21 PRECONDITION (trace before any conclusion)

Per CC_DIAGNOSTIC_PROTOCOL Rule 21, the call chain must be mapped from UI entry point to failure point, with `file:line`, BEFORE any conclusion. §3.1 is that trace. CC does not assert a cause; CC pastes the chain and the conditional branches within it, and the architect reads the divergence from the pasted evidence.

Verification hierarchy (Rule 22): this is a Level-1/Level-3 surface (code trace + service-role reads). **No Level-5 browser test is requested** — the tester has already supplied the cross-browser reproduction and console state; further browser captures are prohibited by architect direction and unnecessary given the code is readable.

---

## §3 — EVIDENCE TO ASSEMBLE (paste each with `file:line`)

### 3.1 — The click path, current `main`, complete bodies (Rule 21 chain)
Paste, in execution order, the **current** source (HF-282 may have altered these; do not trust any prior snapshot):
1. Tenant-card `onClick` → `handleSelectTenant` (ObservatoryTab or current location)
2. `setTenant` (tenant-context)
3. `loadTenant` (tenant-context) — **every branch, every `await`, every throw/early-return**. Annotate: under what conditions does it reject, throw, or return without setting `currentTenant`?
4. The `isAdmin` value `setTenant` gates its cookie-write and `router.push` on — where it is derived, which field/role, via which context/provider.

State the chain explicitly as: `entry (file:line) → … → failure point (file:line)`.

### 3.2 — `loadTenant`'s data dependency and tenant-table authorization
Paste the query/endpoint `loadTenant` calls to load a tenant. Paste the RLS policies on `tenants`: `select policyname, cmd, qual, with_check from pg_policies where tablename='tenants';` (service-role read, paste output). **State explicitly:** for a `platform`-role user with NULL `tenant_id` and zero scope rows, does this query return the target tenant row — and is there ANY per-user/per-session condition under which it returns rows for one such account and not another?

### 3.3 — Silent-failure confirmation
Paste the `catch`/guard in `setTenant` and `handleSelectTenant`. Confirm whether a `loadTenant` rejection yields: no cookie write, no `router.push`, spinner-reset only — i.e. **silent to the user** (consistent with console showing only font warnings). State which.

### 3.4 — `isAdmin`/`isVLAdmin` resolution source vs `resolveIdentity`
Paste `resolveIdentity` as merged (both accounts are single-row → the non-duplicate path). Then paste the client `isAdmin`/`isVLAdmin` derivation. **State explicitly:** does the client admin flag read the SAME resolved identity as `resolveIdentity`, or a separate `getUser()` / `app_metadata` / `user_metadata` read that could differ between two auth users with identical `profiles` rows?

### 3.5 — The two `auth.users` rows compared (the layer the DB-profile compare could not see)
Service-role `admin.getUserById` for BOTH `ee18f0e5…` (tdadmin) and `e6e13eee…` (eoadmin). Paste for each: `app_metadata`, `user_metadata`, `role`, `aud`, `identities[].provider`, `identities.length`, `created_at`, `last_sign_in_at`. **Flag every field that differs** — the `profiles` rows are identical; these may not be (script took `createUser` for one path, `updateUserById`/pre-existing for another). Any difference is a candidate.

### 3.6 — The auth-shell tenant gate as merged (post-selection bounce check)
Paste the HF-282 `shouldGateToSelectTenant` predicate and its call site. **State explicitly:** after a successful client-side selection sets `currentTenant`, can this gate still evaluate `!currentTenant` (timing/hydration) and push back to `/select-tenant`? Under what `currentTenant`/`tenantLoading`/role condition does it push?

### 3.7 — git provenance of the three files
`git log --oneline -15 -- web/src/contexts/tenant-context.tsx web/src/components/platform/ObservatoryTab.tsx web/src/components/layout/auth-shell.tsx` — paste. Confirm whether #469/#470 touched any of these and the current SHA of each.

---

## §4 — HALT CONDITIONS

- **HALT-A:** if §3.1 reveals the entry point is NOT `handleSelectTenant`/`setTenant` (i.e. the card onClick routes elsewhere on current `main`), STOP and paste the actual entry point and its chain — the trace premise is wrong and must be re-grounded (Rule 21).
- **HALT-B:** if §3.5 shows the two `auth.users` rows are **byte-identical** across all listed fields, STOP and record it — it eliminates the auth-layer hypothesis and narrows to the client runtime / tenant-load path; note this explicitly so the architect does not re-investigate it.
- **HALT-C (Rule 24):** this is diagnostic round 1 of a maximum 3. If a follow-on DIAG is needed, it must add a NEW evidence axis, not re-run these reads. Do not exceed 3 rounds without a Rule-24 failure analysis.

HALT after §3. Evidence only. No fix, no theory, no ranked causes.

---

## §5 — REPORTING

Output `docs/diagnostics/DIAG-061_TENANT_ENTRY_DIVERGENCE_OUTPUT.md`: §3.1–§3.7 each as pasted code/query/git blocks with `file:line`; the explicit chain statement from §3.1; the explicit per-field diff from §3.5; HALT disposition if any fired. No completion-report PR (DIAG ships no code — Rule 23). The architect reads the output and drafts the fix HF from it.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*DIAG-061 · read-only · evidence only · HALT after §3*
