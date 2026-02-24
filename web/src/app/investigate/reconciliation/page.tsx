'use client';

/**
 * OB-87: Reconciliation Studio — Discoverable Depth, Period Awareness, False Green Detection
 *
 * Full reconciliation workflow:
 * 1. Select calculation batch to compare against
 * 2. Upload benchmark file (CSV/XLSX)
 * 3. AI analyzes file → depth assessment + period discovery
 * 4. User confirms mappings → run enhanced comparison
 * 5. Results with false green surfacing, period context, component drill-down
 *
 * Korean Test compliant — zero hardcoded column names.
 * Bilingual: en-US / es-MX
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { loadReconciliationPageData, type ReconciliationPageData } from '@/lib/data/page-loaders';
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
  format: string;
  sheetNames: string[];
  activeSheet: string;
  totalRows: number;
}

type MatchFlag = 'exact' | 'tolerance' | 'amber' | 'red';
type SortField = 'externalId' | 'entityName' | 'vlTotal' | 'benchmarkTotal' | 'delta';

type StepType = 'select_batch' | 'upload' | 'analysis' | 'results';

// Analysis types (from API response)
interface DepthLevel {
  level: number;
  name: string;
  nameEs: string;
  available: boolean;
  confidence: number;
  detail: string;
  detailEs: string;
}

interface PeriodValue {
  month: number | null;
  year: number | null;
  label: string;
  rawValues: unknown[];
}

interface ColumnMappingInfo {
  sourceColumn: string;
  semanticType: string;
  confidence: number;
  sampleValues: unknown[];
}

interface AnalysisResult {
  entityIdColumn: ColumnMappingInfo | null;
  totalPayoutColumn: ColumnMappingInfo | null;
  periodColumns: ColumnMappingInfo[];
  componentColumns: ColumnMappingInfo[];
  depthAssessment: { levels: DepthLevel[]; maxDepth: number };
  periodDiscovery: {
    hasPeriodData: boolean;
    periodColumns: string[];
    distinctPeriods: PeriodValue[];
    rowsPerPeriod: Record<string, number>;
  };
  headers: string[];
  rowCount: number;
}

interface PeriodMatchResult {
  matched: { benchmarkPeriod: PeriodValue; vlPeriod: { id: string; label: string } }[];
  benchmarkOnly: PeriodValue[];
  vlOnly: { id: string; label: string }[];
}

interface Finding {
  priority: number;
  type: string;
  entityId?: string;
  message: string;
  messageEs: string;
  detail: string;
}

interface ComparisonResultData {
  employees: Array<{
    entityId: string;
    entityName: string;
    population: 'matched' | 'file_only' | 'vl_only';
    fileTotal: number;
    vlTotal: number;
    totalDelta: number;
    totalDeltaPercent: number;
    totalFlag: MatchFlag;
    components: Array<{
      componentId: string;
      componentName: string;
      fileValue: number;
      vlValue: number;
      delta: number;
      deltaPercent: number;
      flag: MatchFlag;
    }>;
  }>;
  summary: {
    totalEmployees: number;
    matched: number;
    fileOnly: number;
    vlOnly: number;
    exactMatches: number;
    toleranceMatches: number;
    amberFlags: number;
    redFlags: number;
    fileTotalAmount: number;
    vlTotalAmount: number;
    totalDelta: number;
  };
  falseGreenCount: number;
  findings: Finding[];
  periodsCompared: string[];
  depthAchieved: number;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const CARD_STYLE = { background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' };

function depthIcon(available: boolean, confidence: number): string {
  if (!available) return '⚪';
  if (confidence >= 0.8) return '🟢';
  if (confidence >= 0.5) return '🟡';
  return '🔍';
}

function findingColor(type: string): string {
  switch (type) {
    case 'false_green': return '#ef4444';
    case 'red_flag': return '#ef4444';
    case 'warning': return '#f59e0b';
    case 'tolerance': return '#10b981';
    case 'exact': return '#10b981';
    case 'population': return '#6b7280';
    default: return '#94a3b8';
  }
}

function findingLabel(type: string, isSpanish: boolean): string {
  switch (type) {
    case 'false_green': return isSpanish ? 'VERDE FALSO' : 'FALSE GREEN';
    case 'red_flag': return isSpanish ? 'ALERTA' : 'RED FLAG';
    case 'warning': return isSpanish ? 'ADVERTENCIA' : 'WARNING';
    case 'tolerance': return isSpanish ? 'TOLERANCIA' : 'TOLERANCE';
    case 'exact': return isSpanish ? 'EXACTO' : 'EXACT';
    case 'population': return isSpanish ? 'POBLACION' : 'POPULATION';
    default: return type;
  }
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
  const userId = user?.id || '';

  // State
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<ReconciliationPageData | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [step, setStep] = useState<StepType>('select_batch');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [periodMatch, setPeriodMatch] = useState<PeriodMatchResult | null>(null);

  // Mapping overrides
  const [entityIdCol, setEntityIdCol] = useState<string | null>(null);
  const [totalPayoutCol, setTotalPayoutCol] = useState<string | null>(null);

  // Comparison state
  const [comparing, setComparing] = useState(false);
  const [compResult, setCompResult] = useState<ComparisonResultData | null>(null);
  const [periodFilter, setPeriodFilter] = useState<{ originalCount: number; filteredCount: number } | null>(null);

  // Results UI
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('delta');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
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

  // Batch options
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

  // File parsing (client-side)
  const parseFile = useCallback((file: File) => {
    setError(null);
    setCompResult(null);
    setAnalysis(null);
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
        const parsed: ParsedFile = {
          fileName: file.name,
          headers,
          rows: jsonData,
          format: file.name.endsWith('.csv') ? 'csv' : 'xlsx',
          sheetNames: workbook.SheetNames,
          activeSheet: firstSheet,
          totalRows: jsonData.length,
        };
        setParsedFile(parsed);
        setStep('upload');
      } catch (err) {
        setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Run analysis (AI column mapping + period discovery + depth assessment)
  const handleAnalyze = useCallback(async () => {
    if (!parsedFile || !selectedBatchId || !tenantId) return;
    setAnalyzing(true);
    setError(null);
    try {
      const resp = await fetch('/api/reconciliation/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          userId,
          parsedFile,
          batchId: selectedBatchId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Analysis failed');

      setAnalysis(data.analysis);
      setPeriodMatch(data.periodMatch);
      setEntityIdCol(data.analysis.entityIdColumn?.sourceColumn ?? null);
      setTotalPayoutCol(data.analysis.totalPayoutColumn?.sourceColumn ?? null);
      setStep('analysis');
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAnalyzing(false);
    }
  }, [parsedFile, selectedBatchId, tenantId, userId]);

  // Run comparison
  const handleCompare = useCallback(async () => {
    if (!parsedFile || !selectedBatchId || !tenantId || !entityIdCol || !totalPayoutCol) return;
    setComparing(true);
    setError(null);
    try {
      // Build mappings for the comparison engine
      const mappings = [];
      if (entityIdCol) mappings.push({ sourceColumn: entityIdCol, mappedTo: 'entity_id', mappedToLabel: 'Entity ID', confidence: 1, reasoning: 'User confirmed', isUserOverride: false });
      if (totalPayoutCol) mappings.push({ sourceColumn: totalPayoutCol, mappedTo: 'total_amount', mappedToLabel: 'Total Payout', confidence: 1, reasoning: 'User confirmed', isUserOverride: false });
      if (analysis?.componentColumns) {
        for (const cc of analysis.componentColumns) {
          mappings.push({ sourceColumn: cc.sourceColumn, mappedTo: cc.semanticType, mappedToLabel: cc.sourceColumn, confidence: cc.confidence, reasoning: 'AI classified', isUserOverride: false });
        }
      }

      // Determine target periods from period matching
      const targetPeriods = periodMatch?.matched?.map(m => m.benchmarkPeriod) ?? [];

      const resp = await fetch('/api/reconciliation/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          batchId: selectedBatchId,
          fileRows: parsedFile.rows,
          mappings,
          entityIdField: entityIdCol,
          totalAmountField: totalPayoutCol,
          periodColumns: analysis?.periodColumns,
          targetPeriods: targetPeriods.length > 0 ? targetPeriods : undefined,
          depthAchieved: analysis?.depthAssessment?.maxDepth ?? 2,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Comparison failed');

      setCompResult(data.result);
      setPeriodFilter(data.periodFilter);
      setStep('results');

      // Save session (fire-and-forget)
      fetch('/api/reconciliation/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          userId,
          batchId: selectedBatchId,
          config: {
            benchmarkFileName: parsedFile.fileName,
            mappings: { entityId: entityIdCol, totalPayout: totalPayoutCol },
            entityIdField: entityIdCol,
            totalAmountField: totalPayoutCol,
            periodColumns: analysis?.periodColumns?.map(p => p.sourceColumn) ?? [],
            componentMappings: Object.fromEntries((analysis?.componentColumns ?? []).map(c => [c.sourceColumn, c.semanticType])),
            periodsCompared: data.result.periodsCompared,
            depthAchieved: data.result.depthAchieved,
          },
          results: {
            employees: data.result.employees?.slice(0, 100),
            findings: data.result.findings,
          },
          summary: {
            ...data.result.summary,
            falseGreenCount: data.result.falseGreenCount,
          },
        }),
      }).catch(err => console.warn('[Reconciliation] Save failed:', err));
    } catch (err) {
      setError(`Comparison failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setComparing(false);
    }
  }, [parsedFile, selectedBatchId, tenantId, userId, entityIdCol, totalPayoutCol, analysis, periodMatch]);

  // Sort and filter matched results
  const matchedRows = useMemo(() => {
    if (!compResult) return [];
    let rows = compResult.employees.filter(e => e.population === 'matched');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.entityId.toLowerCase().includes(q) || r.entityName.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      if (sortField === 'externalId') {
        return sortAsc ? a.entityId.localeCompare(b.entityId) : b.entityId.localeCompare(a.entityId);
      }
      if (sortField === 'entityName') {
        return sortAsc ? a.entityName.localeCompare(b.entityName) : b.entityName.localeCompare(a.entityName);
      }
      const aVal = sortField === 'vlTotal' ? a.vlTotal : sortField === 'benchmarkTotal' ? a.fileTotal : Math.abs(a.totalDelta);
      const bVal = sortField === 'vlTotal' ? b.vlTotal : sortField === 'benchmarkTotal' ? b.fileTotal : Math.abs(b.totalDelta);
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [compResult, searchQuery, sortField, sortAsc]);

  // CSV Export
  const handleExportCSV = useCallback(() => {
    if (!compResult) return;
    const matched = compResult.employees.filter(e => e.population === 'matched');
    const csvHeaders = ['Entity ID', 'Name', 'VL Total', 'Benchmark Total', 'Delta', 'Delta %', 'Flag'];
    const csvRows = [csvHeaders.join(',')];
    for (const row of matched) {
      csvRows.push([
        `"${row.entityId}"`, `"${row.entityName}"`,
        row.vlTotal.toFixed(2), row.fileTotal.toFixed(2),
        row.totalDelta.toFixed(2), (row.totalDeltaPercent * 100).toFixed(2) + '%',
        row.totalFlag,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-${selectedBatchId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [compResult, selectedBatchId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const handleReset = () => {
    setParsedFile(null);
    setAnalysis(null);
    setPeriodMatch(null);
    setCompResult(null);
    setPeriodFilter(null);
    setEntityIdCol(null);
    setTotalPayoutCol(null);
    setError(null);
    setStep('select_batch');
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
          {isSpanish ? 'Ejecuta un calculo desde el Centro de Operaciones primero.' : 'Run a calculation from the Operations Center first.'}
        </p>
        <button onClick={() => router.push('/operate')} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#7c3aed' }}>
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
          {step !== 'select_batch' && (
            <button onClick={handleReset} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300" style={{ ...CARD_STYLE }}>
              {isSpanish ? 'Reiniciar' : 'Reset'}
            </button>
          )}
          {compResult && (
            <button onClick={handleExportCSV} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300" style={{ ...CARD_STYLE }}>
              {isSpanish ? 'Exportar CSV' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Batch Selector */}
      <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Seleccionar Calculo' : 'Select Calculation'}
        </h4>
        <select
          value={selectedBatchId ?? ''}
          onChange={(e) => { setSelectedBatchId(e.target.value); handleReset(); }}
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

      {/* Step 2: Benchmark Upload */}
      {step !== 'results' && (
        <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
            {isSpanish ? 'Subir Archivo Benchmark' : 'Upload Benchmark File'}
          </h4>

          {!parsedFile ? (
            <div
              className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center cursor-pointer hover:border-zinc-500"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#7c3aed'; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = ''; }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ''; const file = e.dataTransfer.files[0]; if (file) parseFile(file); }}
            >
              <div className="text-3xl mb-3">📄</div>
              <p className="text-sm text-zinc-300">{isSpanish ? 'Arrastra CSV o XLSX aqui' : 'Drop CSV or XLSX here, or click to browse'}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{isSpanish ? 'Archivo de pagos de referencia' : 'Ground-truth payout file for comparison'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300">
                  📄 {parsedFile.fileName} · {parsedFile.rows.length} {isSpanish ? 'filas' : 'rows'} · {parsedFile.headers.length} {isSpanish ? 'columnas' : 'columns'}
                </p>
                <button onClick={() => { setParsedFile(null); setAnalysis(null); setStep('select_batch'); }} className="text-xs text-zinc-400 hover:text-zinc-200">
                  {isSpanish ? 'Borrar' : 'Clear'}
                </button>
              </div>

              {/* Data preview */}
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-900">
                      {parsedFile.headers.slice(0, 8).map(h => (
                        <th key={h} className={`px-3 py-2 text-left font-medium ${
                          h === entityIdCol ? 'text-emerald-400' : h === totalPayoutCol ? 'text-violet-400' : 'text-zinc-400'
                        }`}>
                          {h}
                          {h === entityIdCol && ' (ID)'}
                          {h === totalPayoutCol && ' ($)'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedFile.rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        {parsedFile.headers.slice(0, 8).map(h => (
                          <td key={h} className="px-3 py-1.5 text-zinc-300 font-mono">{String(row[h] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Analyze button */}
              {!analysis && (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: analyzing ? '#3f3f46' : '#7c3aed', boxShadow: analyzing ? 'none' : '0 0 16px rgba(124, 58, 237, 0.3)' }}
                >
                  {analyzing
                    ? (isSpanish ? 'Analizando...' : 'Analyzing benchmark...')
                    : (isSpanish ? 'Analizar Archivo' : 'Analyze Benchmark File')}
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) parseFile(file); }} className="hidden" />
        </div>
      )}

      {/* Step 3: Depth Assessment + Period Matching */}
      {analysis && step === 'analysis' && (
        <>
          {/* Depth Assessment */}
          <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
              {isSpanish ? 'Evaluacion de Profundidad' : 'Comparison Depth Assessment'}
            </h4>
            <div className="space-y-3">
              {analysis.depthAssessment.levels.map(level => (
                <div key={level.level} className="flex items-start gap-3">
                  <span className="text-base mt-0.5">{depthIcon(level.available, level.confidence)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${level.available ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        Level {level.level} — {isSpanish ? level.nameEs : level.name}
                      </span>
                      {level.available && level.confidence > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {Math.round(level.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{isSpanish ? level.detailEs : level.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Period Matching */}
          {periodMatch && analysis.periodDiscovery.hasPeriodData && (
            <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
                {isSpanish ? 'Coincidencia de Periodos' : 'Period Matching'}
              </h4>
              <div className="space-y-2">
                {periodMatch.matched.map((m, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-emerald-400 text-sm">✓</span>
                    <span className="text-sm text-zinc-200">{m.benchmarkPeriod.label}</span>
                    <span className="text-[10px] text-zinc-500">→</span>
                    <span className="text-sm text-zinc-400">{m.vlPeriod.label}</span>
                    <span className="text-[10px] text-zinc-500">
                      ({analysis.periodDiscovery.rowsPerPeriod[m.benchmarkPeriod.label] ?? '?'} {isSpanish ? 'filas' : 'rows'})
                    </span>
                  </div>
                ))}
                {periodMatch.benchmarkOnly.map((bp, i) => (
                  <div key={`bm-${i}`} className="flex items-center gap-3">
                    <span className="text-amber-400 text-sm">⚠</span>
                    <span className="text-sm text-zinc-400">{bp.label}</span>
                    <span className="text-[10px] text-zinc-500">
                      {isSpanish ? 'Sin calculo VL' : 'No VL calculation'}
                      ({analysis.periodDiscovery.rowsPerPeriod[bp.label] ?? '?'} {isSpanish ? 'filas excluidas' : 'rows excluded'})
                    </span>
                  </div>
                ))}
                {periodMatch.vlOnly.map((vp, i) => (
                  <div key={`vl-${i}`} className="flex items-center gap-3">
                    <span className="text-zinc-500 text-sm">○</span>
                    <span className="text-sm text-zinc-400">{vp.label}</span>
                    <span className="text-[10px] text-zinc-500">{isSpanish ? 'Sin datos benchmark' : 'No benchmark data'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapping confirmation + overrides */}
          <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
              {isSpanish ? 'Confirmar Mapeos' : 'Confirm Mappings'}
            </h4>
            <div className="space-y-3">
              {/* Entity ID */}
              <div className="flex items-center gap-3">
                <span className={entityIdCol ? 'text-emerald-400' : 'text-red-400'}>{entityIdCol ? '✓' : '○'}</span>
                <span className="text-xs text-zinc-400 w-32">{isSpanish ? 'ID Empleado:' : 'Employee ID:'}</span>
                <select value={entityIdCol ?? ''} onChange={(e) => setEntityIdCol(e.target.value || null)} className="flex-1 px-2 py-1 rounded text-xs bg-zinc-900 text-zinc-200 border border-zinc-700">
                  <option value="">-- {isSpanish ? 'Seleccionar' : 'Select'} --</option>
                  {parsedFile?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              {/* Total Payout */}
              <div className="flex items-center gap-3">
                <span className={totalPayoutCol ? 'text-emerald-400' : 'text-red-400'}>{totalPayoutCol ? '✓' : '○'}</span>
                <span className="text-xs text-zinc-400 w-32">{isSpanish ? 'Pago Total:' : 'Total Payout:'}</span>
                <select value={totalPayoutCol ?? ''} onChange={(e) => setTotalPayoutCol(e.target.value || null)} className="flex-1 px-2 py-1 rounded text-xs bg-zinc-900 text-zinc-200 border border-zinc-700">
                  <option value="">-- {isSpanish ? 'Seleccionar' : 'Select'} --</option>
                  {parsedFile?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              {/* Period columns (read-only display) */}
              {analysis.periodColumns.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400">✓</span>
                  <span className="text-xs text-zinc-400 w-32">{isSpanish ? 'Periodo:' : 'Period:'}</span>
                  <span className="text-xs text-zinc-300">{analysis.periodColumns.map(p => `"${p.sourceColumn}"`).join(' + ')}</span>
                </div>
              )}
              {/* Component columns (read-only display) */}
              {analysis.componentColumns.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-xs text-zinc-400 w-32 mt-0.5">{isSpanish ? 'Componentes:' : 'Components:'}</span>
                  <div className="flex-1 text-xs text-zinc-300 space-y-1">
                    {analysis.componentColumns.map(c => (
                      <div key={c.sourceColumn} className="flex items-center gap-2">
                        <span>"{c.sourceColumn}"</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-zinc-400">{c.semanticType}</span>
                        <span className="text-[10px] text-zinc-500">({Math.round(c.confidence * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Run comparison button */}
            <button
              onClick={handleCompare}
              disabled={!entityIdCol || !totalPayoutCol || comparing}
              className="w-full mt-6 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: (!entityIdCol || !totalPayoutCol || comparing) ? '#3f3f46' : '#059669', boxShadow: (!entityIdCol || !totalPayoutCol || comparing) ? 'none' : '0 0 16px rgba(5, 150, 105, 0.3)' }}
            >
              {comparing
                ? (isSpanish ? 'Comparando...' : 'Running comparison...')
                : (isSpanish ? 'Ejecutar Reconciliacion' : 'Run Reconciliation')} →
            </button>
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg text-sm text-red-300" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      {/* Step 4: Results */}
      {compResult && step === 'results' && (
        <>
          {/* Period filter info */}
          {periodFilter && periodFilter.originalCount !== periodFilter.filteredCount && (
            <div className="px-4 py-3 rounded-lg text-sm text-blue-300" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              {isSpanish
                ? `Periodo filtrado: ${periodFilter.filteredCount} de ${periodFilter.originalCount} filas comparadas`
                : `Period filtered: ${periodFilter.filteredCount} of ${periodFilter.originalCount} rows compared`}
              {compResult.periodsCompared.length > 0 && ` (${compResult.periodsCompared.join(', ')})`}
            </div>
          )}

          {/* Findings Panel (Priority-ordered) */}
          {compResult.findings.length > 0 && (
            <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
                {isSpanish ? 'Hallazgos' : 'Findings'}
                {compResult.falseGreenCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                    {compResult.falseGreenCount} {isSpanish ? 'VERDE FALSO' : 'FALSE GREEN'}
                  </span>
                )}
              </h4>
              <div className="space-y-2">
                {compResult.findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: `${findingColor(f.type)}10`, border: `1px solid ${findingColor(f.type)}30` }}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5" style={{ backgroundColor: `${findingColor(f.type)}20`, color: findingColor(f.type) }}>
                      {findingLabel(f.type, isSpanish)}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-200">{isSpanish ? f.messageEs : f.message}</p>
                      {f.detail && <p className="text-[10px] text-zinc-500 mt-0.5">{f.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: isSpanish ? 'Coincidencias' : 'Matched', value: String(compResult.summary.matched), color: '#10b981' },
              { label: isSpanish ? 'Tasa' : 'Match Rate', value: `${compResult.summary.totalEmployees > 0 ? ((compResult.summary.matched / compResult.summary.totalEmployees) * 100).toFixed(1) : 0}%`, color: '#7c3aed' },
              { label: isSpanish ? 'Verdes Falsos' : 'False Greens', value: String(compResult.falseGreenCount), color: compResult.falseGreenCount > 0 ? '#ef4444' : '#10b981' },
              { label: isSpanish ? 'Profundidad' : 'Depth', value: `L${compResult.depthAchieved}`, color: '#3b82f6' },
              { label: isSpanish ? 'Solo VL' : 'VL-Only', value: String(compResult.summary.vlOnly), color: '#6b7280' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl text-center" style={{ ...CARD_STYLE, padding: '16px' }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color: card.color }}>{card.value}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Aggregate Totals */}
          <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">VL Total</p>
                <p className="text-lg font-bold text-zinc-100 tabular-nums">{formatCurrency(compResult.summary.vlTotalAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Benchmark Total</p>
                <p className="text-lg font-bold text-zinc-100 tabular-nums">{formatCurrency(compResult.summary.fileTotalAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Delta</p>
                <p className={`text-lg font-bold tabular-nums ${
                  compResult.summary.fileTotalAmount !== 0 && Math.abs(compResult.summary.totalDelta / compResult.summary.fileTotalAmount) < 0.01 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {formatCurrency(Math.abs(compResult.summary.totalDelta))}
                  {compResult.summary.fileTotalAmount !== 0 && ` (${(Math.abs(compResult.summary.totalDelta / compResult.summary.fileTotalAmount) * 100).toFixed(2)}%)`}
                </p>
              </div>
            </div>
          </div>

          {/* Entity Table */}
          <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '20px' }}>
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
                        {isSpanish ? 'Nombre' : 'Name'} {sortField === 'entityName' && (sortAsc ? '↑' : '↓')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button className="flex items-center gap-1 ml-auto text-zinc-400 hover:text-zinc-200" onClick={() => handleSort('vlTotal')}>
                        VL {sortField === 'vlTotal' && (sortAsc ? '↑' : '↓')}
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
                  {matchedRows.slice(0, 200).map((row) => (
                    <>
                      <tr
                        key={row.entityId}
                        className={`border-t border-zinc-800 hover:bg-zinc-800/30 ${row.components.length > 0 ? 'cursor-pointer' : ''}`}
                        onClick={() => row.components.length > 0 && setExpandedEntity(expandedEntity === row.entityId ? null : row.entityId)}
                      >
                        <td className="px-3 py-2 font-mono text-zinc-300">{row.entityId}</td>
                        <td className="px-3 py-2 text-zinc-400 truncate max-w-[200px]">{row.entityName}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-200 tabular-nums">{formatCurrency(row.vlTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-200 tabular-nums">{formatCurrency(row.fileTotal)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                          row.totalFlag === 'exact' ? 'text-emerald-400' :
                          row.totalFlag === 'tolerance' ? 'text-emerald-300' :
                          row.totalFlag === 'amber' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {row.totalDelta >= 0 ? '+' : ''}{formatCurrency(row.totalDelta)}
                          {row.components.length > 0 && <span className="ml-1 text-zinc-500">{expandedEntity === row.entityId ? '▼' : '▶'}</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-base">{flagIcon(row.totalFlag)}</td>
                      </tr>
                      {/* Component drill-down */}
                      {expandedEntity === row.entityId && row.components.length > 0 && (
                        <tr key={`${row.entityId}-components`}>
                          <td colSpan={6} className="px-6 py-2 bg-zinc-900/50">
                            <div className="text-[10px] text-zinc-500 uppercase mb-2">
                              {isSpanish ? 'Desglose de Componentes' : 'Component Breakdown'}
                            </div>
                            <div className="grid gap-1">
                              {row.components.map(c => (
                                <div key={c.componentId} className="flex items-center gap-4 text-xs">
                                  <span className="w-40 text-zinc-400 truncate">{c.componentName}</span>
                                  <span className="w-24 text-right font-mono text-zinc-300">VL: {formatCurrency(c.vlValue)}</span>
                                  <span className="w-24 text-right font-mono text-zinc-300">BM: {formatCurrency(c.fileValue)}</span>
                                  <span className={`w-24 text-right font-mono ${
                                    c.flag === 'exact' ? 'text-emerald-400' :
                                    c.flag === 'tolerance' ? 'text-emerald-300' :
                                    c.flag === 'amber' ? 'text-amber-400' : 'text-red-400'
                                  }`}>
                                    {c.delta >= 0 ? '+' : ''}{formatCurrency(c.delta)}
                                  </span>
                                  <span className="text-base">{flagIcon(c.flag)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            {matchedRows.length > 200 && (
              <p className="text-[11px] text-zinc-500 mt-2 text-center">
                {isSpanish ? 'Mostrando' : 'Showing'} 200 / {matchedRows.length}
              </p>
            )}
          </div>

          {/* Population mismatches */}
          {(compResult.summary.vlOnly > 0 || compResult.summary.fileOnly > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {compResult.summary.vlOnly > 0 && (
                <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '16px' }}>
                  <h5 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                    {isSpanish ? 'Solo en VL' : 'VL-Only'} ({compResult.summary.vlOnly})
                  </h5>
                  <div className="text-xs text-zinc-400 max-h-[120px] overflow-y-auto space-y-0.5">
                    {compResult.employees.filter(e => e.population === 'vl_only').slice(0, 20).map((e, i) => (
                      <p key={i} className="font-mono">{e.entityId}</p>
                    ))}
                    {compResult.summary.vlOnly > 20 && <p>... +{compResult.summary.vlOnly - 20} more</p>}
                  </div>
                </div>
              )}
              {compResult.summary.fileOnly > 0 && (
                <div className="rounded-2xl" style={{ ...CARD_STYLE, padding: '16px' }}>
                  <h5 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                    {isSpanish ? 'Solo en Benchmark' : 'File-Only'} ({compResult.summary.fileOnly})
                  </h5>
                  <div className="text-xs text-zinc-400 max-h-[120px] overflow-y-auto space-y-0.5">
                    {compResult.employees.filter(e => e.population === 'file_only').slice(0, 20).map((e, i) => (
                      <p key={i} className="font-mono">{e.entityId}</p>
                    ))}
                    {compResult.summary.fileOnly > 20 && <p>... +{compResult.summary.fileOnly - 20} more</p>}
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
