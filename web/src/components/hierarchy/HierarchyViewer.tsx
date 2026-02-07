'use client';

/**
 * Hierarchy Viewer
 *
 * Interactive organization chart with multiple view modes.
 * Supports tree view, table view, and list view.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  Table2,
  ZoomIn,
  ZoomOut,
  Download,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HierarchyNodeCard, HierarchyNodeCompact } from './HierarchyNode';
import { ConfidenceRing } from '@/components/design-system/ConfidenceRing';
import { cn } from '@/lib/utils';
import { useLocale } from '@/contexts/locale-context';
import type {
  HierarchyTree,
  HierarchyNode,
  HierarchyViewMode,
  HierarchyColorMode,
  HierarchyViewOptions,
} from '@/types/hierarchy';

// ============================================
// TYPES
// ============================================

interface HierarchyViewerProps {
  tree: HierarchyTree;
  options?: Partial<HierarchyViewOptions>;
  onNodeSelect?: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onAssignManager?: (nodeId: string) => void;
  onExport?: () => void;
  onRefresh?: () => void;
  className?: string;
}

// ============================================
// DEFAULT OPTIONS
// ============================================

const DEFAULT_OPTIONS: HierarchyViewOptions = {
  mode: 'tree',
  colorMode: 'confidence',
  showConfidenceBadges: true,
  showMetrics: true,
  expandedLevels: 2,
  highlightLowConfidence: true,
  lowConfidenceThreshold: 70,
  showOrphans: true,
};

// ============================================
// COMPONENT
// ============================================

export function HierarchyViewer({
  tree,
  options: propOptions,
  onNodeSelect,
  onNodeEdit,
  onAssignManager,
  onExport,
  onRefresh,
  className,
}: HierarchyViewerProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [options, setOptions] = useState<HierarchyViewOptions>({
    ...DEFAULT_OPTIONS,
    ...propOptions,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);

  // Initialize expanded nodes based on options
  useMemo(() => {
    if (tree.rootNodeId && options.expandedLevels > 0) {
      const expanded = new Set<string>();
      const expandToLevel = (nodeId: string, currentLevel: number) => {
        if (currentLevel >= options.expandedLevels) return;
        const node = tree.nodes[nodeId];
        if (!node) return;
        expanded.add(nodeId);
        node.childrenIds.forEach((childId) => expandToLevel(childId, currentLevel + 1));
      };
      expandToLevel(tree.rootNodeId, 0);
      setExpandedNodeIds(expanded);
    }
  }, [tree.rootNodeId, options.expandedLevels, tree.nodes]);

  // Filter nodes by search
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return tree.nodes;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, HierarchyNode> = {};

    Object.entries(tree.nodes).forEach(([id, node]) => {
      if (
        node.name.toLowerCase().includes(query) ||
        node.title?.toLowerCase().includes(query) ||
        node.department?.toLowerCase().includes(query)
      ) {
        filtered[id] = node;
      }
    });

    return filtered;
  }, [tree.nodes, searchQuery]);

  // Toggle node expansion
  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Handle node selection
  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      onNodeSelect?.(nodeId);
    },
    [onNodeSelect]
  );

  // View mode buttons
  const viewModes: { mode: HierarchyViewMode; icon: React.ReactNode; label: string; labelEs: string }[] = [
    { mode: 'tree', icon: <LayoutGrid className="h-4 w-4" />, label: 'Tree', labelEs: 'Árbol' },
    { mode: 'list', icon: <List className="h-4 w-4" />, label: 'List', labelEs: 'Lista' },
    { mode: 'table', icon: <Table2 className="h-4 w-4" />, label: 'Table', labelEs: 'Tabla' },
  ];

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">
              {tree.name || (isSpanish ? 'Jerarquía Organizacional' : 'Organization Hierarchy')}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>{tree.stats.totalNodes} {isSpanish ? 'empleados' : 'employees'}</span>
              <span>•</span>
              <span>{tree.stats.totalLevels} {isSpanish ? 'niveles' : 'levels'}</span>
              {tree.stats.orphanCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-600">
                    {tree.stats.orphanCount} {isSpanish ? 'sin gerente' : 'orphans'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh */}
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            {/* Export */}
            {onExport && (
              <Button variant="ghost" size="sm" onClick={onExport}>
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mt-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={isSpanish ? 'Buscar empleado...' : 'Search employee...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border rounded-lg">
            {viewModes.map(({ mode, icon, label, labelEs }) => (
              <TooltipProvider key={mode}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-9 px-3 rounded-none first:rounded-l-lg last:rounded-r-lg',
                        options.mode === mode && 'bg-slate-100 dark:bg-slate-800'
                      )}
                      onClick={() => setOptions((prev) => ({ ...prev, mode }))}
                    >
                      {icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isSpanish ? labelEs : label}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {/* Color mode */}
          <Select
            value={options.colorMode}
            onValueChange={(value) =>
              setOptions((prev) => ({ ...prev, colorMode: value as HierarchyColorMode }))
            }
          >
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">{isSpanish ? 'Por Confianza' : 'By Confidence'}</SelectItem>
              <SelectItem value="department">{isSpanish ? 'Por Departamento' : 'By Department'}</SelectItem>
              <SelectItem value="location">{isSpanish ? 'Por Ubicación' : 'By Location'}</SelectItem>
              <SelectItem value="status">{isSpanish ? 'Por Estado' : 'By Status'}</SelectItem>
            </SelectContent>
          </Select>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-500 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex-1 overflow-auto p-4">
        {options.mode === 'tree' && (
          <TreeView
            tree={tree}
            filteredNodes={filteredNodes}
            expandedNodeIds={expandedNodeIds}
            selectedNodeId={selectedNodeId}
            options={options}
            zoom={zoom}
            onToggleExpand={toggleExpand}
            onNodeSelect={handleNodeSelect}
            onNodeEdit={onNodeEdit}
            onAssignManager={onAssignManager}
          />
        )}

        {options.mode === 'list' && (
          <ListView
            tree={tree}
            filteredNodes={filteredNodes}
            expandedNodeIds={expandedNodeIds}
            selectedNodeId={selectedNodeId}
            options={options}
            onToggleExpand={toggleExpand}
            onNodeSelect={handleNodeSelect}
          />
        )}

        {options.mode === 'table' && (
          <TableView
            nodes={filteredNodes}
            selectedNodeId={selectedNodeId}
            options={options}
            onNodeSelect={handleNodeSelect}
            isSpanish={isSpanish}
          />
        )}
      </CardContent>

      {/* Orphans panel */}
      {options.showOrphans && tree.orphanNodeIds.length > 0 && (
        <div className="border-t p-4 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {isSpanish ? 'Empleados sin Gerente' : 'Employees Without Manager'}
              <span className="ml-1 text-amber-600">({tree.orphanNodeIds.length})</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tree.orphanNodeIds.slice(0, 5).map((nodeId) => {
              const node = tree.nodes[nodeId];
              if (!node) return null;
              return (
                <HierarchyNodeCompact
                  key={nodeId}
                  node={node}
                  isSelected={selectedNodeId === nodeId}
                  onSelect={() => handleNodeSelect(nodeId)}
                />
              );
            })}
            {tree.orphanNodeIds.length > 5 && (
              <span className="text-sm text-amber-600 self-center">
                +{tree.orphanNodeIds.length - 5} {isSpanish ? 'más' : 'more'}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================
// TREE VIEW
// ============================================

function TreeView({
  tree,
  filteredNodes,
  expandedNodeIds,
  selectedNodeId,
  options,
  zoom,
  onToggleExpand,
  onNodeSelect,
  onNodeEdit,
  onAssignManager,
}: {
  tree: HierarchyTree;
  filteredNodes: Record<string, HierarchyNode>;
  expandedNodeIds: Set<string>;
  selectedNodeId: string | null;
  options: HierarchyViewOptions;
  zoom: number;
  onToggleExpand: (nodeId: string) => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onAssignManager?: (nodeId: string) => void;
}) {
  const renderNode = (nodeId: string, level: number = 0): React.ReactNode => {
    const node = filteredNodes[nodeId];
    if (!node) return null;

    const isExpanded = expandedNodeIds.has(nodeId);
    const hasVisibleChildren = node.childrenIds.some((id) => filteredNodes[id]);

    return (
      <div key={nodeId} className="flex flex-col items-center">
        <HierarchyNodeCard
          node={node}
          isExpanded={isExpanded}
          isSelected={selectedNodeId === nodeId}
          showConfidence={options.showConfidenceBadges}
          showMetrics={options.showMetrics}
          onToggleExpand={() => onToggleExpand(nodeId)}
          onSelect={() => onNodeSelect(nodeId)}
          onEdit={() => onNodeEdit?.(nodeId)}
          onAssignManager={() => onAssignManager?.(nodeId)}
        />

        {/* Children */}
        {isExpanded && hasVisibleChildren && (
          <div className="mt-4">
            {/* Connector line */}
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-auto" />

            {/* Horizontal connector */}
            {node.childrenIds.length > 1 && (
              <div
                className="h-px bg-slate-200 dark:bg-slate-700"
                style={{
                  width: `${Math.min(node.childrenIds.length * 280, 800)}px`,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              />
            )}

            {/* Child nodes */}
            <div className="flex gap-6 mt-4 justify-center">
              {node.childrenIds.map((childId) => renderNode(childId, level + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="min-w-max pb-8"
      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
    >
      {tree.rootNodeId && renderNode(tree.rootNodeId)}
    </div>
  );
}

// ============================================
// LIST VIEW
// ============================================

function ListView({
  tree,
  filteredNodes,
  expandedNodeIds,
  selectedNodeId,
  options,
  onToggleExpand,
  onNodeSelect,
}: {
  tree: HierarchyTree;
  filteredNodes: Record<string, HierarchyNode>;
  expandedNodeIds: Set<string>;
  selectedNodeId: string | null;
  options: HierarchyViewOptions;
  onToggleExpand: (nodeId: string) => void;
  onNodeSelect: (nodeId: string) => void;
}) {
  const renderListItem = (nodeId: string, depth: number = 0): React.ReactNode => {
    const node = filteredNodes[nodeId];
    if (!node) return null;

    const isExpanded = expandedNodeIds.has(nodeId);
    const hasChildren = node.childrenIds.length > 0;

    return (
      <div key={nodeId}>
        <div
          className={cn(
            'flex items-center gap-2 py-2 px-3 rounded cursor-pointer transition-colors',
            selectedNodeId === nodeId
              ? 'bg-sky-50 dark:bg-sky-900/20'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => onNodeSelect(nodeId)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(nodeId);
              }}
              className="p-0.5"
            >
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-slate-400 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </button>
          ) : (
            <div className="w-5" />
          )}

          <span className="font-medium text-slate-900 dark:text-slate-100">
            {node.name}
          </span>

          {node.title && (
            <span className="text-sm text-slate-500">— {node.title}</span>
          )}

          <div className="flex-1" />

          {options.showConfidenceBadges && (
            <ConfidenceRing score={node.connectionConfidence} size="sm" />
          )}
        </div>

        {isExpanded && (
          <div>
            {node.childrenIds.map((childId) => renderListItem(childId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {tree.rootNodeId && renderListItem(tree.rootNodeId)}
    </div>
  );
}

// ============================================
// TABLE VIEW
// ============================================

function TableView({
  nodes,
  selectedNodeId,
  options,
  onNodeSelect,
  isSpanish,
}: {
  nodes: Record<string, HierarchyNode>;
  selectedNodeId: string | null;
  options: HierarchyViewOptions;
  onNodeSelect: (nodeId: string) => void;
  isSpanish: boolean;
}) {
  const nodeList = Object.values(nodes).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Nombre' : 'Name'}
            </th>
            <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Título' : 'Title'}
            </th>
            <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Departamento' : 'Department'}
            </th>
            <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Nivel' : 'Level'}
            </th>
            <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Reportes' : 'Reports'}
            </th>
            {options.showConfidenceBadges && (
              <th className="pb-2 font-medium text-slate-600 dark:text-slate-400">
                {isSpanish ? 'Confianza' : 'Confidence'}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {nodeList.map((node) => (
            <tr
              key={node.id}
              className={cn(
                'border-b cursor-pointer transition-colors',
                selectedNodeId === node.id
                  ? 'bg-sky-50 dark:bg-sky-900/20'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
              onClick={() => onNodeSelect(node.id)}
            >
              <td className="py-2 font-medium">{node.name}</td>
              <td className="py-2 text-slate-600 dark:text-slate-400">{node.title || '-'}</td>
              <td className="py-2 text-slate-600 dark:text-slate-400">{node.department || '-'}</td>
              <td className="py-2 text-slate-600 dark:text-slate-400">{node.level}</td>
              <td className="py-2 text-slate-600 dark:text-slate-400">
                {node.metrics?.directReports || 0}
              </td>
              {options.showConfidenceBadges && (
                <td className="py-2">
                  <ConfidenceRing score={node.connectionConfidence} size="sm" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
