/**
 * useCanvasZoom — Manages zoom level state and transitions
 */

import { useState, useCallback } from 'react';
import { getZoomLevel, type ZoomLevel } from '@/lib/canvas/layout-engine';

interface UseCanvasZoomReturn {
  zoomLevel: ZoomLevel;
  zoomFactor: number;
  onZoomChange: (zoom: number) => void;
}

export function useCanvasZoom(initialZoom: number = 0.5): UseCanvasZoomReturn {
  const [zoomFactor, setZoomFactor] = useState(initialZoom);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(getZoomLevel(initialZoom));

  const onZoomChange = useCallback((zoom: number) => {
    setZoomFactor(zoom);
    const newLevel = getZoomLevel(zoom);
    setZoomLevel(prev => {
      if (prev !== newLevel) return newLevel;
      return prev;
    });
  }, []);

  return { zoomLevel, zoomFactor, onZoomChange };
}
