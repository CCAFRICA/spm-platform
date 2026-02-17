'use client';

/**
 * Hierarchy Node Component
 *
 * Individual node in the organization chart with confidence visualization.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  User,
  Users,
  AlertTriangle,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfidenceRing } from '@/components/design-system/ConfidenceRing';
import { cn } from '@/lib/utils';
import { useLocale } from '@/contexts/locale-context';
import type { HierarchyNode as HierarchyNodeType } from '@/types/hierarchy';

// ============================================
// TYPES
// ============================================

interface HierarchyNodeProps {
  node: HierarchyNodeType;
  isExpanded?: boolean;
  isSelected?: boolean;
  showConfidence?: boolean;
  showMetrics?: boolean;
  onToggleExpand?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onAssignManager?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_CONFIG = {
  active: {
    bg: 'bg-slate-800',
    border: 'border-slate-700',
    label: 'Active',
    labelEs: 'Activo',
  },
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Pending Review',
    labelEs: 'Pendiente',
  },
  flagged: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    label: 'Needs Attention',
    labelEs: 'Atención',
  },
  orphan: {
    bg: 'bg-slate-900',
    border: 'border-dashed border-slate-300 dark:border-slate-600',
    label: 'No Manager',
    labelEs: 'Sin Gerente',
  },
};

// ============================================
// COMPONENT
// ============================================

export function HierarchyNodeCard({
  node,
  isExpanded = false,
  isSelected = false,
  showConfidence = true,
  showMetrics = true,
  onToggleExpand,
  onSelect,
  onEdit,
  onAssignManager,
  onViewDetails,
  className,
}: HierarchyNodeProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const statusConfig = STATUS_CONFIG[node.status];
  const hasChildren = node.childrenIds.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative w-64 rounded-lg border shadow-sm transition-all',
        statusConfig.bg,
        statusConfig.border,
        isSelected && 'ring-2 ring-sky-500 ring-offset-2',
        className
      )}
    >
      {/* Confidence indicator line */}
      {showConfidence && node.connectionConfidence < 100 && (
        <div
          className="absolute -top-1 left-4 right-4 h-1 rounded-full"
          style={{
            background: `linear-gradient(to right,
              hsl(${Math.min(node.connectionConfidence, 100) * 1.2}, 70%, 50%) ${node.connectionConfidence}%,
              transparent ${node.connectionConfidence}%)`,
          }}
        />
      )}

      {/* Main content */}
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          {/* Expand/collapse button */}
          {hasChildren && (
            <button
              onClick={onToggleExpand}
              className="mt-0.5 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>
          )}

          {/* Avatar */}
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
              node.avatar ? '' : 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600'
            )}
            onClick={onSelect}
          >
            {node.avatar ? (
              <img
                src={node.avatar}
                alt={node.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-slate-500" />
            )}
          </div>

          {/* Name and title */}
          <div className="flex-1 min-w-0" onClick={onSelect}>
            <h4 className="font-medium text-sm text-slate-100 truncate">
              {node.name}
            </h4>
            {node.title && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {node.title}
              </p>
            )}
          </div>

          {/* Confidence ring */}
          {showConfidence && (
            <ConfidenceRing score={node.connectionConfidence} size="sm" />
          )}

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onViewDetails}>
                {isSpanish ? 'Ver Detalles' : 'View Details'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                {isSpanish ? 'Editar' : 'Edit'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAssignManager}>
                {isSpanish ? 'Cambiar Gerente' : 'Change Manager'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status badge */}
        {node.status !== 'active' && (
          <div className="mt-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {isSpanish ? statusConfig.labelEs : statusConfig.label}
            </span>
          </div>
        )}

        {/* Metrics */}
        {showMetrics && node.metrics && (
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {node.metrics.directReports}
                {node.metrics.totalReports > node.metrics.directReports && (
                  <span className="text-slate-400">
                    {' '}({node.metrics.totalReports})
                  </span>
                )}
              </span>
            </div>
            {node.metrics.pendingActions > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {node.metrics.pendingActions}
              </span>
            )}
          </div>
        )}

        {/* Department/Location */}
        {(node.department || node.location) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            {node.department && <span>{node.department}</span>}
            {node.department && node.location && <span>•</span>}
            {node.location && <span>{node.location}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Compact node for dense views
 */
export function HierarchyNodeCompact({
  node,
  isSelected,
  showConfidence = true,
  onSelect,
  className,
}: Pick<HierarchyNodeProps, 'node' | 'isSelected' | 'showConfidence' | 'onSelect' | 'className'>) {
  const statusConfig = STATUS_CONFIG[node.status];

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
        statusConfig.bg,
        isSelected
          ? 'ring-1 ring-sky-500'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800',
        className
      )}
    >
      <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
        <User className="h-3 w-3 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate block">
          {node.name}
        </span>
      </div>
      {showConfidence && (
        <ConfidenceRing score={node.connectionConfidence} size="sm" />
      )}
    </div>
  );
}
