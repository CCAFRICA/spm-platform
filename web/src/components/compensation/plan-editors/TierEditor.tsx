'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { TierConfig, Tier } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface TierEditorProps {
  config: TierConfig;
  onChange?: (config: TierConfig) => void;
  readOnly?: boolean;
  originalConfig?: TierConfig;
  compact?: boolean;
}

export function TierEditor({
  config,
  onChange,
  readOnly = false,
  originalConfig,
  compact = false,
}: TierEditorProps) {
  const handleTierChange = (index: number, field: keyof Tier, value: string) => {
    if (readOnly || !onChange) return;

    const newTiers = config.tiers.map((tier, i) => {
      if (i !== index) return tier;

      if (field === 'label') {
        return { ...tier, label: value };
      }

      const numValue = parseFloat(value) || 0;
      return { ...tier, [field]: numValue };
    });

    onChange({ ...config, tiers: newTiers });
  };

  const addTier = () => {
    if (readOnly || !onChange) return;

    const lastTier = config.tiers[config.tiers.length - 1];
    const newTier: Tier = {
      min: lastTier.max === Infinity ? lastTier.min + 10 : lastTier.max,
      max: Infinity,
      label: 'New Tier',
      value: lastTier.value + 100,
    };

    onChange({
      ...config,
      tiers: [...config.tiers, newTier],
    });
  };

  const removeTier = (index: number) => {
    if (readOnly || !onChange || config.tiers.length <= 2) return;

    onChange({
      ...config,
      tiers: config.tiers.filter((_, i) => i !== index),
    });
  };

  const isTierChanged = (index: number): boolean => {
    if (!originalConfig) return false;
    const original = originalConfig.tiers[index];
    const current = config.tiers[index];
    if (!original || !current) return true;
    return (
      original.min !== current.min ||
      original.max !== current.max ||
      original.value !== current.value ||
      original.label !== current.label
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: config.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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
            <span>{config.metricLabel} Tiers</span>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addTier}>
                <Plus className="h-3 w-3 mr-1" /> Add Tier
              </Button>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(compact && 'p-0')}>
        <div className="space-y-2">
          {config.tiers.map((tier, index) => {
            const isChanged = isTierChanged(index);

            return (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md border',
                  isChanged && 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700'
                )}
              >
                {!readOnly && (
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                )}

                <div className="flex-1 grid grid-cols-4 gap-2 items-center">
                  {/* Range */}
                  <div className="flex items-center gap-1">
                    {readOnly ? (
                      <span className="text-sm">
                        {formatThreshold(tier.min)} - {formatThreshold(tier.max)}
                      </span>
                    ) : (
                      <>
                        <Input
                          type="number"
                          value={tier.min}
                          onChange={(e) => handleTierChange(index, 'min', e.target.value)}
                          className="h-7 w-16 text-xs"
                          placeholder="Min"
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                          type="number"
                          value={tier.max === Infinity ? '' : tier.max}
                          onChange={(e) =>
                            handleTierChange(index, 'max', e.target.value || 'Infinity')
                          }
                          className="h-7 w-16 text-xs"
                          placeholder="∞"
                        />
                      </>
                    )}
                  </div>

                  {/* Label */}
                  <div>
                    {readOnly ? (
                      <span className="text-sm font-medium">{tier.label}</span>
                    ) : (
                      <Input
                        value={tier.label}
                        onChange={(e) => handleTierChange(index, 'label', e.target.value)}
                        className="h-7 text-xs"
                        placeholder="Label"
                      />
                    )}
                  </div>

                  {/* Value */}
                  <div className="text-right">
                    {readOnly ? (
                      <span className={cn('text-sm font-semibold', isChanged && 'text-yellow-700 dark:text-yellow-400')}>
                        {formatCurrency(tier.value)}
                      </span>
                    ) : (
                      <Input
                        type="number"
                        value={tier.value}
                        onChange={(e) => handleTierChange(index, 'value', e.target.value)}
                        className={cn('h-7 text-xs text-right', isChanged && 'border-yellow-500')}
                        placeholder="Value"
                      />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="text-right">
                    {!readOnly && config.tiers.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => removeTier(index)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!compact && !readOnly && (
          <div className="mt-4">
            <Label className="text-xs">Metric Label</Label>
            <Input
              value={config.metricLabel}
              onChange={(e) => onChange?.({ ...config, metricLabel: e.target.value })}
              className="h-7 text-xs mt-1"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
