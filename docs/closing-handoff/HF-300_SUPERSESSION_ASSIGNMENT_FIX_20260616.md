# HF-300: Plan-Identity Supersession + Post-Commit Assignment Reliability

**Date:** 2026-06-16
**Category:** HF — fixes DIAG-071's two confirmed defects.
**Number:** HF-300 (assigned by architect). VERIFY before committing: `ls docs/vp-prompts/ | grep -iE "^HF-300"` and `ls docs/completion-reports/ | grep -iE "^HF-300"` must both return empty. If either is non-empty, HALT and report — earlier in this arc "HF-300" was used as an unverified label and may have leaked into a branch or commit message; confirm no committed docs artifact already claims 297 before proceeding.
**Predecessor:** DIAG-071 (PR #532, `391e96c3`) — root cause CONFIRMED with DB + code.
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — WHAT IS BROKEN (from DIAG-071, do not re-diagnose)

Tenant `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`: 5 plans interpreted, Calculate shows 1, with 0 entities. DB proved:
- **C1 (supersession):** `plan-interpretation.ts:363-368` archives ALL prior rule_sets for the tenant with no plan-identity filter. Result: 1 active, 11 archived. Latent single-plan assumption since HF-239 (2026-05-19). Each plan import archived the previous.
- **C3 (assignments):** `createMissingAssignments` was moved into the `waitUntil` post-commit background by PR #530 (`6e49db8a`). That background fetch-fails on Vercel (`TypeError: fetch failed`). The 553 assignments that exist are stranded on the archived 6-15 plan `c3574b89`; the active plan has 0. `assignment-creation.ts:45` only assigns to `status='active'`.

Two independent defects. Both must be fixed. Neither fix may reintroduce the 300s import timeout that PR #530 fixed.

---

## §1 — DISCIPLINE

1. `CC_STANDING_ARCHITECTURE_RULES.md` applies.
2. **Do not undo the import speed fix.** PR #530 moved post-commit work to background to escape the 300s timeout. The C3 fix must keep import fast AND make assignments reliable — not move heavy work back in front of the response per-file.
3. **Korean Test:** plan-identity supersession must match on structural identity (content_hash, or name+source), never on hardcoded plan names or tenant-specific strings.
4. **Scale-by-Design:** the fix must hold for N concurrent plans, not just 5. No new per-tenant or per-plan-count assumption.
5. Each defect is a discrete, separately-verifiable edit (AUD-009).

---

## §2 — DEFECT C1: PLAN-IDENTITY SUPERSESSION

### 2.1 — Read the current supersession
Open `plan-interpretation.ts` around 363-368. Paste the current archive query. Confirm it archives `WHERE tenant_id = ?` with no plan-identity predicate.

### 2.2 — The fix
Supersession must archive only the prior version of THE SAME plan, identified structurally. A plan's identity across reimports is its content (the PDF's content_hash) or its name. When plan X is reimported:
- Archive prior rule_sets whose plan-identity matches plan X (same content_hash, or same name if content_hash isn't stored on rule_sets).
- Leave all other active rule_sets (the other plans) untouched.

Read what identity fields exist on `rule_sets` (name, content_hash, source_file, source_content_hash — confirm by reading the schema or a sample row). Use the most stable available. If content_hash is available on the rule_set or derivable from the plan source, prefer it; else match on `name`.

**Determine the intended reimport model from the data, not assumption:** the MIR flow imports 5 distinct plans, each its own PDF with its own name and content. Reimporting one plan should supersede only that plan's prior version. This is plan-scoped supersession. Implement that.

### 2.3 — Idempotency
Reimporting the same 5 plans (as happened today) must converge to exactly 5 active rule_sets — one per plan — not 5 new + 5 archived each time. Verify a second identical import leaves 5 active, the prior 5 archived (or updated in place), not 10 active.

---

## §3 — DEFECT C3: POST-COMMIT ASSIGNMENT RELIABILITY

### 3.1 — First, verify whether waitUntil even runs
DIAG-071 flagged that `waitUntil` in Next 14.2 App-Router Node runtime may be throwing, causing the `catch{}` to detach the work, which Vercel then freezes on response return. Before designing the fix, CONFIRM the actual behavior:
```bash
grep -rn "waitUntil\|after\|unstable_after" web/src/app/api/import/sci/execute-bulk/route.ts
git show 6e49db8a -- web/src/app/api/import/sci/execute-bulk/route.ts
```
Paste the exact post-commit invocation. Determine: is the work wrapped in `waitUntil` from `@vercel/functions`? Is the Supabase client used inside it request-scoped (torn down on flush) or freshly constructed inside the background task? The `TypeError: fetch failed` strongly indicates a torn-down fetch context.

### 3.2 — The fix: assignments must land reliably
The constraint set: (a) import must not block on per-file whole-tenant work (PR #530's reason), (b) assignments MUST be written, (c) it must work in the actual Vercel runtime.

Read the code and choose the approach the runtime actually supports — verify, don't assume:

- **Option A — fresh client in background:** if `waitUntil` runs but the client's fetch context dies, construct a NEW Supabase service-role client INSIDE the background task (not the request-scoped one). This is the minimal fix if `waitUntil` itself executes.
- **Option B — assignment as its own deferred step:** if `waitUntil` is unreliable in this runtime, assignments move out of the per-file post-commit entirely and run ONCE after the full import completes — triggered by the client after the last file's 200, or as a dedicated lightweight endpoint the client calls on import completion. This also fixes the per-file 15× redundancy DIAG-070 flagged.
- **Option C — self-heal at calc time:** the calc route already has HF-126 self-healing that creates assignments when there are ZERO. Confirm whether it fires; if it only fires on zero-for-the-queried-rule_set, it would now correctly fire for the active plan with 0 assignments. This may be a safety net, not the primary fix.

CC determines which the runtime supports by reading and, if needed, a minimal probe. State the choice with the runtime evidence.

### 3.3 — Reconcile the stranded assignments
The 553 existing assignments are on the archived plan `c3574b89`. Once C1 makes supersession plan-scoped, reimporting will keep plans active and assignment creation will target active plans. But the CURRENTLY stranded state needs resolution: after the fix deploys and the plans are reimported (or after a one-time assignment rederivation), entities must be assigned to the now-active correct plans. Confirm the fix produces non-zero assignments on the active plans for this tenant.

---

## §4 — PROOF GATE (architect, browser + DB, SR-44)

After deploy (verify production SHA contains the fix commit first):

- [ ] Reimport the 5 MIR plans. DB query: exactly 5 active rule_sets for the tenant, one per plan (not 1, not 10).
- [ ] DB query: assignments exist (non-zero) on the active plans — entities bound to the plans they belong to.
- [ ] Calculate page shows all 5 plans, each with its entity count (not 0).
- [ ] Re-run the same 5-plan import again: still exactly 5 active (idempotent, no accumulation).
- [ ] Import the 15 data files: still completes fast, no 300s timeout (PR #530's win preserved).
- [ ] Calculate January 2025 on a plan: returns results, not "Failed to fetch."
- [ ] Regression: BCL/Meridian/CRP single-plan tenants still calculate (supersession change doesn't break single-plan tenants).

---

## §5 — RESIDUALS (named, not in this HF)

- The Calculate "Failed to fetch" client TypeError at `calculate/page.tsx:252` — if it persists after assignments are non-zero, it's a separate client-error-handling item. This HF makes the underlying data correct; the client error surface is separate.
- Execute-phase polling noise — separate, directed, still pending.
- Per-file 15× post-commit redundancy — addressed only if §3 Option B is chosen; otherwise named.

---

## §6 — COMPLETION REPORT (MANDATORY — SOP)

Commit `docs/completion-reports/HF-300_COMPLETION_REPORT.md` BEFORE opening the PR. It must contain:
1. The assigned number and how it was verified against the ledger.
2. C1 fix: pasted diff of the supersession change, the identity field used, and why.
3. C3 fix: the chosen option (A/B/C), the runtime evidence that drove the choice, pasted diff.
4. DB proof: pasted tsx output showing 5 active rule_sets and non-zero assignments on active plans for the tenant.
5. Build exit-0 evidence.
6. The stranded-assignment reconciliation result.
7. Scope fence: what was not touched (engine, schema, single-plan tenant paths, import speed path).

A PR without this committed report is an SOP violation. Report committed first, then `gh pr create`. State PR number and HEAD SHA.

---

*HF-300 · Plan-Identity Supersession + Post-Commit Assignment Reliability · 2026-06-16*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
