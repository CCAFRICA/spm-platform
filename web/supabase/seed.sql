-- ============================================================
-- OB-42 Phase 12A: Demo Seed Data
-- Populates all 23 tables for verification and demo.
-- Auth users already exist — only application data below.
--
-- Auth user UUIDs (pre-created):
--   platform@vialuce.com: 5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3
--   sofia@retailco.mx:    ed625206-4242-41b4-b840-36db450a29e9
--   diego@retailco.mx:    03220411-2f1f-4edf-b214-0f097e65208d
--
-- Deterministic UUIDs for easy cross-referencing:
--   Tenant:      a0000000-0000-0000-0000-000000000001
--   Profiles:    c0000000-0000-0000-0000-00000000000[1-3]
--   Entities:    d0000000-0000-0000-0000-0000000000[01-13]
--   Rule set:    e0000000-0000-0000-0000-000000000001
--   Periods:     f0000000-0000-0000-0000-00000000000[1-3]
--   Import:      10000000-0000-0000-0000-000000000001
--   Calc batch:  20000000-0000-0000-0000-000000000001
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────
-- 1. TENANT
-- Domain-agnostic labels: hierarchy and entity types are configurable
-- ──────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, settings, hierarchy_labels, entity_type_labels, features, locale, currency)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'RetailCo MX',
  'retailco-mx',
  '{"timezone": "America/Mexico_City", "fiscalYearStart": "01-01"}',
  '{"level_1": "Región", "level_2": "Zona", "level_3": "Sucursal"}',
  '{"individual": "Asociado", "location": "Sucursal", "team": "Equipo", "organization": "Región"}',
  '{"financial": true, "disputes": true, "reconciliation": true, "sandbox": true}',
  'es-MX',
  'MXN'
);

-- ──────────────────────────────────────────────
-- 2. PROFILES (3 users with different capabilities)
-- ──────────────────────────────────────────────

-- VL Platform Admin — full platform scope
INSERT INTO profiles (id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3',
  'VL Platform Admin',
  'platform@vialuce.com',
  'admin',
  '["view_outcomes","approve_outcomes","export_results","manage_rule_sets","manage_assignments","design_scenarios","import_data","view_audit","manage_tenants","manage_profiles"]',
  'en'
);

-- Sofia Chen — tenant admin
INSERT INTO profiles (id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'ed625206-4242-41b4-b840-36db450a29e9',
  'Sofia Chen',
  'sofia@retailco.mx',
  'admin',
  '["view_outcomes","approve_outcomes","export_results","manage_rule_sets","manage_assignments","design_scenarios","import_data","view_audit","manage_profiles"]',
  'es-MX'
);

-- Diego Moctezuma — team scope with entity link
INSERT INTO profiles (id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale)
VALUES (
  'c0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  '03220411-2f1f-4edf-b214-0f097e65208d',
  'Diego Moctezuma',
  'diego@retailco.mx',
  'viewer',
  '["view_outcomes","export_results"]',
  'es-MX'
);

-- ──────────────────────────────────────────────
-- 3. ENTITIES (10 individuals + 2 locations + 1 organization = 13)
-- ──────────────────────────────────────────────

-- Organization: Central Region
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, temporal_attributes, metadata)
VALUES (
  'd0000000-0000-0000-0000-000000000013',
  'a0000000-0000-0000-0000-000000000001',
  'organization', 'active', 'ORG-CENTRAL',
  'Región Central',
  '[{"key": "head_count", "value": 10, "effective_from": "2024-01-01"}]',
  '{"region_code": "CDMX"}'
);

-- Location: Polanco Store
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, temporal_attributes, metadata)
VALUES (
  'd0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'location', 'active', 'LOC-POLANCO',
  'Sucursal Polanco',
  '[{"key": "square_meters", "value": 450, "effective_from": "2024-01-01"}]',
  '{"address": "Av. Presidente Masaryk 390, Polanco"}'
);

-- Location: Santa Fe Store
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, temporal_attributes, metadata)
VALUES (
  'd0000000-0000-0000-0000-000000000012',
  'a0000000-0000-0000-0000-000000000001',
  'location', 'active', 'LOC-SANTAFE',
  'Sucursal Santa Fe',
  '[{"key": "square_meters", "value": 380, "effective_from": "2024-01-01"}]',
  '{"address": "Centro Comercial Santa Fe, Cuajimalpa"}'
);

-- Individual 1: Sofia Chen — linked to profile
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, profile_id, temporal_attributes, metadata)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'individual', 'active', 'EMP-001',
  'Sofia Chen',
  'c0000000-0000-0000-0000-000000000002',
  '[{"key": "base_salary", "value": 45000, "effective_from": "2024-01-01", "effective_to": null}]',
  '{"hire_date": "2021-03-15"}'
);

