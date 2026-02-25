#!/usr/bin/env npx tsx
/**
 * Seed script: Sabor Grupo Gastronomico Demo Tenant
 *
 * Creates the full demo tenant in Supabase:
 * - 1 tenant record
 * - 3 auth users + profiles (admin, gerente, mesero)
 * - 64 entities (1 org + 3 brands + 20 locations + 40 staff)
 * - Entity relationships (hierarchy: org→brands→locations→staff)
 * - 2 rule sets (Performance Index + Server Commission)
 * - 80 rule set assignments (both rule sets × 40 servers)
 * - 1 period (Enero 2024)
 * - ~46,700 POS cheque records in committed_data (batched 5000/req)
 *
 * Idempotent: safe to re-run. Uses ON CONFLICT DO NOTHING / upsert by id.
 *
 * Usage: npx tsx scripts/seed-sabor-grupo.ts
 * Run from web/ directory with .env.local loaded:
 *   set -a && source .env.local && set +a && npx tsx scripts/seed-sabor-grupo.ts
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

// ── Deterministic UUIDs ──────────────────────────────────────────────────────
const TENANT_ID = '10000000-0001-0000-0000-000000000001';
const PERIOD_ID = '10000000-0002-0000-0000-000000000001';
const RS_PERFORMANCE_ID = '10000000-0003-0000-0000-000000000001';
const RS_COMMISSION_ID = '10000000-0003-0000-0000-000000000002';
const IMPORT_BATCH_ID = '10000000-0004-0000-0000-000000000001';

// Profile UUIDs
const PROFILE_ADMIN_ID = '10000000-0010-0000-0000-000000000001';
const PROFILE_MANAGER_ID = '10000000-0010-0000-0000-000000000002';
const PROFILE_REP_ID = '10000000-0010-0000-0000-000000000003';

// ── Entity UUIDs ─────────────────────────────────────────────────────────────
const ORG_ID = '10000000-1000-0000-0000-000000000001';

// Brands
const BRAND_FD_ID = '10000000-2000-0000-0000-000000000001'; // Fuego Dorado
const BRAND_RV_ID = '10000000-2000-0000-0000-000000000002'; // Rapido Verde
const BRAND_CA_ID = '10000000-2000-0000-0000-000000000003'; // Costa Azul

// Location UUIDs — Fuego Dorado (8)
const LOC_FD_CDMX_001 = '10000000-3000-0000-0000-000000000001';
const LOC_FD_CDMX_002 = '10000000-3000-0000-0000-000000000002';
const LOC_FD_MTY_001 = '10000000-3000-0000-0000-000000000003';
const LOC_FD_GDL_001 = '10000000-3000-0000-0000-000000000004';
const LOC_FD_GDL_002 = '10000000-3000-0000-0000-000000000005';
const LOC_FD_CUN_001 = '10000000-3000-0000-0000-000000000006';
const LOC_FD_PUE_001 = '10000000-3000-0000-0000-000000000007';
const LOC_FD_QRO_001 = '10000000-3000-0000-0000-000000000008';

// Location UUIDs — Rapido Verde (7)
const LOC_RV_CDMX_001 = '10000000-3000-0000-0000-000000000009';
const LOC_RV_CDMX_002 = '10000000-3000-0000-0000-000000000010';
const LOC_RV_MTY_001 = '10000000-3000-0000-0000-000000000011';
const LOC_RV_MTY_002 = '10000000-3000-0000-0000-000000000012';
const LOC_RV_GDL_001 = '10000000-3000-0000-0000-000000000013';
const LOC_RV_TIJ_001 = '10000000-3000-0000-0000-000000000014';
const LOC_RV_LEO_001 = '10000000-3000-0000-0000-000000000015';

// Location UUIDs — Costa Azul (5)
const LOC_CA_CUN_001 = '10000000-3000-0000-0000-000000000016';
const LOC_CA_CUN_002 = '10000000-3000-0000-0000-000000000017';
const LOC_CA_PVR_001 = '10000000-3000-0000-0000-000000000018';
const LOC_CA_MAZ_001 = '10000000-3000-0000-0000-000000000019';
const LOC_CA_VER_001 = '10000000-3000-0000-0000-000000000020';

// Staff UUIDs: indices 0-39, mesero_ids 1001-1040
// Each location gets 2 servers. Order: FD locations (8×2=16), RV locations (7×2=14), CA locations (5×2=10)
function staffId(idx: number): string {
  return `10000000-4000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
}

// ── Location data ─────────────────────────────────────────────────────────────

interface LocationMeta {
  brand_id: string;
  brand_code: string;
  format: string;
  region: string;
  state: string;
  city: string;
  capacity_tables: number;
  pos_system: string;
  status: string;
  tags: string[];
  nickname?: string;
  [key: string]: unknown;
}

const LOCATIONS: Array<{
  id: string;
  extId: string;
  name: string;
  brandId: string;
  meta: LocationMeta;
}> = [
  // ── Fuego Dorado (full_service) ──
  {
    id: LOC_FD_CDMX_001,
    extId: 'FD-CDMX-001',
    name: 'Fuego Dorado Polanco',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'centro', state: 'CDMX', city: 'Ciudad de Mexico',
      capacity_tables: 55, pos_system: 'softrestaurant_v11',
      status: 'active', tags: ['flagship'], nickname: 'Oro',
    },
  },
  {
    id: LOC_FD_CDMX_002,
    extId: 'FD-CDMX-002',
    name: 'Fuego Dorado Condesa',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'centro', state: 'CDMX', city: 'Ciudad de Mexico',
      capacity_tables: 45, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_FD_MTY_001,
    extId: 'FD-MTY-001',
    name: 'Fuego Dorado San Pedro',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'norte', state: 'NL', city: 'Monterrey',
      capacity_tables: 50, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [], nickname: 'Oro',
    },
  },
  {
    id: LOC_FD_GDL_001,
    extId: 'FD-GDL-001',
    name: 'Fuego Dorado Chapultepec',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'occidente', state: 'JAL', city: 'Guadalajara',
      capacity_tables: 40, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_FD_GDL_002,
    extId: 'FD-GDL-002',
    name: 'Fuego Dorado Providencia',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'occidente', state: 'JAL', city: 'Guadalajara',
      capacity_tables: 45, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_FD_CUN_001,
    extId: 'FD-CUN-001',
    name: 'Fuego Dorado Zona Hotelera',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'sureste', state: 'QROO', city: 'Cancun',
      capacity_tables: 65, pos_system: 'softrestaurant_v12',
      status: 'active', tags: ['tourist_zone'], nickname: 'Oro',
    },
  },
  {
    id: LOC_FD_PUE_001,
    extId: 'FD-PUE-001',
    name: 'Fuego Dorado Angelopolis',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'centro', state: 'PUE', city: 'Puebla',
      capacity_tables: 35, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_FD_QRO_001,
    extId: 'FD-QRO-001',
    name: 'Fuego Dorado Juriquilla',
    brandId: BRAND_FD_ID,
    meta: {
      brand_id: BRAND_FD_ID, brand_code: 'FD', format: 'full_service',
      region: 'centro', state: 'QRO', city: 'Queretaro',
      capacity_tables: 30, pos_system: 'softrestaurant_v12',
      status: 'active', tags: ['expansion'], nickname: 'Expansion',
    },
  },
  // ── Rapido Verde (express) ──
  {
    id: LOC_RV_CDMX_001,
    extId: 'RV-CDMX-001',
    name: 'Rapido Verde Roma',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'centro', state: 'CDMX', city: 'Ciudad de Mexico',
      capacity_tables: 30, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [], nickname: 'Oro',
    },
  },
  {
    id: LOC_RV_CDMX_002,
    extId: 'RV-CDMX-002',
    name: 'Rapido Verde Coyoacan',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'centro', state: 'CDMX', city: 'Ciudad de Mexico',
      capacity_tables: 28, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_RV_MTY_001,
    extId: 'RV-MTY-001',
    name: 'Rapido Verde Garza Garcia',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'norte', state: 'NL', city: 'Monterrey',
      capacity_tables: 25, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_RV_MTY_002,
    extId: 'RV-MTY-002',
    name: 'Rapido Verde Cumbres',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'norte', state: 'NL', city: 'Monterrey',
      capacity_tables: 32, pos_system: 'softrestaurant_v12',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_RV_GDL_001,
    extId: 'RV-GDL-001',
    name: 'Rapido Verde Tlaquepaque',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'occidente', state: 'JAL', city: 'Guadalajara',
      capacity_tables: 26, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_RV_TIJ_001,
    extId: 'RV-TIJ-001',
    name: 'Rapido Verde Zona Rio',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'norte', state: 'BCN', city: 'Tijuana',
      capacity_tables: 28, pos_system: 'icg',
      status: 'active', tags: ['expansion'], nickname: 'Expansion',
    },
  },
  {
    id: LOC_RV_LEO_001,
    extId: 'RV-LEO-001',
    name: 'Rapido Verde Centro Max',
    brandId: BRAND_RV_ID,
    meta: {
      brand_id: BRAND_RV_ID, brand_code: 'RV', format: 'express',
      region: 'norte', state: 'GTO', city: 'Leon',
      capacity_tables: 25, pos_system: 'softrestaurant_v11',
      status: 'active', tags: ['expansion'], nickname: 'Expansion',
    },
  },
  // ── Costa Azul (seafood) ──
  {
    id: LOC_CA_CUN_001,
    extId: 'CA-CUN-001',
    name: 'Costa Azul Malecon',
    brandId: BRAND_CA_ID,
    meta: {
      brand_id: BRAND_CA_ID, brand_code: 'CA', format: 'seafood',
      region: 'sureste', state: 'QROO', city: 'Cancun',
      capacity_tables: 50, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [], nickname: 'Oro',
    },
  },
  {
    id: LOC_CA_CUN_002,
    extId: 'CA-CUN-002',
    name: 'Costa Azul Puerto Juarez',
    brandId: BRAND_CA_ID,
    meta: {
      brand_id: BRAND_CA_ID, brand_code: 'CA', format: 'seafood',
      region: 'sureste', state: 'QROO', city: 'Cancun',
      capacity_tables: 40, pos_system: 'softrestaurant_v12',
      status: 'active', tags: [],
    },
  },
  {
    id: LOC_CA_PVR_001,
    extId: 'CA-PVR-001',
    name: 'Costa Azul Marina Vallarta',
    brandId: BRAND_CA_ID,
    meta: {
      brand_id: BRAND_CA_ID, brand_code: 'CA', format: 'seafood',
      region: 'occidente', state: 'JAL', city: 'Puerto Vallarta',
      capacity_tables: 45, pos_system: 'softrestaurant_v11',
      status: 'active', tags: [], nickname: 'Oro',
    },
  },
  {
    id: LOC_CA_MAZ_001,
    extId: 'CA-MAZ-001',
    name: 'Costa Azul Playa Norte',
    brandId: BRAND_CA_ID,
    meta: {
      brand_id: BRAND_CA_ID, brand_code: 'CA', format: 'seafood',
      region: 'occidente', state: 'SIN', city: 'Mazatlan',
      capacity_tables: 55, pos_system: 'softrestaurant_v11',
      status: 'active', tags: ['expansion'], nickname: 'Oro+Expansion',
    },
  },
  {
    id: LOC_CA_VER_001,
    extId: 'CA-VER-001',
    name: 'Costa Azul Boca del Rio',
    brandId: BRAND_CA_ID,
    meta: {
      brand_id: BRAND_CA_ID, brand_code: 'CA', format: 'seafood',
      region: 'sureste', state: 'VER', city: 'Veracruz',
      capacity_tables: 35, pos_system: 'icg',
      status: 'active', tags: ['expansion'], nickname: 'Expansion',
    },
  },
];

// ── Staff (40 servers, 2 per location, Mexican 4-name format) ─────────────────

interface StaffMeta {
  location_id: string;
  location_ext_id: string;
  brand_code: string;
  role: string;
  hire_date: string;
  shift_pattern: number;
  mesero_id: number;
}

const STAFF: Array<{ id: string; name: string; extId: string; locationId: string; meseroId: number; meta: StaffMeta }> = [];

// 2 servers per location, alternating shift_pattern 1/2
// Names: 40 realistic 4-part Mexican names
const STAFF_NAMES = [
  // FD-CDMX-001 (1001, 1002)
  'Carlos Eduardo Garcia Lopez',
  'Maria Guadalupe Rodriguez Hernandez',
  // FD-CDMX-002 (1003, 1004)
  'Juan Pablo Martinez Perez',
  'Ana Sofia Gonzalez Torres',
  // FD-MTY-001 (1005, 1006)
  'Pedro Antonio Sanchez Rivera',
  'Daniela Alejandra Flores Gomez',
  // FD-GDL-001 (1007, 1008)
  'Miguel Angel Diaz Cruz',
  'Isabella Fernanda Morales Reyes',
  // FD-GDL-002 (1009, 1010)
  'Luis Fernando Gutierrez Ortiz',
  'Valentina Cristina Castillo Ramos',
  // FD-CUN-001 (1011, 1012)
  'Diego Alejandro Santos Jimenez',
  'Camila Renata Ruiz Mendoza',
  // FD-PUE-001 (1013, 1014)
  'Roberto Carlos Herrera Aguilar',
  'Patricia Elena Vargas Nunez',
  // FD-QRO-001 (1015, 1016)
  'Francisco Javier Ramirez Delgado',
  'Adriana Belen Cruz Medina',
  // RV-CDMX-001 (1017, 1018)
  'Andres Felipe Munoz Salinas',
  'Fernanda Paola Vega Rios',
  // RV-CDMX-002 (1019, 1020)
  'Ricardo Emilio Soto Pena',
  'Mariana Lucia Ortega Campos',
  // RV-MTY-001 (1021, 1022)
  'Alejandro Ivan Romero Fuentes',
  'Gabriela Monserrat Reyes Serrano',
  // RV-MTY-002 (1023, 1024)
  'Eduardo Jose Estrada Ibarra',
  'Monica Alicia Olvera Cabrera',
  // RV-GDL-001 (1025, 1026)
  'Hector Manuel Lara Espinosa',
  'Silvia Teresa Guerrero Trejo',
  // RV-TIJ-001 (1027, 1028)
  'Oscar Daniel Medina Acosta',
  'Claudia Veronica Perez Sandoval',
  // RV-LEO-001 (1029, 1030)
  'Raul Alberto Navarro Dominguez',
  'Leticia Esperanza Mora Guzman',
  // CA-CUN-001 (1031, 1032)
  'Sergio Arturo Tapia Villanueva',
  'Elena Cristina Pacheco Alvarado',
  // CA-CUN-002 (1033, 1034)
  'Enrique Rafael Luna Zavala',
  'Rosa Margarita Avila Cordova',
  // CA-PVR-001 (1035, 1036)
  'Salvador Ignacio Barrera Ponce',
  'Norma Beatriz Solis Carrillo',
  // CA-MAZ-001 (1037, 1038)
  'Gerardo Alfredo Mendez Bernal',
  'Graciela Yolanda Rueda Uribe',
  // CA-VER-001 (1039, 1040)
  'Armando Ernesto Cuellar Meza',
  'Cecilia Marisol Arroyo Fuentes',
];

const HIRE_DATES = [
  '2021-03-15', '2021-08-20', '2022-01-10', '2022-06-01',
  '2021-04-15', '2022-11-20', '2022-03-01', '2023-09-15',
  '2022-07-05', '2021-07-10', '2021-02-28', '2022-05-15',
  '2022-08-22', '2023-01-07', '2021-11-03', '2022-04-18',
  '2022-06-30', '2023-02-14', '2021-09-25', '2022-03-08',
  '2022-12-01', '2023-04-19', '2022-05-23', '2021-10-11',
  '2022-07-16', '2023-06-05', '2023-08-20', '2022-09-14',
  '2023-01-27', '2022-02-09', '2021-05-17', '2022-08-03',
  '2023-03-12', '2022-11-29', '2021-12-06', '2023-05-21',
  '2023-07-08', '2022-01-24', '2023-09-03', '2022-06-15',
];

// Build STAFF array: iterate LOCATIONS in order, 2 servers each
let staffIdx = 0;
for (const loc of LOCATIONS) {
  for (let pair = 0; pair < 2; pair++) {
    const meseroId = 1001 + staffIdx;
    const idx = staffIdx;
    STAFF.push({
      id: staffId(idx),
      name: STAFF_NAMES[idx],
      extId: `SGG-MESERO-${meseroId}`,
      locationId: loc.id,
      meseroId,
      meta: {
        location_id: loc.id,
        location_ext_id: loc.extId,
        brand_code: loc.meta.brand_code,
        role: 'mesero',
        hire_date: HIRE_DATES[idx],
        shift_pattern: (pair % 2) + 1, // 1 or 2
        mesero_id: meseroId,
      },
    });
    staffIdx++;
  }
}

// ── Brand benchmarks for cheque generation ────────────────────────────────────

interface BrandBenchmark {
  cheques_per_day_min: number;
  cheques_per_day_max: number;
  avg_ticket_min: number;
  avg_ticket_max: number;
  avg_persons_min: number;
  avg_persons_max: number;
  tip_rate_min: number;   // as fraction
  tip_rate_max: number;
  cash_rate: number;      // fraction paid in cash
  cancel_rate: number;    // fraction cancelled
  discount_rate: number;  // fraction with discount
}

const BRAND_BENCHMARKS: Record<string, BrandBenchmark> = {
  FD: {
    cheques_per_day_min: 80, cheques_per_day_max: 120,
    avg_ticket_min: 320, avg_ticket_max: 680,
    avg_persons_min: 2, avg_persons_max: 6,
    tip_rate_min: 0.12, tip_rate_max: 0.18,
    cash_rate: 0.25,
    cancel_rate: 0.02,
    discount_rate: 0.08,
  },
  RV: {
    cheques_per_day_min: 120, cheques_per_day_max: 180,
    avg_ticket_min: 120, avg_ticket_max: 260,
    avg_persons_min: 1, avg_persons_max: 4,
    tip_rate_min: 0.08, tip_rate_max: 0.14,
    cash_rate: 0.35,
    cancel_rate: 0.03,
    discount_rate: 0.05,
  },
  CA: {
    cheques_per_day_min: 60, cheques_per_day_max: 90,
    avg_ticket_min: 450, avg_ticket_max: 950,
    avg_persons_min: 2, avg_persons_max: 8,
    tip_rate_min: 0.13, tip_rate_max: 0.20,
    cash_rate: 0.20,
    cancel_rate: 0.02,
    discount_rate: 0.06,
  },
};

// Anomaly overrides per location
interface AnomalyOverride {
  cancel_rate?: number;
  tip_rate_max?: number;
  tip_rate_min?: number;
  avg_ticket_min?: number;
  avg_ticket_max?: number;
  cash_rate?: number;
  concentration_mesero?: number; // if set, this mesero_id gets 60% of cheques
  night_shift_boost?: boolean;
}

const ANOMALY_OVERRIDES: Record<string, AnomalyOverride> = {
  'RV-MTY-002': { cancel_rate: 0.12 },            // high cancellation rate
  'FD-GDL-002': { tip_rate_min: 0.02, tip_rate_max: 0.05 }, // low tips
  'CA-MAZ-001': { avg_ticket_min: 200, avg_ticket_max: 350 }, // low revenue
  'RV-TIJ-001': { cash_rate: 0.70 },              // high cash payments
  'FD-CUN-001': { concentration_mesero: 1011 },   // concentration on 1 server
  'CA-VER-001': { night_shift_boost: true },       // night shift anomaly
};

// ── Simple deterministic PRNG (mulberry32) ────────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(randBetween(rng, min, max + 1));
}

// ── Auth Users ───────────────────────────────────────────────────────────────

const AUTH_USERS = [
  {
    email: 'admin@saborgrupo.mx',
    password: 'demo-password-SG1',
    displayName: 'Ana Cristina Vidal',
    role: 'admin',
    profileId: PROFILE_ADMIN_ID,
    capabilities: [
      'view_outcomes', 'approve_outcomes', 'export_results',
      'manage_rule_sets', 'manage_assignments', 'design_scenarios',
      'import_data', 'view_audit', 'manage_profiles',
    ],
    entityId: null as string | null,
  },
  {
    email: 'gerente@saborgrupo.mx',
    password: 'demo-password-SG2',
    displayName: 'Marco Antonio Rios',
    role: 'manager',
    profileId: PROFILE_MANAGER_ID,
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results'],
    entityId: null as string | null,
  },
  {
    email: 'mesero@saborgrupo.mx',
    password: 'demo-password-SG3',
    displayName: STAFF[0].name,
    role: 'sales_rep',
    profileId: PROFILE_REP_ID,
    capabilities: ['view_outcomes'],
    entityId: STAFF[0].id,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Sabor Grupo Gastronomico Demo Tenant Seed ===\n');
  console.log(`Tenant ID : ${TENANT_ID}`);
  console.log(`Locations : ${LOCATIONS.length}`);
  console.log(`Staff     : ${STAFF.length}`);
  console.log('');

  // ── 1. Tenant ──
  console.log('1. Creating tenant...');
  const { error: tenantErr } = await supabase.from('tenants').upsert({
    id: TENANT_ID,
    name: 'Sabor Grupo Gastronomico',
    slug: 'sabor-grupo',
    locale: 'es-MX',
    currency: 'MXN',
    features: {
      financial: true,
      compensation: true,
      performance: true,
      disputes: true,
      reconciliation: true,
    },
    settings: {
      demo: true,
      dual_module: true,
      timezone: 'America/Mexico_City',
      fiscalYearStart: '01-01',
      country_code: 'MX',
      outcome_label: 'Comision',
      domain_labels: { rule_set: 'Plan de Compensacion', outcome_value: 'Pago' },
      hierarchy_labels: {
        '0': 'Corporativo',
        '1': 'Marca',
        '2': 'Sucursal',
        '3': 'Personal',
      },
      entity_type_labels: {
        individual: 'Mesero',
        location: 'Sucursal',
        team: 'Equipo',
        organization: 'Empresa',
      },
      demo_users: [
        { email: 'admin@saborgrupo.mx', password: 'demo-password-SG1', label: 'Admin', icon: 'shield' },
        { email: 'gerente@saborgrupo.mx', password: 'demo-password-SG2', label: 'Gerente', icon: 'users' },
        { email: 'mesero@saborgrupo.mx', password: 'demo-password-SG3', label: 'Mesero', icon: 'user' },
      ],
    },
    hierarchy_labels: {
      level_1: 'Marca',
      level_2: 'Sucursal',
      level_3: 'Personal',
    },
    entity_type_labels: {
      individual: 'Mesero',
      location: 'Sucursal',
      team: 'Equipo',
      organization: 'Empresa',
    },
  }, { onConflict: 'id' });
  if (tenantErr) console.error('  Tenant error:', tenantErr.message);
  else console.log('  Tenant created: Sabor Grupo Gastronomico');

  // ── 2. Auth Users + Profiles ──
  console.log('\n2. Creating auth users and profiles...');
  for (const u of AUTH_USERS) {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(eu => eu.email === u.email);

    let authUserId: string;
    if (existing) {
      authUserId = existing.id;
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

    // Link entity to profile (entities.profile_id → profiles.id) if applicable
    if (u.entityId) {
      const { error: linkErr } = await supabase.from('entities')
        .update({ profile_id: u.profileId })
        .eq('id', u.entityId)
        .eq('tenant_id', TENANT_ID);
      if (linkErr) console.error(`  Entity link error for ${u.email}:`, linkErr.message);
      else console.log(`  Entity linked: ${u.entityId} → profile ${u.profileId}`);
    }
  }

  // ── 3. Platform admin check ──
  console.log('\n3. Checking platform admin profile...');
  const { data: platformProfile } = await supabase
    .from('profiles')
    .select('id, role, capabilities')
    .eq('email', 'platform@vialuce.com')
    .single();

  if (platformProfile) {
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
    console.log('  No platform@vialuce.com profile found (OK)');
  }

  // ── 4. Entities ──
  console.log('\n4. Creating entities (64 total)...');

  // Organization
  await upsertEntity(ORG_ID, 'organization', 'SGG-CORP', 'Sabor Grupo Gastronomico', {
    role: 'holding',
    country: 'MX',
  });

  // Brands
  await upsertEntity(BRAND_FD_ID, 'organization', 'FD-BRAND', 'Fuego Dorado', {
    role: 'brand',
    format: 'full_service',
    benchmark_cheques_per_day_min: 80,
    benchmark_cheques_per_day_max: 120,
    avg_ticket_range: [320, 680],
  });
  await upsertEntity(BRAND_RV_ID, 'organization', 'RV-BRAND', 'Rapido Verde', {
    role: 'brand',
    format: 'express',
    benchmark_cheques_per_day_min: 120,
    benchmark_cheques_per_day_max: 180,
    avg_ticket_range: [120, 260],
  });
  await upsertEntity(BRAND_CA_ID, 'organization', 'CA-BRAND', 'Costa Azul', {
    role: 'brand',
    format: 'seafood',
    benchmark_cheques_per_day_min: 60,
    benchmark_cheques_per_day_max: 90,
    avg_ticket_range: [450, 950],
  });

  // Locations
  for (const loc of LOCATIONS) {
    await upsertEntity(loc.id, 'location', loc.extId, loc.name, loc.meta);
  }

  // Staff
  for (const s of STAFF) {
    await upsertEntity(s.id, 'individual', s.extId, s.name, {
      ...s.meta,
      status: 'active',
    });
  }

  console.log(`  1 org + 3 brands + ${LOCATIONS.length} locations + ${STAFF.length} staff = 64 entities created`);

  // ── 5. Entity Relationships ──
  console.log('\n5. Creating entity relationships...');

  // Delete existing relationships for this tenant (idempotent)
  await supabase.from('entity_relationships').delete().eq('tenant_id', TENANT_ID);

  // Org → Brands
  await upsertRelationship(ORG_ID, BRAND_FD_ID, 'contains');
  await upsertRelationship(ORG_ID, BRAND_RV_ID, 'contains');
  await upsertRelationship(ORG_ID, BRAND_CA_ID, 'contains');

  // Brands → Locations
  for (const loc of LOCATIONS) {
    await upsertRelationship(loc.brandId, loc.id, 'contains');
  }

  // Locations → Staff (manages)
  for (const s of STAFF) {
    await upsertRelationship(s.locationId, s.id, 'manages');
  }

  console.log(`  3 org→brand + ${LOCATIONS.length} brand→loc + ${STAFF.length} loc→staff = ${3 + LOCATIONS.length + STAFF.length} relationships`);

  // ── 6. Rule Sets ──
  console.log('\n6. Creating rule sets...');

  // Rule Set 1: Performance Index
  const { error: rs1Err } = await supabase.from('rule_sets').upsert({
    id: RS_PERFORMANCE_ID,
    tenant_id: TENANT_ID,
    name: 'Indice de Desempeno - Sabor Grupo Gastronomico',
    description: 'Plan de evaluacion de desempeno para meseros basado en 4 componentes ponderados',
    status: 'active',
    version: 1,
    effective_from: '2024-01-01',
    effective_to: '2024-12-31',
    population_config: {
      entity_types: ['individual'],
      filters: [{ field: 'meta.role', operator: 'equals', value: 'mesero' }],
      scope: 'tenant',
    },
    input_bindings: {
      pos_revenue: { source: 'committed_data', data_type: 'pos_cheque', aggregation: 'sum', field: 'total' },
      pos_tips: { source: 'committed_data', data_type: 'pos_cheque', aggregation: 'sum', field: 'propina' },
      pos_cancels: { source: 'committed_data', data_type: 'pos_cheque', aggregation: 'count_where', where: { cancelado: 1 } },
      pos_total_cheques: { source: 'committed_data', data_type: 'pos_cheque', aggregation: 'count' },
    },
    components: buildPerformanceComponents(),
    cadence_config: { period_type: 'monthly', payment_lag_days: 10, prorate_partial_months: false },
    outcome_config: {
      type: 'tier_classification',
      tiers: [
        { id: 'elite', label: 'Elite', min_score: 90, color: '#FFD700', badge: 'star' },
        { id: 'avanzado', label: 'Avanzado', min_score: 75, color: '#C0C0C0', badge: 'chevron-up' },
        { id: 'en_desarrollo', label: 'En Desarrollo', min_score: 60, color: '#CD7F32', badge: 'minus' },
        { id: 'necesita_mejora', label: 'Necesita Mejora', min_score: 0, color: '#FF4444', badge: 'alert-triangle' },
      ],
    },
    metadata: { plan_type: 'weighted_index', index_max: 100 },
    created_by: PROFILE_ADMIN_ID,
  }, { onConflict: 'id' });
  if (rs1Err) console.error('  Rule set 1 error:', rs1Err.message);
  else console.log('  Rule set 1 created: Indice de Desempeno');

  // Rule Set 2: Server Commission
  const { error: rs2Err } = await supabase.from('rule_sets').upsert({
    id: RS_COMMISSION_ID,
    tenant_id: TENANT_ID,
    name: 'Comision por Ventas - Meseros',
    description: 'Comision monetaria para meseros basada en ventas personales con tabla de tasas por nivel',
    status: 'active',
    version: 1,
    effective_from: '2024-01-01',
    effective_to: '2024-12-31',
    population_config: {
      entity_types: ['individual'],
      filters: [{ field: 'meta.role', operator: 'equals', value: 'mesero' }],
      scope: 'tenant',
    },
    input_bindings: {
      ventas_personales: { source: 'committed_data', data_type: 'pos_cheque', aggregation: 'sum', field: 'total' },
    },
    components: buildCommissionComponents(),
    cadence_config: { period_type: 'monthly', payment_lag_days: 10, prorate_partial_months: true },
    outcome_config: {
      type: 'monetary_payout',
      currency: 'MXN',
      min_payout: 0,
      max_payout: 15000,
      rounding: 'nearest_peso',
    },
    metadata: { plan_type: 'tiered_commission' },
    created_by: PROFILE_ADMIN_ID,
  }, { onConflict: 'id' });
  if (rs2Err) console.error('  Rule set 2 error:', rs2Err.message);
  else console.log('  Rule set 2 created: Comision por Ventas');

  // ── 7. Rule Set Assignments (80 total: 2 rule sets × 40 staff) ──
  console.log('\n7. Creating rule set assignments (80 total)...');
  let assignCount = 0;
  for (let i = 0; i < STAFF.length; i++) {
    const s = STAFF[i];

    // Assignment for performance index
    const aId1 = `10000000-0005-0000-0001-${String(i + 1).padStart(12, '0')}`;
    const { error: a1Err } = await supabase.from('rule_set_assignments').upsert({
      id: aId1,
      tenant_id: TENANT_ID,
      rule_set_id: RS_PERFORMANCE_ID,
      entity_id: s.id,
      effective_from: '2024-01-01',
      effective_to: '2024-12-31',
      assignment_type: 'direct',
    }, { onConflict: 'id' });
    if (a1Err && !a1Err.message.includes('duplicate')) {
      console.error(`  Assignment 1 error for ${s.name}:`, a1Err.message);
    } else assignCount++;

    // Assignment for commission
    const aId2 = `10000000-0005-0000-0002-${String(i + 1).padStart(12, '0')}`;
    const { error: a2Err } = await supabase.from('rule_set_assignments').upsert({
      id: aId2,
      tenant_id: TENANT_ID,
      rule_set_id: RS_COMMISSION_ID,
      entity_id: s.id,
      effective_from: '2024-01-01',
      effective_to: '2024-12-31',
      assignment_type: 'direct',
    }, { onConflict: 'id' });
    if (a2Err && !a2Err.message.includes('duplicate')) {
      console.error(`  Assignment 2 error for ${s.name}:`, a2Err.message);
    } else assignCount++;
  }
  console.log(`  ${assignCount} assignments created`);

  // ── 8. Period ──
  console.log('\n8. Creating period...');
  const { error: periodErr } = await supabase.from('periods').upsert({
    id: PERIOD_ID,
    tenant_id: TENANT_ID,
    label: 'Enero 2024',
    period_type: 'monthly',
    status: 'open',
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
    file_name: 'sabor_grupo_enero_2024_pos.csv',
    file_type: 'text/csv',
    row_count: 46700,
    status: 'completed',
    error_summary: { errors: 0, warnings: 0 },
    uploaded_by: PROFILE_ADMIN_ID,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (ibErr) console.error('  Import batch error:', ibErr.message);
  else console.log('  Import batch created');

  // ── 10. POS Cheque Data (~46,700 records) ──
  console.log('\n10. Generating POS cheque data (this may take a few minutes)...');

  // Delete existing committed_data for this tenant first (idempotent)
  console.log('    Deleting existing committed_data...');
  await supabase.from('committed_data').delete().eq('tenant_id', TENANT_ID);

  const allCheques = generateAllCheques();
  console.log(`    Generated ${allCheques.length} cheque records`);

  // Batch insert in chunks of 5000
  const BATCH_SIZE = 5000;
  const totalBatches = Math.ceil(allCheques.length / BATCH_SIZE);
  let insertedTotal = 0;

  for (let b = 0; b < totalBatches; b++) {
    const chunk = allCheques.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const rows = chunk.map(cheque => ({
      id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      import_batch_id: IMPORT_BATCH_ID,
      entity_id: cheque.entity_id,
      period_id: PERIOD_ID,
      data_type: 'pos_cheque',
      row_data: cheque.row_data,
      metadata: { source: 'seed', location_ext_id: cheque.location_ext_id, brand_code: cheque.brand_code },
    }));

    const { error: insertErr } = await supabase.from('committed_data').insert(rows);
    if (insertErr) {
      console.error(`    Batch ${b + 1}/${totalBatches} error:`, insertErr.message);
    } else {
      insertedTotal += chunk.length;
      process.stdout.write(`\r    Inserted ${insertedTotal}/${allCheques.length} cheques (batch ${b + 1}/${totalBatches})`);
    }
  }
  console.log(`\n    Done. Total inserted: ${insertedTotal}`);

  // ── Summary ──
  console.log('\n=== Seed complete ===');
  console.log(`Tenant   : Sabor Grupo Gastronomico (${TENANT_ID})`);
  console.log('Users    : admin@saborgrupo.mx, gerente@saborgrupo.mx, mesero@saborgrupo.mx');
  console.log('Entities : 64 (1 org + 3 brands + 20 locations + 40 staff)');
  console.log('Rule Sets: 2 (Indice de Desempeno + Comision por Ventas)');
  console.log('Assignments: 80 (2 rule sets × 40 staff)');
  console.log('Period   : Enero 2024 (2024-01-01 – 2024-01-31)');
  console.log(`Cheques  : ${insertedTotal} POS records (3 weeks, 20 locations)`);
}

// ── Cheque generation ─────────────────────────────────────────────────────────

interface ChequeRecord {
  entity_id: string;
  location_ext_id: string;
  brand_code: string;
  row_data: Record<string, unknown>;
}

function generateAllCheques(): ChequeRecord[] {
  const records: ChequeRecord[] = [];

  // 3 weeks: Jan 1–21 2024
  const dates: string[] = [];
  for (let d = 1; d <= 21; d++) {
    dates.push(`2024-01-${String(d).padStart(2, '0')}`);
  }

  // Turnos (shifts)
  const TURNOS = ['manana', 'tarde', 'noche'];

  for (const loc of LOCATIONS) {
    const bm = BRAND_BENCHMARKS[loc.meta.brand_code];
    const anomaly = ANOMALY_OVERRIDES[loc.extId] || {};
    const locStaff = STAFF.filter(s => s.locationId === loc.id);

    // Use seeded RNG per location for reproducibility
    const seed = loc.extId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rng = seededRandom(seed * 31337);

    let folioCounter = 1;

    for (const fecha of dates) {
      const chequesThisDay = randInt(rng, bm.cheques_per_day_min, bm.cheques_per_day_max);

      for (let c = 0; c < chequesThisDay; c++) {
        // Assign turno (1=morning, 2=afternoon, 3=night per prompt spec)
        const turnoRoll = rng();
        let turno_id: number;
        if (anomaly.night_shift_boost) {
          // CA-VER-001: night shift anomaly — 60% noche
          turno_id = turnoRoll < 0.6 ? 3 : turnoRoll < 0.8 ? 2 : 1;
        } else {
          turno_id = turnoRoll < 0.35 ? 1 : turnoRoll < 0.70 ? 2 : 3;
        }

        // Assign mesero
        let assignedStaff: typeof STAFF[0];
        if (anomaly.concentration_mesero) {
          // FD-CUN-001: 60% of cheques go to mesero 1011
          const conc = locStaff.find(s => s.meseroId === anomaly.concentration_mesero);
          if (conc && rng() < 0.6) {
            assignedStaff = conc;
          } else {
            assignedStaff = locStaff[Math.floor(rng() * locStaff.length)];
          }
        } else {
          assignedStaff = locStaff[Math.floor(rng() * locStaff.length)];
        }

        // Cancellation
        const cancelRate = anomaly.cancel_rate ?? bm.cancel_rate;
        const cancelado = rng() < cancelRate ? 1 : 0;

        // Ticket amount
        const ticketMin = anomaly.avg_ticket_min ?? bm.avg_ticket_min;
        const ticketMax = anomaly.avg_ticket_max ?? bm.avg_ticket_max;
        const rawTotal = Math.round(randBetween(rng, ticketMin, ticketMax) * 100) / 100;

        // IVA 16%
        const subtotal = Math.round((rawTotal / 1.16) * 100) / 100;
        const total_impuesto = Math.round((rawTotal - subtotal) * 100) / 100;

        // Discount
        const hasDiscount = rng() < bm.discount_rate;
        const descuento = hasDiscount ? Math.round(rawTotal * randBetween(rng, 0.05, 0.15) * 100) / 100 : 0;
        const subtotal_con_descuento = Math.round((subtotal - descuento) * 100) / 100;
        const total_descuentos = descuento;

        // Cortesias (comps)
        const hasCortesia = rng() < 0.02;
        const total_cortesias = hasCortesia ? Math.round(rawTotal * randBetween(rng, 0.05, 0.20) * 100) / 100 : 0;

        // Alimentos / Bebidas split (~70/30)
        const total_alimentos = Math.round(rawTotal * randBetween(rng, 0.60, 0.80) * 100) / 100;
        const total_bebidas = Math.round((rawTotal - total_alimentos) * 100) / 100;

        // Payment method
        const cashRate = anomaly.cash_rate ?? bm.cash_rate;
        const efectivo = rng() < cashRate ? Math.round(rawTotal * 100) / 100 : 0;
        const tarjeta = efectivo > 0 ? 0 : Math.round(rawTotal * 100) / 100;

        // Tip
        const tipMin = anomaly.tip_rate_min ?? bm.tip_rate_min;
        const tipMax = anomaly.tip_rate_max ?? bm.tip_rate_max;
        const propina = cancelado
          ? 0
          : Math.round(rawTotal * randBetween(rng, tipMin, tipMax) * 100) / 100;

        // Persons
        const numero_de_personas = randInt(rng, bm.avg_persons_min, bm.avg_persons_max);

        // Timestamps
        const hourBase = turno_id === 1 ? 8 : turno_id === 2 ? 13 : 19;
        const hourOffset = Math.floor(rng() * 4);
        const minuteOffset = Math.floor(rng() * 60);
        const fechaHora = `${fecha}T${String(hourBase + hourOffset).padStart(2, '0')}:${String(minuteOffset).padStart(2, '0')}:00`;
        const cierreHour = hourBase + hourOffset + Math.floor(rng() * 2) + 1;
        const cierre = `${fecha}T${String(Math.min(cierreHour, 23)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}:00`;

        const total = cancelado ? 0 : rawTotal;
        const folio = `${loc.extId}-${fecha.replace(/-/g, '')}-${String(folioCounter).padStart(5, '0')}`;
        folioCounter++;

        records.push({
          entity_id: loc.id, // entity_id points to LOCATION entity; mesero_id in row_data links to staff
          location_ext_id: loc.extId,
          brand_code: loc.meta.brand_code,
          row_data: {
            // Location / context fields
            numero_franquicia: loc.extId,
            turno_id,
            folio,
            numero_cheque: folioCounter,
            fecha: fechaHora,
            cierre,
            // Guests
            numero_de_personas,
            // Staff
            mesero_id: assignedStaff.meseroId,
            // Status
            pagado: cancelado ? 0 : 1,
            cancelado,
            // Counts
            total_articulos: randInt(rng, 2, 12),
            // Amounts
            total: cancelado ? 0 : total,
            efectivo: cancelado ? 0 : efectivo,
            tarjeta: cancelado ? 0 : tarjeta,
            propina,
            descuento,
            subtotal: cancelado ? 0 : subtotal,
            subtotal_con_descuento: cancelado ? 0 : subtotal_con_descuento,
            total_impuesto: cancelado ? 0 : total_impuesto,
            total_descuentos,
            total_cortesias,
            total_alimentos: cancelado ? 0 : total_alimentos,
            total_bebidas: cancelado ? 0 : total_bebidas,
          },
        });
      }
    }
  }

  return records;
}

// ── Rule Set Component Builders ───────────────────────────────────────────────

function buildPerformanceComponents() {
  return [
    {
      id: 'eficiencia_ingresos',
      name: 'Eficiencia de Ingresos',
      order: 1,
      enabled: true,
      weight: 0.30,
      component_type: 'metric_attainment',
      measurement_level: 'individual',
      config: {
        metric: 'ventas_totales_mesero',
        target_source: 'location_benchmark',
        scoring: [
          { min: 0, max: 59, score: 0 },
          { min: 60, max: 74, score: 45 },
          { min: 75, max: 89, score: 65 },
          { min: 90, max: 99, score: 80 },
          { min: 100, max: 109, score: 90 },
          { min: 110, max: 999, score: 100 },
        ],
      },
    },
    {
      id: 'calidad_servicio',
      name: 'Calidad de Servicio',
      order: 2,
      enabled: true,
      weight: 0.25,
      component_type: 'metric_inverse',
      measurement_level: 'individual',
      config: {
        metric: 'tasa_cancelaciones',
        scoring: [
          { max_rate: 0.01, score: 100 },
          { max_rate: 0.03, score: 85 },
          { max_rate: 0.05, score: 70 },
          { max_rate: 0.08, score: 50 },
          { max_rate: 0.12, score: 25 },
          { max_rate: 1.00, score: 0 },
        ],
        higher_is_worse: true,
      },
    },
    {
      id: 'disciplina_operativa',
      name: 'Disciplina Operativa',
      order: 3,
      enabled: true,
      weight: 0.25,
      component_type: 'metric_attainment',
      measurement_level: 'individual',
      config: {
        metric: 'propina_promedio_pct',
        scoring: [
          { min: 0, max: 7, score: 30 },
          { min: 7, max: 10, score: 55 },
          { min: 10, max: 13, score: 75 },
          { min: 13, max: 16, score: 90 },
          { min: 16, max: 999, score: 100 },
        ],
      },
    },
    {
      id: 'volumen',
      name: 'Volumen',
      order: 4,
      enabled: true,
      weight: 0.20,
      component_type: 'tier_lookup',
      measurement_level: 'individual',
      config: {
        metric: 'numero_cheques_mes',
        tiers: [
          { min: 0, max: 199, score: 40 },
          { min: 200, max: 299, score: 60 },
          { min: 300, max: 399, score: 80 },
          { min: 400, max: 499, score: 90 },
          { min: 500, max: 9999, score: 100 },
        ],
      },
    },
  ];
}

function buildCommissionComponents() {
  return [
    {
      id: 'comision_ventas',
      name: 'Comision por Ventas Personales',
      order: 1,
      enabled: true,
      weight: 1.0,
      component_type: 'tiered_rate',
      measurement_level: 'individual',
      config: {
        metric: 'ventas_personales_mes',
        tiers: [
          { min: 0, max: 10000, rate: 0.015, label: 'Basico' },
          { min: 10000, max: 20000, rate: 0.020, label: 'Intermedio' },
          { min: 20000, max: 35000, rate: 0.025, label: 'Avanzado' },
          { min: 35000, max: 50000, rate: 0.030, label: 'Superior' },
          { min: 50000, max: 999999, rate: 0.035, label: 'Elite' },
        ],
        tier_type: 'marginal', // commission applies to the amount within each bracket
      },
    },
  ];
}

// ── Shared Helpers ────────────────────────────────────────────────────────────

async function upsertEntity(
  id: string,
  entityType: string,
  externalId: string,
  displayName: string,
  metadata: Record<string, unknown>,
) {
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
    evidence: {},
    context: {},
    effective_from: '2024-01-01',
  }).select().maybeSingle();
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    console.error(`  Relationship error (${sourceId} -> ${targetId}):`, error.message);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
