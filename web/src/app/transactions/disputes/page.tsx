'use client';

/**
 * Dispute Queue — /transactions/disputes
 *
 * Wired to GET /api/disputes (Supabase).
 * SCHEMA: disputes (id, tenant_id, entity_id, category, status, description,
 *   amount_disputed, amount_resolved, filed_by, created_at, resolved_at)
 * Status CHECK: open, investigating, resolved, rejected, escalated
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle,
  Clock,
  FileText,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';

interface DisputeRow {
  id: string;
  entity_id: string;
  category: string;
  status: string;
  description: string;
  amount_disputed: number | null;
  amount_resolved: number | null;
  created_at: string;
  resolved_at: string | null;
}

type FilterTab = 'open' | 'resolved' | 'all';

const STATUS_BADGES: Record<string, { label: string; labelEs: string; className: string; icon: typeof Clock }> = {
  open: { label: 'Open', labelEs: 'Abierto', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: Clock },
  investigating: { label: 'Investigating', labelEs: 'Investigando', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: AlertTriangle },
  resolved: { label: 'Resolved', labelEs: 'Resuelto', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  rejected: { label: 'Rejected', labelEs: 'Rechazado', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
  escalated: { label: 'Escalated', labelEs: 'Escalado', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: AlertTriangle },
};

const CATEGORY_LABELS: Record<string, { en: string; es: string }> = {
  data_error: { en: 'Data Error', es: 'Error de Datos' },
  calculation_error: { en: 'Calculation Error', es: 'Error de Cálculo' },
  plan_interpretation: { en: 'Plan Interpretation', es: 'Interpretación de Plan' },
  missing_transaction: { en: 'Missing Transaction', es: 'Transacción Faltante' },
  wrong_attribution: { en: 'Wrong Attribution', es: 'Atribución Incorrecta' },
  incorrect_amount: { en: 'Incorrect Amount', es: 'Monto Incorrecto' },
  wrong_rate: { en: 'Wrong Rate', es: 'Tasa Incorrecta' },
  split_error: { en: 'Split Error', es: 'Error de División' },
  timing_issue: { en: 'Timing Issue', es: 'Problema de Tiempo' },
  other: { en: 'Other', es: 'Otro' },
};

export default function DisputeQueuePage() {
  const { currentTenant } = useTenant();
  const { format: formatCurrencyCanonical } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [filter, setFilter] = useState<FilterTab>('open');
  const [isLoading, setIsLoading] = useState(true);

  const fetchDisputes = useCallback(async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/disputes');
      if (response.ok) {
        const data = await response.json();
        setDisputes((data.disputes || []) as DisputeRow[]);
      }
    } catch (err) {
      console.error('[DisputeQueue] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  // Stats
  const openCount = disputes.filter(d => d.status === 'open' || d.status === 'investigating').length;
  const resolvedCount = disputes.filter(d => d.status === 'resolved').length;
  const rejectedCount = disputes.filter(d => d.status === 'rejected').length;

  const filteredDisputes = disputes.filter(d => {
    if (filter === 'open') return d.status === 'open' || d.status === 'investigating' || d.status === 'escalated';
    if (filter === 'resolved') return d.status === 'resolved' || d.status === 'rejected';
    return true;
  });

  const formatCurrency = (value: number | null) => {
    if (value == null) return '—';
    return formatCurrencyCanonical(value);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando disputas...' : 'Loading disputes...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          {isSpanish ? 'Cola de Disputas' : 'Dispute Queue'}
        </h1>
        <p className="text-muted-foreground">
          {isSpanish ? 'Revisar y resolver disputas de resultados' : 'Review and resolve outcome disputes'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{openCount}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Pendientes' : 'Open'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{resolvedCount}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Resueltas' : 'Resolved'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center dark:bg-red-900/30">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{rejectedCount}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Rechazadas' : 'Rejected'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="open" className="gap-2">
            <Clock className="h-4 w-4" />
            {isSpanish ? 'Pendientes' : 'Open'}
            {openCount > 0 && (
              <Badge variant="secondary" className="ml-1">{openCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            {isSpanish ? 'Cerradas' : 'Closed'}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <FileText className="h-4 w-4" />
            {isSpanish ? 'Todas' : 'All'}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Disputes Table */}
      <Card>
        <CardContent className="p-0">
          {filteredDisputes.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">
                {isSpanish ? 'Sin disputas' : 'No disputes found'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {filter === 'open'
                  ? (isSpanish ? 'No hay disputas pendientes' : 'No open disputes')
                  : filter === 'resolved'
                  ? (isSpanish ? 'No hay disputas cerradas' : 'No closed disputes')
                  : (isSpanish ? 'No se han registrado disputas' : 'No disputes filed')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Categoría' : 'Category'}</TableHead>
                  <TableHead>{isSpanish ? 'Descripción' : 'Description'}</TableHead>
                  <TableHead>{isSpanish ? 'Monto' : 'Amount'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{isSpanish ? 'Creado' : 'Created'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisputes.map((dispute) => {
                  const statusInfo = STATUS_BADGES[dispute.status] || STATUS_BADGES.open;
                  const catLabel = CATEGORY_LABELS[dispute.category];
                  return (
                    <TableRow key={dispute.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Badge variant="outline">
                          {catLabel ? (isSpanish ? catLabel.es : catLabel.en) : dispute.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {dispute.description || '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(dispute.amount_disputed)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusInfo.className}>
                          {isSpanish ? statusInfo.labelEs : statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(dispute.created_at).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