-- Individual 2: Diego Moctezuma — linked to profile, team lead
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, profile_id, temporal_attributes, metadata)
VALUES (
  'd0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'individual', 'active', 'EMP-002',
  'Diego Moctezuma',
  'c0000000-0000-0000-0000-000000000003',
  '[{"key": "base_salary", "value": 38000, "effective_from": "2024-01-01"}]',
  '{"hire_date": "2022-06-01"}'
);

-- Individuals 3-10: Team members
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, temporal_attributes, metadata) VALUES
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-003', 'María López',
   '[{"key": "base_salary", "value": 28000, "effective_from": "2024-01-01"}]', '{"hire_date": "2023-01-10"}'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-004', 'Carlos García',
   '[{"key": "base_salary", "value": 30000, "effective_from": "2024-01-01"}]', '{"hire_date": "2022-09-15"}'),
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-005', 'Ana Martínez',
   '[{"key": "base_salary", "value": 27000, "effective_from": "2024-01-01"}]', '{"hire_date": "2023-04-01"}'),
  ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-006', 'Roberto Silva',
   '[{"key": "base_salary", "value": 32000, "effective_from": "2024-01-01"}]', '{"hire_date": "2021-11-20"}'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-007', 'Laura Torres',
   '[{"key": "base_salary", "value": 26000, "effective_from": "2024-01-01"}]', '{"hire_date": "2023-07-15"}'),
  ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-008', 'Pedro Hernández',
   '[{"key": "base_salary", "value": 29000, "effective_from": "2024-01-01"}]', '{"hire_date": "2022-02-28"}'),
  ('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-009', 'Isabella Ramírez',
   '[{"key": "base_salary", "value": 31000, "effective_from": "2024-01-01"}]', '{"hire_date": "2022-05-10"}'),
  ('d0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'individual', 'active', 'EMP-010', 'Javier Morales',
   '[{"key": "base_salary", "value": 25000, "effective_from": "2024-01-01"}]', '{"hire_date": "2023-10-01"}');

-- ──────────────────────────────────────────────
-- 4. ENTITY RELATIONSHIPS
-- Reporting chain, works_at, member_of
-- ──────────────────────────────────────────────

-- Organization contains locations
INSERT INTO entity_relationships (tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000011', 'contains', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000012', 'contains', 'imported_explicit', 1.0, '2024-01-01');

-- Sofia manages Diego (reporting chain)
INSERT INTO entity_relationships (tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'manages', 'imported_explicit', 1.0, '2024-01-01');

-- Diego manages team members (3-7 at Polanco, 8-10 at Santa Fe)
INSERT INTO entity_relationships (tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000005', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000006', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000007', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000008', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000009', 'manages', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000010', 'manages', 'imported_explicit', 1.0, '2024-01-01');

-- Individuals work at locations (Polanco: 1-2, 3-7; Santa Fe: 8-10)
INSERT INTO entity_relationships (tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000011', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000012', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000012', 'works_at', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000012', 'works_at', 'imported_explicit', 1.0, '2024-01-01');

-- Individuals are members of the organization
INSERT INTO entity_relationships (tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013', 'member_of', 'imported_explicit', 1.0, '2024-01-01'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000013', 'member_of', 'imported_explicit', 1.0, '2024-01-01');

