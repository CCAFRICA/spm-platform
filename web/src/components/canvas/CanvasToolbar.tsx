'use client';

/**
 * CanvasToolbar — Search, layout toggle, zoom controls
 * DS-001 inline styles, floating glass panel
 */

import { useState, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
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

const TOOLBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const GROUP_STYLE: React.CSSProperties = {
  display: 'flex',
  background: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  borderRadius: '8px',
  backdropFilter: 'blur(8px)',
  overflow: 'hidden',
};

const BTN_STYLE: React.CSSProperties = {
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#94a3b8',
  transition: 'background 0.15s, color 0.15s',
};

const BTN_ACTIVE: React.CSSProperties = {
  ...BTN_STYLE,
  background: 'rgba(99, 102, 241, 0.2)',
  color: '#818cf8',
};

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
    <div style={TOOLBAR_STYLE}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <div style={{ ...GROUP_STYLE, padding: '0 4px' }}>
          <Search size={14} style={{ color: '#64748b', marginLeft: '8px', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search entities..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: '13px',
              padding: '8px',
              width: '180px',
            }}
          />
        </div>
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '260px',
              maxHeight: '240px',
              overflowY: 'auto',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: '8px',
              backdropFilter: 'blur(8px)',
            }}
          >
            {searchResults.map(entity => (
              <button
                key={entity.id}
                onClick={() => handleSelectResult(entity)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(30, 41, 59, 0.5)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: '#e2e8f0', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entity.display_name}
                </span>
                <span style={{ color: '#64748b', fontSize: '10px', flexShrink: 0 }}>
                  {entity.entity_type}
                </span>
                {entity.external_id && (
                  <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace', flexShrink: 0 }}>
                    {entity.external_id}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layout toggle */}
      <div style={GROUP_STYLE}>
        <button
          style={layoutMode === 'hierarchical' ? BTN_ACTIVE : BTN_STYLE}
          onClick={() => onLayoutModeChange('hierarchical')}
          title="Hierarchical layout"
        >
          <GitBranch size={14} />
        </button>
        <button
          style={layoutMode === 'force-directed' ? BTN_ACTIVE : BTN_STYLE}
          onClick={() => onLayoutModeChange('force-directed')}
          title="Force-directed layout"
        >
          <Network size={14} />
        </button>
      </div>

      {/* Zoom controls */}
      <div style={GROUP_STYLE}>
        <button style={BTN_STYLE} onClick={() => zoomIn()} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button style={BTN_STYLE} onClick={() => zoomOut()} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button style={BTN_STYLE} onClick={() => fitView({ padding: 0.2 })} title="Fit view">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
