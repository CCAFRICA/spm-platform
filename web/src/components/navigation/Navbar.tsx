"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { UserMenu } from "@/components/layout/user-menu";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { GlobalSearch } from "@/components/search/global-search";
import { useTenant } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
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
  const isSpanish = locale === 'es-MX';
  const isHospitality = currentTenant?.industry === 'Hospitality';
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

  // Fallback notifications when no real ones exist
  const fallbackNotifications = isHospitality ? [
    {
      type: isSpanish ? 'Propina' : 'Tip',
      color: 'text-emerald-600',
      message: isSpanish ? 'Propina acumulada del turno: $697.50' : 'Shift accumulated tips: $697.50',
      time: isSpanish ? 'Hoy' : 'Today',
    },
    {
      type: isSpanish ? 'Logro' : 'Achievement',
      color: 'text-amber-600',
      message: isSpanish ? 'Mejor vendedor del turno matutino' : 'Top seller of the morning shift',
      time: isSpanish ? 'Ayer' : 'Yesterday',
    },
    {
      type: isSpanish ? 'Sistema' : 'System',
      color: 'text-blue-600',
      message: isSpanish ? 'Nuevos cheques importados' : 'New checks imported',
      time: isSpanish ? 'Hace 2 días' : '2 days ago',
    },
  ] : [
    {
      type: 'Budget Alert',
      color: 'text-amber-600',
      message: 'West Region exceeded 90% of Q4 budget',
      time: '2 hours ago',
    },
    {
      type: 'Achievement',
      color: 'text-emerald-600',
      message: 'Sarah Chen hit 150% quota attainment',
      time: '5 hours ago',
    },
    {
      type: 'System',
      color: 'text-blue-600',
      message: 'Monthly data sync completed',
      time: '1 day ago',
    },
  ];

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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-slate-800 dark:bg-slate-950/95">
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
          <span className="text-lg font-semibold text-navy-900 dark:text-slate-50">
            Entity B
          </span>
        </div>

        {/* Center - Search Bar */}
        <div className="hidden flex-1 max-w-xl mx-auto md:flex">
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
            <HelpCircle className="h-5 w-5 text-slate-500" />
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-slate-500" />
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
                    <span className="text-xs text-slate-500">
                      {isSpanish && notification.messageEs ? notification.messageEs : notification.message}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                fallbackNotifications.map((notification, index) => (
                  <DropdownMenuItem key={index} className="flex flex-col items-start gap-1 py-3 cursor-pointer">
                    <span className={`font-medium ${notification.color}`}>{notification.type}</span>
                    <span className="text-xs text-slate-500">
                      {notification.message}
                    </span>
                    <span className="text-xs text-slate-400">{notification.time}</span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center text-sm text-sky-600 cursor-pointer">
                {isSpanish ? 'Ver todas las notificaciones' : 'View all notifications'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Tenant Switcher (CC Admin only) */}
          <TenantSwitcher />

          {/* Settings - Hidden on desktop as Rail has user menu */}
          <Button variant="ghost" size="icon" className="hidden md:flex">
            <Settings className="h-5 w-5 text-slate-500" />
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
