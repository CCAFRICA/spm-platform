/**
 * POST /api/reconciliation/save
 *
 * OB-87 Mission 3: Persist reconciliation session to Supabase.
 * Stores benchmark file metadata, mapping decisions, period context,
 * comparison results, and findings in the reconciliation_sessions table.
 *
 * Body: { tenantId, userId, periodId?, batchId, config, results, summary }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, userId, periodId, batchId, config, results, summary } = body as {
    tenantId: string;
    userId: string;
    periodId?: string;
    batchId: string;
    config: {
      benchmarkFileName: string;
      mappings: Record<string, string>;
      entityIdField: string;
      totalAmountField: string;
      periodColumns: string[];
      componentMappings: Record<string, string>;
      periodsCompared: string[];
      depthAchieved: number;
    };
    results: {
      employees: unknown[];
      findings: unknown[];
    };
    summary: {
      matched: number;
      fileOnly: number;
      vlOnly: number;
      exactMatches: number;
      toleranceMatches: number;
      amberFlags: number;
      redFlags: number;
      falseGreenCount: number;
      fileTotalAmount: number;
      vlTotalAmount: number;
      totalDelta: number;
    };
  };

  if (!tenantId || !userId || !batchId || !config || !summary) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, userId, batchId, config, summary' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServiceRoleClient();

    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .insert({
        tenant_id: tenantId,
        period_id: periodId ?? null,
        batch_id: batchId,
        status: 'completed',
        config: config as unknown as Json,
        results: (results ?? {}) as unknown as Json,
        summary: summary as unknown as Json,
        created_by: userId,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ReconciliationSave] Insert error:', error);
      return NextResponse.json(
        { error: `Failed to save session: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: data.id,
    });
  } catch (error) {
    console.error('[ReconciliationSave] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' },
      { status: 500 }
    );
  }
}