-- ──────────────────────────────────────────────
-- 5. RULE SET (5-layer JSONB decomposition)
-- RetailCo-style additive lookup plan
-- ──────────────────────────────────────────────
INSERT INTO rule_sets (id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, components, cadence_config, outcome_config, metadata, created_by, approved_by)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Plan de Comisiones RetailCo 2024',
  'Plan de incentivos para asociados de venta',
  'active',
  1,
  '2024-01-01',
  '2024-12-31',
  '{"entity_types": ["individual"], "filters": [{"field": "status", "operator": "equals", "value": "active"}], "scope": "tenant"}',
  '{"optical_sales": {"source": "committed_data", "data_type": "optical_sales", "aggregation": "sum"}, "store_sales": {"source": "committed_data", "data_type": "store_sales", "aggregation": "sum"}, "services_revenue": {"source": "committed_data", "data_type": "services", "aggregation": "sum"}, "insurance_premium": {"source": "committed_data", "data_type": "insurance", "aggregation": "sum"}, "collection_rate": {"source": "committed_data", "data_type": "collections", "aggregation": "ratio"}}',
  '[{"id": "optical", "name": "Ventas Opticas", "order": 1, "enabled": true, "component_type": "matrix_lookup", "measurement_level": "individual", "config": {"row_metric": "optical_attainment", "column_metric": "optical_units", "row_bands": [{"min": 0, "max": 0.7, "label": "<70%"}, {"min": 0.7, "max": 0.9, "label": "70-90%"}, {"min": 0.9, "max": 1.1, "label": "90-110%"}, {"min": 1.1, "max": 999, "label": ">110%"}], "column_bands": [{"min": 0, "max": 50, "label": "0-50"}, {"min": 50, "max": 100, "label": "50-100"}, {"min": 100, "max": 999, "label": "100+"}], "values": [[0, 500, 800], [800, 1200, 1800], [1500, 2200, 3000], [2500, 3500, 5000]], "currency": "MXN"}}, {"id": "store_sales", "name": "Ventas Sucursal", "order": 2, "enabled": true, "component_type": "tier_lookup", "measurement_level": "store", "config": {"metric": "store_sales_total", "tiers": [{"min": 0, "max": 500000, "label": "<500K", "value": 0}, {"min": 500000, "max": 800000, "label": "500K-800K", "value": 1500}, {"min": 800000, "max": 1200000, "label": "800K-1.2M", "value": 3000}, {"min": 1200000, "max": 999999999, "label": ">1.2M", "value": 5000}], "currency": "MXN"}}, {"id": "services", "name": "Servicios", "order": 3, "enabled": true, "component_type": "percentage", "measurement_level": "individual", "config": {"rate": 0.04, "applied_to": "services_revenue", "min_threshold": 5000}}, {"id": "insurance", "name": "Seguros", "order": 4, "enabled": true, "component_type": "conditional_percentage", "measurement_level": "individual", "config": {"applied_to": "insurance_premium", "conditions": [{"metric": "collection_rate", "min": 0, "max": 0.7, "rate": 0.02, "label": "<70%"}, {"metric": "collection_rate", "min": 0.7, "max": 0.9, "rate": 0.04, "label": "70-90%"}, {"metric": "collection_rate", "min": 0.9, "max": 1.0, "rate": 0.06, "label": ">90%"}]}}]',
  '{"period_type": "monthly", "payment_lag_days": 15, "prorate_partial_months": true, "retroactive_periods": 0}',
  '{"currency": "MXN", "min_payout": 0, "max_payout": 50000, "rounding": "nearest_cent", "tax_treatment": "supplemental"}',
  '{"plan_type": "additive_lookup", "legacy_plan_id": "plan-retailco-2024"}',
  'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000001'
);

-- ──────────────────────────────────────────────
-- 6. RULE SET ASSIGNMENTS
-- All 10 individuals assigned to the rule set
-- ──────────────────────────────────────────────
INSERT INTO rule_set_assignments (tenant_id, rule_set_id, entity_id, effective_from, effective_to, assignment_type) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', '2024-01-01', '2024-12-31', 'direct'),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', '2024-01-01', '2024-12-31', 'direct');

-- ──────────────────────────────────────────────
-- 7. PERIODS (2024-01 through 2024-03)
-- ──────────────────────────────────────────────
INSERT INTO periods (id, tenant_id, label, period_type, status, start_date, end_date, canonical_key) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Enero 2024',  'monthly', 'closed', '2024-01-01', '2024-01-31', '2024-01'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Febrero 2024','monthly', 'closed', '2024-02-01', '2024-02-29', '2024-02'),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Marzo 2024',  'monthly', 'open',   '2024-03-01', '2024-03-31', '2024-03');

-- ──────────────────────────────────────────────
-- 8. IMPORT BATCH
-- ──────────────────────────────────────────────
INSERT INTO import_batches (id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by, completed_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'retailco_jan_2024.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  100,
  'completed',
  '{"errors": 0, "warnings": 2}',
  'c0000000-0000-0000-0000-000000000002',
  now()
);

