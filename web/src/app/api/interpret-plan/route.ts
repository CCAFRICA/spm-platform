/**
 * API Route: Plan Interpretation
 *
 * Server-side endpoint for AI-powered plan interpretation.
 * Required because the Anthropic API key is only available server-side.
 */

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles

IMPORTANT GUIDELINES:
1. Documents may be in Spanish, English, or mixed languages. Preserve original language labels where found.
2. Look for tables (matrices or single-column tiers), percentage mentions, and conditional rules.
3. Identify whether metrics are per-employee, per-store, or per-company scope.
4. Extract worked examples if present — these are critical for validation.
5. Return confidence scores (0-100) for each component and overall.
6. If something is ambiguous, flag it in the reasoning rather than guessing.

COMPONENT DETECTION RULES:
- Each slide or section with a distinct title/header is likely a separate component
- Each table measuring a DIFFERENT metric is a SEPARATE component (even if similar structure)
- Common component types in retail plans:
  * Optical/Product Sales (often a 2D matrix with attainment % and sales volume)
  * Store Sales Attainment (tiered lookup based on store goal %)
  * New Customers (tiered lookup based on customer acquisition %)
  * Collections/Cobranza (tiered lookup based on collection goal %)
  * Insurance/Seguros Sales (percentage of individual sales, may be conditional)
  * Warranty/Servicios Sales (flat percentage of individual sales)
- DO NOT combine "New Customers" and "Collections" into one component - they are separate
- DO NOT combine any tiered lookups just because they have similar tier structures

EMPLOYEE TYPE DETECTION:
- Look for phrases like "Certificado/Certified", "No Certificado/Non-Certified", "Senior", "Junior"
- Look for different payout matrices or values for different employee classifications
- If a component shows TWO different payout tables (e.g., one labeled for certified, one for non-certified), create TWO employee types
- Components that are the same for all employee types should have appliesToEmployeeTypes: ["all"]
- Components that differ should specify which employee type they apply to

PAY ATTENTION TO:
- Matrix lookups: Two-dimensional tables where payout depends on two metrics (row and column)
- Tiered lookups: Single-dimension tables with thresholds and corresponding payouts
- Percentage calculations: Rate applied to a base amount
- Conditional percentages: Rate varies based on another metric's value

COMMON SPANISH TERMS:
- "% cumplimiento" = "% attainment"
- "Venta de..." = "Sales of..."
- "Meta" = "Goal/Target"
- "Tienda" = "Store"
- "Clientes Nuevos" = "New Customers"
- "Cobranza" = "Collections"
- "Seguros" = "Insurance"
- "Servicios/Garantía Extendida" = "Warranty/Extended Services"

Return your analysis as valid JSON matching the specified schema.`;

const USER_PROMPT_TEMPLATE = `Analyze the following compensation plan document and extract its COMPLETE structure.

IMPORTANT:
- Extract ALL distinct components (typically 4-8 components in a retail plan)
- Each metric/KPI with its own payout table is a SEPARATE component
- Detect if there are multiple employee types with different payout levels

DOCUMENT CONTENT:
---
{CONTENT}
---

Return a JSON object with this exact structure:
{
  "planName": "Name of the plan in English",
  "planNameEs": "Name in Spanish if found",
  "description": "Brief description of the plan",
  "descriptionEs": "Description in Spanish if found",
  "currency": "USD" or "MXN" or other currency code,
  "employeeTypes": [
    {
      "id": "unique-slug-id",
      "name": "Employee Type Name",
      "nameEs": "Spanish name if found",
      "eligibilityCriteria": { "key": "value" }
    }
  ],
  "components": [
    {
      "id": "unique-component-id",
      "name": "Component Name",
      "nameEs": "Spanish name if found",
      "type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage",
      "appliesToEmployeeTypes": ["all"] or ["specific-type-id"],
      "calculationMethod": {
        // Structure depends on type - see below
      },
      "confidence": 0-100,
      "reasoning": "Why this component was identified this way"
    }
  ],
  "requiredInputs": [
    {
      "field": "metric_name",
      "description": "What this input represents",
      "descriptionEs": "Spanish description",
      "scope": "employee | store | company",
      "dataType": "number | percentage | currency"
    }
  ],
  "workedExamples": [
    {
      "employeeType": "type-id",
      "inputs": { "metric_name": value },
      "expectedTotal": number,
      "componentBreakdown": { "component-id": value }
    }
  ],
  "confidence": 0-100,
  "reasoning": "Overall reasoning about the plan interpretation"
}

