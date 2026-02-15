'use client';

/**
 * CanvasLegend — Relationship type legend, confidence scale
 */

export function CanvasLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 bg-card border rounded-md shadow-sm p-3 text-xs space-y-2">
      <div className="font-medium text-muted-foreground">Legend</div>

      {/* Edge types */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t-2 border-blue-500" />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t-2 border-amber-500 border-dashed" />
          <span>AI Proposed</span>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Proposed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <span>Suspended</span>
        </div>
      </div>
    </div>
  );
}
