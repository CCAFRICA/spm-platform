#!/usr/bin/env npx tsx
/**
 * OB-163: Banco Cumbre del Litoral — Proof Tenant #2
 *
 * Creates BCL tenant with:
 * - 85 entities (5 narrative arcs + 80 background)
 * - 4 components (matrix_lookup, tier_lookup, percentage, conditional_gate)
 * - 2 variants (Ejecutivo Senior × 28, Ejecutivo × 57)
 * - Team hierarchy (3 regional managers, branches)
 * - 6 monthly periods (Oct 2025 - Mar 2026)
 * - 510 committed_data rows (85 × 6)
 * - Ground truth calculated with Banker's Rounding (Decision 122)
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/seed-bcl-tenant.ts
 */

import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';

// Configure Decimal.js (Decision 122)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 21,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BCL_TENANT_NAME = 'Banco Cumbre del Litoral';
const BCL_TENANT_SLUG = 'banco-cumbre-litoral';
const BCL_ADMIN_EMAIL = 'admin@bancocumbre.ec';
const BCL_ADMIN_PASSWORD = 'demo-password-BCL1';
const BCL_RULE_SET_ID = 'b1c20001-aaaa-bbbb-cccc-222222222222';

// ──────────────────────────────────────────────
// Seeded PRNG (Mulberry32)
// ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

