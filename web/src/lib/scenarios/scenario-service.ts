/**
 * Scenario Service
 *
 * Manages saved scenarios and scenario comparisons.
 */

import type {
  SavedScenario,
  ScenarioModifiers,
  ScenarioImpact,
  ScenarioComparison,
} from '@/types/scenario';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STORAGE_KEY = 'saved_scenarios';

// ============================================
// SCENARIO CRUD
// ============================================

/**
 * Get all saved scenarios
 */
export function getAllScenarios(): SavedScenario[] {
  return getDefaultScenarios();
}

/**
 * Get scenarios for a tenant
 */
export function getScenarios(tenantId: string): SavedScenario[] {
  return getAllScenarios()
    .filter((s) => s.tenantId === tenantId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get a scenario by ID
 */
export function getScenario(scenarioId: string): SavedScenario | null {
  const scenarios = getAllScenarios();
  return scenarios.find((s) => s.id === scenarioId) || null;
}

/**
 * Get scenarios for a specific plan
 */
export function getScenariosForPlan(tenantId: string, ruleSetId: string): SavedScenario[] {
  return getScenarios(tenantId).filter((s) => s.basePlanId === ruleSetId);
}

/**
 * Save a new scenario
 */
export function saveScenario(
  tenantId: string,
  name: string,
  description: string,
  basePlanId: string,
  basePlanName: string,
  basePlanVersion: number,
  modifiers: ScenarioModifiers,
  impacts: ScenarioImpact,
  createdBy: string,
  createdByName: string
): SavedScenario {
  const now = new Date().toISOString();

  const scenario: SavedScenario = {
    id: `scn-${Date.now()}`,
    tenantId,
    name,
    nameEs: name, // In real app, would translate
    description,
    descriptionEs: description,
    basePlanId,
    basePlanName,
    basePlanVersion,
    modifiers,
    impacts,
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now,
    status: 'saved',
  };

  const scenarios = getAllScenarios();
  scenarios.push(scenario);
  saveScenarios(scenarios);

  return scenario;
}

/**
 * Update an existing scenario
 */
export function updateScenario(
  scenarioId: string,
  updates: Partial<Pick<SavedScenario, 'name' | 'description' | 'modifiers' | 'impacts' | 'status'>>
): SavedScenario | null {
  const scenarios = getAllScenarios();
  const index = scenarios.findIndex((s) => s.id === scenarioId);

  if (index < 0) return null;

  const scenario = scenarios[index];
  const updated: SavedScenario = {
    ...scenario,
    ...updates,
    nameEs: updates.name || scenario.nameEs,
    descriptionEs: updates.description || scenario.descriptionEs,
    updatedAt: new Date().toISOString(),
  };

  scenarios[index] = updated;
  saveScenarios(scenarios);

  return updated;
}

/**
 * Delete a scenario
 */
export function deleteScenario(scenarioId: string): boolean {
  const scenarios = getAllScenarios();
  const filtered = scenarios.filter((s) => s.id !== scenarioId);

  if (filtered.length === scenarios.length) return false;

  saveScenarios(filtered);
  return true;
}

/**
 * Duplicate a scenario
 */
export function duplicateScenario(
  scenarioId: string,
  newName: string,
  createdBy: string,
  createdByName: string
): SavedScenario | null {
  const original = getScenario(scenarioId);
  if (!original) return null;

  const now = new Date().toISOString();

  const duplicate: SavedScenario = {
    ...original,
    id: `scn-${Date.now()}`,
    name: newName,
    nameEs: newName,
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
  };

  const scenarios = getAllScenarios();
  scenarios.push(duplicate);
  saveScenarios(scenarios);

  return duplicate;
}

// ============================================
// SCENARIO COMPARISON
// ============================================

/**
 * Compare multiple scenarios
 */
export function compareScenarios(scenarioIds: string[]): ScenarioComparison | null {
  const scenarios = scenarioIds.map(getScenario).filter((s): s is SavedScenario => s !== null);

  if (scenarios.length < 2) return null;

  // All scenarios must be for the same base plan
  const basePlanId = scenarios[0].basePlanId;
  if (!scenarios.every((s) => s.basePlanId === basePlanId)) {
    return null;
  }

  // Build comparison data
  const allEmployeeIds = new Set<string>();
  scenarios.forEach((s) => {
    s.impacts.employeeImpacts.forEach((e) => allEmployeeIds.add(e.entityId));
  });

  const comparisonData = Array.from(allEmployeeIds).map((entityId) => {
    const scenarioPayouts: Record<string, number> = {};
    let baseline = 0;
    let entityName = '';

    scenarios.forEach((s) => {
      const impact = s.impacts.employeeImpacts.find((e) => e.entityId === entityId);
      if (impact) {
        scenarioPayouts[s.id] = impact.scenarioPayout;
        baseline = impact.baselinePayout;
        entityName = impact.entityName;
      }
    });

    return {
      entityId,
      entityName,
      baseline,
      scenarioPayouts,
    };
  });

  // Summary stats per scenario
  const summaryStats: ScenarioComparison['summaryStats'] = {};
  scenarios.forEach((s) => {
    const impacts = s.impacts.employeeImpacts;
    const totalPayout = impacts.reduce((sum, e) => sum + e.scenarioPayout, 0);
    const avgChange = impacts.reduce((sum, e) => sum + e.percentChange, 0) / impacts.length;

    let maxWinner = { name: '', change: -Infinity };
    let maxLoser = { name: '', change: Infinity };

    impacts.forEach((e) => {
      if (e.percentChange > maxWinner.change) {
        maxWinner = { name: e.entityName, change: e.percentChange };
      }
      if (e.percentChange < maxLoser.change) {
        maxLoser = { name: e.entityName, change: e.percentChange };
      }
    });

    summaryStats[s.id] = {
      totalPayout,
      avgChange,
      maxWinner,
      maxLoser,
    };
  });

  return {
    scenarios,
    baselinePlanId: basePlanId,
    comparisonDate: new Date().toISOString(),
    comparisonData,
    summaryStats,
  };
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get scenario statistics
 */
export function getScenarioStats(tenantId: string): {
  total: number;
  byStatus: Record<SavedScenario['status'], number>;
  avgImpact: number;
  recentlyUpdated: SavedScenario[];
} {
  const scenarios = getScenarios(tenantId);

  const byStatus: Record<SavedScenario['status'], number> = {
    draft: 0,
    saved: 0,
    approved: 0,
    applied: 0,
  };

  let totalImpact = 0;
  scenarios.forEach((s) => {
    byStatus[s.status]++;
    totalImpact += s.impacts.percentChange;
  });

  return {
    total: scenarios.length,
    byStatus,
    avgImpact: scenarios.length > 0 ? totalImpact / scenarios.length : 0,
    recentlyUpdated: scenarios.slice(0, 5),
  };
}

// ============================================
// HELPERS
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function saveScenarios(_scenarios: SavedScenario[]): void {
  // no-op: localStorage removed
}

// ============================================
// DEMO DATA
// ============================================

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getDefaultScenarios(): SavedScenario[] {
  return [
    {
      id: 'scn-demo-1',
      tenantId: 'retailco',
      name: 'Q2 Cost Optimization',
      nameEs: 'Optimizaci\u00f3n de Costos Q2',
      description: '10% reduction in base payouts to align with Q2 budget constraints',
      descriptionEs: 'Reducci\u00f3n del 10% en pagos base para alinearse con restricciones presupuestarias del Q2',
      basePlanId: 'plan-optivision',
      basePlanName: 'OptiVision Sales Plan',
      basePlanVersion: 1,
      modifiers: {
        globalMultiplier: 90,
        componentMultipliers: {},
        rateAdjustments: {},
        enabledComponents: {},
      },
      impacts: {
        totalBaselinePayout: 15000,
        totalScenarioPayout: 13500,
        absoluteChange: -1500,
        percentChange: -10,
        employeeImpacts: [
          {
            entityId: 'maria-rodriguez',
            entityName: 'Maria Rodriguez',
            role: 'Sales Associate',
            baselinePayout: 8500,
            scenarioPayout: 7650,
            absoluteChange: -850,
            percentChange: -10,
            componentImpacts: [],
          },
          {
            entityId: 'james-wilson',
            entityName: 'James Wilson',
            role: 'Sales Associate',
            baselinePayout: 6500,
            scenarioPayout: 5850,
            absoluteChange: -650,
            percentChange: -10,
            componentImpacts: [],
          },
        ],
        monthlyBudgetImpact: -1500,
        annualBudgetImpact: -18000,
        distributionStats: {
          median: { baseline: 7500, scenario: 6750 },
          p25: { baseline: 6500, scenario: 5850 },
          p75: { baseline: 8500, scenario: 7650 },
          max: { baseline: 8500, scenario: 7650 },
        },
      },
      createdBy: 'user-finance',
      createdByName: 'Finance Team',
      createdAt: daysAgo(5),
      updatedAt: daysAgo(3),
      status: 'saved',
    },
    {
      id: 'scn-demo-2',
      tenantId: 'retailco',
      name: 'Services Push Initiative',
      nameEs: 'Iniciativa de Impulso de Servicios',
      description: 'Increase services commission by 50% to drive attach rates',
      descriptionEs: 'Aumentar comisi\u00f3n de servicios en 50% para impulsar tasas de adherencia',
      basePlanId: 'plan-optivision',
      basePlanName: 'OptiVision Sales Plan',
      basePlanVersion: 1,
      modifiers: {
        globalMultiplier: 100,
        componentMultipliers: {
          'comp-services': 150,
        },
        rateAdjustments: {},
        enabledComponents: {},
      },
      impacts: {
        totalBaselinePayout: 15000,
        totalScenarioPayout: 16200,
        absoluteChange: 1200,
        percentChange: 8,
        employeeImpacts: [
          {
            entityId: 'maria-rodriguez',
            entityName: 'Maria Rodriguez',
            role: 'Sales Associate',
            baselinePayout: 8500,
            scenarioPayout: 9100,
            absoluteChange: 600,
            percentChange: 7.1,
            componentImpacts: [],
          },
          {
            entityId: 'james-wilson',
            entityName: 'James Wilson',
            role: 'Sales Associate',
            baselinePayout: 6500,
            scenarioPayout: 7100,
            absoluteChange: 600,
            percentChange: 9.2,
            componentImpacts: [],
          },
        ],
        monthlyBudgetImpact: 1200,
        annualBudgetImpact: 14400,
        distributionStats: {
          median: { baseline: 7500, scenario: 8100 },
          p25: { baseline: 6500, scenario: 7100 },
          p75: { baseline: 8500, scenario: 9100 },
          max: { baseline: 8500, scenario: 9100 },
        },
      },
      createdBy: 'user-sarah',
      createdByName: 'Sarah Chen',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
      status: 'draft',
    },
  ];
}

/**
 * Initialize scenarios
 */
export function initializeScenarios(): void {
  // no-op: localStorage removed
}

/**
 * Reset to defaults
 */
export function resetScenarios(): void {
  // no-op: localStorage removed
}
