/**
 * FRMX Data Generator
 *
 * Generates importable cheques + articulos TSV files for weeks 6-7.
 * Uses the product variant generator to create messy product descriptions
 * that feed into the normalization engine.
 * localStorage removed -- accessor functions return empty defaults.
 *
 * Data Flow:
 *   Week 1-5: Auto-provisioned baseline (frmx-demo-provisioner.ts)
 *   Week 6:   First import -- normalization dictionary is sparse, many manual items
 *   Week 7:   Second import -- dictionary has grown from week 6, more auto-resolved
 *
 * This demonstrates the ML Flywheel: week 7 auto-resolved > week 6 auto-resolved.
 */

import type { Cheque, Articulo } from '@/lib/financial/types';
import { getLocationDescriptions, CANONICAL_PRODUCTS } from '@/lib/normalization/product-variant-generator';

// =============================================================================
// CONSTANTS
// =============================================================================

const FRMX_TENANT_ID = 'frmx-demo';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STORAGE_KEY_PREFIX = 'frmx_demo_';

// Week 6: Dec 30, 2024 - Jan 5, 2025
const WEEK6_START = new Date(2024, 11, 30);
const WEEK6_END = new Date(2025, 0, 5);

// Week 7: Jan 6-12, 2025
const WEEK7_START = new Date(2025, 0, 6);
const WEEK7_END = new Date(2025, 0, 12);

// Reuse location/brand/server definitions from provisioner
function getLocations(): Array<{
  id: string;
  brand: string;
  pattern: string;
}> {
  // No localStorage -- return empty (provisioner data not available)
  return [];
}

function getServers(): Array<{
  id: number;
  name: string;
  location: string;
  pattern: string;
}> {
  // No localStorage -- return empty
  return [];
}

function getBrandConfigs(): Record<string, {
  avgCheckBase: number;
  dailyChecks: number;
  tipRateBase: number;
  foodRatio: number;
}> {
  // Return static defaults (no localStorage)
  return {
    'cocina-dorada': { avgCheckBase: 420, dailyChecks: 20, tipRateBase: 0.16, foodRatio: 0.70 },
    'taco-veloz':    { avgCheckBase: 280, dailyChecks: 25, tipRateBase: 0.13, foodRatio: 0.75 },
    'mar-y-brasa':   { avgCheckBase: 380, dailyChecks: 18, tipRateBase: 0.15, foodRatio: 0.60 },
  };
}

// =============================================================================
// PRODUCT MENU PER LOCATION
// =============================================================================

/**
 * Each location has a menu of ~30-40 products from the 60 canonical items.
 * The description used is the location's messy variant.
 */
function getLocationMenu(locationId: string, brand: string): Array<{
  canonicalId: number;
  description: string;
  category: string;
  basePrice: number;
}> {
  const descriptions = getLocationDescriptions(locationId);
  const hash = simpleHash(locationId);

  // Pick 30-40 products for this location's menu
  const menuSize = 30 + (hash % 11); // 30-40 items

  // Always include some from each category, biased by brand
  const byCategory = new Map<string, typeof descriptions>();
  for (const d of descriptions) {
    const existing = byCategory.get(d.category) || [];
    existing.push(d);
    byCategory.set(d.category, existing);
  }

  const menu: Array<{
    canonicalId: number;
    description: string;
    category: string;
    basePrice: number;
  }> = [];

  // Ensure representation from all categories
  Array.from(byCategory.entries()).forEach(([, items]) => {
    // Take at least 3 from each category, up to all
    const take = Math.min(items.length, Math.max(3, Math.floor(menuSize * items.length / 60)));
    for (let i = 0; i < take && menu.length < menuSize; i++) {
      const item = items[i];
      menu.push({
        canonicalId: item.canonicalId,
        description: item.description,
        category: item.category,
        basePrice: getBasePrice(item.canonicalId, brand),
      });
    }
  });

  return menu;
}

/**
 * Get a base price for a product based on its category and brand tier.
 */
function getBasePrice(productId: number, brand: string): number {
  const product = CANONICAL_PRODUCTS.find(p => p.id === productId);
  if (!product) return 100;

  // Brand tier multiplier
  const tierMultiplier = brand === 'cocina-dorada' ? 1.4
    : brand === 'mar-y-brasa' ? 1.2
    : 1.0;

  // Category base prices (MXN)
  const categoryPrices: Record<string, number> = {
    'Entradas': 95,
    'Platos Fuertes': 165,
    'Guarniciones': 55,
    'Postres': 75,
    'Bebidas': 45,
    'Extras': 25,
  };

  const basePrice = categoryPrices[product.category] || 100;
  // Add some product-specific variance
  const variance = 0.8 + (productId % 5) * 0.1;

  return Math.round(basePrice * tierMultiplier * variance * 100) / 100;
}

