'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  FileSearch,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTenant } from '@/contexts/tenant-context';

interface QualityMetric {
  id: string;
  name: string;
  description: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  issues: number;
  lastCheck: string;
}

interface DataIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  entity: string;
  field: string;
  description: string;
  count: number;
  firstSeen: string;
}

const mockMetrics: QualityMetric[] = [
  { id: '1', name: 'Completeness', description: 'Required fields populated', score: 94, trend: 'up', issues: 12, lastCheck: '2024-12-15 08:00' },
  { id: '2', name: 'Accuracy', description: 'Data matches expected formats', score: 98, trend: 'stable', issues: 3, lastCheck: '2024-12-15 08:00' },
  { id: '3', name: 'Consistency', description: 'Data consistent across sources', score: 87, trend: 'down', issues: 28, lastCheck: '2024-12-15 08:00' },
  { id: '4', name: 'Timeliness', description: 'Data received on schedule', score: 92, trend: 'up', issues: 5, lastCheck: '2024-12-15 08:00' },
  { id: '5', name: 'Uniqueness', description: 'No duplicate records', score: 99, trend: 'stable', issues: 2, lastCheck: '2024-12-15 08:00' },
];

const mockIssues: DataIssue[] = [
  { id: '1', type: 'error', entity: 'Transactions', field: 'mesero_id', description: 'Missing server ID reference', count: 8, firstSeen: '2024-12-15 06:15' },
  { id: '2', type: 'error', entity: 'Transactions', field: 'total', description: 'Negative total amount', count: 3, firstSeen: '2024-12-15 06:15' },
  { id: '3', type: 'warning', entity: 'Personnel', field: 'email', description: 'Invalid email format', count: 5, firstSeen: '2024-12-14 09:00' },
  { id: '4', type: 'warning', entity: 'Franchises', field: 'target_avg_ticket', description: 'Target not set', count: 2, firstSeen: '2024-12-13 10:30' },
  { id: '5', type: 'info', entity: 'Transactions', field: 'propina', description: 'Unusually high tip amount', count: 15, firstSeen: '2024-12-15 06:15' },
  { id: '6', type: 'warning', entity: 'Transactions', field: 'fecha', description: 'Future date detected', count: 1, firstSeen: '2024-12-15 07:00' },
];

export default function DataQualityPage() {
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const [metrics] = useState<QualityMetric[]>(mockMetrics);
  const [issues] = useState<DataIssue[]>(mockIssues);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const overallScore = Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length);
  const totalIssues = issues.reduce((sum, i) => sum + i.count, 0);
  const errorCount = issues.filter(i => i.type === 'error').reduce((sum, i) => sum + i.count, 0);
  const warningCount = issues.filter(i => i.type === 'warning').reduce((sum, i) => sum + i.count, 0);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <span className="h-4 w-4 text-gray-400">—</span>;
  };

  const getIssueBadge = (type: string) => {
    const configs = {
      error: { color: 'bg-red-100 text-red-800', icon: XCircle },
      warning: { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
      info: { color: 'bg-blue-100 text-blue-800', icon: FileSearch },
    };
    const config = configs[type as keyof typeof configs];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} hover:${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {isSpanish ? 'Calidad de Datos' : 'Data Quality'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Monitorea la calidad e integridad de los datos' : 'Monitor data quality and integrity'}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isSpanish ? 'Verificar Ahora' : 'Check Now'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${overallScore >= 90 ? 'bg-green-100' : overallScore >= 80 ? 'bg-yellow-100' : 'bg-red-100'}`}>
                <ShieldCheck className={`h-6 w-6 ${getScoreColor(overallScore)}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>{overallScore}%</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Puntuación General' : 'Overall Score'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalIssues}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Problemas Totales' : 'Total Issues'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{errorCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Errores' : 'Errors'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{warningCount}</p>
                <p className="text-sm text-muted-foreground">{isSpanish ? 'Advertencias' : 'Warnings'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Métricas de Calidad' : 'Quality Metrics'}</CardTitle>
          <CardDescription>
            {isSpanish ? 'Puntuación por dimensión de calidad' : 'Score by quality dimension'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.map(metric => (
              <div key={metric.id} className="flex items-center gap-4">
                <div className="w-32">
                  <p className="font-medium">{metric.name}</p>
                  <p className="text-xs text-muted-foreground">{metric.description}</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Progress value={metric.score} className="flex-1 h-2" />
                    <span className={`text-sm font-medium w-12 ${getScoreColor(metric.score)}`}>{metric.score}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-24">
                  {getTrendIcon(metric.trend)}
                  <Badge variant="outline">{metric.issues} {isSpanish ? 'problemas' : 'issues'}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Issues Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {isSpanish ? 'Problemas Detectados' : 'Detected Issues'}
          </CardTitle>
          <CardDescription>
            {isSpanish ? 'Lista de problemas de calidad de datos' : 'List of data quality issues'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                <TableHead>{isSpanish ? 'Entidad' : 'Entity'}</TableHead>
                <TableHead>{isSpanish ? 'Campo' : 'Field'}</TableHead>
                <TableHead>{isSpanish ? 'Descripción' : 'Description'}</TableHead>
                <TableHead>{isSpanish ? 'Ocurrencias' : 'Occurrences'}</TableHead>
                <TableHead>{isSpanish ? 'Primera Detección' : 'First Seen'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map(issue => (
                <TableRow key={issue.id}>
                  <TableCell>{getIssueBadge(issue.type)}</TableCell>
                  <TableCell className="font-medium">{issue.entity}</TableCell>
                  <TableCell className="font-mono text-sm">{issue.field}</TableCell>
                  <TableCell>{issue.description}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{issue.count}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{issue.firstSeen}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
