/**
 * FRMX Demo Tenant Provisioner
 *
 * Auto-provisions the FRMX demo tenant with realistic Mexican restaurant data:
 * - 3 brands (Cocina Dorada, Taco Veloz, Mar y Brasa)
 * - 8 locations with specific patterns
 * - 20 servers including star performers
 * - ~5,000 cheques (3 weeks of data)
 *
 * Data flows through ChequeImportService (real pipeline).
 */

import { ChequeImportService } from '@/lib/financial/cheque-import-service';
import type { Cheque } from '@/lib/financial/types';

// ============================================
// CONSTANTS
// ============================================

const FRMX_TENANT_ID = 'frmx-demo';
const STORAGE_KEY_PREFIX = 'frmx_demo_';

// Brands
const BRANDS = [
  { id: 'cocina-dorada', name: 'Cocina Dorada', color: '#D4AF37' },
  { id: 'taco-veloz', name: 'Taco Veloz', color: '#22C55E' },
  { id: 'mar-y-brasa', name: 'Mar y Brasa', color: '#3B82F6' },
];

// Locations with patterns
const LOCATIONS = [
  // Cocina Dorada locations
  { id: 'FRMX-CD-GDL-001', name: 'Cocina Dorada Guadalajara Centro', brand: 'cocina-dorada', city: 'Guadalajara', pattern: 'star' },
  { id: 'FRMX-CD-CDMX-001', name: 'Cocina Dorada CDMX Reforma', brand: 'cocina-dorada', city: 'CDMX', pattern: 'declining' },
  { id: 'FRMX-CD-MTY-001', name: 'Cocina Dorada Monterrey', brand: 'cocina-dorada', city: 'Monterrey', pattern: 'normal' },
  // Taco Veloz locations
  { id: 'FRMX-TV-MTY-001', name: 'Taco Veloz Monterrey Centro', brand: 'taco-veloz', city: 'Monterrey', pattern: 'high_cancellation' },
  { id: 'FRMX-TV-GDL-001', name: 'Taco Veloz Guadalajara Norte', brand: 'taco-veloz', city: 'Guadalajara', pattern: 'normal' },
  { id: 'FRMX-TV-CDMX-001', name: 'Taco Veloz CDMX Sur', brand: 'taco-veloz', city: 'CDMX', pattern: 'growing' },
  // Mar y Brasa locations
  { id: 'FRMX-MB-CAN-001', name: 'Mar y Brasa Cancun Zona Hotelera', brand: 'mar-y-brasa', city: 'Cancun', pattern: 'star' },
  { id: 'FRMX-MB-PVR-001', name: 'Mar y Brasa Puerto Vallarta', brand: 'mar-y-brasa', city: 'Puerto Vallarta', pattern: 'seasonal' },
];

// Servers with performance patterns
const SERVERS = [
  // Star performers
  { id: 5001, name: 'Maria Garcia', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'star' },
  { id: 5002, name: 'Carlos Mendez', location: 'FRMX-MB-CAN-001', role: 'Server', pattern: 'star' },
  // Good performers
  { id: 5003, name: 'Ana Rodriguez', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'good' },
  { id: 5004, name: 'Luis Hernandez', location: 'FRMX-TV-MTY-001', role: 'Bartender', pattern: 'good' },
  { id: 5005, name: 'Sofia Martinez', location: 'FRMX-CD-CDMX-001', role: 'Server', pattern: 'good' },
  // Average performers
  { id: 5006, name: 'Diego Torres', location: 'FRMX-TV-GDL-001', role: 'Server', pattern: 'average' },
  { id: 5007, name: 'Isabella Ruiz', location: 'FRMX-CD-MTY-001', role: 'Bartender', pattern: 'average' },
  { id: 5008, name: 'Miguel Sanchez', location: 'FRMX-TV-CDMX-001', role: 'Server', pattern: 'average' },
  { id: 5009, name: 'Valentina Lopez', location: 'FRMX-MB-PVR-001', role: 'Server', pattern: 'average' },
  { id: 5010, name: 'Alejandro Flores', location: 'FRMX-MB-CAN-001', role: 'Bartender', pattern: 'average' },
  // New/developing
  { id: 5011, name: 'Camila Gonzalez', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'new' },
  { id: 5012, name: 'Sebastian Diaz', location: 'FRMX-TV-MTY-001', role: 'Server', pattern: 'new' },
  { id: 5013, name: 'Lucia Morales', location: 'FRMX-CD-CDMX-001', role: 'Server', pattern: 'new' },
  { id: 5014, name: 'Mateo Vargas', location: 'FRMX-TV-GDL-001', role: 'Server', pattern: 'new' },
  { id: 5015, name: 'Emma Castro', location: 'FRMX-CD-MTY-001', role: 'Server', pattern: 'new' },
  // Inconsistent performers
  { id: 5016, name: 'Daniel Ortiz', location: 'FRMX-TV-CDMX-001', role: 'Server', pattern: 'inconsistent' },
  { id: 5017, name: 'Paula Ramirez', location: 'FRMX-MB-PVR-001', role: 'Bartender', pattern: 'inconsistent' },
  { id: 5018, name: 'Fernando Reyes', location: 'FRMX-MB-CAN-001', role: 'Server', pattern: 'inconsistent' },
  { id: 5019, name: 'Andrea Silva', location: 'FRMX-CD-GDL-001', role: 'Server', pattern: 'inconsistent' },
  { id: 5020, name: 'Ricardo Gutierrez', location: 'FRMX-TV-MTY-001', role: 'Bartender', pattern: 'average' },
];

