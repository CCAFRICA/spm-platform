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

interface CommitRequest {
  tenantId: string;
  userId: string;
  fileName: string;
  storagePath: string;
  sheetMappings: Record<string, Record<string, string>>;
}

// Entity ID field names — auto-detect fallback when no field mappings provided
// These are normalized to lowercase for matching against raw column headers
const ENTITY_ID_FIELDS = [
  'entityid', 'entity_id', 'employeeid', 'employee_id',
  'external_id', 'externalid', 'repid', 'rep_id', 'id_empleado',
  'num_empleado', 'numero_empleado',
];

// Period detection field names
const PERIOD_FIELDS = ['period', 'period_key', 'periodKey', 'date', 'fecha', 'periodo'];
const YEAR_FIELDS = ['year', 'año', 'ano', 'anio'];
const MONTH_FIELDS = ['month', 'mes'];

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
    const { tenantId, userId, fileName, storagePath, sheetMappings } = body;

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
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        tenant_id: tenantId,
        file_name: fileName,
        file_type: fileName.split('.').pop() || 'xlsx',
        uploaded_by: userId || null,
        status: 'processing',
        row_count: 0,
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
    console.log(`[ImportCommit] Batch created: ${batchId}`);

    // ── Step 6: Bulk entity resolution ──
    const externalIds = new Set<string>();

    for (const sheet of sheetData) {
      if (!sheet.mappings) continue;
      const entityCols = Object.entries(sheet.mappings)
        .filter(([, target]) => ENTITY_ID_FIELDS.includes(target.toLowerCase()))
        .map(([source]) => source);

      // Auto-detect fallback: match raw header names against ENTITY_ID_FIELDS
      if (entityCols.length === 0 && sheet.rows[0]) {
        for (const key of Object.keys(sheet.rows[0])) {
          const lower = key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
          if (ENTITY_ID_FIELDS.includes(lower)) {
            entityCols.push(key);
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

    console.log(`[ImportCommit] Unique external IDs: ${externalIds.size}`);

    const entityIdMap = new Map<string, string>(); // externalId → UUID
    const allExternalIds = Array.from(externalIds);

    if (allExternalIds.length > 0) {
      const FETCH_BATCH = 1000;
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
        const newEntities = newEntityExternalIds.map(eid => ({
          tenant_id: tenantId,
          external_id: eid,
          display_name: eid,
          entity_type: 'individual' as const,
          status: 'active' as const,
          temporal_attributes: [] as Json[],
          metadata: {} as Record<string, Json>,
        }));

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
        console.log(`[ImportCommit] Created ${newEntityExternalIds.length} new entities`);
      }
    }

    console.log(`[ImportCommit] Entity map: ${entityIdMap.size} total`);

    // ── Step 7: Period deduplication ──
    const uniquePeriods = new Map<string, { year: number; month: number }>();

    for (const sheet of sheetData) {
      if (!sheet.mappings && !sheet.rows[0]) continue;

      const yearCols: string[] = [];
      const monthCols: string[] = [];

      if (sheet.mappings) {
        for (const [source, target] of Object.entries(sheet.mappings)) {
          if (YEAR_FIELDS.includes(target.toLowerCase())) yearCols.push(source);
          if (MONTH_FIELDS.includes(target.toLowerCase())) monthCols.push(source);
        }
      }

      // Auto-detect fallback: match raw header names against YEAR_FIELDS/MONTH_FIELDS
      if (yearCols.length === 0 && sheet.rows[0]) {
        for (const key of Object.keys(sheet.rows[0])) {
          const lower = key.toLowerCase().trim();
          if (YEAR_FIELDS.includes(lower)) yearCols.push(key);
          if (MONTH_FIELDS.includes(lower)) monthCols.push(key);
        }
      }

      const periodCols: string[] = [];
      if (sheet.mappings) {
        for (const [source, target] of Object.entries(sheet.mappings)) {
          if (PERIOD_FIELDS.includes(target)) periodCols.push(source);
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
          if (YEAR_FIELDS.includes(target.toLowerCase())) yearCols.push(source);
          if (MONTH_FIELDS.includes(target.toLowerCase())) monthCols.push(source);
          if (PERIOD_FIELDS.includes(target)) periodCols.push(source);
        }
      }
      if (yearCols.length === 0 && row) {
        for (const key of Object.keys(row)) {
          const lower = key.toLowerCase().trim();
          if (YEAR_FIELDS.includes(lower)) yearCols.push(key);
          if (MONTH_FIELDS.includes(lower)) monthCols.push(key);
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
    let totalRecords = 0;

    for (const sheet of sheetData) {
      const entityCol = sheet.mappings
        ? Object.entries(sheet.mappings).find(([, target]) => ENTITY_ID_FIELDS.includes(target.toLowerCase()))?.[0]
        : null;

      // Auto-detect fallback: match raw header names against ENTITY_ID_FIELDS
      let effectiveEntityCol = entityCol;
      if (!effectiveEntityCol && sheet.rows[0]) {
        for (const key of Object.keys(sheet.rows[0])) {
          const lower = key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
          if (ENTITY_ID_FIELDS.includes(lower)) {
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
          data_type: sheet.sheetName,
          row_data: { ...content, _sheetName: sheet.sheetName, _rowIndex: i },
          metadata: { source_sheet: sheet.sheetName },
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

    // ── Step 9: Rule set assignments ──
    let assignmentCount = 0;
    try {
      const { data: activeRuleSet } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRuleSet) {
        const entityUuids = Array.from(new Set(
          Array.from(entityIdMap.values()).filter(Boolean)
        ));

        if (entityUuids.length > 0) {
          const existingSet = new Set<string>();
          const CHECK_BATCH = 1000;
          for (let i = 0; i < entityUuids.length; i += CHECK_BATCH) {
            const slice = entityUuids.slice(i, i + CHECK_BATCH);
            const { data: existing } = await supabase
              .from('rule_set_assignments')
              .select('entity_id')
              .eq('tenant_id', tenantId)
              .eq('rule_set_id', activeRuleSet.id)
              .in('entity_id', slice);

            if (existing) {
              for (const a of existing) existingSet.add(a.entity_id);
            }
          }

          const newAssignments = entityUuids
            .filter(id => !existingSet.has(id))
            .map(entityId => ({
              tenant_id: tenantId,
              entity_id: entityId,
              rule_set_id: activeRuleSet.id,
              effective_from: new Date().toISOString().split('T')[0],
            }));

          if (newAssignments.length > 0) {
            const ASSIGN_BATCH = 5000;
            for (let i = 0; i < newAssignments.length; i += ASSIGN_BATCH) {
              const slice = newAssignments.slice(i, i + ASSIGN_BATCH);
              await supabase.from('rule_set_assignments').insert(slice);
            }
            assignmentCount = newAssignments.length;
            console.log(`[ImportCommit] Created ${assignmentCount} rule_set_assignments`);
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
