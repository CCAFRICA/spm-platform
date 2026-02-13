/**
 * FRMX Demo Tenant Provisioner
 *
 * Auto-provisions the FRMX demo tenant with realistic Mexican restaurant data:
 * - 3 brands (Cocina Dorada, Taco Veloz, Mar y Brasa)
 * - 20 locations with 7 pattern behaviors
 * - 50 servers with performance patterns
 * - ~12,000+ cheques (5 weeks: Dec 2-30, 2024)
 *
 * Data flows through ChequeImportService (real pipeline).
 *
 * 7 Location Patterns:
 *   strong      - Consistently above-average revenue and volume
 *   star        - Top performer, highest check averages and tips
 *   normal      - Baseline performance
 *   slow        - Below-average volume, lower checks
 *   declining   - Week-over-week revenue decrease (-5%/week)
 *   seasonal    - Weekend/holiday spikes (tourist areas)
 *   high_cancel - Elevated cancellation rate (8-12%)
 */

import { ChequeImportService } from '@/lib/financial/cheque-import-service';
import type { Cheque } from '@/lib/financial/types';

// =============================================================================
// TYPES
// =============================================================================

type LocationPattern = 'strong' | 'star' | 'normal' | 'slow' | 'declining' | 'seasonal' | 'high_cancel';
type ServerPattern = 'star' | 'good' | 'average' | 'new' | 'inconsistent';

interface BrandConfig {
  avgCheckBase: number;   // MXN base average check amount
  dailyChecks: number;    // Avg cheques per location per day
  tipRateBase: number;    // Base tip percentage
  foodRatio: number;      // Food proportion (remainder = beverage)
}

