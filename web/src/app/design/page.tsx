'use client';

/**
 * Design Workspace Landing Page
 *
 * The plan design and modeling center.
 * Create and modify compensation plans, run scenarios, manage budgets.
 */

import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
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
} from 'lucide-react';

export default function DesignPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const designTools = [
    {
      icon: FileText,
      label: isSpanish ? 'Gestión de Planes' : 'Plan Management',
      description: isSpanish
        ? 'Ver y editar planes de compensación existentes'
        : 'View and edit existing compensation plans',
      route: '/design/plans',
      color: 'purple',
      badge: '12 Active',
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

  // Mock recent activity
  const recentActivity = [
    {
      action: isSpanish ? 'Plan actualizado' : 'Plan updated',
      plan: 'Enterprise Sales Q1 2024',
      time: '2 hours ago',
      user: 'Admin User',
    },
    {
      action: isSpanish ? 'Nuevo SPIF creado' : 'New SPIF created',
      plan: 'March Accelerator',
      time: '5 hours ago',
      user: 'Admin User',
    },
    {
      action: isSpanish ? 'Cuotas ajustadas' : 'Quotas adjusted',
      plan: 'SMB Team Goals',
      time: '1 day ago',
      user: 'Manager',
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
