/**
 * OB-215 Agent C — AI Metrics API (platform admin only).
 *
 * GET → aggregated per-call metrics from ai_call_metrics: totals (all-time + last 30
 *       days) and breakdowns by task, model, and tenant. Powers the Observatory
 *       AI-Metrics/cost panel.
 *
 * The table may not be applied yet (HALT-MIG) and is not in the generated DB types —
 * relaxed access + guarded, so the panel renders `tableReady:false` rather than 500ing
 * before the architect applies the migration.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

interface MetricRow {
  tenant_id: string;
  task: string;
  model: string | null;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  status: string;
  created_at: string;
}

interface Bucket {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
}

const ROW_CAP = 10000;

function newBucket(): Bucket {
  return { calls: 0, tokensIn: 0, tokensOut: 0, costUSD: 0 };
}
function add(b: Bucket, r: MetricRow): void {
  b.calls += 1;
  b.tokensIn += Number(r.tokens_in) || 0;
  b.tokensOut += Number(r.tokens_out) || 0;
  b.costUSD += Number(r.cost_usd) || 0;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function shape(b: Bucket) {
  return { calls: b.calls, tokensIn: b.tokensIn, tokensOut: b.tokensOut, costUSD: round4(b.costUSD) };
}
function groupRows(rows: MetricRow[], keyFn: (r: MetricRow) => string) {
  const m = new Map<string, Bucket>();
  for (const r of rows) {
    const k = keyFn(r);
    const b = m.get(k) ?? newBucket();
    add(b, r);
    m.set(k, b);
  }
  return Array.from(m.entries())
    .map(([key, b]) => ({ key, ...shape(b) }))
    .sort((a, z) => z.costUSD - a.costUSD);
}

export async function GET() {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'platform') {
      return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
    }

    // ai_call_metrics is not in generated types; relaxed read + guarded (HALT-MIG).
    const relaxed = serviceClient as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: MetricRow[] | null; error: unknown }>;
          };
        };
      };
    };

    let rows: MetricRow[] = [];
    try {
      const res = await relaxed
        .from('ai_call_metrics')
        .select('tenant_id, task, model, provider, tokens_in, tokens_out, cost_usd, latency_ms, status, created_at')
        .order('created_at', { ascending: false })
        .limit(ROW_CAP);
      if (res.error) {
        return NextResponse.json({ tableReady: false, reason: 'ai_call_metrics not provisioned (HALT-MIG pending)' });
      }
      rows = res.data ?? [];
    } catch {
      return NextResponse.json({ tableReady: false, reason: 'ai_call_metrics not provisioned (HALT-MIG pending)' });
    }

    // 30-day window cutoff (string compare on ISO timestamps is correct).
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const last30 = rows.filter((r) => r.created_at >= cutoff);

    const allTime = newBucket();
    for (const r of rows) add(allTime, r);
    const window30 = newBucket();
    for (const r of last30) add(window30, r);

    return NextResponse.json({
      tableReady: true,
      capped: rows.length >= ROW_CAP, // no silent truncation: flag when the window hit the cap
      rowCap: ROW_CAP,
      totals: {
        // "allTime" is over the most-recent ROW_CAP rows (capped:true ⇒ older rows excluded).
        allTime: shape(allTime),
        last30Days: shape(window30),
      },
      byTask: groupRows(rows, (r) => r.task),
      byModel: groupRows(rows, (r) => r.model ?? 'unknown'),
      byTenant: groupRows(rows, (r) => r.tenant_id),
    });
  } catch (err) {
    console.error('[OB-215 ai-metrics GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
