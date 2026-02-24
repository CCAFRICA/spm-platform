/**
 * OB-88 Mission 1: Plan Import
 *
 * Reads RetailCorp Plan1.pptx, parses slides with JSZip,
 * calls Anthropic API for plan interpretation,
 * saves rule set to Supabase, and verifies.
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const AUTH_USER_ID = '8788d3fa-d821-48cf-b0cd-d0114dcd45b2';
const PROFILE_ID = '824dfd85-de72-469c-aebc-4fe069481573';
const PLAN_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/RetailCorp Data 1/RetailCorp Plan1.pptx';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ============================================
// PPTX PARSING (same logic as pptx-parser.ts)
// ============================================

function decodeXMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

interface TableData {
  headers: string[];
  rows: string[][];
}

interface SlideContent {
  slideNumber: number;
  texts: string[];
  tables: TableData[];
}

function parseTableXML(tableXML: string): TableData {
  const rows: string[][] = [];
  const rowMatches = Array.from(tableXML.matchAll(/<a:tr[^>]*>([\s\S]*?)<\/a:tr>/g));
  for (const rowMatch of rowMatches) {
    const rowXML = rowMatch[1];
    const cells: string[] = [];
    const cellMatches = Array.from(rowXML.matchAll(/<a:tc[^>]*>([\s\S]*?)<\/a:tc>/g));
    for (const cellMatch of cellMatches) {
      const cellXML = cellMatch[1];
      const textParts: string[] = [];
      const textMatches = Array.from(cellXML.matchAll(/<a:t>([^<]*)<\/a:t>/g));
      for (const tm of textMatches) {
        const t = decodeXMLEntities(tm[1].trim());
        if (t) textParts.push(t);
      }
      cells.push(textParts.join(' '));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return {
    headers: rows.length > 0 ? rows[0] : [],
    rows: rows.length > 1 ? rows.slice(1) : [],
  };
}

function parseSlideXML(xml: string, slideNumber: number): SlideContent {
  const texts: string[] = [];
  const tables: TableData[] = [];

  const textMatches = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g));
  for (const match of textMatches) {
    const text = decodeXMLEntities(match[1].trim());
    if (text) texts.push(text);
  }

  const tableMatches = Array.from(xml.matchAll(/<a:tbl[^>]*>([\s\S]*?)<\/a:tbl>/g));
  for (const tableMatch of tableMatches) {
    const table = parseTableXML(tableMatch[1]);
    if (table.rows.length > 0) tables.push(table);
  }

  const gfMatches = Array.from(xml.matchAll(/<p:graphicFrame[^>]*>([\s\S]*?)<\/p:graphicFrame>/g));
  for (const gf of gfMatches) {
    if (gf[1].includes('<a:tbl')) {
      const innerMatches = Array.from(gf[1].matchAll(/<a:tbl[^>]*>([\s\S]*?)<\/a:tbl>/g));
      for (const inner of innerMatches) {
        const table = parseTableXML(inner[1]);
        if (table.rows.length > 0) tables.push(table);
      }
    }
  }

  return { slideNumber, texts, tables };
}

async function parsePPTXFile(filePath: string): Promise<{ slides: SlideContent[]; textContent: string }> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const slides: SlideContent[] = [];
  const textParts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const content = await zip.file(slideFiles[i])?.async('string');
    if (!content) continue;

    const slide = parseSlideXML(content, i + 1);
    slides.push(slide);

    // Build text representation for AI
    textParts.push(`\n=== SLIDE ${i + 1} ===`);
    textParts.push(slide.texts.join('\n'));
    for (const table of slide.tables) {
      textParts.push(`\nTABLE: ${table.headers.join(' | ')}`);
      for (const row of table.rows) {
        textParts.push(row.join(' | '));
      }
    }
  }

  return { slides, textContent: textParts.join('\n') };
}

// ============================================
// AI PLAN INTERPRETATION (same as anthropic-adapter)
// ============================================

const SYSTEM_PROMPT = `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content, INCLUDING ALL PAYOUT VALUES.

CRITICAL REQUIREMENTS:
1. Extract EVERY distinct compensation component - do NOT merge similar components
2. Each table, each metric, each KPI with its own payout structure is a SEPARATE component
3. Detect ALL employee types/classifications if the document has different payout levels for different roles
4. CRITICAL: Extract ALL numeric payout values from every table - do NOT just identify structure

FOR EACH COMPONENT TYPE, EXTRACT COMPLETE DATA:

MATRIX LOOKUP (2D tables with row and column axes):
- Extract row axis: metric name, label, and ALL range boundaries
- Extract column axis: metric name, label, and ALL range boundaries
- Extract the COMPLETE values matrix - every cell value as a number

TIERED LOOKUP (1D tables with ranges and payouts):
- Extract metric name and label
- Extract EVERY tier with min, max, and payout value

FLAT PERCENTAGE (simple rate applied to a base):
- Extract the rate as a decimal (4% = 0.04)
- Extract what it applies to

CONDITIONAL PERCENTAGE:
- Extract conditions with thresholds and rates

Return VALID JSON only. No markdown formatting.`;

async function callAnthropicAPI(textContent: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const userPrompt = `Analyze the following compensation plan document and extract its COMPLETE structure INCLUDING ALL PAYOUT VALUES FROM EVERY TABLE.

DOCUMENT CONTENT:
---
${textContent}
---
Format: text

CRITICAL: For each component, you MUST extract the complete calculationMethod with ALL numeric values from the tables. Empty tiers/matrices will cause $0 payouts.

Return a JSON object with:
{
  "ruleSetName": "Name of the plan",
  "ruleSetNameEs": "Spanish name if present",
  "description": "Brief description",
  "currency": "MXN or USD",
  "employeeTypes": [
    { "id": "certified", "name": "Optometrista Certificado", "nameEs": "..." },
    { "id": "non_certified", "name": "Optometrista No Certificado", "nameEs": "..." }
  ],
  "components": [
    {
      "id": "unique-id",
      "name": "Component Name",
      "nameEs": "Spanish name",
      "type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage",
      "appliesToEmployeeTypes": ["certified"] or ["all"],
      "calculationMethod": {
        // For matrix_lookup: include rowAxis.ranges[], columnAxis.ranges[], values[][]
        // For tiered_lookup: include tiers[] with min, max, payout for EACH tier
        // For percentage/flat_percentage: include rate (as decimal) and metric
        // For conditional_percentage: include conditions[] and metric
      },
      "confidence": 0-100,
      "reasoning": "How you extracted this component"
    }
  ],
  "requiredInputs": [
    { "field": "field_name", "description": "what it measures", "scope": "employee|store", "dataType": "number|percentage|currency" }
  ],
  "workedExamples": [
    { "employeeType": "certified", "inputs": {}, "expectedTotal": 2335, "componentBreakdown": {} }
  ],
  "confidence": 0-100,
  "reasoning": "Overall analysis reasoning"
}`;

  console.log('Calling Anthropic API (plan interpretation)...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('No content in Anthropic response');

  console.log('API response received. Tokens:', data.usage);

  // Parse JSON from response
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) jsonStr = objectMatch[0];

  return JSON.parse(jsonStr);
}

// ============================================
// CONVERT TO RULE SET CONFIG
// ============================================

function interpretationToRuleSet(interpretation: Record<string, unknown>): Record<string, unknown> {
  const ruleSetId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Extract components and employee types
  const components = (interpretation.components || []) as Array<Record<string, unknown>>;
  const employeeTypes = (interpretation.employeeTypes || []) as Array<Record<string, unknown>>;

  // Build plan components for each variant
  function convertComponent(comp: Record<string, unknown>, order: number): Record<string, unknown> {
    const compType = String(comp.type || 'tiered_lookup');
    const calcMethod = (comp.calculationMethod || {}) as Record<string, unknown>;

    const base: Record<string, unknown> = {
      name: String(comp.name || `Component ${order + 1}`),
      nameEs: comp.nameEs ? String(comp.nameEs) : undefined,
      description: String(comp.reasoning || ''),
      order,
      weight: 1,
      componentType: compType === 'matrix_lookup' ? 'matrix_lookup' : compType === 'flat_percentage' || compType === 'percentage' ? 'percentage' : compType === 'conditional_percentage' ? 'conditional_percentage' : 'tier_lookup',
    };

    // Add calculation-specific config
    if (compType === 'matrix_lookup') {
      base.matrixConfig = calcMethod;
    } else if (compType === 'tiered_lookup') {
      base.tierConfig = calcMethod;
    } else if (compType === 'flat_percentage' || compType === 'percentage') {
      base.percentageConfig = calcMethod;
    } else if (compType === 'conditional_percentage') {
      base.conditionalConfig = calcMethod;
    } else {
      base.tierConfig = calcMethod;
    }

    // Preserve calculationIntent
    if (comp.calculationIntent) {
      base.calculationIntent = comp.calculationIntent;
    }

    return base;
  }

  // Build variants from employee types
  const variants = employeeTypes.length > 0
    ? employeeTypes.map(empType => {
        const filtered = components.filter(c => {
          const applies = (c.appliesToEmployeeTypes as string[]) || ['all'];
          return applies.includes('all') || applies.includes(String(empType.id));
        });
        return {
          variantId: String(empType.id),
          variantName: String(empType.name),
          description: empType.nameEs ? String(empType.nameEs) : String(empType.name),
          eligibilityCriteria: empType.eligibilityCriteria || {},
          components: filtered.map((c, i) => convertComponent(c, i)),
        };
      })
    : [{
        variantId: 'default',
        variantName: 'Default',
        description: 'Default plan variant',
        eligibilityCriteria: {},
        components: components.map((c, i) => convertComponent(c, i)),
      }];

  return {
    id: ruleSetId,
    tenantId: TENANT_ID,
    name: String(interpretation.ruleSetName || 'RetailCorp Plan'),
    description: String(interpretation.description || ''),
    ruleSetType: 'additive_lookup',
    status: 'draft',
    effectiveDate: now,
    endDate: null,
    eligibleRoles: ['sales_rep', 'optometrista'],
    version: 1,
    previousVersionId: null,
    createdBy: PROFILE_ID,
    updatedBy: PROFILE_ID,
    configuration: {
      type: 'additive_lookup',
      variants,
    },
  };
}

// ============================================
// SAVE TO SUPABASE
// ============================================

async function saveRuleSet(planConfig: Record<string, unknown>): Promise<void> {
  const config = planConfig.configuration as Record<string, unknown>;
  const row = {
    id: planConfig.id,
    tenant_id: planConfig.tenantId,
    name: planConfig.name,
    description: planConfig.description || '',
    status: 'active',
    version: planConfig.version || 1,
    effective_from: planConfig.effectiveDate || undefined,
    effective_to: planConfig.endDate || undefined,
    population_config: {
      eligible_roles: planConfig.eligibleRoles || [],
    },
    input_bindings: {},
    components: config,
    cadence_config: {},
    outcome_config: {},
    metadata: {
      plan_type: planConfig.ruleSetType || 'additive_lookup',
      previous_version_id: planConfig.previousVersionId || null,
      updated_by: planConfig.updatedBy || PROFILE_ID,
    },
    created_by: planConfig.createdBy || PROFILE_ID,
  };

  const { error } = await sb.from('rule_sets').upsert(row);
  if (error) {
    console.error('Rule set save error:', error);
    throw new Error(`Rule set save failed: ${error.message}`);
  }
}

// ============================================
// RECORD CLASSIFICATION SIGNAL
// ============================================

async function recordSignal(
  signalType: string,
  source: string,
  payload: Record<string, unknown>,
  confidence: number,
): Promise<void> {
  const { error } = await sb.from('classification_signals').insert({
    tenant_id: TENANT_ID,
    signal_type: signalType,
    source,
    input_data: payload,
    output_data: payload,
    confidence,
    created_by: PROFILE_ID,
  });
  if (error) console.error('Signal recording error:', error);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('=== OB-88 Mission 1: Plan Import ===\n');

  // Step 1: Parse PPTX
  console.log('Step 1: Parsing PPTX file...');
  if (!fs.existsSync(PLAN_FILE)) {
    throw new Error(`Plan file not found: ${PLAN_FILE}`);
  }
  const { slides, textContent } = await parsePPTXFile(PLAN_FILE);
  console.log(`  Slides: ${slides.length}`);
  console.log(`  Text content: ${textContent.length} chars`);
  for (const s of slides) {
    console.log(`  Slide ${s.slideNumber}: ${s.texts.length} texts, ${s.tables.length} tables`);
  }

  // Save text content for debugging
  const textPath = path.join(__dirname, 'ob88-plan-text.txt');
  fs.writeFileSync(textPath, textContent, 'utf-8');
  console.log(`  Text content saved to ${textPath}\n`);

  // Step 2: AI Interpretation (use cache if available)
  console.log('Step 2: AI plan interpretation...');
  const interpCachePath = path.join(__dirname, 'ob88-plan-interpretation.json');
  let interpretation: Record<string, unknown>;
  if (fs.existsSync(interpCachePath)) {
    console.log('  Using cached interpretation from previous run...');
    interpretation = JSON.parse(fs.readFileSync(interpCachePath, 'utf-8'));
  } else {
    interpretation = await callAnthropicAPI(textContent);
  }
  console.log(`  Plan name: ${interpretation.ruleSetName}`);
  console.log(`  Currency: ${interpretation.currency}`);
  console.log(`  Employee types: ${(interpretation.employeeTypes as unknown[])?.length || 0}`);
  const comps = (interpretation.components || []) as Array<Record<string, unknown>>;
  console.log(`  Components: ${comps.length}`);
  for (const c of comps) {
    console.log(`    - ${c.name} (${c.type}) confidence: ${c.confidence}%`);
  }
  console.log(`  Overall confidence: ${interpretation.confidence}`);

  // Save interpretation for debugging
  const interpPath = path.join(__dirname, 'ob88-plan-interpretation.json');
  fs.writeFileSync(interpPath, JSON.stringify(interpretation, null, 2), 'utf-8');
  console.log(`  Interpretation saved to ${interpPath}\n`);

  // Step 3: Convert to rule set config
  console.log('Step 3: Converting to rule set config...');
  const planConfig = interpretationToRuleSet(interpretation);
  const config = planConfig.configuration as { variants: Array<{ variantId: string; components: unknown[] }> };
  console.log(`  Rule set ID: ${planConfig.id}`);
  console.log(`  Variants: ${config.variants.length}`);
  for (const v of config.variants) {
    console.log(`    - ${v.variantId}: ${v.components.length} components`);
  }

  // Step 4: Save to Supabase
  console.log('\nStep 4: Saving rule set to Supabase...');
  await saveRuleSet(planConfig);
  console.log('  Rule set saved and activated!');

  // Step 5: Record classification signal
  console.log('\nStep 5: Recording classification signal...');
  await recordSignal(
    'plan_interpretation',
    'ob88-mission1-script',
    {
      planFile: 'RetailCorp Plan1.pptx',
      ruleSetId: planConfig.id,
      componentCount: comps.length,
      employeeTypeCount: (interpretation.employeeTypes as unknown[])?.length || 0,
      currency: interpretation.currency,
    },
    (interpretation.confidence as number) / 100 || 0.5,
  );
  console.log('  Signal recorded.');

  // Step 6: Verify
  console.log('\n=== VERIFICATION ===');
  const { data: ruleSet, error: rsErr } = await sb
    .from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', TENANT_ID)
    .single();

  if (rsErr) {
    console.error('Verification failed:', rsErr);
    process.exit(1);
  }

  console.log(`  Rule set: ${ruleSet.id}`);
  console.log(`  Name: ${ruleSet.name}`);
  console.log(`  Status: ${ruleSet.status}`);

  const rsConfig = ruleSet.components as { variants?: Array<{ variantId: string; components: Array<{ name: string; componentType: string }> }> };
  if (rsConfig?.variants) {
    console.log(`  Variants: ${rsConfig.variants.length}`);
    for (const v of rsConfig.variants) {
      console.log(`    ${v.variantId}: ${v.components.length} components`);
      for (const c of v.components) {
        console.log(`      - ${c.name} (${c.componentType})`);
      }
    }
  }

  // Check signals
  const { count: signalCount } = await sb
    .from('classification_signals')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`  Classification signals: ${signalCount}`);

  console.log('\n=== RULE SET ID (save this) ===');
  console.log(planConfig.id);
  console.log('\n=== Mission 1 COMPLETE ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
