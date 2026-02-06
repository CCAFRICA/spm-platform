'use client';

/**
 * Export Dialog Component
 *
 * Dialog for exporting analytics data in various formats.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileText, FileSpreadsheet, File } from 'lucide-react';
import type { MetricType, ExportConfig } from '@/types/analytics';
import { METRIC_CONFIG } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (config: ExportConfig) => void;
  dateRange: { start: string; end: string };
}

export function ExportDialog({
  open,
  onOpenChange,
  onExport,
  dateRange,
}: ExportDialogProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>([
    'revenue',
    'quota_attainment',
    'commission_paid',
  ]);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeBreakdowns, setIncludeBreakdowns] = useState(true);

  const handleToggleMetric = (metric: MetricType) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric]
    );
  };

  const handleExport = () => {
    onExport({
      format,
      metrics: selectedMetrics,
      dateRange,
      includeCharts,
      includeBreakdowns,
    });
    onOpenChange(false);
  };

  const formatIcons = {
    csv: FileText,
    xlsx: FileSpreadsheet,
    pdf: File,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isSpanish ? 'Exportar Análisis' : 'Export Analytics'}
          </DialogTitle>
          <DialogDescription>
            {isSpanish
              ? 'Seleccione el formato y las métricas a incluir en la exportación.'
              : 'Select the format and metrics to include in the export.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label>{isSpanish ? 'Formato' : 'Format'}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['csv', 'xlsx', 'pdf'] as const).map((f) => {
                const Icon = formatIcons[f];
                return (
                  <Button
                    key={f}
                    type="button"
                    variant={format === f ? 'default' : 'outline'}
                    className="flex items-center gap-2"
                    onClick={() => setFormat(f)}
                  >
                    <Icon className="h-4 w-4" />
                    {f.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Metric Selection */}
          <div className="space-y-2">
            <Label>{isSpanish ? 'Métricas' : 'Metrics'}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(METRIC_CONFIG) as MetricType[]).map((metric) => {
                const config = METRIC_CONFIG[metric];
                return (
                  <label
                    key={metric}
                    className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedMetrics.includes(metric)}
                      onCheckedChange={() => handleToggleMetric(metric)}
                    />
                    <span className="text-sm">
                      {isSpanish ? config.nameEs : config.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>{isSpanish ? 'Opciones' : 'Options'}</Label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeCharts}
                onCheckedChange={(checked) => setIncludeCharts(checked === true)}
                disabled={format === 'csv'}
              />
              <span className="text-sm">
                {isSpanish ? 'Incluir gráficos' : 'Include charts'}
              </span>
              {format === 'csv' && (
                <span className="text-xs text-muted-foreground">
                  ({isSpanish ? 'No disponible para CSV' : 'Not available for CSV'})
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeBreakdowns}
                onCheckedChange={(checked) => setIncludeBreakdowns(checked === true)}
              />
              <span className="text-sm">
                {isSpanish ? 'Incluir desgloses' : 'Include breakdowns'}
              </span>
            </label>
          </div>

          {/* Date Range Display */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              {isSpanish ? 'Rango de fechas' : 'Date Range'}
            </p>
            <p className="font-medium">
              {new Date(dateRange.start).toLocaleDateString(locale)} —{' '}
              {new Date(dateRange.end).toLocaleDateString(locale)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isSpanish ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedMetrics.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {isSpanish ? 'Exportar' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