-- ──────────────────────────────────────────────
-- 9. COMMITTED DATA (sales data for Jan 2024, 10 entities)
-- ──────────────────────────────────────────────
INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, period_id, data_type, row_data, metadata) VALUES
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 85, "revenue": 425000, "goal": 400000, "attainment": 1.0625}', '{"source_row": 1}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 52000}', '{"source_row": 1}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'insurance',
   '{"premium": 180000, "collection_rate": 0.92}', '{"source_row": 1}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 72, "revenue": 360000, "goal": 350000, "attainment": 1.0286}', '{"source_row": 2}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 38000}', '{"source_row": 2}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'insurance',
   '{"premium": 150000, "collection_rate": 0.85}', '{"source_row": 2}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 45, "revenue": 225000, "goal": 300000, "attainment": 0.75}', '{"source_row": 3}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 22000}', '{"source_row": 3}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 110, "revenue": 550000, "goal": 400000, "attainment": 1.375}', '{"source_row": 4}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 65000}', '{"source_row": 4}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'insurance',
   '{"premium": 220000, "collection_rate": 0.95}', '{"source_row": 4}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 58, "revenue": 290000, "goal": 320000, "attainment": 0.9063}', '{"source_row": 5}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 31000}', '{"source_row": 5}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 95, "revenue": 475000, "goal": 420000, "attainment": 1.131}', '{"source_row": 6}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 48000}', '{"source_row": 6}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001', 'insurance',
   '{"premium": 195000, "collection_rate": 0.78}', '{"source_row": 6}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 35, "revenue": 175000, "goal": 280000, "attainment": 0.625}', '{"source_row": 7}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 15000}', '{"source_row": 7}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 78, "revenue": 390000, "goal": 380000, "attainment": 1.0263}', '{"source_row": 8}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 42000}', '{"source_row": 8}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 92, "revenue": 460000, "goal": 400000, "attainment": 1.15}', '{"source_row": 9}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 55000}', '{"source_row": 9}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001', 'insurance',
   '{"premium": 200000, "collection_rate": 0.88}', '{"source_row": 9}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000001', 'optical_sales',
   '{"units": 42, "revenue": 210000, "goal": 300000, "attainment": 0.7}', '{"source_row": 10}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000001', 'services',
   '{"revenue": 18000}', '{"source_row": 10}');

-- Store-level sales data (Polanco and Santa Fe)
INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, period_id, data_type, row_data, metadata) VALUES
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000001', 'store_sales',
   '{"total": 1150000, "goal": 1000000}', '{"location": "polanco"}'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000001', 'store_sales',
   '{"total": 890000, "goal": 900000}', '{"location": "santa_fe"}');

-- ──────────────────────────────────────────────
-- 10. CALCULATION BATCH (Jan 2024 — APPROVED state)
-- ──────────────────────────────────────────────
INSERT INTO calculation_batches (id, tenant_id, period_id, rule_set_id, batch_type, lifecycle_state, entity_count, summary, config, started_at, completed_at, created_by)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'standard',
  'APPROVED',
  10,
  '{"total_payout": 127640, "avg_payout": 12764, "currency": "MXN"}',
  '{"rule_set_version": 1, "include_components": ["optical", "store_sales", "services", "insurance"]}',
  now() - interval '2 hours',
  now() - interval '1 hour',
  'c0000000-0000-0000-0000-000000000002'
);

