'use client';

/**
 * Hierarchy Review Panel
 *
 * Displays detected hierarchy relationships for review and resolution.
 * Shows confidence scores, conflicts, and allows manual corrections.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  User,
  Users,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfidenceRing } from '@/components/design-system/ConfidenceRing';
import { cn } from '@/lib/utils';
import { useLocale } from '@/contexts/locale-context';
import type {
  HierarchyDetectionResult,
  HierarchyConflict,
  RelationshipInversion,
  HierarchySignal,
} from '@/types/user-import';

// ============================================
// TYPES
// ============================================

interface HierarchyReviewPanelProps {
  results: HierarchyDetectionResult[];
  inversions: RelationshipInversion[];
  employeeNames: Record<string, { firstName: string; lastName: string }>;
  onResolveConflict: (employeeId: string, managerId: string) => void;
  onResolveInversion: (inversion: RelationshipInversion, correctManagerId: string) => void;
  className?: string;
}

// ============================================
// SIGNAL DESCRIPTIONS
// ============================================

const SIGNAL_INFO: Record<HierarchySignal, { label: string; labelEs: string; description: string; descriptionEs: string }> = {
  explicit_manager_id: {
    label: 'Direct Reference',
    labelEs: 'Referencia Directa',
    description: 'Source data explicitly identifies the manager',
    descriptionEs: 'Los datos fuente identifican explícitamente al gerente',
  },
  title_pattern: {
    label: 'Job Title',
    labelEs: 'Título del Puesto',
    description: 'Job title suggests organizational level',
    descriptionEs: 'El título del puesto sugiere el nivel organizacional',
  },
  department_structure: {
    label: 'Department',
    labelEs: 'Departamento',
    description: 'Department naming indicates hierarchy',
    descriptionEs: 'La estructura del departamento indica jerarquía',
  },
  email_domain_pattern: {
    label: 'Email Pattern',
    labelEs: 'Patrón de Correo',
    description: 'Email structure suggests reporting',
    descriptionEs: 'La estructura del correo sugiere relación de reporte',
  },
  location_rollup: {
    label: 'Location',
    labelEs: 'Ubicación',
    description: 'Location hierarchy suggests reporting',
    descriptionEs: 'La jerarquía de ubicación sugiere relación de reporte',
  },
  transaction_approval: {
    label: 'Approvals',
    labelEs: 'Aprobaciones',
    description: 'Approval patterns reveal hierarchy',
    descriptionEs: 'Los patrones de aprobación revelan jerarquía',
  },
  compensation_tier: {
    label: 'Compensation',
    labelEs: 'Compensación',
    description: 'Pay level indicates seniority',
    descriptionEs: 'El nivel de pago indica antigüedad',
  },
};

// ============================================
// COMPONENT
// ============================================

export function HierarchyReviewPanel({
  results,
  inversions,
  employeeNames,
  onResolveConflict,
  onResolveInversion,
  className,
}: HierarchyReviewPanelProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Group results by review status
  const needsReview = results.filter((r) => r.requiresManualReview);
  const autoResolved = results.filter((r) => !r.requiresManualReview && r.inferredManager);
  // Note: employees without detected hierarchy are included in autoResolved count for now

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getEmployeeName = (id: string): string => {
    const emp = employeeNames[id];
    if (!emp) return isSpanish ? 'Desconocido' : 'Unknown';
    return `${emp.firstName} ${emp.lastName}`;
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label={isSpanish ? 'Total Empleados' : 'Total Employees'}
          value={results.length}
          icon={<Users className="h-5 w-5" />}
        />
        <SummaryCard
          label={isSpanish ? 'Auto-detectados' : 'Auto-detected'}
          value={autoResolved.length}
          icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
          variant="success"
        />
        <SummaryCard
          label={isSpanish ? 'Requiere Revisión' : 'Needs Review'}
          value={needsReview.length}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          variant="warning"
        />
        <SummaryCard
          label={isSpanish ? 'Inversiones' : 'Inversions'}
          value={inversions.length}
          icon={<RefreshCw className="h-5 w-5 text-red-500" />}
          variant={inversions.length > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Inversions (highest priority) */}
      {inversions.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
              <RefreshCw className="h-5 w-5" />
              {isSpanish ? 'Inversiones de Relación Detectadas' : 'Relationship Inversions Detected'}
            </CardTitle>
            <p className="text-sm text-slate-500">
              {isSpanish
                ? 'Diferentes fuentes tienen información contradictoria sobre quién reporta a quién.'
                : 'Different sources have conflicting information about who reports to whom.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {inversions.map((inv, idx) => (
              <InversionCard
                key={idx}
                inversion={inv}
                getEmployeeName={getEmployeeName}
                onResolve={onResolveInversion}
                isSpanish={isSpanish}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Needs Review */}
      {needsReview.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {isSpanish ? 'Requiere Revisión Manual' : 'Requires Manual Review'}
            </CardTitle>
            <p className="text-sm text-slate-500">
              {isSpanish
                ? 'Estos empleados tienen baja confianza en la detección de jerarquía o conflictos.'
                : 'These employees have low hierarchy detection confidence or conflicts.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsReview.map((result) => (
              <ReviewItem
                key={result.employeeId}
                result={result}
                expanded={expandedItems.has(result.employeeId)}
                onToggle={() => toggleExpand(result.employeeId)}
                getEmployeeName={getEmployeeName}
                onResolve={(managerId) => onResolveConflict(result.employeeId, managerId)}
                isSpanish={isSpanish}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Auto-resolved (collapsed by default) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            {isSpanish ? 'Auto-detectados' : 'Auto-detected'}
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({autoResolved.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {autoResolved.map((result) => (
              <div
                key={result.employeeId}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-sm">{getEmployeeName(result.employeeId)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3 w-3 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {result.inferredManager
                      ? getEmployeeName(result.inferredManager.employeeId)
                      : '-'}
                  </span>
                  <ConfidenceRing score={result.overallConfidence} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function SummaryCard({
  label,
  value,
  icon,
  variant = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const variantStyles = {
    default: 'bg-slate-50 dark:bg-slate-800/50',
    success: 'bg-emerald-50 dark:bg-emerald-900/20',
    warning: 'bg-amber-50 dark:bg-amber-900/20',
    error: 'bg-red-50 dark:bg-red-900/20',
  };

  return (
    <div className={cn('p-4 rounded-lg', variantStyles[variant])}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function InversionCard({
  inversion,
  getEmployeeName,
  onResolve,
  isSpanish,
}: {
  inversion: RelationshipInversion;
  getEmployeeName: (id: string) => string;
  onResolve: (inversion: RelationshipInversion, managerId: string) => void;
  isSpanish: boolean;
}) {
  const nameA = getEmployeeName(inversion.employeeA);
  const nameB = getEmployeeName(inversion.employeeB);

  return (
    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <div className="flex items-start gap-4">
        <RefreshCw className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {isSpanish
              ? `${inversion.sourceA} dice que ${nameA} reporta a ${nameB}, pero ${inversion.sourceB} dice lo opuesto.`
              : `${inversion.sourceA} says ${nameA} reports to ${nameB}, but ${inversion.sourceB} says the opposite.`}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(inversion, inversion.employeeB)}
            >
              {nameA} → {nameB}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(inversion, inversion.employeeA)}
            >
              {nameB} → {nameA}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewItem({
  result,
  expanded,
  onToggle,
  getEmployeeName,
  onResolve,
  isSpanish,
}: {
  result: HierarchyDetectionResult;
  expanded: boolean;
  onToggle: () => void;
  getEmployeeName: (id: string) => string;
  onResolve: (managerId: string) => void;
  isSpanish: boolean;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <User className="h-4 w-4 text-slate-500" />
          <span className="font-medium">{getEmployeeName(result.employeeId)}</span>
        </div>
        <div className="flex items-center gap-3">
          {result.conflicts.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
              {result.conflicts.length} {isSpanish ? 'conflicto(s)' : 'conflict(s)'}
            </span>
          )}
          <ConfidenceRing score={result.overallConfidence} size="sm" />
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 pt-0 space-y-4 border-t border-slate-200 dark:border-slate-700">
              {/* Detected Signals */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {isSpanish ? 'Señales Detectadas' : 'Detected Signals'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.detectedSignals.map((signal, idx) => (
                    <TooltipProvider key={idx}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                            <span>
                              {isSpanish
                                ? SIGNAL_INFO[signal.signal].labelEs
                                : SIGNAL_INFO[signal.signal].label}
                            </span>
                            <span className="text-slate-500">
                              ({Math.round(signal.confidence * 100)}%)
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {isSpanish
                              ? SIGNAL_INFO[signal.signal].descriptionEs
                              : SIGNAL_INFO[signal.signal].description}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {isSpanish ? 'Valor observado' : 'Observed value'}: {signal.observedValue}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>

              {/* Inferred Manager */}
              {result.inferredManager && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {isSpanish ? 'Gerente Inferido' : 'Inferred Manager'}
                  </h4>
                  <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                    <GitBranch className="h-4 w-4 text-slate-400" />
                    <span>{getEmployeeName(result.inferredManager.employeeId)}</span>
                    <ConfidenceRing score={result.inferredManager.confidence} size="sm" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => onResolve(result.inferredManager!.employeeId)}
                    >
                      {isSpanish ? 'Confirmar' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Conflicts */}
              {result.conflicts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                    {isSpanish ? 'Conflictos' : 'Conflicts'}
                  </h4>
                  <div className="space-y-2">
                    {result.conflicts.map((conflict, idx) => (
                      <ConflictItem key={idx} conflict={conflict} isSpanish={isSpanish} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConflictItem({
  conflict,
  isSpanish,
}: {
  conflict: HierarchyConflict;
  isSpanish: boolean;
}) {
  const severityStyles = {
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className={cn('p-3 rounded-lg text-sm', severityStyles[conflict.severity])}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{conflict.description}</p>
          {conflict.suggestedResolution && (
            <p className="text-xs mt-1 opacity-75">
              {isSpanish ? 'Sugerencia' : 'Suggestion'}: {conflict.suggestedResolution}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