// =============================================================================
// GENERATION
// =============================================================================

export interface WeekDataResult {
  chequesTSV: string;
  articulosTSV: string;
  cheques: Cheque[];
  articulos: Articulo[];
  stats: {
    weekNumber: number;
    period: string;
    chequeCount: number;
    articuloCount: number;
    uniqueDescriptions: number;
    locations: number;
  };
}

/**
 * Generate cheques + articulos for a specific week.
 */
export function generateWeekData(weekNumber: 6 | 7): WeekDataResult {
  const startDate = weekNumber === 6 ? WEEK6_START : WEEK7_START;
  const endDate = weekNumber === 6 ? WEEK6_END : WEEK7_END;

  const locations = getLocations();
  const servers = getServers();
  const brandConfigs = getBrandConfigs();

  const cheques: Cheque[] = [];
  const articulos: Articulo[] = [];
  let chequeNum = weekNumber === 6 ? 50000 : 70000;
  let articuloFolio = 1;

  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (const location of locations) {
      const brandConfig = brandConfigs[location.brand];
      if (!brandConfig) continue;

      const locationServers = servers.filter(s => s.location === location.id);
      if (locationServers.length === 0) continue;

      const menu = getLocationMenu(location.id, location.brand);
      if (menu.length === 0) continue;

      // Daily cheque count
      let dailyChecks = brandConfig.dailyChecks;
      if (isWeekend) dailyChecks = Math.round(dailyChecks * 1.3);

      for (let i = 0; i < dailyChecks; i++) {
        chequeNum++;
        const server = locationServers[Math.floor(Math.random() * locationServers.length)];
        const hour = 11 + Math.floor((i / dailyChecks) * 11);
        const guestCount = Math.floor(Math.random() * 4) + 1;

        // Generate articulos for this cheque (2-6 items based on party size)
        const itemCount = Math.min(guestCount * 2, 2 + Math.floor(Math.random() * 5));
        const chequeArticulos: Articulo[] = [];
        let foodTotal = 0;
        let bevTotal = 0;

        for (let j = 0; j < itemCount; j++) {
          articuloFolio++;
          const menuItem = menu[Math.floor(Math.random() * menu.length)];
          const qty = j === 0 ? 1 : (Math.random() < 0.8 ? 1 : 2);
          const unitPrice = menuItem.basePrice * (0.9 + Math.random() * 0.2);
          const lineTotal = Math.round(qty * unitPrice * 100) / 100;

          const isBeverage = menuItem.category === 'Bebidas';
          if (isBeverage) bevTotal += lineTotal;
          else foodTotal += lineTotal;

          const artDate = new Date(currentDate);
          artDate.setHours(hour, Math.floor(Math.random() * 60));

          chequeArticulos.push({
            numeroFranquicia: location.id,
            numeroCheque: chequeNum,
            folioArticulo: articuloFolio,
            fecha: artDate.toISOString(),
            meseroId: server.id,
            articuloId: menuItem.canonicalId,
            descripcion: menuItem.description,
            grupo: menuItem.category,
            cantidad: qty,
            precioUnitario: Math.round(unitPrice * 100) / 100,
            importe: lineTotal,
            descuento: 0,
          });
        }

        articulos.push(...chequeArticulos);

        // Build cheque from articulos totals
        const subtotal = Math.round((foodTotal + bevTotal) * 100) / 100;
        const tip = Math.round(subtotal * brandConfig.tipRateBase * 100) / 100;
        const total = subtotal + tip;
        const tax = Math.round(subtotal * 0.16 * 100) / 100;
        const isCash = Math.random() < 0.35;
        const cancelado = Math.random() < 0.03;

        const chequeDate = new Date(currentDate);
        chequeDate.setHours(hour, Math.floor(Math.random() * 60));
        const closeDate = new Date(chequeDate.getTime() + (30 + Math.random() * 60) * 60000);

        let turnoId = 2;
        if (hour < 14) turnoId = 1;
        else if (hour >= 22) turnoId = 3;

        cheques.push({
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
          totalArticulos: itemCount,
          total: Math.round(total * 100) / 100,
          efectivo: isCash ? Math.round(total * 100) / 100 : 0,
          tarjeta: isCash ? 0 : Math.round(total * 100) / 100,
          propina: tip,
          descuento: 0,
          subtotal,
          subtotalConDescuento: subtotal,
          totalImpuesto: tax,
          totalDescuentos: 0,
          totalCortesias: 0,
          totalAlimentos: Math.round(foodTotal * 100) / 100,
          totalBebidas: Math.round(bevTotal * 100) / 100,
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Count unique descriptions
  const uniqueDescs = new Set(articulos.map(a => a.descripcion));

  const periodStart = startDate.toISOString().split('T')[0];
  const periodEnd = endDate.toISOString().split('T')[0];

  return {
    chequesTSV: chequesToTSV(cheques),
    articulosTSV: articulosToTSV(articulos),
    cheques,
    articulos,
    stats: {
      weekNumber,
      period: `${periodStart} to ${periodEnd}`,
      chequeCount: cheques.length,
      articuloCount: articulos.length,
      uniqueDescriptions: uniqueDescs.size,
      locations: new Set(cheques.map(c => c.numeroFranquicia)).size,
    },
  };
}

/**
 * Store generated week data for later import.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function storeWeekData(weekNumber: 6 | 7, data: WeekDataResult): void {
  // No-op: localStorage removed
}

/**
 * Load previously generated week data.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadWeekData(weekNumber: 6 | 7): {
  chequesTSV: string | null;
  articulosTSV: string | null;
  stats: WeekDataResult['stats'] | null;
} {
  return { chequesTSV: null, articulosTSV: null, stats: null };
}

/**
 * Get the FRMX tenant ID.
 */
export function getFRMXTenantId(): string {
  return FRMX_TENANT_ID;
}

// =============================================================================
// TSV SERIALIZATION
// =============================================================================

function chequesToTSV(cheques: Cheque[]): string {
  const headers = [
    'NUMERO_FRANQUICIA', 'TURNO', 'FOLIO', 'NUMERO_CHEQUE', 'FECHA', 'CIERRE',
    'NUMERO_PERSONAS', 'MESERO', 'PAGADO', 'CANCELADO', 'TOTAL_ARTICULOS',
    'TOTAL', 'EFECTIVO', 'TARJETA', 'PROPINA', 'DESCUENTO', 'SUBTOTAL',
    'SUBTOTAL_CON_DESCUENTO', 'TOTAL_IMPUESTO', 'TOTAL_DESCUENTOS',
    'TOTAL_CORTESIAS', 'TOTAL_ALIMENTOS', 'TOTAL_BEBIDAS',
  ];

  const rows = cheques.map((c) =>
    [
      c.numeroFranquicia, c.turnoId, c.folio, c.numeroCheque,
      c.fecha, c.cierre, c.numeroPersonas, c.meseroId,
      c.pagado ? 1 : 0, c.cancelado ? 1 : 0, c.totalArticulos,
      c.total.toFixed(2), c.efectivo.toFixed(2), c.tarjeta.toFixed(2),
      c.propina.toFixed(2), c.descuento.toFixed(2), c.subtotal.toFixed(2),
      c.subtotalConDescuento.toFixed(2), c.totalImpuesto.toFixed(2),
      c.totalDescuentos.toFixed(2), c.totalCortesias.toFixed(2),
      c.totalAlimentos.toFixed(2), c.totalBebidas.toFixed(2),
    ].join('\t')
  );

  return [headers.join('\t'), ...rows].join('\n');
}

function articulosToTSV(articulos: Articulo[]): string {
  const headers = [
    'NUMERO_FRANQUICIA', 'NUMERO_CHEQUE', 'FOLIO_ARTICULO', 'FECHA',
    'MESERO_ID', 'ARTICULO_ID', 'DESCRIPCION', 'GRUPO',
    'CANTIDAD', 'PRECIO_UNITARIO', 'IMPORTE', 'DESCUENTO',
  ];

  const rows = articulos.map((a) =>
    [
      a.numeroFranquicia, a.numeroCheque, a.folioArticulo, a.fecha,
      a.meseroId, a.articuloId, a.descripcion, a.grupo,
      a.cantidad, a.precioUnitario.toFixed(2), a.importe.toFixed(2),
      a.descuento.toFixed(2),
    ].join('\t')
  );

  return [headers.join('\t'), ...rows].join('\n');
}

// =============================================================================
// HELPERS
// =============================================================================

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
