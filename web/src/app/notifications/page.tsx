'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  Bell,
  CheckCheck,
  Trash2,
  Settings,
  Mail,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Info,
  FileText,
  DollarSign,
  Target,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  initializeNotifications,
} from '@/lib/notifications/notification-service';
import {
  getUserPreferences,
  updateUserPreferences,
  updateTriggerPreference,
  initializeAlerts,
} from '@/lib/alerts/alert-service';
import type { Notification } from '@/types/notification';
import type { UserAlertPreferences, AlertTrigger } from '@/types/alert';
import { ALERT_TRIGGERS, ALERT_CHANNELS } from '@/types/alert';

const TRIGGER_ICONS: Record<AlertTrigger, React.ElementType> = {
  quota_attainment: Target,
  payout_ready: DollarSign,
  dispute_status: AlertTriangle,
  plan_change: FileText,
  approval_required: CheckCircle,
  data_quality: AlertTriangle,
  goal_progress: Target,
  team_performance: Users,
  custom: Bell,
};

export default function NotificationsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX' || currentTenant?.locale === 'es-MX';
  const tenantId = currentTenant?.id || 'retailco';
  const userId = user?.id || 'user-1';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<UserAlertPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    try {
      initializeNotifications();
      initializeAlerts();

      const notifs = getNotifications(userId, tenantId);
      const prefs = getUserPreferences(userId, tenantId);

      setNotifications(notifs);
      setPreferences(prefs);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error(isSpanish ? 'Error al cargar' : 'Error loading');
    } finally {
      setIsLoading(false);
    }
  }, [userId, tenantId, isSpanish]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMarkAsRead = (notificationId: string) => {
    markAsRead(notificationId);
    loadData();
  };

  const handleMarkAllAsRead = () => {
    const count = markAllAsRead(userId, tenantId);
    if (count > 0) {
      toast.success(
        isSpanish
          ? `${count} notificaciones marcadas como le\u00eddas`
          : `${count} notifications marked as read`
      );
    }
    loadData();
  };

  const handleDelete = (notificationId: string) => {
    deleteNotification(notificationId);
    toast.success(isSpanish ? 'Notificaci\u00f3n eliminada' : 'Notification deleted');
    loadData();
  };

  const handleClearAll = () => {
    const count = clearNotifications(userId, tenantId);
    if (count > 0) {
      toast.success(
        isSpanish
          ? `${count} notificaciones eliminadas`
          : `${count} notifications cleared`
      );
    }
    loadData();
  };

  const handleToggleGlobal = (enabled: boolean) => {
    updateUserPreferences(userId, tenantId, { globalEnabled: enabled });
    loadData();
    toast.success(
      enabled
        ? isSpanish
          ? 'Notificaciones activadas'
          : 'Notifications enabled'
        : isSpanish
          ? 'Notificaciones desactivadas'
          : 'Notifications disabled'
    );
  };

  const handleToggleChannel = (channel: keyof UserAlertPreferences['channels'], enabled: boolean) => {
    if (!preferences) return;
    updateUserPreferences(userId, tenantId, {
      channels: { ...preferences.channels, [channel]: enabled },
    });
    loadData();
  };

  const handleToggleTrigger = (trigger: AlertTrigger, enabled: boolean) => {
    updateTriggerPreference(userId, tenantId, trigger, { enabled });
    loadData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return isSpanish ? 'Ahora' : 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getPriorityIcon = (priority: Notification['priority']) => {
    switch (priority) {
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'low':
        return <Info className="h-4 w-4 text-gray-400" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando notificaciones...' : 'Loading notifications...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            {isSpanish ? 'Centro de Notificaciones' : 'Notification Center'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Gestiona tus notificaciones y preferencias de alerta'
              : 'Manage your notifications and alert preferences'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            {isSpanish ? 'Marcar todo como le\u00eddo' : 'Mark all as read'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="notifications">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            {isSpanish ? 'Notificaciones' : 'Notifications'}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            {isSpanish ? 'Preferencias' : 'Preferences'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Notification List */}
            <div className="lg:col-span-2 space-y-3">
              {notifications.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-medium mb-2">
                      {isSpanish ? 'No hay notificaciones' : 'No notifications'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isSpanish
                        ? 'Tus notificaciones aparecer\u00e1n aqu\u00ed'
                        : 'Your notifications will appear here'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                notifications.map((notification) => (
                  <Card
                    key={notification.id}
                    className={cn(
                      'transition-all hover:shadow-md cursor-pointer',
                      !notification.read && 'border-l-4 border-l-primary bg-primary/5'
                    )}
                    onClick={() => handleMarkAsRead(notification.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getPriorityIcon(notification.priority)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-medium truncate">
                              {isSpanish && notification.titleEs
                                ? notification.titleEs
                                : notification.title}
                            </h4>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDate(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {isSpanish && notification.messageEs
                              ? notification.messageEs
                              : notification.message}
                          </p>
                          {notification.linkTo && (
                            <a
                              href={notification.linkTo}
                              className="text-sm text-primary hover:underline mt-2 inline-block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isSpanish ? 'Ver detalles \u2192' : 'View details \u2192'}
                            </a>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {notifications.length > 0 && (
                <div className="text-center pt-4">
                  <Button variant="outline" onClick={handleClearAll}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isSpanish ? 'Limpiar todo' : 'Clear all'}
                  </Button>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {isSpanish ? 'Resumen' : 'Summary'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {isSpanish ? 'Total' : 'Total'}
                    </span>
                    <Badge variant="secondary">{notifications.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {isSpanish ? 'Sin leer' : 'Unread'}
                    </span>
                    <Badge variant="destructive">{unreadCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {isSpanish ? 'Le\u00eddas' : 'Read'}
                    </span>
                    <Badge variant="outline">{notifications.length - unreadCount}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="mt-6">
          {preferences && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Global Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {isSpanish ? 'Configuraci\u00f3n Global' : 'Global Settings'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish
                      ? 'Controla todas las notificaciones'
                      : 'Control all notifications'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">
                        {isSpanish ? 'Notificaciones Activadas' : 'Notifications Enabled'}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish
                          ? 'Activa o desactiva todas las notificaciones'
                          : 'Turn all notifications on or off'}
                      </p>
                    </div>
                    <Switch
                      checked={preferences.globalEnabled}
                      onCheckedChange={handleToggleGlobal}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">
                        {isSpanish ? 'Horario Silencioso' : 'Quiet Hours'}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish
                          ? 'Sin notificaciones durante horas espec\u00edficas'
                          : 'No notifications during specific hours'}
                      </p>
                    </div>
                    <Switch
                      checked={preferences.quietHoursEnabled}
                      onCheckedChange={(checked) =>
                        updateUserPreferences(userId, tenantId, { quietHoursEnabled: checked })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Channels */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {isSpanish ? 'Canales de Entrega' : 'Delivery Channels'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish
                      ? 'C\u00f3mo deseas recibir notificaciones'
                      : 'How you want to receive notifications'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(ALERT_CHANNELS).map(([key, config]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {key === 'in_app' && <Bell className="h-4 w-4" />}
                        {key === 'email' && <Mail className="h-4 w-4" />}
                        {key === 'sms' && <MessageSquare className="h-4 w-4" />}
                        {key === 'push' && <Bell className="h-4 w-4" />}
                        <div>
                          <Label className="font-medium">
                            {isSpanish ? config.nameEs : config.name}
                          </Label>
                          {!config.available && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {isSpanish ? 'Pr\u00f3ximamente' : 'Coming soon'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={preferences.channels[key as keyof typeof preferences.channels]}
                        onCheckedChange={(checked) =>
                          handleToggleChannel(key as keyof typeof preferences.channels, checked)
                        }
                        disabled={!config.available}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Alert Types */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {isSpanish ? 'Tipos de Alerta' : 'Alert Types'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish
                      ? 'Configura qu\u00e9 alertas deseas recibir'
                      : 'Configure which alerts you want to receive'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {Object.entries(ALERT_TRIGGERS).map(([key, config]) => {
                      const trigger = key as AlertTrigger;
                      const TriggerIcon = TRIGGER_ICONS[trigger];
                      const pref = preferences.triggerPreferences[trigger];

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-lg">
                              <TriggerIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <Label className="font-medium">
                                {isSpanish ? config.nameEs : config.name}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {isSpanish ? config.descriptionEs : config.description}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={pref?.enabled ?? true}
                            onCheckedChange={(checked) => handleToggleTrigger(trigger, checked)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
