'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { CurveConfig, CurvePoint } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface MultiplierCurveEditorProps {
  config: CurveConfig;
  onChange?: (config: CurveConfig) => void;
  readOnly?: boolean;
  originalConfig?: CurveConfig;
  compact?: boolean;
}

// Preset curve configurations
const PRESETS = {
  conservative: {
    label: 'Conservative',
    points: [
      { attainment: 0.5, payout: 0 },
      { attainment: 0.8, payout: 0.5 },
      { attainment: 1.0, payout: 1.0 },
      { attainment: 1.2, payout: 1.2 },
      { attainment: 1.5, payout: 1.3 },
    ],
  },
  standard: {
    label: 'Standard',
    points: [
      { attainment: 0.5, payout: 0 },
      { attainment: 0.8, payout: 0.6 },
      { attainment: 1.0, payout: 1.0 },
      { attainment: 1.2, payout: 1.4 },
      { attainment: 1.5, payout: 1.8 },
    ],
  },
  aggressive: {
    label: 'Aggressive',
    points: [
      { attainment: 0.5, payout: 0 },
      { attainment: 0.8, payout: 0.4 },
      { attainment: 1.0, payout: 1.0 },
      { attainment: 1.2, payout: 1.6 },
      { attainment: 1.5, payout: 2.5 },
    ],
  },
};

