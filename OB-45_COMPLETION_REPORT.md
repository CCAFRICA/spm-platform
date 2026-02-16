# OB-45 Completion Report

## Summary

Seeded full demo data for both tenants — Optica Luminar and Velocidad Deportiva — in Supabase. Both tenants have complete entity hierarchies, rule sets, committed data, calculation results, outcomes, and working auth users with DemoPersonaSwitcher support.

## Tenants

| Tenant | ID | Users |
|--------|----|-------|
| Optica Luminar | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | 3 (admin, gerente, vendedor) |
| Velocidad Deportiva | `b2c3d4e5-f6a7-8901-bcde-f12345678901` | 3 (admin, gerente, asociado) |

## Row Counts

| Table | Optica | Velocidad | Total |
|-------|--------|-----------|-------|
| entities | 22 | 35 | 57 |
| entity_relationships | 21 | 67 | 88 |
| rule_sets | 1 | 2 | 3 |
| rule_set_assignments | 12 | 36 | 48 |
| periods | 1 | 8 | 9 |
| committed_data | 18 | 156 | 174 |
| import_batches | 1 | 6 | 7 |
| calculation_batches | 1 | 8 | 9 |
| calculation_results | 12 | 108 | 120 |
| entity_period_outcomes | 12 | 36 | 48 |

## Auth Users (all verified working)

| Email | Password | Tenant | Role |
|-------|----------|--------|------|
| platform@vialuce.com | demo-password-VL1 | Platform | vl_admin |
| admin@opticaluminar.mx | demo-password-OL1 | Optica Luminar | admin |
| gerente@opticaluminar.mx | demo-password-OL2 | Optica Luminar | manager |
| vendedor@opticaluminar.mx | demo-password-OL3 | Optica Luminar | viewer |
| admin@velocidaddeportiva.mx | demo-password-VD1 | Velocidad Deportiva | admin |
| gerente@velocidaddeportiva.mx | demo-password-VD2 | Velocidad Deportiva | manager |
| asociado@velocidaddeportiva.mx | demo-password-VD3 | Velocidad Deportiva | viewer |

## Optica Luminar

### Hierarchy
- 1 organization (Optica Luminar)
- 3 zones (Centro, Norte, Sur)
- 6 stores (Polanco, Condesa, Angelopolis, Interlomas, Monterrey Centro, Merida Centro)
- 12 individuals (sales reps, certified + non-certified)

### Rule Set
- **Plan de Comisiones** — 6 components: Venta Optica (matrix), Venta Tienda (tiered), Clientes Nuevos (acquisition), Cobranza (collections), Club de Proteccion (insurance), Garantia Extendida (warranty)
- 2 variants: certificado vs no_certificado

### Period
- Enero 2024 (1 period, APPROVED lifecycle)

## Velocidad Deportiva

### Hierarchy
- 1 organization (Velocidad Deportiva)
- 3 regions (CDMX, Norte, Occidente)
- 8 stores (Polanco, Condesa, Interlomas, Monterrey, Saltillo, Guadalajara, Zapopan, Leon)
- 3 teams (Floor Sales, Online Assist, Managers)
- 20 individuals (18 associates + 2 managers)

### Rule Sets
1. **Plan de Ventas de Piso** — 4 components: Comision Base por Unidad, Bono por Logro de Meta, Bono de Racha Consecutiva, Medalla del Mes + attendance gate
2. **Plan de Asistencia Online** — 2 components: Bono por Entrega de Pedidos Online, Multiplicador de Satisfaccion + attendance gate

### Periods
- 6 monthly: Jul-Dec 2024 (Jul-Sep CLOSED, Oct-Dec APPROVED)
- 2 quarterly: Q3 2024 (CLOSED), Q4 2024 (APPROVED)

### Key Narratives
- **VD-A01 Carlos Mendoza**: 6-month Oro streak, highest earner (66,213 MXN total)
- **VD-A05 Diego Castillo**: GATED — 88% attendance, zero payout all 6 months
- **VD-A10 Lucia Gutierrez**: GATED — 85% attendance, zero payout all 6 months
- **VD-A12 Ana Martinez**: 4-month Oro streak, rising star (58,513 MXN total)
- **VD-A11 Roberto Flores**: Borderline 90% attendance, inconsistent medals

## Fixes Applied During Seed

| Fix | Description |
|-----|-------------|
| Idempotent committed_data | Added `DELETE` before `INSERT` (no unique constraint on committed_data) |
| Idempotent entity_relationships | Added `DELETE` before `INSERT` |
| batch_type constraint | Changed `quarterly_payout` → `standard` (DB only allows standard/superseding/adjustment/reversal) |
| OL demo_users | Added `demo_users` array to OL tenant settings for DemoPersonaSwitcher |

## Scripts

| Script | Purpose |
|--------|---------|
| `web/scripts/seed-optica-luminar.ts` | Seed Optica Luminar (idempotent) |
| `web/scripts/seed-velocidad-deportiva.ts` | Seed Velocidad Deportiva (idempotent) |
| `web/scripts/verify-all-seeds.ts` | CLT verification (59 gates) |

## CLT

```
═══════════════════════════════════════
  TOTAL: 59 gates
  PASSED: 59
  FAILED: 0
  SCORE: 100%
═══════════════════════════════════════
```
