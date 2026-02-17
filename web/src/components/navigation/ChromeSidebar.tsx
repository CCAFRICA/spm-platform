'use client';

/**
 * ChromeSidebar — Unified Persona-Aware Navigation
 *
 * Replaces both legacy Sidebar.tsx and MissionControlRail.tsx.
 * Combines:
 *   - Workspace switcher (top)
 *   - Active workspace section nav (routes)
 *   - Mission Control zones (Cycle/Queue/Pulse)
 *   - User identity footer
 *   - Persona accent coloring (Wayfinder Layer 3)
 *
 * OB-46C Phase 2
 */

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNavigation, useCommandPalette } from '@/contexts/navigation-context';
import { usePersona } from '@/contexts/persona-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { WORKSPACES, getWorkspaceRoutesForRole } from '@/lib/navigation/workspace-config';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';
import { CycleIndicator } from './mission-control/CycleIndicator';
import { QueuePanel } from './mission-control/QueuePanel';
import { PulseMetrics } from './mission-control/PulseMetrics';
import { UserIdentity } from './mission-control/UserIdentity';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { PERSONA_TOKENS } from '@/lib/design/tokens';
import type { WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import type { TenantFeatures } from '@/types/tenant';
import {
  DollarSign,
  Command,
  PanelLeftClose,
  PanelLeft,
  ArrowLeftRight,
  Zap,
  TrendingUp,
  Search,
  Palette,
  Settings,
  Shield,
  Activity,
  Upload,
  Sparkles,
  History,
  Layers,
  Calculator,
  BarChart3,
  Table,
  Sliders,
  GitCompare,
  AlertTriangle,
  CheckSquare,
  Wallet,
  Calendar,
  RefreshCw,
  Database,
  ShieldCheck,
  LayoutDashboard,
  FileText,
  Receipt,
  Users,
  Trophy,
  LineChart,
  PieChart,
  HelpCircle,
  PlusCircle,
  FileSearch,
  Download,
  GitBranch,
  CheckCircle,
  Route,
  Key,
  MessageCircle,
  Edit,
  FlaskConical,
  MapPin,
  Network,
  FileSpreadsheet,
  FileDown,
  Languages,
  Plug,
  Target,
  Copy,
  ShieldAlert,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Workspace icon map
const WORKSPACE_ICONS: Record<WorkspaceId, React.ComponentType<{ className?: string }>> = {
  operate: Zap,
  perform: TrendingUp,
  investigate: Search,
  design: Palette,
  configure: Settings,
  govern: Shield,
  financial: Activity,
};

// Static icon map for route icons
const ROUTE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Upload, Sparkles, History, Layers, Calculator, BarChart3, Table, Sliders,
  GitCompare, AlertTriangle, CheckSquare, DollarSign, Wallet, Calendar, RefreshCw,
  Activity, Database, ShieldCheck, LayoutDashboard, FileText, Receipt, Users,
  Trophy, LineChart, PieChart, HelpCircle, PlusCircle, Search, FileSearch,
  Download, GitBranch, CheckCircle, Route, Key, Shield, MessageCircle, Edit,
  FlaskConical, TrendingUp, Target, Copy, MapPin, Network, Settings, FileSpreadsheet,
  FileDown, Languages, Plug, ShieldAlert, Zap, Palette,
};

function RouteIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ROUTE_ICONS[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function ChromeSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    isRailCollapsed,
    toggleRailCollapsed,
    activeWorkspace,
    navigateToWorkspace,
    userRole,
  } = useNavigation();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { persona } = usePersona();
  const { currentTenant } = useTenant();
  const { isVLAdmin: isUserVLAdmin } = useAuth();
  const { locale } = useLocale();

  const isSpanish = locale === 'es-MX';
  const showCycle = userRole === 'vl_admin' || userRole === 'admin';

  // Get accessible workspaces for current user
  const accessibleWorkspaces = userRole
    ? getAccessibleWorkspaces(userRole as UserRole).filter(wsId => {
        const ws = WORKSPACES[wsId];
        if (!ws?.featureFlag) return true;
        const features = currentTenant?.features as TenantFeatures | undefined;
        return features?.[ws.featureFlag as keyof TenantFeatures] === true;
      })
    : [];

  // Get sections for active workspace
  const activeWsConfig = WORKSPACES[activeWorkspace];
  const activeSections = userRole
    ? getWorkspaceRoutesForRole(activeWorkspace, userRole as UserRole)
    : [];

  // Persona accent color for the sidebar header stripe
  const accentGrad = PERSONA_TOKENS[persona].accentGrad;

  // Workspace accent color
  const wsAccent = activeWsConfig?.accentColor || 'hsl(262, 83%, 58%)';

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity',
          isRailCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        onClick={toggleRailCollapsed}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-zinc-800/60 bg-zinc-950 transition-all duration-300 ease-in-out md:z-30',
          isRailCollapsed ? 'w-16' : 'w-[264px]',
          'translate-x-0'
        )}
      >
        {/* ── Header: Persona accent stripe + Tenant identity ── */}
        <div className="shrink-0">
          {/* Thin persona accent bar */}
          <div className={`h-0.5 bg-gradient-to-r ${accentGrad}`} />

          <div
            className={cn(
              'flex items-center border-b border-zinc-800/60',
              isRailCollapsed ? 'h-14 justify-center px-2' : 'h-14 gap-3 px-4',
              isUserVLAdmin && 'cursor-pointer hover:bg-zinc-900 transition-colors'
            )}
            onClick={isUserVLAdmin ? () => router.push('/select-tenant') : undefined}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${accentGrad}`}>
              <DollarSign className="h-4 w-4 text-white" />
            </div>
            {!isRailCollapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold text-zinc-100 truncate">
                  ViaLuce
                </span>
                <span className="text-[10px] text-zinc-500 truncate -mt-0.5 flex items-center gap-1">
                  {currentTenant?.displayName || 'Platform'}
                  {isUserVLAdmin && <ArrowLeftRight className="h-2.5 w-2.5 text-zinc-600" />}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Workspace Switcher ── */}
        <div className={cn('shrink-0 border-b border-zinc-800/40', isRailCollapsed ? 'py-2 px-1' : 'py-2 px-3')}>
          {!isRailCollapsed && (
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">
              {isSpanish ? 'Espacios' : 'Workspaces'}
            </p>
          )}
          <div className={cn(isRailCollapsed ? 'flex flex-col items-center gap-1' : 'flex flex-wrap gap-1')}>
            {accessibleWorkspaces.map(wsId => {
              const ws = WORKSPACES[wsId];
              const Icon = WORKSPACE_ICONS[wsId];
              const isActive = activeWorkspace === wsId;

              if (isRailCollapsed) {
                return (
                  <TooltipProvider key={wsId}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => navigateToWorkspace(wsId)}
                          className={cn(
                            'flex items-center justify-center w-10 h-8 rounded-md transition-all',
                            isActive
                              ? 'text-white'
                              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                          )}
                          style={isActive ? { backgroundColor: `${ws.accentColor}30`, color: ws.accentColor } : undefined}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {isSpanish ? ws.labelEs : ws.label}
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
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    isActive
                      ? 'text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                  )}
                  style={isActive ? { backgroundColor: `${ws.accentColor}25`, color: ws.accentColor } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {isSpanish ? ws.labelEs : ws.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Workspace Section Navigation */}
          {activeSections.length > 0 && (
            <nav className={cn('py-3', isRailCollapsed ? 'px-1' : 'px-3')}>
              {!isRailCollapsed && (
                <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">
                  {isSpanish ? activeWsConfig?.labelEs : activeWsConfig?.label}
                </p>
              )}
              <div className="space-y-0.5">
                {activeSections.map(section => (
                  <SectionNav
                    key={section.id}
                    section={section}
                    wsAccent={wsAccent}
                    isSpanish={isSpanish}
                    collapsed={isRailCollapsed}
                    pathname={pathname}
                  />
                ))}
              </div>
            </nav>
          )}

          <Separator className="bg-zinc-800/40" />

          {/* Mission Control: Cycle */}
          {showCycle && (
            <>
              <div className="mission-control-zone">
                <CycleIndicator collapsed={isRailCollapsed} />
              </div>
              <Separator className="bg-zinc-800/40" />
            </>
          )}

          {/* Mission Control: Queue */}
          <div className="mission-control-zone">
            <QueuePanel collapsed={isRailCollapsed} />
          </div>
          <Separator className="bg-zinc-800/40" />

          {/* Mission Control: Pulse */}
          <div className="mission-control-zone">
            <PulseMetrics collapsed={isRailCollapsed} />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-zinc-800/60">
          {/* Command Palette */}
          <div className={cn('px-3 py-2', isRailCollapsed && 'px-2')}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setCommandPaletteOpen(true)}
                    className={cn(
                      'w-full justify-start gap-2 text-zinc-500 hover:text-zinc-300 border-zinc-800 hover:bg-zinc-800/50',
                      isRailCollapsed && 'justify-center px-0'
                    )}
                  >
                    <Command className="h-4 w-4 shrink-0" />
                    {!isRailCollapsed && (
                      <>
                        <span className="flex-1 text-left text-sm">
                          {isSpanish ? 'Buscar...' : 'Search...'}
                        </span>
                        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] font-medium text-zinc-400 sm:flex">
                          <span className="text-xs">⌘</span>K
                        </kbd>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                {isRailCollapsed && (
                  <TooltipContent side="right">
                    {isSpanish ? 'Buscar' : 'Search'} (⌘K)
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* User Identity */}
          <UserIdentity collapsed={isRailCollapsed} />

          {/* Collapse Toggle */}
          <div className={cn(
            'flex border-t border-zinc-800/40',
            isRailCollapsed ? 'justify-center py-2' : 'justify-end px-3 py-2'
          )}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleRailCollapsed}
                    className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  >
                    {isRailCollapsed ? (
                      <PanelLeft className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={isRailCollapsed ? 'right' : 'top'}>
                  {isRailCollapsed
                    ? (isSpanish ? 'Expandir' : 'Expand')
                    : (isSpanish ? 'Contraer' : 'Collapse')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Section Navigation Sub-Component ───

interface SectionNavProps {
  section: {
    id: string;
    label: string;
    labelEs: string;
    routes: Array<{
      path: string;
      label: string;
      labelEs: string;
      icon: string;
      roles: string[];
    }>;
  };
  wsAccent: string;
  isSpanish: boolean;
  collapsed: boolean;
  pathname: string;
}

function SectionNav({ section, wsAccent, isSpanish, collapsed, pathname }: SectionNavProps) {
  const hasActiveRoute = section.routes.some(r => pathname === r.path || pathname.startsWith(r.path + '/'));

  if (collapsed) {
    // Collapsed: show only icons for routes
    return (
      <div className="flex flex-col items-center gap-0.5">
        {section.routes.map(route => {
          const isActive = pathname === route.path || pathname.startsWith(route.path + '/');
          return (
            <TooltipProvider key={route.path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={route.path}
                    className={cn(
                      'flex items-center justify-center w-10 h-8 rounded-md transition-all',
                      isActive
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                    )}
                    style={isActive ? { backgroundColor: `${wsAccent}25`, color: wsAccent } : undefined}
                  >
                    <RouteIcon name={route.icon} className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isSpanish ? route.labelEs : route.label}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  }

  // Expanded: show section header + route links
  return (
    <div className="mb-2">
      <p className={cn(
        'text-[10px] font-semibold uppercase tracking-wider mb-1 px-2',
        hasActiveRoute ? 'text-zinc-300' : 'text-zinc-600'
      )}>
        {isSpanish ? section.labelEs : section.label}
      </p>
      <div className="space-y-0.5">
        {section.routes.map(route => {
          const isActive = pathname === route.path || pathname.startsWith(route.path + '/');
          return (
            <Link
              key={route.path}
              href={route.path}
              className={cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-all',
                isActive
                  ? 'text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
              style={isActive ? { backgroundColor: `${wsAccent}20`, color: wsAccent } : undefined}
            >
              {isActive && (
                <div
                  className="absolute left-0 w-0.5 h-5 rounded-full"
                  style={{ backgroundColor: wsAccent }}
                />
              )}
              <RouteIcon name={route.icon} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{isSpanish ? route.labelEs : route.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
