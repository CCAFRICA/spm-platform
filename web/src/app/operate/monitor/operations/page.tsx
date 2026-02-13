'use client';

/**
 * Operate > Monitor > Daily Operations
 *
 * Real-time view of system operations and processing status.
 */

import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  Server,
  Database,
  Clock,
  Zap,
} from 'lucide-react';

export default function DailyOperationsPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isSpanish ? 'Operaciones Diarias' : 'Daily Operations'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSpanish
            ? 'Estado del sistema y actividad en tiempo real'
            : 'Real-time system status and activity'}
        </p>
      </div>

      {/* System Status - Empty State */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { key: 'api', icon: Server, label: 'API' },
          { key: 'database', icon: Database, label: isSpanish ? 'Base de Datos' : 'Database' },
          { key: 'queue', icon: Clock, label: isSpanish ? 'Cola' : 'Queue' },
          { key: 'cache', icon: Zap, label: 'Cache' },
        ].map((item) => (
          <Card key={item.key}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <item.icon className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">{item.label}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {isSpanish ? 'Sin conexion configurada' : 'No connection configured'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Feed - Empty State */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            {isSpanish ? 'Actividad Reciente' : 'Recent Activity'}
          </CardTitle>
          <CardDescription>
            {isSpanish ? 'Trabajos y procesos del sistema' : 'System jobs and processes'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">
              {isSpanish ? 'Sin actividad reciente' : 'No recent activity'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isSpanish
                ? 'Los trabajos automatizados aparecerán aquí cuando se configuren las integraciones'
                : 'Automated jobs will appear here once integrations are configured'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
