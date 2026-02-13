'use client';

/**
 * Pipeline Health Component
 *
 * 5-layer vertical pipeline visualization.
 * All labels come from the data — zero hardcoded component names.
 */

import { useCurrency } from '@/contexts/tenant-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  BarChart3,
  Layers,
  Users,
  Target,
} from 'lucide-react';
import type { PipelineHealthResult, PipelineLayer } from '@/lib/forensics/types';

interface PipelineHealthProps {
  health: PipelineHealthResult;
}

const LAYER_CONFIG = [
  { key: 'interpretation', label: 'Interpretation', icon: FileText, description: 'Plan structure and monotonicity' },
  { key: 'metric', label: 'Metric', icon: BarChart3, description: 'Data sheets and period detection' },
  { key: 'component', label: 'Component', icon: Layers, description: 'Calculation component matching' },
  { key: 'population', label: 'Population', icon: Users, description: 'Employee deduplication and coverage' },
  { key: 'outcome', label: 'Outcome', icon: Target, description: 'VL vs Ground Truth totals' },
] as const;

function StatusIcon({ status }: { status: PipelineLayer['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'fail':
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

function statusBg(status: PipelineLayer['status']): string {
  switch (status) {
    case 'pass': return 'bg-green-50 border-green-200';
    case 'warning': return 'bg-amber-50 border-amber-200';
    case 'fail': return 'bg-red-50 border-red-200';
  }
}

export function PipelineHealth({ health }: PipelineHealthProps) {
  const { format: fmt } = useCurrency();
  const overallColor = health.overallStatus === 'healthy'
    ? 'text-green-600' : health.overallStatus === 'warnings'
    ? 'text-amber-600' : 'text-red-600';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Pipeline Health
          </CardTitle>
          <Badge
            variant={health.overallStatus === 'healthy' ? 'default' : health.overallStatus === 'warnings' ? 'outline' : 'destructive'}
          >
            <span className={overallColor}>
              {health.overallStatus === 'healthy' ? 'Healthy' :
               health.overallStatus === 'warnings' ? 'Warnings' : 'Critical'}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {LAYER_CONFIG.map((layer, idx) => {
            const data = health.layers[layer.key as keyof typeof health.layers];
            const Icon = layer.icon;

            return (
              <div key={layer.key}>
                <div className={`border rounded-lg p-4 ${statusBg(data.status)}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-40">
                      <Icon className="h-4 w-4 text-slate-600" />
                      <span className="text-sm font-medium">{layer.label}</span>
                    </div>
                    <div className="flex-1 text-sm text-slate-600">{layer.description}</div>
                    <StatusIcon status={data.status} />
                    {data.flagCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {data.flagCount} {data.flagCount === 1 ? 'flag' : 'flags'}
                      </Badge>
                    )}
                  </div>
                  {data.flags.length > 0 && (
                    <div className="mt-2 ml-10 space-y-1">
                      {data.flags.map((flag, fi) => (
                        <p key={fi} className="text-xs text-slate-600">{flag}</p>
                      ))}
                    </div>
                  )}
                  {/* Layer-specific details */}
                  {layer.key === 'metric' && 'totalSheets' in data && (
                    <div className="mt-2 ml-10 text-xs text-slate-500">
                      {(data as PipelineHealthResult['layers']['metric']).sheetsWithPeriod}/
                      {(data as PipelineHealthResult['layers']['metric']).totalSheets} sheets with period detection
                    </div>
                  )}
                  {layer.key === 'population' && 'employees' in data && (
                    <div className="mt-2 ml-10 text-xs text-slate-500">
                      {(data as PipelineHealthResult['layers']['population']).employees} employees ·
                      {(data as PipelineHealthResult['layers']['population']).duplicates} duplicates ·
                      {(data as PipelineHealthResult['layers']['population']).periods} periods
                    </div>
                  )}
                  {layer.key === 'outcome' && 'vlTotal' in data && (
                    <div className="mt-2 ml-10 text-xs text-slate-500">
                      VL Total: {fmt((data as PipelineHealthResult['layers']['outcome']).vlTotal)}
                      {(data as PipelineHealthResult['layers']['outcome']).gtTotal !== undefined && (
                        <> · GT Total: {fmt((data as PipelineHealthResult['layers']['outcome']).gtTotal!)}</>
                      )}
                    </div>
                  )}
                </div>
                {idx < LAYER_CONFIG.length - 1 && (
                  <div className="flex justify-center">
                    <div className="w-px h-3 bg-slate-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