interface PatternBehavior {
  revenueMultiplier: number;     // Applied to daily volume
  checkMultiplier: number;       // Applied to check amount
  cancelRate: number;            // Probability of cancellation
  weekTrend: number;             // Per-week multiplier delta (declining < 0)
  dayOfWeekMultipliers?: number[]; // Mon-Sun overrides (seasonal)
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FRMX_TENANT_ID = 'frmx-demo';
const STORAGE_KEY_PREFIX = 'frmx_demo_';

// Fixed data range: 5 weeks
const DATA_START = new Date(2024, 11, 2);  // Dec 2, 2024
const DATA_END = new Date(2024, 11, 30);   // Dec 30, 2024

// =============================================================================
// BRANDS & BRAND CONFIGS
// =============================================================================

const BRANDS = [
  { id: 'cocina-dorada', name: 'Cocina Dorada', color: '#D4AF37' },
  { id: 'taco-veloz', name: 'Taco Veloz', color: '#22C55E' },
  { id: 'mar-y-brasa', name: 'Mar y Brasa', color: '#3B82F6' },
];

const BRAND_CONFIGS: Record<string, BrandConfig> = {
  'cocina-dorada': { avgCheckBase: 420, dailyChecks: 20, tipRateBase: 0.16, foodRatio: 0.70 },
  'taco-veloz':    { avgCheckBase: 280, dailyChecks: 25, tipRateBase: 0.13, foodRatio: 0.75 },
  'mar-y-brasa':   { avgCheckBase: 380, dailyChecks: 18, tipRateBase: 0.15, foodRatio: 0.60 },
};

// =============================================================================
// 7 PATTERN BEHAVIORS
// =============================================================================

const PATTERN_BEHAVIORS: Record<LocationPattern, PatternBehavior> = {
  strong:      { revenueMultiplier: 1.20, checkMultiplier: 1.15, cancelRate: 0.02, weekTrend: 0.02 },
  star:        { revenueMultiplier: 1.35, checkMultiplier: 1.25, cancelRate: 0.01, weekTrend: 0.03 },
  normal:      { revenueMultiplier: 1.00, checkMultiplier: 1.00, cancelRate: 0.03, weekTrend: 0.00 },
  slow:        { revenueMultiplier: 0.75, checkMultiplier: 0.85, cancelRate: 0.04, weekTrend: -0.01 },
  declining:   { revenueMultiplier: 0.90, checkMultiplier: 0.92, cancelRate: 0.05, weekTrend: -0.05 },
  seasonal:    {
    revenueMultiplier: 1.00, checkMultiplier: 1.00, cancelRate: 0.02, weekTrend: 0.00,
    dayOfWeekMultipliers: [0.70, 0.70, 0.80, 0.90, 1.30, 1.50, 1.40], // Mon-Sun
  },
  high_cancel: { revenueMultiplier: 0.95, checkMultiplier: 1.00, cancelRate: 0.10, weekTrend: 0.00 },
};

// =============================================================================
// 20 LOCATIONS
// =============================================================================

const LOCATIONS: Array<{
  id: string;
  name: string;
  brand: string;
  city: string;
  pattern: LocationPattern;
}> = [
  // Cocina Dorada -- 8 locations (upscale Mexican)
  { id: 'FRMX-CD-GDL-001', name: 'Cocina Dorada Guadalajara Centro', brand: 'cocina-dorada', city: 'Guadalajara', pattern: 'star' },
  { id: 'FRMX-CD-CDMX-001', name: 'Cocina Dorada CDMX Reforma', brand: 'cocina-dorada', city: 'CDMX', pattern: 'declining' },
  { id: 'FRMX-CD-MTY-001', name: 'Cocina Dorada Monterrey', brand: 'cocina-dorada', city: 'Monterrey', pattern: 'normal' },
  { id: 'FRMX-CD-QRO-001', name: 'Cocina Dorada Queretaro', brand: 'cocina-dorada', city: 'Queretaro', pattern: 'strong' },
  { id: 'FRMX-CD-PUE-001', name: 'Cocina Dorada Puebla', brand: 'cocina-dorada', city: 'Puebla', pattern: 'slow' },
  { id: 'FRMX-CD-CDMX-002', name: 'Cocina Dorada CDMX Polanco', brand: 'cocina-dorada', city: 'CDMX', pattern: 'star' },
  { id: 'FRMX-CD-GDL-002', name: 'Cocina Dorada Guadalajara Zapopan', brand: 'cocina-dorada', city: 'Guadalajara', pattern: 'normal' },
  { id: 'FRMX-CD-AGS-001', name: 'Cocina Dorada Aguascalientes', brand: 'cocina-dorada', city: 'Aguascalientes', pattern: 'seasonal' },

  // Taco Veloz -- 7 locations (fast-casual)
  { id: 'FRMX-TV-MTY-001', name: 'Taco Veloz Monterrey Centro', brand: 'taco-veloz', city: 'Monterrey', pattern: 'high_cancel' },
  { id: 'FRMX-TV-GDL-001', name: 'Taco Veloz Guadalajara Norte', brand: 'taco-veloz', city: 'Guadalajara', pattern: 'normal' },
  { id: 'FRMX-TV-CDMX-001', name: 'Taco Veloz CDMX Sur', brand: 'taco-veloz', city: 'CDMX', pattern: 'strong' },
  { id: 'FRMX-TV-CDMX-002', name: 'Taco Veloz CDMX Coyoacan', brand: 'taco-veloz', city: 'CDMX', pattern: 'normal' },
  { id: 'FRMX-TV-TIJ-001', name: 'Taco Veloz Tijuana', brand: 'taco-veloz', city: 'Tijuana', pattern: 'declining' },
  { id: 'FRMX-TV-LEO-001', name: 'Taco Veloz Leon', brand: 'taco-veloz', city: 'Leon', pattern: 'slow' },
  { id: 'FRMX-TV-MTY-002', name: 'Taco Veloz Monterrey Sur', brand: 'taco-veloz', city: 'Monterrey', pattern: 'strong' },

  // Mar y Brasa -- 5 locations (seafood & grill)
  { id: 'FRMX-MB-CAN-001', name: 'Mar y Brasa Cancun Zona Hotelera', brand: 'mar-y-brasa', city: 'Cancun', pattern: 'star' },
  { id: 'FRMX-MB-PVR-001', name: 'Mar y Brasa Puerto Vallarta', brand: 'mar-y-brasa', city: 'Puerto Vallarta', pattern: 'seasonal' },
  { id: 'FRMX-MB-MZT-001', name: 'Mar y Brasa Mazatlan', brand: 'mar-y-brasa', city: 'Mazatlan', pattern: 'seasonal' },
  { id: 'FRMX-MB-CDMX-001', name: 'Mar y Brasa CDMX Roma', brand: 'mar-y-brasa', city: 'CDMX', pattern: 'normal' },
  { id: 'FRMX-MB-VER-001', name: 'Mar y Brasa Veracruz', brand: 'mar-y-brasa', city: 'Veracruz', pattern: 'slow' },
];

// =============================================================================
// 50 SERVERS
// =============================================================================

const SERVERS: Array<{
  id: number;
  name: string;
  location: string;
  role: string;
  pattern: ServerPattern;
}> = [
  // Cocina Dorada GDL-001 (star, 3 servers)
  { id: 5001, name: 'Maria Garcia', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'star' },
  { id: 5002, name: 'Ana Rodriguez', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'good' },
  { id: 5003, name: 'Camila Gonzalez', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'new' },
  // Cocina Dorada CDMX-001 (declining, 3 servers)
  { id: 5004, name: 'Sofia Martinez', location: 'FRMX-CD-CDMX-001', role: 'Server', pattern: 'good' },
  { id: 5005, name: 'Lucia Morales', location: 'FRMX-CD-CDMX-001', role: 'Server', pattern: 'average' },
  { id: 5006, name: 'Eduardo Aguilar', location: 'FRMX-CD-CDMX-001', role: 'Bartender', pattern: 'new' },
  // Cocina Dorada MTY-001 (normal, 2 servers)
  { id: 5007, name: 'Isabella Ruiz', location: 'FRMX-CD-MTY-001', role: 'Bartender', pattern: 'average' },
  { id: 5008, name: 'Emma Castro', location: 'FRMX-CD-MTY-001', role: 'Server', pattern: 'good' },
  // Cocina Dorada QRO-001 (strong, 2 servers)
  { id: 5009, name: 'Carlos Mendez', location: 'FRMX-CD-QRO-001', role: 'Server', pattern: 'good' },
  { id: 5010, name: 'Mateo Vargas', location: 'FRMX-CD-QRO-001', role: 'Server', pattern: 'average' },
  // Cocina Dorada PUE-001 (slow, 2 servers)
  { id: 5011, name: 'Roberto Luna', location: 'FRMX-CD-PUE-001', role: 'Server', pattern: 'average' },
  { id: 5012, name: 'Patricia Navarro', location: 'FRMX-CD-PUE-001', role: 'Server', pattern: 'new' },
  // Cocina Dorada CDMX-002 (star, 3 servers)
  { id: 5013, name: 'Carmen Delgado', location: 'FRMX-CD-CDMX-002', role: 'Server', pattern: 'star' },
  { id: 5014, name: 'Jorge Castillo', location: 'FRMX-CD-CDMX-002', role: 'Server', pattern: 'good' },
  { id: 5015, name: 'Andrea Silva', location: 'FRMX-CD-CDMX-002', role: 'Bartender', pattern: 'inconsistent' },
  // Cocina Dorada GDL-002 (normal, 3 servers)
  { id: 5016, name: 'Victor Guerrero', location: 'FRMX-CD-GDL-002', role: 'Server', pattern: 'average' },
  { id: 5017, name: 'Guadalupe Mendoza', location: 'FRMX-CD-GDL-002', role: 'Server', pattern: 'good' },
  { id: 5018, name: 'Daniela Herrera', location: 'FRMX-CD-GDL-002', role: 'Server', pattern: 'new' },
  // Cocina Dorada AGS-001 (seasonal, 2 servers)
  { id: 5019, name: 'Rosa Dominguez', location: 'FRMX-CD-AGS-001', role: 'Server', pattern: 'average' },
  { id: 5020, name: 'Omar Jimenez', location: 'FRMX-CD-AGS-001', role: 'Bartender', pattern: 'inconsistent' },

  // Taco Veloz MTY-001 (high_cancel, 3 servers)
  { id: 5021, name: 'Luis Hernandez', location: 'FRMX-TV-MTY-001', role: 'Bartender', pattern: 'good' },
  { id: 5022, name: 'Sebastian Diaz', location: 'FRMX-TV-MTY-001', role: 'Server', pattern: 'average' },
  { id: 5023, name: 'Adriana Flores', location: 'FRMX-TV-MTY-001', role: 'Server', pattern: 'new' },
  // Taco Veloz GDL-001 (normal, 2 servers)
  { id: 5024, name: 'Diego Torres', location: 'FRMX-TV-GDL-001', role: 'Server', pattern: 'average' },
  { id: 5025, name: 'Laura Sanchez', location: 'FRMX-TV-GDL-001', role: 'Server', pattern: 'good' },
  // Taco Veloz CDMX-001 (strong, 3 servers)
  { id: 5026, name: 'Miguel Reyes', location: 'FRMX-TV-CDMX-001', role: 'Server', pattern: 'star' },
  { id: 5027, name: 'Valentina Lopez', location: 'FRMX-TV-CDMX-001', role: 'Server', pattern: 'good' },
  { id: 5028, name: 'Gabriel Ortiz', location: 'FRMX-TV-CDMX-001', role: 'Server', pattern: 'average' },
  // Taco Veloz CDMX-002 (normal, 2 servers)
  { id: 5029, name: 'Mariana Ramirez', location: 'FRMX-TV-CDMX-002', role: 'Server', pattern: 'average' },
  { id: 5030, name: 'Ivan Torres', location: 'FRMX-TV-CDMX-002', role: 'Server', pattern: 'new' },
  // Taco Veloz TIJ-001 (declining, 3 servers)
  { id: 5031, name: 'Fernando Gutierrez', location: 'FRMX-TV-TIJ-001', role: 'Server', pattern: 'average' },
  { id: 5032, name: 'Paula Ramirez', location: 'FRMX-TV-TIJ-001', role: 'Server', pattern: 'inconsistent' },
  { id: 5033, name: 'Elena Morales', location: 'FRMX-TV-TIJ-001', role: 'Server', pattern: 'new' },
  // Taco Veloz LEO-001 (slow, 2 servers)
  { id: 5034, name: 'Javier Luna', location: 'FRMX-TV-LEO-001', role: 'Server', pattern: 'average' },
  { id: 5035, name: 'Natalia Navarro', location: 'FRMX-TV-LEO-001', role: 'Server', pattern: 'new' },
  // Taco Veloz MTY-002 (strong, 3 servers)
  { id: 5036, name: 'Alejandro Flores', location: 'FRMX-TV-MTY-002', role: 'Bartender', pattern: 'good' },
  { id: 5037, name: 'Ricardo Gutierrez', location: 'FRMX-TV-MTY-002', role: 'Server', pattern: 'average' },
  { id: 5038, name: 'Daniel Ortiz', location: 'FRMX-TV-MTY-002', role: 'Server', pattern: 'inconsistent' },

  // Mar y Brasa CAN-001 (star, 3 servers)
  { id: 5039, name: 'Alejandro Mendez', location: 'FRMX-MB-CAN-001', role: 'Server', pattern: 'star' },
  { id: 5040, name: 'Elena Castillo', location: 'FRMX-MB-CAN-001', role: 'Server', pattern: 'good' },
  { id: 5041, name: 'Manuel Dominguez', location: 'FRMX-MB-CAN-001', role: 'Bartender', pattern: 'average' },
  // Mar y Brasa PVR-001 (seasonal, 3 servers)
  { id: 5042, name: 'Valentina Herrera', location: 'FRMX-MB-PVR-001', role: 'Server', pattern: 'average' },
  { id: 5043, name: 'Andres Guerrero', location: 'FRMX-MB-PVR-001', role: 'Server', pattern: 'inconsistent' },
  { id: 5044, name: 'Daniela Luna', location: 'FRMX-MB-PVR-001', role: 'Server', pattern: 'new' },
  // Mar y Brasa MZT-001 (seasonal, 2 servers)
  { id: 5045, name: 'Gabriel Navarro', location: 'FRMX-MB-MZT-001', role: 'Server', pattern: 'average' },
  { id: 5046, name: 'Laura Aguilar', location: 'FRMX-MB-MZT-001', role: 'Server', pattern: 'good' },
  // Mar y Brasa CDMX-001 (normal, 2 servers)
  { id: 5047, name: 'Mariana Delgado', location: 'FRMX-MB-CDMX-001', role: 'Server', pattern: 'good' },
  { id: 5048, name: 'Ivan Jimenez', location: 'FRMX-MB-CDMX-001', role: 'Bartender', pattern: 'average' },
  // Mar y Brasa VER-001 (slow, 2 servers)
  { id: 5049, name: 'Adriana Reyes', location: 'FRMX-MB-VER-001', role: 'Server', pattern: 'average' },
  { id: 5050, name: 'Javier Mendoza', location: 'FRMX-MB-VER-001', role: 'Server', pattern: 'new' },
];

// =============================================================================
// HELPERS
// =============================================================================

function getWeekNumber(date: Date): number {
  const diff = date.getTime() - DATA_START.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

// =============================================================================
// CHEQUE GENERATION
// =============================================================================

function generateCheques(): Cheque[] {
  const cheques: Cheque[] = [];
  let chequeNum = 1000;

  const currentDate = new Date(DATA_START);

  while (currentDate <= DATA_END) {
    const dayOfWeek = currentDate.getDay(); // 0=Sun .. 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekNum = getWeekNumber(currentDate);
    // Convert to Mon=0..Sun=6 index for seasonal dayOfWeekMultipliers
    const dowIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    for (const location of LOCATIONS) {
      const brandConfig = BRAND_CONFIGS[location.brand];
      const pattern = PATTERN_BEHAVIORS[location.pattern];

      // Start with brand base daily checks
      let dailyChecks = brandConfig.dailyChecks;

      // Seasonal: use day-of-week multipliers instead of generic revenueMultiplier
      if (pattern.dayOfWeekMultipliers) {
        dailyChecks = Math.round(dailyChecks * pattern.dayOfWeekMultipliers[dowIndex]);
      } else {
        // Non-seasonal: apply pattern revenue multiplier + weekend boost
        dailyChecks = Math.round(dailyChecks * pattern.revenueMultiplier);
        if (isWeekend) dailyChecks = Math.round(dailyChecks * 1.3);
      }

      // Week-over-week trend (declining locations lose volume each week)
      if (pattern.weekTrend !== 0) {
        const trendMultiplier = Math.max(0.5, 1 + pattern.weekTrend * weekNum);
        dailyChecks = Math.round(dailyChecks * trendMultiplier);
      }

      // Ensure at least 5 cheques per location per day
      dailyChecks = Math.max(5, dailyChecks);

      // Get servers for this location
      const locationServers = SERVERS.filter((s) => s.location === location.id);
      if (locationServers.length === 0) continue;

      for (let i = 0; i < dailyChecks; i++) {
        chequeNum++;
        const server = locationServers[Math.floor(Math.random() * locationServers.length)];
        const cheque = generateSingleCheque(
          chequeNum,
          location,
          server,
          brandConfig,
          pattern,
          currentDate,
          weekNum,
          i,
          dailyChecks
        );
        cheques.push(cheque);
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return cheques;
}

function generateSingleCheque(
  chequeNum: number,
  location: (typeof LOCATIONS)[0],
  server: (typeof SERVERS)[0],
  brandConfig: BrandConfig,
  pattern: PatternBehavior,
  date: Date,
  weekNum: number,
  orderInDay: number,
  dailyTotal: number
): Cheque {
  // Base amount from brand config with pattern check multiplier
  let baseAmount = brandConfig.avgCheckBase * pattern.checkMultiplier;
  let tipRate = brandConfig.tipRateBase;

  // Server performance modifiers
  switch (server.pattern) {
    case 'star':
      baseAmount *= 1.25;
      tipRate *= 1.20;
      break;
    case 'good':
      baseAmount *= 1.10;
      tipRate *= 1.10;
      break;
    case 'average':
      // No modifier
      break;
    case 'new':
      baseAmount *= 0.85;
      tipRate *= 0.90;
      break;
    case 'inconsistent':
      baseAmount *= 0.80 + Math.random() * 0.50; // 0.80 to 1.30
      tipRate *= 0.70 + Math.random() * 0.40;    // 0.70 to 1.10
      break;
  }

  // Random variance (+/- 25%)
  baseAmount *= 0.75 + Math.random() * 0.50;

  // Week trend for declining locations
  if (pattern.weekTrend !== 0) {
    baseAmount *= Math.max(0.6, 1 + pattern.weekTrend * weekNum);
  }

  // Distribute across service hours (11am-10pm)
  const hour = 11 + Math.floor((orderInDay / dailyTotal) * 11);
  // Dinner rush boost (6pm-9pm)
  if (hour >= 18 && hour <= 21) baseAmount *= 1.15;

  const subtotal = Math.round(baseAmount * 100) / 100;
  const tip = Math.round(subtotal * tipRate * 100) / 100;
  const total = subtotal + tip;

  // Cancellation based on pattern cancel rate
  const cancelado = Math.random() < pattern.cancelRate;

  // Timestamps
  const chequeDate = new Date(date);
  chequeDate.setHours(hour, Math.floor(Math.random() * 60));
  const closeDate = new Date(chequeDate.getTime() + (30 + Math.random() * 60) * 60000);

  // Shift: 1=Morning (<14), 2=Afternoon (14-21), 3=Night (>=22)
  let turnoId = 2;
  if (hour < 14) turnoId = 1;
  else if (hour >= 22) turnoId = 3;

  // Payment: cash vs card
  const isCash = Math.random() < 0.35;
  const efectivo = isCash ? total : 0;
  const tarjeta = isCash ? 0 : total;

  // Party size and items
  const guestCount = Math.floor(Math.random() * 4) + 1;
  const itemsPerPerson = 2 + Math.floor(Math.random() * 2);

  // Food/beverage split from brand config with small variance
  const foodRatio = brandConfig.foodRatio + (Math.random() * 0.10 - 0.05);
  const foodTotal = Math.round(subtotal * foodRatio * 100) / 100;
  const beverageTotal = Math.round((subtotal - foodTotal) * 100) / 100;

  // Tax (16% IVA)
  const tax = Math.round(subtotal * 0.16 * 100) / 100;

  return {
    numeroFranquicia: location.id,
    turnoId,
    folio: chequeNum,
    numeroCheque: chequeNum,
    fecha: chequeDate.toISOString(),
    cierre: closeDate.toISOString(),
    numeroPersonas: guestCount,
    meseroId: server.id,
    pagado: !cancelado,
    cancelado,
    totalArticulos: guestCount * itemsPerPerson,
    total: Math.round(total * 100) / 100,
    efectivo: Math.round(efectivo * 100) / 100,
    tarjeta: Math.round(tarjeta * 100) / 100,
    propina: tip,
    descuento: 0,
    subtotal,
    subtotalConDescuento: subtotal,
    totalImpuesto: tax,
    totalDescuentos: 0,
    totalCortesias: 0,
    totalAlimentos: foodTotal,
    totalBebidas: beverageTotal,
  };
}

// =============================================================================
// TSV SERIALIZATION
// =============================================================================

function chequesToTSV(cheques: Cheque[]): string {
  const headers = [
    'NUMERO_FRANQUICIA',
    'TURNO',
    'FOLIO',
    'NUMERO_CHEQUE',
    'FECHA',
    'CIERRE',
    'NUMERO_PERSONAS',
    'MESERO',
    'PAGADO',
    'CANCELADO',
    'TOTAL_ARTICULOS',
    'TOTAL',
    'EFECTIVO',
    'TARJETA',
    'PROPINA',
    'DESCUENTO',
    'SUBTOTAL',
    'SUBTOTAL_CON_DESCUENTO',
    'TOTAL_IMPUESTO',
    'TOTAL_DESCUENTOS',
    'TOTAL_CORTESIAS',
    'TOTAL_ALIMENTOS',
    'TOTAL_BEBIDAS',
  ];

  const rows = cheques.map((c) =>
    [
      c.numeroFranquicia,
      c.turnoId,
      c.folio,
      c.numeroCheque,
      c.fecha,
      c.cierre,
      c.numeroPersonas,
      c.meseroId,
      c.pagado ? 1 : 0,
      c.cancelado ? 1 : 0,
      c.totalArticulos,
      c.total.toFixed(2),
      c.efectivo.toFixed(2),
      c.tarjeta.toFixed(2),
      c.propina.toFixed(2),
      c.descuento.toFixed(2),
      c.subtotal.toFixed(2),
      c.subtotalConDescuento.toFixed(2),
      c.totalImpuesto.toFixed(2),
      c.totalDescuentos.toFixed(2),
      c.totalCortesias.toFixed(2),
      c.totalAlimentos.toFixed(2),
      c.totalBebidas.toFixed(2),
    ].join('\t')
  );

  return [headers.join('\t'), ...rows].join('\n');
}

// =============================================================================
// PROVISIONER
// =============================================================================

export function isProvisioned(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}provisioned`) === 'true';
}

export function provisionFRMXDemo(): {
  success: boolean;
  chequeCount: number;
  error?: string;
} {
  try {
    console.log('Generating FRMX demo data (20 locations, 5 weeks)...');
    const cheques = generateCheques();
    console.log(`Generated ${cheques.length} cheques`);

    // Store brands, locations, and servers
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}brands`,
      JSON.stringify(BRANDS)
    );
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}locations`,
      JSON.stringify(LOCATIONS)
    );
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}servers`,
      JSON.stringify(SERVERS)
    );

    // Store pattern behaviors and brand configs for downstream use
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}pattern_behaviors`,
      JSON.stringify(PATTERN_BEHAVIORS)
    );
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}brand_configs`,
      JSON.stringify(BRAND_CONFIGS)
    );

    // Convert cheques to TSV and import through real pipeline
    const tsvContent = chequesToTSV(cheques);
    const importService = new ChequeImportService(FRMX_TENANT_ID);
    const result = importService.importFile(
      tsvContent,
      'frmx-demo-import.tsv',
      'system'
    );

    if (result.status === 'failed') {
      console.error('Demo import failed:', result.errors);
      return {
        success: false,
        chequeCount: 0,
        error: result.errors?.map((e) => e.message).join(', '),
      };
    }

    // Mark as provisioned
    localStorage.setItem(`${STORAGE_KEY_PREFIX}provisioned`, 'true');
    localStorage.setItem(`${STORAGE_KEY_PREFIX}provisionedAt`, new Date().toISOString());
    localStorage.setItem(`${STORAGE_KEY_PREFIX}chequeCount`, String(cheques.length));

    console.log('FRMX demo provisioned successfully');
    return { success: true, chequeCount: cheques.length };
  } catch (error) {
    console.error('FRMX provisioning error:', error);
    return {
      success: false,
      chequeCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// ACCESSORS
// =============================================================================

export function getFRMXBrands() {
  if (typeof window === 'undefined') return BRANDS;
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}brands`);
  return stored ? JSON.parse(stored) : BRANDS;
}

export function getFRMXLocations() {
  if (typeof window === 'undefined') return LOCATIONS;
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}locations`);
  return stored ? JSON.parse(stored) : LOCATIONS;
}

export function getFRMXServers() {
  if (typeof window === 'undefined') return SERVERS;
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}servers`);
  return stored ? JSON.parse(stored) : SERVERS;
}

export function getFRMXPatternBehaviors() {
  return PATTERN_BEHAVIORS;
}

export function getFRMXBrandConfigs() {
  return BRAND_CONFIGS;
}

export function resetFRMXDemo(): void {
  if (typeof window === 'undefined') return;

  // Clear all FRMX storage
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX) || key?.startsWith('frmx-demo')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  console.log('FRMX demo reset');
}
