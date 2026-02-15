'use client';

/**
 * Plan Validation Component
 *
 * Validates plan structure: monotonicity, gaps, completeness.
 * All component names come from the plan — zero hardcoded.
 */

import { useMemo } from 'react';
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
  CheckCircle,
  AlertTriangle,
  XCircle,
  Layers,
  TrendingUp,
  Grid3X3,
} from 'lucide-react';
import type {
  RuleSetConfig,
  AdditiveLookupConfig,
  PlanComponent,
  PlanVariant,
} from '@/types/compensation-plan';

interface PlanValidationProps {
  plan: RuleSetConfig;
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  componentName: string;
  variantName: string;
  message: string;
}

export function PlanValidation({ plan }: PlanValidationProps) {
  const issues = useMemo(() => validatePlan(plan), [plan]);
  const config = plan.configuration as AdditiveLookupConfig;
  const variants = config.variants || [];

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plan Validation — {plan.name}</CardTitle>
            <div className="flex gap-2">
              {errorCount > 0 ? (
                <Badge variant="destructive">{errorCount} Errors</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700">No Errors</Badge>
              )}
              {warningCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700">{warningCount} Warnings</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Plan Type:</span>
              <span className="ml-2 font-medium">{plan.ruleSetType}</span>
            </div>
            <div>
              <span className="text-slate-500">Variants:</span>
              <span className="ml-2 font-medium">{variants.length}</span>
            </div>
            <div>
              <span className="text-slate-500">Status:</span>
              <Badge variant="outline" className="ml-2">{plan.status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variant Structure */}
      {variants.map(variant => (
        <VariantCard key={variant.variantId} variant={variant} issues={issues} />
      ))}

      {/* Issues Table */}
      {issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Severity</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {issue.severity === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                      {issue.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      {issue.severity === 'info' && <CheckCircle className="h-4 w-4 text-blue-500" />}
                    </TableCell>
                    <TableCell className="text-sm">{issue.variantName}</TableCell>
                    <TableCell className="text-sm font-medium">{issue.componentName}</TableCell>
                    <TableCell className="text-sm">{issue.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VariantCard({ variant, issues }: { variant: PlanVariant; issues: ValidationIssue[] }) {
  const variantIssues = issues.filter(i => i.variantName === variant.variantName);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {variant.variantName}
          </CardTitle>
          <Badge variant="outline">{variant.components.length} components</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {variant.components.map(comp => {
            const compIssues = variantIssues.filter(i => i.componentName === comp.name);
            const hasError = compIssues.some(i => i.severity === 'error');
            const hasWarning = compIssues.some(i => i.severity === 'warning');

            return (
              <div
                key={comp.id}
                className={`border rounded-lg p-3 ${
                  hasError ? 'border-red-200 bg-red-50' :
                  hasWarning ? 'border-amber-200 bg-amber-50' :
                  'border-green-200 bg-green-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {comp.componentType === 'matrix_lookup' ? (
                      <Grid3X3 className="h-4 w-4 text-slate-500" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="font-medium text-sm">{comp.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{comp.componentType}</Badge>
                    <Badge variant="outline" className="text-xs">{comp.measurementLevel}</Badge>
                    {hasError ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : hasWarning ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                </div>
                {compIssues.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {compIssues.map((issue, i) => (
                      <p key={i} className="text-xs text-slate-600">{issue.message}</p>
                    ))}
                  </div>
                )}
                <ComponentStructure component={comp} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ComponentStructure({ component }: { component: PlanComponent }) {
  if (component.componentType === 'tier_lookup' && component.tierConfig) {
    const tiers = component.tierConfig.tiers;
    return (
      <div className="mt-2 text-xs">
        <p className="text-slate-500">{tiers.length} tiers: {
          tiers.map(t => t.label).join(' → ')
        }</p>
      </div>
    );
  }

  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    const { rowBands, columnBands } = component.matrixConfig;
    return (
      <div className="mt-2 text-xs text-slate-500">
        {rowBands.length} rows × {columnBands.length} columns
      </div>
    );
  }

  if (component.componentType === 'percentage' && component.percentageConfig) {
    return (
      <div className="mt-2 text-xs text-slate-500">
        Rate: {(component.percentageConfig.rate * 100).toFixed(1)}%
      </div>
    );
  }

  if (component.componentType === 'conditional_percentage' && component.conditionalConfig) {
    return (
      <div className="mt-2 text-xs text-slate-500">
        {component.conditionalConfig.conditions.length} conditions
      </div>
    );
  }

  return null;
}

/**
 * Validate plan structure and return issues.
 * All component names come from the plan data.
 */
function validatePlan(plan: RuleSetConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const config = plan.configuration;

  if (config.type !== 'additive_lookup') return issues;

  const variants = config.variants || [];

  if (variants.length === 0) {
    issues.push({
      severity: 'error',
      componentName: '(plan)',
      variantName: '(plan)',
      message: 'Plan has no variants defined',
    });
    return issues;
  }

  for (const variant of variants) {
    if (variant.components.length === 0) {
      issues.push({
        severity: 'error',
        componentName: '(variant)',
        variantName: variant.variantName,
        message: 'Variant has no components',
      });
      continue;
    }

    for (const comp of variant.components) {
      // Tier monotonicity
      if (comp.componentType === 'tier_lookup' && comp.tierConfig) {
        const tiers = comp.tierConfig.tiers;
        for (let i = 1; i < tiers.length; i++) {
          if (tiers[i].min < tiers[i - 1].min) {
            issues.push({
              severity: 'error',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Tier boundaries not monotonic: "${tiers[i - 1].label}" (${tiers[i - 1].min}) followed by "${tiers[i].label}" (${tiers[i].min})`,
            });
          }
          // Gap detection
          if (tiers[i].min > tiers[i - 1].max + 0.01) {
            issues.push({
              severity: 'warning',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Gap between tiers: ${tiers[i - 1].max} to ${tiers[i].min}`,
            });
          }
        }
      }

      // Matrix monotonicity and dimension check
      if (comp.componentType === 'matrix_lookup' && comp.matrixConfig) {
        const { rowBands, columnBands, values } = comp.matrixConfig;

        for (let i = 1; i < rowBands.length; i++) {
          if (rowBands[i].min < rowBands[i - 1].min) {
            issues.push({
              severity: 'error',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Row bands not monotonic at index ${i}`,
            });
          }
        }

        for (let i = 1; i < columnBands.length; i++) {
          if (columnBands[i].min < columnBands[i - 1].min) {
            issues.push({
              severity: 'error',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Column bands not monotonic at index ${i}`,
            });
          }
        }

        // Dimension mismatch
        if (values.length !== rowBands.length) {
          issues.push({
            severity: 'error',
            componentName: comp.name,
            variantName: variant.variantName,
            message: `Matrix rows (${values.length}) doesn't match row bands (${rowBands.length})`,
          });
        }
        for (let r = 0; r < values.length; r++) {
          if (values[r].length !== columnBands.length) {
            issues.push({
              severity: 'error',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Matrix row ${r} columns (${values[r].length}) doesn't match column bands (${columnBands.length})`,
            });
          }
        }
      }

      // Conditional: check for overlapping conditions
      if (comp.componentType === 'conditional_percentage' && comp.conditionalConfig) {
        const conditions = comp.conditionalConfig.conditions;
        for (let i = 1; i < conditions.length; i++) {
          if (conditions[i].min < conditions[i - 1].min) {
            issues.push({
              severity: 'warning',
              componentName: comp.name,
              variantName: variant.variantName,
              message: `Conditions not in ascending order at index ${i}`,
            });
          }
        }
      }
    }
  }

  return issues;
}
