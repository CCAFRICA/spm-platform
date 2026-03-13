# OB-167 Phase 0: Entity Trace — Valentina Salazar Through Every Table

## Step 0A: Entity
```sql
SELECT id, external_id, display_name, entity_type, status, metadata
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND display_name ILIKE '%valentina%salazar%';
```
**Result:**
- ID: `62850d63-2801-47d3-9a05-92560c08fca5`
- External ID: `BCL-5012`
- Display Name: `Valentina Salazar Mendieta`
- entity_type: individual, status: active
- metadata: `{}` (empty)

## Step 0B: committed_data
```sql
SELECT data_type, source_date, row_data, import_batch_id
FROM committed_data WHERE entity_id = '62850d63-...' ORDER BY data_type;
```
**2 rows:**

| data_type | source_date | batch | key fields |
|-----------|------------|-------|------------|
| datos | 2025-10-01 | d3c63265... | Cumplimiento_Colocacion=**0.65**, Indice_Calidad_Cartera=**0.8109**, Pct_Meta_Depositos=**0.55**, Cantidad_Productos_Cruzados=**1**, Infracciones_Regulatorias=**0**, Monto_Colocacion=78000, Meta_Colocacion=120000 |
| personal | null | 14a82287... | Cargo="Oficial de Credito", Nivel_Cargo=**"Ejecutivo"**, Sucursal_ID="BCL-GYE-001" |

**Critical observation:** All percentage metrics stored as DECIMALS (0.65, 0.8109, 0.55), not as percentages (65, 81.09, 55).

## Step 0C: calculation_results
```sql
SELECT total_payout, components FROM calculation_results WHERE entity_id = '62850d63-...';
```
**total_payout: $112** (GT: $945)

| Component | Payout | Engine Input | Band Matched |
|-----------|--------|-------------|--------------|
| C1 Colocacion de Credito (matrix) | **$0** | row=65, col=0.8109 | Bajo(0-70), Riesgo(0-90) → matrix[0][0]=0 |
| C2 Captacion de Depositos (tier) | **$0** | metric=0.55 | Sin comision(0-60) → $0 |
| C3 Productos Cruzados (pct) | **$12** | rate=12, base=1 | 12×1=12 |
| C4 Cumplimiento Regulatorio (cond) | **$100** | infracciones=0 | 0 infractions → $100 |

**Key finding:** Cumplimiento_Colocacion (0.65) WAS normalized to 65 (inferSemanticType='attainment' via /cumplimiento/). But Indice_Calidad_Cartera (0.8109) was NOT (inferSemanticType='unknown'). And Pct_Meta_Depositos (0.55) was NOT (inferSemanticType='goal' via /meta/).

## Step 0E: rule_set_assignments
```sql
SELECT rule_set_id, assignment_type FROM rule_set_assignments WHERE entity_id = '62850d63-...';
```
**1 assignment:** rule_set `b1c20001-aaaa-bbbb-cccc-222222222222`, type=direct. Assignment exists (HF-126 self-healing worked).

## Step 0F: rule_sets (convergence bindings)
**Plan: "Plan de Comisiones BCL 2025"**, 2 variants:
- Variant 0: "Ejecutivo Senior" (13 entities) — higher rates
- Variant 1: "Ejecutivo" (72 entities) — standard rates

**convergence_bindings:**
```json
{
  "component_0": {"row": {"column": "Cumplimiento_Colocacion", "source": "committed_data"}, "column": {"column": "Indice_Calidad_Cartera", "source": "committed_data"}},
  "component_1": {"actual": {"column": "Pct_Meta_Depositos", "source": "committed_data"}},
  "component_2": {"actual": {"column": "Cantidad_Productos_Cruzados", "source": "committed_data"}},
  "component_3": {"actual": {"column": "Infracciones_Regulatorias", "source": "committed_data"}}
}
```
**Critical finding:** Bindings have `source: "committed_data"` but NO `source_batch_id`. The engine's convergence resolver requires `source_batch_id` → returns null → falls to sheet-matching fallback.

