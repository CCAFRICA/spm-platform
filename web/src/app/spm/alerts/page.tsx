'use client';

import { useState } from 'react';
import { Bell, Plus, Trash2, Save, Edit, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenant, useCurrency } from '@/contexts/tenant-context';

interface AlertRule {
  id: string;
  name: string;
  type: 'under_target' | 'exceptional' | 'financial';
  metric: string;
  operator: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  recipients?: string[];
}

const operatorLabels: Record<string, Record<string, string>> = {
  en: { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=' },
  es: { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=' },
};

const metricLabels: Record<string, Record<string, string>> = {
  en: {
    quota_attainment: 'Quota Attainment',
    revenue: 'Revenue',
    commission: 'Commission',
    tips: 'Tips',
    sales_count: 'Sales Count',
    avg_ticket: 'Average Ticket',
  },
  es: {
    quota_attainment: 'Cumplimiento de Meta',
    revenue: 'Ingresos',
    commission: 'Comisión',
    tips: 'Propinas',
    sales_count: 'Número de Ventas',
    avg_ticket: 'Ticket Promedio',
  },
};

export default function AlertsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const isSpanish = currentTenant?.locale === 'es-MX';
  const lang = isSpanish ? 'es' : 'en';

  const [alerts, setAlerts] = useState<AlertRule[]>([
    { id: '1', name: isSpanish ? 'Riesgo de incumplimiento' : 'At-risk performance', type: 'under_target', metric: 'quota_attainment', operator: 'lt', threshold: 75, severity: 'warning', enabled: true, recipients: ['manager@restaurantmx.com'] },
    { id: '2', name: isSpanish ? 'Rendimiento excepcional' : 'Exceptional performance', type: 'exceptional', metric: 'quota_attainment', operator: 'gte', threshold: 120, severity: 'info', enabled: true },
    { id: '3', name: isSpanish ? 'Exposición financiera' : 'Financial exposure', type: 'financial', metric: 'commission', operator: 'gt', threshold: 150000, severity: 'critical', enabled: false },
    { id: '4', name: isSpanish ? 'Propinas bajas' : 'Low tips', type: 'under_target', metric: 'tips', operator: 'lt', threshold: 500, severity: 'warning', enabled: true },
    { id: '5', name: isSpanish ? 'Ventas altas' : 'High sales', type: 'exceptional', metric: 'revenue', operator: 'gte', threshold: 100000, severity: 'info', enabled: false },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    metric: 'quota_attainment',
    operator: 'lt',
    threshold: '',
    severity: 'warning' as 'info' | 'warning' | 'critical',
    recipients: '',
  });

  const severityColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    warning: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    critical: 'bg-red-100 text-red-800 hover:bg-red-100',
  };

  const severityLabels: Record<string, Record<string, string>> = {
    en: { info: 'Info', warning: 'Warning', critical: 'Critical' },
    es: { info: 'Info', warning: 'Advertencia', critical: 'Crítico' },
  };

  const typeLabels: Record<string, Record<string, string>> = {
    en: { under_target: 'Under Target', exceptional: 'Exceptional', financial: 'Financial' },
    es: { under_target: 'Bajo Meta', exceptional: 'Excepcional', financial: 'Financiero' },
  };

  const openCreateForm = () => {
    setEditingAlert(null);
    setFormData({ name: '', metric: 'quota_attainment', operator: 'lt', threshold: '', severity: 'warning', recipients: '' });
    setShowForm(true);
  };

  const openEditForm = (alert: AlertRule) => {
    setEditingAlert(alert);
    setFormData({
      name: alert.name,
      metric: alert.metric,
      operator: alert.operator,
      threshold: alert.threshold.toString(),
      severity: alert.severity,
      recipients: alert.recipients?.join(', ') || '',
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const threshold = parseFloat(formData.threshold) || 0;
    const recipients = formData.recipients ? formData.recipients.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    if (editingAlert) {
      setAlerts(alerts.map(a =>
        a.id === editingAlert.id
          ? { ...a, name: formData.name, metric: formData.metric, operator: formData.operator, threshold, severity: formData.severity, recipients }
          : a
      ));
    } else {
      const newAlert: AlertRule = {
        id: `new-${Date.now()}`,
        name: formData.name,
        type: 'under_target',
        metric: formData.metric,
        operator: formData.operator,
        threshold,
        severity: formData.severity,
        enabled: true,
        recipients,
      };
      setAlerts([...alerts, newAlert]);
    }
    setShowForm(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  const handleDelete = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const toggleEnabled = (id: string, enabled: boolean) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, enabled } : a));
  };

  const formatThreshold = (metric: string, threshold: number) => {
    if (metric === 'quota_attainment') {
      return `${threshold}%`;
    }
    if (['revenue', 'commission', 'tips', 'avg_ticket'].includes(metric)) {
      return format(threshold);
    }
    return threshold.toString();
  };

  const activeCount = alerts.filter(a => a.enabled).length;
  const criticalCount = alerts.filter(a => a.enabled && a.severity === 'critical').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            {isSpanish ? 'Alertas Automatizadas' : 'Automated Alerts'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Configura alertas basadas en métricas de rendimiento' : 'Configure alerts based on performance metrics'}
          </p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? 'Nueva Alerta' : 'New Alert'}
        </Button>
      </div>

      {/* Success message */}
      {showSaved && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">
                {isSpanish ? 'Alerta guardada exitosamente' : 'Alert saved successfully'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alerts.length}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Total de alertas' : 'Total alerts'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Alertas activas' : 'Active alerts'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Bell className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{criticalCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Alertas críticas' : 'Critical alerts'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {alerts.map(alert => (
          <Card key={alert.id} className={!alert.enabled ? 'opacity-60' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={alert.enabled}
                    onCheckedChange={(v) => toggleEnabled(alert.id, v)}
                  />
                  <div>
                    <p className="font-medium">{alert.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {metricLabels[lang][alert.metric]} {operatorLabels[lang][alert.operator]} {formatThreshold(alert.metric, alert.threshold)}
                    </p>
                    {alert.recipients && alert.recipients.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {isSpanish ? 'Destinatarios:' : 'Recipients:'} {alert.recipients.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{typeLabels[lang][alert.type]}</Badge>
                  <Badge className={severityColors[alert.severity]}>
                    {severityLabels[lang][alert.severity]}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => openEditForm(alert)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(alert.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Alert Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAlert
                ? (isSpanish ? 'Editar Alerta' : 'Edit Alert')
                : (isSpanish ? 'Configurar Alerta' : 'Configure Alert')}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Define las condiciones para esta alerta' : 'Define the conditions for this alert'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isSpanish ? 'Nombre de la alerta' : 'Alert name'}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isSpanish ? 'Nombre descriptivo' : 'Descriptive name'}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Métrica' : 'Metric'}</Label>
                <Select value={formData.metric} onValueChange={(v) => setFormData({ ...formData, metric: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quota_attainment">{metricLabels[lang].quota_attainment}</SelectItem>
                    <SelectItem value="revenue">{metricLabels[lang].revenue}</SelectItem>
                    <SelectItem value="commission">{metricLabels[lang].commission}</SelectItem>
                    <SelectItem value="tips">{metricLabels[lang].tips}</SelectItem>
                    <SelectItem value="sales_count">{metricLabels[lang].sales_count}</SelectItem>
                    <SelectItem value="avg_ticket">{metricLabels[lang].avg_ticket}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Operador' : 'Operator'}</Label>
                <Select value={formData.operator} onValueChange={(v) => setFormData({ ...formData, operator: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">&gt; {isSpanish ? 'Mayor que' : 'Greater than'}</SelectItem>
                    <SelectItem value="lt">&lt; {isSpanish ? 'Menor que' : 'Less than'}</SelectItem>
                    <SelectItem value="gte">≥ {isSpanish ? 'Mayor o igual' : 'Greater or equal'}</SelectItem>
                    <SelectItem value="lte">≤ {isSpanish ? 'Menor o igual' : 'Less or equal'}</SelectItem>
                    <SelectItem value="eq">= {isSpanish ? 'Igual a' : 'Equal to'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Umbral' : 'Threshold'}</Label>
                <Input
                  type="number"
                  value={formData.threshold}
                  onChange={(e) => setFormData({ ...formData, threshold: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isSpanish ? 'Severidad' : 'Severity'}</Label>
              <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v as 'info' | 'warning' | 'critical' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">{severityLabels[lang].info}</SelectItem>
                  <SelectItem value="warning">{severityLabels[lang].warning}</SelectItem>
                  <SelectItem value="critical">{severityLabels[lang].critical}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isSpanish ? 'Destinatarios (opcional)' : 'Recipients (optional)'}</Label>
              <Input
                value={formData.recipients}
                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
              />
              <p className="text-xs text-muted-foreground">
                {isSpanish ? 'Separa múltiples emails con comas' : 'Separate multiple emails with commas'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
