'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { MatrixConfig, Band } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface MatrixEditorProps {
  config: MatrixConfig;
  onChange?: (config: MatrixConfig) => void;
  readOnly?: boolean;
  originalConfig?: MatrixConfig;
  compact?: boolean;
}

export function MatrixEditor({
  config,
  onChange,
  readOnly = false,
  originalConfig,
  compact = false,
}: MatrixEditorProps) {
  const [editingBand, setEditingBand] = useState<{ type: 'row' | 'col'; index: number } | null>(null);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    if (readOnly || !onChange) return;

    const numValue = parseFloat(value) || 0;
    const newValues = config.values.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? numValue : cell))
    );

    onChange({ ...config, values: newValues });
  };

  const handleBandChange = (type: 'row' | 'col', index: number, field: 'min' | 'max' | 'label', value: string) => {
    if (readOnly || !onChange) return;

    const bands = type === 'row' ? [...config.rowBands] : [...config.columnBands];
    const numValue = field === 'label' ? value : parseFloat(value) || 0;

    bands[index] = {
      ...bands[index],
      [field]: numValue,
    };

    onChange({
      ...config,
      ...(type === 'row' ? { rowBands: bands } : { columnBands: bands }),
    });
  };

  const addRow = () => {
    if (readOnly || !onChange) return;

    const lastRow = config.rowBands[config.rowBands.length - 1];
    const newBand: Band = {
      min: lastRow.max === Infinity ? lastRow.min + 10 : lastRow.max,
      max: Infinity,
      label: 'New Band',
    };

    const newValues = [...config.values, new Array(config.columnBands.length).fill(0)];

    onChange({
      ...config,
      rowBands: [...config.rowBands, newBand],
      values: newValues,
    });
  };

  const addColumn = () => {
    if (readOnly || !onChange) return;

    const lastCol = config.columnBands[config.columnBands.length - 1];
    const newBand: Band = {
      min: lastCol.max === Infinity ? lastCol.min + 10000 : lastCol.max,
      max: Infinity,
      label: 'New Band',
    };

    const newValues = config.values.map((row) => [...row, 0]);

    onChange({
      ...config,
      columnBands: [...config.columnBands, newBand],
      values: newValues,
    });
  };

  const removeRow = (index: number) => {
    if (readOnly || !onChange || config.rowBands.length <= 2) return;

    const newBands = config.rowBands.filter((_, i) => i !== index);
    const newValues = config.values.filter((_, i) => i !== index);

    onChange({
      ...config,
      rowBands: newBands,
      values: newValues,
    });
  };

  const removeColumn = (index: number) => {
    if (readOnly || !onChange || config.columnBands.length <= 2) return;

    const newBands = config.columnBands.filter((_, i) => i !== index);
    const newValues = config.values.map((row) => row.filter((_, i) => i !== index));

    onChange({
      ...config,
      columnBands: newBands,
      values: newValues,
    });
  };

  const isCellChanged = (rowIndex: number, colIndex: number): boolean => {
    if (!originalConfig) return false;
    return originalConfig.values[rowIndex]?.[colIndex] !== config.values[rowIndex]?.[colIndex];
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: config.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card className={cn(compact && 'border-0 shadow-none')}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>
              {config.rowMetricLabel} × {config.columnMetricLabel}
            </span>
            {!readOnly && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-3 w-3 mr-1" /> Row
                </Button>
                <Button variant="outline" size="sm" onClick={addColumn}>
                  <Plus className="h-3 w-3 mr-1" /> Column
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(compact && 'p-0')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left bg-muted/50 font-medium">
                  {config.rowMetricLabel} ↓ / {config.columnMetricLabel} →
                </th>
                {config.columnBands.map((band, colIndex) => (
                  <th key={colIndex} className="p-2 text-center bg-muted/50 font-medium min-w-[80px]">
                    {editingBand?.type === 'col' && editingBand.index === colIndex ? (
                      <Input
                        value={band.label}
                        onChange={(e) => handleBandChange('col', colIndex, 'label', e.target.value)}
                        onBlur={() => setEditingBand(null)}
                        autoFocus
                        className="h-6 text-xs text-center"
                      />
                    ) : (
                      <span
                        className={cn(!readOnly && 'cursor-pointer hover:text-primary')}
                        onClick={() => !readOnly && setEditingBand({ type: 'col', index: colIndex })}
                      >
                        {band.label}
                      </span>
                    )}
                    {!readOnly && config.columnBands.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 opacity-50 hover:opacity-100"
                        onClick={() => removeColumn(colIndex)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.rowBands.map((band, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="p-2 bg-muted/30 font-medium">
                    {editingBand?.type === 'row' && editingBand.index === rowIndex ? (
                      <Input
                        value={band.label}
                        onChange={(e) => handleBandChange('row', rowIndex, 'label', e.target.value)}
                        onBlur={() => setEditingBand(null)}
                        autoFocus
                        className="h-6 text-xs"
                      />
                    ) : (
                      <span
                        className={cn(!readOnly && 'cursor-pointer hover:text-primary')}
                        onClick={() => !readOnly && setEditingBand({ type: 'row', index: rowIndex })}
                      >
                        {band.label}
                      </span>
                    )}
                    {!readOnly && config.rowBands.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 opacity-50 hover:opacity-100"
                        onClick={() => removeRow(rowIndex)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                  {config.columnBands.map((_, colIndex) => {
                    const value = config.values[rowIndex]?.[colIndex] ?? 0;
                    const isChanged = isCellChanged(rowIndex, colIndex);

                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          'p-1 text-center',
                          isChanged && 'bg-yellow-100 dark:bg-yellow-900/30'
                        )}
                      >
                        {readOnly ? (
                          <span className={cn(isChanged && 'font-medium')}>
                            {formatCurrency(value)}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                            className={cn(
                              'h-8 text-center text-sm',
                              isChanged && 'border-yellow-500'
                            )}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!compact && !readOnly && (
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <Label className="text-xs">Row Metric</Label>
              <Input
                value={config.rowMetricLabel}
                onChange={(e) => onChange?.({ ...config, rowMetricLabel: e.target.value })}
                className="h-7 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Column Metric</Label>
              <Input
                value={config.columnMetricLabel}
                onChange={(e) => onChange?.({ ...config, columnMetricLabel: e.target.value })}
                className="h-7 text-xs mt-1"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