CALCULATION METHOD STRUCTURES:

For matrix_lookup:
{
  "type": "matrix_lookup",
  "rowAxis": {
    "metric": "metric_field_name",
    "label": "Row Axis Label",
    "labelEs": "Spanish label",
    "ranges": [
      { "min": 0, "max": 80, "label": "<80%" },
      { "min": 80, "max": 90, "label": "80%-90%" }
    ]
  },
  "columnAxis": {
    "metric": "metric_field_name",
    "label": "Column Axis Label",
    "ranges": [
      { "min": 0, "max": 60000, "label": "<$60k" }
    ]
  },
  "values": [[0, 0, 0], [100, 200, 300]]  // 2D grid matching row x column
}

For tiered_lookup:
{
  "type": "tiered_lookup",
  "metric": "metric_field_name",
  "metricLabel": "Metric Label",
  "tiers": [
    { "min": 0, "max": 100, "payout": 0, "label": "<100%" },
    { "min": 100, "max": 105, "payout": 150, "label": "100%-105%" }
  ]
}

For percentage/flat_percentage:
{
  "type": "percentage",
  "metric": "metric_to_apply_rate_to",
  "metricLabel": "What this metric represents",
  "rate": 0.04  // 4% as decimal
}

For conditional_percentage:
{
  "type": "conditional_percentage",
  "metric": "metric_to_apply_rate_to",
  "metricLabel": "Base amount description",
  "conditionMetric": "metric_that_determines_rate",
  "conditionMetricLabel": "Condition description",
  "conditions": [
    { "threshold": 100, "operator": "<", "rate": 0.03, "label": "<100%" },
    { "threshold": 100, "operator": ">=", "rate": 0.05, "label": ">=100%" }
  ]
}

Analyze the document thoroughly and return the complete JSON structure.`;

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/interpret-plan ==========');

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
    const { documentContent, tenantId, userId } = body;

    if (!documentContent) {
      return NextResponse.json(
        { error: 'documentContent is required' },
        { status: 400 }
      );
    }

    console.log('Document content length:', documentContent.length, 'chars');
    console.log('Tenant ID:', tenantId);
    console.log('User ID:', userId);

    const userPrompt = USER_PROMPT_TEMPLATE.replace('{CONTENT}', documentContent);
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
        max_tokens: 8000,
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
        success: true,
        method: 'ai',
        interpretation: {
          planName: 'Parse Error',
          description: 'Failed to parse AI response',
          currency: 'USD',
          employeeTypes: [],
          components: [],
          requiredInputs: [],
          workedExamples: [],
          confidence: 0,
          reasoning: 'Parse error - see raw response',
          rawApiResponse: content,
        },
        confidence: 0,
      });
    }

    console.log('\n========== PARSED INTERPRETATION ==========');
    console.log('Plan name:', interpretation.planName);
    console.log('Employee types:', interpretation.employeeTypes?.length || 0);
    console.log('Components:', interpretation.components?.length || 0);
    interpretation.components?.forEach((comp: { name: string; type: string; confidence: number; calculationMethod?: unknown }, i: number) => {
      console.log(`  ${i + 1}. ${comp.name} (${comp.type}) - ${comp.confidence}% confidence`);
      if (comp.calculationMethod) {
        console.log(`     Calculation:`, JSON.stringify(comp.calculationMethod).substring(0, 300));
      }
    });
    console.log('============================================\n');

    return NextResponse.json({
      success: true,
      method: 'ai',
      interpretation: {
        ...interpretation,
        rawApiResponse: content,
      },
      confidence: interpretation.confidence || 0,
    });
  } catch (error) {
    console.error('Error in interpret-plan API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
