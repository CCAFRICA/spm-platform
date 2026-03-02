// SCI Analyze Document API — POST /api/import/sci/analyze-document
// OB-133: Document content extraction via Anthropic → SCI proposal
// Handles PDF (native), PPTX (text extraction), DOCX (text extraction)
// Zero domain vocabulary. Korean Test applies.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import type { SCIProposal, ContentUnitProposal } from '@/lib/sci/sci-types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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

// ── Anthropic document analysis ──

async function analyzeWithAnthropic(
  fileBase64: string,
  mimeType: string,
  fileName: string,
  extractedText?: string
): Promise<DocumentAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const isPdf = mimeType === 'application/pdf';

  // Build message content
  const messageContent: unknown[] = [];

  if (isPdf) {
    // PDF: Send as native document block
    messageContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: fileBase64,
      },
    });
  }

  const textPrompt = isPdf
    ? `Analyze this document.`
    : `Analyze the following document content extracted from "${fileName}":\n\n---\n${extractedText}\n---`;

  messageContent.push({
    type: 'text',
    text: `${textPrompt}

Determine:
1. Is this a plan/rules document, a team roster, operational data, or something else?
2. If it describes rules, rates, or payout structures: how many distinct calculation components are there? What are their names?
3. Are there rate tables, tier structures, or matrix lookups?
4. Are there variant/segmentation rules (e.g., different rates for different roles)?
5. What language is the document in?

Return your analysis as JSON with this exact structure:
{
  "documentType": "plan" | "roster" | "data" | "unknown",
  "componentCount": number,
  "components": [{ "name": "component name", "calculationType": "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage" }],
  "hasVariants": boolean,
  "variantDescriptions": ["description of each variant"],
  "language": "en" | "es" | "mixed",
  "confidence": 0-100,
  "summary": "Brief summary of what the document contains"
}`,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (isPdf) {
    headers['anthropic-beta'] = 'pdfs-2024-09-25';
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errData)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) throw new Error('No content in Anthropic response');

  // Parse JSON from response
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) jsonStr = objectMatch[0];

  try {
    return JSON.parse(jsonStr) as DocumentAnalysis;
  } catch {
    // Fallback if JSON parsing fails
    return {
      documentType: 'unknown',
      componentCount: 0,
      components: [],
      hasVariants: false,
      language: 'en',
      confidence: 20,
      summary: 'Could not analyze document structure.',
    };
  }
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
    const isPptx = mimeType.includes('presentationml') || fileName.endsWith('.pptx');
    const isDocx = mimeType.includes('wordprocessingml') || fileName.endsWith('.docx');

    if (isPptx) {
      extractedText = await extractPptxText(fileBase64);
    } else if (isDocx) {
      extractedText = await extractDocxText(fileBase64);
    }

    // Analyze with Anthropic
    const analysis = await analyzeWithAnthropic(fileBase64, mimeType, fileName, extractedText);

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
