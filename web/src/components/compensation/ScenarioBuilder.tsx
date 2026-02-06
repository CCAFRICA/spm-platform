'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Beaker,
  RotateCcw,
  Save,
  DollarSign,
  Percent,
  AlertTriangle,
} from 'lucide-react';
import type { CompensationPlanConfig, AdditiveLookupConfig } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface ScenarioBuilderProps {
  basePlan: CompensationPlanConfig;
  onScenarioChange: (modifiedConfig: AdditiveLookupConfig) => void;
  onReset: () => void;
}

interface ModifierState {
  globalMultiplier: number;
  componentMultipliers: Record<string, number>;
  rateAdjustments: Record<string, number>;
  enabledComponents: Record<string, boolean>;
}

export function ScenarioBuilder({
  basePlan,
  onScenarioChange,
  onReset,
}: ScenarioBuilderProps) {
  const baseConfig = basePlan.configuration as AdditiveLookupConfig;
  // Get components from first variant (for demo simplicity)
  const baseComponents = useMemo(
    () => baseConfig.variants[0]?.components || [],
    [baseConfig]
  );

  const [modifiers, setModifiers] = useState<ModifierState>({
    globalMultiplier: 100,
    componentMultipliers: {},
    rateAdjustments: {},
    enabledComponents: {},
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Initialize component states
  useEffect(() => {
    const componentMultipliers: Record<string, number> = {};
    const rateAdjustments: Record<string, number> = {};
    const enabledComponents: Record<string, boolean> = {};

    baseComponents.forEach((comp) => {
      componentMultipliers[comp.id] = 100;
      rateAdjustments[comp.id] = 0;
      enabledComponents[comp.id] = true;
    });

    setModifiers({
      globalMultiplier: 100,
      componentMultipliers,
      rateAdjustments,
      enabledComponents,
    });
  }, [baseComponents]);

  const applyModifiers = useCallback((): AdditiveLookupConfig => {
    const globalMult = modifiers.globalMultiplier / 100;

    return {
      ...baseConfig,
      variants: baseConfig.variants.map((variant) => ({
        ...variant,
        components: variant.components.map((comp) => {
          const compMult = (modifiers.componentMultipliers[comp.id] || 100) / 100;
          const isEnabled = modifiers.enabledComponents[comp.id] !== false;

          if (!isEnabled) {
            // Return disabled component
            return {
              ...comp,
              enabled: false,
            };
          }

          // Apply multipliers based on component type
          if (comp.matrixConfig) {
            return {
              ...comp,
              matrixConfig: {
                ...comp.matrixConfig,
                values: comp.matrixConfig.values.map((row) =>
                  row.map((val) => Math.round(val * globalMult * compMult))
                ),
              },
            };
          }

          if (comp.tierConfig) {
            return {
              ...comp,
              tierConfig: {
                ...comp.tierConfig,
                tiers: comp.tierConfig.tiers.map((tier) => ({
                  ...tier,
                  value: Math.round(tier.value * globalMult * compMult),
                })),
              },
            };
          }

          if (comp.percentageConfig) {
            return {
              ...comp,
              percentageConfig: {
                ...comp.percentageConfig,
                rate: comp.percentageConfig.rate * globalMult * compMult,
              },
            };
          }

          if (comp.conditionalConfig) {
            return {
              ...comp,
              conditionalConfig: {
                ...comp.conditionalConfig,
                conditions: comp.conditionalConfig.conditions.map((cond) => ({
                  ...cond,
                  rate: cond.rate * globalMult * compMult,
                })),
              },
            };
          }

          return comp;
        }),
      })),
    };
  }, [baseConfig, modifiers]);

  // Apply modifiers and notify parent
  useEffect(() => {
    const modifiedConfig = applyModifiers();
    onScenarioChange(modifiedConfig);

    // Check if any changes from baseline
    const hasGlobalChange = modifiers.globalMultiplier !== 100;
    const hasComponentChanges = Object.values(modifiers.componentMultipliers).some((v) => v !== 100);
    const hasRateChanges = Object.values(modifiers.rateAdjustments).some((v) => v !== 0);
    const hasDisabledComponents = Object.values(modifiers.enabledComponents).some((v) => !v);

    setHasChanges(hasGlobalChange || hasComponentChanges || hasRateChanges || hasDisabledComponents);
  }, [modifiers, applyModifiers, onScenarioChange]);

  const handleGlobalMultiplierChange = (value: number[]) => {
    setModifiers((prev) => ({ ...prev, globalMultiplier: value[0] }));
  };

  const handleComponentMultiplierChange = (componentId: string, value: number[]) => {
    setModifiers((prev) => ({
      ...prev,
      componentMultipliers: {
        ...prev.componentMultipliers,
        [componentId]: value[0],
      },
    }));
  };

  const handleComponentToggle = (componentId: string, enabled: boolean) => {
    setModifiers((prev) => ({
      ...prev,
      enabledComponents: {
        ...prev.enabledComponents,
        [componentId]: enabled,
      },
    }));
  };

  const handleReset = () => {
    const componentMultipliers: Record<string, number> = {};
    const rateAdjustments: Record<string, number> = {};
    const enabledComponents: Record<string, boolean> = {};

    baseComponents.forEach((comp) => {
      componentMultipliers[comp.id] = 100;
      rateAdjustments[comp.id] = 0;
      enabledComponents[comp.id] = true;
    });

    setModifiers({
      globalMultiplier: 100,
      componentMultipliers,
      rateAdjustments,
      enabledComponents,
    });

    onReset();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Beaker className="h-5 w-5" />
              Scenario Builder
            </CardTitle>
            <CardDescription>
              Adjust parameters to model compensation changes
            </CardDescription>
          </div>
          {hasChanges && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Unsaved Changes
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global Multiplier */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Global Payout Multiplier
            </Label>
            <span className="text-sm font-medium">
              {modifiers.globalMultiplier}%
            </span>
          </div>
          <Slider
            value={[modifiers.globalMultiplier]}
            onValueChange={handleGlobalMultiplierChange}
            min={50}
            max={150}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50% (Reduce)</span>
            <span>100% (No Change)</span>
            <span>150% (Increase)</span>
          </div>
        </div>

        {/* Component Adjustments */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Component Adjustments
          </Label>

          <div className="space-y-4">
            {baseComponents.map((comp) => {
              const isEnabled = modifiers.enabledComponents[comp.id] !== false;
              const multiplier = modifiers.componentMultipliers[comp.id] || 100;
              const lookupType = comp.matrixConfig ? 'matrix' : comp.tierConfig ? 'tier' : comp.percentageConfig ? 'percentage' : 'conditional';

              return (
                <div
                  key={comp.id}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    !isEnabled && 'bg-muted/50 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleComponentToggle(comp.id, checked)}
                      />
                      <div>
                        <div className="font-medium text-sm">{comp.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {lookupType} lookup
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {multiplier}%
                    </Badge>
                  </div>

                  {isEnabled && (
                    <div className="space-y-2">
                      <Slider
                        value={[multiplier]}
                        onValueChange={(v) => handleComponentMultiplierChange(comp.id, v)}
                        min={0}
                        max={200}
                        step={10}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>100%</span>
                        <span>200%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Scenarios */}
        <div className="space-y-3">
          <Label>Quick Scenarios</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModifiers((prev) => ({ ...prev, globalMultiplier: 110 }));
              }}
            >
              +10% Across Board
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModifiers((prev) => ({ ...prev, globalMultiplier: 90 }));
              }}
            >
              -10% Cost Reduction
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newMultipliers = { ...modifiers.componentMultipliers };
                baseComponents.forEach((comp) => {
                  if (comp.name.toLowerCase().includes('insurance')) {
                    newMultipliers[comp.id] = 150;
                  }
                });
                setModifiers((prev) => ({
                  ...prev,
                  componentMultipliers: newMultipliers,
                }));
              }}
            >
              Boost Insurance 50%
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!hasChanges}>
              <Save className="h-4 w-4 mr-2" />
              Save Scenario
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
