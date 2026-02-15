'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Beaker,
  FileText,
  Save,
  Bookmark,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { toast } from 'sonner';
import { getActiveRuleSet } from '@/lib/supabase/rule-set-service';
import {
  calculateIncentive,
  calculateIncentiveWithConfig,
  getMariaMetrics,
  getJamesMetrics,
} from '@/lib/compensation/calculation-engine';
import {
  getScenarios,
  saveScenario,
  initializeScenarios,
} from '@/lib/scenarios/scenario-service';
import { ScenarioBuilder } from '@/components/compensation/ScenarioBuilder';
import { ScenarioComparison } from '@/components/compensation/ScenarioComparison';
import { TeamImpactSummary } from '@/components/compensation/TeamImpactSummary';
import { SavedScenariosList } from '@/components/compensation/SavedScenariosList';
import type {
  RuleSetConfig,
  AdditiveLookupConfig,
  CalculationResult,
} from '@/types/compensation-plan';
import type { SavedScenario, ScenarioModifiers, ScenarioImpact } from '@/types/scenario';

// Demo employees for scenario modeling
const DEMO_EMPLOYEES = [
  { id: 'maria-rodriguez', name: 'Maria Rodriguez', role: 'Sales Associate', getMetrics: getMariaMetrics },
  { id: 'james-wilson', name: 'James Wilson', role: 'Sales Associate', getMetrics: getJamesMetrics },
];

