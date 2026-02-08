'use client';

/**
 * Govern Workspace Landing Page
 *
 * Governance, compliance, and oversight center.
 * Audit reports, data lineage, approval history, and access logs.
 */

import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileSearch,
  Download,
  GitBranch,
  CheckCircle,
  Route,
  GitCompare,
  BarChart,
  Key,
  Shield,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

export default function GovernPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const governSections = [
    {
      title: isSpanish ? 'Auditoría e Informes' : 'Audit & Reports',
      items: [
        {
          icon: FileSearch,
          label: isSpanish ? 'Informes de Auditoría' : 'Audit Reports',
          description: isSpanish ? 'Generar informes de cumplimiento' : 'Generate compliance reports',
          route: '/govern/audit-reports',
        },
        {
          icon: Download,
          label: isSpanish ? 'Descargar Informes' : 'Download Reports',
          description: isSpanish ? 'Exportar para revisión externa' : 'Export for external review',
          route: '/govern/audit-reports/download',
        },
      ],
    },
    {
      title: isSpanish ? 'Trazabilidad de Datos' : 'Data Traceability',
      items: [
        {
          icon: GitBranch,
          label: isSpanish ? 'Linaje de Datos' : 'Data Lineage',
          description: isSpanish ? 'Rastrear origen de datos' : 'Trace data origins',
          route: '/govern/data-lineage',
        },
        {
          icon: GitCompare,
          label: isSpanish ? 'Historial de Conciliación' : 'Reconciliation History',
          description: isSpanish ? 'Ver conciliaciones pasadas' : 'View past reconciliations',
          route: '/govern/reconciliation',
        },
        {
          icon: BarChart,
          label: isSpanish ? 'Informes de Varianza' : 'Variance Reports',
          description: isSpanish ? 'Analizar discrepancias' : 'Analyze discrepancies',
          route: '/govern/reconciliation/variances',
        },
      ],
    },
    {
      title: isSpanish ? 'Aprobaciones y Acceso' : 'Approvals & Access',
      items: [
        {
          icon: CheckCircle,
          label: isSpanish ? 'Historial de Aprobaciones' : 'Approval History',
          description: isSpanish ? 'Revisar decisiones pasadas' : 'Review past decisions',
          route: '/govern/approvals',
        },
        {
          icon: Route,
          label: isSpanish ? 'Auditoría de Enrutamiento' : 'Routing Audit',
          description: isSpanish ? 'Verificar rutas de aprobación' : 'Verify approval routes',
          route: '/govern/approvals/routing',
        },
        {
          icon: Key,
          label: isSpanish ? 'Registros de Acceso' : 'Access Logs',
          description: isSpanish ? 'Ver actividad de usuarios' : 'View user activity',
          route: '/govern/access',
        },
        {
          icon: Shield,
          label: isSpanish ? 'Auditoría de Permisos' : 'Permission Audit',
          description: isSpanish ? 'Revisar asignaciones de roles' : 'Review role assignments',
          route: '/govern/access/permissions',
        },
      ],
    },
  ];

  // Mock compliance status
  const complianceStatus = {
    overall: 'healthy',
    items: [
      { label: isSpanish ? 'Segregación de Funciones' : 'Segregation of Duties', status: 'pass' },
      { label: isSpanish ? 'Rastro de Auditoría' : 'Audit Trail', status: 'pass' },
      { label: isSpanish ? 'Retención de Datos' : 'Data Retention', status: 'pass' },
      { label: isSpanish ? 'Revisiones de Acceso' : 'Access Reviews', status: 'warning' },
    ],
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSpanish ? 'Centro de Gobernanza' : 'Governance Center'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSpanish
              ? 'Cumplimiento, auditoría y supervisión'
              : 'Compliance, audit, and oversight'}
          </p>
        </div>
        <Button onClick={() => router.push('/govern/audit-reports')}>
          <FileSearch className="h-4 w-4 mr-2" />
          {isSpanish ? 'Generar Informe' : 'Generate Report'}
        </Button>
      </div>

      {/* Compliance Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            {isSpanish ? 'Estado de Cumplimiento' : 'Compliance Status'}
          </CardTitle>
          <CardDescription>
            {isSpanish
              ? 'Resumen de controles de cumplimiento'
              : 'Summary of compliance controls'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {complianceStatus.items.map((item) => (
              <div
                key={item.label}
                className={`p-4 rounded-lg ${
                  item.status === 'pass' ? 'bg-green-50' : 'bg-amber-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {item.status === 'pass' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <Badge
                    variant={item.status === 'pass' ? 'default' : 'secondary'}
                    className={item.status === 'pass' ? 'bg-green-600' : 'bg-amber-500'}
                  >
                    {item.status === 'pass'
                      ? (isSpanish ? 'Cumple' : 'Pass')
                      : (isSpanish ? 'Revisar' : 'Review')}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Govern Sections */}
      {governSections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.route}
                    onClick={() => router.push(item.route)}
                    className="flex items-start gap-4 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
