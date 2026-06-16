# OB-204 — HALT-2 CORRECTED DISPOSITION + PHASE A CONTINUE
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim.

## HALT-2 CORRECTED ORPHAN DISPOSITION

The prior disposition contained an incorrect domain assumption (`.ai` instead of `.com`). This corrects it. CC's halt was correct — do not self-correct irreversible operations.

### Platform personas to KEEP (the actual DB identities):
- `platform@vialuce.com` — role=platform, tenant=NULL
- `tdadmin@vialuce.com` — role=platform, tenant=NULL
- `eoadmin@vialuce.com` — role=platform, tenant=NULL

### All 11 profiled users — KEEP
Every auth user that has a profile row stays. This includes aafrica@vialuce.ai, all tenant admins (CRP, etc.), and the three Sabor users. Phase B heals the Sabor profiles through normalization — deleting them defeats A1.

### All 14 orphans (auth user with NO profile row) — DELETE
Both categories:
- The 9 test/EPG artifacts (`hf285-cold-*`, `ob203-*-epg-*@vialuce.test`)
- The 5 real orphans (`tdelcarlo@vialuce.ai`, `valentina@bancocumbre.ec`, `fernando@bancocumbre.ec`, `admin@bancocumbre.ec`, `admin@vialuce.ai`)

Execute via `auth.admin.deleteUser` for each. Emit one PII-free event per deletion (uuid + `orphan_cleanup` action). Paste the census before and the deletion confirmations after.

## CONTINUE

Finish the Phase A sequence:
- A.6 seed-writer retirement (10 writers → convert or delete per classification)
- A.7 first-login notice hook
- A.8 mint harness + EPG-1/2/3 green
- Step 6 orphan deletion per the corrected disposition above

Then open the single Phase-A PR.

---

*OB-204 · HALT-2 corrected · the door is the fix*
*vialuce.ai · Intelligence. Acceleration. Performance.*
