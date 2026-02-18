'use client';

/**
 * OrganizationalCanvas — Main canvas container with React Flow
 *
 * Renders the entity relationship graph with:
 * - Four zoom levels (landscape, unit, team, entity card)
 * - Pan/zoom navigation
 * - Entity selection -> detail panel
 * - Search via toolbar
 * - Layout mode toggle (hierarchical / force-directed)
 */

import { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useOnViewportChange,
  useReactFlow,
  type Viewport,
  type NodeMouseHandler,
  type Node,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useTenant } from '@/contexts/tenant-context';
import { useCanvasData } from './hooks/useCanvasData';
import { useCanvasLayout } from './hooks/useCanvasLayout';
import { useCanvasZoom } from './hooks/useCanvasZoom';
import { useCanvasActions } from './hooks/useCanvasActions';
import { LandscapeNode } from './nodes/LandscapeNode';
import { UnitNode } from './nodes/UnitNode';
import { TeamNode } from './nodes/TeamNode';
import { RelationshipEdge } from './edges/RelationshipEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasLegend } from './CanvasLegend';
import { EntityDetailPanel } from './panels/EntityDetailPanel';
import { ImpactPreviewPanel } from './panels/ImpactPreviewPanel';
import { NewRelationshipPanel } from './panels/NewRelationshipPanel';
import { reassignEntity, createRelationship } from '@/lib/canvas/graph-service';
import type { RelationshipType } from '@/lib/supabase/database.types';
import type { LayoutConfig } from '@/lib/canvas/layout-engine';

// Register custom node types
const nodeTypes = {
  landscapeNode: LandscapeNode,
  unitNode: UnitNode,
  teamNode: TeamNode,
};

// Register custom edge types
const edgeTypes = {
  relationshipEdge: RelationshipEdge,
};

interface OrganizationalCanvasProps {
  /** Filter to show only specific entity types */
  entityTypeFilter?: string;
  /** Initial zoom level */
  initialZoom?: number;
  /** CSS class for the container */
  className?: string;
}

