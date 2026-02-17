'use client';

/**
 * WorkspaceStub — Placeholder for workspace routes not yet implemented.
 *
 * Shows a consistent empty state with the route name and workspace context.
 * Used by catch-all routes in workspace directories.
 *
 * OB-46C Phase 5
 */

import { usePathname } from 'next/navigation';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import type { WorkspaceId } from '@/types/navigation';

interface WorkspaceStubProps {
  workspace: WorkspaceId;
}

export function WorkspaceStub({ workspace }: WorkspaceStubProps) {
  const pathname = usePathname();
  const ws = WORKSPACES[workspace];

  // Try to find the matching route label
  let routeLabel = '';
  for (const section of ws.sections) {
    for (const route of section.routes) {
      if (pathname === route.path || pathname.startsWith(route.path + '/')) {
        routeLabel = route.labelEs;
        break;
      }
    }
    if (routeLabel) break;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
        <div className="w-8 h-8 rounded-lg border-2 border-dashed border-zinc-600" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-300 mb-2">
        {routeLabel || 'Pagina en Desarrollo'}
      </h2>
      <p className="text-sm text-zinc-500 max-w-md">
        Esta sección estará disponible próximamente.
        Estamos construyendo las herramientas que necesitas.
      </p>
      <div className="mt-4 px-3 py-1 rounded-full bg-zinc-800/50 border border-zinc-700/50">
        <span className="text-xs text-zinc-500">{ws.labelEs} &middot; {pathname}</span>
      </div>
    </div>
  );
}
