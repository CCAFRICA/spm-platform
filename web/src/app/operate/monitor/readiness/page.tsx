'use client';

/**
 * Operate > Monitor > Data Readiness
 *
 * Shows data readiness status for the current compensation cycle.
 */

import { useLocale } from '@/contexts/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Database,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Users,
  Target,
  Calendar,
} from 'lucide-react';

export default function DataReadinessPage() {
  const { locale } = useLocale();

  const isSpanish = locale === 'es-MX';

  const dataCategories = [
    {
      name: isSpanish ? 'Transacciones' : 'Transactions',
      icon: FileSpreadsheet,
      status: 'ready',
      count: 1250,
      expected: 1250,
    },
    {
      name: isSpanish ? 'Empleados' : 'Employees',
      icon: Users,
      status: 'ready',
      count: 24,
      expected: 24,
    },
    {
      name: isSpanish ? 'Metas' : 'Goals',
      icon: Target,
      status: 'warning',
      count: 22,
      expected: 24,
    },
    {
      name: isSpanish ? 'Períodos' : 'Periods',
      icon: Calendar,
      status: 'ready',
      count: 12,
      expected: 12,
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const overallReadiness = Math.round(
    (dataCategories.filter(c => c.status === 'ready').length / dataCategories.length) * 100
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSpanish ? 'Preparación de Datos' : 'Data Readiness'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSpanish
              ? 'Estado de datos requeridos para el ciclo de compensación'
              : 'Status of data required for compensation cycle'}
          </p>
        </div>
        <Badge variant={overallReadiness === 100 ? 'default' : 'secondary'} className="text-lg px-4 py-2">
          {overallReadiness}% {isSpanish ? 'Listo' : 'Ready'}
        </Badge>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            {isSpanish ? 'Progreso General' : 'Overall Progress'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overallReadiness} className="h-3" />
          <p className="text-sm text-slate-500 mt-2">
            {dataCategories.filter(c => c.status === 'ready').length} {isSpanish ? 'de' : 'of'} {dataCategories.length} {isSpanish ? 'categorías listas' : 'categories ready'}
          </p>
        </CardContent>
      </Card>

      {/* Data Categories */}
      <div className="grid grid-cols-2 gap-4">
        {dataCategories.map((category) => {
          const Icon = category.icon;
          const progress = Math.round((category.count / category.expected) * 100);

          return (
            <Card key={category.name} className={category.status === 'warning' ? 'border-amber-200' : ''}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      category.status === 'ready' ? 'bg-green-100' :
                      category.status === 'warning' ? 'bg-amber-100' : 'bg-red-100'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        category.status === 'ready' ? 'text-green-600' :
                        category.status === 'warning' ? 'text-amber-600' : 'text-red-600'
                      }`} />
                    </div>
                    <span className="font-medium">{category.name}</span>
                  </div>
                  {getStatusIcon(category.status)}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">
                      {category.count} / {category.expected}
                    </span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                {category.status === 'warning' && (
                  <p className="text-xs text-amber-600 mt-3">
                    {isSpanish
                      ? `Faltan ${category.expected - category.count} registros`
                      : `Missing ${category.expected - category.count} records`}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
