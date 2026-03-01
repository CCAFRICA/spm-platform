/**
 * API Route: Intelligence Convergence
 *
 * OB-120: Matches plan requirements to data capabilities through semantic
 * type alignment and token overlap. Generates MetricDerivationRule[] and
 * writes them as input_bindings on the relevant rule_sets.
 *
 * POST /api/intelligence/converge
 * Body: { tenantId: string, ruleSetId?: string }
 * Returns: { success, derivationsGenerated, matchReport }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import { persistSignalBatch } from '@/lib/ai/signal-persistence';
import type { Json } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, ruleSetId } = body as { tenantId: string; ruleSetId?: string };

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // Determine which rule_sets to converge
    let ruleSetIds: string[] = [];
    if (ruleSetId) {
      ruleSetIds = [ruleSetId];
    } else {
      const { data: ruleSets } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      ruleSetIds = (ruleSets || []).map(rs => rs.id);
    }

    let totalDerivations = 0;
    const allReports: Array<{ ruleSetId: string; derivations: number; report: unknown[] }> = [];
    const allSignals: Array<{
      tenantId: string;
      signalType: string;
      signalValue: Record<string, unknown>;
      confidence: number;
      source: string;
      context: Record<string, unknown>;
    }> = [];

    for (const rsId of ruleSetIds) {
      const result = await convergeBindings(tenantId, rsId, supabase);

      if (result.derivations.length > 0) {
        // Read existing bindings
        const { data: rs } = await supabase
          .from('rule_sets')
          .select('input_bindings')
          .eq('id', rsId)
          .single();

        const existing = ((rs?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
        const merged = [...existing];

        for (const d of result.derivations) {
          const existingIdx = merged.findIndex(e => e.metric === d.metric);
          if (existingIdx === -1) {
            // New metric — add it
            merged.push(d as unknown as Record<string, unknown>);
          } else if (d.operation === 'ratio') {
            // OB-128: Ratio derivation replaces existing raw derivation.
            // Rename existing to {metric}_actuals so the ratio can reference it.
            const existingEntry = merged[existingIdx];
            existingEntry.metric = `${d.metric}_actuals`;
            merged.push(d as unknown as Record<string, unknown>);
          }
          // else: duplicate metric with same operation — skip (existing behavior)
        }

        await supabase
          .from('rule_sets')
          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
          .eq('id', rsId);

        const newCount = merged.length - existing.length;
        totalDerivations += newCount;

        allReports.push({
          ruleSetId: rsId,
          derivations: newCount,
          report: result.matchReport,
        });
      }

      // Collect signals
      for (const signal of result.signals) {
        allSignals.push({
          tenantId,
          signalType: 'convergence_binding',
          signalValue: {
            fieldName: signal.fieldName,
            semanticType: signal.semanticType,
            domain: signal.domain,
          },
          confidence: signal.confidence,
          source: 'ai_prediction',
          context: { ruleSetId: rsId, convergenceVersion: 'ob120' },
        });
      }
    }

    // Persist classification signals (fire-and-forget)
    if (allSignals.length > 0) {
      try {
        await persistSignalBatch(
          allSignals.map(s => ({
            tenantId: s.tenantId,
            signalType: s.signalType,
            signalValue: s.signalValue,
            confidence: s.confidence,
            source: s.source,
          }))
        );
      } catch (sigErr) {
        console.warn('[Convergence API] Signal persistence failed (non-blocking):', sigErr);
      }
    }

    return NextResponse.json({
      success: true,
      derivationsGenerated: totalDerivations,
      ruleSetsProcessed: ruleSetIds.length,
      reports: allReports,
    });
  } catch (err) {
    console.error('[Convergence API] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
