'use client';

/**
 * Design Workspace Landing Page
 *
 * The plan design and modeling center.
 * Create and modify compensation plans, run scenarios, manage budgets.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { getPlans, getPlanChanges } from '@/lib/compensation/plan-storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  PlusCircle,
  Sparkles,
  Target,
  FlaskConical,
  Wallet,
  ArrowRight,
  Clock,
  Inbox,
} from 'lucide-react';

export default function DesignPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [activePlanCount, setActivePlanCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<Array<{
    action: string;
    plan: string;
    time: string;
    user: string;
  }>>([]);

  // Load real plan data
  useEffect(() => {
    if (!currentTenant?.id) return;

    // Helper to format time ago (inline to avoid dependency issues)
    function formatTimeAgo(date: Date): string {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 60) return `${diffMins} minutes ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return '1 day ago';
      return `${diffDays} days ago`;
    }

    const plans = getPlans(currentTenant.id);
    const activeCount = plans.filter(p => p.status === 'active').length;
    setActivePlanCount(activeCount);

    // Get recent changes for this tenant's plans
    const planIds = plans.map(p => p.id);
    const allChanges = planIds.flatMap(id => getPlanChanges(id));
    const sortedChanges = allChanges
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
      .slice(0, 5);

    const activity = sortedChanges.map(change => {
      const plan = plans.find(p => p.id === change.planId);
      const timeAgo = formatTimeAgo(new Date(change.changedAt));
      return {
        action: change.changeType === 'status_changed' ? 'Status changed' :
                change.changeType === 'modified' ? 'Plan modified' :
                change.changeType === 'approved' ? 'Plan approved' :
                'Plan updated',
        plan: plan?.name || 'Unknown Plan',
        time: timeAgo,
        user: change.changedBy || 'System',
      };
    });

    setRecentActivity(activity);
  }, [currentTenant?.id]);

  const isSpanish = currentTenant?.locale === 'es-MX';

  const designTools = [
    {
      icon: FileText,
      label: isSpanish ? 'Gestión de Planes' : 'Plan Management',
      description: isSpanish
        ? 'Ver y editar planes de compensación existentes'
        : 'View and edit existing compensation plans',
      route: '/design/plans',
      color: 'purple',
      badge: activePlanCount > 0 ? `${activePlanCount} ${isSpanish ? 'Activos' : 'Active'}` : undefined,
    },
    {
      icon: PlusCircle,
      label: isSpanish ? 'Crear Nuevo Plan' : 'Create New Plan',
      description: isSpanish
        ? 'Diseñar un nuevo plan de compensación'
        : 'Design a new compensation plan',
      route: '/design/plans/new',
      color: 'green',
    },
    {
      icon: Sparkles,
      label: isSpanish ? 'Constructor de Incentivos' : 'Incentive Builder',
      description: isSpanish
        ? 'Crear SPIFs, bonos, y campañas'
        : 'Create SPIFs, bonuses, and campaigns',
      route: '/design/incentives',
      color: 'amber',
    },
    {
      icon: Target,
      label: isSpanish ? 'Establecer Metas' : 'Goal Setting',
      description: isSpanish
        ? 'Definir cuotas y objetivos'
        : 'Define quotas and targets',
      route: '/design/goals',
      color: 'blue',
    },
    {
      icon: FlaskConical,
      label: isSpanish ? 'Sandbox de Modelado' : 'Modeling Sandbox',
      description: isSpanish
        ? 'Probar cambios de plan antes de publicar'
        : 'Test plan changes before publishing',
      route: '/design/modeling',
      color: 'pink',
    },
    {
      icon: Wallet,
      label: isSpanish ? 'Planificación de Presupuesto' : 'Budget Planning',
      description: isSpanish
        ? 'Gestionar presupuestos de compensación'
        : 'Manage compensation budgets',
      route: '/design/budget',
      color: 'slate',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSpanish ? 'Centro de Diseño' : 'Design Center'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSpanish
              ? 'Crear y gestionar planes de compensación'
              : 'Create and manage compensation plans'}
          </p>
        </div>
        <Button onClick={() => router.push('/design/plans/new')}>
          <PlusCircle className="h-4 w-4 mr-2" />
          {isSpanish ? 'Nuevo Plan' : 'New Plan'}
        </Button>
      </div>

      {/* Design Tools Grid */}
      <div className="grid grid-cols-3 gap-4">
        {designTools.map((tool) => {
          const Icon = tool.icon;
          const colorClasses = {
            purple: 'bg-purple-100 text-purple-600',
            green: 'bg-green-100 text-green-600',
            amber: 'bg-amber-100 text-amber-600',
            blue: 'bg-blue-100 text-blue-600',
            pink: 'bg-pink-100 text-pink-600',
            slate: 'bg-slate-100 text-slate-600',
          };

          return (
            <Card
              key={tool.route}
              className="hover:border-slate-300 transition-colors cursor-pointer"
              onClick={() => router.push(tool.route)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${colorClasses[tool.color as keyof typeof colorClasses]}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {tool.badge && (
                    <Badge variant="secondary">{tool.badge}</Badge>
                  )}
                </div>
                <p className="font-medium text-slate-900">{tool.label}</p>
                <p className="text-sm text-slate-500 mt-1">{tool.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            {isSpanish ? 'Actividad Reciente' : 'Recent Activity'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900">{activity.action}</p>
                    <p className="text-sm text-slate-500">{activity.plan}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">{activity.time}</p>
                    <p className="text-xs text-slate-400">{activity.user}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">
                {isSpanish ? 'Sin actividad reciente' : 'No recent activity'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {isSpanish
                  ? 'Los cambios a los planes apareceran aqui'
                  : 'Plan changes will appear here'}
              </p>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => router.push('/investigate/audit')}
          >
            {isSpanish ? 'Ver Todo el Historial' : 'View Full History'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
