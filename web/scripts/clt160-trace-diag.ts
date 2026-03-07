// CLT-160 Trace Diagnostic: Layer-by-layer classification analysis
// Reads Meridian_Datos_Q1_2025.xlsx and runs through the full SCI scoring pipeline
// Outputs every decision at every layer for all 3 sheets

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// SCI pipeline imports
import { generateContentProfile } from '../src/lib/sci/content-profile';
import { detectSignatures } from '../src/lib/sci/signatures';
import { computeAdditiveScores, applyHeaderComprehensionSignals } from '../src/lib/sci/agents';
import { computeStructuralFingerprint } from '../src/lib/sci/classification-signal-service';
import type { ContentProfile, AgentScore } from '../src/lib/sci/sci-types';

const XLSX_PATH = path.resolve(
  process.env.HOME || '~',
  'Desktop/ViaLuce AI/VL Demo Environment/VL DEMO/Meridian/Meridian_Datos_Q1_2025.xlsx'
);

// ============================================================
// PARSE XLSX
// ============================================================

function parseXLSX(filePath: string) {
  const workbook = XLSX.readFile(filePath);
  const sheets: Array<{
    sheetName: string;
    columns: string[];
    rows: Record<string, unknown>[];
    totalRowCount: number;
  }> = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    sheets.push({ sheetName, columns, rows, totalRowCount: rows.length });
  }

  return sheets;
}

// ============================================================
// DIAGNOSTIC OUTPUT
// ============================================================

interface SheetDiagnostic {
  sheetName: string;
  contentProfile: {
    rowCount: number;
    columnCount: number;
    sparsity: number;
    headerQuality: string;
    numericFieldRatio: number;
    categoricalFieldRatio: number;
    categoricalFieldCount: number;
    identifierRepeatRatio: number;
    hasEntityIdentifier: boolean;
    hasDateColumn: boolean;
    hasTemporalColumns: boolean;
    hasCurrencyColumns: number;
    hasPercentageValues: boolean;
    hasDescriptiveLabels: boolean;
    hasStructuralNameColumn: boolean;
    rowCountCategory: string;
    volumePattern: string;
  };
  fieldProfiles: Array<{
    fieldName: string;
    dataType: string;
    distinctCount: number;
    nullRate: number;
    distribution: Record<string, unknown>;
    nameSignals: Record<string, boolean>;
    sampleValues: unknown[];
  }>;
  observations: Array<{
    columnName: string | null;
    observationType: string;
    observedValue: unknown;
    confidence: number;
    structuralEvidence: string;
  }>;
  signatures: Array<{
    agent: string;
    confidence: number;
    signatureName: string;
    matchedConditions: string[];
  }>;
  round1Scores: Array<{
    agent: string;
    confidence: number;
    signals: Array<{ signal: string; weight: number; evidence: string }>;
  }>;
  // Simulated tenant context (plan exists, no entities, no data)
  tenantContextAdjustments: Array<{
    agent: string;
    adjustment: number;
    signal: string;
    evidence: string;
  }>;
  round2Adjustments: Array<{
    agent: string;
    adjustment: number;
    reason: string;
  }>;
  finalScores: Array<{
    agent: string;
    confidence: number;
  }>;
  finalClassification: string;
  finalConfidence: number;
  structuralFingerprint: Record<string, unknown>;
}

