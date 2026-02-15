/**
 * Layout Engine — Computes node positions for the Organizational Canvas
 *
 * Two modes:
 * - Hierarchical (default): parent above children, tree layout
 * - Force-directed: clusters emerge from relationship proximity
 *
 * Handles 10 to 150K+ entities via viewport culling.
 */

import type { GraphNode, GraphEdge } from './graph-service';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  entityType: string;
}

export interface LayoutConfig {
  mode: 'hierarchical' | 'force-directed';
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
}

const DEFAULT_CONFIG: LayoutConfig = {
  mode: 'hierarchical',
  nodeWidth: 220,
  nodeHeight: 80,
  horizontalSpacing: 40,
  verticalSpacing: 100,
};

// ──────────────────────────────────────────────
// Hierarchical Layout
// ──────────────────────────────────────────────

interface TreeNode {
  id: string;
  children: TreeNode[];
  width: number;
  x: number;
  depth: number;
  entityType: string;
}

/**
 * Build a tree structure from flat nodes + edges.
 */
function buildTree(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootIds: string[]
): TreeNode[] {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build children map from containment/management edges
  const childrenMap = new Map<string, string[]>();
  for (const edge of edges) {
    const rt = edge.relationship.relationship_type;
    if (rt === 'contains' || rt === 'manages') {
      const existing = childrenMap.get(edge.sourceId) || [];
      existing.push(edge.targetId);
      childrenMap.set(edge.sourceId, existing);
    }
  }

  // Track which nodes appear as children to find orphans
  const hasParent = new Set<string>();
  Array.from(childrenMap.values()).forEach(children => {
    for (const c of children) hasParent.add(c);
  });

  function buildNode(id: string, depth: number): TreeNode {
    const gn = nodeMap.get(id);
    const children = (childrenMap.get(id) || [])
      .filter(cid => nodeMap.has(cid))
      .map(cid => buildNode(cid, depth + 1));
    return {
      id,
      children,
      width: 0,
      x: 0,
      depth,
      entityType: gn?.entity.entity_type || 'individual',
    };
  }

  // Start from explicit roots, add orphans as additional roots
  const usedRoots = new Set(rootIds);
  const trees = rootIds.map(id => buildNode(id, 0));

  // Add orphan nodes (not in rootIds and not a child of anyone)
  for (const n of nodes) {
    if (!usedRoots.has(n.id) && !hasParent.has(n.id)) {
      trees.push(buildNode(n.id, 0));
    }
  }

  return trees;
}

/**
 * Assign x-widths bottom-up, then positions top-down.
 */
function layoutTree(
  tree: TreeNode,
  config: LayoutConfig,
  startX: number
): LayoutNode[] {
  const results: LayoutNode[] = [];
  const { nodeWidth, nodeHeight, horizontalSpacing, verticalSpacing } = config;

  // Phase 1: compute subtree widths bottom-up
  function computeWidth(node: TreeNode): number {
    if (node.children.length === 0) {
      node.width = nodeWidth;
      return nodeWidth;
    }
    let total = 0;
    for (const child of node.children) {
      total += computeWidth(child);
    }
    total += (node.children.length - 1) * horizontalSpacing;
    node.width = Math.max(nodeWidth, total);
    return node.width;
  }

  // Phase 2: assign x positions top-down
  function assignPositions(node: TreeNode, x: number, y: number): void {
    node.x = x + node.width / 2 - nodeWidth / 2;
    results.push({
      id: node.id,
      x: node.x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      depth: node.depth,
      entityType: node.entityType,
    });

    let childX = x;
    for (const child of node.children) {
      assignPositions(child, childX, y + nodeHeight + verticalSpacing);
      childX += child.width + horizontalSpacing;
    }
  }

  computeWidth(tree);
  assignPositions(tree, startX, 0);
  return results;
}

// ──────────────────────────────────────────────
// Force-Directed Layout (simple spring model)
// ──────────────────────────────────────────────

function forceDirectedLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: LayoutConfig
): LayoutNode[] {
  const positions = new Map<string, { x: number; y: number }>();

  // Initialize positions in a circle
  const radius = Math.max(300, nodes.length * 20);
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    positions.set(node.id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  });

  // Build adjacency set for quick lookup
  const adjacent = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacent.has(edge.sourceId)) adjacent.set(edge.sourceId, new Set());
    if (!adjacent.has(edge.targetId)) adjacent.set(edge.targetId, new Set());
    adjacent.get(edge.sourceId)!.add(edge.targetId);
    adjacent.get(edge.targetId)!.add(edge.sourceId);
  }

  // Run simulation for fixed iterations
  const iterations = 50;
  const repulsion = 5000;
  const attraction = 0.01;
  const damping = 0.9;

  const velocities = new Map<string, { vx: number; vy: number }>();
  for (const node of nodes) velocities.set(node.id, { vx: 0, vy: 0 });

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs (O(n^2) — fine for <1000 nodes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const va = velocities.get(nodes[i].id)!;
        const vb = velocities.get(nodes[j].id)!;
        va.vx -= fx;
        va.vy -= fy;
        vb.vx += fx;
        vb.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = positions.get(edge.sourceId);
      const b = positions.get(edge.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const fx = dx * attraction;
      const fy = dy * attraction;

      const va = velocities.get(edge.sourceId)!;
      const vb = velocities.get(edge.targetId)!;
      va.vx += fx;
      va.vy += fy;
      vb.vx -= fx;
      vb.vy -= fy;
    }

    // Apply velocities with damping
    for (const node of nodes) {
      const v = velocities.get(node.id)!;
      const p = positions.get(node.id)!;
      v.vx *= damping;
      v.vy *= damping;
      p.x += v.vx;
      p.y += v.vy;
    }
  }

  return nodes.map(node => {
    const pos = positions.get(node.id)!;
    return {
      id: node.id,
      x: pos.x,
      y: pos.y,
      width: config.nodeWidth,
      height: config.nodeHeight,
      depth: node.depth,
      entityType: node.entity.entity_type,
    };
  });
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Compute layout positions for all nodes.
 */
export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootIds: string[],
  config: Partial<LayoutConfig> = {}
): LayoutNode[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (fullConfig.mode === 'force-directed') {
    return forceDirectedLayout(nodes, edges, fullConfig);
  }

  // Hierarchical layout
  const trees = buildTree(nodes, edges, rootIds);
  const results: LayoutNode[] = [];
  let currentX = 0;

  for (const tree of trees) {
    const treeNodes = layoutTree(tree, fullConfig, currentX);
    results.push(...treeNodes);
    // Next tree starts after this one
    const maxX = treeNodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
    currentX = maxX + fullConfig.horizontalSpacing * 2;
  }

  return results;
}

// ──────────────────────────────────────────────
// Zoom Level Determination
// ──────────────────────────────────────────────

export type ZoomLevel = 'landscape' | 'unit' | 'team' | 'entity';

/**
 * Determine the zoom level based on the camera zoom factor.
 */
export function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.3) return 'landscape';
  if (zoom < 0.7) return 'unit';
  if (zoom < 1.5) return 'team';
  return 'entity';
}
