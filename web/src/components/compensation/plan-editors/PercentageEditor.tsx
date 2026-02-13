'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PercentageConfig } from '@/types/compensation-plan';
import { useCurrency } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';

interface PercentageEditorProps {
  config: PercentageConfig;
  onChange?: (config: PercentageConfig) => void;
  readOnly?: boolean;
  originalConfig?: PercentageConfig;
  compact?: boolean;
}

export function PercentageEditor({
  config,
  onChange,
  readOnly = false,
  originalConfig,
  compact = false,
}: PercentageEditorProps) {
  const { format: fmt } = useCurrency();
  const handleChange = (field: keyof PercentageConfig, value: string) => {
    if (readOnly || !onChange) return;

    if (field === 'appliedToLabel' || field === 'appliedTo') {
      onChange({ ...config, [field]: value });
    } else {
      const numValue = parseFloat(value) || 0;
      onChange({ ...config, [field]: numValue });
    }
  };

  const isRateChanged = originalConfig && originalConfig.rate !== config.rate;

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <Card className={cn(compact && 'border-0 shadow-none')}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Percentage Rate</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(compact && 'p-0')}>
        <div className="space-y-4">
          {/* Rate */}
          <div
            className={cn(
              'p-3 rounded-md border',
              isRateChanged && 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700'
            )}
          >
            <Label className="text-xs text-muted-foreground">Rate</Label>
            {readOnly ? (
              <div className={cn('text-2xl font-bold', isRateChanged && 'text-yellow-700 dark:text-yellow-400')}>
                {formatPercent(config.rate)}
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  step="0.1"
                  value={(config.rate * 100).toFixed(1)}
                  onChange={(e) => handleChange('rate', String(parseFloat(e.target.value) / 100))}
                  className={cn('h-10 text-lg font-semibold w-24', isRateChanged && 'border-yellow-500')}
                />
                <span className="text-lg font-semibold">%</span>
              </div>
            )}
          </div>

          {/* Applied To */}
          <div>
            <Label className="text-xs text-muted-foreground">Applied To</Label>
            {readOnly ? (
              <div className="text-sm font-medium mt-1">{config.appliedToLabel}</div>
            ) : (
              <Input
                value={config.appliedToLabel}
                onChange={(e) => handleChange('appliedToLabel', e.target.value)}
                className="h-8 text-sm mt-1"
              />
            )}
          </div>

          {/* Min Threshold */}
          {(config.minThreshold !== undefined || !readOnly) && (
            <div>
              <Label className="text-xs text-muted-foreground">Minimum Threshold</Label>
              {readOnly ? (
                <div className="text-sm mt-1">
                  {config.minThreshold !== undefined
                    ? fmt(config.minThreshold)
                    : 'None'}
                </div>
              ) : (
                <Input
                  type="number"
                  value={config.minThreshold ?? ''}
                  onChange={(e) => handleChange('minThreshold', e.target.value)}
                  className="h-8 text-sm mt-1"
                  placeholder="No minimum"
                />
              )}
            </div>
          )}

          {/* Max Payout */}
          {(config.maxPayout !== undefined || !readOnly) && (
            <div>
              <Label className="text-xs text-muted-foreground">Maximum Payout</Label>
              {readOnly ? (
                <div className="text-sm mt-1">
                  {config.maxPayout !== undefined
                    ? fmt(config.maxPayout)
                    : 'No cap'}
                </div>
              ) : (
                <Input
                  type="number"
                  value={config.maxPayout ?? ''}
                  onChange={(e) => handleChange('maxPayout', e.target.value)}
                  className="h-8 text-sm mt-1"
                  placeholder="No cap"
                />
              )}
            </div>
          )}

          {/* Preview */}
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs text-muted-foreground mb-1">Example Calculation</div>
            <div className="text-sm">
              {fmt(10000)} {config.appliedToLabel} × {formatPercent(config.rate)} ={' '}
              <span className="font-semibold">{fmt(10000 * config.rate)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
