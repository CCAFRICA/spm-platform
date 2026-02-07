/**
 * API Route: Workbook Analysis
 *
 * Server-side endpoint for AI-powered multi-sheet workbook analysis.
 * Analyzes all sheets together to detect:
 * - Sheet classifications (roster, component data, reference, regional partition)
 * - Relationships between sheets via shared keys
 * - Mapping to tenant's plan components
 */

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are an expert at analyzing compensation data workbooks for a Sales Performance Management (SPM) platform. Your task is to analyze ALL sheets in a workbook together to understand how they relate and feed into compensation calculations.

SHEET CLASSIFICATION TYPES:
1. "roster" - Employee roster with employee IDs, names, positions, store assignments
2. "component_data" - Feeds a specific plan component (sales data, performance metrics, etc.)
3. "reference" - Lookup/reference data (product lists, rate tables, etc.)
4. "regional_partition" - Same structure as another sheet but for a different region/store/territory
5. "period_summary" - Aggregated period-level data
6. "unrelated" - Does not appear related to compensation calculations

RELATIONSHIP DETECTION:
- Look for shared column names across sheets (e.g., employee_id, store_id, period)
- Spanish column names are common: num_empleado, No_Tienda, Fecha_Corte
- Detect primary keys and foreign key relationships
- Identify if one sheet references another

PLAN COMPONENT MATCHING:
When planComponents are provided, match sheets to components based on:
- Column names matching expected metrics
- Data patterns (percentages, currency amounts, counts)
- Spanish/English term matching

ANALYSIS APPROACH:
1. First, infer relationships from data structure alone
2. Then validate against plan components if provided
3. Surface gaps (expected data not found) and extras (unexpected data found)
4. Provide confidence scores for each classification and relationship

Return your analysis as valid JSON.`;

const USER_PROMPT_TEMPLATE = `Analyze the following multi-sheet workbook and determine how the sheets relate to each other and to the compensation plan.

SHEETS IN WORKBOOK:
{SHEETS_INFO}

TENANT'S PLAN COMPONENTS (if available):
{PLAN_COMPONENTS}

EXPECTED DATA FIELDS PER COMPONENT (if available):
{EXPECTED_FIELDS}

Return a JSON object with this exact structure:
{
  "sheets": [
    {
      "name": "sheet name",
      "classification": "roster | component_data | reference | regional_partition | period_summary | unrelated",
      "classificationConfidence": 0-100,
      "classificationReasoning": "why this classification was chosen",
      "matchedComponent": "plan component ID or null",
      "matchedComponentConfidence": 0-100,
      "detectedPrimaryKey": "column name or null",
      "detectedDateColumn": "column name or null",
      "detectedAmountColumns": ["column names"],
      "suggestedFieldMappings": [
        {
          "sourceColumn": "original column name",
          "targetField": "platform field or component metric",
          "confidence": 0-100
        }
      ]
    }
  ],
  "relationships": [
    {
      "fromSheet": "sheet name",
      "toSheet": "sheet name",
      "relationshipType": "references | partitions | aggregates | links_via",
      "sharedKeys": ["column names"],
      "confidence": 0-100,
      "description": "how these sheets relate"
    }
  ],
  "sheetGroups": [
    {
      "groupType": "component_package | regional_set | roster_hierarchy",
      "sheets": ["sheet names"],
      "description": "why these sheets are grouped"
    }
  ],
  "rosterDetected": {
    "found": true/false,
    "sheetName": "sheet name or null",
    "employeeIdColumn": "column name or null",
    "storeAssignmentColumn": "column name or null",
    "canCreateUsers": true/false
  },
  "periodDetected": {
    "found": true/false,
    "dateColumn": "column name",
    "dateRange": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
    "periodType": "monthly | bi-weekly | weekly | unknown"
  },
  "gaps": [
    {
      "type": "missing_component_data | missing_roster | missing_key",
      "description": "what is missing",
      "severity": "error | warning | info"
    }
  ],
  "extras": [
    {
      "sheetName": "sheet name",
      "description": "data found that wasn't expected",
      "recommendation": "ignore | review | include"
    }
  ],
  "overallConfidence": 0-100,
  "summary": "brief summary of the workbook structure"
}

Analyze the workbook thoroughly, considering both English and Spanish column names.`;

interface SheetSample {
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/analyze-workbook ==========');

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { error: 'AI analysis not configured. Contact platform administrator.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { sheets, tenantId, planComponents, expectedFields } = body as {
      sheets: SheetSample[];
      tenantId: string;
      planComponents?: { id: string; name: string; type: string }[];
      expectedFields?: Record<string, string[]>;
    };

    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      return NextResponse.json(
        { error: 'sheets array is required' },
        { status: 400 }
      );
    }

    console.log('Sheets count:', sheets.length);
    console.log('Tenant ID:', tenantId);
    console.log('Plan components:', planComponents?.length || 0);

    // Format sheets info for the prompt
    const sheetsInfo = sheets.map((sheet, i) => {
      const headersStr = sheet.headers.map((h, j) => `    ${j + 1}. "${h}"`).join('\n');
      const sampleStr = sheet.sampleRows.slice(0, 2).map((row, j) => {
        const values = sheet.headers.slice(0, 5).map(h => `${h}: ${row[h] ?? 'null'}`).join(', ');
        return `    Sample ${j + 1}: { ${values}${sheet.headers.length > 5 ? ', ...' : ''} }`;
      }).join('\n');

      return `
Sheet ${i + 1}: "${sheet.name}"
  Row count: ${sheet.rowCount}
  Columns (${sheet.headers.length}):
${headersStr}
  Sample data:
${sampleStr}`;
    }).join('\n\n');

    // Format plan components
    let planComponentsStr = 'No plan components provided.';
    if (planComponents && planComponents.length > 0) {
      planComponentsStr = planComponents.map((c, i) =>
        `${i + 1}. ${c.name} (${c.type}) - ID: ${c.id}`
      ).join('\n');
    }

    // Format expected fields
    let expectedFieldsStr = 'No expected fields provided.';
    if (expectedFields && Object.keys(expectedFields).length > 0) {
      expectedFieldsStr = Object.entries(expectedFields).map(([compId, fields]) =>
        `${compId}: ${fields.join(', ')}`
      ).join('\n');
    }

    const userPrompt = USER_PROMPT_TEMPLATE
      .replace('{SHEETS_INFO}', sheetsInfo)
      .replace('{PLAN_COMPONENTS}', planComponentsStr)
      .replace('{EXPECTED_FIELDS}', expectedFieldsStr);

    console.log('User prompt length:', userPrompt.length, 'chars');

    console.log('Calling Anthropic API for workbook analysis...');
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
        messages: [{ role: 'user', content: userPrompt }],
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

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse AI response',
        rawResponse: content,
      });
    }

    console.log('\n========== PARSED ANALYSIS ==========');
    console.log('Sheets analyzed:', analysis.sheets?.length || 0);
    analysis.sheets?.forEach((s: { name: string; classification: string; classificationConfidence: number }) => {
      console.log(`  - "${s.name}": ${s.classification} (${s.classificationConfidence}%)`);
    });
    console.log('Relationships found:', analysis.relationships?.length || 0);
    console.log('Roster detected:', analysis.rosterDetected?.found);
    console.log('Overall confidence:', analysis.overallConfidence);
    console.log('==========================================\n');

    return NextResponse.json({
      success: true,
      analysis,
      confidence: analysis.overallConfidence || 0,
    });
  } catch (error) {
    console.error('Error in analyze-workbook API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
