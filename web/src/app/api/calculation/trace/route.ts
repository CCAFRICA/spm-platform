// HF-202 — Calc-Execution Trace toggle API
// POST: enable trace mode (with optional entity/component filters)
// DELETE: disable trace mode
// GET: current state

import { NextRequest, NextResponse } from 'next/server';
import { enableTrace, disableTrace, getTraceConfig, isTraceEnabled } from '@/lib/calculation/calc-trace';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const entityFilter = Array.isArray(body.entityFilter) ? (body.entityFilter as string[]) : undefined;
    const componentFilter = Array.isArray(body.componentFilter) ? (body.componentFilter as number[]) : undefined;
    enableTrace({ entityFilter, componentFilter });
    return NextResponse.json({ enabled: true, config: getTraceConfig() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  disableTrace();
  return NextResponse.json({ enabled: false });
}

export async function GET() {
  return NextResponse.json({ enabled: isTraceEnabled(), config: getTraceConfig() });
}
