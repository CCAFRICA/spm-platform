'use client';

/**
 * Saved Reports List Component
 *
 * Displays and manages saved analytics reports.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  MoreVertical,
  Play,
  Trash2,
  Copy,
  Calendar,
  Clock,
} from 'lucide-react';
import type { SavedReport } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';

interface SavedReportsListProps {
  reports: SavedReport[];
  onRun: (report: SavedReport) => void;
  onDelete: (reportId: string) => void;
  onDuplicate: (report: SavedReport) => void;
}

export function SavedReportsList({
  reports,
  onRun,
  onDelete,
  onDuplicate,
}: SavedReportsListProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, { en: string; es: string }> = {
      daily: { en: 'Daily', es: 'Diario' },
      weekly: { en: 'Weekly', es: 'Semanal' },
      monthly: { en: 'Monthly', es: 'Mensual' },
    };
    return isSpanish ? labels[frequency]?.es : labels[frequency]?.en;
  };

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {isSpanish
              ? 'No hay reportes guardados'
              : 'No saved reports'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isSpanish ? 'Reportes Guardados' : 'Saved Reports'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">
                    {isSpanish ? report.nameEs : report.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? report.descriptionEs : report.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(report.updatedAt)}
                    </span>
                    {report.schedule && (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {getFrequencyLabel(report.schedule.frequency)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {report.config.metrics.length}{' '}
                      {isSpanish ? 'métricas' : 'metrics'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => onRun(report)}>
                  <Play className="h-4 w-4 mr-1" />
                  {isSpanish ? 'Ejecutar' : 'Run'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onDuplicate(report)}>
                      <Copy className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Duplicar' : 'Duplicate'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(report.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Eliminar' : 'Delete'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