## Step 0G: import_batches
```sql
SELECT id, file_name, metadata, status FROM import_batches WHERE tenant_id = 'b1c2d3e4-...' ORDER BY created_at DESC;
```
**2 batches:**
| batch | file | metadata |
|-------|------|----------|
| 14a82287... | sci-execute-... | `{source:"sci", proposalId:..., contentUnitId:"Personal"}` |
| d3c63265... | sci-execute-... | `{source:"sci", proposalId:..., contentUnitId:"Datos"}` |

**Neither batch has `ai_context` in metadata.** Engine logs: "No AI context found in import_batches — using fallback name matching."

## Step 0H: Entity metadata
```sql
SELECT metadata, temporal_attributes FROM entities WHERE display_name ILIKE '%valentina%salazar%';
```
- metadata: `{}` (empty)
- temporal_attributes: `[]` (empty)

No variant discriminant data stored in entity metadata. Variant routing uses committed_data string values.

## Cross-Entity Diagnostics

### Nivel_Cargo distribution
| Nivel | Count |
|-------|-------|
| Ejecutivo Senior | 13 |
| Ejecutivo | 72 |

### Variant routing verification
Engine componentIds confirm: 13 entities → senior variant, 72 entities → standard variant. **Routing is CORRECT.**

### Metric value distributions (all 85 entities)
| Metric | Min | Max | Avg | Scale |
|--------|-----|-----|-----|-------|
| Cumplimiento_Colocacion | 0.50 | 1.303 | 0.835 | decimal (0-1.3) |
| Indice_Calidad_Cartera | 0.714 | 0.982 | 0.859 | decimal (0-1) |
| Pct_Meta_Depositos | 0.319 | 1.282 | 0.755 | decimal (0-1.3) |
| Cantidad_Productos_Cruzados | 1 | 10 | 5.09 | count |
| Infracciones_Regulatorias | 0 | 3 | 0.15 | count |

### C2 Total: $0 across ALL 85 entities
Pct_Meta_Depositos values (0.32-1.28) all fall below the first tier threshold (60). ALL entities get "Sin comision" = $0.

If normalized (×100): 19 entities <60, 33 in 60-80, 24 in 80-100, 9 ≥100. **Projected C2 total: $10,625.**

### C1 Column band: ALL entities in "Riesgo"
Indice_Calidad_Cartera values (0.71-0.98) all fall below 90 → always col 0 (Riesgo).

If normalized (×100): 74 entities in 80-90 (Riesgo), 11 in 90-95 (Aceptable), 0 in >95 (Excelente). **Projected additional C1: $2,625.**

### Component payout summary (current engine)
| Component | Total | Non-zero | Zeros |
|-----------|-------|----------|-------|
| C1 Colocacion | $7,100 | 70/85 | 15 |
| C2 Depositos | **$0** | **0/85** | **85** |
| C3 Productos | $5,784 | 85/85 | 0 |
| C4 Regulatorio | $7,950 | 74/85 | 11 |
| **Grand Total** | **$20,834** | | |

### Normalization impact simulation
| Fix | Current | Normalized | Delta |
|-----|---------|-----------|-------|
| C2 Pct_Meta_Depositos ×100 | $0 | $10,625 | +$10,625 |
| C1 Indice_Calidad_Cartera ×100 | $7,100 | $9,875 | +$2,625* |
| **Projected total** | **$20,834** | **$34,084** | **+$13,250** |

*C1 delta is partial — only affects entities with calidad >0.90 (normalized >90%).

### Remaining gap: $48,314 - $34,084 = $14,230
GT anchor analysis shows C3 GT rates (120/product, 24/product, 27/product) don't match plan rates (12 standard, 18 senior). The GT may have been computed from a different plan specification or data set. Further investigation needed after normalization fix.