export function MultiplierCurveEditor({
  config,
  onChange,
  readOnly = false,
  originalConfig,
  compact = false,
}: MultiplierCurveEditorProps) {
  const handlePointChange = (index: number, field: keyof CurvePoint, value: string) => {
    if (readOnly || !onChange) return;

    const numValue = parseFloat(value) || 0;
    const newPoints = config.points.map((point, i) => {
      if (i !== index) return point;
      return { ...point, [field]: numValue };
    });

    // Sort by attainment
    newPoints.sort((a, b) => a.attainment - b.attainment);

    onChange({ ...config, points: newPoints });
  };

  const addPoint = () => {
    if (readOnly || !onChange) return;

    const newPoint: CurvePoint = {
      attainment: 1.0,
      payout: 1.0,
    };

    const newPoints = [...config.points, newPoint].sort((a, b) => a.attainment - b.attainment);
    onChange({ ...config, points: newPoints });
  };

  const removePoint = (index: number) => {
    if (readOnly || !onChange || config.points.length <= 2) return;

    onChange({
      ...config,
      points: config.points.filter((_, i) => i !== index),
    });
  };

  const applyPreset = (preset: keyof typeof PRESETS) => {
    if (readOnly || !onChange) return;
    onChange({ ...config, points: PRESETS[preset].points });
  };

  const isPointChanged = (index: number): boolean => {
    if (!originalConfig) return false;
    const original = originalConfig.points[index];
    const current = config.points[index];
    if (!original || !current) return true;
    return original.attainment !== current.attainment || original.payout !== current.payout;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(0)}%`;
  };

  // Calculate SVG path for curve visualization
  const getCurvePath = () => {
    if (config.points.length < 2) return '';

    const width = 200;
    const height = 120;
    const padding = 20;

    const maxAttainment = Math.max(...config.points.map((p) => p.attainment), 1.5);
    const maxPayout = Math.max(...config.points.map((p) => p.payout), 2);

    const scaleX = (v: number) => padding + (v / maxAttainment) * (width - padding * 2);
    const scaleY = (v: number) => height - padding - (v / maxPayout) * (height - padding * 2);

    const pathData = config.points
      .map((point, i) => {
        const x = scaleX(point.attainment);
        const y = scaleY(point.payout);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    return pathData;
  };

  return (
    <Card className={cn(compact && 'border-0 shadow-none')}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Multiplier Curve</span>
            {!readOnly && (
              <div className="flex gap-1">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key as keyof typeof PRESETS)}
                    className="text-xs"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(compact && 'p-0')}>
        <div className="space-y-4">
          {/* Curve Visualization */}
          <div className="p-3 bg-muted/30 rounded-md">
            <svg viewBox="0 0 200 120" className="w-full h-32">
              {/* Grid */}
              <line x1="20" y1="100" x2="180" y2="100" stroke="#e5e7eb" strokeWidth="1" />
              <line x1="20" y1="20" x2="20" y2="100" stroke="#e5e7eb" strokeWidth="1" />

              {/* 100% reference lines */}
              <line
                x1="20"
                y1="60"
                x2="180"
                y2="60"
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4"
              />
              <line
                x1="87"
                y1="20"
                x2="87"
                y2="100"
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4"
              />

              {/* Curve */}
              <path d={getCurvePath()} fill="none" stroke="#8b5cf6" strokeWidth="2" />

              {/* Points */}
              {config.points.map((point, index) => {
                const maxAttainment = Math.max(...config.points.map((p) => p.attainment), 1.5);
                const maxPayout = Math.max(...config.points.map((p) => p.payout), 2);
                const x = 20 + (point.attainment / maxAttainment) * 160;
                const y = 100 - (point.payout / maxPayout) * 80;
                const isChanged = isPointChanged(index);

                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={isChanged ? '#eab308' : '#8b5cf6'}
                    stroke="white"
                    strokeWidth="2"
                  />
                );
              })}

              {/* Labels */}
              <text x="100" y="115" textAnchor="middle" className="text-[8px] fill-muted-foreground">
                Attainment %
              </text>
              <text
                x="8"
                y="60"
                textAnchor="middle"
                className="text-[8px] fill-muted-foreground"
                transform="rotate(-90, 8, 60)"
              >
                Payout
              </text>
            </svg>
          </div>

          {/* Floor & Cap */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Floor (min attainment)</Label>
              {readOnly ? (
                <div className="text-sm font-medium mt-1">{formatPercent(config.floor)}</div>
              ) : (
                <Input
                  type="number"
                  step="5"
                  value={(config.floor * 100).toFixed(0)}
                  onChange={(e) =>
                    onChange?.({ ...config, floor: parseFloat(e.target.value) / 100 || 0 })
                  }
                  className="h-8 text-sm mt-1"
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Cap (max payout)</Label>
              {readOnly ? (
                <div className="text-sm font-medium mt-1">{formatPercent(config.cap)}</div>
              ) : (
                <Input
                  type="number"
                  step="10"
                  value={(config.cap * 100).toFixed(0)}
                  onChange={(e) =>
                    onChange?.({ ...config, cap: parseFloat(e.target.value) / 100 || 0 })
                  }
                  className="h-8 text-sm mt-1"
                />
              )}
            </div>
          </div>

          {/* Points Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Curve Points</Label>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={addPoint}>
                  <Plus className="h-3 w-3 mr-1" /> Add Point
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {config.points.map((point, index) => {
                const isChanged = isPointChanged(index);

                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded border',
                      isChanged && 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20'
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-muted-foreground w-20">Attainment:</span>
                      {readOnly ? (
                        <span className="text-sm">{formatPercent(point.attainment)}</span>
                      ) : (
                        <Input
                          type="number"
                          step="5"
                          value={(point.attainment * 100).toFixed(0)}
                          onChange={(e) => handlePointChange(index, 'attainment', String(parseFloat(e.target.value) / 100))}
                          className="h-7 w-20 text-xs"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-muted-foreground w-14">Payout:</span>
                      {readOnly ? (
                        <span className={cn('text-sm font-medium', isChanged && 'text-yellow-700')}>
                          {formatPercent(point.payout)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="5"
                          value={(point.payout * 100).toFixed(0)}
                          onChange={(e) => handlePointChange(index, 'payout', String(parseFloat(e.target.value) / 100))}
                          className={cn('h-7 w-20 text-xs', isChanged && 'border-yellow-500')}
                        />
                      )}
                    </div>
                    {!readOnly && config.points.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => removePoint(index)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