// ============================================
// CHEQUE GENERATION
// ============================================

function generateCheques(
  startDate: Date,
  endDate: Date
): Cheque[] {
  const cheques: Cheque[] = [];
  let chequeNum = 1000;

  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Generate cheques for each location
    for (const location of LOCATIONS) {
      // Base checks per day varies by location pattern
      let baseCheques = 25;
      if (location.pattern === 'star') baseCheques = 35;
      else if (location.pattern === 'declining') baseCheques = 20;
      else if (location.pattern === 'high_cancellation') baseCheques = 30;
      else if (location.pattern === 'growing') baseCheques = 28;
      else if (location.pattern === 'seasonal') baseCheques = isWeekend ? 40 : 20;

      // Weekend boost
      const dailyCheques = isWeekend ? Math.floor(baseCheques * 1.4) : baseCheques;

      // Get servers for this location
      const locationServers = SERVERS.filter((s) => s.location === location.id);

      for (let i = 0; i < dailyCheques; i++) {
        chequeNum++;
        const server = locationServers[Math.floor(Math.random() * locationServers.length)];
        const cheque = generateSingleCheque(
          chequeNum,
          location,
          server,
          currentDate,
          i
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
  location: typeof LOCATIONS[0],
  server: typeof SERVERS[0],
  date: Date,
  orderInDay: number
): Cheque {
  // Base amounts by server pattern
  let baseAmount = 350; // MXN
  let tipRate = 0.15;

  switch (server.pattern) {
    case 'star':
      baseAmount = 450 + Math.random() * 200;
      tipRate = 0.18;
      break;
    case 'good':
      baseAmount = 380 + Math.random() * 150;
      tipRate = 0.16;
      break;
    case 'average':
      baseAmount = 320 + Math.random() * 120;
      tipRate = 0.15;
      break;
    case 'new':
      baseAmount = 280 + Math.random() * 100;
      tipRate = 0.13;
      break;
    case 'inconsistent':
      baseAmount = 250 + Math.random() * 250; // High variance
      tipRate = 0.10 + Math.random() * 0.10;
      break;
  }

  // Location modifiers
  if (location.pattern === 'star') baseAmount *= 1.15;
  else if (location.pattern === 'declining') baseAmount *= 0.85;
  else if (location.pattern === 'high_cancellation') baseAmount *= 0.95;

  // Time-based modifiers
  const hour = 11 + Math.floor(orderInDay / 8); // 11am - 10pm
  if (hour >= 18 && hour <= 21) baseAmount *= 1.2; // Dinner rush

  const subtotal = Math.round(baseAmount * 100) / 100;
  const tip = Math.round(subtotal * tipRate * 100) / 100;
  const total = subtotal + tip;

  // Cancellation for high_cancellation locations
  let cancelado = false;
  if (location.pattern === 'high_cancellation' && Math.random() < 0.08) {
    cancelado = true;
  }

  const chequeDate = new Date(date);
  chequeDate.setHours(hour, Math.floor(Math.random() * 60));
  const closeDate = new Date(chequeDate.getTime() + (30 + Math.random() * 60) * 60000);

  // Determine shift: 1=Morning (6am-2pm), 2=Afternoon (2pm-10pm), 3=Night (10pm-6am)
  let turnoId = 2; // Default afternoon
  if (hour < 14) turnoId = 1;
  else if (hour >= 22) turnoId = 3;

  // Payment split (cash vs card)
  const isCash = Math.random() < 0.4;
  const efectivo = isCash ? total : 0;
  const tarjeta = isCash ? 0 : total;

  // Item count based on party size and amount
  const guestCount = Math.floor(Math.random() * 4) + 1;
  const itemsPerPerson = 2 + Math.floor(Math.random() * 2);

  // Calculate food/beverage split (typically 70/30)
  const foodRatio = 0.65 + Math.random() * 0.15;
  const foodTotal = Math.round(subtotal * foodRatio * 100) / 100;
  const beverageTotal = Math.round((subtotal - foodTotal) * 100) / 100;

  // Tax (16% IVA in Mexico)
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
    total,
    efectivo,
    tarjeta,
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

// ============================================
// PROVISIONER
// ============================================

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
    // Generate 3 weeks of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 21);

    console.log('Generating FRMX demo data...');
    const cheques = generateCheques(startDate, endDate);
    console.log(`Generated ${cheques.length} cheques`);

    // Store brands and locations
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

    // Convert cheques to TSV format for import
    const tsvContent = chequesToTSV(cheques);

    // Import through ChequeImportService
    const importService = new ChequeImportService(FRMX_TENANT_ID);
    const result = importService.importFile(
      tsvContent,
      'frmx-demo-import.tsv',
      'system'
    );

    if (result.status === 'failed') {
      console.error('Demo import failed:', result.errors);
      return { success: false, chequeCount: 0, error: result.errors?.map((e) => e.message).join(', ') };
    }

    // Mark as provisioned
    localStorage.setItem(`${STORAGE_KEY_PREFIX}provisioned`, 'true');
    localStorage.setItem(`${STORAGE_KEY_PREFIX}provisionedAt`, new Date().toISOString());

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

/**
 * Convert cheques to TSV format matching expected column names
 */
function chequesToTSV(cheques: Cheque[]): string {
  // Use column names that the parser expects (from CHEQUE_COLUMN_ALIASES)
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
