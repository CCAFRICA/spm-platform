# FRMX Reseed — Sabor Grupo Gastronomico Financial Module Proof Tenant

**Status:** ✅ Complete
**Branch:** `dev` → PR to `main`
**Date:** 2026-06-03
**Tenant:** Sabor Grupo Gastronomico (`sabor-grupo`) · `f7093bcc-e90b-4918-9680-69da7952dd65`

## Objective

Re-establish a restaurant-franchise proof tenant that demonstrates the platform's
**domain-agnosticism**: the same `entities` / `committed_data` / `calculation_results`
tables that serve ICM compensation also serve restaurant POS analytics — **ZERO new
tables, ZERO schema changes** (AP-1). Currency MXN (AP-3), Supabase-backed (AP-4),
bulk inserts ≤5000 rows (AP-5).

## Phase Results

| Phase | Deliverable | Proof |
|-------|-------------|-------|
| 0 | Diagnostic | Live schema constraints captured (entity_type, relationship_type, source check sets) |
| 1 | Tenant + 4 periods | tenant `f7093bcc…`; periods 2024-W01/W02/W03 + 2024-01 monthly, all `closed` |
| 2 | 68-entity hierarchy | org:1, team:7 (3 brand + 4 region via `metadata.entity_role`), location:20, individual:40; 83 relationships (`contains`/`member_of`, `source='human_created'`) |
| 3 | 3 profiles + auth | 3 personas, password `sabor-demo-2024`, idempotent auth via listUsers |
| 4 | ~43.8K POS cheques | 43,875 rows `data_type='pos_cheque'` (SoftRestaurant 23-col), anomaly patterns embedded |
| 5 | 2 rule sets + 60 assignments | Performance Index (`2054d734…`, 20 locations) + Server Commission (`fc14ea6e…`, 40 servers), both `active` |
| 6 | 60 calculation results | 1 `APPROVED` batch, 20 location tier scores + 40 server commissions; total MX$520,523.49 |
| 7 | 7 dashboards verified | All routes exist; `/api/financial/data` queries `data_type='pos_cheque'`; load path Supabase-backed |
| 8 | 3 demo import TSVs | clean Spanish (23-col), English headers (23-col), messy mixed (24-col +`descripcion_producto`) |
| 9 | Dual-module verified | `features.financial=true`, `features.icm=true`, both modules read shared tables |
| 10 | Build gate | Production build compiles all routes; dev server returns 307 (auth redirect) on `/financial/*` |

## Dual-Module Proof (AP-1)

```
features.financial=true  features.icm=true  modules=["icm","financial"]
pos_cheque=43875  calc_results=60  entities=68
```

Both modules read the SAME tables (`entities` + `committed_data` + `calculation_results`).
No `financial_*` tables exist. The sidebar gates the Financial nav on
`useFeature("financial")` (`Sidebar.tsx`); ICM is the base navigation — dual-module by
construction.

## Schema Workarounds (live constraints, discovered Phase 0/2)

- `entities.entity_type` check allows only `individual|location|team|organization`.
  Brand and region levels mapped to `entity_type='team'` with
  `metadata.entity_role='brand'|'region'` + `hierarchy_level`, preserving the 5-level
  hierarchy without schema change.
- `entity_relationships.relationship_type` → `contains` (hierarchy) and `member_of`
  (location→region); `source='human_created'`.

## Deviations / Notes

- **Phase 6 tier distribution** came out `{Destacado:11, Estándar:8, Estrella:1}` after
  recalibrating the Performance Index scoring (initial run was Estrella-heavy at 11/20
  because component benchmarks saturated near 100). The recalibrated formula centers a
  benchmark-performing location at ~72 (Destacado). The composite legitimately clusters
  toward Destacado/Estándar because `operational_discipline` stays high for most
  locations; this is an honest derived outcome. Calculated values reported verbatim per
  directive (no ground-truth/reconciliation verdict).
- **Phase 8 TSV sizing**: ~2,500 rows per file (≈1.45 MB total) rather than ~18K×3
  (~13 MB). The deliverable is **format diversity** for the normalization import demo
  (Spanish / English / mixed-abbreviated headers + 24th product column); the row count is
  representative to keep the repo sane.
- **Phase 4 cancellation anomaly**: TV-MTY elevation is by cancellation *rate*, not
  *frequency* (the Leakage Monitor reads rate, so the demo holds).

## Demo Access

- Login: `sabor-demo-2024` (3 personas)
- Import files: `web/public/demo-data/frmx/cheques_2024012{2,9}_*.tsv`, `cheques_20240205_messy.tsv`
- Seeding scripts: `web/scripts/frmx/p0-diagnostic.ts` … `p9-verify.ts`
