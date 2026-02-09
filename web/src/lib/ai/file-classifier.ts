/**
 * AI File Classifier
 *
 * Client-side utility for AI-powered file classification.
 * Calls the AI service to determine file type and routing.
 */

import { AI_CONFIDENCE } from './types';

export interface FileClassification {
  fileType: 'pos_cheque' | 'compensation_plan' | 'employee_roster' | 'transaction_data' | 'unknown';
  suggestedModule: 'financial' | 'compensation' | 'workforce' | 'data' | 'unknown';
  parseStrategy: 'excel_tabular' | 'text_structured' | 'csv_delimited' | 'pdf_extract' | 'tsv_tabular';
  confidence: number;
  reasoning: string;
  signalId?: string;
}

export interface ClassificationResult {
  classification: FileClassification;
  autoApply: boolean;       // confidence >= 90%
  suggestWithHighlight: boolean; // confidence 70-89%
  askUser: boolean;         // confidence < 70%
}

/**
 * Classify a file using AI
 */
export async function classifyFile(
  fileName: string,
  content: string,
  metadata?: {
    fileSize?: number;
    mimeType?: string;
    columnCount?: number;
    rowCount?: number;
    headers?: string[];
    tenantModules?: string[];
  },
  tenantId?: string,
  userId?: string
): Promise<ClassificationResult> {
  try {
    // Call API route for server-side AI classification
    const response = await fetch('/api/ai/classify-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        contentPreview: content.substring(0, 5000), // First 5KB
        metadata,
        tenantId,
        userId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Classification failed: ${response.status}`);
    }

    const data = await response.json();
    const confidence = data.confidence / 100; // Convert to 0-1

    return {
      classification: {
        fileType: data.result.fileType || 'unknown',
        suggestedModule: data.result.suggestedModule || 'unknown',
        parseStrategy: data.result.parseStrategy || 'csv_delimited',
        confidence: data.confidence,
        reasoning: data.result.reasoning || '',
        signalId: data.signalId,
      },
      autoApply: confidence >= AI_CONFIDENCE.AUTO_APPLY,
      suggestWithHighlight: confidence >= AI_CONFIDENCE.SUGGEST && confidence < AI_CONFIDENCE.AUTO_APPLY,
      askUser: confidence < AI_CONFIDENCE.SUGGEST,
    };
  } catch (error) {
    console.error('AI file classification error:', error);
    // Fallback to pattern-based classification
    return fallbackClassification(fileName, content, metadata);
  }
}

/**
 * Fallback pattern-based classification when AI is unavailable
 */
function fallbackClassification(
  fileName: string,
  content: string,
  metadata?: {
    headers?: string[];
  }
): ClassificationResult {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const headers = metadata?.headers || [];
  const headerStr = headers.join(',').toLowerCase();
  const contentLower = content.toLowerCase();

  let classification: FileClassification;

  // POS cheque detection
  const posIndicators = [
    'cheque', 'check', 'folio', 'propina', 'tip', 'mesa', 'table',
    'servidor', 'server', 'total_venta', 'subtotal', 'comanda',
  ];
  const hasPosIndicators = posIndicators.some(
    (ind) => headerStr.includes(ind) || contentLower.includes(ind)
  );

  if (hasPosIndicators || ext === 'tsv') {
    classification = {
      fileType: 'pos_cheque',
      suggestedModule: 'financial',
      parseStrategy: ext === 'tsv' ? 'tsv_tabular' : 'csv_delimited',
      confidence: 75,
      reasoning: 'Pattern match: POS cheque indicators detected',
    };
  } else if (ext === 'pptx' || ext === 'pdf' || contentLower.includes('commission') || contentLower.includes('compensation')) {
    classification = {
      fileType: 'compensation_plan',
      suggestedModule: 'compensation',
      parseStrategy: ext === 'pdf' ? 'pdf_extract' : 'text_structured',
      confidence: 65,
      reasoning: 'Pattern match: compensation plan indicators detected',
    };
  } else if (headerStr.includes('employee') || headerStr.includes('empleado') || headerStr.includes('staff')) {
    classification = {
      fileType: 'employee_roster',
      suggestedModule: 'workforce',
      parseStrategy: 'csv_delimited',
      confidence: 70,
      reasoning: 'Pattern match: employee roster indicators detected',
    };
  } else if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    classification = {
      fileType: 'transaction_data',
      suggestedModule: 'data',
      parseStrategy: ext === 'csv' ? 'csv_delimited' : 'excel_tabular',
      confidence: 50,
      reasoning: 'Default: generic data file',
    };
  } else {
    classification = {
      fileType: 'unknown',
      suggestedModule: 'unknown',
      parseStrategy: 'csv_delimited',
      confidence: 20,
      reasoning: 'Unable to determine file type',
    };
  }

  const confNorm = classification.confidence / 100;
  return {
    classification,
    autoApply: confNorm >= AI_CONFIDENCE.AUTO_APPLY,
    suggestWithHighlight: confNorm >= AI_CONFIDENCE.SUGGEST && confNorm < AI_CONFIDENCE.AUTO_APPLY,
    askUser: confNorm < AI_CONFIDENCE.SUGGEST,
  };
}

/**
 * Record user feedback on classification
 */
export async function recordClassificationFeedback(
  signalId: string,
  action: 'accepted' | 'corrected' | 'rejected',
  correction?: { fileType: string; module: string },
  tenantId?: string
): Promise<void> {
  try {
    await fetch('/api/ai/classify-file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalId, action, correction, tenantId }),
    });
  } catch (error) {
    console.error('Failed to record classification feedback:', error);
  }
}
