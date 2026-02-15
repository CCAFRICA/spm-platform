'use client';

/**
 * CanvasToolbar — Zoom controls, layout toggle, search
 */

import { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Network,
  GitBranch,
} from 'lucide-react';
import type { Entity } from '@/lib/supabase/database.types';
import type { LayoutConfig } from '@/lib/canvas/layout-engine';

interface CanvasToolbarProps {
  layoutMode: LayoutConfig['mode'];
  onLayoutModeChange: (mode: LayoutConfig['mode']) => void;
  onSearch: (query: string) => Promise<Entity[]>;
  onSelectEntity: (entityId: string) => void;
}

export function CanvasToolbar({
  layoutMode,
  onLayoutModeChange,
  onSearch,
  onSelectEntity,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await onSearch(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }, [onSearch]);

  const handleSelectResult = useCallback((entity: Entity) => {
    onSelectEntity(entity.id);
    setSearchQuery('');
    setSearchResults([]);
  }, [onSelectEntity]);

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
      {/* Search */}
      <div className="relative">
        <div className="flex items-center bg-card border rounded-md shadow-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground ml-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search entities..."
            className="text-sm bg-transparent border-none outline-none px-2 py-1.5 w-48"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-card border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {searchResults.map(entity => (
              <button
                key={entity.id}
                onClick={() => handleSelectResult(entity)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2"
              >
                <span className="truncate">{entity.display_name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {entity.entity_type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layout toggle */}
      <div className="flex bg-card border rounded-md shadow-sm">
        <Button
          variant={layoutMode === 'hierarchical' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => onLayoutModeChange('hierarchical')}
          title="Hierarchical layout"
        >
          <GitBranch className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={layoutMode === 'force-directed' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => onLayoutModeChange('force-directed')}
          title="Force-directed layout"
        >
          <Network className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Zoom controls */}
      <div className="flex bg-card border rounded-md shadow-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fitView({ padding: 0.2 })}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
