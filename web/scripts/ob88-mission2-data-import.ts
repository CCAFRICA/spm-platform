/**
 * OB-88 Mission 2: Data Import
 *
 * Imports BacktTest_Optometrista_mar2025_Proveedores.xlsx into the clean tenant.
 * Replicates the /api/import/commit pipeline:
 *   Parse Excel → Entity Resolution → Period Creation → committed_data → Rule Set Assignments
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PROFILE_ID = '824dfd85-de72-469c-aebc-4fe069481573';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';
const DATA_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/ENTB TEST/BacktTest_Optometrista_mar2025_Proveedores.xlsx';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Entity ID target fields (same as commit route)
const ENTITY_ID_TARGETS = ['entityid', 'entity_id', 'employeeid', 'employee_id', 'external_id', 'externalid', 'repid', 'rep_id', 'numero_emp', 'numero_empleado', 'num_empleado', 'id_empleado'];
const YEAR_TARGETS = ['year', 'period_year', 'año', 'ano'];
const MONTH_TARGETS = ['month', 'period_month', 'mes'];

interface SheetData {
  sheetName: string;
  rows: Record<string, unknown>[];
  headers: string[];
  mappings: Record<string, string>;
}

// ============================================
// STEP 1: PARSE EXCEL
// ============================================

function parseExcel(filePath: string): SheetData[] {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
  });

  const sheets: SheetData[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: true,
    });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);

    // Build auto-mappings based on header names
    const mappings: Record<string, string> = {};
    for (const h of headers) {
      const lower = h.toLowerCase().replace(/[\s_-]+/g, '_').trim();
      // Entity ID detection
      if (ENTITY_ID_TARGETS.includes(lower) || lower.includes('numero') && lower.includes('emp')) {
        mappings[h] = 'entityid';
      }
      // Year detection
      else if (YEAR_TARGETS.includes(lower) || lower === 'año' || lower === 'ano') {
        mappings[h] = 'year';
      }
      // Month detection
      else if (MONTH_TARGETS.includes(lower)) {
        mappings[h] = 'month';
      }
      // Keep original
      else {
        mappings[h] = h;
      }
    }

    sheets.push({ sheetName, rows, headers, mappings });
  }
  return sheets;
}

// ============================================
// STEP 2: AI FIELD CLASSIFICATION (via Anthropic)
// ============================================

async function classifyFieldsWithAI(sheets: SheetData[], planComponents: string[]): Promise<Record<string, Record<string, string>>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  No ANTHROPIC_API_KEY — using auto-detect only');
    return {};
  }

  // Build sheet info summary
  const sheetsInfo = sheets.map(s => {
    const sampleRow = s.rows[0] || {};
    return `Sheet: "${s.sheetName}" (${s.rows.length} rows)\nHeaders: ${s.headers.join(', ')}\nSample: ${JSON.stringify(sampleRow).substring(0, 500)}`;
  }).join('\n\n');

  const prompt = `Analyze the following multi-sheet workbook and classify each sheet and its columns.

SHEETS IN WORKBOOK:
${sheetsInfo}

TENANT'S PLAN COMPONENTS:
${planComponents.join(', ')}

For each sheet, tell me:
1. Which plan component does this sheet match?
2. Which column is the employee/entity ID?
3. Which columns are year and month?
4. What is the primary metric column?

Return a JSON object where each key is a sheet name and the value is a mapping of column names to semantic types.
Valid semantic types: entityid, year, month, amount, goal, attainment, quantity, store_id, ignore

Example:
{
  "Sheet1": { "Numero_Emp": "entityid", "Año": "year", "Mes": "month", "Venta": "amount" },
  "Sheet2": { "ID": "entityid", "Year": "year", "Month": "month", "Meta": "goal" }
}`;

  console.log('  Calling Anthropic API for field classification...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.error('  AI classification failed:', response.status);
    return {};
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  console.log('  AI tokens:', data.usage);

  // Parse JSON from response
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) jsonStr = objectMatch[0];

  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('  Failed to parse AI response');
    return {};
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const startTime = Date.now();
  console.log('=== OB-88 Mission 2: Data Import ===\n');

  // Step 1: Parse Excel
  console.log('Step 1: Parsing Excel file...');
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }
  const sheets = parseExcel(DATA_FILE);
  const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0);
  console.log(`  Sheets: ${sheets.length}, Total rows: ${totalRows}`);
  for (const s of sheets) {
    console.log(`  "${s.sheetName}": ${s.rows.length} rows, ${s.headers.length} columns`);
    console.log(`    Headers: ${s.headers.slice(0, 8).join(', ')}${s.headers.length > 8 ? '...' : ''}`);
  }

  // Step 2: AI field classification
  console.log('\nStep 2: AI field classification...');

  // Get plan component names from the rule set
  const { data: ruleSet } = await sb
    .from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  const planComponents: string[] = [];
  if (ruleSet?.components) {
    const config = ruleSet.components as { variants?: Array<{ components: Array<{ name: string }> }> };
    if (config.variants) {
      for (const v of config.variants) {
        for (const c of v.components) {
          if (!planComponents.includes(c.name)) planComponents.push(c.name);
        }
      }
    }
  }
  console.log(`  Plan components: ${planComponents.join(', ')}`);

  const aiMappings = await classifyFieldsWithAI(sheets, planComponents);

  // Merge AI mappings with auto-detected mappings
  for (const sheet of sheets) {
    const aiMap = aiMappings[sheet.sheetName];
    if (aiMap) {
      for (const [col, semantic] of Object.entries(aiMap)) {
        if (semantic && semantic !== 'ignore' && sheet.headers.includes(col)) {
          sheet.mappings[col] = semantic;
        }
      }
      console.log(`  ${sheet.sheetName}: AI mappings applied`);
    }
  }

  // Log final mappings
  for (const s of sheets) {
    const entityCol = Object.entries(s.mappings).find(([, v]) => v === 'entityid')?.[0];
    const yearCol = Object.entries(s.mappings).find(([, v]) => v === 'year')?.[0];
    const monthCol = Object.entries(s.mappings).find(([, v]) => v === 'month')?.[0];
    console.log(`  ${s.sheetName}: entity=${entityCol || 'NONE'}, year=${yearCol || 'NONE'}, month=${monthCol || 'NONE'}`);
  }

  // Step 3: Create import batch
  console.log('\nStep 3: Creating import batch...');
  const { data: batch, error: batchErr } = await sb
    .from('import_batches')
    .insert({
      tenant_id: TENANT_ID,
      file_name: 'BacktTest_Optometrista_mar2025_Proveedores.xlsx',
      file_type: 'xlsx',
      uploaded_by: PROFILE_ID,
      status: 'processing',
      row_count: 0,
      metadata: { source: 'ob88-mission2-script' },
    })
    .select('id')
    .single();

  if (batchErr || !batch) {
    throw new Error(`Import batch creation failed: ${batchErr?.message}`);
  }
  const batchId = batch.id;
  console.log(`  Batch ID: ${batchId}`);

  // Step 4: Bulk entity resolution
  console.log('\nStep 4: Entity resolution...');
  const externalIds = new Set<string>();

  for (const sheet of sheets) {
    const entityCols = Object.entries(sheet.mappings)
      .filter(([, target]) => target === 'entityid')
      .map(([source]) => source);

    // Auto-detect fallback
    if (entityCols.length === 0 && sheet.rows[0]) {
      for (const key of Object.keys(sheet.rows[0])) {
        const lower = key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
        if (ENTITY_ID_TARGETS.includes(lower)) {
          entityCols.push(key);
          sheet.mappings[key] = 'entityid';
        }
      }
    }

    for (const row of sheet.rows) {
      for (const col of entityCols) {
        const val = row[col];
        if (val != null && String(val).trim()) {
          externalIds.add(String(val).trim());
        }
      }
    }
  }

  console.log(`  Unique external IDs: ${externalIds.size}`);

  const entityIdMap = new Map<string, string>();
  const allExternalIds = Array.from(externalIds);

  if (allExternalIds.length > 0) {
    // Fetch existing entities
    const FETCH_BATCH = 200;
    for (let i = 0; i < allExternalIds.length; i += FETCH_BATCH) {
      const slice = allExternalIds.slice(i, i + FETCH_BATCH);
      const { data: existing } = await sb
        .from('entities')
        .select('id, external_id')
        .eq('tenant_id', TENANT_ID)
        .in('external_id', slice);

      if (existing) {
        for (const e of existing) {
          if (e.external_id) entityIdMap.set(e.external_id, e.id);
        }
      }
    }

    console.log(`  Existing entities: ${entityIdMap.size}`);

    // Create missing entities
    const newEntityExternalIds = allExternalIds.filter(eid => !entityIdMap.has(eid));
    if (newEntityExternalIds.length > 0) {
      const newEntities = newEntityExternalIds.map(eid => ({
        tenant_id: TENANT_ID,
        external_id: eid,
        display_name: eid,
        entity_type: 'individual' as const,
        status: 'active' as const,
        temporal_attributes: [] as unknown[],
        metadata: {},
      }));

      const INSERT_BATCH = 5000;
      for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
        const slice = newEntities.slice(i, i + INSERT_BATCH);
        const { data: inserted, error: entErr } = await sb
          .from('entities')
          .insert(slice)
          .select('id, external_id');

        if (entErr) {
          throw new Error(`Entity creation failed: ${entErr.message}`);
        }
        if (inserted) {
          for (const e of inserted) {
            if (e.external_id) entityIdMap.set(e.external_id, e.id);
          }
        }
      }
      console.log(`  Created ${newEntityExternalIds.length} new entities`);
    }
  }

  console.log(`  Entity map total: ${entityIdMap.size}`);

  // Step 5: Period deduplication
  console.log('\nStep 5: Period creation...');
  const uniquePeriods = new Map<string, { year: number; month: number }>();

  for (const sheet of sheets) {
    const yearCols = Object.entries(sheet.mappings)
      .filter(([, t]) => t === 'year')
      .map(([s]) => s);
    const monthCols = Object.entries(sheet.mappings)
      .filter(([, t]) => t === 'month')
      .map(([s]) => s);

    for (const row of sheet.rows) {
      let year: number | null = null;
      let month: number | null = null;

      if (yearCols.length > 0) {
        const yearVal = row[yearCols[0]];
        if (yearVal != null) {
          const num = typeof yearVal === 'number' ? yearVal : parseInt(String(yearVal), 10);
          if (!isNaN(num) && num >= 2020 && num <= 2030) year = num;
        }
      }
      if (monthCols.length > 0) {
        const monthVal = row[monthCols[0]];
        if (monthVal != null) {
          const num = typeof monthVal === 'number' ? monthVal : parseInt(String(monthVal), 10);
          if (!isNaN(num) && num >= 1 && num <= 12) month = num;
        }
      }

      if (year && month) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (!uniquePeriods.has(key)) {
          uniquePeriods.set(key, { year, month });
        }
      }
    }
  }

  console.log(`  Unique periods found: ${uniquePeriods.size} (${Array.from(uniquePeriods.keys()).join(', ')})`);

  const periodKeyMap = new Map<string, string>();

  // Fetch existing periods
  const { data: existingPeriods } = await sb
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', TENANT_ID);

  if (existingPeriods) {
    for (const p of existingPeriods) {
      if (p.canonical_key) periodKeyMap.set(p.canonical_key, p.id);
    }
  }

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const newPeriodKeys = Array.from(uniquePeriods.keys()).filter(k => !periodKeyMap.has(k));
  if (newPeriodKeys.length > 0) {
    const newPeriods = newPeriodKeys.map(key => {
      const { year, month } = uniquePeriods.get(key)!;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return {
        tenant_id: TENANT_ID,
        canonical_key: key,
        label: `${MONTH_NAMES[month]} ${year}`,
        period_type: 'monthly' as const,
        start_date: startDate,
        end_date: endDate,
        status: 'open' as const,
        metadata: { year, month },
      };
    });

    const { data: inserted, error: pErr } = await sb
      .from('periods')
      .insert(newPeriods)
      .select('id, canonical_key');

    if (pErr) {
      console.error('  Period creation error:', pErr);
    } else if (inserted) {
      for (const p of inserted) {
        if (p.canonical_key) periodKeyMap.set(p.canonical_key, p.id);
      }
      console.log(`  Created ${newPeriods.length} new periods`);
    }
  }

  console.log(`  Period map: ${Array.from(periodKeyMap.entries()).map(([k, v]) => `${k}=${v.substring(0, 8)}`).join(', ')}`);

  // Helper: resolve period_id for a row
  const resolvePeriodId = (row: Record<string, unknown>, sheet: SheetData): string | null => {
    const yearCols = Object.entries(sheet.mappings)
      .filter(([, t]) => t === 'year')
      .map(([s]) => s);
    const monthCols = Object.entries(sheet.mappings)
      .filter(([, t]) => t === 'month')
      .map(([s]) => s);

    let year: number | null = null;
    let month: number | null = null;

    if (yearCols.length > 0) {
      const v = row[yearCols[0]];
      if (v != null) { const n = typeof v === 'number' ? v : parseInt(String(v), 10); if (!isNaN(n) && n >= 2020 && n <= 2030) year = n; }
    }
    if (monthCols.length > 0) {
      const v = row[monthCols[0]];
      if (v != null) { const n = typeof v === 'number' ? v : parseInt(String(v), 10); if (!isNaN(n) && n >= 1 && n <= 12) month = n; }
    }

    if (year && month) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      return periodKeyMap.get(key) || null;
    }

    // Fallback: first period
    if (periodKeyMap.size > 0) return Array.from(periodKeyMap.values())[0];
    return null;
  };

  // Step 6: Bulk insert committed_data
  console.log('\nStep 6: Inserting committed_data...');
  let totalRecords = 0;

  for (const sheet of sheets) {
    const entityCol = Object.entries(sheet.mappings)
      .find(([, target]) => target === 'entityid')?.[0];

    // Auto-detect fallback
    let effectiveEntityCol = entityCol;
    if (!effectiveEntityCol && sheet.rows[0]) {
      for (const key of Object.keys(sheet.rows[0])) {
        const lower = key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
        if (ENTITY_ID_TARGETS.includes(lower)) {
          effectiveEntityCol = key;
          break;
        }
      }
    }

    const insertRows = sheet.rows.map((row, i) => {
      // Apply mappings: add both original and semantic keys
      const mapped: Record<string, unknown> = {};
      for (const [sourceCol, value] of Object.entries(row)) {
        const targetField = sheet.mappings[sourceCol];
        if (targetField && targetField !== 'ignore' && targetField !== sourceCol) {
          mapped[targetField] = value;
        }
        mapped[sourceCol] = value; // Keep originals too
      }

      let entityId: string | null = null;
      if (effectiveEntityCol && row[effectiveEntityCol] != null) {
        entityId = entityIdMap.get(String(row[effectiveEntityCol]).trim()) || null;
      }

      const periodId = resolvePeriodId(row, sheet);

      return {
        tenant_id: TENANT_ID,
        import_batch_id: batchId,
        entity_id: entityId,
        period_id: periodId,
        data_type: sheet.sheetName,
        row_data: { ...mapped, _sheetName: sheet.sheetName, _rowIndex: i },
        metadata: { source_sheet: sheet.sheetName },
      };
    });

    const CHUNK = 5000;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const slice = insertRows.slice(i, i + CHUNK);
      const { error: insertErr } = await sb
        .from('committed_data')
        .insert(slice);

      if (insertErr) {
        console.error(`  INSERT ERROR (${sheet.sheetName}, chunk ${Math.floor(i / CHUNK)}):`, insertErr);
        throw new Error(`Data insert failed: ${insertErr.message}`);
      }
      totalRecords += slice.length;
    }

    console.log(`  "${sheet.sheetName}": ${insertRows.length} rows`);
  }

  console.log(`  Total committed: ${totalRecords}`);

  // Step 7: Rule set assignments
  console.log('\nStep 7: Rule set assignments...');
  const entityUuids = Array.from(new Set(Array.from(entityIdMap.values()).filter(Boolean)));

  if (entityUuids.length > 0) {
    const existingSet = new Set<string>();
    const CHECK_BATCH = 200;
    for (let i = 0; i < entityUuids.length; i += CHECK_BATCH) {
      const slice = entityUuids.slice(i, i + CHECK_BATCH);
      const { data: existing } = await sb
        .from('rule_set_assignments')
        .select('entity_id')
        .eq('tenant_id', TENANT_ID)
        .eq('rule_set_id', RULE_SET_ID)
        .in('entity_id', slice);

      if (existing) {
        for (const a of existing) existingSet.add(a.entity_id);
      }
    }

    const newAssignments = entityUuids
      .filter(id => !existingSet.has(id))
      .map(entityId => ({
        tenant_id: TENANT_ID,
        entity_id: entityId,
        rule_set_id: RULE_SET_ID,
        effective_from: new Date().toISOString().split('T')[0],
      }));

    if (newAssignments.length > 0) {
      const ASSIGN_BATCH = 5000;
      for (let i = 0; i < newAssignments.length; i += ASSIGN_BATCH) {
        const slice = newAssignments.slice(i, i + ASSIGN_BATCH);
        const { error: assignErr } = await sb.from('rule_set_assignments').insert(slice);
        if (assignErr) console.error('  Assignment error:', assignErr);
      }
      console.log(`  Created ${newAssignments.length} assignments`);
    } else {
      console.log(`  All ${entityUuids.length} entities already assigned`);
    }
  }

  // Step 8: Update batch status
  await sb.from('import_batches').update({
    status: 'completed',
    row_count: totalRecords,
    completed_at: new Date().toISOString(),
  }).eq('id', batchId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // VERIFICATION
  console.log('\n=== VERIFICATION ===');

  // Entity count
  const { count: entityCount } = await sb
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`  Entities: ${entityCount} (expect ~719)`);

  // Period count
  const { data: periods } = await sb
    .from('periods')
    .select('canonical_key, label')
    .eq('tenant_id', TENANT_ID);
  console.log(`  Periods: ${periods?.length} (${periods?.map(p => p.canonical_key).join(', ')})`);

  // Committed data count
  const { count: dataCount } = await sb
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`  Committed data: ${dataCount} rows`);

  // Data per sheet
  for (const s of sheets) {
    const { count: sheetCount } = await sb
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', s.sheetName);
    console.log(`    "${s.sheetName}": ${sheetCount}`);
  }

  // Assignment count
  const { count: assignCount } = await sb
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('rule_set_id', RULE_SET_ID);
  console.log(`  Rule set assignments: ${assignCount}`);

  console.log(`\n  Elapsed: ${elapsed}s`);
  console.log('\n=== Mission 2 COMPLETE ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
