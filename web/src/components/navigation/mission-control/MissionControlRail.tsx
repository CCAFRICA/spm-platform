'use client';

/**
 * Mission Control Rail
 *
 * The persistent left navigation rail that replaces the traditional sidebar.
 * Contains: Tenant identity, Cycle indicator, Queue, Pulse, Workspaces, User identity.
 */

import { cn } from '@/lib/utils';
import { useNavigation, useCommandPalette } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { CycleIndicator } from './CycleIndicator';
import { QueuePanel } from './QueuePanel';
import { PulseMetrics } from './PulseMetrics';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { UserIdentity } from './UserIdentity';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { DollarSign, Command, PanelLeftClose, PanelLeft } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MissionControlRailProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function MissionControlRail({ isOpen = true, onClose }: MissionControlRailProps) {
  const { isRailCollapsed, toggleRailCollapsed, userRole } = useNavigation();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  // Check if user is admin/cc_admin to show cycle
  const showCycle = userRole === 'cc_admin' || userRole === 'admin';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Rail */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950 md:z-30',
          isRailCollapsed ? 'w-16' : 'w-[280px]',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Header - Tenant Logo */}
        <div className={cn(
          'flex items-center border-b border-slate-200 dark:border-slate-800 shrink-0',
          isRailCollapsed ? 'h-16 justify-center px-2' : 'h-16 gap-2 px-4'
        )}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-500">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          {!isRailCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
                ClearComp
              </span>
              <span className="text-[10px] text-slate-500 truncate -mt-0.5">
                {currentTenant?.displayName || 'Sales Performance'}
              </span>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Cycle Indicator - Admin only */}
          {showCycle && (
            <>
              <CycleIndicator collapsed={isRailCollapsed} />
              <Separator />
            </>
          )}

          {/* Queue Panel */}
          <QueuePanel collapsed={isRailCollapsed} />
          <Separator />

          {/* Pulse Metrics */}
          <PulseMetrics collapsed={isRailCollapsed} />
          <Separator />

          {/* Workspace Switcher */}
          <WorkspaceSwitcher collapsed={isRailCollapsed} />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800">
          {/* Command Palette Trigger */}
          <div className={cn('px-3 py-2', isRailCollapsed && 'px-2')}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setCommandPaletteOpen(true)}
                    className={cn(
                      'w-full justify-start gap-2 text-slate-500 hover:text-slate-700',
                      isRailCollapsed && 'justify-center px-0'
                    )}
                  >
                    <Command className="h-4 w-4 shrink-0" />
                    {!isRailCollapsed && (
                      <>
                        <span className="flex-1 text-left text-sm">
                          {isSpanish ? 'Buscar...' : 'Search...'}
                        </span>
                        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                          <span className="text-xs">⌘</span>K
                        </kbd>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                {isRailCollapsed && (
                  <TooltipContent side="right">
                    <span>{isSpanish ? 'Buscar' : 'Search'} (⌘K)</span>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* User Identity */}
          <UserIdentity collapsed={isRailCollapsed} />

          {/* Collapse Toggle */}
          <div className={cn(
            'flex border-t border-slate-100 dark:border-slate-800',
            isRailCollapsed ? 'justify-center py-2' : 'justify-end px-3 py-2'
          )}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleRailCollapsed}
                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                  >
                    {isRailCollapsed ? (
                      <PanelLeft className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={isRailCollapsed ? 'right' : 'top'}>
                  <span>
                    {isRailCollapsed
                      ? (isSpanish ? 'Expandir' : 'Expand')
                      : (isSpanish ? 'Contraer' : 'Collapse')}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>
    </>
  );
}

export default MissionControlRail;