export default function ScenarioModelingPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [activePlan, setActivePlan] = useState<RuleSetConfig | null>(null);
  const [baselineResults, setBaselineResults] = useState<Map<string, CalculationResult>>(new Map());
  const [scenarioResults, setScenarioResults] = useState<Map<string, CalculationResult>>(new Map());
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');

  // Current modifiers for saving
  const [currentModifiers, setCurrentModifiers] = useState<ScenarioModifiers>({
    globalMultiplier: 100,
    componentMultipliers: {},
    rateAdjustments: {},
    enabledComponents: {},
  });

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');

  // Load active plan and saved scenarios
  useEffect(() => {
    if (!currentTenant) return;

    const loadData = async () => {
      initializeScenarios();
      const plan = await getActiveRuleSet(currentTenant.id);
      setActivePlan(plan);

      // Load saved scenarios
      const scenarios = getScenarios(currentTenant.id);
      setSavedScenarios(scenarios);

      // Calculate baseline for all employees
      if (plan) {
        const baselines = new Map<string, CalculationResult>();
        DEMO_EMPLOYEES.forEach((emp) => {
          const metrics = emp.getMetrics();
          const result = calculateIncentive(metrics, currentTenant.id);
          if (result) {
            baselines.set(emp.id, result);
          }
        });
        setBaselineResults(baselines);
      }

      setIsLoading(false);
    };

    loadData();
  }, [currentTenant]);

  const loadSavedScenarios = useCallback(() => {
    if (!currentTenant) return;
    const scenarios = getScenarios(currentTenant.id);
    setSavedScenarios(scenarios);
  }, [currentTenant]);

  // Recalculate scenario results when config changes
  const handleScenarioChange = useCallback((config: AdditiveLookupConfig, modifiers?: ScenarioModifiers) => {
    if (!currentTenant || !activePlan) return;

    const scenarios = new Map<string, CalculationResult>();
    DEMO_EMPLOYEES.forEach((emp) => {
      const metrics = emp.getMetrics();
      const result = calculateIncentiveWithConfig(metrics, config, activePlan);
      if (result) {
        scenarios.set(emp.id, result);
      }
    });
    setScenarioResults(scenarios);

    // Track modifiers for saving
    if (modifiers) {
      setCurrentModifiers(modifiers);
    }
  }, [currentTenant, activePlan]);

  // Load a saved scenario
  const handleLoadScenario = (scenario: SavedScenario) => {
    setCurrentModifiers(scenario.modifiers);
    toast.success(isSpanish ? `Escenario "${scenario.name}" cargado` : `Scenario "${scenario.name}" loaded`);
  };

  // Save current scenario
  const handleSaveScenario = () => {
    if (!activePlan || !currentTenant || !scenarioName.trim()) return;

    // Calculate impacts
    const impacts = calculateImpacts();

    saveScenario(
      currentTenant.id,
      scenarioName,
      scenarioDescription,
      activePlan.id,
      activePlan.name,
      activePlan.version,
      currentModifiers,
      impacts,
      user?.id || 'admin',
      user?.name || 'Admin'
    );

    toast.success(isSpanish ? 'Escenario guardado' : 'Scenario saved');
    setShowSaveDialog(false);
    setScenarioName('');
    setScenarioDescription('');
    loadSavedScenarios();
  };

  // Calculate impacts for saving
  const calculateImpacts = (): ScenarioImpact => {
    const employeeImpacts = DEMO_EMPLOYEES.map((emp) => {
      const baseline = baselineResults.get(emp.id);
      const scenario = scenarioResults.get(emp.id);

      const baselinePayout = baseline?.totalIncentive || 0;
      const scenarioPayout = scenario?.totalIncentive || 0;
      const absoluteChange = scenarioPayout - baselinePayout;
      const percentChange = baselinePayout > 0 ? (absoluteChange / baselinePayout) * 100 : 0;

      return {
        entityId: emp.id,
        entityName: emp.name,
        role: emp.role,
        baselinePayout,
        scenarioPayout,
        absoluteChange,
        percentChange,
        componentImpacts: [],
      };
    });

    const totalBaseline = employeeImpacts.reduce((sum, e) => sum + e.baselinePayout, 0);
    const totalScenario = employeeImpacts.reduce((sum, e) => sum + e.scenarioPayout, 0);

    return {
      totalBaselinePayout: totalBaseline,
      totalScenarioPayout: totalScenario,
      absoluteChange: totalScenario - totalBaseline,
      percentChange: totalBaseline > 0 ? ((totalScenario - totalBaseline) / totalBaseline) * 100 : 0,
      employeeImpacts,
      monthlyBudgetImpact: totalScenario - totalBaseline,
      annualBudgetImpact: (totalScenario - totalBaseline) * 12,
      distributionStats: {
        median: { baseline: totalBaseline / 2, scenario: totalScenario / 2 },
        p25: { baseline: totalBaseline * 0.25, scenario: totalScenario * 0.25 },
        p75: { baseline: totalBaseline * 0.75, scenario: totalScenario * 0.75 },
        max: { baseline: Math.max(...employeeImpacts.map((e) => e.baselinePayout)), scenario: Math.max(...employeeImpacts.map((e) => e.scenarioPayout)) },
      },
    };
  };

  const handleReset = () => {
    if (activePlan) {
      // Recalculate with original config
      handleScenarioChange(activePlan.configuration as AdditiveLookupConfig);
    }
  };

  // Calculate team impacts
  const getTeamImpacts = () => {
    return DEMO_EMPLOYEES.map((emp) => {
      const baseline = baselineResults.get(emp.id);
      const scenario = scenarioResults.get(emp.id);

      const baselineTotal = baseline?.totalIncentive || 0;
      const scenarioTotal = scenario?.totalIncentive || 0;
      const difference = scenarioTotal - baselineTotal;
      const percentChange = baselineTotal > 0 ? ((difference / baselineTotal) * 100) : 0;

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        baseline: baselineTotal,
        scenario: scenarioTotal,
        difference,
        percentChange,
      };
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading scenario builder...</p>
        </div>
      </div>
    );
  }

  if (!activePlan) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Beaker className="h-6 w-6 text-primary" />
            Scenario Modeling
          </h1>
          <p className="text-muted-foreground">
            Model compensation plan changes before implementing
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-2">No Active Plan Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create and activate a compensation plan to use scenario modeling.
            </p>
            <Button asChild>
              <a href="/performance/plans">Go to Plans</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Beaker className="h-6 w-6 text-primary" />
            {isSpanish ? 'Modelado de Escenarios' : 'Scenario Modeling'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Modela cambios en el plan de compensaci\u00f3n antes de implementar'
              : 'Model compensation plan changes before implementing'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-2">
            <FileText className="h-3 w-3" />
            {isSpanish ? 'Plan Base:' : 'Base Plan:'} {activePlan.name}
          </Badge>
          <Button onClick={() => setShowSaveDialog(true)}>
            <Save className="h-4 w-4 mr-2" />
            {isSpanish ? 'Guardar Escenario' : 'Save Scenario'}
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <Beaker className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                What-If Analysis Mode
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Adjust plan parameters on the left to see how compensation would change for your team.
                Changes here are not applied until you explicitly save and activate them.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Scenario Builder - Left Column */}
        <div className="lg:col-span-1 space-y-6">
          <ScenarioBuilder
            basePlan={activePlan}
            onScenarioChange={handleScenarioChange}
            onReset={handleReset}
          />

          {/* Saved Scenarios */}
          <SavedScenariosList
            scenarios={savedScenarios}
            onSelect={handleLoadScenario}
            onRefresh={loadSavedScenarios}
            currentUserId={user?.id || 'admin'}
            currentUserName={user?.name || 'Admin'}
          />
        </div>

        {/* Results - Right Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* View Toggle */}
          <div className="flex items-center gap-4">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Team Summary</SelectItem>
                {DEMO_EMPLOYEES.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team Summary View */}
          {selectedEmployee === 'all' && (
            <TeamImpactSummary
              impacts={getTeamImpacts()}
            />
          )}

          {/* Individual Employee View */}
          {selectedEmployee !== 'all' && (
            <>
              {(() => {
                const emp = DEMO_EMPLOYEES.find((e) => e.id === selectedEmployee);
                const baseline = baselineResults.get(selectedEmployee);
                const scenario = scenarioResults.get(selectedEmployee);

                if (!emp || !baseline || !scenario) {
                  return (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">
                          No data available for this employee.
                        </p>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <ScenarioComparison
                    baseline={baseline}
                    scenario={scenario}
                    entityName={emp.name}
                    scenarioName="Modified Plan"
                  />
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Save Scenario Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Guardar Escenario' : 'Save Scenario'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Guarda esta configuraci\u00f3n de escenario para referencia futura.'
                : 'Save this scenario configuration for future reference.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{isSpanish ? 'Nombre del Escenario' : 'Scenario Name'}</Label>
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder={isSpanish ? 'ej. Reducci\u00f3n de Costos Q2' : 'e.g., Q2 Cost Reduction'}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{isSpanish ? 'Descripci\u00f3n (opcional)' : 'Description (optional)'}</Label>
              <Textarea
                value={scenarioDescription}
                onChange={(e) => setScenarioDescription(e.target.value)}
                placeholder={isSpanish ? 'Describe el prop\u00f3sito de este escenario...' : 'Describe the purpose of this scenario...'}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveScenario} disabled={!scenarioName.trim()}>
              <Bookmark className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
