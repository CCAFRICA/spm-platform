# NEW CONVERSATION DIRECTIVE — 2026-05-18

I'm Andrew, founder of vialuce (vialuce.ai). Today is [DATE].

PCD — confirm compliance before responding.

## Pre-read order (read from project knowledge before Turn 1 response):

1. `USER_READY_CRITICAL_PATH_SEQUENCING_20260506.md` — strategic reference
2. `SESSION_HANDOFF_20260518.md` — Section -1 (binding constraint: JSONB column stripping), then Section 0, then Section 19, then Section 20
3. `SESSION_CLOSING_REPORT_20260518.md` — Section 1 (narrative) and Section 6 (defect classes) for reasoning-arc reconstruction
4. `HANDOFF_TEMPLATE_CORRECTIONS.md` — discipline reference, read at action time
5. `CC_STANDING_ARCHITECTURE_RULES.md` — enforced on every CC directive

## Turn 1 — Orientation confirmation

Confirm in 5 sentences or fewer:
- The binding constraint (JSONB column stripping in commitContentUnit → Supabase insert)
- CRP reconciliation state (regressed from $360,007.84 to $4,000/period)
- The proven facts (commitContentUnit spreads all columns; probe confirms 11 columns at call site; database stores only 7; no trigger)
- That HF-228 through HF-235 are architecturally correct and should NOT be reverted
- The recommended next action (Path A: instrument the Supabase insert boundary)

## Turn 2 — Verification

Andrew runs locally: `git log origin/main --oneline -3`
Andrew confirms: "Any manual state changes since session close? If none, proceed."

## Turn 3 — Execute Path A

Draft a temporary inline diagnostic (NOT an HF) for CC:

Add `console.log('[DIAG-INSERT]', JSON.stringify(slice[0]))` immediately before the `await supabase.from('committed_data').insert(slice as unknown as Json[])` call at line 356-358 of `web/src/lib/sci/commit-content-unit.ts`.

Andrew imports one CRP sales file. Captures `[DIAG-INSERT]` log. Pastes verbatim.

Then: Andrew runs in Supabase SQL Editor:
```sql
SELECT row_data FROM committed_data 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7' 
AND data_type = 'transaction' 
ORDER BY created_at DESC LIMIT 1;
```

Compare the two outputs. If the log has 11 columns and the DB has 7, the Supabase client serialization is the root cause. If the log has 7 columns, the `{ ...row }` spread is not copying string properties from the SheetJS-parsed object.

## Key context

- **Repo:** `CCAFRICA/spm-platform`, branch `main`, latest merge PR #414 (HF-235)
- **CRP tenant:** `e44bbcb1-2710-4880-8c7d-a1bd902720b7` — clean-slated, 756 transaction rows with stripped columns
- **Decisions through 158+ LOCKED.** No substrate changes this session.
- **PRs this session:** #406 through #414 (HF-228 through HF-235, DIAG-048/049)
- **Three proof tenants:** BCL PASS-RECONCILED $312,033. Meridian PASS-RECONCILED $185,063. CRP REGRESSED.
- **The column stripping pattern:** ALL string-valued columns vanish. Numeric columns survive. `sales_rep_id` (string but entity_id_field) also survives — investigate whether entity_id_field processing preserves it separately.

## What NOT to do

- Do NOT revert HF-231 through HF-235. They are architecturally correct.
- Do NOT theorize about convergence, Pass 4 prompts, or AI non-determinism. The convergence pipeline is correct. The data is the problem.
- Do NOT clean slate CRP again until the column stripping root cause is identified and fixed.
- Do NOT draft HFs until the diagnostic confirms where the stripping occurs.
