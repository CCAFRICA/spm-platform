'use client';

import { useEffect, useState } from 'react';
import { generateBatchTraces, summarizeTraces, type EmployeeReconciliationTrace } from '@/lib/reconciliation/employee-reconciliation-trace';

const TARGET_EMPLOYEES = ['96568046', '90319253', '90198149', '98872222', '90162065'];

interface TraceResults {
  traces: EmployeeReconciliationTrace[];
  summary: ReturnType<typeof summarizeTraces>;
  tenantId: string;
}

export default function ReconciliationTestPage() {
  const [results, setResults] = useState<TraceResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>('');

  // Determine tenantId on mount (no localStorage)
  useEffect(() => {
    setTenantId('retail_conglomerate');  // default
  }, []);

  const runTraces = async () => {
    try {
      console.log('Using tenantId:', tenantId);

      const traces = await generateBatchTraces(tenantId, TARGET_EMPLOYEES);
      const summary = summarizeTraces(traces);

      // Log EVERYTHING to console
      traces.forEach(trace => {
        console.log(`\n=== EMPLOYEE ${trace.entityId} (${trace.entityRole}) ===`);
        console.log('Plan:', trace.planResolution?.ruleSetName);
        console.log('Variant:', trace.variantSelection?.selectedVariantName);
        console.log('isCertified:', trace.isCertified);

        trace.components?.forEach(comp => {
          console.log(`\n  Component: ${comp.componentName} (${comp.componentType})`);
          console.log(`  Sheet: ${comp.matchedSheet} (${comp.sheetMatchMethod})`);
          console.log(`  Raw data:`, comp.rawSheetData);
          console.log(`  Extracted metrics:`, comp.extractedMetrics);
          console.log(`  Calculation inputs:`, comp.calculationInputs);
          console.log(`  Lookup details:`, comp.lookupDetails);
          console.log(`  Formula: ${comp.calculationFormula}`);
          console.log(`  Payout: ${comp.outputValue}`);
          if (comp.warnings?.length) console.log(`  Warnings:`, comp.warnings);
        });

        console.log(`\n  TOTAL: ${trace.finalCalculation?.totalIncentive}`);
        console.log(`  Warnings:`, trace.validation?.warnings);
        console.log(`  Errors:`, trace.validation?.errors);
      });

      console.log('\n=== BATCH SUMMARY ===');
      console.log(summary);

      setResults({ traces, summary, tenantId });
    } catch (err) {
      console.error('Trace failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">CLT-14B: Reconciliation Trace Test</h1>
      <p className="text-sm text-zinc-500 mb-4">Diagnostic tool for validating employee calculation traces</p>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm">Tenant ID:</span>
        <code className="bg-zinc-800 px-2 py-1 rounded text-sm">{tenantId || 'detecting...'}</code>
      </div>

      <button
        onClick={runTraces}
        disabled={!tenantId}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mb-4 disabled:opacity-50"
      >
        Run Traces for 5 Employees
      </button>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 p-4 rounded mb-4">
          <h3 className="font-bold text-red-400">Error</h3>
          <pre className="text-sm text-red-300 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <div className="bg-emerald-900/20 border border-emerald-800/50 p-4 rounded">
            <p className="font-bold text-emerald-400">
              Traces completed for {results.traces.length} employees (tenant: {results.tenantId})
            </p>
            <p className="text-sm text-emerald-300 mt-1">
              With Errors: {results.summary.withErrors} | With Warnings: {results.summary.withWarnings} |
              Avg Total: ${results.summary.avgTotalIncentive.toLocaleString()}
            </p>
          </div>

          {results.traces.map((trace) => (
            <div key={trace.entityId} className="border rounded p-4 bg-zinc-900 shadow-sm">
              <h3 className="font-bold text-lg flex items-center gap-2">
                Employee {trace.entityId}
                <span className={`text-xs px-2 py-0.5 rounded ${trace.isCertified ? 'bg-emerald-900/30 text-emerald-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                  {trace.isCertified ? 'Certified' : 'Non-Certified'}
                </span>
              </h3>
              <p className="text-sm text-zinc-400 mb-2">
                {trace.entityRole} | Period: {trace.period?.formatted}
              </p>
              <p className="text-sm text-zinc-500 mb-3">
                Plan: {trace.planResolution?.ruleSetName} |
                Variant: {trace.variantSelection?.selectedVariantName}
              </p>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-700 bg-zinc-800/50">
                    <th className="text-left py-2 px-2">Component</th>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Sheet</th>
                    <th className="text-left py-2 px-2">Key Metrics</th>
                    <th className="text-left py-2 px-2">Formula</th>
                    <th className="text-right py-2 px-2">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.components?.map((comp, i) => (
                    <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-800/50">
                      <td className="py-2 px-2 font-medium">{comp.componentName}</td>
                      <td className="py-2 px-2 text-zinc-500">{comp.componentType}</td>
                      <td className="py-2 px-2 text-zinc-500">
                        {comp.matchedSheet || <span className="text-red-400">None</span>}
                        <span className="text-xs ml-1 text-zinc-600">({comp.sheetMatchMethod})</span>
                      </td>
                      <td className="py-2 px-2 text-zinc-400 font-mono text-xs">
                        {Object.entries(comp.extractedMetrics || {}).map(([k, v]) => (
                          <div key={k}>{k}: {typeof v === 'number' ? v.toLocaleString() : String(v)}</div>
                        ))}
                        {Object.keys(comp.extractedMetrics || {}).length === 0 && (
                          <span className="text-amber-600">No metrics</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-zinc-400 text-xs">{comp.calculationFormula || '—'}</td>
                      <td className="py-2 px-2 text-right font-mono font-medium">
                        ${comp.outputValue?.toLocaleString() ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-zinc-800/50">
                    <td colSpan={5} className="py-2 px-2">Total (Trace)</td>
                    <td className="py-2 px-2 text-right font-mono">
                      ${trace.finalCalculation?.totalIncentive?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Warnings & Errors */}
              {(trace.validation?.warnings?.length > 0 || trace.validation?.errors?.length > 0) && (
                <div className="mt-3 text-sm space-y-1">
                  {trace.validation.warnings.map((w: string, i: number) => (
                    <p key={`w-${i}`} className="text-amber-600 flex items-start gap-1">
                      <span>⚠️</span> {w}
                    </p>
                  ))}
                  {trace.validation.errors.map((e: string, i: number) => (
                    <p key={`e-${i}`} className="text-red-600 flex items-start gap-1">
                      <span>❌</span> {e}
                    </p>
                  ))}
                </div>
              )}

              {/* Raw Data Dump */}
              <details className="mt-3">
                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                  Show raw component metrics
                </summary>
                <pre className="mt-2 text-xs bg-zinc-800/50 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(trace.dataLoading?.componentMetrics, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