/** Normal distribution via Box-Muller */
function normalRandom(mean: number, std: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

/** Poisson-distributed random */
function poissonRandom(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Clamp value between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ──────────────────────────────────────────────
// Plan Configuration — Rate Tables
// ──────────────────────────────────────────────

// C1: Colocacion de Credito — Matrix Lookup
// Row: Cumplimiento_Colocacion (attainment %)
// Column: Indice_Calidad_Cartera (quality %)
const C1_ROW_BANDS = [
  { min: 0, max: 70, label: 'Bajo' },
  { min: 70, max: 85, label: 'Medio' },
  { min: 85, max: 100, label: 'Alto' },
  { min: 100, max: Infinity, label: 'Excepcional' },
];
const C1_COL_BANDS = [
  { min: 0, max: 90, label: 'Riesgo' },
  { min: 90, max: 95, label: 'Aceptable' },
  { min: 95, max: Infinity, label: 'Excelente' },
];
const C1_SENIOR_VALUES = [
  [0, 0, 50],       // Bajo
  [100, 200, 300],   // Medio
  [200, 400, 600],   // Alto
  [350, 600, 900],   // Excepcional
];
const C1_STANDARD_VALUES = [
  [0, 0, 25],        // Bajo
  [50, 100, 150],    // Medio
  [100, 200, 300],   // Alto
  [175, 300, 450],   // Excepcional
];

// C2: Captacion de Depositos — Tier Lookup
// Metric: Pct_Meta_Depositos (attainment %)
const C2_TIERS_SENIOR = [
  { min: 0, max: 60, label: 'Sin comision', value: 0 },
  { min: 60, max: 80, label: 'Basico', value: 150 },
  { min: 80, max: 100, label: 'Competente', value: 350 },
  { min: 100, max: 120, label: 'Superior', value: 550 },
  { min: 120, max: Infinity, label: 'Excepcional', value: 750 },
];
const C2_TIERS_STANDARD = [
  { min: 0, max: 60, label: 'Sin comision', value: 0 },
  { min: 60, max: 80, label: 'Basico', value: 75 },
  { min: 80, max: 100, label: 'Competente', value: 175 },
  { min: 100, max: 120, label: 'Superior', value: 275 },
  { min: 120, max: Infinity, label: 'Excepcional', value: 375 },
];

// C3: Productos Cruzados — Scalar Multiply
const C3_RATE_SENIOR = 18; // $18 per cross-sold product
const C3_RATE_STANDARD = 12; // $12 per cross-sold product

// C4: Cumplimiento Regulatorio — Conditional Gate
const C4_PASS_SENIOR = 150; // $150 if 0 infractions
const C4_PASS_STANDARD = 100; // $100 if 0 infractions
// $0 if any infractions

// ──────────────────────────────────────────────
// Seasonal Pattern Multipliers (Oct-Mar)
// ──────────────────────────────────────────────
const SEASONAL = [0.92, 0.95, 1.08, 0.88, 0.96, 1.02]; // Oct, Nov, Dec, Jan, Feb, Mar

// ──────────────────────────────────────────────
// Entity Definitions
// ──────────────────────────────────────────────

interface EntityDef {
  externalId: string;
  displayName: string;
  branch: string;
  role: string;
  level: 'Senior' | 'Standard';
  region: string;
  managerId: string; // external_id of manager
  hireDate: string;
  narrativeArc?: string;
  // Per-month overrides for narrative entities (6 months: Oct-Mar)
  attainmentOverrides?: number[]; // C1 row metric (Cumplimiento_Colocacion)
  qualityOverrides?: number[];    // C1 col metric (Indice_Calidad_Cartera)
  depositOverrides?: number[];    // C2 metric (Pct_Meta_Depositos)
  crossProductOverrides?: number[]; // C3 metric (Cantidad_Productos_Cruzados)
  infractionOverrides?: number[]; // C4 metric (Infracciones_Regulatorias)
}

// Regional managers (not included in the 85 entities for calculation)
const REGIONAL_MANAGERS = [
  { externalId: 'BCL-RM-COSTA', displayName: 'Fernando Hidalgo', region: 'Costa' },
  { externalId: 'BCL-RM-SIERRA', displayName: 'Carolina Mendoza', region: 'Sierra' },
  { externalId: 'BCL-RM-ORIENTE', displayName: 'Luis Andrade', region: 'Oriente' },
];

// Branches per region
const BRANCHES: Record<string, string[]> = {
  Costa: ['Guayaquil Centro', 'Guayaquil Norte', 'Machala'],
  Sierra: ['Quito Sur', 'Quito Norte', 'Cuenca', 'Ambato'],
  Oriente: ['Tena', 'Puyo'],
};

// Manager for each branch (external_id)
const BRANCH_MANAGERS: Record<string, string> = {
  'Guayaquil Centro': 'BCL-RM-COSTA',
  'Guayaquil Norte': 'BCL-RM-COSTA',
  'Machala': 'BCL-RM-COSTA',
  'Quito Sur': 'BCL-RM-SIERRA',
  'Quito Norte': 'BCL-RM-SIERRA',
  'Cuenca': 'BCL-RM-SIERRA',
  'Ambato': 'BCL-RM-SIERRA',
  'Tena': 'BCL-RM-ORIENTE',
  'Puyo': 'BCL-RM-ORIENTE',
};

// Distribution of entities across branches (total = 85)
const BRANCH_SIZES: Record<string, number> = {
  'Guayaquil Centro': 12,
  'Guayaquil Norte': 10,
  'Machala': 8,
  'Quito Sur': 11,
  'Quito Norte': 10,
  'Cuenca': 9,
  'Ambato': 7,
  'Tena': 10,
  'Puyo': 8,
};

// 5 Narrative entities (DS-012 Section 6)
const NARRATIVE_ENTITIES: EntityDef[] = [
  {
    externalId: 'BCL-5012',
    displayName: 'Valentina Salazar',
    branch: 'Guayaquil Centro',
    role: 'Ejecutivo',
    level: 'Standard',
    region: 'Costa',
    managerId: 'BCL-RM-COSTA',
    hireDate: '2023-03-15',
    narrativeArc: 'accelerator',
    attainmentOverrides: [75, 80, 92, 85, 95, 105],
    qualityOverrides: [91, 92, 94, 93, 96, 97],
    depositOverrides: [65, 72, 88, 78, 92, 108],
    crossProductOverrides: [4, 5, 7, 5, 8, 10],
    infractionOverrides: [0, 0, 0, 0, 0, 0],
  },
  {
    externalId: 'BCL-5027',
    displayName: 'Roberto Espinoza',
    branch: 'Quito Sur',
    role: 'Ejecutivo',
    level: 'Standard',
    region: 'Sierra',
    managerId: 'BCL-RM-SIERRA',
    hireDate: '2021-08-01',
    narrativeArc: 'decliner',
    attainmentOverrides: [102, 98, 88, 78, 72, 65],
    qualityOverrides: [96, 95, 93, 91, 89, 87],
    depositOverrides: [110, 105, 92, 82, 70, 58],
    crossProductOverrides: [9, 8, 7, 5, 4, 3],
    infractionOverrides: [0, 0, 1, 0, 1, 2],
  },
  {
    externalId: 'BCL-5041',
    displayName: 'Ana Lucia Paredes',
    branch: 'Cuenca',
    role: 'Ejecutivo',
    level: 'Standard',
    region: 'Sierra',
    managerId: 'BCL-RM-SIERRA',
    hireDate: '2024-01-10',
    narrativeArc: 'recoverer',
    attainmentOverrides: [60, 63, 78, 88, 95, 103],
    qualityOverrides: [88, 89, 92, 94, 96, 97],
    depositOverrides: [55, 58, 75, 85, 98, 112],
    crossProductOverrides: [3, 3, 5, 6, 8, 9],
    infractionOverrides: [2, 1, 0, 0, 0, 0],
  },
  {
    externalId: 'BCL-5063',
    displayName: 'Diego Mora',
    branch: 'Tena',
    role: 'Ejecutivo',
    level: 'Standard',
    region: 'Oriente',
    managerId: 'BCL-RM-ORIENTE',
    hireDate: '2022-06-20',
    narrativeArc: 'gate-blocked',
    attainmentOverrides: [90, 92, 95, 88, 93, 97],
    qualityOverrides: [94, 95, 96, 93, 95, 96],
    depositOverrides: [85, 88, 95, 82, 90, 100],
    crossProductOverrides: [6, 7, 8, 5, 7, 8],
    infractionOverrides: [1, 2, 1, 3, 1, 2], // ALWAYS has infractions → C4 = $0
  },
  {
    externalId: 'BCL-5003',
    displayName: 'Gabriela Vascones',
    branch: 'Guayaquil Centro',
    role: 'Ejecutivo Senior',
    level: 'Senior',
    region: 'Costa',
    managerId: 'BCL-RM-COSTA',
    hireDate: '2020-02-14',
    narrativeArc: 'top-performer',
    attainmentOverrides: [108, 110, 115, 105, 112, 118],
    qualityOverrides: [97, 98, 98, 96, 97, 99],
    depositOverrides: [115, 118, 125, 108, 120, 130],
    crossProductOverrides: [10, 11, 14, 9, 12, 15],
    infractionOverrides: [0, 0, 0, 0, 0, 0], // ZERO infractions → C4 = $150 always
  },
];

// Generate background entities
function generateBackgroundEntities(): EntityDef[] {
  const entities: EntityDef[] = [];
  const ecuadorianNames = [
    'Miguel Torres', 'Sophia Reyes', 'Carlos Andrade', 'Maria Jose Lopez',
    'Andres Herrera', 'Camila Zambrano', 'Juan Pablo Ortiz', 'Isabella Mora',
    'Sebastian Flores', 'Daniela Castillo', 'David Guerrero', 'Valeria Nunez',
    'Ricardo Vega', 'Natalia Rojas', 'Oscar Delgado', 'Paola Suarez',
    'Jorge Medina', 'Alejandra Pena', 'Marco Villacis', 'Lucia Aguirre',
    'Fernando Cruz', 'Andrea Maldonado', 'Gabriel Santos', 'Diana Lara',
    'Eduardo Romero', 'Monica Cordero', 'Rafael Carrion', 'Claudia Bravo',
    'Hector Jaramillo', 'Patricia Alarcon', 'Ivan Solis', 'Mariana Caicedo',
    'Pablo Montoya', 'Karla Perez', 'Nicolas Figueroa', 'Tatiana Davila',
    'Raul Guzman', 'Vanessa Ochoa', 'Santiago Morales', 'Juliana Trujillo',
    'Daniel Acosta', 'Carolina Brito', 'Javier Heredia', 'Elena Velez',
    'Cristian Luna', 'Adriana Vargas', 'Mateo Jimenez', 'Gloria Tapia',
    'Esteban Navarro', 'Roxana Ceron', 'Leonardo Briones', 'Karina Arce',
    'Pedro Duran', 'Angela Moncayo', 'Simon Cabrera', 'Lorena Ibarra',
    'Victor Rios', 'Estefania Borja', 'Alejandro Paz', 'Teresa Salcedo',
    'Gustavo Araujo', 'Silvia Concha', 'Xavier Leiva', 'Susana Avila',
    'Manuel Piedra', 'Rosa Naranjo', 'Alberto Veloz', 'Laura Ramos',
    'Enrique Loor', 'Fernanda Pinto', 'Bryan Calle', 'Alicia Vera',
    'Jonathan Quijano', 'Viviana Mena', 'Christian Proano', 'Yolanda Intriago',
    'Fabian Cordova', 'Sandra Alvarado', 'Mauricio Cevallos', 'Ana Barahona',
  ];

  // Track narrative entity slots
  const narrativeExtIds = new Set(NARRATIVE_ENTITIES.map(e => e.externalId));
  const narrativeBranches: Record<string, number> = {};
  for (const ne of NARRATIVE_ENTITIES) {
    narrativeBranches[ne.branch] = (narrativeBranches[ne.branch] || 0) + 1;
  }

  let nameIdx = 0;
  let entityNum = 5001; // Starting from BCL-5001

  for (const [branch, totalSize] of Object.entries(BRANCH_SIZES)) {
    const narrativeCount = narrativeBranches[branch] || 0;
    const bgCount = totalSize - narrativeCount;
    const region = Object.entries(BRANCHES).find(([, branches]) => branches.includes(branch))?.[0] || 'Costa';
    const managerId = BRANCH_MANAGERS[branch];

    for (let i = 0; i < bgCount; i++) {
      // Skip IDs used by narrative entities
      while (narrativeExtIds.has(`BCL-${entityNum}`)) entityNum++;

      const isSenior = rng() < 0.33; // ~33% senior
      entities.push({
        externalId: `BCL-${entityNum}`,
        displayName: ecuadorianNames[nameIdx % ecuadorianNames.length],
        branch,
        role: isSenior ? 'Ejecutivo Senior' : 'Ejecutivo',
        level: isSenior ? 'Senior' : 'Standard',
        region,
        managerId,
        hireDate: `20${20 + Math.floor(rng() * 5)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      });
      entityNum++;
      nameIdx++;
    }
  }

  return entities;
}

// ──────────────────────────────────────────────
// Monthly Data Generation
// ──────────────────────────────────────────────

interface MonthlyMetrics {
  Cumplimiento_Colocacion: number;
  Indice_Calidad_Cartera: number;
  Pct_Meta_Depositos: number;
  Cantidad_Productos_Cruzados: number;
  Infracciones_Regulatorias: number;
}

function generateMonthlyMetrics(entity: EntityDef, monthIdx: number): MonthlyMetrics {
  if (entity.attainmentOverrides) {
    // Narrative entity — use fixed overrides
    return {
      Cumplimiento_Colocacion: entity.attainmentOverrides[monthIdx],
      Indice_Calidad_Cartera: entity.qualityOverrides![monthIdx],
      Pct_Meta_Depositos: entity.depositOverrides![monthIdx],
      Cantidad_Productos_Cruzados: entity.crossProductOverrides![monthIdx],
      Infracciones_Regulatorias: entity.infractionOverrides![monthIdx],
    };
  }

  // Background entity — seeded random with seasonal pattern
  const seasonal = SEASONAL[monthIdx];
  const baseAttainment = normalRandom(90, 15) * seasonal;
  const lambdaCross = entity.level === 'Senior' ? 9 : 6;
  const hasInfraction = rng() < 0.13; // ~13% chance

  return {
    Cumplimiento_Colocacion: Math.round(clamp(baseAttainment, 40, 130)),
    Indice_Calidad_Cartera: Math.round(clamp(normalRandom(93, 4), 80, 100)),
    Pct_Meta_Depositos: Math.round(clamp(normalRandom(88, 18) * seasonal, 40, 140)),
    Cantidad_Productos_Cruzados: Math.max(0, poissonRandom(lambdaCross * seasonal)),
    Infracciones_Regulatorias: hasInfraction ? Math.max(1, Math.floor(rng() * 3) + 1) : 0,
  };
}

// ──────────────────────────────────────────────
// Ground Truth Calculation (Decision 122)
// ──────────────────────────────────────────────

interface GTResult {
  entityId: string;
  month: string;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  total: number;
}

function calculateC1(metrics: MonthlyMetrics, level: 'Senior' | 'Standard'): number {
  const values = level === 'Senior' ? C1_SENIOR_VALUES : C1_STANDARD_VALUES;
  const rowVal = metrics.Cumplimiento_Colocacion;
  const colVal = metrics.Indice_Calidad_Cartera;

  // Find row band (HF-123: half-open [min, max) except last)
  let rowIdx = -1;
  for (let i = 0; i < C1_ROW_BANDS.length; i++) {
    const band = C1_ROW_BANDS[i];
    const isLast = i === C1_ROW_BANDS.length - 1;
    if (rowVal >= band.min && (isLast ? rowVal <= band.max : rowVal < band.max)) {
      rowIdx = i;
      break;
    }
  }

  // Find col band
  let colIdx = -1;
  for (let i = 0; i < C1_COL_BANDS.length; i++) {
    const band = C1_COL_BANDS[i];
    const isLast = i === C1_COL_BANDS.length - 1;
    if (colVal >= band.min && (isLast ? colVal <= band.max : colVal < band.max)) {
      colIdx = i;
      break;
    }
  }

  if (rowIdx < 0 || colIdx < 0) return 0;
  return values[rowIdx][colIdx];
}

function calculateC2(metrics: MonthlyMetrics, level: 'Senior' | 'Standard'): number {
  const tiers = level === 'Senior' ? C2_TIERS_SENIOR : C2_TIERS_STANDARD;
  const metricVal = metrics.Pct_Meta_Depositos;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const isLast = i === tiers.length - 1;
    if (metricVal >= tier.min && (isLast ? metricVal <= tier.max : metricVal < tier.max)) {
      return tier.value;
    }
  }
  return 0;
}

function calculateC3(metrics: MonthlyMetrics, level: 'Senior' | 'Standard'): number {
  const rate = level === 'Senior' ? C3_RATE_SENIOR : C3_RATE_STANDARD;
  return new Decimal(metrics.Cantidad_Productos_Cruzados).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

function calculateC4(metrics: MonthlyMetrics, level: 'Senior' | 'Standard'): number {
  // Conditional gate: 0 infractions → pass value, any infractions → $0
  if (metrics.Infracciones_Regulatorias === 0) {
    return level === 'Senior' ? C4_PASS_SENIOR : C4_PASS_STANDARD;
  }
  return 0;
}

function calculateEntityMonth(metrics: MonthlyMetrics, level: 'Senior' | 'Standard'): { c1: number; c2: number; c3: number; c4: number; total: number } {
  const c1 = calculateC1(metrics, level);
  const c2 = calculateC2(metrics, level);
  const c3 = calculateC3(metrics, level);
  const c4 = calculateC4(metrics, level);
  // GAAP: total = sum of rounded components
  const total = new Decimal(c1).plus(c2).plus(c3).plus(c4).toNumber();
  return { c1, c2, c3, c4, total };
}

// ──────────────────────────────────────────────
// Plan Component Structure (for rule_sets.components)
// ──────────────────────────────────────────────

function buildPlanComponents(level: 'Senior' | 'Standard') {
  const values = level === 'Senior' ? C1_SENIOR_VALUES : C1_STANDARD_VALUES;
  const c2Tiers = level === 'Senior' ? C2_TIERS_SENIOR : C2_TIERS_STANDARD;
  const c3Rate = level === 'Senior' ? C3_RATE_SENIOR : C3_RATE_STANDARD;
  const c4Pass = level === 'Senior' ? C4_PASS_SENIOR : C4_PASS_STANDARD;

  return [
    {
      id: `c1-colocacion-${level.toLowerCase()}`,
      name: 'Colocacion de Credito',
      description: 'Comision basada en cumplimiento de colocacion y calidad de cartera',
      order: 1,
      enabled: true,
      componentType: 'matrix_lookup' as const,
      measurementLevel: 'individual' as const,
      matrixConfig: {
        rowMetric: 'Cumplimiento_Colocacion',
        rowMetricLabel: 'Cumplimiento de Colocacion (%)',
        rowBands: C1_ROW_BANDS.map(b => ({
          min: b.min,
          max: b.max === Infinity ? 999 : b.max,
          label: b.label,
        })),
        columnMetric: 'Indice_Calidad_Cartera',
        columnMetricLabel: 'Indice de Calidad de Cartera (%)',
        columnBands: C1_COL_BANDS.map(b => ({
          min: b.min,
          max: b.max === Infinity ? 999 : b.max,
          label: b.label,
        })),
        values,
        currency: 'USD',
      },
      calculationIntent: {
        operation: 'bounded_lookup_2d',
        inputs: {
          row: { source: 'metric', sourceSpec: { field: 'Cumplimiento_Colocacion' } },
          column: { source: 'metric', sourceSpec: { field: 'Indice_Calidad_Cartera' } },
        },
        rowBoundaries: [70, 85, 100],
        columnBoundaries: [90, 95],
        outputGrid: values,
      },
    },
    {
      id: `c2-depositos-${level.toLowerCase()}`,
      name: 'Captacion de Depositos',
      description: 'Comision por cumplimiento de meta de depositos',
      order: 2,
      enabled: true,
      componentType: 'tier_lookup' as const,
      measurementLevel: 'individual' as const,
      tierConfig: {
        metric: 'Pct_Meta_Depositos',
        metricLabel: 'Porcentaje Meta Depositos (%)',
        tiers: c2Tiers.map(t => ({
          min: t.min,
          max: t.max === Infinity ? 999 : t.max,
          label: t.label,
          value: t.value,
        })),
        currency: 'USD',
      },
      calculationIntent: {
        operation: 'bounded_lookup_1d',
        input: { source: 'metric', sourceSpec: { field: 'Pct_Meta_Depositos' } },
        boundaries: [60, 80, 100, 120],
        outputs: c2Tiers.map(t => t.value),
      },
    },
    {
      id: `c3-productos-${level.toLowerCase()}`,
      name: 'Productos Cruzados',
      description: 'Comision por cantidad de productos cruzados vendidos',
      order: 3,
      enabled: true,
      componentType: 'percentage' as const,
      measurementLevel: 'individual' as const,
      percentageConfig: {
        rate: c3Rate,
        appliedTo: 'Cantidad_Productos_Cruzados',
        appliedToLabel: 'Cantidad de Productos Cruzados',
      },
      calculationIntent: {
        operation: 'scalar_multiply',
        input: { source: 'metric', sourceSpec: { field: 'Cantidad_Productos_Cruzados' } },
        rate: c3Rate,
      },
    },
    {
      id: `c4-regulatorio-${level.toLowerCase()}`,
      name: 'Cumplimiento Regulatorio',
      description: 'Bono por cumplimiento regulatorio (0 infracciones)',
      order: 4,
      enabled: true,
      componentType: 'conditional_percentage' as const,
      measurementLevel: 'individual' as const,
      conditionalConfig: {
        appliedTo: 'Infracciones_Regulatorias',
        appliedToLabel: 'Infracciones Regulatorias',
        conditions: [
          {
            metric: 'Infracciones_Regulatorias',
            metricLabel: 'Infracciones',
            min: 0,
            max: 0,
            rate: c4Pass,
            label: 'Sin infracciones',
          },
          {
            metric: 'Infracciones_Regulatorias',
            metricLabel: 'Infracciones',
            min: 1,
            max: 999,
            rate: 0,
            label: 'Con infracciones',
          },
        ],
      },
      calculationIntent: {
        operation: 'conditional_gate',
        condition: {
          operator: 'eq',
          left: { source: 'metric', sourceSpec: { field: 'Infracciones_Regulatorias' } },
          right: { source: 'constant', value: 0 },
        },
        onTrue: { operation: 'constant', value: c4Pass },
        onFalse: { operation: 'constant', value: 0 },
      },
    },
  ];
}

// ──────────────────────────────────────────────
// Periods
// ──────────────────────────────────────────────

const PERIODS = [
  { label: 'October 2025', start: '2025-10-01', end: '2025-10-31', key: '2025-10' },
  { label: 'November 2025', start: '2025-11-01', end: '2025-11-30', key: '2025-11' },
  { label: 'December 2025', start: '2025-12-01', end: '2025-12-31', key: '2025-12' },
  { label: 'January 2026', start: '2026-01-01', end: '2026-01-31', key: '2026-01' },
  { label: 'February 2026', start: '2026-02-01', end: '2026-02-28', key: '2026-02' },
  { label: 'March 2026', start: '2026-03-01', end: '2026-03-31', key: '2026-03' },
];

// ──────────────────────────────────────────────
// Main Seed Function
// ──────────────────────────────────────────────

async function seed() {
  console.log('=== OB-163: Banco Cumbre del Litoral — Proof Tenant #2 ===\n');

  // Combine all entities
  const bgEntities = generateBackgroundEntities();
  const allEntities = [...NARRATIVE_ENTITIES, ...bgEntities];

  // Count variants
  const seniorCount = allEntities.filter(e => e.level === 'Senior').length;
  const standardCount = allEntities.filter(e => e.level === 'Standard').length;
  console.log(`Entities: ${allEntities.length} total (${seniorCount} Senior, ${standardCount} Standard)`);

  // ── Phase 1: Generate all data + GT BEFORE touching database ──
  console.log('\n--- Generating monthly data and computing ground truth ---');

  const allMonthlyData: Array<{ entity: EntityDef; monthIdx: number; metrics: MonthlyMetrics }> = [];
  const allGT: GTResult[] = [];
  let grandTotal = new Decimal(0);

  for (const entity of allEntities) {
    for (let m = 0; m < 6; m++) {
      const metrics = generateMonthlyMetrics(entity, m);
      allMonthlyData.push({ entity, monthIdx: m, metrics });

      const result = calculateEntityMonth(metrics, entity.level);
      allGT.push({
        entityId: entity.externalId,
        month: PERIODS[m].key,
        ...result,
      });
      grandTotal = grandTotal.plus(result.total);
    }
  }

  const grandTotalNum = grandTotal.toNumber();
  console.log(`\nBCL GRAND TOTAL: $${grandTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Entity-months: ${allGT.length}`);

  // ── Verification Anchors ──
  console.log('\n--- Verification Anchors ---');
  const anchors = ['BCL-5012', 'BCL-5063', 'BCL-5003'];
  for (const anchorId of anchors) {
    const entityGT = allGT.filter(r => r.entityId === anchorId);
    const entityName = allEntities.find(e => e.externalId === anchorId)?.displayName;
    console.log(`\n${entityName} (${anchorId}):`);
    let entityTotal = new Decimal(0);
    for (const r of entityGT) {
      console.log(`  ${r.month}: C1=$${r.c1} C2=$${r.c2} C3=$${r.c3} C4=$${r.c4} Total=$${r.total}`);
      entityTotal = entityTotal.plus(r.total);
    }
    console.log(`  6-month total: $${entityTotal.toNumber()}`);
  }

  // ── Phase 2: Create tenant ──
  console.log('\n--- Creating BCL tenant ---');
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', BCL_TENANT_ID)
    .maybeSingle();

  if (existingTenant) {
    console.log('BCL tenant already exists — clearing pipeline data...');
    // Clear in dependency order
    for (const table of [
      'calculation_traces', 'calculation_results', 'entity_period_outcomes',
      'calculation_batches', 'committed_data', 'rule_set_assignments',
      'entity_relationships', 'entities', 'periods', 'rule_sets',
      'import_batches', 'classification_signals',
    ]) {
      await supabase.from(table).delete().eq('tenant_id', BCL_TENANT_ID);
    }
    console.log('Pipeline data cleared.');
  } else {
    const { error: tenantErr } = await supabase.from('tenants').insert({
      id: BCL_TENANT_ID,
      name: BCL_TENANT_NAME,
      slug: BCL_TENANT_SLUG,
      currency: 'USD',
      locale: 'es-EC',
      settings: { industry: 'Banking', country_code: 'EC' },
      features: { compensation: true },
      hierarchy_labels: { region: 'Region', branch: 'Sucursal' },
      entity_type_labels: { individual: 'Ejecutivo' },
    });
    if (tenantErr) throw new Error(`Tenant create failed: ${tenantErr.message}`);
    console.log(`Tenant created: ${BCL_TENANT_NAME}`);
  }

  // ── Phase 3: Create admin auth user + profile ──
  console.log('\n--- Creating admin user ---');
  let adminUserId: string;

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingAdmin = existingUsers?.users?.find(u => u.email === BCL_ADMIN_EMAIL);

  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    console.log(`Admin user exists: ${BCL_ADMIN_EMAIL} (${adminUserId})`);
  } else {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: BCL_ADMIN_EMAIL,
      password: BCL_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Patricia Zambrano', role: 'admin' },
    });
    if (authErr) throw new Error(`Auth user create failed: ${authErr.message}`);
    adminUserId = authUser.user.id;
    console.log(`Admin user created: ${BCL_ADMIN_EMAIL} (${adminUserId})`);
  }

  // Create/update admin profile
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', adminUserId)
    .eq('tenant_id', BCL_TENANT_ID)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from('profiles').insert({
      tenant_id: BCL_TENANT_ID,
      auth_user_id: adminUserId,
      display_name: 'Patricia Zambrano',
      email: BCL_ADMIN_EMAIL,
      role: 'admin',
      capabilities: ['manage_rule_sets', 'import_data', 'manage_assignments', 'view_outcomes'],
    });
    console.log('Admin profile created');
  } else {
    console.log('Admin profile exists');
  }

  // ── Phase 4: Create rule set ──
  console.log('\n--- Creating rule set ---');
  const seniorComponents = buildPlanComponents('Senior');
  const standardComponents = buildPlanComponents('Standard');

  const ruleSetComponents = {
    type: 'additive_lookup',
    variants: [
      {
        variantId: 'ejecutivo-senior',
        variantName: 'Ejecutivo Senior',
        description: 'Plan para ejecutivos senior con tasas mejoradas',
        components: seniorComponents,
      },
      {
        variantId: 'ejecutivo',
        variantName: 'Ejecutivo',
        description: 'Plan estandar para ejecutivos',
        components: standardComponents,
      },
    ],
  };

  // Build convergence bindings (input_bindings)
  const convergenceBindings: Record<string, Record<string, unknown>> = {};
  for (const comp of standardComponents) {
    const compKey = `component_${comp.order}`;
    if (comp.componentType === 'matrix_lookup') {
      convergenceBindings[compKey] = {
        row: { column: 'Cumplimiento_Colocacion', source: 'committed_data' },
        column: { column: 'Indice_Calidad_Cartera', source: 'committed_data' },
      };
    } else if (comp.componentType === 'tier_lookup') {
      convergenceBindings[compKey] = {
        actual: { column: 'Pct_Meta_Depositos', source: 'committed_data' },
      };
    } else if (comp.componentType === 'percentage') {
      convergenceBindings[compKey] = {
        actual: { column: 'Cantidad_Productos_Cruzados', source: 'committed_data' },
      };
    } else if (comp.componentType === 'conditional_percentage') {
      convergenceBindings[compKey] = {
        actual: { column: 'Infracciones_Regulatorias', source: 'committed_data' },
      };
    }
  }

  // Metric mappings
  const metricMappings: Record<string, string> = {
    'Cumplimiento_Colocacion': 'Cumplimiento_Colocacion',
    'Indice_Calidad_Cartera': 'Indice_Calidad_Cartera',
    'Pct_Meta_Depositos': 'Pct_Meta_Depositos',
    'Cantidad_Productos_Cruzados': 'Cantidad_Productos_Cruzados',
    'Infracciones_Regulatorias': 'Infracciones_Regulatorias',
  };

  const { error: rsErr } = await supabase.from('rule_sets').upsert({
    id: BCL_RULE_SET_ID,
    tenant_id: BCL_TENANT_ID,
    name: 'Plan de Comisiones BCL 2025',
    description: 'Plan de comisiones para Banco Cumbre del Litoral — 4 componentes, 2 variantes',
    status: 'active',
    version: 1,
    effective_from: '2025-10-01',
    effective_to: '2026-03-31',
    population_config: { eligible_roles: ['Ejecutivo', 'Ejecutivo Senior'] },
    input_bindings: {
      convergence_bindings: convergenceBindings,
      metric_mappings: metricMappings,
    },
    components: ruleSetComponents,
    cadence_config: { period_type: 'monthly' },
    outcome_config: {},
    metadata: { plan_type: 'additive_lookup' },
    created_by: adminUserId,
  });
  if (rsErr) throw new Error(`Rule set create failed: ${rsErr.message}`);
  console.log(`Rule set created: ${BCL_RULE_SET_ID}`);

  // ── Phase 5: Create entities + relationships ──
  console.log('\n--- Creating entities ---');

  // First create regional manager entities
  const managerEntityIds: Record<string, string> = {};
  for (const mgr of REGIONAL_MANAGERS) {
    const mgrUuid = crypto.randomUUID();
    managerEntityIds[mgr.externalId] = mgrUuid;
    await supabase.from('entities').insert({
      id: mgrUuid,
      tenant_id: BCL_TENANT_ID,
      entity_type: 'individual',
      status: 'active',
      external_id: mgr.externalId,
      display_name: mgr.displayName,
      metadata: { region: mgr.region, role: 'Gerente Regional' },
      temporal_attributes: {},
    });
  }
  console.log(`Created ${REGIONAL_MANAGERS.length} regional managers`);

  // Create individual entities
  const entityUuids: Record<string, string> = {};
  const entityInserts: Array<Record<string, unknown>> = [];
  for (const entity of allEntities) {
    const uuid = crypto.randomUUID();
    entityUuids[entity.externalId] = uuid;
    entityInserts.push({
      id: uuid,
      tenant_id: BCL_TENANT_ID,
      entity_type: 'individual',
      status: 'active',
      external_id: entity.externalId,
      display_name: entity.displayName,
      metadata: {
        branch: entity.branch,
        role: entity.role,
        level: entity.level,
        region: entity.region,
        hire_date: entity.hireDate,
      },
      temporal_attributes: {},
    });
  }

  // Bulk insert entities (5000+ chunk per AP-2)
  const { error: entErr } = await supabase.from('entities').insert(entityInserts);
  if (entErr) throw new Error(`Entity insert failed: ${entErr.message}`);
  console.log(`Created ${entityInserts.length} individual entities`);

  // Create entity relationships (individual → manager)
  const relationshipInserts: Array<Record<string, unknown>> = [];
  for (const entity of allEntities) {
    const sourceId = entityUuids[entity.externalId];
    const targetId = managerEntityIds[entity.managerId];
    if (sourceId && targetId) {
      relationshipInserts.push({
        tenant_id: BCL_TENANT_ID,
        source_entity_id: targetId,  // manager
        target_entity_id: sourceId,  // individual
        relationship_type: 'manages',
        source: 'imported_explicit',
        confidence: 1,
        evidence: { imported_from: 'seed_script' },
        context: { branch: entity.branch, region: entity.region },
      });
    }
  }

  const { error: relErr } = await supabase.from('entity_relationships').insert(relationshipInserts);
  if (relErr) throw new Error(`Relationship insert failed: ${relErr.message}`);
  console.log(`Created ${relationshipInserts.length} entity relationships`);

  // ── Phase 6: Create rule_set_assignments ──
  console.log('\n--- Creating rule set assignments ---');
  const assignmentInserts: Array<Record<string, unknown>> = [];
  for (const entity of allEntities) {
    const uuid = entityUuids[entity.externalId];
    assignmentInserts.push({
      tenant_id: BCL_TENANT_ID,
      rule_set_id: BCL_RULE_SET_ID,
      entity_id: uuid,
      assignment_type: 'direct',
      metadata: { variant: entity.level === 'Senior' ? 'ejecutivo-senior' : 'ejecutivo' },
    });
  }

  const { error: asgErr } = await supabase.from('rule_set_assignments').insert(assignmentInserts);
  if (asgErr) throw new Error(`Assignment insert failed: ${asgErr.message}`);
  console.log(`Created ${assignmentInserts.length} rule set assignments`);

  // ── Phase 7: Create periods ──
  console.log('\n--- Creating periods ---');
  const periodUuids: Record<string, string> = {};
  for (const period of PERIODS) {
    const uuid = crypto.randomUUID();
    periodUuids[period.key] = uuid;
    const { error: pErr } = await supabase.from('periods').insert({
      id: uuid,
      tenant_id: BCL_TENANT_ID,
      label: period.label,
      period_type: 'monthly',
      status: 'open',
      start_date: period.start,
      end_date: period.end,
      canonical_key: period.key,
      metadata: { source: 'ob163_bcl_seed' },
    });
    if (pErr) throw new Error(`Period create failed: ${pErr.message}`);
  }
  console.log(`Created ${PERIODS.length} periods`);

  // ── Phase 8: Create committed_data ──
  console.log('\n--- Creating committed_data ---');
  const committedInserts: Array<Record<string, unknown>> = [];

  for (const { entity, monthIdx, metrics } of allMonthlyData) {
    const entityUuid = entityUuids[entity.externalId];
    const period = PERIODS[monthIdx];

    committedInserts.push({
      tenant_id: BCL_TENANT_ID,
      entity_id: entityUuid,
      period_id: periodUuids[period.key],
      data_type: 'performance_data',
      source_date: period.start,
      row_data: {
        ...metrics,
        _entity_external_id: entity.externalId,
        _entity_name: entity.displayName,
        _branch: entity.branch,
        _level: entity.level,
      },
      metadata: { source: 'ob163_bcl_seed', month: period.key },
    });
  }

  // Bulk insert (510 rows — well within single-batch limit)
  const { error: cdErr } = await supabase.from('committed_data').insert(committedInserts);
  if (cdErr) throw new Error(`committed_data insert failed: ${cdErr.message}`);
  console.log(`Created ${committedInserts.length} committed_data rows`);

  // ── Phase 9: Write GT file ──
  console.log('\n\n========================================');
  console.log('BCL GROUND TRUTH SUMMARY');
  console.log('========================================');
  console.log(`Grand Total (6 months, ${allEntities.length} entities, 4 components): $${grandTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  // Per-month totals
  for (let m = 0; m < 6; m++) {
    const monthGT = allGT.filter(r => r.month === PERIODS[m].key);
    const monthTotal = monthGT.reduce((sum, r) => sum + r.total, 0);
    const monthC1 = monthGT.reduce((sum, r) => sum + r.c1, 0);
    const monthC2 = monthGT.reduce((sum, r) => sum + r.c2, 0);
    const monthC3 = monthGT.reduce((sum, r) => sum + r.c3, 0);
    const monthC4 = monthGT.reduce((sum, r) => sum + r.c4, 0);
    console.log(`  ${PERIODS[m].key}: C1=$${monthC1} C2=$${monthC2} C3=$${monthC3} C4=$${monthC4} Total=$${monthTotal}`);
  }

  // Component totals
  const totalC1 = allGT.reduce((sum, r) => sum + r.c1, 0);
  const totalC2 = allGT.reduce((sum, r) => sum + r.c2, 0);
  const totalC3 = allGT.reduce((sum, r) => sum + r.c3, 0);
  const totalC4 = allGT.reduce((sum, r) => sum + r.c4, 0);
  console.log(`\nComponent totals: C1=$${totalC1} C2=$${totalC2} C3=$${totalC3} C4=$${totalC4}`);

  // Variant breakdown
  const seniorGT = allGT.filter(r => {
    const ent = allEntities.find(e => e.externalId === r.entityId);
    return ent?.level === 'Senior';
  });
  const standardGT = allGT.filter(r => {
    const ent = allEntities.find(e => e.externalId === r.entityId);
    return ent?.level === 'Standard';
  });
  console.log(`\nSenior variant (${seniorCount} entities): $${seniorGT.reduce((s, r) => s + r.total, 0)}`);
  console.log(`Standard variant (${standardCount} entities): $${standardGT.reduce((s, r) => s + r.total, 0)}`);

  // Write GT to JSON for verification
  const gtSummary = {
    grandTotal: grandTotalNum,
    entityCount: allEntities.length,
    monthCount: 6,
    componentCount: 4,
    seniorCount,
    standardCount,
    perMonthTotals: PERIODS.map((p, i) => ({
      month: p.key,
      total: allGT.filter(r => r.month === p.key).reduce((s, r) => s + r.total, 0),
    })),
    componentTotals: { c1: totalC1, c2: totalC2, c3: totalC3, c4: totalC4 },
    anchors: {
      'BCL-5012': allGT.filter(r => r.entityId === 'BCL-5012'),
      'BCL-5063': allGT.filter(r => r.entityId === 'BCL-5063'),
      'BCL-5003': allGT.filter(r => r.entityId === 'BCL-5003'),
    },
    tenantId: BCL_TENANT_ID,
    ruleSetId: BCL_RULE_SET_ID,
    periodIds: periodUuids,
    entityUuids: Object.fromEntries(anchors.map(id => [id, entityUuids[id]])),
    managerEntityIds,
  };

  // Write to file
  const fs = await import('fs');
  fs.writeFileSync(
    new URL('./bcl-ground-truth.json', import.meta.url).pathname,
    JSON.stringify(gtSummary, null, 2)
  );
  console.log('\nGT written to scripts/bcl-ground-truth.json');

  console.log('\n=== BCL TENANT SEED COMPLETE ===');
  console.log(`Tenant: ${BCL_TENANT_NAME} (${BCL_TENANT_ID})`);
  console.log(`Rule Set: ${BCL_RULE_SET_ID}`);
  console.log(`Entities: ${allEntities.length} (${seniorCount} Senior, ${standardCount} Standard)`);
  console.log(`Periods: ${PERIODS.length}`);
  console.log(`Committed Data: ${committedInserts.length} rows`);
  console.log(`Relationships: ${relationshipInserts.length}`);
  console.log(`Grand Total GT: $${grandTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
}

seed().catch(err => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