-- ──────────────────────────────────────────────
-- 11. CALCULATION RESULTS (10 entities for Jan 2024)
-- ──────────────────────────────────────────────
INSERT INTO calculation_results (id, tenant_id, batch_id, entity_id, rule_set_id, period_id, total_payout, components, metrics, attainment, metadata) VALUES
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   20080.00,
   '[{"id":"optical","name":"Ventas Opticas","value":2200},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":2080},{"id":"insurance","name":"Seguros","value":10800}]',
   '{"optical_units": 85, "optical_revenue": 425000, "services_revenue": 52000, "insurance_premium": 180000, "collection_rate": 0.92, "store_sales_total": 1150000}',
   '{"optical": 1.0625, "overall": 1.05}', '{}'),
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   14720.00,
   '[{"id":"optical","name":"Ventas Opticas","value":2200},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":1520},{"id":"insurance","name":"Seguros","value":6000}]',
   '{"optical_units": 72, "optical_revenue": 360000, "services_revenue": 38000, "insurance_premium": 150000, "collection_rate": 0.85, "store_sales_total": 1150000}',
   '{"optical": 1.0286, "overall": 0.98}', '{}'),
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   6680.00,
   '[{"id":"optical","name":"Ventas Opticas","value":800},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":880}]',
   '{"optical_units": 45, "optical_revenue": 225000, "services_revenue": 22000, "store_sales_total": 1150000}',
   '{"optical": 0.75, "overall": 0.72}', '{}'),
  ('30000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   25800.00,
   '[{"id":"optical","name":"Ventas Opticas","value":5000},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":2600},{"id":"insurance","name":"Seguros","value":13200}]',
   '{"optical_units": 110, "optical_revenue": 550000, "services_revenue": 65000, "insurance_premium": 220000, "collection_rate": 0.95, "store_sales_total": 1150000}',
   '{"optical": 1.375, "overall": 1.28}', '{}'),
  ('30000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   8440.00,
   '[{"id":"optical","name":"Ventas Opticas","value":2200},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":1240}]',
   '{"optical_units": 58, "optical_revenue": 290000, "services_revenue": 31000, "store_sales_total": 1150000}',
   '{"optical": 0.9063, "overall": 0.88}', '{}'),
  ('30000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   18220.00,
   '[{"id":"optical","name":"Ventas Opticas","value":3500},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":1920},{"id":"insurance","name":"Seguros","value":7800}]',
   '{"optical_units": 95, "optical_revenue": 475000, "services_revenue": 48000, "insurance_premium": 195000, "collection_rate": 0.78, "store_sales_total": 1150000}',
   '{"optical": 1.131, "overall": 1.08}', '{}'),
  ('30000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   5600.00,
   '[{"id":"optical","name":"Ventas Opticas","value":0},{"id":"store_sales","name":"Ventas Sucursal","value":5000},{"id":"services","name":"Servicios","value":600}]',
   '{"optical_units": 35, "optical_revenue": 175000, "services_revenue": 15000, "store_sales_total": 1150000}',
   '{"optical": 0.625, "overall": 0.58}', '{}'),
  ('30000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   6880.00,
   '[{"id":"optical","name":"Ventas Opticas","value":2200},{"id":"store_sales","name":"Ventas Sucursal","value":3000},{"id":"services","name":"Servicios","value":1680}]',
   '{"optical_units": 78, "optical_revenue": 390000, "services_revenue": 42000, "store_sales_total": 890000}',
   '{"optical": 1.0263, "overall": 0.95}', '{}'),
  ('30000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   16700.00,
   '[{"id":"optical","name":"Ventas Opticas","value":3500},{"id":"store_sales","name":"Ventas Sucursal","value":3000},{"id":"services","name":"Servicios","value":2200},{"id":"insurance","name":"Seguros","value":8000}]',
   '{"optical_units": 92, "optical_revenue": 460000, "services_revenue": 55000, "insurance_premium": 200000, "collection_rate": 0.88, "store_sales_total": 890000}',
   '{"optical": 1.15, "overall": 1.10}', '{}'),
  ('30000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   4520.00,
   '[{"id":"optical","name":"Ventas Opticas","value":800},{"id":"store_sales","name":"Ventas Sucursal","value":3000},{"id":"services","name":"Servicios","value":720}]',
   '{"optical_units": 42, "optical_revenue": 210000, "services_revenue": 18000, "store_sales_total": 890000}',
   '{"optical": 0.7, "overall": 0.65}', '{}');

-- ──────────────────────────────────────────────
-- 12. CALCULATION TRACES (sample for first 2 entities)
-- ──────────────────────────────────────────────
INSERT INTO calculation_traces (tenant_id, result_id, component_name, formula, inputs, output, steps) VALUES
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Ventas Opticas',
   'matrix_lookup(attainment=1.0625, units=85)',
   '{"attainment": 1.0625, "units": 85, "goal": 400000, "revenue": 425000}',
   '{"value": 2200, "row_band": "90-110%", "col_band": "50-100"}',
   '[{"step": "resolve_row", "band": "90-110%", "index": 2}, {"step": "resolve_col", "band": "50-100", "index": 1}, {"step": "lookup", "value": 2200}]'),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Ventas Sucursal',
   'tier_lookup(store_total=1150000)',
   '{"store_sales_total": 1150000}',
   '{"value": 5000, "tier": ">1.2M"}',
   '[{"step": "resolve_tier", "tier": ">1.2M", "index": 3}, {"step": "lookup", "value": 5000}]'),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Ventas Opticas',
   'matrix_lookup(attainment=1.0286, units=72)',
   '{"attainment": 1.0286, "units": 72, "goal": 350000, "revenue": 360000}',
   '{"value": 2200, "row_band": "90-110%", "col_band": "50-100"}',
   '[{"step": "resolve_row", "band": "90-110%", "index": 2}, {"step": "resolve_col", "band": "50-100", "index": 1}, {"step": "lookup", "value": 2200}]');

-- ──────────────────────────────────────────────
-- 13. DISPUTES (1 sample dispute)
-- ──────────────────────────────────────────────
INSERT INTO disputes (tenant_id, entity_id, period_id, batch_id, status, category, description, amount_disputed, filed_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000007',
  'f0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'open',
  'missing_data',
  'Insurance data not included in January calculation. Sold 3 policies totaling $120,000 premium.',
  4800.00,
  'c0000000-0000-0000-0000-000000000003'
);

