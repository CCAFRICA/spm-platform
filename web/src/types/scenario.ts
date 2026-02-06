/**
 * Scenario Modeling Types
 *
 * Types for compensation plan scenario modeling and what-if analysis.
 */

export interface SavedScenario {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;

  // Base plan reference
  basePlanId: string;
  basePlanName: string;
  basePlanVersion: number;

  // Modifier configuration
  modifiers: ScenarioModifiers;

  // Calculated impacts (cached for display)
  impacts: ScenarioImpact;

  // Metadata
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;

  // Status
  status: 'draft' | 'saved' | 'approved' | 'applied';
  appliedAt?: string;
  appliedBy?: string;
}

export interface ScenarioModifiers {
  globalMultiplier: number; // Percentage (100 = no change)
  componentMultipliers: Record<string, number>; // componentId -> percentage
  rateAdjustments: Record<string, number>; // componentId -> absolute adjustment
  enabledComponents: Record<string, boolean>; // componentId -> enabled

  // Advanced modifiers
  tierAdjustments?: TierAdjustment[];
  matrixAdjustments?: MatrixAdjustment[];
}

export interface TierAdjustment {
  componentId: string;
  tierIndex: number;
  valueChange: number; // Absolute change or percentage based on type
  changeType: 'absolute' | 'percentage';
}

export interface MatrixAdjustment {
  componentId: string;
  rowIndex: number;
  colIndex: number;
  valueChange: number;
  changeType: 'absolute' | 'percentage';
}

export interface ScenarioImpact {
  // Aggregate impacts
  totalBaselinePayout: number;
  totalScenarioPayout: number;
  absoluteChange: number;
  percentChange: number;

  // Per-employee impacts
  employeeImpacts: EmployeeScenarioImpact[];

  // Budget impact
  monthlyBudgetImpact: number;
  annualBudgetImpact: number;

  // Distribution changes
  distributionStats: {
    median: { baseline: number; scenario: number };
    p25: { baseline: number; scenario: number };
    p75: { baseline: number; scenario: number };
    max: { baseline: number; scenario: number };
  };
}

export interface EmployeeScenarioImpact {
  employeeId: string;
  employeeName: string;
  role: string;
  baselinePayout: number;
  scenarioPayout: number;
  absoluteChange: number;
  percentChange: number;

  // Component-level breakdown
  componentImpacts: ComponentImpact[];
}

export interface ComponentImpact {
  componentId: string;
  componentName: string;
  baselineValue: number;
  scenarioValue: number;
  change: number;
}

export interface ScenarioComparison {
  scenarios: SavedScenario[];
  baselinePlanId: string;
  comparisonDate: string;

  // Comparison matrix
  comparisonData: {
    employeeId: string;
    employeeName: string;
    baseline: number;
    scenarioPayouts: Record<string, number>; // scenarioId -> payout
  }[];

  // Summary stats per scenario
  summaryStats: Record<string, {
    totalPayout: number;
    avgChange: number;
    maxWinner: { name: string; change: number };
    maxLoser: { name: string; change: number };
  }>;
}

// Scenario templates for quick starts
export interface ScenarioTemplate {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  category: 'cost_reduction' | 'performance_boost' | 'restructure' | 'custom';
  modifiers: Partial<ScenarioModifiers>;
  icon: string;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'cost-10',
    name: '10% Cost Reduction',
    nameEs: 'Reducci\u00f3n de Costos 10%',
    description: 'Reduce all payouts by 10% across the board',
    descriptionEs: 'Reduce todos los pagos en 10% en general',
    category: 'cost_reduction',
    modifiers: { globalMultiplier: 90 },
    icon: 'TrendingDown',
  },
  {
    id: 'boost-10',
    name: '10% Performance Boost',
    nameEs: 'Aumento de Rendimiento 10%',
    description: 'Increase all payouts by 10% to boost performance',
    descriptionEs: 'Aumenta todos los pagos en 10% para impulsar el rendimiento',
    category: 'performance_boost',
    modifiers: { globalMultiplier: 110 },
    icon: 'TrendingUp',
  },
  {
    id: 'high-performer-focus',
    name: 'High Performer Focus',
    nameEs: 'Enfoque en Alto Rendimiento',
    description: 'Steeper rewards for top performers, flatter for average',
    descriptionEs: 'Mayores recompensas para los mejores, menor para promedio',
    category: 'restructure',
    modifiers: { globalMultiplier: 100 },
    icon: 'Target',
  },
  {
    id: 'services-emphasis',
    name: 'Services Emphasis',
    nameEs: '\u00c9nfasis en Servicios',
    description: 'Increase services commission to drive attach rate',
    descriptionEs: 'Aumentar comisi\u00f3n de servicios para impulsar tasa de adherencia',
    category: 'restructure',
    modifiers: { globalMultiplier: 100 },
    icon: 'Wrench',
  },
];
