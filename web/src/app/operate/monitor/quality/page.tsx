'use client';

/**
 * Operate > Monitor > Data Quality
 *
 * Shows data quality issues and validation results.
 */

import { useState } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';

export default function DataQualityPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [isScanning, setIsScanning] = useState(false);

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const qualityIssues = [
    {
      id: 1,
      type: 'warning',
      category: isSpanish ? 'Datos Faltantes' : 'Missing Data',
      description: isSpanish
        ? 'Región no asignada para 2 empleados'
        : 'Region not assigned for 2 employees',
      affectedRecords: 2,
      severity: 'medium',
    },
    {
      id: 2,
      type: 'warning',
      category: isSpanish ? 'Formato Inválido' : 'Invalid Format',
      description: isSpanish
        ? 'Fechas con formato incorrecto en transacciones'
        : 'Incorrectly formatted dates in transactions',
      affectedRecords: 5,
      severity: 'low',
    },
    {
      id: 3,
      type: 'error',
      category: isSpanish ? 'Duplicados' : 'Duplicates',
      description: isSpanish
        ? 'ID de transacción duplicado detectado'
        : 'Duplicate transaction ID detected',
      affectedRecords: 1,
      severity: 'high',
    },
  ];

  const qualityMetrics = {
    completeness: 98,
    accuracy: 99,
    consistency: 97,
    timeliness: 100,
  };

  const handleRescan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSpanish ? 'Calidad de Datos' : 'Data Quality'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSpanish
              ? 'Validación y problemas de calidad de datos'
              : 'Data validation and quality issues'}
          </p>
        </div>
        <Button onClick={handleRescan} disabled={isScanning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
          {isSpanish ? 'Re-escanear' : 'Rescan'}
        </Button>
      </div>

      {/* Quality Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(qualityMetrics).map(([key, value]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">
                  {key === 'completeness' && (isSpanish ? 'Completitud' : 'Completeness')}
                  {key === 'accuracy' && (isSpanish ? 'Precisión' : 'Accuracy')}
                  {key === 'consistency' && (isSpanish ? 'Consistencia' : 'Consistency')}
                  {key === 'timeliness' && (isSpanish ? 'Actualidad' : 'Timeliness')}
                </span>
                {value >= 98 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : value >= 95 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
              </div>
              <p className="text-2xl font-bold">{value}%</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Issues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            {isSpanish ? 'Problemas Detectados' : 'Detected Issues'}
          </CardTitle>
          <CardDescription>
            {qualityIssues.length} {isSpanish ? 'problemas encontrados' : 'issues found'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {qualityIssues.map((issue) => (
              <div
                key={issue.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  issue.type === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {issue.type === 'error' ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{issue.category}</p>
                    <p className="text-xs text-slate-600">{issue.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={issue.severity === 'high' ? 'destructive' : 'secondary'}>
                    {issue.affectedRecords} {isSpanish ? 'registros' : 'records'}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
