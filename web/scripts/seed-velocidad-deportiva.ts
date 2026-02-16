#!/usr/bin/env npx tsx
/**
 * Seed script: Velocidad Deportiva Demo Tenant
 *
 * Creates the full demo tenant in Supabase:
 * - 1 tenant record
 * - 3 auth users + profiles
 * - 35 entities (1 org + 3 regions + 8 stores + 3 teams + 20 individuals)
 * - ~40 entity relationships
 * - 2 rule sets (Floor Sales + Online Assist)
 * - 36 rule set assignments (18 associates × 2 plans)
 * - 8 periods (6 monthly + 2 quarterly)
 * - 6 months committed data (Sep 2025–Feb 2026)
 * - 8 calc batches (6 monthly + 2 quarterly)
 * - 108 calc results (18 associates × 6 months)
 * - 36 outcomes (18 associates × 2 quarters)
 *
 * Idempotent: safe to re-run. Uses ON CONFLICT and checks before insert.
 *
 * Usage: npx tsx scripts/seed-velocidad-deportiva.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ══════════════════════════════════════════════
// Deterministic UUIDs (b2 prefix for VD tenant)
// ══════════════════════════════════════════════
const TENANT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// Rule Sets
const RS_FLOOR_ID = 'b2000000-0001-0000-0000-000000000001';
const RS_ONLINE_ID = 'b2000000-0001-0000-0000-000000000002';

// Periods (6 monthly + 2 quarterly)
const PERIOD_IDS = {
  '2025-09': 'b2000000-0010-0000-0000-000000000001',
  '2025-10': 'b2000000-0010-0000-0000-000000000002',
  '2025-11': 'b2000000-0010-0000-0000-000000000003',
  '2025-12': 'b2000000-0010-0000-0000-000000000004',
  '2026-01': 'b2000000-0010-0000-0000-000000000005',
  '2026-02': 'b2000000-0010-0000-0000-000000000006',
  'Q1-FY26': 'b2000000-0010-0000-0000-000000000007',
  'Q2-FY26': 'b2000000-0010-0000-0000-000000000008',
};

// Import batches (1 per month)
const IB_IDS = {
  '2025-09': 'b2000000-0020-0000-0000-000000000001',
  '2025-10': 'b2000000-0020-0000-0000-000000000002',
  '2025-11': 'b2000000-0020-0000-0000-000000000003',
  '2025-12': 'b2000000-0020-0000-0000-000000000004',
  '2026-01': 'b2000000-0020-0000-0000-000000000005',
  '2026-02': 'b2000000-0020-0000-0000-000000000006',
};

// Calc batches (6 monthly + 2 quarterly)
const CB_IDS = {
  '2025-09': 'b2000000-0030-0000-0000-000000000001',
  '2025-10': 'b2000000-0030-0000-0000-000000000002',
  '2025-11': 'b2000000-0030-0000-0000-000000000003',
  '2025-12': 'b2000000-0030-0000-0000-000000000004',
  '2026-01': 'b2000000-0030-0000-0000-000000000005',
  '2026-02': 'b2000000-0030-0000-0000-000000000006',
  'Q1-FY26': 'b2000000-0030-0000-0000-000000000007',
  'Q2-FY26': 'b2000000-0030-0000-0000-000000000008',
};

// ── Entity UUIDs ──
const ORG_ID = 'b2000000-0001-0000-0000-000000000010';

const REG_CDMX = 'b2000000-0002-0000-0000-000000000001';
const REG_NOR = 'b2000000-0002-0000-0000-000000000002';
const REG_OCC = 'b2000000-0002-0000-0000-000000000003';

const STORES = [
  { id: 'b2000000-0003-0000-0000-000000000001', ext: 'VD-T01', name: 'Velocidad Polanco', region: REG_CDMX, city: 'CDMX', type: 'flagship', target: 800 },
  { id: 'b2000000-0003-0000-0000-000000000002', ext: 'VD-T02', name: 'Velocidad Santa Fe', region: REG_CDMX, city: 'CDMX', type: 'premium', target: 650 },
  { id: 'b2000000-0003-0000-0000-000000000003', ext: 'VD-T03', name: 'Velocidad Interlomas', region: REG_CDMX, city: 'Huixquilucan', type: 'standard', target: 500 },
  { id: 'b2000000-0003-0000-0000-000000000004', ext: 'VD-T04', name: 'Velocidad Monterrey', region: REG_NOR, city: 'Monterrey', type: 'premium', target: 600 },
  { id: 'b2000000-0003-0000-0000-000000000005', ext: 'VD-T05', name: 'Velocidad Saltillo', region: REG_NOR, city: 'Saltillo', type: 'standard', target: 400 },
  { id: 'b2000000-0003-0000-0000-000000000006', ext: 'VD-T06', name: 'Velocidad Guadalajara', region: REG_OCC, city: 'Guadalajara', type: 'flagship', target: 700 },
  { id: 'b2000000-0003-0000-0000-000000000007', ext: 'VD-T07', name: 'Velocidad Zapopan', region: REG_OCC, city: 'Zapopan', type: 'standard', target: 450 },
  { id: 'b2000000-0003-0000-0000-000000000008', ext: 'VD-T08', name: 'Velocidad Leon', region: REG_OCC, city: 'Leon', type: 'standard', target: 400 },
];

const TEAMS = [
  { id: 'b2000000-0005-0000-0000-000000000001', ext: 'VD-EQ-CAL', name: 'Equipo Calzado' },
  { id: 'b2000000-0005-0000-0000-000000000002', ext: 'VD-EQ-ROD', name: 'Equipo Rodados' },
  { id: 'b2000000-0005-0000-0000-000000000003', ext: 'VD-EQ-TXT', name: 'Equipo Textil' },
];

// Profiles
const PROF_ADMIN = 'b2000000-0040-0000-0000-000000000001';
const PROF_GERENTE = 'b2000000-0040-0000-0000-000000000002';
const PROF_ASOCIADO = 'b2000000-0040-0000-0000-000000000003';

// Auth users
const AUTH_USERS = [
  {
    email: 'admin@velocidaddeportiva.mx',
    password: 'demo-password-VD1',
    displayName: 'Alejandra Torres',
    role: 'admin',
    profileId: PROF_ADMIN,
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments', 'design_scenarios', 'import_data', 'view_audit', 'manage_profiles'],
  },
  {
    email: 'gerente@velocidaddeportiva.mx',
    password: 'demo-password-VD2',
    displayName: 'Roberto Vega',
    role: 'manager',
    profileId: PROF_GERENTE,
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results'],
  },
  {
    email: 'asociado@velocidaddeportiva.mx',
    password: 'demo-password-VD3',
    displayName: 'Diana Cruz',
    role: 'viewer',
    profileId: PROF_ASOCIADO,
    capabilities: ['view_outcomes'],
  },
];

// ── Store attainment by month (Sep 2025–Feb 2026) ──
// Key pattern: drives medals for associates
const STORE_ATT: Record<string, number[]> = {
  // [Sep, Oct, Nov, Dec, Jan, Feb]
  [STORES[0].id]: [125, 122, 130, 124, 121, 140], // Polanco — all ≥120 → all Oro
  [STORES[1].id]: [105, 110, 98, 108, 112, 120],   // Santa Fe — mostly Plata
  [STORES[2].id]: [88, 92, 85, 90, 95, 88],         // Interlomas — mostly Bronce
  [STORES[3].id]: [102, 98, 105, 110, 100, 108],    // Monterrey — Plata range
  [STORES[4].id]: [75, 80, 82, 78, 85, 90],         // Saltillo — low, some Sin Medalla
  [STORES[5].id]: [115, 122, 118, 125, 120, 135],   // Guadalajara — rising to Oro
  [STORES[6].id]: [90, 85, 92, 88, 82, 95],         // Zapopan — Bronce range
  [STORES[7].id]: [95, 98, 90, 92, 100, 98],        // Leon — Bronce/Plata
};

const MONTHS = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
const MONTH_LABELS = ['Septiembre 2025', 'Octubre 2025', 'Noviembre 2025', 'Diciembre 2025', 'Enero 2026', 'Febrero 2026'];

// ── Individuals (20 total, 18 floor associates + 2 managers) ──
interface Individual {
  id: string;
  ext: string;
  name: string;
  storeIdx: number; // index into STORES
  teamIdx: number;  // index into TEAMS
  role: string;
  attendance: number;
  hireDate: string;
  isFloor: boolean;
  // Per-month override for individual attainment (uses store if undefined)
  attOverride?: number[];
  // Consecutive qualifying months for streak (Oro months)
  streakMonths: number;
}

const INDIVIDUALS: Individual[] = [
  // Store 0: Polanco (3 associates)
  { id: 'b2000000-0004-0000-0000-000000000001', ext: 'VD-A01', name: 'Carlos Mendoza', storeIdx: 0, teamIdx: 0, role: 'Vendedor Piso', attendance: 98, hireDate: '2022-06-15', isFloor: true, streakMonths: 6 },
  { id: 'b2000000-0004-0000-0000-000000000002', ext: 'VD-A02', name: 'Sofia Rivera', storeIdx: 0, teamIdx: 2, role: 'Vendedor Piso', attendance: 95, hireDate: '2022-09-01', isFloor: true, attOverride: [115, 125, 108, 122, 110, 128], streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000003', ext: 'VD-A03', name: 'Miguel Herrera', storeIdx: 0, teamIdx: 1, role: 'Vendedor Piso', attendance: 92, hireDate: '2023-02-10', isFloor: true, attOverride: [108, 112, 105, 110, 108, 115], streakMonths: 0 },

  // Store 1: Santa Fe (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000004', ext: 'VD-A04', name: 'Valentina Soto', storeIdx: 1, teamIdx: 0, role: 'Vendedor Piso', attendance: 96, hireDate: '2022-08-20', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000005', ext: 'VD-A05', name: 'Diego Castillo', storeIdx: 1, teamIdx: 2, role: 'Vendedor Piso', attendance: 88, hireDate: '2023-01-15', isFloor: true, streakMonths: 0 },

  // Store 2: Interlomas (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000006', ext: 'VD-A06', name: 'Isabella Moreno', storeIdx: 2, teamIdx: 1, role: 'Vendedor Piso', attendance: 94, hireDate: '2023-04-01', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000007', ext: 'VD-A07', name: 'Andres Jimenez', storeIdx: 2, teamIdx: 0, role: 'Vendedor Piso', attendance: 91, hireDate: '2023-06-15', isFloor: true, streakMonths: 0 },

  // Store 3: Monterrey (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000008', ext: 'VD-A08', name: 'Camila Vargas', storeIdx: 3, teamIdx: 2, role: 'Vendedor Piso', attendance: 97, hireDate: '2022-11-01', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000009', ext: 'VD-A09', name: 'Fernando Reyes', storeIdx: 3, teamIdx: 1, role: 'Vendedor Piso', attendance: 93, hireDate: '2023-03-20', isFloor: true, streakMonths: 0 },

  // Store 4: Saltillo (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000010', ext: 'VD-A10', name: 'Lucia Gutierrez', storeIdx: 4, teamIdx: 0, role: 'Vendedor Piso', attendance: 85, hireDate: '2023-05-10', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000011', ext: 'VD-A11', name: 'Roberto Flores', storeIdx: 4, teamIdx: 2, role: 'Vendedor Piso', attendance: 90, hireDate: '2023-07-01', isFloor: true, attOverride: [82, 75, 85, 78, 88, 105], streakMonths: 0 },

  // Store 5: Guadalajara (3 associates)
  { id: 'b2000000-0004-0000-0000-000000000012', ext: 'VD-A12', name: 'Ana Martinez', storeIdx: 5, teamIdx: 0, role: 'Vendedor Piso', attendance: 99, hireDate: '2022-05-15', isFloor: true, attOverride: [105, 108, 122, 125, 128, 135], streakMonths: 4 },
  { id: 'b2000000-0004-0000-0000-000000000013', ext: 'VD-A13', name: 'Pablo Sanchez', storeIdx: 5, teamIdx: 1, role: 'Vendedor Piso', attendance: 96, hireDate: '2022-10-01', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000014', ext: 'VD-A14', name: 'Mariana Lopez', storeIdx: 5, teamIdx: 2, role: 'Vendedor Piso', attendance: 94, hireDate: '2023-08-01', isFloor: true, attOverride: [95, 102, 98, 100, 105, 108], streakMonths: 0 },

  // Store 6: Zapopan (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000015', ext: 'VD-A15', name: 'Jorge Ramirez', storeIdx: 6, teamIdx: 0, role: 'Vendedor Piso', attendance: 92, hireDate: '2023-01-20', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000016', ext: 'VD-A16', name: 'Elena Torres', storeIdx: 6, teamIdx: 1, role: 'Vendedor Piso', attendance: 91, hireDate: '2023-09-01', isFloor: true, attOverride: [82, 78, 85, 80, 75, 88], streakMonths: 0 },

  // Store 7: Leon (2 associates)
  { id: 'b2000000-0004-0000-0000-000000000017', ext: 'VD-A17', name: 'David Aguilar', storeIdx: 7, teamIdx: 2, role: 'Vendedor Piso', attendance: 93, hireDate: '2023-04-15', isFloor: true, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000018', ext: 'VD-A18', name: 'Patricia Diaz', storeIdx: 7, teamIdx: 0, role: 'Vendedor Piso', attendance: 95, hireDate: '2022-12-01', isFloor: true, streakMonths: 0 },

  // Managers (non-floor, no assignments)
  { id: 'b2000000-0004-0000-0000-000000000019', ext: 'VD-A19', name: 'Gerente Metro', storeIdx: 0, teamIdx: -1, role: 'Gerente Regional', attendance: 100, hireDate: '2021-01-15', isFloor: false, streakMonths: 0 },
  { id: 'b2000000-0004-0000-0000-000000000020', ext: 'VD-A20', name: 'Gerente Expansion', storeIdx: -1, teamIdx: -1, role: 'Director Ventas', attendance: 100, hireDate: '2020-06-01', isFloor: false, streakMonths: 0 },
];

const FLOOR_ASSOCIATES = INDIVIDUALS.filter(i => i.isFloor);

// ══════════════════════════════════════════════
// Calculation helpers
// ══════════════════════════════════════════════

function getMedal(attPct: number): string {
  if (attPct >= 120) return 'oro';
  if (attPct >= 100) return 'plata';
  if (attPct >= 80) return 'bronce';
  return 'sin_medalla';
}

function getBonoAttainment(attPct: number): number {
  if (attPct >= 120) return 6000;
  if (attPct >= 100) return 3500;
  if (attPct >= 80) return 1500;
  return 0;
}

function getStreakBonus(months: number): number {
  if (months >= 12) return 15000;
  if (months >= 6) return 5000;
  if (months >= 3) return 2000;
  return 0;
}

/** Generate plausible unit sales for an associate in a given month. */
function generateUnits(ind: Individual, monthIdx: number): { calzado: number; rodados: number; textil: number; accesorios: number } {
  // Seeded pseudo-random based on associate index + month
  const seed = (parseInt(ind.id.slice(-3)) * 7 + monthIdx * 13) % 100;
  const team = ind.teamIdx;
  // Calzado team sells more shoes, etc.
  const base = { calzado: 25, rodados: 15, textil: 20, accesorios: 10 };
  if (team === 0) base.calzado += 15; // Calzado team
  if (team === 1) base.rodados += 12; // Rodados team
  if (team === 2) base.textil += 15;  // Textil team

  const variance = (seed - 50) / 100; // -0.5 to +0.5
  return {
    calzado: Math.max(10, Math.round(base.calzado * (1 + variance * 0.4))),
    rodados: Math.max(5, Math.round(base.rodados * (1 + variance * 0.3))),
    textil: Math.max(8, Math.round(base.textil * (1 + variance * 0.35))),
    accesorios: Math.max(3, Math.round(base.accesorios * (1 + variance * 0.5))),
  };
}

