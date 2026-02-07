/**
 * Hierarchy Types
 *
 * Types for organizational hierarchy visualization and management.
 */

// ============================================
// HIERARCHY NODE
// ============================================

/**
 * A node in the organizational hierarchy
 */
export interface HierarchyNode {
  id: string;
  employeeId: string;

  // Display info
  name: string;
  title?: string;
  department?: string;
  location?: string;
  avatar?: string;

  // Hierarchy position
  level: number; // 1 = top, increases going down
  parentId?: string; // ID of parent node
  childrenIds: string[]; // IDs of direct reports

  // Confidence metrics
  nodeConfidence: number; // 0-100, confidence in this node's data
  connectionConfidence: number; // 0-100, confidence in parent relationship

  // Status
  status: 'active' | 'pending' | 'flagged' | 'orphan';

  // Aggregated metrics (for managers)
  metrics?: {
    directReports: number;
    totalReports: number; // Including indirect
    avgTeamConfidence: number;
    pendingActions: number;
  };
}

/**
 * Connection between nodes with confidence annotation
 */
export interface HierarchyConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  confidence: number; // 0-100
  source: 'explicit' | 'inferred' | 'manual';
  signals: string[]; // Detection signals that support this connection
  createdAt: string;
  lastVerified?: string;
}

// ============================================
// HIERARCHY TREE
// ============================================

/**
 * Complete hierarchy tree structure
 */
export interface HierarchyTree {
  id: string;
  tenantId: string;
  name: string;
  description?: string;

  // Tree data
  rootNodeId?: string;
  nodes: Record<string, HierarchyNode>;
  connections: HierarchyConnection[];

  // Orphan nodes (no valid parent)
  orphanNodeIds: string[];

  // Statistics
  stats: {
    totalNodes: number;
    totalLevels: number;
    avgConfidence: number;
    nodesRequiringReview: number;
    orphanCount: number;
  };

  // Versioning
  version: number;
  lastModified: string;
  lastModifiedBy: string;
}

// ============================================
// VISUALIZATION OPTIONS
// ============================================

export type HierarchyViewMode =
  | 'tree' // Traditional org chart tree
  | 'sunburst' // Radial sunburst chart
  | 'table' // Flat table with hierarchy columns
  | 'list'; // Expandable list view

export type HierarchyColorMode =
  | 'confidence' // Color by connection confidence
  | 'department' // Color by department
  | 'location' // Color by location
  | 'status'; // Color by node status

export interface HierarchyViewOptions {
  mode: HierarchyViewMode;
  colorMode: HierarchyColorMode;
  showConfidenceBadges: boolean;
  showMetrics: boolean;
  expandedLevels: number; // How many levels to expand by default
  highlightLowConfidence: boolean;
  lowConfidenceThreshold: number;
  showOrphans: boolean;
  searchQuery?: string;
  focusedNodeId?: string;
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Batch assignment operation
 */
export interface BatchAssignment {
  id: string;
  type: 'assign_manager' | 'move_team' | 'update_department' | 'bulk_import';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rolled_back';

  // Affected nodes
  nodeIds: string[];

  // Operation details
  operation: {
    field: 'parentId' | 'department' | 'location' | 'teamId';
    newValue: string;
    previousValues?: Record<string, string>; // For rollback
  };

  // Audit
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Drag and drop operation for hierarchy restructuring
 */
export interface HierarchyDragOperation {
  nodeId: string;
  fromParentId?: string;
  toParentId?: string;
  position?: number; // Position among siblings
}

// ============================================
// HIERARCHY CHANGE LOG
// ============================================

export interface HierarchyChangeRecord {
  id: string;
  timestamp: string;
  userId: string;
  nodeId: string;
  changeType: 'create' | 'update' | 'delete' | 'move' | 'merge';
  field?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}

// ============================================
// NODE SELECTION
// ============================================

export interface NodeSelection {
  selectedNodeIds: Set<string>;
  lastSelectedNodeId?: string;
  selectionMode: 'single' | 'multiple' | 'branch'; // branch = select node and all descendants
}

// ============================================
// HIERARCHY FILTERS
// ============================================

export interface HierarchyFilters {
  departments?: string[];
  locations?: string[];
  levels?: number[];
  status?: HierarchyNode['status'][];
  minConfidence?: number;
  maxConfidence?: number;
  hasOrphans?: boolean;
  hasPendingActions?: boolean;
}

// ============================================
// EXPORT OPTIONS
// ============================================

export type HierarchyExportFormat = 'csv' | 'xlsx' | 'json' | 'png' | 'svg';

export interface HierarchyExportOptions {
  format: HierarchyExportFormat;
  includeMetrics: boolean;
  includeConfidence: boolean;
  includeChangeHistory: boolean;
  filterBySelection: boolean;
  selectedNodeIds?: string[];
}
