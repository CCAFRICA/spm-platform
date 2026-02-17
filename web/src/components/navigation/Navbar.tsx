"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  Bell,
  Settings,
  HelpCircle,
  Menu,
  X,
  MessageSquare,
  Mail,
  ExternalLink,
  ChevronRight,
  Home,
  Activity,
} from "lucide-react";
import { UserMenu } from "@/components/layout/user-menu";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { GlobalSearch } from "@/components/search/global-search";
import { useTenant } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
import { useNavigation } from "@/contexts/navigation-context";
import { usePeriod } from "@/contexts/period-context";
import { WORKSPACES } from "@/lib/navigation/workspace-config";
import type { WorkspaceId } from "@/types/navigation";
import { toast } from "sonner";
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from "@/lib/notifications/notification-service";
import type { Notification } from "@/types/notification";
import { NOTIFICATION_TYPE_COLORS } from "@/types/notification";

interface NavbarProps {
  onMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
}

export function Navbar({ onMenuToggle, isMobileMenuOpen }: NavbarProps) {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { cycleState, queueItems } = useNavigation();
  const { activePeriodLabel, availablePeriods, activePeriodKey } = usePeriod();
  const pathname = usePathname();
  const isSpanish = locale === 'es-MX';
  const pendingCount = queueItems.length;
  const activePeriod = availablePeriods.find(p => p.periodKey === activePeriodKey);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Load real notifications from service
  const loadNotifications = useCallback(() => {
    if (!user || !currentTenant) return;

    const userNotifications = getNotifications(user.id, currentTenant.id);
    setNotifications(userNotifications.slice(0, 5)); // Show last 5
    setNotificationCount(getUnreadCount(user.id, currentTenant.id));
  }, [user, currentTenant]);

  useEffect(() => {
    loadNotifications();
    // Refresh every 30 seconds for demo purposes
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // No fallback notifications - show empty state instead of mock data

  const handleMarkAllRead = () => {
    if (!user || !currentTenant) return;
    markAllAsRead(user.id, currentTenant.id);
    setNotificationCount(0);
    loadNotifications();
    toast.success(isSpanish ? 'Todas las notificaciones marcadas como leídas' : 'All notifications marked as read');
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
      loadNotifications();
    }
    // Navigation would happen via linkTo
  };

  // Format relative time for notifications
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return isSpanish ? 'Ahora' : 'Just now';
    if (diffMins < 60) return isSpanish ? `Hace ${diffMins} min` : `${diffMins}m ago`;
    if (diffHours < 24) return isSpanish ? `Hace ${diffHours}h` : `${diffHours}h ago`;
    if (diffDays < 7) return isSpanish ? `Hace ${diffDays}d` : `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Build breadcrumb segments from current pathname
  const breadcrumbs = useMemo(() => {
    if (!pathname || pathname === '/') {
      return [{ label: isSpanish ? 'Inicio' : 'Home', isHome: true }];
    }

    const segments: Array<{ label: string; isHome?: boolean }> = [];

    // Check workspace config for matching route
    for (const workspace of Object.values(WORKSPACES)) {
      const wsId = workspace.id as WorkspaceId;
      if (!pathname.startsWith(`/${wsId}`)) continue;

      // Add workspace
      segments.push({ label: isSpanish ? workspace.labelEs : workspace.label });

      // Find matching section and route
      for (const section of workspace.sections) {
        for (const route of section.routes) {
          if (pathname === route.path || pathname.startsWith(route.path + '/')) {
            // Add section if different from workspace
            if (section.label !== workspace.label) {
              segments.push({ label: isSpanish ? section.labelEs : section.label });
            }
            // Add page
            segments.push({ label: isSpanish ? route.labelEs : route.label });
            return segments;
          }
        }
      }

      // Workspace root (e.g. /operate with no deeper match)
      return segments;
    }

    // Financial module or other non-workspace routes
    if (pathname.startsWith('/financial')) {
      segments.push({ label: isSpanish ? 'Financiero' : 'Financial' });
      const sub = pathname.split('/')[2];
      if (sub) {
        const labels: Record<string, { en: string; es: string }> = {
          performance: { en: 'Location Benchmarks', es: 'Benchmarks de Ubicación' },
          timeline: { en: 'Revenue Timeline', es: 'Línea de Tiempo de Ingresos' },
          staff: { en: 'Staff Performance', es: 'Rendimiento del Personal' },
          leakage: { en: 'Leakage Monitor', es: 'Monitor de Fugas' },
        };
        if (labels[sub]) {
          segments.push({ label: isSpanish ? labels[sub].es : labels[sub].en });
        }
      }
      return segments;
    }

    // Fallback: capitalize path segments
    const parts = pathname.split('/').filter(Boolean);
    for (const part of parts) {
      segments.push({ label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ') });
    }
    return segments;
  }, [pathname, isSpanish]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-black/30 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Left Section - Mobile Menu + Logo (visible only on mobile) */}
        <div className="flex items-center gap-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuToggle}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
          <span className="text-lg font-semibold text-zinc-100">
            ViaLuce
          </span>
        </div>

        {/* Left Section - Breadcrumbs (desktop only) */}
        <nav className="hidden md:flex items-center gap-1 text-sm min-w-0 shrink-0" aria-label="Breadcrumb">
          {currentTenant && (
            <>
              <span className="text-zinc-500 truncate max-w-[120px]" title={currentTenant.name}>
                {currentTenant.name}
              </span>
              {breadcrumbs.length > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
              )}
            </>
          )}
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
              {crumb.isHome && <Home className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
              <span
                className={
                  i === breadcrumbs.length - 1
                    ? 'text-zinc-200 font-medium truncate max-w-[180px]'
                    : 'text-zinc-500 truncate max-w-[120px]'
                }
                title={crumb.label}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        {/* Status Chip — period name + lifecycle state + queue count */}
        {currentTenant && (
          <div className="hidden md:flex items-center gap-1.5 ml-3 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50 text-[11px]">
              <Activity className="h-3 w-3 text-emerald-400" />
              {activePeriodLabel && (
                <span className="text-zinc-300 font-medium">{activePeriodLabel}</span>
              )}
              {activePeriod?.lifecycleState && (
                <span className="text-zinc-500">{activePeriod.lifecycleState}</span>
              )}
              {!activePeriodLabel && cycleState && (
                <span className="text-zinc-400">{cycleState.currentPhase}</span>
              )}
              {pendingCount > 0 && (
                <span className="flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-medium">
                  {pendingCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Center - Search Bar */}
        <div className="hidden flex-1 max-w-xl mx-auto md:flex px-4">
          <GlobalSearch />
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile Search */}
          <Button variant="ghost" size="icon" className="md:hidden">
            <Search className="h-5 w-5" />
          </Button>

          {/* Help */}
          <Button variant="ghost" size="icon" className="hidden md:flex" onClick={() => setIsHelpOpen(true)}>
            <HelpCircle className="h-5 w-5 text-zinc-500" />
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-zinc-500" />
                {notificationCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {notificationCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                {isSpanish ? 'Notificaciones' : 'Notifications'}
                <Button variant="ghost" size="sm" className="text-xs" onClick={handleMarkAllRead}>
                  {isSpanish ? 'Marcar todas leídas' : 'Mark all read'}
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className={`flex flex-col items-start gap-1 py-3 cursor-pointer ${!notification.read ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <span className={`font-medium ${NOTIFICATION_TYPE_COLORS[notification.type]}`}>
                      {isSpanish && notification.titleEs ? notification.titleEs : notification.title}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {isSpanish && notification.messageEs ? notification.messageEs : notification.message}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-4 py-6 text-center">
                  <Bell className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">
                    {isSpanish ? 'Sin notificaciones' : 'No notifications'}
                  </p>
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center text-sm text-sky-600 cursor-pointer">
                {isSpanish ? 'Ver todas las notificaciones' : 'View all notifications'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Tenant Switcher (VL Admin only) */}
          <TenantSwitcher />

          {/* Settings - Hidden on desktop as Rail has user menu */}
          <Button variant="ghost" size="icon" className="hidden md:flex">
            <Settings className="h-5 w-5 text-zinc-500" />
          </Button>

          {/* User Menu - Only show on mobile since Rail has UserIdentity on desktop */}
          <div className="md:hidden">
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Help Dialog */}
      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              {isSpanish ? 'Centro de Ayuda' : 'Help Center'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? '¿Necesitas ayuda? Elige una opción a continuación.'
                : 'Need assistance? Choose an option below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => {
              toast.info(isSpanish ? 'Abriendo documentación...' : 'Opening documentation...');
              setIsHelpOpen(false);
            }}>
              <ExternalLink className="h-4 w-4" />
              {isSpanish ? 'Ver Documentación' : 'View Documentation'}
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => {
              toast.success(isSpanish ? 'Ticket de soporte creado' : 'Support ticket created');
              setIsHelpOpen(false);
            }}>
              <MessageSquare className="h-4 w-4" />
              {isSpanish ? 'Contactar Soporte' : 'Contact Support'}
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" onClick={() => {
              toast.info(isSpanish ? 'Abriendo correo...' : 'Opening email...');
              setIsHelpOpen(false);
            }}>
              <Mail className="h-4 w-4" />
              {isSpanish ? 'Enviar Correo' : 'Send Email'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
