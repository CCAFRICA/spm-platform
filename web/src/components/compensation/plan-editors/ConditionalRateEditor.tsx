'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { ConditionalConfig, ConditionalRate } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface ConditionalRateEditorProps {
  config: ConditionalConfig;
  onChange?: (config: ConditionalConfig) => void;
  readOnly?: boolean;
  originalConfig?: ConditionalConfig;
  compact?: boolean;
}

export function ConditionalRateEditor({
  config,
  onChange,
  readOnly = false,
  originalConfig,
  compact = false,
}: ConditionalRateEditorProps) {
  const handleConditionChange = (
    index: number,
    field: keyof ConditionalRate,
    value: string
  ) => {
    if (readOnly || !onChange) return;

    const newConditions = config.conditions.map((condition, i) => {
      if (i !== index) return condition;

      if (field === 'label' || field === 'metric' || field === 'metricLabel') {
        return { ...condition, [field]: value };
      }

      const numValue = field === 'rate' ? parseFloat(value) / 100 : parseFloat(value) || 0;
      return { ...condition, [field]: numValue };
    });

    onChange({ ...config, conditions: newConditions });
  };

  const addCondition = () => {
    if (readOnly || !onChange) return;

    const lastCondition = config.conditions[config.conditions.length - 1];
    const newCondition: ConditionalRate = {
      metric: lastCondition?.metric || 'collection_rate',
      metricLabel: lastCondition?.metricLabel || 'Collection Rate',
      min: lastCondition?.max === Infinity ? lastCondition.min + 5 : lastCondition?.max || 0,
      max: Infinity,
      rate: (lastCondition?.rate || 0) + 0.01,
      label: 'New Condition',
    };

    onChange({
      ...config,
      conditions: [...config.conditions, newCondition],
    });
  };

  const removeCondition = (index: number) => {
    if (readOnly || !onChange || config.conditions.length <= 1) return;

    onChange({
      ...config,
      conditions: config.conditions.filter((_, i) => i !== index),
    });
  };

  const isConditionChanged = (index: number): boolean => {
    if (!originalConfig) return false;
    const original = originalConfig.conditions[index];
    const current = config.conditions[index];
    if (!original || !current) return true;
    return (
      original.min !== current.min ||
      original.max !== current.max ||
      original.rate !== current.rate ||
      original.label !== current.label
    );
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatThreshold = (value: number) => {
    if (value === Infinity) return '∞';
    return `${value}%`;
  };

  return (
    <Card className={cn(compact && 'border-0 shadow-none')}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Conditional Rates</span>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-3 w-3 mr-1" /> Add Condition
              </Button>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(compact && 'p-0')}>
        <div className="space-y-3">
          {/* Applied To */}
          <div className="pb-3 border-b">
            <Label className="text-xs text-muted-foreground">Applied To</Label>
            {readOnly ? (
              <div className="text-sm font-medium mt-1">{config.appliedToLabel}</div>
            ) : (
              <Input
                value={config.appliedToLabel}
                onChange={(e) => onChange?.({ ...config, appliedToLabel: e.target.value })}
                className="h-8 text-sm mt-1"
              />
            )}
          </div>

          {/* Conditions */}
          {config.conditions.map((condition, index) => {
            const isChanged = isConditionChanged(index);

            return (
              <div
                key={index}
                className={cn(
                  'p-3 rounded-md border',
                  isChanged && 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* Label */}
                    {readOnly ? (
                      <div className="text-sm font-medium">{condition.label}</div>
                    ) : (
                      <Input
                        value={condition.label}
                        onChange={(e) => handleConditionChange(index, 'label', e.target.value)}
                        className="h-7 text-xs font-medium"
                        placeholder="Condition label"
                      />
                    )}

                    {/* Threshold Range */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">When {condition.metricLabel}:</span>
                      {readOnly ? (
                        <span>
                          {formatThreshold(condition.min)} - {formatThreshold(condition.max)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={condition.min}
                            onChange={(e) => handleConditionChange(index, 'min', e.target.value)}
                            className="h-6 w-16 text-xs"
                          />
                          <span>-</span>
                          <Input
                            type="number"
                            value={condition.max === Infinity ? '' : condition.max}
                            onChange={(e) =>
                              handleConditionChange(index, 'max', e.target.value || 'Infinity')
                            }
                            className="h-6 w-16 text-xs"
                            placeholder="∞"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>

                    {/* Rate */}
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">Rate:</span>
                      {readOnly ? (
                        <span
                          className={cn(
                            'text-lg font-bold',
                            isChanged && 'text-yellow-700 dark:text-yellow-400'
                          )}
                        >
                          {formatPercent(condition.rate)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            value={(condition.rate * 100).toFixed(1)}
                            onChange={(e) => handleConditionChange(index, 'rate', e.target.value)}
                            className={cn('h-8 w-20 text-sm font-semibold', isChanged && 'border-yellow-500')}
                          />
                          <span className="font-semibold">%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remove Button */}
                  {!readOnly && config.conditions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => removeCondition(index)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Preview */}
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs text-muted-foreground mb-2">Rate Scale</div>
            <div className="flex gap-1">
              {config.conditions.map((condition, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex-1 text-center py-1 px-2 rounded text-xs',
                    condition.rate === 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  )}
                >
                  {formatPercent(condition.rate)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
