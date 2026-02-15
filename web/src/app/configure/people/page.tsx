'use client';

/**
 * People Configuration — Canvas filtered for entity_type='individual'
 *
 * Shows all individual entities on the canvas with table toggle.
 */

import { useState } from 'react';
import { OrganizationalCanvas } from '@/components/canvas/OrganizationalCanvas';
import { Button } from '@/components/ui/button';
import { Network, Table2, Users } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { useRouter } from 'next/navigation';

export default function PeopleConfigurePage() {
  const [viewMode, setViewMode] = useState<'canvas' | 'table'>('canvas');
  const { locale } = useLocale();
  const router = useRouter();
  const isSpanish = locale === 'es-MX';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {isSpanish ? 'Personal' : 'Personnel'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isSpanish ? 'Visualiza y gestiona entidades individuales' : 'Visualize and manage individual entities'}
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
        <OrganizationalCanvas
          entityTypeFilter="individual"
          initialZoom={0.8}
          className="flex-1"
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Inline the legacy table view for personnel */}
          <div className="p-6 text-sm text-muted-foreground">
            <Button
              variant="outline"
              onClick={() => router.push('/workforce/personnel')}
            >
              {isSpanish ? 'Abrir vista completa de tabla' : 'Open full table view'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
