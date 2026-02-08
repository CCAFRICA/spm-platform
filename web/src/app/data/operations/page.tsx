'use client';

import { useState } from 'react';
import {
  Activity,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Calendar,
  FileText,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

interface DailyJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  lastRun: string | null;
  nextRun: string;
  status: 'success' | 'running' | 'failed' | 'pending';
  duration?: string;
  recordsProcessed?: number;
}

// No mock data - jobs will be loaded from backend when available
// Empty array shows proper empty state to user
const initialJobs: DailyJob[] = [];

export default function DailyOperationsPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : (currentTenant?.locale === 'es-MX');

  const [jobs, setJobs] = useState<DailyJob[]>(initialJobs);

  const getStatusBadge = (status: string) => {
    const configs = {
      success: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: isSpanish ? 'Exitoso' : 'Success' },
      running: { color: 'bg-blue-100 text-blue-800', icon: RefreshCw, label: isSpanish ? 'Ejecutando' : 'Running' },
      failed: { color: 'bg-red-100 text-red-800', icon: XCircle, label: isSpanish ? 'Fallido' : 'Failed' },
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: isSpanish ? 'Pendiente' : 'Pending' },
    };
    const config = configs[status as keyof typeof configs];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} hover:${config.color}`}>
        <Icon className={`h-3 w-3 mr-1 ${status === 'running' ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>
    );
  };

  const successCount = jobs.filter(j => j.status === 'success').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const runningCount = jobs.filter(j => j.status === 'running').length;

  const handleRetry = (jobId: string) => {
    setJobs(jobs.map(j => j.id === jobId ? { ...j, status: 'running' as const } : j));
    // Simulate job completion
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success' as const, lastRun: new Date().toISOString() } : j));
    }, 3000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {isSpanish ? 'Operaciones Diarias' : 'Daily Operations'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Monitorea y gestiona los trabajos programados' : 'Monitor and manage scheduled jobs'}
          </p>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          {isSpanish ? 'Actualizar' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{jobs.length}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Total de trabajos' : 'Total jobs'}</p>
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
                <p className="text-2xl font-bold">{successCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Exitosos' : 'Successful'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <RefreshCw className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{runningCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'En ejecución' : 'Running'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{failedCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Fallidos' : 'Failed'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {isSpanish ? 'Trabajos Programados' : 'Scheduled Jobs'}
          </CardTitle>
          <CardDescription>
            {isSpanish ? 'Estado de los trabajos del día' : 'Status of today\'s jobs'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">
                {isSpanish ? 'No hay trabajos programados' : 'No Scheduled Jobs'}
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                {isSpanish
                  ? 'Los trabajos automatizados aparecerán aquí una vez que se configuren las integraciones de datos y los flujos de cálculo.'
                  : 'Automated jobs will appear here once data integrations and calculation workflows are configured.'}
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" asChild>
                  <a href="/data/import/enhanced">
                    <Database className="h-4 w-4 mr-2" />
                    {isSpanish ? 'Importar Datos' : 'Import Data'}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/integrations/catalog">
                    {isSpanish ? 'Ver Integraciones' : 'View Integrations'}
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Trabajo' : 'Job'}</TableHead>
                  <TableHead>{isSpanish ? 'Horario' : 'Schedule'}</TableHead>
                  <TableHead>{isSpanish ? 'Última Ejecución' : 'Last Run'}</TableHead>
                  <TableHead>{isSpanish ? 'Duración' : 'Duration'}</TableHead>
                  <TableHead>{isSpanish ? 'Registros' : 'Records'}</TableHead>
                  <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                  <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{job.name}</p>
                        <p className="text-sm text-muted-foreground">{job.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {job.schedule}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{job.lastRun || '-'}</TableCell>
                    <TableCell>{job.duration || '-'}</TableCell>
                    <TableCell>
                      {job.recordsProcessed !== undefined ? (
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {job.recordsProcessed.toLocaleString()}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="text-right">
                      {job.status === 'failed' && (
                        <Button variant="outline" size="sm" onClick={() => handleRetry(job.id)}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          {isSpanish ? 'Reintentar' : 'Retry'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
