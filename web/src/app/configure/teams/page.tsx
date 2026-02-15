'use client';

/**
 * Teams Configuration — Canvas at zoom level 2-3, showing reporting structures
 *
 * The Organizational Canvas showing team/reporting hierarchy.
 * Default view: Canvas. Toggle to Table view available.
 */

import { useState } from 'react';
import { OrganizationalCanvas } from '@/components/canvas/OrganizationalCanvas';
import { Button } from '@/components/ui/button';
import { Network, Table2 } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';

export default function TeamsConfigurePage() {
  const [viewMode, setViewMode] = useState<'canvas' | 'table'>('canvas');
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <div>
          <h1 className="text-lg font-semibold">
            {isSpanish ? 'Estructura Organizacional' : 'Organizational Structure'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isSpanish ? 'Visualiza y gestiona la estructura del equipo' : 'Visualize and manage team structure'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <Button
            variant={viewMode === 'canvas' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('canvas')}
            className="h-7 text-xs"
          >
            <Network className="h-3.5 w-3.5 mr-1" />
            Canvas
          </Button>
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="h-7 text-xs"
          >
            <Table2 className="h-3.5 w-3.5 mr-1" />
            {isSpanish ? 'Tabla' : 'Table'}
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'canvas' ? (
        <OrganizationalCanvas initialZoom={0.5} className="flex-1" />
      ) : (
        <div className="flex-1 p-6">
          <p className="text-sm text-muted-foreground">
            {isSpanish ? 'Vista de tabla (cargando entidades...)' : 'Table view (loading entities...)'}
          </p>
        </div>
      )}
    </div>
  );
}
