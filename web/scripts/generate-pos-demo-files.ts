#!/usr/bin/env npx tsx
/**
 * Generate 3 importable POS demo files for normalization demo.
 *
 * File 1: Clean standard format (FD-GDL-001)
 * File 2: English/variant column headers (RV-MTY-001)
 * File 3: Messy mixed format with currency symbols (CA-CUN-001)
 *
 * Output: web/public/demo-data/
 * Usage: npx tsx scripts/generate-pos-demo-files.ts
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(__dirname, '..', 'public', 'demo-data');

// Seeded RNG for reproducibility
function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng: () => number, min: number, max: number): number {
  return Math.round((rng() * (max - min) + min) * 100) / 100;
}

interface ChequeRow {
  numero_franquicia: string;
  turno_id: number;
  folio: number;
  numero_cheque: number;
  fecha: string;
  cierre: string;
  numero_de_personas: number;
  mesero_id: number;
  pagado: number;
  cancelado: number;
  total_articulos: number;
  total: number;
  efectivo: number;
  tarjeta: number;
  propina: number;
  descuento: number;
  subtotal: number;
  subtotal_con_descuento: number;
  total_impuesto: number;
  total_descuentos: number;
  total_cortesias: number;
  total_alimentos: number;
  total_bebidas: number;
}

function generateCheques(
  locationId: string,
  count: number,
  date: string,
  meseroIds: number[],
  ticketMin: number,
  ticketMax: number,
  tipRate: number,
  cashRate: number,
  cancelRate: number,
  seed: number
): ChequeRow[] {
  const rng = mulberry32(seed);
  const cheques: ChequeRow[] = [];

  for (let i = 0; i < count; i++) {
    const turnoRoll = rng();
    const turno_id = turnoRoll < 0.35 ? 1 : turnoRoll < 0.70 ? 2 : 3;
    const hourBase = turno_id === 1 ? 8 : turno_id === 2 ? 13 : 19;
    const hour = hourBase + Math.floor(rng() * 4);
    const min = Math.floor(rng() * 60);
    const fecha = `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
    const cierreHour = Math.min(hour + 1 + Math.floor(rng() * 2), 23);
    const cierre = `${date}T${String(cierreHour).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}:00`;

    const cancelado = rng() < cancelRate ? 1 : 0;
    const pagado = cancelado ? 0 : 1;
    const rawTotal = cancelado ? 0 : randFloat(rng, ticketMin, ticketMax);
    const subtotal = Math.round((rawTotal / 1.16) * 100) / 100;
    const total_impuesto = Math.round((rawTotal - subtotal) * 100) / 100;
    const hasDiscount = rng() < 0.08;
    const descuento = hasDiscount ? Math.round(rawTotal * randFloat(rng, 0.05, 0.15) * 100) / 100 : 0;
    const subtotal_con_descuento = Math.round((subtotal - descuento) * 100) / 100;
    const total_cortesias = rng() < 0.02 ? Math.round(rawTotal * 0.10 * 100) / 100 : 0;
    const propina = cancelado ? 0 : Math.round(rawTotal * randFloat(rng, tipRate * 0.6, tipRate * 1.4) * 100) / 100;
    const isCash = rng() < cashRate;
    const efectivo = cancelado ? 0 : (isCash ? rawTotal : 0);
    const tarjeta = cancelado ? 0 : (isCash ? 0 : rawTotal);
    const total_alimentos = Math.round(rawTotal * randFloat(rng, 0.60, 0.80) * 100) / 100;
    const total_bebidas = Math.round((rawTotal - total_alimentos) * 100) / 100;

    cheques.push({
      numero_franquicia: locationId,
      turno_id,
      folio: i + 1,
      numero_cheque: 3000 + i + 1,
      fecha,
      cierre,
      numero_de_personas: randInt(rng, 1, 6),
      mesero_id: meseroIds[Math.floor(rng() * meseroIds.length)],
      pagado,
      cancelado,
      total_articulos: randInt(rng, 2, 12),
      total: rawTotal,
      efectivo,
      tarjeta,
      propina,
      descuento,
      subtotal,
      subtotal_con_descuento,
      total_impuesto,
      total_descuentos: descuento,
      total_cortesias,
      total_alimentos,
      total_bebidas,
    });
  }

  return cheques;
}

// ── FILE 1: Clean standard format (FD-GDL-001) ──
console.log('Generating File 1: cheques_20240122_FD-GDL-001.txt (clean standard)...');
const file1Cheques = generateCheques('FD-GDL-001', 120, '2024-01-22', [1007, 1008], 300, 800, 0.12, 0.40, 0.02, 11111);

const STANDARD_HEADERS = [
  'numero_franquicia', 'turno_id', 'folio', 'numero_cheque', 'fecha', 'cierre',
  'numero_de_personas', 'mesero_id', 'pagado', 'cancelado', 'total_articulos',
  'total', 'efectivo', 'tarjeta', 'propina', 'descuento', 'subtotal',
  'subtotal_con_descuento', 'total_impuesto', 'total_descuentos',
  'total_cortesias', 'total_alimentos', 'total_bebidas',
];

let file1Content = STANDARD_HEADERS.join('\t') + '\n';
for (const c of file1Cheques) {
  const vals = STANDARD_HEADERS.map(h => (c as Record<string, unknown>)[h]);
  file1Content += vals.join('\t') + '\n';
}
writeFileSync(join(OUT_DIR, 'cheques_20240122_FD-GDL-001.txt'), file1Content, 'utf-8');
console.log(`  Written: ${file1Cheques.length} rows`);

// ── FILE 2: English/variant column headers (RV-MTY-001) ──
console.log('Generating File 2: cheques_20240122_RV-MTY-001.txt (English headers)...');
const file2Cheques = generateCheques('RV-MTY-001', 150, '2024-01-22', [1021, 1022], 100, 350, 0.05, 0.40, 0.03, 22222);

const ENGLISH_HEADERS = [
  'franchise_id', 'shift', 'folio_num', 'check_number', 'open_time', 'close_time',
  'guests', 'server', 'paid', 'cancelled', 'items',
  'total_amount', 'cash', 'credit_card', 'tip', 'discount', 'subtotal',
  'subtotal_after_disc', 'tax', 'total_disc',
  'comps', 'food_total', 'bev_total',
];

const ENGLISH_MAP: Record<string, string> = {
  franchise_id: 'numero_franquicia',
  shift: 'turno_id',
  folio_num: 'folio',
  check_number: 'numero_cheque',
  open_time: 'fecha',
  close_time: 'cierre',
  guests: 'numero_de_personas',
  server: 'mesero_id',
  paid: 'pagado',
  cancelled: 'cancelado',
  items: 'total_articulos',
  total_amount: 'total',
  cash: 'efectivo',
  credit_card: 'tarjeta',
  tip: 'propina',
  discount: 'descuento',
  subtotal: 'subtotal',
  subtotal_after_disc: 'subtotal_con_descuento',
  tax: 'total_impuesto',
  total_disc: 'total_descuentos',
  comps: 'total_cortesias',
  food_total: 'total_alimentos',
  bev_total: 'total_bebidas',
};

let file2Content = ENGLISH_HEADERS.join('\t') + '\n';
for (const c of file2Cheques) {
  const vals = ENGLISH_HEADERS.map(h => (c as Record<string, unknown>)[ENGLISH_MAP[h]]);
  file2Content += vals.join('\t') + '\n';
}
writeFileSync(join(OUT_DIR, 'cheques_20240122_RV-MTY-001.txt'), file2Content, 'utf-8');
console.log(`  Written: ${file2Cheques.length} rows`);

// ── FILE 3: Messy mixed format (CA-CUN-001) ──
console.log('Generating File 3: cheques_20240122_CA-CUN-001.txt (messy mixed)...');
const file3Cheques = generateCheques('CA-CUN-001', 80, '2024-01-22', [1031, 1032], 400, 1200, 0.15, 0.35, 0.02, 33333);

const MIXED_HEADERS = [
  'numero_franquicia', 'shift', 'folio', 'check_number', 'fecha', 'cierre',
  'personas', 'mesero_id', 'paid', 'cancelado', 'items',
  'total', 'cash', 'tarjeta', 'tip', 'descuento', 'subtotal',
  'subtotal_desc', 'tax', 'total_descuentos',
  'cortesias', 'alimentos', 'bebidas', 'notas',
];

const MIXED_MAP: Record<string, string> = {
  numero_franquicia: 'numero_franquicia',
  shift: 'turno_id',
  folio: 'folio',
  check_number: 'numero_cheque',
  fecha: 'fecha',
  cierre: 'cierre',
  personas: 'numero_de_personas',
  mesero_id: 'mesero_id',
  paid: 'pagado',
  cancelado: 'cancelado',
  items: 'total_articulos',
  total: 'total',
  cash: 'efectivo',
  tarjeta: 'tarjeta',
  tip: 'propina',
  descuento: 'descuento',
  subtotal: 'subtotal',
  subtotal_desc: 'subtotal_con_descuento',
  tax: 'total_impuesto',
  total_descuentos: 'total_descuentos',
  cortesias: 'total_cortesias',
  alimentos: 'total_alimentos',
  bebidas: 'total_bebidas',
};

// Format currency values with $ and commas for messiness
function formatMXN(val: number): string {
  if (val === 0) return '$0.00';
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CURRENCY_FIELDS = new Set(['total', 'cash', 'tarjeta', 'tip', 'descuento', 'subtotal', 'subtotal_desc', 'tax', 'total_descuentos', 'cortesias', 'alimentos', 'bebidas']);

let file3Content = MIXED_HEADERS.join('\t') + '\n';
for (const c of file3Cheques) {
  const vals = MIXED_HEADERS.map(h => {
    if (h === 'notas') return '';
    const srcField = MIXED_MAP[h];
    const val = (c as Record<string, unknown>)[srcField];
    if (CURRENCY_FIELDS.has(h) && typeof val === 'number') {
      return formatMXN(val);
    }
    return val;
  });
  file3Content += vals.join('\t') + '\n';
}
writeFileSync(join(OUT_DIR, 'cheques_20240122_CA-CUN-001.txt'), file3Content, 'utf-8');
console.log(`  Written: ${file3Cheques.length} rows`);

console.log('\nAll 3 demo files generated in web/public/demo-data/');
