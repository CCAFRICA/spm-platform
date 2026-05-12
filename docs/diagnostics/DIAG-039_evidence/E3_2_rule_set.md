# E3.2 — Active rule_set for Meridian (verbatim)

**Query:** `SELECT * FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' ORDER BY created_at DESC`

**Result:** 1 row. Verbatim row content already surfaced in `E2_2_rule_sets_full_row.md` (1287 lines).

## Summary identifiers

```
id:        939cf576-4096-4ceb-a142-539a486868b3
tenant_id: 5035b1e8-0754-4527-b7ec-9f93f85e4c79
name:      "Meridian Logistics Group Incentive Plan 2025"
status:    "active"
version:   1
created_at: 2026-05-09T21:06:11.52743+00:00
```

## Disposition note

Only 1 active rule_set exists for Meridian at the time of this probe — no disposition needed regarding "which rule_set was active for the AUD-006 §6.3 reading" (the directive's contingency for multiple rule_sets). The calculation_results row surfaced in E3.4 carries `rule_set_id: 939cf576-4096-4ceb-a142-539a486868b3` confirming this is the rule_set actually used.