function diagnoseSheet(
  sheetName: string,
  columns: string[],
  rows: Record<string, unknown>[],
  totalRowCount: number,
  tabIndex: number,
  fileName: string,
): SheetDiagnostic {
  // Phase A: Content Profile
  const profile = generateContentProfile(
    sheetName,
    tabIndex,
    fileName,
    columns,
    rows,
    totalRowCount,
  );

  // Phase C Step 1: Signatures
  const signatures = detectSignatures(profile);

  // Phase C Step 2: Additive scores (includes signature floors)
  const scores = computeAdditiveScores(profile);

  // Capture Round 1 scores BEFORE tenant context and Round 2
  const round1Snapshot = scores.map(s => ({
    agent: s.agent,
    confidence: s.confidence,
    signals: s.signals.map(sig => ({ ...sig })),
  }));

  // Simulate tenant context: plan exists, 0 entities, 0 data
  // This mirrors Meridian state: existingPlanCount=1, existingEntityCount=0, committedDataRowCount=0
  const tenantContextAdjustments: SheetDiagnostic['tenantContextAdjustments'] = [];

  // SIGNAL 2: Plan exists + numeric content
  if (profile.structure.numericFieldRatio > 0.30) {
    const txn = scores.find(s => s.agent === 'transaction');
    if (txn) {
      txn.confidence = Math.max(0, Math.min(1, txn.confidence + 0.10));
      txn.signals.push({
        signal: 'tc_plan_exists_numeric_content',
        weight: 0.10,
        evidence: `Tenant has 1 plan. Sheet has ${Math.round(profile.structure.numericFieldRatio * 100)}% numeric fields`,
      });
      tenantContextAdjustments.push({
        agent: 'transaction',
        adjustment: +0.10,
        signal: 'plan_exists_numeric_content',
        evidence: `Tenant has 1 plan. Sheet has ${Math.round(profile.structure.numericFieldRatio * 100)}% numeric fields`,
      });
    }
  }
  // No entity overlap (no entities exist yet), no roster update candidate

  // Simulate Round 2 negotiation (copy logic from synaptic-ingestion-state.ts)
  const round2Adjustments: SheetDiagnostic['round2Adjustments'] = [];
  const transaction = scores.find(s => s.agent === 'transaction');
  const target = scores.find(s => s.agent === 'target');
  const entity = scores.find(s => s.agent === 'entity');
  const repeatRatio = profile.structure.identifierRepeatRatio;
  const hasTemporal = profile.patterns.hasDateColumn || profile.patterns.hasTemporalColumns;

  // Target penalty when repeat ratio contradicts target pattern
  if (transaction && target && target.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.25, (repeatRatio - 1.0) * 0.08);
    target.confidence = Math.max(0, target.confidence - penalty);
    round2Adjustments.push({
      agent: 'target',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern`,
    });
  }

  // Transaction boost: temporal + repeat
  if (transaction && target && hasTemporal && repeatRatio > 1.5) {
    const boost = 0.10;
    transaction.confidence = Math.min(1, transaction.confidence + boost);
    round2Adjustments.push({
      agent: 'transaction',
      adjustment: boost,
      reason: `Temporal + repeat ratio ${repeatRatio.toFixed(1)} confirms transactional`,
    });
  }

  // Entity penalty: high repeat
  if (entity && transaction && entity.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.20, (repeatRatio - 1.0) * 0.07);
    entity.confidence = Math.max(0, entity.confidence - penalty);
    round2Adjustments.push({
      agent: 'entity',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts roster pattern`,
    });
  }

  // Entity vs Target: high numeric ratio
  if (entity && target && Math.abs(entity.confidence - target.confidence) < 0.15) {
    const numericRatio = profile.structure.numericFieldRatio;
    if (numericRatio > 0.50) {
      const shift = 0.08;
      entity.confidence = Math.max(0, entity.confidence - shift);
      target.confidence = Math.min(1, target.confidence + shift);
      round2Adjustments.push({
        agent: 'entity',
        adjustment: -shift,
        reason: `${(numericRatio * 100).toFixed(0)}% numeric fields — entity rosters are attribute-heavy`,
      });
    }
  }

  // Absence clarity
  const sorted = scores.slice().sort((a, b) => b.confidence - a.confidence);
  if (sorted.length >= 2) {
    const gap = sorted[0].confidence - sorted[1].confidence;
    if (gap > 0.25) {
      sorted[0].confidence = Math.min(0.98, sorted[0].confidence + 0.05);
      round2Adjustments.push({
        agent: sorted[0].agent,
        adjustment: 0.05,
        reason: `Absence clarity: gap of ${(gap * 100).toFixed(0)}% to next agent`,
      });
    }
  }

  // Clamp
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }

  // Sort final
  scores.sort((a, b) => b.confidence - a.confidence);

  const fingerprint = computeStructuralFingerprint(profile);

  return {
    sheetName,
    contentProfile: {
      rowCount: profile.structure.rowCount,
      columnCount: profile.structure.columnCount,
      sparsity: profile.structure.sparsity,
      headerQuality: profile.structure.headerQuality,
      numericFieldRatio: profile.structure.numericFieldRatio,
      categoricalFieldRatio: profile.structure.categoricalFieldRatio,
      categoricalFieldCount: profile.structure.categoricalFieldCount,
      identifierRepeatRatio: profile.structure.identifierRepeatRatio,
      hasEntityIdentifier: profile.patterns.hasEntityIdentifier,
      hasDateColumn: profile.patterns.hasDateColumn,
      hasTemporalColumns: profile.patterns.hasTemporalColumns,
      hasCurrencyColumns: profile.patterns.hasCurrencyColumns,
      hasPercentageValues: profile.patterns.hasPercentageValues,
      hasDescriptiveLabels: profile.patterns.hasDescriptiveLabels,
      hasStructuralNameColumn: profile.patterns.hasStructuralNameColumn,
      rowCountCategory: profile.patterns.rowCountCategory,
      volumePattern: profile.patterns.volumePattern,
    },
    fieldProfiles: profile.fields.map(f => ({
      fieldName: f.fieldName,
      dataType: f.dataType,
      distinctCount: f.distinctCount,
      nullRate: f.nullRate,
      distribution: f.distribution as Record<string, unknown>,
      nameSignals: f.nameSignals as unknown as Record<string, boolean>,
      sampleValues: rows.slice(0, 3).map(r => r[f.fieldName]),
    })),
    observations: profile.observations.map(o => ({
      columnName: o.columnName,
      observationType: o.observationType,
      observedValue: o.observedValue,
      confidence: o.confidence,
      structuralEvidence: o.structuralEvidence,
    })),
    signatures: signatures.map(s => ({
      agent: s.agent,
      confidence: s.confidence,
      signatureName: s.signatureName,
      matchedConditions: s.matchedConditions,
    })),
    round1Scores: round1Snapshot,
    tenantContextAdjustments,
    round2Adjustments,
    finalScores: scores.map(s => ({
      agent: s.agent,
      confidence: Math.round(s.confidence * 100) / 100,
    })),
    finalClassification: scores[0].agent,
    finalConfidence: Math.round(scores[0].confidence * 100) / 100,
    structuralFingerprint: fingerprint as unknown as Record<string, unknown>,
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(`\n=== CLT-160 TRACE DIAGNOSTIC ===`);
  console.log(`File: ${XLSX_PATH}\n`);

  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`File not found: ${XLSX_PATH}`);
    process.exit(1);
  }

  const sheets = parseXLSX(XLSX_PATH);
  console.log(`Sheets found: ${sheets.map(s => s.sheetName).join(', ')}\n`);

  const diagnostics: SheetDiagnostic[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    console.log(`--- Diagnosing: ${sheet.sheetName} (${sheet.totalRowCount} rows, ${sheet.columns.length} columns) ---`);
    const diag = diagnoseSheet(
      sheet.sheetName,
      sheet.columns,
      sheet.rows,
      sheet.totalRowCount,
      i,
      'Meridian_Datos_Q1_2025.xlsx',
    );
    diagnostics.push(diag);

    console.log(`  Classification: ${diag.finalClassification} at ${(diag.finalConfidence * 100).toFixed(0)}%`);
    console.log(`  Signatures matched: ${diag.signatures.map(s => `${s.agent}:${s.signatureName}@${(s.confidence * 100).toFixed(0)}%`).join(', ') || 'NONE'}`);
    console.log();
  }

  // Write full diagnostics to JSON
  const jsonPath = '/tmp/clt160-trace-diagnostics.json';
  fs.writeFileSync(jsonPath, JSON.stringify(diagnostics, null, 2));
  console.log(`\nFull diagnostics written to: ${jsonPath}`);

  // Generate markdown report
  let md = '# CLT-160 Trace Diagnostic Report\n\n';
  md += '## File: Meridian_Datos_Q1_2025.xlsx\n\n';
  md += '| Sheet | Classification | Confidence | Expected | Correct? |\n';
  md += '|-------|---------------|------------|----------|----------|\n';

  const expected: Record<string, string> = {
    'Plantilla': 'entity',
    'Datos_Rendimiento': 'transaction',
    'Datos_Flota_Hub': 'reference',
  };

  for (const d of diagnostics) {
    const exp = expected[d.sheetName] || '?';
    const correct = d.finalClassification === exp ? 'YES' : 'NO';
    md += `| ${d.sheetName} | ${d.finalClassification} | ${(d.finalConfidence * 100).toFixed(0)}% | ${exp} | ${correct} |\n`;
  }
  md += '\n---\n\n';

  // Per-sheet detailed analysis
  for (const d of diagnostics) {
    md += `## ${d.sheetName}\n\n`;

    // Content Profile
    md += '### Content Profile (Phase A)\n';
    md += '| Property | Value |\n';
    md += '|----------|-------|\n';
    const cp = d.contentProfile;
    md += `| rowCount | ${cp.rowCount} |\n`;
    md += `| columnCount | ${cp.columnCount} |\n`;
    md += `| sparsity | ${(cp.sparsity * 100).toFixed(1)}% |\n`;
    md += `| headerQuality | ${cp.headerQuality} |\n`;
    md += `| numericFieldRatio | ${(cp.numericFieldRatio * 100).toFixed(1)}% |\n`;
    md += `| categoricalFieldRatio | ${(cp.categoricalFieldRatio * 100).toFixed(1)}% |\n`;
    md += `| categoricalFieldCount | ${cp.categoricalFieldCount} |\n`;
    md += `| identifierRepeatRatio | ${cp.identifierRepeatRatio.toFixed(2)} |\n`;
    md += `| hasEntityIdentifier | ${cp.hasEntityIdentifier} |\n`;
    md += `| hasDateColumn | ${cp.hasDateColumn} |\n`;
    md += `| hasTemporalColumns | ${cp.hasTemporalColumns} |\n`;
    md += `| hasCurrencyColumns | ${cp.hasCurrencyColumns} |\n`;
    md += `| hasPercentageValues | ${cp.hasPercentageValues} |\n`;
    md += `| hasDescriptiveLabels | ${cp.hasDescriptiveLabels} |\n`;
    md += `| hasStructuralNameColumn | ${cp.hasStructuralNameColumn} |\n`;
    md += `| rowCountCategory | ${cp.rowCountCategory} |\n`;
    md += `| volumePattern | ${cp.volumePattern} |\n`;
    md += '\n';

    // Field Profiles
    md += '### Field Profiles\n';
    md += '| Field | DataType | Distinct | NullRate | Sample Values |\n';
    md += '|-------|----------|----------|----------|---------------|\n';
    for (const f of d.fieldProfiles) {
      const samples = f.sampleValues.map(v => v === null ? 'null' : String(v)).join(', ');
      md += `| ${f.fieldName} | ${f.dataType} | ${f.distinctCount} | ${(f.nullRate * 100).toFixed(0)}% | ${samples.substring(0, 60)} |\n`;
    }
    md += '\n';

    // Name Signals
    md += '### Name Signals per Field\n';
    md += '| Field | containsId | containsName | containsTarget | containsDate | containsAmount | containsRate | looksLikePersonName |\n';
    md += '|-------|-----------|-------------|---------------|-------------|---------------|-------------|--------------------|\n';
    for (const f of d.fieldProfiles) {
      const ns = f.nameSignals;
      md += `| ${f.fieldName} | ${ns.containsId || false} | ${ns.containsName || false} | ${ns.containsTarget || false} | ${ns.containsDate || false} | ${ns.containsAmount || false} | ${ns.containsRate || false} | ${ns.looksLikePersonName || false} |\n`;
    }
    md += '\n';

    // Observations
    md += '### Observations\n';
    for (const o of d.observations) {
      md += `- **${o.observationType}** (${o.columnName || 'sheet-level'}): ${o.observedValue} @ ${(o.confidence * 100).toFixed(0)}% — ${o.structuralEvidence}\n`;
    }
    md += '\n';

    // Signatures
    md += '### Signature Matches (Phase C Step 1)\n';
    if (d.signatures.length === 0) {
      md += '_No signatures matched._\n';
    } else {
      for (const s of d.signatures) {
        md += `- **${s.agent}**: \`${s.signatureName}\` @ ${(s.confidence * 100).toFixed(0)}%\n`;
        for (const c of s.matchedConditions) {
          md += `  - ${c}\n`;
        }
      }
    }
    md += '\n';

    // Round 1 Scores
    md += '### Round 1 Scores (Phase C Step 2 — Additive + Signature Floors)\n';
    md += '| Agent | Confidence | Top Signals |\n';
    md += '|-------|------------|-------------|\n';
    const r1sorted = d.round1Scores.slice().sort((a, b) => b.confidence - a.confidence);
    for (const s of r1sorted) {
      const topSigs = s.signals
        .filter(sig => sig.weight !== 0)
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 5)
        .map(sig => `${sig.signal} (${sig.weight > 0 ? '+' : ''}${(sig.weight * 100).toFixed(0)}%: ${sig.evidence})`)
        .join('<br>');
      md += `| ${s.agent} | ${(s.confidence * 100).toFixed(0)}% | ${topSigs} |\n`;
    }
    md += '\n';

    // Tenant Context
    md += '### Tenant Context Adjustments (Phase D)\n';
    if (d.tenantContextAdjustments.length === 0) {
      md += '_No tenant context adjustments._\n';
    } else {
      for (const adj of d.tenantContextAdjustments) {
        md += `- **${adj.agent}**: ${adj.adjustment > 0 ? '+' : ''}${(adj.adjustment * 100).toFixed(0)}% — ${adj.signal}: ${adj.evidence}\n`;
      }
    }
    md += '\n';

    // Round 2
    md += '### Round 2 Adjustments (Phase C Step 4 — Spatial Negotiation)\n';
    if (d.round2Adjustments.length === 0) {
      md += '_No Round 2 adjustments._\n';
    } else {
      for (const adj of d.round2Adjustments) {
        md += `- **${adj.agent}**: ${adj.adjustment > 0 ? '+' : ''}${(adj.adjustment * 100).toFixed(0)}% — ${adj.reason}\n`;
      }
    }
    md += '\n';

    // Final Scores
    md += '### Final Scores\n';
    md += '| Rank | Agent | Confidence |\n';
    md += '|------|-------|------------|\n';
    for (let i = 0; i < d.finalScores.length; i++) {
      md += `| ${i + 1} | ${d.finalScores[i].agent} | ${(d.finalScores[i].confidence * 100).toFixed(0)}% |\n`;
    }
    md += '\n';

    // Structural Fingerprint
    md += '### Structural Fingerprint\n';
    md += '```json\n' + JSON.stringify(d.structuralFingerprint, null, 2) + '\n```\n\n';

    md += '---\n\n';
  }

  // Root cause analysis
  md += '## Root Cause Analysis\n\n';

  const flotaDiag = diagnostics.find(d => d.sheetName === 'Datos_Flota_Hub');
  const plantillaDiag = diagnostics.find(d => d.sheetName === 'Plantilla');

  if (flotaDiag) {
    md += '### Datos_Flota_Hub Misclassification\n\n';
    md += `**Result**: ${flotaDiag.finalClassification} at ${(flotaDiag.finalConfidence * 100).toFixed(0)}%\n`;
    md += `**Expected**: reference\n\n`;

    // Check which signature conditions passed/failed
    md += '#### Transaction Signature Condition Check\n';
    md += `- identifierRepeatRatio > 1.5: ${flotaDiag.contentProfile.identifierRepeatRatio.toFixed(2)} → ${flotaDiag.contentProfile.identifierRepeatRatio > 1.5 ? 'PASS' : 'FAIL'}\n`;
    md += `- hasTemporalColumns: ${flotaDiag.contentProfile.hasTemporalColumns} → ${flotaDiag.contentProfile.hasTemporalColumns ? 'PASS' : 'FAIL'}\n`;
    md += `- hasDateColumn: ${flotaDiag.contentProfile.hasDateColumn} → ${flotaDiag.contentProfile.hasDateColumn ? 'PASS' : 'FAIL'}\n`;
    md += `- numericFieldRatio > 0.40: ${(flotaDiag.contentProfile.numericFieldRatio * 100).toFixed(1)}% → ${flotaDiag.contentProfile.numericFieldRatio > 0.40 ? 'PASS' : 'FAIL'}\n`;
    md += '\n';

    md += '#### Reference Signature Condition Check\n';
    md += `- rowCount < 100: ${flotaDiag.contentProfile.rowCount} → ${flotaDiag.contentProfile.rowCount < 100 ? 'PASS' : 'FAIL'}\n`;
    md += `- notPersonLevel (!hasId || repeatRatio <= 1.0): hasId=${flotaDiag.contentProfile.hasEntityIdentifier}, ratio=${flotaDiag.contentProfile.identifierRepeatRatio.toFixed(2)} → ${(!flotaDiag.contentProfile.hasEntityIdentifier || flotaDiag.contentProfile.identifierRepeatRatio <= 1.0) ? 'PASS' : 'FAIL'}\n`;
    md += `- categoricalFieldCount >= 1: ${flotaDiag.contentProfile.categoricalFieldCount} → ${flotaDiag.contentProfile.categoricalFieldCount >= 1 ? 'PASS' : 'FAIL'}\n`;
    md += `- !isSparseOrAutoHeaders: sparsity=${(flotaDiag.contentProfile.sparsity * 100).toFixed(1)}%, quality=${flotaDiag.contentProfile.headerQuality} → ${flotaDiag.contentProfile.sparsity <= 0.30 && flotaDiag.contentProfile.headerQuality !== 'auto_generated' ? 'PASS' : 'FAIL'}\n`;
    md += '\n';

    // Find temporal observation details
    const temporalObs = flotaDiag.observations.filter(o => o.observationType === 'temporal_detection' || o.observationType === 'temporal_enhancement');
    if (temporalObs.length > 0) {
      md += '#### Temporal Detection Details\n';
      for (const o of temporalObs) {
        md += `- ${o.observationType}: ${o.structuralEvidence}\n`;
      }
      md += '\n';
    }

    // Check which fields triggered temporal
    md += '#### Fields That May Trigger Temporal Detection\n';
    for (const f of flotaDiag.fieldProfiles) {
      const dist = f.distribution;
      if (dist.min !== undefined && dist.max !== undefined) {
        const min = Number(dist.min);
        const max = Number(dist.max);
        const isYear = min >= 2000 && max <= 2040;
        const isMonth = min >= 1 && max <= 12;
        if (isYear || isMonth) {
          md += `- **${f.fieldName}**: type=${f.dataType}, min=${min}, max=${max}, distinct=${f.distinctCount}`;
          if (isYear) md += ' → TRIGGERS year detection';
          if (isMonth) md += ' → TRIGGERS month detection';
          md += ` | Samples: ${f.sampleValues.map(v => String(v)).join(', ')}\n`;
        }
      }
    }
    md += '\n';
  }

  if (plantillaDiag) {
    md += '### Plantilla Low Confidence\n\n';
    md += `**Result**: ${plantillaDiag.finalClassification} at ${(plantillaDiag.finalConfidence * 100).toFixed(0)}%\n`;
    md += `**Expected**: entity at higher confidence\n\n`;

    md += '#### Entity Signature Condition Check\n';
    md += `- identifierRepeatRatio > 0 && <= 1.5: ${plantillaDiag.contentProfile.identifierRepeatRatio.toFixed(2)} → ${plantillaDiag.contentProfile.identifierRepeatRatio > 0 && plantillaDiag.contentProfile.identifierRepeatRatio <= 1.5 ? 'PASS' : 'FAIL'}\n`;
    md += `- categoricalFieldRatio > 0.25: ${(plantillaDiag.contentProfile.categoricalFieldRatio * 100).toFixed(1)}% → ${plantillaDiag.contentProfile.categoricalFieldRatio > 0.25 ? 'PASS' : 'FAIL'}\n`;
    md += `- hasEntityIdentifier: ${plantillaDiag.contentProfile.hasEntityIdentifier} → ${plantillaDiag.contentProfile.hasEntityIdentifier ? 'PASS' : 'FAIL'}\n`;
    md += `- hasStructuralNameColumn: ${plantillaDiag.contentProfile.hasStructuralNameColumn} → ${plantillaDiag.contentProfile.hasStructuralNameColumn ? 'PASS' : 'FAIL'}\n`;
    md += '\n';

    if (!plantillaDiag.contentProfile.hasStructuralNameColumn) {
      md += '#### Why hasStructuralNameColumn = false?\n';
      md += 'The structural name detection requires:\n';
      md += '- Text column with cardinality >= 50% of identifier cardinality\n';
      md += '- Non-numeric ratio > 90%\n';
      md += '- Multi-word ratio > 50% (spaces in values)\n';
      md += '- No digits in > 20% of values\n\n';

      for (const f of plantillaDiag.fieldProfiles) {
        if (f.dataType === 'text') {
          md += `- **${f.fieldName}**: distinct=${f.distinctCount}, samples=[${f.sampleValues.map(v => `"${v}"`).join(', ')}]\n`;
        }
      }
      md += '\n';
    }
  }

  // Write markdown report
  const mdPath = path.resolve(__dirname, '..', '..', 'CLT-160_TRACE_DIAGNOSTIC.md');
  fs.writeFileSync(mdPath, md);
  console.log(`\nMarkdown report written to: ${mdPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
