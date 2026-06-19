'use client';

/**
 * OB-219 — Commission Statement view (domain-agnostic, Bliss-themed).
 *
 * Header (entity / period / total) → expandable component cards → per-transaction table →
 * inline transaction detail (formula, inputs, rate, contribution, source row; clawback shows the
 * original transaction + reversal). Component names and input labels render FROM THE DATA
 * (Korean Test). Amounts/dates use the tenant locale via useCurrency()/useTenantDate().
 */

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, FileText, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCurrency, useTenantDate } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';
import type { CommissionStatement, StatementComponent, StatementTransaction } from '@/lib/compensation/commission-statement';

/** Display a rate: <1 as a percentage (0.025 → 2.5%), otherwise the raw value (per-unit/multiplier). */
function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '—';
  if (rate > 0 && rate < 1) return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  return String(rate);
}

function compactInputs(inputs: Record<string, unknown>): string {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toLocaleString() : String(v)}`).join(', ');
}

function PatternBadge({ component }: { component: StatementComponent }) {
  if (component.pattern === 'clawback') {
    return <Badge variant="destructive"><RotateCcw className="h-3 w-3 mr-1" />Reversal</Badge>;
  }
  if (!component.attributable) {
    return <Badge variant="outline">Entity-level</Badge>;
  }
  const label = component.pattern === 'qualified' ? 'Qualified' : 'Additive';
  return <Badge variant="secondary">{label}</Badge>;
}

function TransactionDetail({ tx }: { tx: StatementTransaction }) {
  const { format } = useCurrency();
  const isClawback = tx.pattern === 'clawback';
  const original = tx.output as Record<string, unknown>;
  return (
    <div className="px-4 py-4 space-y-4 bg-muted/30 border-t">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Formula</p>
          <p className="font-mono">{tx.formula ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Rate</p>
          <p className="font-mono">{formatRate(tx.rate)}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Inputs</p>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {Object.entries(tx.inputs).map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-mono">{typeof v === 'number' ? v.toLocaleString() : String(v)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-medium">Contribution</span>
        <span className={cn('font-mono font-semibold', tx.contribution < 0 && 'text-destructive')}>
          {format(tx.contribution)}
        </span>
      </div>

      {isClawback && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <RotateCcw className="h-4 w-4" /> Reversal of original transaction
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div><span className="text-xs text-muted-foreground block">Original contribution</span>
              <span className="font-mono">{original.originalContribution != null ? format(Number(original.originalContribution)) : '—'}</span></div>
            <div><span className="text-xs text-muted-foreground block">Original rate</span>
              <span className="font-mono">{formatRate(original.originalRate != null ? Number(original.originalRate) : null)}</span></div>
            <div><span className="text-xs text-muted-foreground block">Original transaction id</span>
              <span className="font-mono text-xs break-all">{String(original.originalCommittedDataId ?? '—')}</span></div>
          </div>
        </div>
      )}

      {tx.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Steps</p>
          <ol className="list-decimal list-inside space-y-1 text-xs font-mono text-muted-foreground">
            {tx.steps.map((s, i) => (
              <li key={i}>{typeof s === 'object' ? JSON.stringify(s) : String(s)}</li>
            ))}
          </ol>
        </div>
      )}

      {tx.sourceRow && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Source Transaction Data</p>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(tx.sourceRow)
              .filter(([k]) => !k.startsWith('_'))
              .map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono break-all">{v === null || v === undefined ? '—' : String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function ComponentCard({ component }: { component: StatementComponent }) {
  const [open, setOpen] = useState(false);
  const [openTx, setOpenTx] = useState<string | null>(null);
  const { format } = useCurrency();
  const { format: formatDate } = useTenantDate();
  const isClawback = component.pattern === 'clawback';

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader className="flex flex-row items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-2 min-w-0">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{component.name}</CardTitle>
                  {component.planName && <p className="text-xs text-muted-foreground truncate">{component.planName}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <PatternBadge component={component} />
                <span className={cn('font-mono font-semibold', component.payout < 0 && 'text-destructive')}>
                  {format(component.payout)}
                </span>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {component.attributable ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Inputs</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {component.transactions.map((tx) => {
                    const id = tx.committedDataId;
                    const isOpen = openTx === id;
                    return (
                      <Fragment key={id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setOpenTx(isOpen ? null : id)}
                        >
                          <TableCell className="font-mono text-xs">
                            {tx.transactionRef ?? id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm">{tx.sourceDate ? formatDate(tx.sourceDate) : '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={compactInputs(tx.inputs)}>
                            {compactInputs(tx.inputs)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatRate(tx.rate)}</TableCell>
                          <TableCell className={cn('text-right font-mono text-sm', tx.contribution < 0 && 'text-destructive')}>
                            {format(tx.contribution)}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={5} className="p-0">
                              <TransactionDetail tx={tx} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                <FileText className="h-4 w-4" />
                Entity-level calculation (no per-transaction breakdown).
              </p>
            )}
            {component.attributable && (
              <div className="flex justify-end gap-6 pt-3 text-xs text-muted-foreground">
                <span>{component.transactions.length} transaction(s)</span>
                <span>Traced subtotal: <span className="font-mono">{format(component.tracedSubtotal)}</span></span>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function CommissionStatementView({ statement }: { statement: CommissionStatement }) {
  const { format } = useCurrency();
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Commission Statement
              </p>
              <CardTitle className="text-xl mt-1">{statement.entity.displayName}</CardTitle>
              <p className="text-sm text-muted-foreground font-mono">{statement.entity.externalId}</p>
              <p className="text-sm text-muted-foreground mt-1">Period: {statement.period.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Payout</p>
              <p className={cn('text-2xl font-bold font-mono', statement.totalPayout < 0 && 'text-destructive')}>
                {format(statement.totalPayout)}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {statement.components.map((c, i) => (
          <ComponentCard key={`${c.planName ?? ''}-${c.name}-${i}`} component={c} />
        ))}
      </div>

      {!statement.hasTraces && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          No per-transaction traces for this entity/period yet — showing entity-level component totals.
        </p>
      )}
    </div>
  );
}
