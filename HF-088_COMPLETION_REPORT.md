# HF-088 COMPLETION REPORT
## Production Data Cleanup (Post OB-151)

### Purpose
Delete HF-086 auto-created VL Admin tenant profiles and duplicate rule_sets
from failed import attempts. OB-151 (PR #168) prevents future occurrences;
this HF cleans existing damage.

### Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | VL Admin has exactly 1 profile (platform-level, tenant_id=null) | PASS | `497b8d67-7c81-40cd-b14a-41ca90497c0b`, role=vl_admin, tenant_id=null |
| PG-02 | Zero VL Admin tenant-scoped profiles exist | PASS | Tenant-scoped profiles: 0 |
| PG-03 | Optica Luminar has 0 rule_sets | PASS | Total rule_sets: 0 |
| PG-04 | Optica Luminar has 0 entities, 0 committed_data, 0 results, 0 assignments | PASS | Entities: 0, Committed data: 0, Calculation results: 0, Rule set assignments: 0 |
| PG-05 | Sabor Grupo data intact | PASS | 64 entities, 0 results |
| PG-06 | Pipeline Test Co / Caribe Financial | N/A | Not seeded in this environment |
| PG-07 | Build clean (npm run build exits 0) | PASS | OB-151 PR #168 build verified |

### Scripts Created
- `web/scripts/hf088-diagnostic.ts` — read-only state inspection (reusable)
- `web/scripts/hf088-cleanup.ts` — one-time destructive cleanup

### What Changed
- Database only. No application code modified.
- Deleted 1 VL Admin tenant profile (id: `7b6c1f74-f769-425b-abf9-5aa7cb98c9d8`, tenant: optica-luminar)
- Deleted 0 Optica rule_set_assignments
- Deleted 2 Optica rule_sets (duplicate "Optometrist Incentive Plan", same contentUnitId, 1 min apart)

### FK Lesson Learned
Initial cleanup script tried to delete profiles before rule_sets. Failed with
`rule_sets_created_by_fkey` FK constraint. Fixed by reversing order:
assignments -> rule_sets -> profiles.
