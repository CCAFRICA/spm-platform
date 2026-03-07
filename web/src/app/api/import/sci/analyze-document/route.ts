// SCI Analyze Document API — POST /api/import/sci/analyze-document
// OB-133: Document content extraction → SCI proposal
// HF-101: Migrated to AIService — zero raw AI calls outside AIService.
// Handles PDF (native), PPTX (text extraction), DOCX (text extraction)
// Zero domain vocabulary. Korean Test applies.

// OB-150: Production timeout fix (Anthropic API calls)
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { getAIService } from '@/lib/ai/ai-service';
import type { SCIProposal, ContentUnitProposal } from '@/lib/sci/sci-types';

interface DocumentAnalysis {
  documentType: 'plan' | 'roster' | 'data' | 'unknown';
  componentCount: number;
  components: Array<{ name: string; calculationType?: string }>;
  hasVariants: boolean;
  variantDescriptions?: string[];
  language: string;
  confidence: number;
  summary: string;
}

// ── DOCX text extraction (ZIP → word/document.xml → <w:t> tags) ──

async function extractDocxText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return '';

  const texts: string[] = [];
  const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
  for (const match of matches) {
    const text = match[1].trim();
    if (text) texts.push(text);
  }
  return texts.join(' ');
}

// ── PPTX text extraction (ZIP → ppt/slides/slideN.xml → <a:t> tags) ──

async function extractPptxText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const allTexts: string[] = [];

  for (const slideFile of slideFiles) {
    const content = await zip.file(slideFile)?.async('string');
    if (!content) continue;

    const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
    for (const match of matches) {
      const text = match[1].trim();
      if (text) allTexts.push(text);
    }
  }

  return allTexts.join(' ');
}

// ── API Route ──

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { tenantId, fileName, fileBase64, mimeType } = body as {
      tenantId: string;
      fileName: string;
      fileBase64: string;
      mimeType: string;
    };

    if (!tenantId || !fileName || !fileBase64) {
      return NextResponse.json(
        { error: 'tenantId, fileName, and fileBase64 required' },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Extract text for non-PDF formats
    let extractedText: string | undefined;
    const isPdf = mimeType === 'application/pdf';
    const isPptx = mimeType.includes('presentationml') || fileName.endsWith('.pptx');
    const isDocx = mimeType.includes('wordprocessingml') || fileName.endsWith('.docx');

    if (isPptx) {
      extractedText = await extractPptxText(fileBase64);
    } else if (isDocx) {
      extractedText = await extractDocxText(fileBase64);
    }

    // Analyze via AIService (HF-101: single code path for all AI calls)
    const aiService = getAIService();
    const aiInput: Record<string, unknown> = { fileName };

    if (isPdf) {
      aiInput.pdfBase64 = fileBase64;
      aiInput.pdfMediaType = mimeType;
    } else {
      aiInput.extractedText = extractedText || '';
    }

    const aiResponse = await aiService.execute({
      task: 'document_analysis',
      input: aiInput,
      options: { maxTokens: 4096, responseFormat: 'json' },
    }, true, { tenantId });

    // Parse analysis from AIService response
    let analysis: DocumentAnalysis;
    if (aiResponse.result.parseError) {
      analysis = {
        documentType: 'unknown',
        componentCount: 0,
        components: [],
        hasVariants: false,
        language: 'en',
        confidence: 20,
        summary: 'Could not analyze document structure.',
      };
    } else {
      const r = aiResponse.result as unknown as DocumentAnalysis;
      analysis = {
        documentType: r.documentType || 'unknown',
        componentCount: r.componentCount || 0,
        components: r.components || [],
        hasVariants: r.hasVariants || false,
        variantDescriptions: r.variantDescriptions,
        language: r.language || 'en',
        confidence: r.confidence || 20,
        summary: r.summary || 'Document analyzed.',
      };
    }

    // Map documentType to AgentType
    const classificationMap: Record<string, 'plan' | 'entity' | 'target' | 'transaction'> = {
      plan: 'plan',
      roster: 'entity',
      data: 'transaction',
      unknown: 'plan', // Documents are most likely plans
    };
    const classification = classificationMap[analysis.documentType] || 'plan';

    // Build action description
    const actionDescriptions: Record<string, string> = {
      plan: 'Interpret this document and create a calculation rule set.',
      entity: 'Extract team roster data from this document.',
      target: 'Extract performance targets from this document.',
      transaction: 'Extract operational data from this document.',
    };

    // Build SCI Proposal
    const proposalId = crypto.randomUUID();
    const contentUnitId = crypto.randomUUID();

    const normalizedConfidence = analysis.confidence / 100;

    const contentUnit: ContentUnitProposal = {
      contentUnitId,
      sourceFile: fileName,
      tabName: fileName,
      classification,
      confidence: normalizedConfidence,
      reasoning: analysis.summary,
      action: actionDescriptions[classification],
      fieldBindings: [], // Documents don't have field bindings
      allScores: [
        {
          agent: 'plan',
          confidence: classification === 'plan' ? normalizedConfidence : 0.05,
          signals: [],
          reasoning: classification === 'plan' ? analysis.summary : 'Document format, not tabular data',
        },
        {
          agent: 'entity',
          confidence: classification === 'entity' ? normalizedConfidence : 0.05,
          signals: [],
          reasoning: classification === 'entity' ? analysis.summary : 'Document format, not tabular data',
        },
        {
          agent: 'target',
          confidence: classification === 'target' ? normalizedConfidence : 0.05,
          signals: [],
          reasoning: 'Document format, not tabular data',
        },
        {
          agent: 'transaction',
          confidence: classification === 'transaction' ? normalizedConfidence : 0.05,
          signals: [],
          reasoning: 'Document format, not tabular data',
        },
      ],
      warnings: normalizedConfidence < 0.60
        ? ['Low confidence — manual classification review recommended']
        : [],
      observations: [
        `Document format: ${mimeType.split('/').pop() || 'unknown'}`,
        ...(analysis.componentCount > 0
          ? [`${analysis.componentCount} component${analysis.componentCount !== 1 ? 's' : ''} identified`]
          : []),
        ...(analysis.hasVariants ? ['Multiple variants detected'] : []),
        ...(analysis.language && analysis.language !== 'en'
          ? [`Content language: ${analysis.language}`]
          : []),
      ],
      verdictSummary: analysis.summary || `Identified as ${classification} document.`,
      whatChangesMyMind: normalizedConfidence < 0.80
        ? ['If the document structure differs from what was analyzed, classification may change']
        : [],
      documentMetadata: {
        fileBase64,
        mimeType,
        extractionSummary: {
          documentType: analysis.documentType,
          componentCount: analysis.componentCount,
          components: analysis.components,
          hasVariants: analysis.hasVariants,
          variantDescriptions: analysis.variantDescriptions,
          language: analysis.language,
        },
      },
    };

    const proposal: SCIProposal = {
      proposalId,
      tenantId,
      sourceFiles: [fileName],
      contentUnits: [contentUnit],
      processingOrder: [contentUnitId],
      overallConfidence: normalizedConfidence,
      requiresHumanReview: normalizedConfidence < 0.80,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(proposal);

  } catch (err) {
    console.error('[SCI Analyze Document] Error:', err);
    return NextResponse.json(
      { error: 'Document analysis failed', details: String(err) },
      { status: 500 }
    );
  }
}
