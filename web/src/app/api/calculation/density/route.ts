/**
 * GET /api/calculation/density — Density dashboard data
 * DELETE /api/calculation/density — Nuclear clear (reset all density for tenant)
 *
 * Query params: tenantId (required)
 *
 * GET returns all pattern densities with execution modes.
 * DELETE wipes all density — next run starts fresh (full_trace for all patterns).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadDensity, nuclearClearDensity } from '@/lib/calculation/synaptic-density';

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query param: tenantId' },
      { status: 400 }
    );
  }

  try {
    const density = await loadDensity(tenantId);

    const patterns = Array.from(density.values()).map(p => ({
      signature: p.signature,
      confidence: p.confidence,
      executionMode: p.executionMode,
      totalExecutions: p.totalExecutions,
      lastAnomalyRate: p.lastAnomalyRate,
      lastCorrectionCount: p.lastCorrectionCount,
    }));

    return NextResponse.json({
      tenantId,
      patternCount: patterns.length,
      patterns,
      summary: {
        avgConfidence: patterns.length > 0
          ? patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length
          : 0,
        totalExecutions: patterns.reduce((s, p) => s + p.totalExecutions, 0),
        modes: {
          full_trace: patterns.filter(p => p.executionMode === 'full_trace').length,
          light_trace: patterns.filter(p => p.executionMode === 'light_trace').length,
          silent: patterns.filter(p => p.executionMode === 'silent').length,
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load density: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query param: tenantId' },
      { status: 400 }
    );
  }

  try {
    const result = await nuclearClearDensity(tenantId);

    if (!result.success) {
      return NextResponse.json(
        { error: `Nuclear clear failed: ${result.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tenantId,
      message: 'All density cleared. Next calculation run starts with full_trace for all patterns.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Nuclear clear exception: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
