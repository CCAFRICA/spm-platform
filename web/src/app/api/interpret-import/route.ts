/**
 * API Route: Import Field Mapping Interpretation
 *
 * Server-side endpoint for AI-powered field mapping suggestions.
 * Uses the same Anthropic API pattern as /api/interpret-plan.
 */

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are an expert at analyzing data import files for a Sales Performance Management (SPM) platform. Your task is to suggest field mappings from source file columns to platform fields.

PLATFORM FIELDS (target fields for mapping):
- orderId: Order ID / Transaction identifier
- transactionId: Transaction ID
- externalId: External system ID / Reference
- repId: Sales rep identifier (REQUIRED)
- repName: Sales rep name
- date: Transaction date (REQUIRED)
- amount: Sale amount / Revenue (REQUIRED)
- quantity: Units sold
- productId: Product identifier
- productName: Product name
- customerId: Customer identifier
- customerName: Customer name
- region: Geographic region
- territory: Sales territory
- channel: Sales channel
- status: Transaction status
- currency: Currency code
- commissionRate: Commission rate/percentage
- notes: Additional notes

CONTEXT ABOUT THE DATA:
- This is sales/transaction data being imported into an SPM platform
- The platform calculates commissions based on this data
- Spanish/bilingual data is common (translate column names for matching)
- Common source systems: Salesforce, SAP, Excel exports, CSV exports

MAPPING GUIDELINES:
1. Each source column should map to AT MOST one platform field
2. Provide confidence scores (0-100) for each mapping
3. Look for variations and synonyms (e.g., "fecha" = "date", "monto" = "amount")
4. Identify the REQUIRED fields (repId, date, amount) - flag if not found
5. Consider column data samples to improve mapping accuracy
6. If a column doesn't match any platform field, suggest null with reasoning

COMMON SPANISH TERMS:
- "Fecha" = Date
- "Monto" / "Importe" / "Total" = Amount
- "Vendedor" / "Rep" / "Empleado" = Rep
- "Cliente" = Customer
- "Producto" = Product
- "Cantidad" = Quantity
- "Pedido" / "Orden" = Order
- "Estado" = Status

Return your analysis as valid JSON.`;

const USER_PROMPT_TEMPLATE = `Analyze the following data import headers and sample data, then suggest field mappings.

SOURCE HEADERS:
{HEADERS}

SAMPLE DATA (first 3 rows):
{SAMPLE_DATA}

TENANT CONTEXT:
{TENANT_CONTEXT}

Return a JSON object with this exact structure:
{
  "mappings": [
    {
      "sourceField": "original column name",
      "targetField": "platform field name or null",
      "confidence": 0-100,
      "matchType": "exact | fuzzy | semantic | none",
      "reasoning": "Why this mapping was suggested"
    }
  ],
  "requiredFieldsStatus": {
    "repId": { "found": true/false, "mappedFrom": "source column or null" },
    "date": { "found": true/false, "mappedFrom": "source column or null" },
    "amount": { "found": true/false, "mappedFrom": "source column or null" }
  },
  "overallConfidence": 0-100,
  "warnings": ["any issues or ambiguities"],
  "recommendations": ["suggestions for better data quality"]
}

Analyze the headers and data thoroughly, considering both English and Spanish column names.`;

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/interpret-import ==========');

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { error: 'AI interpretation not configured. Contact platform administrator.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { headers, sampleData, tenantId, planContext } = body;

    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { error: 'headers array is required' },
        { status: 400 }
      );
    }

    console.log('Headers count:', headers.length);
    console.log('Headers:', headers.join(', '));
    console.log('Sample data rows:', sampleData?.length || 0);
    console.log('Tenant ID:', tenantId);

    // Format the headers for the prompt
    const headersStr = headers.map((h: string, i: number) => `${i + 1}. "${h}"`).join('\n');

    // Format sample data
    let sampleDataStr = 'No sample data provided';
    if (sampleData && sampleData.length > 0) {
      sampleDataStr = sampleData
        .slice(0, 3)
        .map((row: Record<string, unknown>, i: number) => {
          const values = headers.map((h: string) => `${h}: ${row[h] ?? 'null'}`).join(', ');
          return `Row ${i + 1}: { ${values} }`;
        })
        .join('\n');
    }

    // Format tenant context
    let tenantContext = 'No specific tenant context provided.';
    if (planContext) {
      tenantContext = `Plan components: ${planContext.components?.join(', ') || 'Unknown'}
Currency: ${planContext.currency || 'Unknown'}
Expected metrics: ${planContext.metrics?.join(', ') || 'Standard sales metrics'}`;
    }

    const userPrompt = USER_PROMPT_TEMPLATE
      .replace('{HEADERS}', headersStr)
      .replace('{SAMPLE_DATA}', sampleDataStr)
      .replace('{TENANT_CONTEXT}', tenantContext);

    console.log('User prompt length:', userPrompt.length, 'chars');

    console.log('Calling Anthropic API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, errorData);
      return NextResponse.json(
        { error: `API request failed: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    console.log('\n========== RAW AI RESPONSE ==========');
    console.log('Response length:', content?.length || 0, 'chars');
    console.log('Full response:');
    console.log(content);
    console.log('======================================\n');

    if (!content) {
      return NextResponse.json(
        { error: 'No content in API response' },
        { status: 500 }
      );
    }

    // Parse JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    let interpretation;
    try {
      interpretation = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse AI response',
        rawResponse: content,
      });
    }

    console.log('\n========== PARSED INTERPRETATION ==========');
    console.log('Mappings count:', interpretation.mappings?.length || 0);
    interpretation.mappings?.forEach((m: { sourceField: string; targetField: string | null; confidence: number }, i: number) => {
      console.log(`  ${i + 1}. "${m.sourceField}" → ${m.targetField || 'null'} (${m.confidence}%)`);
    });
    console.log('Required fields status:', JSON.stringify(interpretation.requiredFieldsStatus));
    console.log('Overall confidence:', interpretation.overallConfidence);
    console.log('============================================\n');

    return NextResponse.json({
      success: true,
      method: 'ai',
      interpretation,
      confidence: interpretation.overallConfidence || 0,
    });
  } catch (error) {
    console.error('Error in interpret-import API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
