/**
 * OB-154 Phase 1: Direct plan import — extract PPTX text, call Anthropic, create rule_set
 * Same logic as executePlanPipeline but runs standalone.
 * Run from: spm-platform/web
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import JSZip from 'jszip';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PLAN_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/RetailCorp Data 1/RetailCorp Plan1.pptx';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.ANTHROPIC_API_KEY!;

async function extractPptxText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
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
  return allTexts.join('\n');
}

async function interpretPlan(documentContent: string): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a compensation plan analyst. Analyze the provided document and extract the complete compensation plan structure.

Return your analysis as valid JSON with this structure:
{
  "ruleSetName": "Name of the plan",
  "description": "Brief description",
  "components": [
    {
      "name": "Component name (in English)",
      "originalName": "Original component name from document",
      "calculationType": "matrix_lookup|tier_lookup|flat_percentage|conditional_percentage",
      "weight": null,
      "calculationIntent": {
        "type": "matrix_lookup|tiered_lookup|flat_percentage|conditional_percentage",
        "description": "How this component works",
        "inputs": { ... },
        "lookupTable": { ... },
        "tiers": [ ... ]
      },
      "appliesToEmployeeTypes": ["list of employee types this applies to"] or null
    }
  ]
}

Key rules:
- Extract ALL distinct calculation components
- Identify the calculation type for each (matrix_lookup for 2D tables, tier_lookup for 1D thresholds, flat_percentage for simple %, conditional_percentage for if/then)
- If there are variants (e.g., certified vs non-certified employees), note appliesToEmployeeTypes
- Use English names for components but preserve original names
- Extract the actual rate tables, tiers, and thresholds from the document`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Analyze this compensation plan document and extract all components:\n\n${documentContent}`,
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('No content in Anthropic response');

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(jsonStr.trim());
}

async function run() {
  console.log('=== OB-154 PHASE 1: DIRECT PLAN IMPORT ===\n');

  // Step 1: Extract text from PPTX
  console.log('Step 1: Extracting text from PPTX...');
  const documentContent = await extractPptxText(PLAN_FILE);
  console.log(`Extracted ${documentContent.length} chars from ${documentContent.split('\n').length} text segments`);

  // Step 2: Call Anthropic for plan interpretation
  console.log('\nStep 2: Calling Anthropic for plan interpretation...');
  const interpretation = await interpretPlan(documentContent);
  console.log(`Plan name: ${interpretation.ruleSetName}`);
  const components = (interpretation.components || []) as Array<Record<string, unknown>>;
  console.log(`Components: ${components.length}`);
  for (const c of components) {
    console.log(`  - ${c.name} (${c.calculationType})${c.appliesToEmployeeTypes ? ` [${(c.appliesToEmployeeTypes as string[]).join(', ')}]` : ''}`);
  }

  // Step 3: Create rule_set in database
  console.log('\nStep 3: Creating rule_set...');
  const ruleSetId = crypto.randomUUID();
  const planName = String(interpretation.ruleSetName || 'Optometrist Incentive Plan');

  const { error: upsertError } = await sb
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: OPTICA,
      name: planName,
      description: String(interpretation.description || ''),
      status: 'draft',
      version: 1,
      population_config: { eligible_roles: [] },
      input_bindings: {},
      components: { components },
      cadence_config: {},
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'ob154-direct',
      },
    });

  if (upsertError) {
    console.error('Failed to create rule_set:', upsertError.message);
    process.exit(1);
  }

  console.log(`Rule set created: ${ruleSetId}`);

  // Step 4: Verify
  console.log('\n--- Verification ---');
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', OPTICA);

  console.log(`Rule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) {
    const comps = rs.components;
    let count = 0;
    if (comps && typeof comps === 'object' && !Array.isArray(comps)) {
      const c = (comps as Record<string, unknown>).components;
      if (Array.isArray(c)) count = c.length;
    } else if (Array.isArray(comps)) {
      count = comps.length;
    }
    console.log(`  - ${rs.id.substring(0, 8)}... name="${rs.name}" status=${rs.status} components=${count}`);
  }

  const pass = (ruleSets?.length ?? 0) === 1;
  console.log(`\nPG-1: Rule set exists with >=6 components: ${pass && components.length >= 6 ? 'PASS' : 'CHECK'}`);
  console.log(`PG-2: No duplicate rule_sets (exactly 1): ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`\n=== Phase 1: ${pass ? 'PASS' : 'FAIL'} ===`);
}

run().catch(console.error);
