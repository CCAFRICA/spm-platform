'use client';

/**
 * Employee Trace Viewer
 *
 * Shows the full forensic trace for a single employee.
 * All component labels come from the trace data (plan-derived).
 * Passes Korean Test — zero hardcoded component/metric names.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  User,
  Building2,
  GitBranch,
  Calculator,
  AlertTriangle,
  FileText,
  ArrowRight,
} from 'lucide-react';
import type { CalculationTrace, ComponentTrace, MetricTrace } from '@/lib/forensics/types';

interface EmployeeTraceProps {
  trace: CalculationTrace;
}

export function EmployeeTrace({ trace }: EmployeeTraceProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{trace.employeeName}</h2>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="font-mono">{trace.employeeId}</span>
                  <span>{trace.employeeRole}</span>
                  {trace.storeId && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {trace.storeId}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">${trace.totalIncentive.toLocaleString()}</p>
              <p className="text-sm text-slate-500">{trace.currency}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variant Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            Variant Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="outline">{trace.variant.variantId}</Badge>
            <span className="font-medium">{trace.variant.variantName}</span>
          </div>
          <p className="text-sm text-slate-500 mt-2">{trace.variant.selectionReasoning}</p>
          {Object.keys(trace.variant.eligibilityFields).length > 0 && (
            <div className="mt-3 bg-slate-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-slate-600 mb-1">Eligibility Fields</p>
              <pre className="text-xs text-slate-500">
                {JSON.stringify(trace.variant.eligibilityFields, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Components — Dynamic from plan */}
      {trace.components.map((comp, idx) => (
        <ComponentCard key={comp.componentId} component={comp} index={idx} />
      ))}

      {/* Flags */}
      {trace.flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Diagnostic Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trace.flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {flag}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trace Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Trace Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Trace ID:</span>
              <span className="ml-2 font-mono">{trace.traceId}</span>
            </div>
            <div>
              <span className="text-slate-500">Run ID:</span>
              <span className="ml-2 font-mono">{trace.calculationRunId}</span>
            </div>
            <div>
              <span className="text-slate-500">Timestamp:</span>
              <span className="ml-2">{new Date(trace.timestamp).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500">Tenant:</span>
              <span className="ml-2 font-mono">{trace.tenantId}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComponentCard({ component, index }: { component: ComponentTrace; index: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            <span className="text-slate-400 text-sm">#{index + 1}</span>
            {component.componentName}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{component.calculationType}</Badge>
            <Badge variant="outline">{component.measurementLevel}</Badge>
            <span className="text-lg font-bold">${component.outputValue.toLocaleString()}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Calculation Sentence */}
        <div className="bg-slate-50 p-3 rounded-lg flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
          <p className="text-sm font-mono">{component.calculationSentence}</p>
        </div>

        {/* Metrics */}
        {component.metrics.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Metrics</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {component.metrics.map((metric: MetricTrace, mi: number) => (
                  <TableRow key={mi}>
                    <TableCell className="font-medium">{metric.metricName}</TableCell>
                    <TableCell className="font-mono">{metric.resolvedValue.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{metric.resolutionPath}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {metric.sourceSheet && <span>{metric.sourceSheet}</span>}
                      {metric.sourceField && <span> → {metric.sourceField}</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs ${metric.confidence >= 0.8 ? 'text-green-600' : 'text-amber-600'}`}>
                        {(metric.confidence * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Lookup Details */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Lookup</p>
          <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1">
            <div><span className="text-slate-500">Type:</span> {component.lookup.type}</div>
            {component.lookup.tierLabel && (
              <div><span className="text-slate-500">Tier:</span> {component.lookup.tierLabel}</div>
            )}
            {component.lookup.rowLabel && (
              <div><span className="text-slate-500">Row:</span> {component.lookup.rowLabel}</div>
            )}
            {component.lookup.columnLabel && (
              <div><span className="text-slate-500">Column:</span> {component.lookup.columnLabel}</div>
            )}
            {component.lookup.rate !== undefined && (
              <div><span className="text-slate-500">Rate:</span> {(component.lookup.rate * 100).toFixed(1)}%</div>
            )}
            {component.lookup.baseAmount !== undefined && (
              <div><span className="text-slate-500">Base:</span> ${component.lookup.baseAmount.toLocaleString()}</div>
            )}
          </div>
        </div>

        {/* Data Provenance */}
        {component.dataProvenance.sourceSheet && (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Data Provenance</p>
            <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
              <div>Source: {component.dataProvenance.sourceSheet}</div>
              <div>Topology: {component.dataProvenance.topology}</div>
              {component.dataProvenance.storeId && (
                <div>Store: {component.dataProvenance.storeId}</div>
              )}
            </div>
          </div>
        )}

        {/* Component Flags */}
        {component.flags.length > 0 && (
          <div className="space-y-1">
            {component.flags.map((flag, fi) => (
              <div key={fi} className={`text-xs p-2 rounded flex items-center gap-1 ${
                flag.severity === 'error' ? 'bg-red-50 text-red-700' :
                flag.severity === 'warning' ? 'bg-amber-50 text-amber-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {flag.message}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
