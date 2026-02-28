/**
 * POST /api/import/commit
 *
 * HF-047: File-based import pipeline.
 * Receives metadata only (< 50KB). Downloads file from Supabase Storage,
 * parses Excel server-side, applies field mappings, bulk inserts to DB.
 *
 * Receives: { tenantId, userId, fileName, storagePath, sheetMappings }
 * Returns:  { success, batchId, recordCount, entityCount, periodId, periods[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes max

interface SheetData {
  sheetName: string;
  rows: Record<string, unknown>[];
  mappings?: Record<string, string>;
}

interface AIImportContextSheet {
  sheetName: string;
  classification: string;
  matchedComponent: string | null;
  matchedComponentConfidence: number | null;
  fieldMappings: Array<{ sourceColumn: string; semanticType: string; confidence: number }>;
}

interface AIImportContext {
  tenantId: string;
  batchId?: string;
  timestamp: string;
  rosterSheet: string | null;
  rosterEmployeeIdColumn: string | null;
  sheets: AIImportContextSheet[];
}

interface CommitRequest {
  tenantId: string;
  userId: string;
  fileName: string;
  storagePath: string;
  sheetMappings: Record<string, Record<string, string>>;
  aiContext?: AIImportContext;
}

// Entity ID — generic target field IDs only (AP-5/AP-6: no hardcoded language-specific names)
// The AI field mapper on the client maps source columns (ID Empleado, Num Empleado, etc.) to these generic targets.
const ENTITY_ID_TARGETS = ['entityid', 'entity_id', 'employeeid', 'employee_id', 'external_id', 'externalid', 'repid', 'rep_id'];

// Period detection — generic target field IDs only (AP-5/AP-6: no hardcoded language-specific names)
// The AI field mapper on the client maps source columns (Año, Mes, Fecha, etc.) to these generic targets.
const PERIOD_TARGETS = ['period', 'period_key', 'periodKey', 'date', 'period_date'];
const YEAR_TARGETS = ['year', 'period_year'];
const MONTH_TARGETS = ['month', 'period_month'];

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Step 0: Authenticate ──
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // ── Step 1: Parse request body (metadata only — < 50KB) ──
    const body: CommitRequest = await request.json();
    const { tenantId, userId, fileName, storagePath, sheetMappings, aiContext } = body;

    if (!tenantId || !fileName || !storagePath) {
      return NextResponse.json(
        { error: 'Missing required fields: tenantId, fileName, storagePath' },
        { status: 400 }
      );
    }

    console.log(`[ImportCommit] Starting file-based import: ${fileName}, storage=${storagePath}, tenant=${tenantId}`);

    // ── Step 2: Get service role client ──
    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      console.error('[ImportCommit] Service role client unavailable, falling back to auth client');
      supabase = authClient;
    }

    // ── Step 3: Download file from Supabase Storage ──
    console.log(`[ImportCommit] Downloading file from storage: ${storagePath}`);
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('imports')
      .download(storagePath);

    if (downloadError || !fileBlob) {
      console.error('[ImportCommit] File download failed:', downloadError);
      return NextResponse.json(
        { error: 'File download failed', details: downloadError?.message || 'File not found' },
        { status: 500 }
      );
    }

    const fileSizeMB = (fileBlob.size / 1024 / 1024).toFixed(1);
    console.log(`[ImportCommit] File downloaded: ${fileSizeMB}MB`);

    // ── Step 4: Parse Excel server-side ──
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellNF: false,
      cellStyles: false,
    });

    const sheetData: SheetData[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: null,
        raw: true,
      });

      if (rows.length === 0) continue;

      // Apply field mappings from client metadata
      const mappings = sheetMappings?.[sheetName];

      // If no explicit mappings, auto-detect via raw column headers
      if (!mappings || Object.keys(mappings).length === 0) {
        const headers = Object.keys(rows[0]);
        const autoMappings: Record<string, string> = {};
        for (const h of headers) {
          autoMappings[h] = h; // identity mapping — entity ID fields auto-detected below
        }
        sheetData.push({ sheetName, rows, mappings: autoMappings });
      } else {
        sheetData.push({ sheetName, rows, mappings });
      }
    }

    console.log(`[ImportCommit] Parsed ${sheetData.length} sheets, ${sheetData.reduce((n, s) => n + s.rows.length, 0)} total rows`);

    if (sheetData.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in file' },
        { status: 400 }
      );
    }

    // ── Step 5: Create import batch ──
    // OB-75: Include AI context in metadata if available
    const batchMetadata = aiContext ? {
      ai_context: {
        timestamp: aiContext.timestamp,
        rosterSheet: aiContext.rosterSheet,
        rosterEmployeeIdColumn: aiContext.rosterEmployeeIdColumn,
        sheets: aiContext.sheets,
      },
    } : {};

    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        tenant_id: tenantId,
        file_name: fileName,
        file_type: fileName.split('.').pop() || 'xlsx',
        uploaded_by: userId || null,
        status: 'processing',
        row_count: 0,
        metadata: batchMetadata as unknown as Json,
      })
      .select('id')
      .single();

    if (batchErr || !batch) {
      console.error('[ImportCommit] Failed to create import batch:', batchErr);
      return NextResponse.json(
        { error: 'Failed to create import batch', details: batchErr?.message },
        { status: 500 }
      );
    }

    const batchId = batch.id;
    if (aiContext) {
      console.log(`[ImportCommit] Batch created with AI context: ${batchId} (${aiContext.sheets.length} sheets)`);
    } else {
      console.log(`[ImportCommit] Batch created: ${batchId}`);
    }

    // ── Step 6: Bulk entity resolution (with roster metadata enrichment) ──
    const externalIds = new Set<string>();
    // OB-103: Build roster metadata index for entity enrichment
    const rosterMetadata = new Map<string, Record<string, unknown>>();

    // Identify roster sheet from AI context
    const rosterSheetName = aiContext?.rosterSheet || null;
    const NAME_TARGETS = ['name', 'entity_name', 'display_name', 'employee_name', 'nombre'];
    const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];
    const LICENSE_TARGETS = ['productlicenses', 'product_licenses', 'licenses', 'products', 'licencias'];

    for (const sheet of sheetData) {
      if (!sheet.mappings) continue;
      const entityCols = Object.entries(sheet.mappings)
        .filter(([, target]) => ENTITY_ID_TARGETS.includes(target.toLowerCase()))
        .map(([source]) => source);

      // Auto-detect fallback: match raw header names against ENTITY_ID_TARGETS
      if (entityCols.length === 0 && sheet.rows[0]) {
        for (const key of Object.keys(sheet.rows[0])) {
          const lower = key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
          if (ENTITY_ID_TARGETS.includes(lower)) {
            entityCols.push(key);
          }
        }
      }

      // OB-103: For roster sheets, extract name/role/licenses columns
      const isRosterSheet = sheet.sheetName === rosterSheetName ||
        (aiContext?.sheets?.find(s => s.sheetName === sheet.sheetName)?.classification === 'roster');

      for (const row of sheet.rows) {
        for (const col of entityCols) {
          const val = row[col];
          if (val != null && String(val).trim()) {
            const eid = String(val).trim();
            externalIds.add(eid);

            // OB-103: Capture roster metadata per entity (name, role, licenses)
            if (isRosterSheet && !rosterMetadata.has(eid)) {
              const meta: Record<string, unknown> = {};
              for (const [sourceCol, targetField] of Object.entries(sheet.mappings || {})) {
                const target = targetField.toLowerCase();
                if (NAME_TARGETS.includes(target)) {
                  meta.display_name = row[sourceCol] ? String(row[sourceCol]).trim() : null;
                } else if (ROLE_TARGETS.includes(target)) {
                  meta.role = row[sourceCol] ? String(row[sourceCol]).trim() : null;
                }
              }
              // OB-103: Detect compound license fields by column name pattern (case-insensitive)
              for (const key of Object.keys(row)) {
                const lower = key.toLowerCase().replace(/[\s_-]+/g, '');
                if (LICENSE_TARGETS.some(t => lower.includes(t))) {
                  meta.product_licenses = row[key] ? String(row[key]).trim() : null;
                }
              }
              // Fallback: try mapped fields too
              if (!meta.display_name) {
                for (const key of Object.keys(row)) {
                  const lower = key.toLowerCase().replace(/[\s_-]+/g, '_');
                  if (NAME_TARGETS.some(t => lower.includes(t))) {
                    meta.display_name = row[key] ? String(row[key]).trim() : null;
                    break;
                  }
                }
              }
              rosterMetadata.set(eid, meta);
            }
          }
        }
      }
    }

    console.log(`[ImportCommit] Unique external IDs: ${externalIds.size}, roster metadata: ${rosterMetadata.size}`);

    const entityIdMap = new Map<string, string>(); // externalId → UUID
    const allExternalIds = Array.from(externalIds);

    if (allExternalIds.length > 0) {
      const FETCH_BATCH = 200; // Standing rule: Supabase URL limit ≤200 items
      for (let i = 0; i < allExternalIds.length; i += FETCH_BATCH) {
        const slice = allExternalIds.slice(i, i + FETCH_BATCH);
        const { data: existing } = await supabase
          .from('entities')
          .select('id, external_id')
          .eq('tenant_id', tenantId)
          .in('external_id', slice);

        if (existing) {
          for (const e of existing) {
            if (e.external_id) entityIdMap.set(e.external_id, e.id);
          }
        }
      }

      const newEntityExternalIds = allExternalIds.filter(eid => !entityIdMap.has(eid));
      if (newEntityExternalIds.length > 0) {
        // OB-103: Enrich entities with roster metadata (name, role, licenses)
        const newEntities = newEntityExternalIds.map(eid => {
          const meta = rosterMetadata.get(eid) || {};
          return {
            tenant_id: tenantId,
            external_id: eid,
            display_name: (meta.display_name as string) || eid,
            entity_type: 'individual' as const,
            status: 'active' as const,
            temporal_attributes: [] as Json[],
            metadata: {
              ...(meta.role ? { role: meta.role } : {}),
              ...(meta.product_licenses ? { product_licenses: meta.product_licenses } : {}),
            } as Record<string, Json>,
          };
        });

        const INSERT_BATCH = 5000;
        for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
          const slice = newEntities.slice(i, i + INSERT_BATCH);
          const { data: inserted, error: entErr } = await supabase
            .from('entities')
            .insert(slice)
            .select('id, external_id');

          if (entErr) {
            console.error(`[ImportCommit] Entity bulk insert failed:`, entErr);
            await supabase.from('import_batches').update({ status: 'failed', error_summary: { step: 'entities', error: entErr.message } }).eq('id', batchId);
            return NextResponse.json({ error: 'Entity creation failed', details: entErr.message }, { status: 500 });
          }

          if (inserted) {
            for (const e of inserted) {
              if (e.external_id) entityIdMap.set(e.external_id, e.id);
            }
          }
        }
        console.log(`[ImportCommit] Created ${newEntityExternalIds.length} new entities (${rosterMetadata.size} with roster metadata)`);
      }
    }

    console.log(`[ImportCommit] Entity map: ${entityIdMap.size} total`);

    // ── Step 7: Period deduplication ──
    // OB-107: Build classification lookup from AI context to skip roster sheets
    const sheetClassifications = new Map<string, string>();
    if (aiContext?.sheets) {
      for (const s of aiContext.sheets) {
        sheetClassifications.set(s.sheetName, s.classification);
      }
    }

    const uniquePeriods = new Map<string, { year: number; month: number }>();

    for (const sheet of sheetData) {
      if (!sheet.mappings && !sheet.rows[0]) continue;

      // OB-107: Skip roster/personnel sheets for period detection.
      // Roster dates (HireDate, StartDate) are entity attributes, not performance boundaries.
      const classification = sheetClassifications.get(sheet.sheetName);
      if (classification === 'roster' || classification === 'unrelated') {
        console.log(`[ImportCommit] Skipping period detection for ${classification} sheet: "${sheet.sheetName}"`);
        continue;
      }

      const yearCols: string[] = [];
      const monthCols: string[] = [];

      if (sheet.mappings) {
        for (const [source, target] of Object.entries(sheet.mappings)) {
          const t = target.toLowerCase();
          if (YEAR_TARGETS.includes(t)) yearCols.push(source);
          if (MONTH_TARGETS.includes(t)) monthCols.push(source);
        }
      }

      const periodCols: string[] = [];
      if (sheet.mappings) {
        for (const [source, target] of Object.entries(sheet.mappings)) {
          if (PERIOD_TARGETS.includes(target)) periodCols.push(source);
        }
      }

      for (const row of sheet.rows) {
        let year: number | null = null;
        let month: number | null = null;

        // Strategy A: Combined period column (Excel serial date)
        for (const col of periodCols) {
          const value = row[col];
          if (value == null) continue;
          if (typeof value === 'number' && value > 25000 && value < 100000) {
            const d = new Date((value - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) {
              year = d.getUTCFullYear();
              month = d.getUTCMonth() + 1;
              break;
            }
          }
          const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);
          if (!isNaN(numValue)) {
            if (numValue >= 2020 && numValue <= 2030) year = numValue;
            else if (numValue >= 1 && numValue <= 12) month = numValue;
          }
        }

        // Strategy B: Separate year + month columns
        if (!year && yearCols.length > 0) {
          const yearVal = row[yearCols[0]];
          if (yearVal != null) {
            const num = typeof yearVal === 'number' ? yearVal : parseInt(String(yearVal), 10);
            if (!isNaN(num) && num >= 2020 && num <= 2030) year = num;
          }
        }
        if (!month && monthCols.length > 0) {
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

    console.log(`[ImportCommit] Unique periods found: ${uniquePeriods.size} (${Array.from(uniquePeriods.keys()).join(', ')})`);

    const periodKeyMap = new Map<string, string>(); // periodKey → UUID
    const periodKeys = Array.from(uniquePeriods.keys());

    if (periodKeys.length > 0) {
      const { data: existingPeriods } = await supabase
        .from('periods')
        .select('id, canonical_key')
        .eq('tenant_id', tenantId);

      if (existingPeriods) {
        for (const p of existingPeriods) {
          if (p.canonical_key) {
            periodKeyMap.set(p.canonical_key, p.id);
          }
        }
      }

      const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      const newPeriods = periodKeys
        .filter(key => !periodKeyMap.has(key))
        .map(key => {
          const { year, month } = uniquePeriods.get(key)!;
          const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
          const lastDay = new Date(year, month, 0).getDate();
          const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          return {
            tenant_id: tenantId,
            canonical_key: key,
            label: `${MONTH_NAMES[month]} ${year}`,
            period_type: 'monthly' as const,
            start_date: startDate,
            end_date: endDate,
            status: 'open' as const,
            metadata: { year, month } as unknown as Json,
          };
        });

      if (newPeriods.length > 0) {
        const { data: inserted, error: pErr } = await supabase
          .from('periods')
          .insert(newPeriods)
          .select('id, canonical_key');

        if (pErr) {
          console.warn(`[ImportCommit] Period creation failed:`, pErr);
        } else if (inserted) {
          for (const p of inserted) {
            if (p.canonical_key) {
              periodKeyMap.set(p.canonical_key, p.id);
            }
          }
          console.log(`[ImportCommit] Created ${newPeriods.length} new periods`);
        }
      }
    }

    // Helper: resolve period_id for a given row
    const resolvePeriodId = (row: Record<string, unknown>, sheet: SheetData): string | null => {
      const yearCols: string[] = [];
      const monthCols: string[] = [];
      const periodCols: string[] = [];

      if (sheet.mappings) {
        for (const [source, target] of Object.entries(sheet.mappings)) {
          const t = target.toLowerCase();
          if (YEAR_TARGETS.includes(t)) yearCols.push(source);
          if (MONTH_TARGETS.includes(t)) monthCols.push(source);
          if (PERIOD_TARGETS.includes(target)) periodCols.push(source);
        }
      }

      let year: number | null = null;
      let month: number | null = null;

      for (const col of periodCols) {
        const value = row[col];
        if (value == null) continue;
        if (typeof value === 'number' && value > 25000 && value < 100000) {
          const d = new Date((value - 25569) * 86400 * 1000);
          if (!isNaN(d.getTime())) { year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; break; }
        }
        const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (!isNaN(numValue)) {
          if (numValue >= 2020 && numValue <= 2030) year = numValue;
          else if (numValue >= 1 && numValue <= 12) month = numValue;
        }
      }
      if (!year && yearCols.length > 0) {
        const v = row[yearCols[0]];
        if (v != null) { const n = typeof v === 'number' ? v : parseInt(String(v), 10); if (!isNaN(n) && n >= 2020 && n <= 2030) year = n; }
      }
      if (!month && monthCols.length > 0) {
        const v = row[monthCols[0]];
        if (v != null) { const n = typeof v === 'number' ? v : parseInt(String(v), 10); if (!isNaN(n) && n >= 1 && n <= 12) month = n; }
      }

      if (year && month) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        return periodKeyMap.get(key) || null;
      }

      if (periodKeyMap.size > 0) {
        return Array.from(periodKeyMap.values())[0];
      }
      return null;
    };

    // ── Step 8: Build and bulk-insert committed_data ──
    // OB-115: Resolve meaningful data_type from AI classification instead of XLSX.js sheet name.
    // Priority: 1) AI matchedComponent  2) AI classification + filename  3) filename (no ext)  4) sheet name
    const resolveDataType = (sheetName: string): string => {
      const aiSheet = aiContext?.sheets?.find(s => s.sheetName === sheetName);
      if (aiSheet?.matchedComponent) {
        return aiSheet.matchedComponent;
      }
      if (aiSheet?.classification && aiSheet.classification !== 'unrelated') {
        // Use classification + filename stem for differentiation (e.g. "component_data:CFG_Deposit_Balances_Q1_2024")
        const stem = fileName.replace(/\.[^.]+$/, '');
        return `${aiSheet.classification}:${stem}`;
      }
      // Fallback: if sheet name is generic "Sheet1" (CSV default), use filename stem instead
      if (sheetName === 'Sheet1' || sheetName === 'Hoja1') {
        return fileName.replace(/\.[^.]+$/, '');
      }
      return sheetName;
    };

    let totalRecords = 0;

    for (const sheet of sheetData) {
      const entityCol = sheet.mappings
        ? Object.entries(sheet.mappings).find(([, target]) => ENTITY_ID_TARGETS.includes(target.toLowerCase()))?.[0]
        : null;

      // Auto-detect fallback: match raw header names against ENTITY_ID_TARGETS
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
        let content = { ...row };
        if (sheet.mappings) {
          const mapped: Record<string, unknown> = {};
          for (const [sourceCol, value] of Object.entries(row)) {
            const targetField = sheet.mappings[sourceCol];
            if (targetField && targetField !== 'ignore') {
              mapped[targetField] = value;
            }
            mapped[sourceCol] = value;
          }
          content = mapped;
        }

        let entityId: string | null = null;
        if (effectiveEntityCol && row[effectiveEntityCol] != null) {
          entityId = entityIdMap.get(String(row[effectiveEntityCol]).trim()) || null;
        }

        const periodId = resolvePeriodId(row, sheet);

        return {
          tenant_id: tenantId,
          import_batch_id: batchId,
          entity_id: entityId,
          period_id: periodId,
          data_type: resolveDataType(sheet.sheetName),
          row_data: { ...content, _sheetName: sheet.sheetName, _rowIndex: i },
          metadata: { source_sheet: sheet.sheetName, resolved_data_type: resolveDataType(sheet.sheetName) },
        };
      });

      const CHUNK = 5000;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const slice = insertRows.slice(i, i + CHUNK);
        const { error: insertErr } = await supabase
          .from('committed_data')
          .insert(slice);

        if (insertErr) {
          console.error(`[ImportCommit] committed_data insert failed at chunk ${Math.floor(i / CHUNK)}:`, insertErr);
          await supabase.from('import_batches').update({
            status: 'failed',
            error_summary: { step: 'committed_data', sheet: sheet.sheetName, chunk: Math.floor(i / CHUNK), error: insertErr.message },
          }).eq('id', batchId);
          return NextResponse.json({
            error: 'Data insert failed',
            details: insertErr.message,
            sheet: sheet.sheetName,
            recordsInserted: totalRecords,
          }, { status: 500 });
        }

        totalRecords += slice.length;
      }

      console.log(`[ImportCommit] Sheet "${sheet.sheetName}": ${insertRows.length} rows inserted`);
    }

    // ── Step 9: Rule set assignments (OB-103: multi-plan via ProductLicenses) ──
    let assignmentCount = 0;
    try {
      // Fetch ALL active rule sets for this tenant (multi-plan support)
      const { data: allRuleSets } = await supabase
        .from('rule_sets')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const ruleSets = allRuleSets || [];
      console.log(`[ImportCommit] Active rule sets: ${ruleSets.length}`);

      if (ruleSets.length > 0) {
        const entityUuids = Array.from(new Set(
          Array.from(entityIdMap.values()).filter(Boolean)
        ));

        if (entityUuids.length > 0) {
          // Fetch existing assignments for all rule sets at once
          const existingAssignments = new Set<string>(); // "entityId:ruleSetId"
          const CHECK_BATCH = 200;
          for (let i = 0; i < entityUuids.length; i += CHECK_BATCH) {
            const slice = entityUuids.slice(i, i + CHECK_BATCH);
            const { data: existing } = await supabase
              .from('rule_set_assignments')
              .select('entity_id, rule_set_id')
              .eq('tenant_id', tenantId)
              .in('entity_id', slice);

            if (existing) {
              for (const a of existing) existingAssignments.add(`${a.entity_id}:${a.rule_set_id}`);
            }
          }

          const newAssignments: Array<{
            tenant_id: string;
            entity_id: string;
            rule_set_id: string;
            effective_from: string;
          }> = [];

          // OB-103: Build license → rule set name mapping for multi-plan assignment
          const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
          const ruleSetNameMap = new Map(ruleSets.map(rs => [normalizeForMatch(rs.name || ''), rs.id]));

          for (const [externalId, entityUuid] of Array.from(entityIdMap.entries())) {
            const meta = rosterMetadata.get(externalId);
            const licenses = meta?.product_licenses ? String(meta.product_licenses) : null;

            if (licenses && ruleSets.length > 1) {
              // OB-103: Multi-plan — parse compound ProductLicenses field
              const licenseList = licenses.split(',').map(l => l.trim()).filter(Boolean);

              for (const license of licenseList) {
                const normalizedLicense = normalizeForMatch(license);
                // Try exact match first, then substring match
                let matchedRsId = ruleSetNameMap.get(normalizedLicense);
                if (!matchedRsId) {
                  for (const [rsNorm, rsId] of Array.from(ruleSetNameMap.entries())) {
                    if (rsNorm.includes(normalizedLicense) || normalizedLicense.includes(rsNorm)) {
                      matchedRsId = rsId;
                      break;
                    }
                  }
                }
                if (matchedRsId && !existingAssignments.has(`${entityUuid}:${matchedRsId}`)) {
                  newAssignments.push({
                    tenant_id: tenantId,
                    entity_id: entityUuid,
                    rule_set_id: matchedRsId,
                    effective_from: new Date().toISOString().split('T')[0],
                  });
                  existingAssignments.add(`${entityUuid}:${matchedRsId}`);
                }
              }
            } else {
              // Single plan fallback — assign to first active rule set
              const defaultRsId = ruleSets[0].id;
              if (!existingAssignments.has(`${entityUuid}:${defaultRsId}`)) {
                newAssignments.push({
                  tenant_id: tenantId,
                  entity_id: entityUuid,
                  rule_set_id: defaultRsId,
                  effective_from: new Date().toISOString().split('T')[0],
                });
                existingAssignments.add(`${entityUuid}:${defaultRsId}`);
              }
            }
          }

          if (newAssignments.length > 0) {
            const ASSIGN_BATCH = 5000;
            for (let i = 0; i < newAssignments.length; i += ASSIGN_BATCH) {
              const slice = newAssignments.slice(i, i + ASSIGN_BATCH);
              await supabase.from('rule_set_assignments').insert(slice);
            }
            assignmentCount = newAssignments.length;
            const uniqueRuleSets = new Set(newAssignments.map(a => a.rule_set_id)).size;
            console.log(`[ImportCommit] Created ${assignmentCount} rule_set_assignments across ${uniqueRuleSets} plans`);
          }
        }
      }
    } catch (assignErr) {
      console.warn('[ImportCommit] Rule set assignment failed (non-blocking):', assignErr);
    }

    // ── Step 10: Update batch status ──
    await supabase.from('import_batches').update({
      status: 'completed',
      row_count: totalRecords,
      completed_at: new Date().toISOString(),
    }).eq('id', batchId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ImportCommit] COMPLETE: ${totalRecords} records, ${entityIdMap.size} entities, ${periodKeyMap.size} periods in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      batchId,
      recordCount: totalRecords,
      entityCount: entityIdMap.size,
      periodCount: periodKeyMap.size,
      periodId: periodKeyMap.size > 0 ? Array.from(periodKeyMap.values())[0] : null,
      periods: Array.from(periodKeyMap.entries()).map(([key, id]) => ({ key, id })),
      assignmentCount,
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (err) {
    console.error('[ImportCommit] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Import failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
