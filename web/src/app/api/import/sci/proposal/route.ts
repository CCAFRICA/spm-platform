// SCI Proposal recovery — GET /api/import/sci/proposal
// OB-203 D12: when the analyze response races a stall-abort, the client recovers the proposal the
// analyze route persisted (the session read is the source of truth). Returns 404 if not yet written
// (analyze still running or failed) — the caller treats that as "no recovery available".

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const importSessionId = searchParams.get('importSessionId');
  if (!tenantId || !importSessionId) {
    return NextResponse.json({ error: 'tenantId and importSessionId required' }, { status: 400 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.storage.from('ingestion-raw').download(`${tenantId}/proposals/${importSessionId}.json`);
  if (error || !data) {
    return NextResponse.json({ error: 'proposal not available' }, { status: 404 });
  }
  try {
    const text = await data.text();
    return new NextResponse(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return NextResponse.json({ error: 'proposal unreadable' }, { status: 500 });
  }
}
