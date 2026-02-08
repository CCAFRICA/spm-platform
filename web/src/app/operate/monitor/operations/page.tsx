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
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Server,
  Database,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';

export default function DailyOperationsPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const systemStatus: Array<{
    key: string;
    status: string;
    detail: string;
  }> = [
    { key: 'api', status: 'healthy', detail: 'Latency: 45ms' },
    { key: 'database', status: 'healthy', detail: 'Connections: 12' },
    { key: 'queue', status: 'healthy', detail: 'Pending: 3' },
    { key: 'cache', status: 'healthy', detail: 'Hit Rate: 94%' },
  ];

  const recentJobs = [
    { name: 'Data Import - TechCorp', status: 'completed', time: '5 min ago' },
    { name: 'Calculation Batch #127', status: 'completed', time: '12 min ago' },
    { name: 'Report Generation', status: 'running', time: '2 min' },
    { name: 'Email Notifications', status: 'pending', time: 'Scheduled' },
  ];

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

      {/* System Status */}
      <div className="grid grid-cols-4 gap-4">
        {systemStatus.map((item) => (
          <Card key={item.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.key === 'api' && <Server className="h-4 w-4 text-slate-500" />}
                  {item.key === 'database' && <Database className="h-4 w-4 text-slate-500" />}
                  {item.key === 'queue' && <Clock className="h-4 w-4 text-slate-500" />}
                  {item.key === 'cache' && <Zap className="h-4 w-4 text-slate-500" />}
                  <span className="text-sm font-medium capitalize">{item.key}</span>
                </div>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {isSpanish ? 'Activo' : 'Healthy'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Feed */}
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
          <div className="space-y-3">
            {recentJobs.map((job, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  {job.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {job.status === 'running' && <Activity className="h-4 w-4 text-blue-600 animate-pulse" />}
                  {job.status === 'pending' && <Clock className="h-4 w-4 text-slate-400" />}
                  <span className="font-medium text-sm">{job.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{job.time}</span>
                  <Badge variant={job.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                    {job.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
