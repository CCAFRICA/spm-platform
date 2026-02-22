'use client';

/**
 * ExecutionTraceView — Renders intent execution traces
 *
 * OB-77 Mission 3: Shows the structural execution path for each component.
 * Displays inputs resolved, boundary matches, modifiers applied, and final outcome.
 * Zero domain language — labels are human-readable operation names.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ──────────────────────────────────────────────
// Types (mirrors ExecutionTrace from intent-types.ts)
// ──────────────────────────────────────────────

interface TraceInput {
  source: string;
  rawValue: unknown;
  resolvedValue: number;
}

interface LookupResolution {
  rowBoundaryMatched?: { min: number | null; max: number | null; index: number };
  columnBoundaryMatched?: { min: number | null; max: number | null; index: number };
  outputValue: number;
}

interface TraceModifier {
  modifier: string;
  before: number;
  after: number;
}

interface IntentTrace {
  entityId: string;
  componentIndex: number;
  variantRoute?: {
    attribute: string;
    value: string | number | boolean;
    matched: string;
  };
  inputs: Record<string, TraceInput>;
  lookupResolution?: LookupResolution;
  modifiers: TraceModifier[];
  finalOutcome: number;
  confidence: number;
}

// ──────────────────────────────────────────────
// Human-readable operation labels
// ──────────────────────────────────────────────

const OPERATION_LABELS: Record<string, string> = {
  bounded_lookup_1d: '1D Lookup',
  bounded_lookup_2d: '2D Matrix Lookup',
  scalar_multiply: 'Scalar Multiply',
  conditional_gate: 'Conditional Gate',
  aggregate: 'Aggregate',
  ratio: 'Ratio',
  constant: 'Constant',
};

export function getOperationLabel(op: string): string {
  return OPERATION_LABELS[op] || op;
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function InputsSection({ inputs }: { inputs: Record<string, TraceInput> }) {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Inputs</p>
      <div className="grid gap-1">
        {entries.map(([key, input]) => (
          <div key={key} className="flex items-center justify-between text-sm bg-zinc-800/50 rounded px-2 py-1">
            <span className="text-slate-300 font-mono text-xs">{key}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{input.source}</Badge>
              <span className="font-mono text-emerald-400">{formatNum(input.resolvedValue)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LookupSection({ lookup }: { lookup: LookupResolution }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Lookup</p>
      <div className="bg-zinc-800/50 rounded p-2 text-sm space-y-1">
        {lookup.rowBoundaryMatched && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">Row:</span>
            <span className="font-mono text-xs">
              [{formatBound(lookup.rowBoundaryMatched.min)}, {formatBound(lookup.rowBoundaryMatched.max)}]
            </span>
            <span className="text-slate-500 text-xs">idx={lookup.rowBoundaryMatched.index}</span>
          </div>
        )}
        {lookup.columnBoundaryMatched && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">Col:</span>
            <span className="font-mono text-xs">
              [{formatBound(lookup.columnBoundaryMatched.min)}, {formatBound(lookup.columnBoundaryMatched.max)}]
            </span>
            <span className="text-slate-500 text-xs">idx={lookup.columnBoundaryMatched.index}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">Output:</span>
          <span className="font-mono text-emerald-400">{formatNum(lookup.outputValue)}</span>
        </div>
      </div>
    </div>
  );
}

function ModifiersSection({ modifiers }: { modifiers: TraceModifier[] }) {
  if (modifiers.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Modifiers</p>
      <div className="space-y-1">
        {modifiers.map((m, i) => (
          <div key={i} className="flex items-center justify-between text-sm bg-zinc-800/50 rounded px-2 py-1">
            <span className="text-slate-300 text-xs">{m.modifier}</span>
            <span className="font-mono text-xs">
              {formatNum(m.before)} → {formatNum(m.after)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────

function formatNum(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '+Inf' : '-Inf';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(4);
}

function formatBound(v: number | null): string {
  if (v === null) return '-\u221E';
  return formatNum(v);
}

// ──────────────────────────────────────────────
// Single trace card
// ──────────────────────────────────────────────

function TraceCard({ trace, componentName }: { trace: IntentTrace; componentName?: string }) {
  return (
    <Card className="border-zinc-700">
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">
              {componentName || `Component ${trace.componentIndex}`}
            </span>
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-600">
              {trace.confidence >= 1 ? 'Deterministic' : `${(trace.confidence * 100).toFixed(0)}%`}
            </Badge>
          </div>
          <span className="font-mono text-lg font-bold text-emerald-400">
            {formatNum(trace.finalOutcome)}
          </span>
        </div>

        {/* Variant route (if present) */}
        {trace.variantRoute && (
          <div className="text-xs text-slate-400">
            Route: {trace.variantRoute.attribute} = {String(trace.variantRoute.value)} → {trace.variantRoute.matched}
          </div>
        )}

        {/* Sections */}
        <InputsSection inputs={trace.inputs} />
        {trace.lookupResolution && <LookupSection lookup={trace.lookupResolution} />}
        <ModifiersSection modifiers={trace.modifiers} />
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

interface ExecutionTraceViewProps {
  traces: IntentTrace[];
  componentNames?: string[];
  totalPayout?: number;
  intentMatch?: boolean;
  compact?: boolean;
}

export function ExecutionTraceView({
  traces,
  componentNames,
  totalPayout,
  intentMatch,
  compact = false,
}: ExecutionTraceViewProps) {
  if (!traces || traces.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-2">
        No intent execution traces available.
      </div>
    );
  }

  const intentTotal = traces.reduce((sum, t) => sum + (t.finalOutcome || 0), 0);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-400">Intent Total:</span>
        <span className="font-mono font-bold text-emerald-400">{formatNum(intentTotal)}</span>
        {totalPayout !== undefined && (
          <>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Engine:</span>
            <span className="font-mono font-bold text-blue-400">{formatNum(totalPayout)}</span>
          </>
        )}
        {intentMatch !== undefined && (
          <Badge
            variant={intentMatch ? 'default' : 'destructive'}
            className={intentMatch ? 'bg-emerald-600' : ''}
          >
            {intentMatch ? 'Match' : 'Mismatch'}
          </Badge>
        )}
      </div>

      {/* Individual traces */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {traces.map((trace, i) => (
          <TraceCard
            key={i}
            trace={trace}
            componentName={componentNames?.[trace.componentIndex]}
          />
        ))}
      </div>
    </div>
  );
}