function computeComisionBase(units: { calzado: number; rodados: number; textil: number; accesorios: number }): number {
  return units.calzado * 45 + units.rodados * 65 + units.textil * 30 + units.accesorios * 20;
}

function generateOnlineOrders(ind: Individual, monthIdx: number): number {
  const seed = (parseInt(ind.id.slice(-3)) * 11 + monthIdx * 17) % 21 + 5;
  return seed; // 5-25
}

function generateCSAT(ind: Individual, monthIdx: number): number {
  const seed = (parseInt(ind.id.slice(-3)) * 3 + monthIdx * 7) % 16;
  return Math.round((3.5 + seed / 10) * 10) / 10; // 3.5 to 5.0
}

function getCSATMultiplier(csat: number): number {
  if (csat >= 4.5) return 1.3;
  if (csat >= 4.0) return 1.0;
  return 0.8;
}

function getAttainment(ind: Individual, monthIdx: number): number {
  if (ind.attOverride) return ind.attOverride[monthIdx];
  return STORE_ATT[STORES[ind.storeIdx].id][monthIdx];
}

// ══════════════════════════════════════════════
// Main seed function
// ══════════════════════════════════════════════

async function main() {
  console.log('=== Velocidad Deportiva Demo Tenant Seed ===\n');

  // ── 1. Tenant ──
  console.log('1. Creating tenant...');
  const { error: tenantErr } = await supabase.from('tenants').upsert({
    id: TENANT_ID,
    name: 'Velocidad Deportiva',
    slug: 'velocidad-deportiva',
    settings: {
      timezone: 'America/Mexico_City',
      country_code: 'MX',
      industry: 'retail_sporting',
      hierarchy_labels: { '0': 'Empresa', '1': 'Region', '2': 'Tienda', '3': 'Equipo' },
      entity_type_labels: { individual: 'Asociado', location: 'Tienda', team: 'Equipo', organization: 'Empresa' },
      outcome_label: 'Comision + Medalla',
      domain_labels: { rule_set: 'Plan de Incentivos', outcome_value: 'Pago Trimestral' },
      gamification: {
        enabled: true,
        tiers: [
          { id: 'oro', label: 'Oro', emoji: '🥇', min_attainment: 120, color: '#FFD700' },
          { id: 'plata', label: 'Plata', emoji: '🥈', min_attainment: 100, color: '#C0C0C0' },
          { id: 'bronce', label: 'Bronce', emoji: '🥉', min_attainment: 80, color: '#CD7F32' },
          { id: 'sin_medalla', label: 'Sin Medalla', emoji: '', min_attainment: 0, color: '#999999' },
        ],
      },
      deferred_payment: {
        calc_cadence: 'monthly',
        pay_cadence: 'quarterly',
        pay_months: [3, 6, 9, 12],
      },
      demo_users: [
        { email: 'admin@velocidaddeportiva.mx', password: 'demo-password-VD1', label: 'Admin', icon: 'shield' },
        { email: 'gerente@velocidaddeportiva.mx', password: 'demo-password-VD2', label: 'Gerente Regional', icon: 'users' },
        { email: 'asociado@velocidaddeportiva.mx', password: 'demo-password-VD3', label: 'Asociado', icon: 'user' },
      ],
    },
    features: { compensation: true, performance: true, disputes: true, reconciliation: true, sandbox: true },
    locale: 'es-MX',
    currency: 'MXN',
  }, { onConflict: 'id' });
  if (tenantErr) console.error('  Tenant error:', tenantErr.message);
  else console.log('  Tenant created: Velocidad Deportiva');

  // ── 2. Auth Users + Profiles ──
  console.log('\n2. Creating auth users and profiles...');
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  for (const u of AUTH_USERS) {
    const existing = existingUsers?.users?.find(eu => eu.email === u.email);
    let authUserId: string;
    if (existing) {
      authUserId = existing.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: u.password });
      console.log(`  Auth user exists: ${u.email} — password synced`);
    } else {
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });
      if (authErr) { console.error(`  Auth error ${u.email}:`, authErr.message); continue; }
      authUserId = authUser.user.id;
      console.log(`  Auth user created: ${u.email}`);
    }

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
    if (profileErr) console.error(`  Profile error ${u.email}:`, profileErr.message);
    else console.log(`  Profile upserted: ${u.displayName}`);
  }

  // ── 3. Entities ──
  console.log('\n3. Creating entities...');

  // Organization
  await upsertEntity(ORG_ID, 'organization', 'VD-ORG', 'Velocidad Deportiva S.A. de C.V.', {});

  // Regions
  await upsertEntity(REG_CDMX, 'organization', 'VD-REG-CDMX', 'Zona Metropolitana', { region_code: 'CDMX' });
  await upsertEntity(REG_NOR, 'organization', 'VD-REG-NOR', 'Zona Norte', { region_code: 'NOR' });
  await upsertEntity(REG_OCC, 'organization', 'VD-REG-OCC', 'Zona Occidente', { region_code: 'OCC' });

  // Stores
  for (const s of STORES) {
    await upsertEntity(s.id, 'location', s.ext, s.name, { city: s.city, store_type: s.type, monthly_target: s.target });
  }

  // Teams
  for (const t of TEAMS) {
    await upsertEntity(t.id, 'team', t.ext, t.name, {});
  }

  // Individuals
  for (const ind of INDIVIDUALS) {
    await upsertEntity(ind.id, 'individual', ind.ext, ind.name, {
      role: ind.role,
      hire_date: ind.hireDate,
      attendance_pct: ind.attendance,
      team: ind.teamIdx >= 0 ? TEAMS[ind.teamIdx].ext : null,
      store_type: ind.storeIdx >= 0 ? STORES[ind.storeIdx].type : null,
      consecutive_qualifying_months: ind.streakMonths,
    });
  }
  console.log('  35 entities created');

  // ── 4. Entity Relationships ──
  console.log('\n4. Creating entity relationships...');

  // Delete existing relationships first (idempotent re-run)
  await supabase.from('entity_relationships').delete().eq('tenant_id', TENANT_ID);

  let relCount = 0;

  // Org → Regions
  for (const regId of [REG_CDMX, REG_NOR, REG_OCC]) {
    await upsertRelationship(ORG_ID, regId, 'contains');
    relCount++;
  }

  // Regions → Stores
  for (const s of STORES) {
    await upsertRelationship(s.region, s.id, 'contains');
    relCount++;
  }

  // Stores → Individuals (member_of)
  for (const ind of INDIVIDUALS) {
    if (ind.storeIdx >= 0) {
      await upsertRelationship(STORES[ind.storeIdx].id, ind.id, 'contains');
      relCount++;
    }
  }

  // Teams → Individuals
  for (const ind of INDIVIDUALS) {
    if (ind.teamIdx >= 0) {
      await upsertRelationship(TEAMS[ind.teamIdx].id, ind.id, 'member_of');
      relCount++;
    }
  }

  // Manager relationships: Gerente Metro manages CDMX store associates
  // Direction: manager (source) → subordinate (target), type = 'manages'
  const gerenteMetro = INDIVIDUALS.find(i => i.ext === 'VD-A19')!;
  for (const ind of INDIVIDUALS) {
    if (ind.isFloor && ind.storeIdx >= 0 && ind.storeIdx <= 2) { // CDMX stores (0,1,2)
      await upsertRelationship(gerenteMetro.id, ind.id, 'manages');
      relCount++;
    }
  }

  // Director manages Gerente Metro + non-CDMX associates
  const director = INDIVIDUALS.find(i => i.ext === 'VD-A20')!;
  await upsertRelationship(director.id, gerenteMetro.id, 'manages');
  relCount++;
  for (const ind of INDIVIDUALS) {
    if (ind.isFloor && ind.storeIdx >= 3) {
      await upsertRelationship(director.id, ind.id, 'manages');
      relCount++;
    }
  }

  console.log(`  ${relCount} relationships created`);

  // ── 5. Rule Sets ──
  console.log('\n5. Creating rule sets...');

  // Rule Set 1: Plan de Piso
  const { error: rs1Err } = await supabase.from('rule_sets').upsert({
    id: RS_FLOOR_ID,
    tenant_id: TENANT_ID,
    name: 'Plan de Ventas de Piso — Velocidad Deportiva 2025-26',
    description: 'Plan principal para vendedores de piso: comisión base + bono por logro + racha + medallas',
    status: 'active',
    version: 1,
    effective_from: '2025-09-01',
    effective_to: '2026-08-31',
    population_config: { entity_types: ['individual'], filters: [{ field: 'role', operator: 'equals', value: 'Vendedor Piso' }], scope: 'tenant' },
    input_bindings: {
      store_metrics: { source: 'committed_data', data_type: 'store_metrics', aggregation: 'latest' },
      individual_sales: { source: 'committed_data', data_type: 'individual_sales', aggregation: 'sum' },
    },
    components: [
      { id: 'comision_base', name: 'Comision Base por Unidad', order: 1, enabled: true, component_type: 'per_unit', measurement_level: 'individual', config: { metric: 'units_sold', rates_by_category: { calzado: 45, rodados: 65, textil: 30, accesorios: 20 } } },
      { id: 'bono_attainment', name: 'Bono por Logro de Meta', order: 2, enabled: true, component_type: 'tiered_lookup', measurement_level: 'store', config: { metric: 'store_attainment_percent', tiers: [{ min: 0, max: 79, value: 0, medal: 'sin_medalla' }, { min: 80, max: 99, value: 1500, medal: 'bronce' }, { min: 100, max: 119, value: 3500, medal: 'plata' }, { min: 120, max: 999, value: 6000, medal: 'oro' }] } },
      { id: 'streak_bonus', name: 'Bono de Racha Consecutiva', order: 3, enabled: true, component_type: 'streak', measurement_level: 'individual', config: { qualifying_medal: 'bronce', metric: 'consecutive_qualifying_months', tiers: [{ months: 3, bonus: 2000, label: 'Racha 3 meses' }, { months: 6, bonus: 5000, label: 'Racha 6 meses' }, { months: 12, bonus: 15000, label: 'Racha anual' }] } },
      { id: 'gamification', name: 'Medalla del Mes', order: 4, enabled: true, component_type: 'gamification_medal', measurement_level: 'individual', config: { source_component: 'bono_attainment', medal_field: 'medal', output_type: 'non_monetary', display: { oro: { emoji: '🥇', color: '#FFD700', label: 'Medalla de Oro' }, plata: { emoji: '🥈', color: '#C0C0C0', label: 'Medalla de Plata' }, bronce: { emoji: '🥉', color: '#CD7F32', label: 'Medalla de Bronce' }, sin_medalla: { emoji: '', color: '#999999', label: 'Sin Medalla' } } } },
    ],
    cadence_config: { period_type: 'monthly', payment_cadence: 'quarterly', pay_months: [3, 6, 9, 12] },
    outcome_config: { currency: 'MXN', min_payout: 0, max_payout: 100000, rounding: 'nearest_cent' },
    metadata: {
      plan_type: 'floor_sales',
      gates: [{ id: 'attendance_gate', name: 'Requisito de Asistencia', type: 'threshold', field: 'attendance_pct', operator: 'gte', value: 90, failure_action: 'zero_payout', failure_message: 'Asociado no cumple con 90% de asistencia requerida' }],
    },
    created_by: PROF_ADMIN,
  }, { onConflict: 'id' });
  if (rs1Err) console.error('  RS1 error:', rs1Err.message);
  else console.log('  Rule set 1: Plan de Ventas de Piso');

  // Rule Set 2: Plan de Asistencia Online
  const { error: rs2Err } = await supabase.from('rule_sets').upsert({
    id: RS_ONLINE_ID,
    tenant_id: TENANT_ID,
    name: 'Plan de Asistencia Online — Velocidad Deportiva 2025-26',
    description: 'Plan secundario para entregas de pedidos online + satisfaccion',
    status: 'active',
    version: 1,
    effective_from: '2025-09-01',
    effective_to: '2026-08-31',
    population_config: { entity_types: ['individual'], filters: [{ field: 'role', operator: 'equals', value: 'Vendedor Piso' }], scope: 'tenant' },
    input_bindings: {
      online_metrics: { source: 'committed_data', data_type: 'online_metrics', aggregation: 'sum' },
    },
    components: [
      { id: 'pickup_bonus', name: 'Bono por Entrega de Pedidos Online', order: 1, enabled: true, component_type: 'per_unit', measurement_level: 'individual', config: { metric: 'online_orders_fulfilled', rate: 25 } },
      { id: 'csat_multiplier', name: 'Multiplicador de Satisfaccion', order: 2, enabled: true, component_type: 'multiplier', measurement_level: 'individual', config: { metric: 'customer_satisfaction_score', tiers: [{ min: 0, max: 3.9, multiplier: 0.8 }, { min: 4.0, max: 4.4, multiplier: 1.0 }, { min: 4.5, max: 5.0, multiplier: 1.3 }], applies_to: 'pickup_bonus' } },
    ],
    cadence_config: { period_type: 'monthly', payment_cadence: 'quarterly', pay_months: [3, 6, 9, 12] },
    outcome_config: { currency: 'MXN', min_payout: 0, max_payout: 50000, rounding: 'nearest_cent' },
    metadata: {
      plan_type: 'online_assist',
      gates: [{ id: 'attendance_gate', name: 'Requisito de Asistencia', type: 'threshold', field: 'attendance_pct', operator: 'gte', value: 90, failure_action: 'zero_payout' }],
      coordination: { payroll_gate: { combined_with: 'plan_de_piso', max_total_payout_pct_of_base: 300 } },
    },
    created_by: PROF_ADMIN,
  }, { onConflict: 'id' });
  if (rs2Err) console.error('  RS2 error:', rs2Err.message);
  else console.log('  Rule set 2: Plan de Asistencia Online');

  // ── 6. Rule Set Assignments (18 floor × 2 plans = 36) ──
  console.log('\n6. Creating rule set assignments...');
  let assignIdx = 0;
  for (const ind of FLOOR_ASSOCIATES) {
    for (const rsId of [RS_FLOOR_ID, RS_ONLINE_ID]) {
      assignIdx++;
      const assignId = `b2000000-0060-0000-0000-${String(assignIdx).padStart(12, '0')}`;
      const { error } = await supabase.from('rule_set_assignments').upsert({
        id: assignId,
        tenant_id: TENANT_ID,
        rule_set_id: rsId,
        entity_id: ind.id,
        effective_from: '2025-09-01',
        effective_to: '2026-08-31',
        assignment_type: 'direct',
      }, { onConflict: 'id' });
      if (error && !error.message.includes('duplicate')) {
        console.error(`  Assignment error ${ind.ext}:`, error.message);
      }
    }
  }
  console.log(`  ${assignIdx} assignments created`);

  // ── 7. Periods ──
  console.log('\n7. Creating periods...');
  for (let mi = 0; mi < 6; mi++) {
    const monthKey = MONTHS[mi];
    const [year, month] = monthKey.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    await supabase.from('periods').upsert({
      id: PERIOD_IDS[monthKey as keyof typeof PERIOD_IDS],
      tenant_id: TENANT_ID,
      label: MONTH_LABELS[mi],
      period_type: 'monthly',
      status: 'closed',
      start_date: startDate,
      end_date: endDate,
      canonical_key: monthKey,
    }, { onConflict: 'id' });
  }
  // Quarterly periods
  await supabase.from('periods').upsert({
    id: PERIOD_IDS['Q1-FY26'],
    tenant_id: TENANT_ID,
    label: 'Q1 FY26 (Sep-Nov 2025)',
    period_type: 'quarterly',
    status: 'closed',
    start_date: '2025-09-01',
    end_date: '2025-11-30',
    canonical_key: 'Q1-FY26',
  }, { onConflict: 'id' });
  await supabase.from('periods').upsert({
    id: PERIOD_IDS['Q2-FY26'],
    tenant_id: TENANT_ID,
    label: 'Q2 FY26 (Dec 2025-Feb 2026)',
    period_type: 'quarterly',
    status: 'open',
    start_date: '2025-12-01',
    end_date: '2026-02-28',
    canonical_key: 'Q2-FY26',
  }, { onConflict: 'id' });
  console.log('  8 periods created');

  // ── 8. Import Batches ──
  console.log('\n8. Creating import batches...');
  for (const monthKey of MONTHS) {
    await supabase.from('import_batches').upsert({
      id: IB_IDS[monthKey as keyof typeof IB_IDS],
      tenant_id: TENANT_ID,
      file_name: `velocidad_${monthKey.replace('-', '_')}.xlsx`,
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      row_count: 26, // 8 stores + 18 associates
      status: 'completed',
      error_summary: { errors: 0, warnings: 0 },
      uploaded_by: PROF_ADMIN,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }
  console.log('  6 import batches created');

  // ── 9. Committed Data ──
  console.log('\n9. Creating committed data...');

  // Delete existing committed_data first (idempotent re-run)
  await supabase.from('committed_data').delete().eq('tenant_id', TENANT_ID);

  let cdCount = 0;

  for (let mi = 0; mi < 6; mi++) {
    const monthKey = MONTHS[mi] as keyof typeof PERIOD_IDS;
    const periodId = PERIOD_IDS[monthKey];
    const ibId = IB_IDS[monthKey as keyof typeof IB_IDS];

    // Store-level metrics
    for (const store of STORES) {
      const att = STORE_ATT[store.id][mi];
      await upsertCommittedData(store.id, periodId, ibId, 'store_metrics', {
        store_attainment_percent: att,
        monthly_target_units: store.target,
        store_type: store.type,
      });
      cdCount++;
    }

    // Individual-level metrics
    for (const ind of FLOOR_ASSOCIATES) {
      const att = getAttainment(ind, mi);
      const units = generateUnits(ind, mi);
      const onlineOrders = generateOnlineOrders(ind, mi);
      const csat = generateCSAT(ind, mi);

      await upsertCommittedData(ind.id, periodId, ibId, 'individual_sales', {
        units_calzado: units.calzado,
        units_rodados: units.rodados,
        units_textil: units.textil,
        units_accesorios: units.accesorios,
        units_total: units.calzado + units.rodados + units.textil + units.accesorios,
        store_attainment_percent: att,
        attendance_pct: ind.attendance,
        online_orders_fulfilled: onlineOrders,
        customer_satisfaction_score: csat,
        consecutive_qualifying_months: ind.streakMonths > 0 ? Math.min(ind.streakMonths, mi + 1) : 0,
      });
      cdCount++;
    }
  }
  console.log(`  ${cdCount} committed data rows created`);

  // ── 10. Calculation Batches ──
  console.log('\n10. Creating calculation batches...');

  // Monthly batches
  for (let mi = 0; mi < 6; mi++) {
    const monthKey = MONTHS[mi] as keyof typeof CB_IDS;
    const isQ3 = mi < 3;
    await supabase.from('calculation_batches').upsert({
      id: CB_IDS[monthKey],
      tenant_id: TENANT_ID,
      period_id: PERIOD_IDS[monthKey as keyof typeof PERIOD_IDS],
      rule_set_id: RS_FLOOR_ID,
      batch_type: 'standard',
      lifecycle_state: isQ3 ? 'CLOSED' : 'APPROVED',
      entity_count: 18,
      config: { rule_set_version: 1, includes_online: true },
      started_at: new Date(Date.now() - (7 - mi) * 86400000).toISOString(),
      completed_at: new Date(Date.now() - (6 - mi) * 86400000).toISOString(),
      created_by: PROF_ADMIN,
    }, { onConflict: 'id' });
  }

  // Quarterly batches (batch_type must be one of: standard, superseding, adjustment, reversal)
  await supabase.from('calculation_batches').upsert({
    id: CB_IDS['Q1-FY26'],
    tenant_id: TENANT_ID,
    period_id: PERIOD_IDS['Q1-FY26'],
    rule_set_id: RS_FLOOR_ID,
    batch_type: 'standard',
    lifecycle_state: 'CLOSED',
    entity_count: 18,
    config: { payout_quarter: 'Q1-FY26', months: ['2025-09', '2025-10', '2025-11'] },
    created_by: PROF_ADMIN,
  }, { onConflict: 'id' });

  await supabase.from('calculation_batches').upsert({
    id: CB_IDS['Q2-FY26'],
    tenant_id: TENANT_ID,
    period_id: PERIOD_IDS['Q2-FY26'],
    rule_set_id: RS_FLOOR_ID,
    batch_type: 'standard',
    lifecycle_state: 'APPROVED',
    entity_count: 18,
    config: { payout_quarter: 'Q2-FY26', months: ['2025-12', '2026-01', '2026-02'] },
    created_by: PROF_ADMIN,
  }, { onConflict: 'id' });
  console.log('  8 calculation batches created');

  // ── 11. Calculation Results ──
  console.log('\n11. Creating calculation results...');
  let crCount = 0;

  // Track quarterly totals for outcomes
  const quarterlyTotals: Record<string, Record<string, { earned: number; medalCounts: Record<string, number>; streakMax: number; components: Record<string, number> }>> = {};

  for (let mi = 0; mi < 6; mi++) {
    const monthKey = MONTHS[mi] as keyof typeof CB_IDS;
    const batchId = CB_IDS[monthKey];
    const periodId = PERIOD_IDS[monthKey as keyof typeof PERIOD_IDS];
    const quarter = mi < 3 ? 'Q1-FY26' : 'Q2-FY26';

    for (let ai = 0; ai < FLOOR_ASSOCIATES.length; ai++) {
      const ind = FLOOR_ASSOCIATES[ai];
      const att = getAttainment(ind, mi);
      const medal = getMedal(att);
      const gatePass = ind.attendance >= 90;
      const units = generateUnits(ind, mi);
      const onlineOrders = generateOnlineOrders(ind, mi);
      const csat = generateCSAT(ind, mi);

      // Floor plan components
      const comisionBase = computeComisionBase(units);
      const bonoAttainment = getBonoAttainment(att);
      // Streak: only compute in the last month of the half (or use running streak)
      const currentStreak = ind.streakMonths > 0 ? Math.min(ind.streakMonths, mi + 1) : 0;
      const streakBonus = (mi === 5) ? getStreakBonus(currentStreak) : (mi === 2 && currentStreak >= 3) ? getStreakBonus(Math.min(currentStreak, 3)) : 0;

      // Online plan
      const pickupBase = onlineOrders * 25;
      const csatMult = getCSATMultiplier(csat);
      const pickupBonus = Math.round(pickupBase * csatMult);

      // Total (zeroed if gate fails)
      const floorTotal = gatePass ? (comisionBase + bonoAttainment + streakBonus) : 0;
      const onlineTotal = gatePass ? pickupBonus : 0;
      const total = floorTotal + onlineTotal;

      const resultId = `b2000000-0070-${String(mi + 1).padStart(4, '0')}-0000-${String(ai + 1).padStart(12, '0')}`;

      const { error } = await supabase.from('calculation_results').upsert({
        id: resultId,
        tenant_id: TENANT_ID,
        batch_id: batchId,
        entity_id: ind.id,
        rule_set_id: RS_FLOOR_ID,
        period_id: periodId,
        total_payout: total,
        components: [
          { id: 'comision_base', name: 'Comision Base', value: gatePass ? comisionBase : 0 },
          { id: 'bono_attainment', name: 'Bono por Logro', value: gatePass ? bonoAttainment : 0 },
          { id: 'streak_bonus', name: 'Bono de Racha', value: gatePass ? streakBonus : 0 },
          { id: 'medal', name: 'Medalla', value: medal, type: 'non_monetary' },
          { id: 'pickup_bonus', name: 'Bono Online', value: gatePass ? pickupBonus : 0, plan: 'online' },
          { id: 'attendance_gate', name: 'Gate Asistencia', value: gatePass ? 'PASS' : 'FAIL', type: 'gate' },
        ],
        metrics: {
          store_attainment: att,
          attendance_pct: ind.attendance,
          units_sold: units.calzado + units.rodados + units.textil + units.accesorios,
          online_orders: onlineOrders,
          csat,
          medal,
          gate_pass: gatePass,
          consecutive_qualifying_months: currentStreak,
        },
        attainment: { store: att / 100 },
        metadata: gatePass ? {} : { gate_failure: `Asistencia ${ind.attendance}% < 90% requerido` },
      }, { onConflict: 'id' });
      if (error) console.error(`  Result error ${ind.ext} ${monthKey}:`, error.message);
      crCount++;

      // Accumulate quarterly totals
      if (!quarterlyTotals[quarter]) quarterlyTotals[quarter] = {};
      if (!quarterlyTotals[quarter][ind.id]) {
        quarterlyTotals[quarter][ind.id] = { earned: 0, medalCounts: { oro: 0, plata: 0, bronce: 0, sin_medalla: 0 }, streakMax: 0, components: { comision_base: 0, bono_attainment: 0, streak_bonus: 0, pickup_bonus: 0 } };
      }
      const qt = quarterlyTotals[quarter][ind.id];
      qt.earned += total;
      qt.medalCounts[medal]++;
      qt.streakMax = Math.max(qt.streakMax, currentStreak);
      qt.components.comision_base += gatePass ? comisionBase : 0;
      qt.components.bono_attainment += gatePass ? bonoAttainment : 0;
      qt.components.streak_bonus += gatePass ? streakBonus : 0;
      qt.components.pickup_bonus += gatePass ? pickupBonus : 0;
    }
  }
  console.log(`  ${crCount} calculation results created`);

  // ── 12. Entity Period Outcomes ──
  console.log('\n12. Creating entity period outcomes...');
  let epoCount = 0;

  for (const quarter of ['Q1-FY26', 'Q2-FY26'] as const) {
    const periodId = PERIOD_IDS[quarter];
    const isPaid = quarter === 'Q1-FY26';

    for (const ind of FLOOR_ASSOCIATES) {
      const qt = quarterlyTotals[quarter]?.[ind.id];
      if (!qt) continue;

      const { error } = await supabase.from('entity_period_outcomes').upsert({
        tenant_id: TENANT_ID,
        entity_id: ind.id,
        period_id: periodId,
        total_payout: qt.earned,
        rule_set_breakdown: [
          { rule_set_id: RS_FLOOR_ID, payout: qt.components.comision_base + qt.components.bono_attainment + qt.components.streak_bonus },
          { rule_set_id: RS_ONLINE_ID, payout: qt.components.pickup_bonus },
        ],
        component_breakdown: qt.components,
        lowest_lifecycle_state: isPaid ? 'CLOSED' : 'APPROVED',
        attainment_summary: { medal_summary: qt.medalCounts, streak_months: qt.streakMax },
        metadata: { payment_status: isPaid ? 'paid' : 'pending' },
      }, { onConflict: 'tenant_id,entity_id,period_id', ignoreDuplicates: true });
      if (error && !error.message.includes('duplicate')) {
        console.error(`  EPO error ${ind.ext} ${quarter}:`, error.message);
      }
      epoCount++;
    }
  }
  console.log(`  ${epoCount} entity period outcomes created`);

  // ── Summary ──
  console.log('\n=== Seed complete ===');
  console.log(`Tenant: Velocidad Deportiva (${TENANT_ID})`);
  console.log('Users: admin@velocidaddeportiva.mx, gerente@velocidaddeportiva.mx, asociado@velocidaddeportiva.mx');
  console.log('Entities: 35 (1 org + 3 regions + 8 stores + 3 teams + 20 individuals)');
  console.log('Rule sets: 2 (Plan de Piso + Plan Online)');
  console.log('Assignments: 36 (18 × 2 plans)');
  console.log('Periods: 8 (6 monthly + 2 quarterly)');
  console.log(`Committed data: ${cdCount} rows`);
  console.log(`Calc results: ${crCount} (18 × 6 months)`);
  console.log(`Outcomes: ${epoCount} (18 × 2 quarters)`);
  console.log('\nKey narratives:');
  console.log('  VD-A01 Carlos Mendoza: 6-month Oro streak, highest earner');
  console.log('  VD-A05 Diego Castillo: GATED (88% attendance, zero payout)');
  console.log('  VD-A10 Lucia Gutierrez: GATED (85% attendance, zero payout)');
  console.log('  VD-A12 Ana Martinez: 4-month Oro streak, rising star');
  console.log('  VD-A11 Roberto Flores: Borderline 90% attendance, inconsistent medals');
}

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

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
    effective_from: '2025-09-01',
  }).select().maybeSingle();
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    console.error(`  Rel error (${sourceId} -> ${targetId}):`, error.message);
  }
}

async function upsertCommittedData(entityId: string, periodId: string, ibId: string, dataType: string, rowData: Record<string, unknown>) {
  const { error } = await supabase.from('committed_data').insert({
    tenant_id: TENANT_ID,
    import_batch_id: ibId,
    entity_id: entityId,
    period_id: periodId,
    data_type: dataType,
    row_data: rowData,
    metadata: { source: 'seed' },
  }).select().maybeSingle();
  if (error && !error.message.includes('duplicate')) {
    console.error(`  CD error (${entityId}/${dataType}/${periodId}):`, error.message);
  }
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
