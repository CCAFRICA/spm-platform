# OB-204 — PHASE B: WIDEN NORMALIZATION + APPLY GATE
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim.

## DISPOSITION: NORMALIZE ALL 11 ROWS, NOT JUST THE 3 OBJECTS

Widen the normalization UPDATEs — remove the `jsonb_typeof(capabilities) <> 'array'` filter from every role-targeted UPDATE. Every profile row gets `capabilities = deriveCapabilities(role)` regardless of current shape.

Rationale: the data contract (DS-028 §2) says capabilities are derived from role at write time. Eight rows carrying legacy-vocabulary arrays pass the CHECK (shape-valid) but violate the contract (vocabulary-stale). That is exactly the discrepancy a SOC 2 CC6 auditor flags: the stored value does not match what the system says it computes. Since authz is role-based and reads ROLE_CAPABILITIES, this is safe — and it means post-migration, every stored array in the estate matches the matrix verbatim. Clean slate. Zero discrepancies. The contract holds for 11/11 rows, not 3/11.

Amend the migration file, commit, push to the PR branch. Then report back with the updated SQL so I can apply from the committed file.

Do not change anything else in the migration — the ordering, transaction wrapper, DDL guards, FK DO-block, PII cleanse, and audit_logs nullable are all correct as authored.

---

*OB-204 · Phase B · every row matches the matrix*
*vialuce.ai · Intelligence. Acceleration. Performance.*
