# OB-204 — A1 PASS + PHASE C PROCEED
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim.

## A1 — PASS (architect browser-verified, production, 2026-06-13)

All three Sabor users logged in on production and reached their role-correct workspace:
- admin@ — MFA enrollment completed → `/stream` (admin workspace)
- mesero@ — direct login → `/stream` (member experience)
- gerente@ — direct login → `/stream` (manager experience)

RCA confirmed: capabilities stored as JSONB objects → `.includes()` TypeError in mapProfileToUser. Phase B normalization + contract constraints close the defect class structurally. Record this in the completion report as A1 PASS with architect-verified date 2026-06-13.

## PHASE C: PROCEED

Branch `ob-204-surfaces`. The standing directive §3.4 governs in full. Build the administration UI surfaces:

- C.1 `/configure/users` (admin, own tenant) — server-endpoint-backed user list (CLT166-F10 fix), credential state column (Invited/Active/Disabled), per-row action menu (F4–F10), invite form (F1), roster panel (F7 entity promotion), search/filter/sort.
- C.2 `/admin/users` (platform) — all of C.1 across tenants + tenant selector + F8 platform-user invitation.
- C.3 Thin-client rule — every action calls the Phase A routes; zero authorization logic client-side; navigation derives from capabilities.

Commit per component, build-verified. PR at phase end: `gh pr create --base main --head ob-204-surfaces --title "OB-204 Phase C: user administration surfaces"`. Architect merges.

---

*OB-204 · A1 converted · the door is proven · now the surfaces over it*
*vialuce.ai · Intelligence. Acceleration. Performance.*
