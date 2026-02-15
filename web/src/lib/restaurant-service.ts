/**
 * Restaurant Service - Data operations for RestaurantMX tenant
 *
 * OB-43A: Supabase cutover — replaced tenant-data-service with direct static JSON imports.
 * Save operations are stubbed (Supabase migration for restaurant data pending).
 */

import type {
  Franquicia,
  Mesero,
  Turno,
  Cheque,
  FranquiciasData,
  MeserosData,
  TurnosData,
  ChequesData,
} from '@/types/cheques';

const TENANT_ID = 'restaurantmx';

/**
 * Load static JSON data for the restaurant tenant
 */
async function loadStaticData<T>(dataType: string, defaultValue: T): Promise<T> {
  try {
    const imported = await import(`@/data/tenants/${TENANT_ID}/${dataType}.json`);
    return (imported.default || imported) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Get all franchises
 */
export async function getFranquicias(): Promise<Franquicia[]> {
  const data = await loadStaticData<FranquiciasData>('franquicias', { franquicias: [] });
  return data.franquicias;
}

/**
 * Get a single franchise by ID
 */
export async function getFranquicia(numeroFranquicia: string): Promise<Franquicia | undefined> {
  const franquicias = await getFranquicias();
  return franquicias.find(f => f.numero_franquicia === numeroFranquicia);
}

/**
 * Get all servers
 */
export async function getMeseros(): Promise<Mesero[]> {
  const data = await loadStaticData<MeserosData>('meseros', { meseros: [] });
  return data.meseros;
}

/**
 * Get servers by franchise
 */
export async function getMeserosByFranquicia(numeroFranquicia: string): Promise<Mesero[]> {
  const meseros = await getMeseros();
  return meseros.filter(m => m.numero_franquicia === numeroFranquicia);
}

/**
 * Get a single server by ID
 */
export async function getMesero(meseroId: number): Promise<Mesero | undefined> {
  const meseros = await getMeseros();
  return meseros.find(m => m.mesero_id === meseroId);
}

/**
 * Get all shifts
 */
export async function getTurnos(): Promise<Turno[]> {
  const data = await loadStaticData<TurnosData>('turnos', { turnos: [] });
  return data.turnos;
}

/**
 * Get a single shift by ID
 */
export async function getTurno(turnoId: number): Promise<Turno | undefined> {
  const turnos = await getTurnos();
  return turnos.find(t => t.turno_id === turnoId);
}

/**
 * Filter options for cheques queries
 */
export interface ChequeFilters {
  franquicia?: string;
  meseroId?: number;
  turnoId?: number;
  startDate?: string;
  endDate?: string;
  pagado?: boolean;
  cancelado?: boolean;
}

/**
 * Get all cheques with optional filters
 */
export async function getCheques(filters?: ChequeFilters): Promise<Cheque[]> {
  const data = await loadStaticData<ChequesData>('cheques', { cheques: [], lastImport: null, totalImported: 0 });

  let cheques = data.cheques;

  if (filters?.franquicia) {
    cheques = cheques.filter(c => c.numero_franquicia === filters.franquicia);
  }
  if (filters?.meseroId) {
    cheques = cheques.filter(c => c.mesero_id === filters.meseroId);
  }
  if (filters?.turnoId) {
    cheques = cheques.filter(c => c.turno_id === filters.turnoId);
  }
  if (filters?.startDate) {
    cheques = cheques.filter(c => c.fecha >= filters.startDate!);
  }
  if (filters?.endDate) {
    cheques = cheques.filter(c => c.fecha <= filters.endDate!);
  }
  if (filters?.pagado !== undefined) {
    cheques = cheques.filter(c => c.pagado === (filters.pagado ? 1 : 0));
  }
  if (filters?.cancelado !== undefined) {
    cheques = cheques.filter(c => c.cancelado === (filters.cancelado ? 1 : 0));
  }

  return cheques;
}

/**
 * Get only valid (paid and not cancelled) cheques
 */
export async function getValidCheques(filters?: ChequeFilters): Promise<Cheque[]> {
  const cheques = await getCheques(filters);
  return cheques.filter(c => c.pagado === 1 && c.cancelado === 0);
}

/**
 * Get cheques data metadata
 */
export async function getChequesMetadata(): Promise<{ lastImport: string | null; totalImported: number }> {
  const data = await loadStaticData<ChequesData>('cheques', { cheques: [], lastImport: null, totalImported: 0 });
  return {
    lastImport: data.lastImport,
    totalImported: data.totalImported,
  };
}

/**
 * Financial summary from cheques data
 */
export interface FinancialSummary {
  totalRevenue: number;
  totalTransactions: number;
  avgTicket: number;
  totalTips: number;
  totalCommission: number;
  foodRevenue: number;
  beverageRevenue: number;
  foodPct: number;
  beveragePct: number;
  cancelledCount: number;
  cashTotal: number;
  cardTotal: number;
  totalDiscounts: number;
  totalTax: number;
}

/**
 * Calculate financial summary from cheques
 */
export async function getFinancialSummary(filters?: ChequeFilters): Promise<FinancialSummary> {
  const validCheques = await getValidCheques(filters);
  const allCheques = await getCheques(filters);
  const meseros = await getMeseros();

  const totalRevenue = validCheques.reduce((sum, c) => sum + c.total, 0);
  const totalTips = validCheques.reduce((sum, c) => sum + c.propina, 0);
  const foodRevenue = validCheques.reduce((sum, c) => sum + c.total_alimentos, 0);
  const beverageRevenue = validCheques.reduce((sum, c) => sum + c.total_bebidas, 0);
  const cashTotal = validCheques.reduce((sum, c) => sum + c.efectivo, 0);
  const cardTotal = validCheques.reduce((sum, c) => sum + c.tarjeta, 0);
  const totalDiscounts = validCheques.reduce((sum, c) => sum + c.total_descuentos, 0);
  const totalTax = validCheques.reduce((sum, c) => sum + c.total_impuesto, 0);

  const meseroSales = new Map<number, number>();
  validCheques.forEach(c => {
    meseroSales.set(c.mesero_id, (meseroSales.get(c.mesero_id) || 0) + c.total);
  });

  let totalCommission = 0;
  meseroSales.forEach((sales, meseroId) => {
    const mesero = meseros.find(m => m.mesero_id === meseroId);
    const rate = mesero?.commission_rate || 0.02;
    totalCommission += sales * rate;
  });

  return {
    totalRevenue,
    totalTransactions: validCheques.length,
    avgTicket: validCheques.length > 0 ? totalRevenue / validCheques.length : 0,
    totalTips,
    totalCommission,
    foodRevenue,
    beverageRevenue,
    foodPct: totalRevenue > 0 ? (foodRevenue / totalRevenue) * 100 : 0,
    beveragePct: totalRevenue > 0 ? (beverageRevenue / totalRevenue) * 100 : 0,
    cancelledCount: allCheques.filter(c => c.cancelado === 1).length,
    cashTotal,
    cardTotal,
    totalDiscounts,
    totalTax,
  };
}

/**
 * Get sales by mesero
 */
export async function getSalesByMesero(filters?: ChequeFilters): Promise<Array<{
  mesero: Mesero;
  totalSales: number;
  totalTips: number;
  commission: number;
  checkCount: number;
  avgTicket: number;
}>> {
  const validCheques = await getValidCheques(filters);
  const meseros = await getMeseros();

  const meseroStats = new Map<number, { sales: number; tips: number; count: number }>();

  validCheques.forEach(c => {
    const current = meseroStats.get(c.mesero_id) || { sales: 0, tips: 0, count: 0 };
    meseroStats.set(c.mesero_id, {
      sales: current.sales + c.total,
      tips: current.tips + c.propina,
      count: current.count + 1,
    });
  });

  return meseros
    .map(mesero => {
      const stats = meseroStats.get(mesero.mesero_id) || { sales: 0, tips: 0, count: 0 };
      return {
        mesero,
        totalSales: stats.sales,
        totalTips: stats.tips,
        commission: stats.sales * mesero.commission_rate,
        checkCount: stats.count,
        avgTicket: stats.count > 0 ? stats.sales / stats.count : 0,
      };
    })
    .filter(m => m.checkCount > 0)
    .sort((a, b) => b.totalSales - a.totalSales);
}

/**
 * Get sales by franchise
 */
export async function getSalesByFranquicia(filters?: ChequeFilters): Promise<Array<{
  franquicia: Franquicia;
  totalSales: number;
  totalTips: number;
  checkCount: number;
  avgTicket: number;
  vsTarget: number;
}>> {
  const validCheques = await getValidCheques(filters);
  const franquicias = await getFranquicias();

  const franquiciaStats = new Map<string, { sales: number; tips: number; count: number }>();

  validCheques.forEach(c => {
    const current = franquiciaStats.get(c.numero_franquicia) || { sales: 0, tips: 0, count: 0 };
    franquiciaStats.set(c.numero_franquicia, {
      sales: current.sales + c.total,
      tips: current.tips + c.propina,
      count: current.count + 1,
    });
  });

  return franquicias
    .map(franquicia => {
      const stats = franquiciaStats.get(franquicia.numero_franquicia) || { sales: 0, tips: 0, count: 0 };
      const avgTicket = stats.count > 0 ? stats.sales / stats.count : 0;
      return {
        franquicia,
        totalSales: stats.sales,
        totalTips: stats.tips,
        checkCount: stats.count,
        avgTicket,
        vsTarget: franquicia.target_avg_ticket > 0
          ? ((avgTicket - franquicia.target_avg_ticket) / franquicia.target_avg_ticket) * 100
          : 0,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

/**
 * Import new cheques (stubbed — Supabase migration pending)
 */
export async function importCheques(newCheques: Cheque[]): Promise<{ success: boolean; count: number }> {
  console.log('[restaurant-service] importCheques stubbed — Supabase migration pending');
  return { success: true, count: newCheques.length };
}

/**
 * Clear all cheques (stubbed — Supabase migration pending)
 */
export async function clearCheques(): Promise<void> {
  console.log('[restaurant-service] clearCheques stubbed — Supabase migration pending');
}
