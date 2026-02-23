'use client';

/**
 * OB-85: Reconciliation Studio — Auto-Map + Compare + Results
 *
 * Full reconciliation workflow:
 * 1. Select calculation batch to compare against
 * 2. Upload benchmark file (CSV/XLSX)
 * 3. Auto-map Employee ID + Total Payout columns (pattern matching + value overlap)
 * 4. Run total-level reconciliation: match, classify, flag
 * 5. Results: summary cards + sortable table + CSV export
 *
 * Korean Test compliant — no hardcoded domain language.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { loadReconciliationPageData, type ReconciliationPageData } from '@/lib/data/page-loaders';
import { getCalculationResults } from '@/lib/supabase/calculation-service';
import { createClient } from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface BatchOption {
  id: string;
  label: string;
  entityCount: number;
  totalPayout: number;
  createdAt: string;
  lifecycleState: string;
}

interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

interface AutoMapResult {
  employeeIdColumn: string | null;
  totalPayoutColumn: string | null;
  employeeIdConfidence: number;
  totalPayoutConfidence: number;
}

type MatchFlag = 'exact' | 'tolerance' | 'amber' | 'red';

interface ReconciliationRow {
  externalId: string;
  entityName: string;
  vlTotal: number;
  benchmarkTotal: number;
  delta: number;
  deltaPercent: number;
  flag: MatchFlag;
}

interface ReconciliationResult {
  matched: ReconciliationRow[];
  vlOnly: string[];
  fileOnly: string[];
  vlTotal: number;
  benchmarkTotal: number;
  aggregateDelta: number;
  aggregateDeltaPercent: number;
  matchRate: number;
  avgDelta: number;
  falseGreenCount: number;
}

type SortField = 'externalId' | 'entityName' | 'vlTotal' | 'benchmarkTotal' | 'delta';

// ──────────────────────────────────────────────
// Auto-Map Engine (pattern matching + value overlap — no AI call)
// ──────────────────────────────────────────────

function autoMapBenchmarkFields(
  fileHeaders: string[],
  fileRows: Record<string, unknown>[],
  entityExternalIds: Set<string>,
): AutoMapResult {
  let employeeIdColumn: string | null = null;
  let totalPayoutColumn: string | null = null;
  let employeeIdConfidence = 0;
  let totalPayoutConfidence = 0;

  // Step 1: Find employee ID column
  // 1a: Header name matching
  const idPatterns = /employee|empleado|emp.?id|worker|num_emp|id_emp|associate|rep.?id|external.?id|^id$/i;
  for (const header of fileHeaders) {
    if (idPatterns.test(header.trim())) {
      employeeIdColumn = header;
      employeeIdConfidence = 0.9;
      break;
    }
  }

  // 1b: Value overlap matching (if header matching fails or for confirmation)
  if (!employeeIdColumn || employeeIdConfidence < 0.95) {
    let bestOverlap = 0;
    let bestHeader: string | null = null;
    for (const header of fileHeaders) {
      const colValues = fileRows.map(r => String(r[header] ?? '').trim());
      const matchCount = colValues.filter(v => entityExternalIds.has(v)).length;
      const overlapRate = fileRows.length > 0 ? matchCount / fileRows.length : 0;
      if (overlapRate > bestOverlap && overlapRate > 0.3) {
        bestOverlap = overlapRate;
        bestHeader = header;
      }
    }
    if (bestHeader && bestOverlap > (employeeIdConfidence * 0.8)) {
      employeeIdColumn = bestHeader;
      employeeIdConfidence = Math.min(bestOverlap + 0.1, 1.0);
    }
  }

  // Step 2: Find total payout column
  // 2a: Header name matching
  const payoutPatterns = /total|payout|payment|compensation|pago|compensaci|incentive|comision/i;
  for (const header of fileHeaders) {
    if (payoutPatterns.test(header.trim())) {
      // Verify it's numeric
      const sampleValues = fileRows.slice(0, 10).map(r => Number(r[header]));
      const numericCount = sampleValues.filter(v => !isNaN(v) && v !== 0).length;
      if (numericCount > sampleValues.length * 0.5) {
        totalPayoutColumn = header;
        totalPayoutConfidence = 0.95;
        break;
      }
    }
  }

  // 2b: Rightmost numeric column as fallback
  if (!totalPayoutColumn) {
    for (let i = fileHeaders.length - 1; i >= 0; i--) {
      const header = fileHeaders[i];
      if (header === employeeIdColumn) continue;
      const sampleValues = fileRows.slice(0, 20).map(r => Number(r[header]));
      const numericCount = sampleValues.filter(v => !isNaN(v) && v > 0).length;
      if (numericCount > sampleValues.length * 0.6) {
        totalPayoutColumn = header;
        totalPayoutConfidence = 0.6;
        break;
      }
    }
  }

  return { employeeIdColumn, totalPayoutColumn, employeeIdConfidence, totalPayoutConfidence };
}

// ──────────────────────────────────────────────
// Reconciliation Engine (client-side, total-level)
// ──────────────────────────────────────────────

function classifyDelta(delta: number, benchmarkTotal: number): MatchFlag {
  const absDelta = Math.abs(delta);
  if (absDelta < 0.01) return 'exact';
  const pct = benchmarkTotal !== 0 ? (absDelta / Math.abs(benchmarkTotal)) * 100 : 100;
  if (pct < 1) return 'tolerance';
  if (pct <= 5) return 'amber';
  return 'red';
}

function runReconciliation(
  benchmarkRows: Record<string, unknown>[],
  employeeIdCol: string,
  totalPayoutCol: string,
  calcResults: Array<{ entity_id: string; external_id: string; display_name: string; total_payout: number }>,
): ReconciliationResult {
  // Build VL results index by external_id (normalized)
  const vlIndex = new Map<string, { entityId: string; name: string; total: number }>();
  for (const r of calcResults) {
    const key = (r.external_id ?? r.entity_id).trim().toLowerCase().replace(/^0+/, '');
    vlIndex.set(key, {
      entityId: r.entity_id,
      name: r.display_name || r.external_id || r.entity_id,
      total: r.total_payout,
    });
  }

  // Build benchmark index by employee ID (normalized)
  const bmIndex = new Map<string, number>();
  const bmRawIds = new Set<string>();
  for (const row of benchmarkRows) {
    const rawId = String(row[employeeIdCol] ?? '').trim();
    if (!rawId) continue;
    bmRawIds.add(rawId);
    const key = rawId.toLowerCase().replace(/^0+/, '');
    const total = Number(row[totalPayoutCol]) || 0;
    bmIndex.set(key, (bmIndex.get(key) ?? 0) + total);
  }

  // Match
  const matched: ReconciliationRow[] = [];
  const matchedVlKeys = new Set<string>();
  const matchedBmKeys = new Set<string>();

  for (const [bmKey, bmTotal] of Array.from(bmIndex.entries())) {
    const vlEntry = vlIndex.get(bmKey);
    if (vlEntry) {
      const delta = vlEntry.total - bmTotal;
      const deltaPercent = bmTotal !== 0 ? (Math.abs(delta) / Math.abs(bmTotal)) * 100 : (delta === 0 ? 0 : 100);
      matched.push({
        externalId: vlEntry.name,
        entityName: vlEntry.name,
        vlTotal: vlEntry.total,
        benchmarkTotal: bmTotal,
        delta,
        deltaPercent,
        flag: classifyDelta(delta, bmTotal),
      });
      matchedVlKeys.add(bmKey);
      matchedBmKeys.add(bmKey);
    }
  }

  // VL-only (not in benchmark)
  const vlOnly: string[] = [];
  for (const [key, entry] of Array.from(vlIndex.entries())) {
    if (!matchedVlKeys.has(key)) {
      vlOnly.push(entry.name);
    }
  }

  // File-only (not in VL)
  const fileOnly: string[] = [];
  for (const [key] of Array.from(bmIndex.entries())) {
    if (!matchedBmKeys.has(key)) {
      // Find the original raw ID
      fileOnly.push(key);
    }
  }

  const vlTotal = matched.reduce((s, r) => s + r.vlTotal, 0);
  const benchmarkTotal = matched.reduce((s, r) => s + r.benchmarkTotal, 0);
  const aggregateDelta = vlTotal - benchmarkTotal;
  const aggregateDeltaPercent = benchmarkTotal !== 0 ? (Math.abs(aggregateDelta) / Math.abs(benchmarkTotal)) * 100 : 0;
  const avgDelta = matched.length > 0 ? matched.reduce((s, r) => s + Math.abs(r.delta), 0) / matched.length : 0;
  const matchRate = calcResults.length > 0 ? (matched.length / calcResults.length) * 100 : 0;
  const falseGreenCount = 0; // TODO: detect offsetting component errors

  return {
    matched,
    vlOnly,
    fileOnly,
    vlTotal,
    benchmarkTotal,
    aggregateDelta,
    aggregateDeltaPercent,
    matchRate,
    avgDelta,
    falseGreenCount,
  };
}

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────

export default function ReconciliationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const tenantId = currentTenant?.id || '';

  // State
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<ReconciliationPageData | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [autoMap, setAutoMap] = useState<AutoMapResult | null>(null);
  const [employeeIdCol, setEmployeeIdCol] = useState<string | null>(null);
  const [totalPayoutCol, setTotalPayoutCol] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('delta');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load page data
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await loadReconciliationPageData(tenantId);
        if (cancelled) return;
        setPageData(data);

        // Auto-select batch from URL param
        const urlBatchId = searchParams.get('batchId');
        if (urlBatchId && data.batches.some(b => b.id === urlBatchId)) {
          setSelectedBatchId(urlBatchId);
        } else if (data.batches.length > 0) {
          setSelectedBatchId(data.batches[0].id);
        }
      } catch (err) {
        console.error('[Reconciliation] Failed to load:', err);
        setError('Failed to load reconciliation data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, searchParams]);

  // Build batch options
  const batchOptions: BatchOption[] = useMemo(() => {
    if (!pageData) return [];
    return pageData.batches.map(b => ({
      id: b.id,
      label: `${b.period_label ?? b.canonical_key ?? 'Unknown'} — ${b.lifecycle_state} (${formatCurrency(b.total_payout)})`,
      entityCount: b.entity_count,
      totalPayout: b.total_payout,
      createdAt: b.created_at,
      lifecycleState: b.lifecycle_state,
    }));
  }, [pageData, formatCurrency]);

  const selectedBatch = batchOptions.find(b => b.id === selectedBatchId);

  // File parsing
  const parseFile = useCallback((file: File) => {
    setError(null);
    setResult(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          setError('File contains no data rows');
          return;
        }

        const headers = Object.keys(jsonData[0]);
        setParsedFile({ fileName: file.name, headers, rows: jsonData });

        // Auto-map will happen after we load entity external IDs
      } catch (err) {
        setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }, []);

  // Run auto-map when file is parsed and batch is selected
  useEffect(() => {
    if (!parsedFile || !selectedBatchId || !tenantId) return;
    let cancelled = false;

    async function doAutoMap() {
      try {
        // Load entity external IDs from calculation results
        const results = await getCalculationResults(tenantId, selectedBatchId!);
        if (cancelled) return;

        // Get entity display info
        const supabase = createClient();
        const entityIds = results.map(r => r.entity_id);
        const entityBatches: Array<{ id: string; external_id: string | null; display_name: string }> = [];
        const BATCH_SIZE = 1000;
        for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
          const batch = entityIds.slice(i, i + BATCH_SIZE);
          const { data: entities } = await supabase
            .from('entities')
            .select('id, external_id, display_name')
            .in('id', batch);
          if (entities) entityBatches.push(...entities);
        }
        if (cancelled) return;

        const entityExternalIds = new Set(
          entityBatches
            .map(e => (e.external_id ?? e.id).trim().toLowerCase().replace(/^0+/, ''))
        );

        const mapResult = autoMapBenchmarkFields(
          parsedFile!.headers,
          parsedFile!.rows,
          entityExternalIds,
        );

        if (!cancelled) {
          setAutoMap(mapResult);
          setEmployeeIdCol(mapResult.employeeIdColumn);
          setTotalPayoutCol(mapResult.totalPayoutColumn);
        }
      } catch (err) {
        console.error('[Reconciliation] Auto-map failed:', err);
      }
    }

    doAutoMap();
    return () => { cancelled = true; };
  }, [parsedFile, selectedBatchId, tenantId]);

  // Run reconciliation
  const handleRunReconciliation = useCallback(async () => {
    if (!parsedFile || !employeeIdCol || !totalPayoutCol || !selectedBatchId || !tenantId) return;
    setIsReconciling(true);
    setError(null);

    try {
      // Load full calculation results with entity info
      const results = await getCalculationResults(tenantId, selectedBatchId);

      const supabase = createClient();
      const entityIds = results.map(r => r.entity_id);
      const entityBatches: Array<{ id: string; external_id: string | null; display_name: string }> = [];
      const BATCH_SIZE = 1000;
      for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
        const batch = entityIds.slice(i, i + BATCH_SIZE);
        const { data: entities } = await supabase
          .from('entities')
          .select('id, external_id, display_name')
          .in('id', batch);
        if (entities) entityBatches.push(...entities);
      }

      const entityMap = new Map(entityBatches.map(e => [e.id, e]));

      const calcResults = results.map(r => {
        const entity = entityMap.get(r.entity_id);
        return {
          entity_id: r.entity_id,
          external_id: entity?.external_id ?? r.entity_id,
          display_name: entity?.display_name ?? r.entity_id,
          total_payout: r.total_payout || 0,
        };
      });

      const reconResult = runReconciliation(
        parsedFile.rows,
        employeeIdCol,
        totalPayoutCol,
        calcResults,
      );

      setResult(reconResult);
    } catch (err) {
      setError(`Reconciliation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsReconciling(false);
    }
  }, [parsedFile, employeeIdCol, totalPayoutCol, selectedBatchId, tenantId]);

  // Sort and filter results
  const sortedResults = useMemo(() => {
    if (!result) return [];
    let rows = [...result.matched];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.externalId.toLowerCase().includes(q) ||
        r.entityName.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortField === 'externalId' || sortField === 'entityName') {
        aVal = a[sortField].toLowerCase();
        bVal = b[sortField].toLowerCase();
        return sortAsc ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
      }
      aVal = Math.abs(a[sortField] as number);
      bVal = Math.abs(b[sortField] as number);
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    return rows;
  }, [result, sortField, sortAsc, searchQuery]);

  // CSV Export
  const handleExportCSV = useCallback(() => {
    if (!result) return;
    const headers = ['Employee ID', 'Name', 'VL Total', 'Benchmark Total', 'Delta', 'Delta %', 'Flag'];
    const csvRows = [headers.join(',')];
    for (const row of result.matched) {
      csvRows.push([
        `"${row.externalId}"`,
        `"${row.entityName}"`,
        row.vlTotal.toFixed(2),
        row.benchmarkTotal.toFixed(2),
        row.delta.toFixed(2),
        row.deltaPercent.toFixed(2) + '%',
        row.flag,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-${selectedBatchId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, selectedBatchId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const flagIcon = (flag: MatchFlag) => {
    switch (flag) {
      case 'exact': return <span style={{ color: '#10b981' }}>✓</span>;
      case 'tolerance': return <span style={{ color: '#10b981' }}>~</span>;
      case 'amber': return <span style={{ color: '#f59e0b' }}>⚠</span>;
      case 'red': return <span style={{ color: '#ef4444' }}>✗</span>;
    }
  };

  // ── LOADING ──
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">{isSpanish ? 'Cargando datos de reconciliacion...' : 'Loading reconciliation data...'}</p>
        </div>
      </div>
    );
  }

  // ── NO BATCHES ──
  if (!pageData || pageData.batches.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="text-4xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-2">
          {isSpanish ? 'No hay calculos para reconciliar' : 'No calculations to reconcile'}
        </h3>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {isSpanish
            ? 'Ejecuta un calculo desde el Centro de Operaciones primero.'
            : 'Run a calculation from the Operations Center first.'}
        </p>
        <button
          onClick={() => router.push('/operate')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#7c3aed' }}
        >
          {isSpanish ? 'Ir a Operaciones' : 'Go to Operations'}
        </button>
      </div>
    );
  }

  // ── MAIN LAYOUT ──
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">
            {isSpanish ? 'Estudio de Reconciliacion' : 'Reconciliation Studio'}
          </h1>
          <p className="text-sm text-zinc-400">
            {pageData.ruleSetName ?? (isSpanish ? 'Plan activo' : 'Active plan')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              <button
                onClick={() => { setParsedFile(null); setAutoMap(null); setResult(null); setError(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 transition-colors"
                style={{ backgroundColor: 'rgba(39, 39, 42, 0.8)', border: '1px solid rgba(63, 63, 70, 0.6)' }}
              >
                {isSpanish ? 'Nuevo Upload' : 'New Upload'}
              </button>
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 transition-colors"
                style={{ backgroundColor: 'rgba(39, 39, 42, 0.8)', border: '1px solid rgba(63, 63, 70, 0.6)' }}
              >
                {isSpanish ? 'Exportar CSV' : 'Export CSV'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Step 1: Batch Selector */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Seleccionar Calculo' : 'Select Calculation'}
        </h4>
        <select
          value={selectedBatchId ?? ''}
          onChange={(e) => { setSelectedBatchId(e.target.value); setResult(null); }}
          className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-900 text-zinc-200 border border-zinc-700 focus:border-violet-500 focus:outline-none"
        >
          {batchOptions.map(b => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
        {selectedBatch && (
          <p className="text-[11px] text-zinc-500 mt-2">
            {selectedBatch.entityCount} {isSpanish ? 'entidades' : 'entities'} · {selectedBatch.lifecycleState} · {new Date(selectedBatch.createdAt).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US')}
          </p>
        )}
      </div>

      {/* Step 2: Benchmark Upload + Auto-Map */}
      {!result && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
            {isSpanish ? 'Subir Archivo Benchmark' : 'Upload Benchmark File'}
          </h4>

          {!parsedFile ? (
            <div
              className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center transition-colors cursor-pointer hover:border-zinc-500"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#7c3aed'; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = ''; }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ''; const file = e.dataTransfer.files[0]; if (file) parseFile(file); }}
            >
              <div className="text-3xl mb-3">📄</div>
              <p className="text-sm text-zinc-300">
                {isSpanish ? 'Arrastra CSV o XLSX aqui, o haz clic para seleccionar' : 'Drop CSV or XLSX here, or click to browse'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {isSpanish ? 'Archivo de pagos de referencia para comparar' : 'Ground-truth payout file for comparison'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300">
                  📄 {parsedFile.fileName} · {parsedFile.rows.length} rows · {parsedFile.headers.length} columns
                </p>
                <button
                  onClick={() => { setParsedFile(null); setAutoMap(null); setEmployeeIdCol(null); setTotalPayoutCol(null); }}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  {isSpanish ? 'Borrar' : 'Clear'}
                </button>
              </div>

              {/* Auto-map results */}
              {autoMap && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{isSpanish ? 'Mapeo Automatico' : 'Auto-Map Results'}</p>

                  {/* Employee ID mapping */}
                  <div className="flex items-center gap-3">
                    <span className={autoMap.employeeIdColumn ? 'text-emerald-400' : 'text-red-400'}>
                      {autoMap.employeeIdColumn ? '✓' : '○'}
                    </span>
                    <span className="text-xs text-zinc-400 w-28">Employee ID:</span>
                    <select
                      value={employeeIdCol ?? ''}
                      onChange={(e) => setEmployeeIdCol(e.target.value || null)}
                      className="flex-1 px-2 py-1 rounded text-xs bg-zinc-900 text-zinc-200 border border-zinc-700"
                    >
                      <option value="">-- {isSpanish ? 'Seleccionar' : 'Select'} --</option>
                      {parsedFile.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {autoMap.employeeIdConfidence > 0 && (
                      <span className="text-[10px] text-zinc-500">
                        {Math.round(autoMap.employeeIdConfidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Total Payout mapping */}
                  <div className="flex items-center gap-3">
                    <span className={autoMap.totalPayoutColumn ? 'text-emerald-400' : 'text-red-400'}>
                      {autoMap.totalPayoutColumn ? '✓' : '○'}
                    </span>
                    <span className="text-xs text-zinc-400 w-28">Total Payout:</span>
                    <select
                      value={totalPayoutCol ?? ''}
                      onChange={(e) => setTotalPayoutCol(e.target.value || null)}
                      className="flex-1 px-2 py-1 rounded text-xs bg-zinc-900 text-zinc-200 border border-zinc-700"
                    >
                      <option value="">-- {isSpanish ? 'Seleccionar' : 'Select'} --</option>
                      {parsedFile.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {autoMap.totalPayoutConfidence > 0 && (
                      <span className="text-[10px] text-zinc-500">
                        {Math.round(autoMap.totalPayoutConfidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Data preview */}
              {parsedFile.rows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-900">
                        {parsedFile.headers.slice(0, 8).map(h => (
                          <th key={h} className={`px-3 py-2 text-left font-medium ${
                            h === employeeIdCol ? 'text-emerald-400' : h === totalPayoutCol ? 'text-violet-400' : 'text-zinc-400'
                          }`}>
                            {h}
                            {h === employeeIdCol && ' (ID)'}
                            {h === totalPayoutCol && ' ($)'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedFile.rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-zinc-800">
                          {parsedFile.headers.slice(0, 8).map(h => (
                            <td key={h} className="px-3 py-1.5 text-zinc-300 font-mono">
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Run button */}
              <button
                onClick={handleRunReconciliation}
                disabled={!employeeIdCol || !totalPayoutCol || isReconciling}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: (!employeeIdCol || !totalPayoutCol || isReconciling) ? '#3f3f46' : '#059669',
                  boxShadow: (!employeeIdCol || !totalPayoutCol || isReconciling) ? 'none' : '0 0 16px rgba(5, 150, 105, 0.3)',
                }}
              >
                {isReconciling
                  ? (isSpanish ? 'Reconciliando...' : 'Reconciling...')
                  : (isSpanish ? 'Ejecutar Reconciliacion' : 'Run Reconciliation')} →
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) parseFile(file); }}
            className="hidden"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg text-sm text-red-300" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      {/* Step 3: Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: isSpanish ? 'Coincidencias' : 'Matched', value: String(result.matched.length), color: '#10b981' },
              { label: isSpanish ? 'Tasa' : 'Match Rate', value: `${result.matchRate.toFixed(1)}%`, color: '#7c3aed' },
              { label: isSpanish ? 'Δ Promedio' : 'Avg Δ', value: formatCurrency(result.avgDelta), color: '#f59e0b' },
              { label: isSpanish ? 'Solo VL' : 'VL-Only', value: String(result.vlOnly.length), color: '#6b7280' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl text-center" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px' }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color: card.color }}>{card.value}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Aggregate Totals */}
          <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">VL Total</p>
                <p className="text-lg font-bold text-zinc-100 tabular-nums">{formatCurrency(result.vlTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Benchmark Total</p>
                <p className="text-lg font-bold text-zinc-100 tabular-nums">{formatCurrency(result.benchmarkTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Delta</p>
                <p className={`text-lg font-bold tabular-nums ${Math.abs(result.aggregateDeltaPercent) < 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatCurrency(Math.abs(result.aggregateDelta))} ({result.aggregateDeltaPercent.toFixed(2)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Employee Table */}
          <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {isSpanish ? 'Detalle por Entidad' : 'Per-Entity Detail'}
              </h4>
              <input
                type="text"
                placeholder={isSpanish ? 'Buscar...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs bg-zinc-900 text-zinc-200 border border-zinc-700 focus:border-violet-500 focus:outline-none w-48"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-zinc-900">
                    <th className="px-3 py-2 text-left">
                      <button className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('externalId')}>
                        ID {sortField === 'externalId' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-zinc-400">
                      <button className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('entityName')}>
                        Name {sortField === 'entityName' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button className="flex items-center gap-1 ml-auto text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('vlTotal')}>
                        VL Total {sortField === 'vlTotal' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button className="flex items-center gap-1 ml-auto text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('benchmarkTotal')}>
                        Benchmark {sortField === 'benchmarkTotal' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button className="flex items-center gap-1 ml-auto text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('delta')}>
                        Δ {sortField === 'delta' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-center text-zinc-400">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                      <td className="px-3 py-2 font-mono text-zinc-300">{row.externalId}</td>
                      <td className="px-3 py-2 text-zinc-400 truncate max-w-[200px]">{row.entityName}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200 tabular-nums">{formatCurrency(row.vlTotal)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200 tabular-nums">{formatCurrency(row.benchmarkTotal)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                        row.flag === 'exact' ? 'text-emerald-400' :
                        row.flag === 'tolerance' ? 'text-emerald-300' :
                        row.flag === 'amber' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {row.delta >= 0 ? '+' : ''}{formatCurrency(row.delta)}
                      </td>
                      <td className="px-3 py-2 text-center text-base">{flagIcon(row.flag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedResults.length > 200 && (
              <p className="text-[11px] text-zinc-500 mt-2 text-center">
                {isSpanish ? 'Mostrando' : 'Showing'} 200 / {sortedResults.length}
              </p>
            )}
          </div>

          {/* Unmatched populations */}
          {(result.vlOnly.length > 0 || result.fileOnly.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.vlOnly.length > 0 && (
                <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px' }}>
                  <h5 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                    {isSpanish ? 'Solo en VL' : 'VL-Only'} ({result.vlOnly.length})
                  </h5>
                  <div className="text-xs text-zinc-400 max-h-[120px] overflow-y-auto space-y-0.5">
                    {result.vlOnly.slice(0, 20).map((id, i) => (
                      <p key={i} className="font-mono">{id}</p>
                    ))}
                    {result.vlOnly.length > 20 && <p>... +{result.vlOnly.length - 20} more</p>}
                  </div>
                </div>
              )}
              {result.fileOnly.length > 0 && (
                <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px' }}>
                  <h5 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                    {isSpanish ? 'Solo en Benchmark' : 'File-Only'} ({result.fileOnly.length})
                  </h5>
                  <div className="text-xs text-zinc-400 max-h-[120px] overflow-y-auto space-y-0.5">
                    {result.fileOnly.slice(0, 20).map((id, i) => (
                      <p key={i} className="font-mono">{id}</p>
                    ))}
                    {result.fileOnly.length > 20 && <p>... +{result.fileOnly.length - 20} more</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