export function OrganizationalCanvas({
  entityTypeFilter,
  initialZoom = 0.5,
  className,
}: OrganizationalCanvasProps) {
  const { currentTenant } = useTenant();
  const [layoutMode, setLayoutMode] = useState<LayoutConfig['mode']>('hierarchical');
  const { graph, isLoading, error, search, refresh } = useCanvasData(
    entityTypeFilter ? { entityType: entityTypeFilter } : undefined
  );
  const { zoomLevel, onZoomChange } = useCanvasZoom(initialZoom);
  const { flowNodes, flowEdges } = useCanvasLayout(graph, zoomLevel, layoutMode);
  const {
    selectedEntityId,
    setSelectedEntityId,
    reassignmentDraft,
    startReassignment,
    cancelReassignment,
    updateReassignmentDraft,
    newRelDraft,
    startNewRelationship,
    cancelNewRelationship,
    updateNewRelDraft,
  } = useCanvasActions();

  // Track drag start position for proximity detection
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Relationship creation mode: click two nodes to create a link
  const [isRelationshipMode, setIsRelationshipMode] = useState(false);
  const relationshipSourceId = useRef<string | null>(null);

  // Track viewport changes for zoom level
  useOnViewportChange({
    onChange: useCallback((viewport: Viewport) => {
      onZoomChange(viewport.zoom);
    }, [onZoomChange]),
  });

  const { setCenter } = useReactFlow();

  // Handle node click -> relationship mode, zoom, or select
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    // Relationship creation mode: click two nodes
    if (isRelationshipMode) {
      if (!relationshipSourceId.current) {
        // First click — select source
        relationshipSourceId.current = node.id;
        return;
      }
      // Second click — select target, open panel
      if (node.id !== relationshipSourceId.current) {
        startNewRelationship(relationshipSourceId.current, node.id);
      }
      relationshipSourceId.current = null;
      setIsRelationshipMode(false);
      return;
    }

    if (zoomLevel === 'landscape' || zoomLevel === 'unit') {
      // Zoom in one level and center on clicked node
      const targetZoom = zoomLevel === 'landscape' ? 0.6 : 1.2;
      setCenter(
        node.position.x + 100,
        node.position.y + 40,
        { zoom: targetZoom, duration: 500 }
      );
    } else {
      // At team/entity zoom, open detail panel
      setSelectedEntityId(node.id);
    }
  }, [zoomLevel, setCenter, setSelectedEntityId, isRelationshipMode, startNewRelationship]);

  // Handle search result -> pan to node and open detail
  const handleSelectEntity = useCallback((entityId: string) => {
    const node = flowNodes.find(n => n.id === entityId);
    if (node) {
      setCenter(
        node.position.x + 100,
        node.position.y + 40,
        { zoom: 1.5, duration: 500 }
      );
    }
    setSelectedEntityId(entityId);
  }, [flowNodes, setCenter, setSelectedEntityId]);

  // Drag start — record initial position
  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    dragStartPos.current = { x: node.position.x, y: node.position.y };
  }, []);

  // Drag stop — detect drop target by proximity
  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const start = dragStartPos.current;
    dragStartPos.current = null;
    if (!start || !graph) return;

    // Only trigger if actually moved (> 40px)
    const dx = node.position.x - start.x;
    const dy = node.position.y - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < 40) return;

    // Find closest other node within 120px proximity
    const DROP_RADIUS = 120;
    let closestNode: Node | null = null;
    let closestDist = Infinity;

    for (const fn of flowNodes) {
      if (fn.id === node.id) continue;
      const fdx = fn.position.x - node.position.x;
      const fdy = fn.position.y - node.position.y;
      const dist = Math.sqrt(fdx * fdx + fdy * fdy);
      if (dist < DROP_RADIUS && dist < closestDist) {
        closestDist = dist;
        closestNode = fn;
      }
    }

    if (!closestNode) return;

    // Find the entity data for the dragged node
    const draggedGraphNode = graph.nodes.find(n => n.id === node.id);
    if (!draggedGraphNode) return;

    // Find current parent from graph edges
    const parentEdge = graph.edges.find(
      e => e.targetId === node.id &&
        (e.relationship.relationship_type === 'contains' ||
         e.relationship.relationship_type === 'manages' ||
         e.relationship.relationship_type === 'works_at')
    );

    startReassignment(
      draggedGraphNode.entity,
      parentEdge?.sourceId || null,
      closestNode.id
    );
  }, [graph, flowNodes, startReassignment]);

  // Toggle relationship creation mode
  const handleToggleRelationshipMode = useCallback(() => {
    setIsRelationshipMode(prev => {
      if (prev) relationshipSourceId.current = null;
      return !prev;
    });
  }, []);

  // Handle new relationship confirm — persist to Supabase
  const handleConfirmNewRelationship = useCallback(async () => {
    if (!newRelDraft || !currentTenant?.id) {
      cancelNewRelationship();
      return;
    }
    try {
      await createRelationship(
        currentTenant.id,
        newRelDraft.sourceId,
        newRelDraft.targetId,
        newRelDraft.relationshipType as RelationshipType,
      );
      cancelNewRelationship();
      await refresh();
    } catch {
      cancelNewRelationship();
    }
  }, [newRelDraft, currentTenant?.id, cancelNewRelationship, refresh]);

  // Handle reassignment confirm — persist to Supabase
  const handleConfirmReassignment = useCallback(async () => {
    if (!reassignmentDraft || !currentTenant?.id) {
      cancelReassignment();
      return;
    }

    try {
      await reassignEntity(
        currentTenant.id,
        reassignmentDraft.entity.id,
        reassignmentDraft.toParentId,
        reassignmentDraft.effectiveDate,
      );
      cancelReassignment();
      await refresh();
    } catch {
      // On error, just cancel and let user retry
      cancelReassignment();
    }
  }, [reassignmentDraft, currentTenant?.id, cancelReassignment, refresh]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="animate-pulse text-sm text-muted-foreground">
          Loading organizational graph...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No entities found</p>
          <p className="text-xs text-muted-foreground mt-1">Import data to populate the organizational canvas</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full ${className || ''}`}>
      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          nodesDraggable
          defaultViewport={{ x: 0, y: 0, zoom: initialZoom }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <MiniMap
            nodeStrokeWidth={3}
            className="!bg-background/80 !border"
            maskColor="hsla(0, 0%, 0%, 0.08)"
          />
        </ReactFlow>

        <CanvasToolbar
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onSearch={search}
          onSelectEntity={handleSelectEntity}
          isRelationshipMode={isRelationshipMode}
          onToggleRelationshipMode={handleToggleRelationshipMode}
        />

        {/* Relationship mode indicator */}
        {isRelationshipMode && (
          <div style={{
            position: 'absolute',
            top: '52px',
            left: '12px',
            zIndex: 10,
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            color: '#818cf8',
            backdropFilter: 'blur(8px)',
          }}>
            {relationshipSourceId.current
              ? 'Click target entity...'
              : 'Click source entity...'}
          </div>
        )}

        <CanvasLegend />
      </div>

      {/* Side panel */}
      {selectedEntityId && !reassignmentDraft && (
        <EntityDetailPanel
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
          onNavigateToEntity={handleSelectEntity}
        />
      )}

      {reassignmentDraft && (
        <ImpactPreviewPanel
          draft={reassignmentDraft}
          targetName={
            graph?.nodes.find(n => n.id === reassignmentDraft.toParentId)?.entity.display_name
            || reassignmentDraft.toParentId.slice(0, 8)
          }
          onConfirm={handleConfirmReassignment}
          onCancel={cancelReassignment}
          onUpdate={updateReassignmentDraft}
        />
      )}

      {newRelDraft && (
        <NewRelationshipPanel
          draft={newRelDraft}
          sourceName={
            graph?.nodes.find(n => n.id === newRelDraft.sourceId)?.entity.display_name
            || newRelDraft.sourceId.slice(0, 8)
          }
          targetName={
            graph?.nodes.find(n => n.id === newRelDraft.targetId)?.entity.display_name
            || newRelDraft.targetId.slice(0, 8)
          }
          onConfirm={handleConfirmNewRelationship}
          onCancel={cancelNewRelationship}
          onUpdate={updateNewRelDraft}
        />
      )}
    </div>
  );
}
