'use client';

/**
 * GPV Wizard — Guided Proof of Value
 *
 * 3-step activation wizard: Upload Plan → Upload Data → See Results
 * Takes a new user from signup to seeing their own calculations in ~5 minutes.
 *
 * Reuses existing pipelines:
 *   - Plan: parseFile + interpretPlanDocument + /api/plan/import
 *   - Data: parseFile + directCommitImportDataAsync
 *   - Calc: runCalculation + getCalculationResults
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { parseFile, type ParsedFile } from '@/lib/import-pipeline/file-parser';
import { interpretPlanDocument } from '@/lib/compensation/plan-interpreter';
import { directCommitImportDataAsync } from '@/lib/supabase/data-service';
import { runCalculation, type CalculationRunResult } from '@/lib/calculation/run-calculation';
import { getCalculationResults } from '@/lib/supabase/calculation-service';
import { useGPV } from '@/hooks/useGPV';
import { Check, Upload, Loader2, FileSpreadsheet, BarChart3, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

interface GPVWizardProps {
  tenantId: string;
  tenantName: string;
}

// ─── Types ───
interface PlanResult {
  planConfig: Record<string, unknown>;
  components: Array<{ name: string; type: string; confidence: number; reasoning?: string }>;
  planName: string;
  ruleSetId: string;
}

interface DataResult {
  batchId: string;
  recordCount: number;
  entityCount: number;
  periodId: string | null;
}

interface CalcResult {
  batchId: string;
  entityCount: number;
  totalPayout: number;
  results: Array<{ entity_name: string; total_payout: number; component_count: number }>;
}

// ─── Styles ───
const CARD: React.CSSProperties = {
  background: '#0F172A',
  border: '1px solid #1E293B',
  borderRadius: '12px',
  padding: '32px',
};

const DROP_ZONE_BASE: React.CSSProperties = {
  border: '2px dashed #334155',
  borderRadius: '12px',
  padding: '48px 24px',
  textAlign: 'center' as const,
  cursor: 'pointer',
  transition: 'border-color 0.2s, background 0.2s',
};

const DROP_ZONE_ACTIVE: React.CSSProperties = {
  ...DROP_ZONE_BASE,
  borderColor: '#E8A838',
  background: 'rgba(232, 168, 56, 0.05)',
};

const BTN_PRIMARY: React.CSSProperties = {
  background: '#2D2F8F',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  padding: '12px 28px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
};

const BTN_GHOST: React.CSSProperties = {
  background: 'none',
  color: '#94A3B8',
  border: 'none',
  fontSize: '14px',
  cursor: 'pointer',
  padding: '8px 16px',
};

// ═══════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════

export function GPVWizard({ tenantId, tenantName }: GPVWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { advanceStep } = useGPV(tenantId);

  // Step state
  const [activeStep, setActiveStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1 state
  const [planLoading, setPlanLoading] = useState(false);
  const [planProgress, setPlanProgress] = useState(0);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Step 2 state
  const [dataLoading, setDataLoading] = useState(false);
  const [dataProgress, setDataProgress] = useState(0);
  const [dataResult, setDataResult] = useState<DataResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);
  const [dataDragging, setDataDragging] = useState(false);

  // Step 3 state
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // ─── Step 1: Plan Upload & Interpret ───
  const handlePlanFile = useCallback(async (file: File) => {
    setPlanLoading(true);
    setPlanError(null);
    setPlanProgress(10);

    try {
      // Parse file
      setPlanProgress(20);
      const parsedFile: ParsedFile = await parseFile(file);

      // Build document content (same as plan-import page)
      let documentContent = `File: ${file.name}\nFormat: ${parsedFile.format.toUpperCase()}\n\n`;

      if (parsedFile.format === 'pptx' && parsedFile.slides) {
        for (const slide of parsedFile.slides) {
          documentContent += `--- Slide ${slide.slideNumber} ---\n`;
          documentContent += slide.texts.join('\n') + '\n';
          for (const table of slide.tables) {
            documentContent += '\nTable:\n';
            if (table.headers.length > 0) {
              documentContent += '| ' + table.headers.join(' | ') + ' |\n';
            }
            for (const row of table.rows) {
              const rowValues = Array.isArray(row) ? row : Object.values(row);
              documentContent += '| ' + rowValues.join(' | ') + ' |\n';
            }
          }
          documentContent += '\n';
        }
      }

      if (parsedFile.rows.length > 0) {
        documentContent += '\n--- Data Rows ---\n';
        const headers = Object.keys(parsedFile.rows[0]);
        documentContent += '| ' + headers.join(' | ') + ' |\n';
        for (const row of parsedFile.rows.slice(0, 50)) {
          documentContent += '| ' + Object.values(row).join(' | ') + ' |\n';
        }
      }

      // AI interpretation
      setPlanProgress(40);
      const result = await interpretPlanDocument(
        documentContent,
        tenantId,
        user?.id || 'system',
        'en-US'
      );

      setPlanProgress(80);

      if (!result.success || !result.interpretation) {
        throw new Error(result.error || 'Plan interpretation failed');
      }

      const interpretation = result.interpretation;
      const components = (interpretation.components || []).map((comp) => ({
        name: comp.name || 'Unknown',
        type: comp.type || 'tier_lookup',
        confidence: comp.confidence ?? 50,
        reasoning: comp.reasoning,
      }));

      // Build planConfig for saving
      const now = new Date().toISOString();
      const ruleSetId = result.planConfig?.id || `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const planConfig = result.planConfig ? {
        ...result.planConfig,
        tenantId,
        createdBy: user?.id || 'system',
        updatedBy: user?.id || 'system',
        createdAt: now,
        updatedAt: now,
      } : {
        id: ruleSetId,
        tenantId,
        name: interpretation.ruleSetName || file.name.replace(/\.[^.]+$/, ''),
        description: interpretation.description || `Imported via GPV from ${file.name}`,
        ruleSetType: 'additive_lookup',
        status: 'draft',
        effectiveDate: now,
        endDate: null,
        eligibleRoles: [],
        configuration: { components: interpretation.components || [] },
        createdBy: user?.id || 'system',
        updatedBy: user?.id || 'system',
        createdAt: now,
        updatedAt: now,
      };

      await advanceStep('plan_uploaded');

      setPlanResult({
        planConfig: planConfig as Record<string, unknown>,
        components,
        planName: (planConfig as Record<string, unknown>).name as string || 'Imported Plan',
        ruleSetId: (planConfig as Record<string, unknown>).id as string || ruleSetId,
      });
      setPlanProgress(100);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Plan processing failed');
    } finally {
      setPlanLoading(false);
    }
  }, [tenantId, user, advanceStep]);

  // Confirm plan → save via API
  const confirmPlan = useCallback(async () => {
    if (!planResult) return;
    setPlanLoading(true);
    try {
      const response = await fetch('/api/plan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planConfig: planResult.planConfig, activate: true }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Plan save failed');
      }
      await advanceStep('plan_confirmed');
      setActiveStep(2);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Plan save failed');
    } finally {
      setPlanLoading(false);
    }
  }, [planResult, advanceStep]);

  // ─── Step 2: Data Upload & Commit ───
  const handleDataFile = useCallback(async (file: File) => {
    setDataLoading(true);
    setDataError(null);
    setDataProgress(10);

    try {
      // Read all sheets from Excel
      setDataProgress(20);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      const sheetData: Array<{ sheetName: string; rows: Record<string, unknown>[]; mappings?: Record<string, string> }> = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
        if (jsonRows.length > 0) {
          // Auto-map: use column names as-is (directCommitImportDataAsync handles entity ID detection)
          const headers = Object.keys(jsonRows[0]);
          const mappings: Record<string, string> = {};
          for (const h of headers) {
            mappings[h] = h; // identity mapping — data-service auto-detects entity ID fields
          }
          sheetData.push({ sheetName, rows: jsonRows, mappings });
        }
      }

      if (sheetData.length === 0) {
        throw new Error('No data rows found in uploaded file');
      }

      setDataProgress(50);
      await advanceStep('data_uploaded');

      // Commit data
      setDataProgress(70);
      const result = await directCommitImportDataAsync(
        tenantId,
        user?.id || 'system',
        file.name,
        sheetData
      );

      setDataProgress(100);
      await advanceStep('data_confirmed');

      setDataResult({
        batchId: result.batchId,
        recordCount: result.recordCount,
        entityCount: result.entityCount,
        periodId: result.periodId,
      });

      // Auto-advance to step 3
      setActiveStep(3);

      // Auto-trigger calculation
      triggerCalculation(result.periodId);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Data import failed');
    } finally {
      setDataLoading(false);
    }
  }, [tenantId, user, advanceStep]);

  // ─── Step 3: Calculate ───
  const triggerCalculation = useCallback(async (periodId: string | null) => {
    if (!planResult || !periodId) {
      setCalcError('Missing plan or period data for calculation');
      return;
    }

    setCalcLoading(true);
    setCalcError(null);
    setCalcProgress(20);

    try {
      setCalcProgress(40);
      const calcInput = {
        tenantId,
        periodId,
        ruleSetId: planResult.ruleSetId,
        userId: user?.id || 'system',
      };

      const result: CalculationRunResult = await runCalculation(calcInput);

      setCalcProgress(70);

      if (!result.success) {
        throw new Error(result.error || 'Calculation failed');
      }

      // Fetch detailed results
      const detailedResults = await getCalculationResults(tenantId, result.batchId);

      // Aggregate per entity
      const entityMap = new Map<string, { entity_name: string; total_payout: number; component_count: number }>();
      for (const r of detailedResults) {
        const entityId = (r as Record<string, unknown>).entity_id as string;
        const entityName = (r as Record<string, unknown>).entity_name as string || entityId;
        const payout = (r as Record<string, unknown>).total_payout as number || 0;
        const existing = entityMap.get(entityId);
        if (existing) {
          existing.total_payout += payout;
          existing.component_count += 1;
        } else {
          entityMap.set(entityId, { entity_name: entityName, total_payout: payout, component_count: 1 });
        }
      }

      setCalcProgress(100);
      await advanceStep('first_calculation');

      setCalcResult({
        batchId: result.batchId,
        entityCount: result.entityCount,
        totalPayout: result.totalPayout,
        results: Array.from(entityMap.values()).sort((a, b) => b.total_payout - a.total_payout),
      });
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setCalcLoading(false);
    }
  }, [tenantId, planResult, user, advanceStep]);

  // ─── Drag/Drop handlers ───
  const handleDragOver = (e: React.DragEvent, setter: (v: boolean) => void) => {
    e.preventDefault();
    setter(true);
  };
  const handleDragLeave = (setter: (v: boolean) => void) => setter(false);
  const handleDrop = (e: React.DragEvent, handler: (f: File) => void, setter: (v: boolean) => void) => {
    e.preventDefault();
    setter(false);
    const file = e.dataTransfer.files[0];
    if (file) handler(file);
  };

  const handleExploreDashboard = () => {
    router.push('/');
  };

  const handleSkip = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('gpv_skipped', 'true');
    }
    router.push('/');
  };

  // ─── Step indicator ───
  const steps = [
    { num: 1, label: 'Upload Plan', done: activeStep > 1 },
    { num: 2, label: 'Upload Data', done: activeStep > 2 },
    { num: 3, label: 'See Results', done: calcResult !== null },
  ];

  // ─── Format currency ───
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#E2E8F0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            Welcome to Vialuce, {tenantName}!
          </h1>
          <p style={{ fontSize: '16px', color: '#CBD5E1', marginTop: '8px' }}>
            Let&apos;s get your first calculation running. Three steps, five minutes.
          </p>
        </div>

        {/* Progress stepper */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginBottom: '40px' }}>
          {steps.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Step circle */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: step.done ? '#10B981' : activeStep === step.num ? '#E8A838' : '#1E293B',
                  color: step.done || activeStep === step.num ? '#FFFFFF' : '#94A3B8',
                  border: activeStep === step.num ? '2px solid #E8A838' : '2px solid transparent',
                }}>
                  {step.done ? <Check style={{ width: '16px', height: '16px' }} /> : step.num}
                </div>
                <span style={{
                  fontSize: '13px',
                  fontWeight: activeStep === step.num ? 600 : 400,
                  color: step.done ? '#10B981' : activeStep === step.num ? '#F8FAFC' : '#94A3B8',
                  whiteSpace: 'nowrap',
                }}>
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div style={{
                  width: '80px',
                  height: '2px',
                  background: step.done ? '#10B981' : '#334155',
                  margin: '0 12px',
                  marginBottom: '22px',
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={CARD}>
          {/* ═══ STEP 1: Upload Plan ═══ */}
          {activeStep === 1 && !planResult && (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#F8FAFC', margin: '0 0 8px' }}>
                Upload Your Compensation Plan
              </h2>
              <p style={{ fontSize: '14px', color: '#CBD5E1', margin: '0 0 24px' }}>
                Drag and drop your plan document here, or click to browse.
                Supported formats: PPTX, PDF, XLSX, CSV, or even a photo.
              </p>

              {planError && (
                <div style={{ background: '#1C1017', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#FCA5A5' }}>
                  {planError}
                </div>
              )}

              {planLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <Loader2 style={{ width: '32px', height: '32px', color: '#E8A838', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                  <p style={{ fontSize: '14px', color: '#CBD5E1' }}>Analyzing your plan... {planProgress}%</p>
                  <div style={{ width: '200px', height: '4px', background: '#1E293B', borderRadius: '2px', margin: '12px auto 0' }}>
                    <div style={{ width: `${planProgress}%`, height: '100%', background: '#E8A838', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => handleDragOver(e, setIsDragging)}
                  onDragLeave={() => handleDragLeave(setIsDragging)}
                  onDrop={(e) => handleDrop(e, handlePlanFile, setIsDragging)}
                  onClick={() => fileInputRef.current?.click()}
                  style={isDragging ? DROP_ZONE_ACTIVE : DROP_ZONE_BASE}
                >
                  <Upload style={{ width: '32px', height: '32px', color: '#94A3B8', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '14px', color: '#CBD5E1', margin: 0 }}>Drop file here or click to browse</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pptx,.pdf,.xlsx,.csv,.tsv,.json,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePlanFile(f); }}
                  />
                </div>
              )}

              <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '16px', textAlign: 'center' }}>
                The AI will interpret your plan structure, extract components, tiers, and rates.
              </p>
            </div>
          )}

          {/* Step 1: Plan results */}
          {activeStep === 1 && planResult && (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#F8FAFC', margin: '0 0 8px' }}>
                Plan Interpreted Successfully
              </h2>
              <p style={{ fontSize: '14px', color: '#CBD5E1', margin: '0 0 20px' }}>
                We found <strong style={{ color: '#F8FAFC' }}>{planResult.components.length}</strong> components in <strong style={{ color: '#F8FAFC' }}>{planResult.planName}</strong>.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {planResult.components.map((comp, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#0B1120',
                    borderRadius: '8px',
                    border: '1px solid #1E293B',
                  }}>
                    <div>
                      <span style={{ fontSize: '14px', color: '#F8FAFC', fontWeight: 500 }}>{comp.name}</span>
                      <span style={{ fontSize: '13px', color: '#94A3B8', marginLeft: '8px' }}>{comp.type}</span>
                    </div>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: comp.confidence >= 80 ? '#10B981' : comp.confidence >= 50 ? '#E8A838' : '#EF4444',
                    }}>
                      {comp.confidence}%
                    </span>
                  </div>
                ))}
              </div>

              {planError && (
                <div style={{ background: '#1C1017', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#FCA5A5' }}>
                  {planError}
                </div>
              )}

              <button onClick={confirmPlan} disabled={planLoading} style={{ ...BTN_PRIMARY, opacity: planLoading ? 0.6 : 1 }}>
                {planLoading ? <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> : null}
                Confirm Plan <ChevronRight style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          )}

          {/* ═══ STEP 2: Upload Data ═══ */}
          {activeStep === 2 && !dataResult && (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#F8FAFC', margin: '0 0 8px' }}>
                Upload Your Performance Data
              </h2>
              <p style={{ fontSize: '14px', color: '#CBD5E1', margin: '0 0 16px' }}>
                Drag and drop an Excel file with your performance or transaction data.
                The system will classify each sheet and map fields to your plan components.
              </p>

              {planResult && planResult.components.length > 0 && (
                <div style={{ background: '#0B1120', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', border: '1px solid #1E293B' }}>
                  <p style={{ fontSize: '13px', color: '#94A3B8', margin: '0 0 8px' }}>Your plan expects these metrics:</p>
                  {planResult.components.map((comp, i) => (
                    <div key={i} style={{ fontSize: '14px', color: '#CBD5E1', padding: '2px 0' }}>
                      <FileSpreadsheet style={{ width: '14px', height: '14px', display: 'inline', verticalAlign: 'middle', marginRight: '6px', color: '#7B7FD4' }} />
                      {comp.name}
                    </div>
                  ))}
                </div>
              )}

              {dataError && (
                <div style={{ background: '#1C1017', border: '1px solid #EF4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', color: '#FCA5A5' }}>
                  {dataError}
                </div>
              )}

              {dataLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <Loader2 style={{ width: '32px', height: '32px', color: '#E8A838', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                  <p style={{ fontSize: '14px', color: '#CBD5E1' }}>Importing your data... {dataProgress}%</p>
                  <div style={{ width: '200px', height: '4px', background: '#1E293B', borderRadius: '2px', margin: '12px auto 0' }}>
                    <div style={{ width: `${dataProgress}%`, height: '100%', background: '#E8A838', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => handleDragOver(e, setDataDragging)}
                  onDragLeave={() => handleDragLeave(setDataDragging)}
                  onDrop={(e) => handleDrop(e, handleDataFile, setDataDragging)}
                  onClick={() => dataFileInputRef.current?.click()}
                  style={dataDragging ? DROP_ZONE_ACTIVE : DROP_ZONE_BASE}
                >
                  <Upload style={{ width: '32px', height: '32px', color: '#94A3B8', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '14px', color: '#CBD5E1', margin: 0 }}>Drop Excel file here or click to browse</p>
                  <input
                    ref={dataFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDataFile(f); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 3: Calculation Results ═══ */}
          {activeStep === 3 && (
            <div>
              {calcLoading && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <Loader2 style={{ width: '32px', height: '32px', color: '#E8A838', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                  <p style={{ fontSize: '16px', color: '#F8FAFC', fontWeight: 600 }}>Calculating Your Results...</p>
                  <div style={{ width: '300px', height: '6px', background: '#1E293B', borderRadius: '3px', margin: '16px auto 0' }}>
                    <div style={{ width: `${calcProgress}%`, height: '100%', background: '#E8A838', borderRadius: '3px', transition: 'width 0.3s' }} />
                  </div>
                  <p style={{ fontSize: '14px', color: '#94A3B8', marginTop: '12px' }}>
                    Running preview calculation for {dataResult?.entityCount || 0} entities...
                  </p>
                </div>
              )}

              {calcError && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ background: '#1C1017', border: '1px solid #EF4444', borderRadius: '8px', padding: '16px', marginBottom: '16px', fontSize: '14px', color: '#FCA5A5' }}>
                    {calcError}
                  </div>
                  <button onClick={() => triggerCalculation(dataResult?.periodId || null)} style={BTN_PRIMARY}>
                    Retry Calculation
                  </button>
                </div>
              )}

              {calcResult && (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                      <Check style={{ width: '32px', height: '32px', color: '#10B981', display: 'inline' }} />
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F8FAFC', margin: '0 0 4px' }}>
                      Preview Complete — {calcResult.entityCount} entities calculated
                    </h2>
                  </div>

                  {/* Results table */}
                  <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155' }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: '#94A3B8', fontWeight: 500 }}>Entity</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: '#94A3B8', fontWeight: 500 }}>Total Payout</th>
                          <th style={{ textAlign: 'right', padding: '10px 12px', color: '#94A3B8', fontWeight: 500 }}>Components</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcResult.results.slice(0, 15).map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #1E293B' }}>
                            <td style={{ padding: '10px 12px', color: '#F8FAFC' }}>{r.entity_name}</td>
                            <td style={{ padding: '10px 12px', color: '#F8FAFC', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(r.total_payout)}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#94A3B8', textAlign: 'right' }}>
                              {r.component_count}
                            </td>
                          </tr>
                        ))}
                        {calcResult.results.length > 15 && (
                          <tr>
                            <td colSpan={3} style={{ padding: '10px 12px', color: '#94A3B8', fontSize: '13px' }}>
                              ... and {calcResult.results.length - 15} more entities
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #334155' }}>
                          <td style={{ padding: '12px', color: '#F8FAFC', fontWeight: 700 }}>Total</td>
                          <td style={{ padding: '12px', color: '#F8FAFC', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(calcResult.totalPayout)}
                          </td>
                          <td style={{ padding: '12px', color: '#94A3B8', textAlign: 'right' }}>
                            {calcResult.entityCount} entities
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Success message */}
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid #10B981',
                    borderRadius: '8px',
                    padding: '16px 20px',
                    marginBottom: '24px',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontSize: '16px', color: '#10B981', fontWeight: 600, margin: '0 0 4px' }}>
                      Your first calculation is complete!
                    </p>
                    <p style={{ fontSize: '14px', color: '#CBD5E1', margin: 0 }}>
                      You just did in 5 minutes what takes 8-12 weeks with other platforms.
                    </p>
                  </div>

                  {/* CTAs */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button onClick={handleExploreDashboard} style={BTN_PRIMARY}>
                      <BarChart3 style={{ width: '16px', height: '16px' }} />
                      Explore Your Dashboard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trial badge + Skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
          <div style={{
            background: '#1E293B',
            border: '1px solid #E8A838',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            color: '#E8A838',
          }}>
            14-day free trial. No credit card required.
          </div>
          <button onClick={handleSkip} style={BTN_GHOST}>
            Skip setup, explore the platform
          </button>
        </div>
      </div>
    </div>
  );
}
