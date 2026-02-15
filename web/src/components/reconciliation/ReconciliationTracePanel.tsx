'use client';

import { useState } from 'react';
import { generateEmployeeTrace, type EmployeeReconciliationTrace, type ComponentTrace } from '@/lib/reconciliation/employee-reconciliation-trace';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';

interface ReconciliationTracePanelProps {
  tenantId: string;
  entityId: string;
  entityName: string;
  engineTotal: number;
  formatCurrency: (value: number) => string;
}

export function ReconciliationTracePanel({
  tenantId,
  entityId,
  entityName,
  engineTotal,
  formatCurrency,
}: ReconciliationTracePanelProps) {
  const [trace, setTrace] = useState<EmployeeReconciliationTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());

  const loadTrace = () => {
    setLoading(true);
    setError(null);
    try {
      const result = generateEmployeeTrace(tenantId, entityId);
      setTrace(result);
      // Auto-expand all components
      if (result) {
        setExpandedComponents(new Set(result.components.map(c => c.componentId)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleComponent = (componentId: string) => {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(componentId)) {
        next.delete(componentId);
      } else {
        next.add(componentId);
      }
      return next;
    });
  };

  if (!trace && !loading) {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={loadTrace}
          className="flex items-center gap-2"
        >
          <Database className="h-4 w-4" />
          Load Reconciliation Trace
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading trace for {entityName}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border-t">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Trace Error</span>
        </div>
        <p className="text-sm text-red-500 mt-1">{error}</p>
        <Button variant="outline" size="sm" onClick={loadTrace} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!trace) return null;

  const traceTotal = trace.finalCalculation.totalIncentive;
  const delta = traceTotal - engineTotal;
  const isMatch = Math.abs(delta) < 0.01;

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">Reconciliation Trace</span>
          <Badge variant="outline" className="text-xs">
            {trace.isCertified ? 'Certified' : 'Non-Certified'}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Trace Total:</span>{' '}
            <span className="font-mono font-medium">{formatCurrency(traceTotal)}</span>
          </div>
          <div className={cn(
            'flex items-center gap-1 text-sm font-medium',
            isMatch ? 'text-emerald-600' : 'text-amber-600'
          )}>
            {isMatch ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Matches Engine
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                Delta: {formatCurrency(delta)}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Variant Selection */}
      <div className="text-xs text-muted-foreground">
        <span>Plan: {trace.planResolution.ruleSetName}</span>
        <span className="mx-2">|</span>
        <span>Variant: {trace.variantSelection.selectedVariantName}</span>
        <span className="mx-2">|</span>
        <span>Reason: {trace.variantSelection.selectionReason}</span>
      </div>

      {/* Component Cards */}
      <div className="space-y-2">
        {trace.components.map((comp) => (
          <ComponentTraceCard
            key={comp.componentId}
            component={comp}
            expanded={expandedComponents.has(comp.componentId)}
            onToggle={() => toggleComponent(comp.componentId)}
            formatCurrency={formatCurrency}
          />
        ))}
      </div>

      {/* Warnings */}
      {trace.validation.warnings.length > 0 && (
        <div className="space-y-1">
          {trace.validation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

interface ComponentTraceCardProps {
  component: ComponentTrace;
  expanded: boolean;
  onToggle: () => void;
  formatCurrency: (value: number) => string;
}

function ComponentTraceCard({ component, expanded, onToggle, formatCurrency }: ComponentTraceCardProps) {
  const hasWarnings = component.warnings && component.warnings.length > 0;

  return (
    <div className={cn(
      'border rounded-lg bg-white dark:bg-slate-800',
      hasWarnings && 'border-amber-300'
    )}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="text-left">
            <div className="font-medium text-sm">{component.componentName}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {component.componentType}
              </Badge>
              {component.matchedSheet ? (
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {component.matchedSheet}
                </span>
              ) : (
                <span className="text-red-500">No sheet matched</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={cn(
            'font-mono font-semibold',
            component.outputValue > 0 ? 'text-emerald-600' : 'text-slate-500'
          )}>
            {formatCurrency(component.outputValue)}
          </div>
          {hasWarnings && (
            <AlertTriangle className="h-3 w-3 text-amber-500 ml-auto" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t">
          {/* Formula */}
          <div className="pt-3">
            <div className="text-xs text-muted-foreground mb-1">Calculation</div>
            <div className="font-mono text-sm bg-slate-100 dark:bg-slate-900 p-2 rounded">
              {component.calculationFormula || 'No formula generated'}
            </div>
          </div>

          {/* Lookup Details */}
          {component.lookupDetails && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Lookup Details</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(component.lookupDetails).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-slate-50 dark:bg-slate-900 p-2 rounded">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="font-mono">
                      {typeof value === 'number' ? value.toLocaleString() : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Metrics */}
          {Object.keys(component.extractedMetrics).length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Extracted Metrics</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(component.extractedMetrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-slate-50 dark:bg-slate-900 p-2 rounded">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="font-mono">{value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Sheet Data Preview */}
          {component.rawSheetData && Object.keys(component.rawSheetData).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Raw sheet data ({Object.keys(component.rawSheetData).length} fields)
              </summary>
              <pre className="mt-1 p-2 bg-slate-100 dark:bg-slate-900 rounded overflow-auto max-h-32 text-xs">
                {JSON.stringify(component.rawSheetData, null, 2)}
              </pre>
            </details>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-1">
              {component.warnings!.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
