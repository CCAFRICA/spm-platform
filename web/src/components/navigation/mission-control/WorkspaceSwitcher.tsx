'use client';

/**
 * Workspace Switcher Component
 *
 * Allows switching between workspaces in Mission Control.
 */

import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/navigation-context';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';
import type { WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import {
  Zap,
  TrendingUp,
  Search,
  Palette,
  Settings,
  Shield,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

const WORKSPACE_ICONS: Record<WorkspaceId, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  operate: Zap,
  perform: TrendingUp,
  investigate: Search,
  design: Palette,
  configure: Settings,
  govern: Shield,
};

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const { activeWorkspace, navigateToWorkspace, isSpanish, userRole } = useWorkspace();

  // Get accessible workspaces for current user
  const accessibleWorkspaces = userRole
    ? getAccessibleWorkspaces(userRole as UserRole)
    : [];

  return (
    <div className={cn('py-2', collapsed ? 'px-2' : 'px-3')}>
      {!collapsed && (
        <div className="mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {isSpanish ? 'Espacios de Trabajo' : 'Workspaces'}
          </h3>
        </div>
      )}

      <div className={cn('space-y-1', collapsed && 'flex flex-col items-center')}>
        {accessibleWorkspaces.map(wsId => {
          const workspace = WORKSPACES[wsId];
          const Icon = WORKSPACE_ICONS[wsId];
          const isActive = activeWorkspace === wsId;

          if (collapsed) {
            return (
              <TooltipProvider key={wsId}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigateToWorkspace(wsId)}
                      className={cn(
                        'relative flex items-center justify-center w-10 h-10 rounded-lg transition-all',
                        isActive
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      )}
                      style={isActive ? { color: workspace.accentColor } : undefined}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <div
                          className="absolute left-0 top-1 bottom-1 w-1 rounded-full"
                          style={{ backgroundColor: workspace.accentColor }}
                        />
                      )}
                      <Icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-sm">
                      <p className="font-medium">
                        {isSpanish ? workspace.labelEs : workspace.label}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {isSpanish ? workspace.descriptionEs : workspace.description}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return (
            <button
              key={wsId}
              onClick={() => navigateToWorkspace(wsId)}
              className={cn(
                'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
              style={isActive ? {
                backgroundColor: `${workspace.accentColor}15`,
                color: workspace.accentColor,
              } : undefined}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute left-0 top-1 bottom-1 w-1 rounded-full"
                  style={{ backgroundColor: workspace.accentColor }}
                />
              )}
              <Icon
                className="h-5 w-5 shrink-0"
                style={isActive ? { color: workspace.accentColor } : undefined}
              />
              <span className="truncate">
                {isSpanish ? workspace.labelEs : workspace.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
