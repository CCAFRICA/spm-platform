# OB-95 Phase 0: Financial Agent Diagnostic

## Existing Financial Pages (5)

| Route | File | Data Source |
|-------|------|-------------|
| `/financial` | `web/src/app/financial/page.tsx` | Seed data (hardcoded) + FRMX provisioner |
| `/financial/leakage` | `web/src/app/financial/leakage/page.tsx` | Seed data (hardcoded) |
| `/financial/performance` | `web/src/app/financial/performance/page.tsx` | Seed data (hardcoded) |
| `/financial/staff` | `web/src/app/financial/staff/page.tsx` | Seed data (hardcoded) |
| `/financial/timeline` | `web/src/app/financial/timeline/page.tsx` | Seed data (hardcoded) |

## Existing Financial Services (7 files)

| File | State |
|------|-------|
| `web/src/lib/financial/financial-service.ts` | Storage helpers are no-ops (OB-43A) |
| `web/src/lib/financial/cheque-import-service.ts` | Storage no-ops, parser works |
| `web/src/lib/financial/entity-service.ts` | Storage no-ops |
| `web/src/lib/financial/types.ts` | 443 lines, comprehensive types |
| `web/src/lib/financial/financial-constants.ts` | Constants, column defs, validation |
| `web/src/lib/financial/cheque-parser.ts` | TSV parser |
| `web/src/lib/financial/articulos-parser.ts` | Item-level parser |

## Key Findings

1. **localStorage removed in OB-43A** — all storage helpers are no-ops returning empty
2. **No Supabase integration** — zero references to createClient or committed_data
3. **All pages render hardcoded seed data** — not live database data
4. **Financial workspace registered** — in role-workspaces.ts for vl_admin/admin/manager
5. **workspace-config.ts has financial sections** — Network, Analysis, Controls
6. **Feature flag pattern exists** — workspace featureFlag: 'financial' in workspace-config
7. **FRMX demo provisioner** — `web/src/lib/demo/frmx-demo-provisioner.ts` generates localStorage demo data

## Migration Strategy

Replace all hardcoded seed data in 5 pages with a Supabase-backed `financial-data-service.ts` that queries `committed_data WHERE data_type='pos_cheque'` + `entities`. The existing types and constants remain useful. The FRMX provisioner becomes unnecessary once real Supabase seed data exists.

## Existing Seed Scripts

- `web/scripts/seed-optica-luminar.ts`
- `web/scripts/seed-velocidad-deportiva.ts`
- `web/scripts/seed-test-pipeline.ts`

These follow the pattern: Supabase service-role client, bulk inserts, batch ≤5000 rows.