-- ──────────────────────────────────────────────
-- 14. RECONCILIATION SESSION
-- ──────────────────────────────────────────────
INSERT INTO reconciliation_sessions (tenant_id, period_id, batch_id, status, config, results, summary, created_by, completed_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'completed',
  '{"comparison_type": "full", "tolerance": 0.01}',
  '{"matched": 9, "mismatched": 1, "missing": 0}',
  '{"total_entities": 10, "pass_rate": 0.9, "largest_variance": 4800}',
  'c0000000-0000-0000-0000-000000000002',
  now() - interval '30 minutes'
);

-- ──────────────────────────────────────────────
-- 15. CLASSIFICATION SIGNALS
-- ──────────────────────────────────────────────
INSERT INTO classification_signals (tenant_id, entity_id, signal_type, signal_value, confidence, source, context) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'role_inference',
   '{"inferred_role": "senior_associate", "evidence": "high_tenure_and_performance"}',
   0.8500, 'ai_classifier', '{"model_version": "v2", "training_data_period": "2023-Q4"}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011', 'performance_tier',
   '{"tier": "high", "metric": "revenue_per_sqm"}',
   0.9200, 'ai_classifier', '{"comparison_period": "2024-01"}');

-- ──────────────────────────────────────────────
-- 16. AUDIT LOGS
-- ──────────────────────────────────────────────
INSERT INTO audit_logs (tenant_id, profile_id, action, resource_type, resource_id, changes, metadata) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'create', 'calculation_batch', '20000000-0000-0000-0000-000000000001',
   '{"lifecycle_state": {"from": null, "to": "DRAFT"}}', '{"trigger": "manual"}'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'transition', 'calculation_batch', '20000000-0000-0000-0000-000000000001',
   '{"lifecycle_state": {"from": "DRAFT", "to": "PREVIEW"}}', '{"trigger": "manual"}'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'transition', 'calculation_batch', '20000000-0000-0000-0000-000000000001',
   '{"lifecycle_state": {"from": "OFFICIAL", "to": "APPROVED"}}', '{"trigger": "approval_workflow"}'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'import', 'import_batch', '10000000-0000-0000-0000-000000000001',
   '{"status": {"from": "pending", "to": "completed"}, "row_count": 100}', '{"file": "retailco_jan_2024.xlsx"}');

-- ──────────────────────────────────────────────
-- 17. INGESTION CONFIG
-- ──────────────────────────────────────────────
INSERT INTO ingestion_configs (tenant_id, name, source_type, config, mapping, schedule, is_active, created_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'RetailCo Monthly Import',
  'file_upload',
  '{"accepted_types": ["xlsx", "csv"], "max_file_size_mb": 50}',
  '{"sheets": {"optical_sales": {"entity_key": "external_id", "metrics": ["units", "revenue", "goal"]}, "store_sales": {"entity_key": "location_id", "metrics": ["total"]}}}',
  '{"frequency": "monthly", "day_of_month": 5}',
  true,
  'c0000000-0000-0000-0000-000000000002'
);

-- ──────────────────────────────────────────────
-- 18. INGESTION EVENT
-- ──────────────────────────────────────────────
INSERT INTO ingestion_events (tenant_id, config_id, status, records_processed, records_failed, error_log, started_at, completed_at)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  ic.id,
  'completed',
  100,
  0,
  '[]',
  now() - interval '3 hours',
  now() - interval '2 hours 55 minutes'
FROM ingestion_configs ic
WHERE ic.tenant_id = 'a0000000-0000-0000-0000-000000000001'
LIMIT 1;

-- ──────────────────────────────────────────────
-- 19. USAGE METERING
-- ──────────────────────────────────────────────
INSERT INTO usage_metering (tenant_id, metric_name, metric_value, period_key, dimensions) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'entities_count', 13, '2024-01', '{"entity_types": {"individual": 10, "location": 2, "organization": 1}}'),
  ('a0000000-0000-0000-0000-000000000001', 'calculations_run', 1, '2024-01', '{"batch_count": 1, "result_count": 10}'),
  ('a0000000-0000-0000-0000-000000000001', 'storage_mb', 2.5, '2024-01', '{"committed_data_rows": 100}');

-- ──────────────────────────────────────────────
-- 20. REASSIGNMENT EVENT (sample)
-- ──────────────────────────────────────────────
INSERT INTO reassignment_events (tenant_id, entity_id, from_entity_id, to_entity_id, effective_date, credit_model, transition_window, impact_preview, reason, created_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000010',
  'd0000000-0000-0000-0000-000000000012',
  'd0000000-0000-0000-0000-000000000011',
  '2024-03-01',
  '{"model": "split", "old_pct": 0.3, "new_pct": 0.7}',
  '{"days": 30, "start": "2024-03-01", "end": "2024-03-31"}',
  '{"estimated_impact_old": -1500, "estimated_impact_new": 1500}',
  'Transfer from Santa Fe to Polanco due to staffing needs',
  'c0000000-0000-0000-0000-000000000002'
);

