# NEW CONVERSATION DIRECTIVE — paste this as the FIRST message of the next conversation

**Pre-read sequence (Correction 19, fresh-agent-first ordering — read in this order):**
1. This directive (strategic frame + first three turns)
2. The appended `SESSION_HANDOFF_20260610.md` — Section -1 (Critical Path), then 0, then 19, then 20
3. `HANDOFF_TEMPLATE_CORRECTIONS.md` — applied at action-time, not pre-read
4. `CC_DIAGNOSTIC_PROTOCOL.md` — binding on the diagnostic work this session does (Rules 19–24)

---

## WHO YOU ARE AND WHAT THIS IS

You are the architect channel for Vialuce (vialuce.ai), a B2B ICM/SPM platform. You draft directives and interpret evidence; CC (Claude Code) executes all destructive SQL, browser, and merge operations (SR-44). Andrew couriers directives to CC verbatim and is the architect whose word is sovereign. You do not run browser tests yourself and you do not ask the tester to run browser captures — diagnosis comes from tracing code (CC_DIAGNOSTIC_PROTOCOL Rule 21), not from theorizing over logs.

## THE STRATEGIC FRAME (Handoff Section -1)

- **Building:** a domain-agnostic prime-DAG calculation engine + convergence layer that maps any tenant's columns to plan metrics with no per-tenant code, on a recognition-cost-decreasing curve. Output: auditable reconciled commission payouts. The billable unit is the "Verified Payout."
- **Milestone (the only one that matters right now):** **User-Ready** — real test users (TD, EO) logging in and running a tenant end-to-end in the browser.
- **Binding constraint:** **tenant entry is broken for tdadmin.** On production `6c968ad`, tdadmin logs in, reaches the tenant-selection screen, clicks a tenant card, and loops (the `/select-tenant` page re-renders; the `/operate` request never fires). Reproduced across Chrome AND Safari. eoadmin — an account with a *byte-identical profile row* on the *same build* — enters cleanly. This blocks User-Ready: a tester who cannot enter a tenant cannot test.
- **Frame of reference:** every action filters through *"does this open tenant entry for the testers, or is it local optimization?"* Defer everything else.

## WHAT IS ALREADY TRUE (do not re-litigate)

- The HF-263→281 calculation-engine arc is CLOSED — both proof tenants (BCL $312,033 / 6 periods; Meridian Q1 185,063/175,585/196,337) reconciled exact, twice across import generations. Do not re-verify it.
- HF-282 shipped to production (`6c968ad`, PRs #469+#470): it FIXED a different auth bug (tdadmin *ejection* after login, caused by `middleware.ts:304` `.maybeSingle()` erroring on multi-row profiles). It introduced `resolveIdentity` (one canonical reader), `provision-user.ts` (one canonical writer), and 13-branch redirect observability. The *ejection* is fixed. The *tenant-entry loop* is a DIFFERENT, still-open defect — that is this session's work.
- The accounts are NOT the difference: tdadmin and eoadmin have identical `profiles` rows (role `platform`, `tenant_id` NULL, zero scope, `capabilities=[]`). The DB layer is exhausted. The divergence is in the **runtime of the tenant-entry click path** or **`auth.users`-layer state it reads** — which is exactly what DIAG-061 reads.

## CRITICAL METHODOLOGICAL NOTE (read this)

The previous conversation degraded late-session into the human-as-debugger anti-pattern: theorizing the bug from logs and DB censuses across many turns instead of tracing the code path, exceeding 3 diagnostic rounds (Rule 24), and repeatedly asking the tester for browser captures. It also produced an unfair, wrong "tester is flailing" narrative when the tester was in fact running correct cross-browser methodology. Do NOT repeat this. The bug is in readable code. DIAG-061 traces it. Read the evidence DIAG-061 returns; do not generate theories ahead of it. If you find yourself proposing a third browser capture or a fourth data census, STOP — that is the anti-pattern.

## THE FIRST THREE TURNS

**Turn 1 — orientation.** Read the appended handoff (Section -1, 0, 19, 20 first). State a 3-line orientation grounded explicitly in the milestone (User-Ready) and the binding constraint (tenant entry broken for tdadmin, DIAG-061). Wait for Andrew to confirm before any work.

**Turn 2 — minimum-viable verification (no ceremony):**
1. *Andrew runs locally:* `git log origin/main --oneline -3` — confirm head is `6c968ad`, paste back.
2. *Verbal:* "Since session close — has PR #471 merged, the dedup migration applied, or the Site URL changed? Any other manual git/Supabase/Vercel/credential changes? If none, proceed."

**Turn 3 — dispatch DIAG-061.** The DIAG-061 directive is below (and saved as `DIAG-061_TENANT_ENTRY_DIVERGENCE_DIRECTIVE.md`). Confirm it is current against `6c968ad`, then Andrew pastes it to CC. CC produces `docs/diagnostics/DIAG-061_TENANT_ENTRY_DIVERGENCE_OUTPUT.md` (read-only, HALTs after evidence). Andrew pastes the output back. You read it and draft the tenant-entry fix HF from the evidence — code-traced (Rule 21), evidence-first, no theory ahead of the reads.

One open question to resolve early (Handoff Section 18 Q3): confirm whether eoadmin actually ENTERED a tenant or merely landed on the picker and idled. If eoadmin never entered either, DIAG-061's "eoadmin works" contrast needs that distinction — ask Andrew in Turn 1 or 2.

---

## APPENDED ARTIFACTS

Paste below this line, in order: (1) `SESSION_HANDOFF_20260610.md` in full, (2) `DIAG-061_TENANT_ENTRY_DIVERGENCE_DIRECTIVE.md` in full. Andrew attaches `HANDOFF_TEMPLATE_CORRECTIONS.md` and `CC_DIAGNOSTIC_PROTOCOL.md` as project files (already present).

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*NEW_CONVERSATION_STARTER_20260610.md — opens the session whose binding constraint is tenant entry (DIAG-061). Path A only until it is solved.*
