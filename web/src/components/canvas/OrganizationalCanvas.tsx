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

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useOnViewportChange,
  useReactFlow,
  type Viewport,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
import type { LayoutConfig } from '@/lib/canvas/layout-engine';
import { useState } from 'react';

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
  const [layoutMode, setLayoutMode] = useState<LayoutConfig['mode']>('hierarchical');
  const { graph, isLoading, error, search } = useCanvasData(
    entityTypeFilter ? { entityType: entityTypeFilter } : undefined
  );
  const { zoomLevel, onZoomChange } = useCanvasZoom(initialZoom);
  const { flowNodes, flowEdges } = useCanvasLayout(graph, zoomLevel, layoutMode);
  const {
    selectedEntityId,
    setSelectedEntityId,
    reassignmentDraft,
    cancelReassignment,
    updateReassignmentDraft,
  } = useCanvasActions();

  // Track viewport changes for zoom level
  useOnViewportChange({
    onChange: useCallback((viewport: Viewport) => {
      onZoomChange(viewport.zoom);
    }, [onZoomChange]),
  });

  const { setCenter } = useReactFlow();

  // Handle node click -> zoom in at landscape/unit, select at team/entity
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
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
  }, [zoomLevel, setCenter, setSelectedEntityId]);

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

  // Handle reassignment confirm
  const handleConfirmReassignment = useCallback(async () => {
    // Future: call createReassignmentEvent via entity-service
    cancelReassignment();
  }, [cancelReassignment]);

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
        />

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
          onConfirm={handleConfirmReassignment}
          onCancel={cancelReassignment}
          onUpdate={updateReassignmentDraft}
        />
      )}
    </div>
  );
}