-- ══════════════════════════════════════════════
-- MATERIALIZATION TABLES
-- ══════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- 21. PERIOD ENTITY STATE (Jan 2024 snapshot for all 13 entities)
-- ──────────────────────────────────────────────
INSERT INTO period_entity_state (tenant_id, entity_id, period_id, resolved_attributes, resolved_relationships, entity_type, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 45000, "hire_date": "2021-03-15", "display_name": "Sofia Chen"}',
   '[{"type": "manages", "target": "d0000000-0000-0000-0000-000000000002"}, {"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]',
   'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 38000, "hire_date": "2022-06-01", "display_name": "Diego Moctezuma"}',
   '[{"type": "manages", "target": "d0000000-0000-0000-0000-000000000003"}, {"type": "manages", "target": "d0000000-0000-0000-0000-000000000004"}, {"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]',
   'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 28000, "hire_date": "2023-01-10", "display_name": "Maria Lopez"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 30000, "hire_date": "2022-09-15", "display_name": "Carlos Garcia"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 27000, "hire_date": "2023-04-01", "display_name": "Ana Martinez"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 32000, "hire_date": "2021-11-20", "display_name": "Roberto Silva"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 26000, "hire_date": "2023-07-15", "display_name": "Laura Torres"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000011"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 29000, "hire_date": "2022-02-28", "display_name": "Pedro Hernandez"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000012"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 31000, "hire_date": "2022-05-10", "display_name": "Isabella Ramirez"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000012"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000001',
   '{"base_salary": 25000, "hire_date": "2023-10-01", "display_name": "Javier Morales"}',
   '[{"type": "works_at", "target": "d0000000-0000-0000-0000-000000000012"}]', 'individual', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000001',
   '{"square_meters": 450, "address": "Av. Presidente Masaryk 390, Polanco", "display_name": "Sucursal Polanco"}',
   '[{"type": "contains", "source": "d0000000-0000-0000-0000-000000000013"}]', 'location', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000001',
   '{"square_meters": 380, "address": "Centro Comercial Santa Fe, Cuajimalpa", "display_name": "Sucursal Santa Fe"}',
   '[{"type": "contains", "source": "d0000000-0000-0000-0000-000000000013"}]', 'location', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000001',
   '{"head_count": 10, "region_code": "CDMX", "display_name": "Region Central"}',
   '[]', 'organization', 'active');

-- ──────────────────────────────────────────────
-- 22. PROFILE SCOPE (graph-derived visibility)
-- ──────────────────────────────────────────────
INSERT INTO profile_scope (tenant_id, profile_id, scope_type, visible_entity_ids, visible_rule_set_ids, visible_period_ids, metadata)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'admin_override',
   ARRAY['d0000000-0000-0000-0000-000000000001'::UUID,'d0000000-0000-0000-0000-000000000002'::UUID,'d0000000-0000-0000-0000-000000000003'::UUID,'d0000000-0000-0000-0000-000000000004'::UUID,'d0000000-0000-0000-0000-000000000005'::UUID,'d0000000-0000-0000-0000-000000000006'::UUID,'d0000000-0000-0000-0000-000000000007'::UUID,'d0000000-0000-0000-0000-000000000008'::UUID,'d0000000-0000-0000-0000-000000000009'::UUID,'d0000000-0000-0000-0000-000000000010'::UUID,'d0000000-0000-0000-0000-000000000011'::UUID,'d0000000-0000-0000-0000-000000000012'::UUID,'d0000000-0000-0000-0000-000000000013'::UUID],
   ARRAY['e0000000-0000-0000-0000-000000000001'::UUID],
   ARRAY['f0000000-0000-0000-0000-000000000001'::UUID,'f0000000-0000-0000-0000-000000000002'::UUID,'f0000000-0000-0000-0000-000000000003'::UUID],
   '{"reason": "platform_admin"}'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'admin_override',
   ARRAY['d0000000-0000-0000-0000-000000000001'::UUID,'d0000000-0000-0000-0000-000000000002'::UUID,'d0000000-0000-0000-0000-000000000003'::UUID,'d0000000-0000-0000-0000-000000000004'::UUID,'d0000000-0000-0000-0000-000000000005'::UUID,'d0000000-0000-0000-0000-000000000006'::UUID,'d0000000-0000-0000-0000-000000000007'::UUID,'d0000000-0000-0000-0000-000000000008'::UUID,'d0000000-0000-0000-0000-000000000009'::UUID,'d0000000-0000-0000-0000-000000000010'::UUID,'d0000000-0000-0000-0000-000000000011'::UUID,'d0000000-0000-0000-0000-000000000012'::UUID,'d0000000-0000-0000-0000-000000000013'::UUID],
   ARRAY['e0000000-0000-0000-0000-000000000001'::UUID],
   ARRAY['f0000000-0000-0000-0000-000000000001'::UUID,'f0000000-0000-0000-0000-000000000002'::UUID,'f0000000-0000-0000-0000-000000000003'::UUID],
   '{"reason": "tenant_admin"}'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'graph_derived',
   ARRAY['d0000000-0000-0000-0000-000000000002'::UUID,'d0000000-0000-0000-0000-000000000003'::UUID,'d0000000-0000-0000-0000-000000000004'::UUID,'d0000000-0000-0000-0000-000000000005'::UUID,'d0000000-0000-0000-0000-000000000006'::UUID,'d0000000-0000-0000-0000-000000000007'::UUID,'d0000000-0000-0000-0000-000000000008'::UUID,'d0000000-0000-0000-0000-000000000009'::UUID,'d0000000-0000-0000-0000-000000000010'::UUID],
   ARRAY['e0000000-0000-0000-0000-000000000001'::UUID],
   ARRAY['f0000000-0000-0000-0000-000000000001'::UUID,'f0000000-0000-0000-0000-000000000002'::UUID,'f0000000-0000-0000-0000-000000000003'::UUID],
   '{"derived_from": "manages_relationship", "root_entity": "d0000000-0000-0000-0000-000000000002"}');

