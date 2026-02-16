#!/usr/bin/env npx tsx
/**
 * Seed script: Optica Luminar Demo Tenant
 *
 * Creates the full demo tenant in Supabase:
 * - 1 tenant record
 * - 3 auth users + profiles (admin, manager, sales rep)
 * - 22 entities (1 org + 3 zones + 6 stores + 12 individuals)
 * - Entity relationships (hierarchy)
 * - 1 rule set with 6 components + 2 variants
 * - Rule set assignments for all 12 individuals
 * - Periods + committed data for 2024-01
 *
 * Idempotent: safe to re-run. Uses ON CONFLICT DO NOTHING and checks before insert.
 *
 * Usage: npx tsx scripts/seed-optica-luminar.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Deterministic UUIDs ──
const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const RULE_SET_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PERIOD_ID = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';
const IMPORT_BATCH_ID = 'd1b2c3d4-e5f6-7890-abcd-ef1234567890';
const BATCH_ID = 'e1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Entity UUIDs
const ORG_ID = '01000000-0001-0000-0000-000000000001';
const ZONE_CENTRO_ID = '01000000-0002-0000-0000-000000000001';
const ZONE_NORTE_ID = '01000000-0002-0000-0000-000000000002';
const ZONE_SUR_ID = '01000000-0002-0000-0000-000000000003';

const STORE_POLANCO_ID = '01000000-0003-0000-0000-000000000001';
const STORE_REFORMA_ID = '01000000-0003-0000-0000-000000000002';
const STORE_SANPEDRO_ID = '01000000-0003-0000-0000-000000000003';
const STORE_PROVIDENCIA_ID = '01000000-0003-0000-0000-000000000004';
const STORE_ANGELOPOLIS_ID = '01000000-0003-0000-0000-000000000005';
const STORE_KUKULCAN_ID = '01000000-0003-0000-0000-000000000006';

// Individual entity UUIDs
const IND = [
  '01000000-0004-0000-0000-000000000001', // Carlos Garcia Lopez
  '01000000-0004-0000-0000-000000000002', // Maria Rodriguez Hernandez
  '01000000-0004-0000-0000-000000000003', // Juan Martinez Perez
  '01000000-0004-0000-0000-000000000004', // Ana Gonzalez Torres
  '01000000-0004-0000-0000-000000000005', // Pedro Sanchez Rivera
  '01000000-0004-0000-0000-000000000006', // Sofia Flores Gomez
  '01000000-0004-0000-0000-000000000007', // Miguel Diaz Cruz
  '01000000-0004-0000-0000-000000000008', // Isabella Morales Reyes
  '01000000-0004-0000-0000-000000000009', // Luis Gutierrez Ortiz
  '01000000-0004-0000-0000-000000000010', // Valentina Castillo Ramos
  '01000000-0004-0000-0000-000000000011', // Diego Santos Jimenez
  '01000000-0004-0000-0000-000000000012', // Camila Ruiz Mendoza
];

// Profile UUIDs
const PROFILE_ADMIN_ID = '02000000-0001-0000-0000-000000000001';
const PROFILE_MANAGER_ID = '02000000-0001-0000-0000-000000000002';
const PROFILE_REP_ID = '02000000-0001-0000-0000-000000000003';

// Auth user data
const AUTH_USERS = [
  {
    email: 'admin@opticaluminar.mx',
    password: 'demo-password-OL1',
    displayName: 'Laura Mendez',
    role: 'admin',
    profileId: PROFILE_ADMIN_ID,
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments', 'design_scenarios', 'import_data', 'view_audit', 'manage_profiles'],
  },
  {
    email: 'gerente@opticaluminar.mx',
    password: 'demo-password-OL2',
    displayName: 'Roberto Castillo',
    role: 'manager',
    profileId: PROFILE_MANAGER_ID,
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results'],
  },
  {
    email: 'vendedor@opticaluminar.mx',
    password: 'demo-password-OL3',
    displayName: 'Sofia Navarro',
    role: 'viewer',
    profileId: PROFILE_REP_ID,
    capabilities: ['view_outcomes'],
  },
];

// Individuals with their store and certification
const INDIVIDUALS = [
  { id: IND[0], name: 'Carlos Garcia Lopez', extId: 'OL-EMP-001', storeId: STORE_POLANCO_ID, cert: 'certificado', hireDate: '2022-03-15', insurance: 2800, warranty: 5200 },
  { id: IND[1], name: 'Maria Rodriguez Hernandez', extId: 'OL-EMP-002', storeId: STORE_POLANCO_ID, cert: 'certificado', hireDate: '2021-08-20', insurance: 3100, warranty: 4800 },
  { id: IND[2], name: 'Juan Martinez Perez', extId: 'OL-EMP-003', storeId: STORE_REFORMA_ID, cert: 'certificado', hireDate: '2023-01-10', insurance: 2200, warranty: 3900 },
  { id: IND[3], name: 'Ana Gonzalez Torres', extId: 'OL-EMP-004', storeId: STORE_REFORMA_ID, cert: 'no_certificado', hireDate: '2023-06-01', insurance: 1900, warranty: 4100 },
  { id: IND[4], name: 'Pedro Sanchez Rivera', extId: 'OL-EMP-005', storeId: STORE_SANPEDRO_ID, cert: 'certificado', hireDate: '2022-04-15', insurance: 2500, warranty: 3500 },
  { id: IND[5], name: 'Sofia Flores Gomez', extId: 'OL-EMP-006', storeId: STORE_SANPEDRO_ID, cert: 'certificado', hireDate: '2022-11-20', insurance: 2100, warranty: 3200 },
  { id: IND[6], name: 'Miguel Diaz Cruz', extId: 'OL-EMP-007', storeId: STORE_PROVIDENCIA_ID, cert: 'no_certificado', hireDate: '2023-03-01', insurance: 1400, warranty: 2800 },
  { id: IND[7], name: 'Isabella Morales Reyes', extId: 'OL-EMP-008', storeId: STORE_PROVIDENCIA_ID, cert: 'no_certificado', hireDate: '2023-09-15', insurance: 1200, warranty: 2500 },
  { id: IND[8], name: 'Luis Gutierrez Ortiz', extId: 'OL-EMP-009', storeId: STORE_ANGELOPOLIS_ID, cert: 'no_certificado', hireDate: '2024-01-05', insurance: 900, warranty: 1800 },
  { id: IND[9], name: 'Valentina Castillo Ramos', extId: 'OL-EMP-010', storeId: STORE_ANGELOPOLIS_ID, cert: 'certificado', hireDate: '2022-07-10', insurance: 1100, warranty: 2200 },
  { id: IND[10], name: 'Diego Santos Jimenez', extId: 'OL-EMP-011', storeId: STORE_KUKULCAN_ID, cert: 'certificado', hireDate: '2022-02-28', insurance: 2600, warranty: 4000 },
  { id: IND[11], name: 'Camila Ruiz Mendoza', extId: 'OL-EMP-012', storeId: STORE_KUKULCAN_ID, cert: 'no_certificado', hireDate: '2023-05-15', insurance: 2000, warranty: 3400 },
];

// Store-level metrics
const STORE_METRICS: Record<string, { opticalSales: number; target: number; attainmentPct: number; volumeTier: string; newCustAttPct: number; collectionsAttPct: number; insuranceAttPct: number }> = {
  [STORE_POLANCO_ID]: { opticalSales: 625000, target: 500000, attainmentPct: 125, volumeTier: 'Alto', newCustAttPct: 115, collectionsAttPct: 108, insuranceAttPct: 105 },
  [STORE_REFORMA_ID]: { opticalSales: 525000, target: 500000, attainmentPct: 105, volumeTier: 'Alto', newCustAttPct: 102, collectionsAttPct: 95, insuranceAttPct: 110 },
  [STORE_SANPEDRO_ID]: { opticalSales: 441000, target: 450000, attainmentPct: 98, volumeTier: 'Medio', newCustAttPct: 92, collectionsAttPct: 88, insuranceAttPct: 95 },
  [STORE_PROVIDENCIA_ID]: { opticalSales: 340000, target: 400000, attainmentPct: 85, volumeTier: 'Medio', newCustAttPct: 80, collectionsAttPct: 82, insuranceAttPct: 78 },
  [STORE_ANGELOPOLIS_ID]: { opticalSales: 259200, target: 360000, attainmentPct: 72, volumeTier: 'Bajo', newCustAttPct: 68, collectionsAttPct: 70, insuranceAttPct: 65 },
  [STORE_KUKULCAN_ID]: { opticalSales: 385000, target: 350000, attainmentPct: 110, volumeTier: 'Medio', newCustAttPct: 105, collectionsAttPct: 98, insuranceAttPct: 102 },
};

async function main() {
  console.log('=== Optica Luminar Demo Tenant Seed ===\n');

  // ── 1. Tenant ──
  console.log('1. Creating tenant...');
  const { error: tenantErr } = await supabase.from('tenants').upsert({
    id: TENANT_ID,
    name: 'Optica Luminar',
    slug: 'optica-luminar',
    settings: {
      timezone: 'America/Mexico_City',
      fiscalYearStart: '01-01',
      country_code: 'MX',
      hierarchy_labels: { '0': 'Organizacion', '1': 'Zona', '2': 'Tienda', '3': 'Equipo' },
      entity_type_labels: { individual: 'Empleado', location: 'Tienda', team: 'Equipo', organization: 'Empresa' },
      outcome_label: 'Comision',
      domain_labels: { rule_set: 'Plan de Compensacion', outcome_value: 'Pago' },
    },
    hierarchy_labels: { level_1: 'Zona', level_2: 'Tienda', level_3: 'Equipo' },
    entity_type_labels: { individual: 'Empleado', location: 'Tienda', team: 'Equipo', organization: 'Empresa' },
    features: { compensation: true, performance: true, disputes: true, reconciliation: true, sandbox: true },
    locale: 'es-MX',
    currency: 'MXN',
  }, { onConflict: 'id' });
  if (tenantErr) console.error('  Tenant error:', tenantErr.message);
  else console.log('  Tenant created: Optica Luminar');

  // ── 2. Auth Users + Profiles ──
  console.log('\n2. Creating auth users and profiles...');
  for (const u of AUTH_USERS) {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(eu => eu.email === u.email);

    let authUserId: string;
    if (existing) {
      authUserId = existing.id;
      // Ensure password is set (handles users created without password)
      await supabase.auth.admin.updateUserById(authUserId, { password: u.password });
      console.log(`  Auth user already exists: ${u.email} (${authUserId}) — password synced`);
    } else {
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });
      if (authErr) {
        console.error(`  Failed to create auth user ${u.email}:`, authErr.message);
        continue;
      }
      authUserId = authUser.user.id;
      console.log(`  Auth user created: ${u.email} (${authUserId})`);
    }

    // Upsert profile
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: u.profileId,
      tenant_id: TENANT_ID,
      auth_user_id: authUserId,
      display_name: u.displayName,
      email: u.email,
      role: u.role,
      capabilities: u.capabilities,
      locale: 'es-MX',
    }, { onConflict: 'id' });
    if (profileErr) console.error(`  Profile error for ${u.email}:`, profileErr.message);
    else console.log(`  Profile upserted: ${u.displayName}`);
  }

  // ── 3. Ensure platform admin profile exists ──
  console.log('\n3. Checking platform admin profile...');
  const { data: platformProfile } = await supabase
    .from('profiles')
    .select('id, role, capabilities')
    .eq('email', 'platform@vialuce.com')
    .single();

  if (platformProfile) {
    // Ensure it has manage_tenants capability
    const caps = (platformProfile.capabilities as string[]) || [];
    if (!caps.includes('manage_tenants')) {
      await supabase.from('profiles').update({
        capabilities: [...caps, 'manage_tenants'],
      }).eq('id', platformProfile.id);
      console.log('  Added manage_tenants to platform admin');
    } else {
      console.log('  Platform admin already has manage_tenants');
    }
  } else {
    console.log('  No platform@vialuce.com profile found (OK if auth user exists separately)');
  }

  // ── 4. Entities ──
  console.log('\n4. Creating entities...');

  // Organization
  await upsertEntity(ORG_ID, 'organization', 'OL-ORG', 'Optica Luminar', {});

  // Zones
  await upsertEntity(ZONE_CENTRO_ID, 'organization', 'OL-ZONA-CENTRO', 'Zona Centro', { region_code: 'CENTRO' });
  await upsertEntity(ZONE_NORTE_ID, 'organization', 'OL-ZONA-NORTE', 'Zona Norte', { region_code: 'NORTE' });
  await upsertEntity(ZONE_SUR_ID, 'organization', 'OL-ZONA-SUR', 'Zona Sur', { region_code: 'SUR' });

  // Stores
  const stores = [
    { id: STORE_POLANCO_ID, extId: 'OL-CDMX-001', name: 'Optica Luminar Polanco', zone: ZONE_CENTRO_ID },
    { id: STORE_REFORMA_ID, extId: 'OL-CDMX-002', name: 'Optica Luminar Reforma', zone: ZONE_CENTRO_ID },
    { id: STORE_SANPEDRO_ID, extId: 'OL-MTY-001', name: 'Optica Luminar San Pedro', zone: ZONE_NORTE_ID },
    { id: STORE_PROVIDENCIA_ID, extId: 'OL-GDL-001', name: 'Optica Luminar Providencia', zone: ZONE_SUR_ID },
    { id: STORE_ANGELOPOLIS_ID, extId: 'OL-PUE-001', name: 'Optica Luminar Angelopolis', zone: ZONE_CENTRO_ID },
    { id: STORE_KUKULCAN_ID, extId: 'OL-CAN-001', name: 'Optica Luminar Kukulcan', zone: ZONE_SUR_ID },
  ];
  for (const s of stores) {
    await upsertEntity(s.id, 'location', s.extId, s.name, {});
  }

  // Individuals
  for (const ind of INDIVIDUALS) {
    await upsertEntity(ind.id, 'individual', ind.extId, ind.name, {
      certification: ind.cert,
      hire_date: ind.hireDate,
      role: 'Vendedor',
    });
  }
  console.log('  22 entities created');

  // ── 5. Entity Relationships ──
  console.log('\n5. Creating entity relationships...');

  // Org → Zones
  await upsertRelationship(ORG_ID, ZONE_CENTRO_ID, 'contains');
  await upsertRelationship(ORG_ID, ZONE_NORTE_ID, 'contains');
  await upsertRelationship(ORG_ID, ZONE_SUR_ID, 'contains');

  // Zones → Stores
  for (const s of stores) {
    await upsertRelationship(s.zone, s.id, 'contains');
  }

  // Stores → Individuals (member_of)
  for (const ind of INDIVIDUALS) {
    await upsertRelationship(ind.storeId, ind.id, 'contains');
  }
  console.log('  Hierarchy wired');

  // ── 6. Rule Set ──
  console.log('\n6. Creating rule set...');
  const ruleSetDef = buildRuleSetDefinition();
  const { error: rsErr } = await supabase.from('rule_sets').upsert({
    id: RULE_SET_ID,
    tenant_id: TENANT_ID,
    name: 'Plan de Comisiones Optica Luminar 2024',
    description: 'Plan de incentivos para vendedores de Optica Luminar',
    status: 'active',
    version: 1,
    effective_from: '2024-01-01',
    effective_to: '2024-12-31',
    population_config: { entity_types: ['individual'], filters: [{ field: 'status', operator: 'equals', value: 'active' }], scope: 'tenant' },
    input_bindings: {
      store_attainment: { source: 'committed_data', data_type: 'store_metrics', aggregation: 'latest' },
      individual_sales: { source: 'committed_data', data_type: 'individual_metrics', aggregation: 'sum' },
    },
    components: ruleSetDef.components,
    cadence_config: { period_type: 'monthly', payment_lag_days: 15, prorate_partial_months: true },
    outcome_config: { currency: 'MXN', min_payout: 0, max_payout: 50000, rounding: 'nearest_cent' },
    metadata: { plan_type: 'additive_lookup', variants: ruleSetDef.variants },
    created_by: PROFILE_ADMIN_ID,
  }, { onConflict: 'id' });
  if (rsErr) console.error('  Rule set error:', rsErr.message);
  else console.log('  Rule set created');

  // ── 7. Rule Set Assignments ──
  console.log('\n7. Creating rule set assignments...');
  for (let i = 0; i < INDIVIDUALS.length; i++) {
    const ind = INDIVIDUALS[i];
    // Deterministic assignment ID based on index
    const assignmentId = `02000000-0000-0000-0000-00000000${String(i + 1).padStart(4, '0')}`;
    const { error } = await supabase.from('rule_set_assignments').upsert({
      id: assignmentId,
      tenant_id: TENANT_ID,
      rule_set_id: RULE_SET_ID,
      entity_id: ind.id,
      effective_from: '2024-01-01',
      effective_to: '2024-12-31',
      assignment_type: 'direct',
    }, { onConflict: 'id' });
    if (error && !error.message.includes('duplicate')) {
      console.error(`  Assignment error for ${ind.name}:`, error.message);
    }
  }
  console.log('  12 assignments created');

  // ── 8. Period ──
  console.log('\n8. Creating period...');
  const { error: periodErr } = await supabase.from('periods').upsert({
    id: PERIOD_ID,
    tenant_id: TENANT_ID,
    label: 'Enero 2024',
    period_type: 'monthly',
    status: 'closed',
    start_date: '2024-01-01',
    end_date: '2024-01-31',
    canonical_key: '2024-01',
  }, { onConflict: 'id' });
  if (periodErr) console.error('  Period error:', periodErr.message);
  else console.log('  Period created: Enero 2024');

  // ── 9. Import Batch ──
  console.log('\n9. Creating import batch...');
  const { error: ibErr } = await supabase.from('import_batches').upsert({
    id: IMPORT_BATCH_ID,
    tenant_id: TENANT_ID,
    file_name: 'optica_luminar_enero_2024.xlsx',
    file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    row_count: 18,
    status: 'completed',
    error_summary: { errors: 0, warnings: 0 },
    uploaded_by: PROFILE_ADMIN_ID,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (ibErr) console.error('  Import batch error:', ibErr.message);

  // ── 10. Committed Data ──
  console.log('\n10. Creating committed data...');

  // Store-level metrics
  for (const s of stores) {
    const m = STORE_METRICS[s.id];
    await upsertCommittedData(s.id, 'store_metrics', {
      optical_sales: m.opticalSales,
      target: m.target,
      attainment_percent: m.attainmentPct,
      volume_tier: m.volumeTier,
      new_customers_attainment_percent: m.newCustAttPct,
      collections_attainment_percent: m.collectionsAttPct,
      insurance_attainment_percent: m.insuranceAttPct,
    });
  }

  // Individual-level metrics
  for (const ind of INDIVIDUALS) {
    await upsertCommittedData(ind.id, 'individual_metrics', {
      insurance_sales: ind.insurance,
      warranty_sales: ind.warranty,
    });
  }
  console.log('  18 committed data rows created');

  // ── 11. Calculation Batch ──
  console.log('\n11. Creating calculation batch...');
  const { error: batchErr } = await supabase.from('calculation_batches').upsert({
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    period_id: PERIOD_ID,
    rule_set_id: RULE_SET_ID,
    batch_type: 'standard',
    lifecycle_state: 'APPROVED',
    entity_count: 12,
    summary: { total_payout: 42850, avg_payout: 3571, currency: 'MXN' },
    config: { rule_set_version: 1 },
    started_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    completed_at: new Date(Date.now() - 3600000).toISOString(),
    created_by: PROFILE_ADMIN_ID,
  }, { onConflict: 'id' });
  if (batchErr) console.error('  Batch error:', batchErr.message);
  else console.log('  Calculation batch created (APPROVED)');

  // ── 12. Calculation Results ──
  console.log('\n12. Creating calculation results...');
  for (let i = 0; i < INDIVIDUALS.length; i++) {
    const ind = INDIVIDUALS[i];
    const storeMetrics = STORE_METRICS[ind.storeId];
    const payout = computePayout(ind, storeMetrics);

    const resultId = `f1b2c3d4-e5f6-7890-abcd-ef12345670${String(i + 1).padStart(2, '0')}`;
    const { error } = await supabase.from('calculation_results').upsert({
      id: resultId,
      tenant_id: TENANT_ID,
      batch_id: BATCH_ID,
      entity_id: ind.id,
      rule_set_id: RULE_SET_ID,
      period_id: PERIOD_ID,
      total_payout: payout.total,
      components: payout.components,
      metrics: {
        store_attainment: storeMetrics.attainmentPct,
        insurance_sales: ind.insurance,
        warranty_sales: ind.warranty,
        certification: ind.cert,
      },
      attainment: { store: storeMetrics.attainmentPct / 100, overall: storeMetrics.attainmentPct / 100 },
      metadata: {},
    }, { onConflict: 'id' });
    if (error) console.error(`  Result error for ${ind.name}:`, error.message);
  }
  console.log('  12 calculation results created');

  // ── 13. Entity Period Outcomes ──
  console.log('\n13. Creating entity period outcomes...');
  for (let i = 0; i < INDIVIDUALS.length; i++) {
    const ind = INDIVIDUALS[i];
    const storeMetrics = STORE_METRICS[ind.storeId];
    const payout = computePayout(ind, storeMetrics);

    const { error } = await supabase.from('entity_period_outcomes').upsert({
      tenant_id: TENANT_ID,
      entity_id: ind.id,
      period_id: PERIOD_ID,
      total_payout: payout.total,
      rule_set_breakdown: [{ rule_set_id: RULE_SET_ID, payout: payout.total }],
      component_breakdown: payout.components,
      lowest_lifecycle_state: 'APPROVED',
      attainment_summary: { store: storeMetrics.attainmentPct / 100 },
      metadata: {},
    }, { onConflict: 'tenant_id,entity_id,period_id', ignoreDuplicates: true });
    if (error && !error.message.includes('duplicate')) {
      console.error(`  EPO error for ${ind.name}:`, error.message);
    }
  }
  console.log('  12 entity period outcomes created');

  console.log('\n=== Seed complete ===');
  console.log(`Tenant: Optica Luminar (${TENANT_ID})`);
  console.log('Users: admin@opticaluminar.mx, gerente@opticaluminar.mx, vendedor@opticaluminar.mx');
  console.log('Entities: 22 (1 org + 3 zones + 6 stores + 12 individuals)');
  console.log('Rule set: Plan de Comisiones with 6 components, 2 variants');
  console.log('Period: Enero 2024 with committed data and calculation results');
}

// ── Helpers ──

async function upsertEntity(id: string, entityType: string, externalId: string, displayName: string, metadata: Record<string, unknown>) {
  const { error } = await supabase.from('entities').upsert({
    id,
    tenant_id: TENANT_ID,
    entity_type: entityType,
    status: 'active',
    external_id: externalId,
    display_name: displayName,
    metadata,
    temporal_attributes: metadata.hire_date
      ? [{ key: 'hire_date', value: metadata.hire_date, effective_from: metadata.hire_date as string }]
      : [],
  }, { onConflict: 'id' });
  if (error) console.error(`  Entity error (${displayName}):`, error.message);
}

async function upsertRelationship(sourceId: string, targetId: string, relType: string) {
  const { error } = await supabase.from('entity_relationships').insert({
    tenant_id: TENANT_ID,
    source_entity_id: sourceId,
    target_entity_id: targetId,
    relationship_type: relType,
    source: 'imported_explicit',
    confidence: 1.0,
    effective_from: '2024-01-01',
  }).select().maybeSingle();
  // Ignore duplicate key errors
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    console.error(`  Relationship error (${sourceId} -> ${targetId}):`, error.message);
  }
}

async function upsertCommittedData(entityId: string, dataType: string, rowData: Record<string, unknown>) {
  const { error } = await supabase.from('committed_data').insert({
    tenant_id: TENANT_ID,
    import_batch_id: IMPORT_BATCH_ID,
    entity_id: entityId,
    period_id: PERIOD_ID,
    data_type: dataType,
    row_data: rowData,
    metadata: { source: 'seed' },
  }).select().maybeSingle();
  if (error && !error.message.includes('duplicate')) {
    console.error(`  Committed data error (${entityId}/${dataType}):`, error.message);
  }
}

function computePayout(ind: typeof INDIVIDUALS[0], store: typeof STORE_METRICS[string]) {
  const isCert = ind.cert === 'certificado';

  // Component 1: Venta Optica (matrix lookup)
  let ventaOptica = 0;
  const att = store.attainmentPct;
  const vol = store.volumeTier;
  const certMatrix = [[500, 600, 750], [800, 1000, 1200], [1200, 1500, 1800], [1500, 1800, 2200]];
  const noCertMatrix = [[250, 300, 375], [400, 500, 600], [600, 750, 900], [750, 900, 1100]];
  const matrix = isCert ? certMatrix : noCertMatrix;
  const rowIdx = att < 80 ? 0 : att < 100 ? 1 : att < 120 ? 2 : 3;
  const colIdx = vol === 'Bajo' ? 0 : vol === 'Medio' ? 1 : 2;
  ventaOptica = matrix[rowIdx][colIdx];

  // Component 2: Venta Tienda (tiered lookup)
  let ventaTienda = 0;
  if (att >= 120) ventaTienda = 500;
  else if (att >= 100) ventaTienda = 300;
  else if (att >= 80) ventaTienda = 150;

  // Component 3: Clientes Nuevos
  let clientesNuevos = 0;
  const ncAtt = store.newCustAttPct;
  if (ncAtt >= 120) clientesNuevos = 250;
  else if (ncAtt >= 100) clientesNuevos = 150;
  else if (ncAtt >= 80) clientesNuevos = 75;

  // Component 4: Cobranza
  let cobranza = 0;
  const colAtt = store.collectionsAttPct;
  if (colAtt >= 120) cobranza = 250;
  else if (colAtt >= 100) cobranza = 150;
  else if (colAtt >= 80) cobranza = 75;

  // Component 5: Club de Proteccion
  const insRate = store.insuranceAttPct >= 100 ? 0.05 : 0.03;
  const clubProteccion = Math.round(ind.insurance * insRate);

  // Component 6: Garantia Extendida
  const garantia = Math.round(ind.warranty * 0.04);

  const total = ventaOptica + ventaTienda + clientesNuevos + cobranza + clubProteccion + garantia;

  return {
    total,
    components: [
      { id: 'venta_optica', name: 'Venta Optica', value: ventaOptica },
      { id: 'venta_tienda', name: 'Venta Tienda', value: ventaTienda },
      { id: 'clientes_nuevos', name: 'Clientes Nuevos', value: clientesNuevos },
      { id: 'cobranza', name: 'Cobranza', value: cobranza },
      { id: 'club_proteccion', name: 'Club de Proteccion', value: clubProteccion },
      { id: 'garantia_extendida', name: 'Garantia Extendida', value: garantia },
    ],
  };
}

function buildRuleSetDefinition() {
  return {
    variants: [
      { id: 'certificado', name: 'Certificado', conditions: [{ field: 'certification', operator: 'eq', value: 'certificado' }] },
      { id: 'no_certificado', name: 'No Certificado', conditions: [{ field: 'certification', operator: 'eq', value: 'no_certificado' }] },
    ],
    components: [
      {
        id: 'venta_optica', name: 'Venta Optica', order: 1, enabled: true, component_type: 'matrix_lookup',
        measurement_level: 'individual',
        config: {
          row_metric: 'store_attainment_percent', column_metric: 'store_volume_tier',
          variant_matrices: {
            certificado: { values: [[500, 600, 750], [800, 1000, 1200], [1200, 1500, 1800], [1500, 1800, 2200]] },
            no_certificado: { values: [[250, 300, 375], [400, 500, 600], [600, 750, 900], [750, 900, 1100]] },
          },
        },
      },
      { id: 'venta_tienda', name: 'Venta Tienda', order: 2, enabled: true, component_type: 'tier_lookup', measurement_level: 'store', config: { metric: 'store_attainment_percent', tiers: [{ min: 0, max: 79, value: 0 }, { min: 80, max: 99, value: 150 }, { min: 100, max: 119, value: 300 }, { min: 120, max: 999, value: 500 }] } },
      { id: 'clientes_nuevos', name: 'Clientes Nuevos', order: 3, enabled: true, component_type: 'tier_lookup', measurement_level: 'store', config: { metric: 'new_customers_attainment_percent', tiers: [{ min: 0, max: 79, value: 0 }, { min: 80, max: 99, value: 75 }, { min: 100, max: 119, value: 150 }, { min: 120, max: 999, value: 250 }] } },
      { id: 'cobranza', name: 'Cobranza', order: 4, enabled: true, component_type: 'tier_lookup', measurement_level: 'store', config: { metric: 'collections_attainment_percent', tiers: [{ min: 0, max: 79, value: 0 }, { min: 80, max: 99, value: 75 }, { min: 100, max: 119, value: 150 }, { min: 120, max: 999, value: 250 }] } },
      { id: 'club_proteccion', name: 'Club de Proteccion', order: 5, enabled: true, component_type: 'percentage_with_gate', measurement_level: 'individual', config: { metric: 'individual_insurance_sales', gate_metric: 'store_insurance_attainment_percent', rates: [{ gate_min: 0, gate_max: 99, rate: 0.03 }, { gate_min: 100, gate_max: 999, rate: 0.05 }] } },
      { id: 'garantia_extendida', name: 'Garantia Extendida', order: 6, enabled: true, component_type: 'flat_percentage', measurement_level: 'individual', config: { metric: 'individual_warranty_sales', rate: 0.04 } },
    ],
  };
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