-- ──────────────────────────────────────────────
-- 23. ENTITY PERIOD OUTCOMES (aggregated Jan 2024)
-- ──────────────────────────────────────────────
INSERT INTO entity_period_outcomes (tenant_id, entity_id, period_id, total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary, metadata) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   20080.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 20080}]',
   '[{"id":"optical","value":2200},{"id":"store_sales","value":5000},{"id":"services","value":2080},{"id":"insurance","value":10800}]',
   'APPROVED', '{"optical": 1.0625, "overall": 1.05}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001',
   14720.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 14720}]',
   '[{"id":"optical","value":2200},{"id":"store_sales","value":5000},{"id":"services","value":1520},{"id":"insurance","value":6000}]',
   'APPROVED', '{"optical": 1.0286, "overall": 0.98}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001',
   6680.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 6680}]',
   '[{"id":"optical","value":800},{"id":"store_sales","value":5000},{"id":"services","value":880}]',
   'APPROVED', '{"optical": 0.75, "overall": 0.72}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001',
   25800.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 25800}]',
   '[{"id":"optical","value":5000},{"id":"store_sales","value":5000},{"id":"services","value":2600},{"id":"insurance","value":13200}]',
   'APPROVED', '{"optical": 1.375, "overall": 1.28}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001',
   8440.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 8440}]',
   '[{"id":"optical","value":2200},{"id":"store_sales","value":5000},{"id":"services","value":1240}]',
   'APPROVED', '{"optical": 0.9063, "overall": 0.88}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001',
   18220.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 18220}]',
   '[{"id":"optical","value":3500},{"id":"store_sales","value":5000},{"id":"services","value":1920},{"id":"insurance","value":7800}]',
   'APPROVED', '{"optical": 1.131, "overall": 1.08}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000001',
   5600.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 5600}]',
   '[{"id":"optical","value":0},{"id":"store_sales","value":5000},{"id":"services","value":600}]',
   'APPROVED', '{"optical": 0.625, "overall": 0.58}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001',
   6880.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 6880}]',
   '[{"id":"optical","value":2200},{"id":"store_sales","value":3000},{"id":"services","value":1680}]',
   'APPROVED', '{"optical": 1.0263, "overall": 0.95}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000001',
   16700.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 16700}]',
   '[{"id":"optical","value":3500},{"id":"store_sales","value":3000},{"id":"services","value":2200},{"id":"insurance","value":8000}]',
   'APPROVED', '{"optical": 1.15, "overall": 1.10}', '{}'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000001',
   4520.00, '[{"rule_set_id": "e0000000-0000-0000-0000-000000000001", "payout": 4520}]',
   '[{"id":"optical","value":800},{"id":"store_sales","value":3000},{"id":"services","value":720}]',
   'APPROVED', '{"optical": 0.7, "overall": 0.65}', '{}');

COMMIT;
