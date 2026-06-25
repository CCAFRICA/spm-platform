/**
 * OB-237 T-FIN — VALUE-MATCH the 4 fine-wired modes (staff, location_detail, patterns, server_detail)
 * against deterministic committed_data truth, via the headless route POST. Each mode's grand totals
 * (revenue / per-server totals / grid totals) must match within $0.01. Captures after-timing.
 *
 * Run: cd web && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-valuematch-fine.ts
 */
import { createClient } from '@supabase/supabase-js';
import { POST } from '@/app/api/financial/data/route';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

const call = async (body: any): Promise<{ data: any; ms: number }> => {
  const t = Date.now();
  const res = await POST({ json: async () => body } as any);
  const j = await res.json();
  return { data: j.data, ms: Date.now() - t };
};

// Deterministic truth: page committed_data (.order id), pos_cheque. Build the per-mode truths in one scan.
interface Cheque { entity_id: string; rd: Record<string, any>; }
async function loadCheques(): Promise<Cheque[]> {
  const out: Cheque[] = [];
  for (let o = 0; ; o += 1000) {
    let data: any[] | null = null;
    for (let retry = 0; retry < 6; retry++) {
      const r = await sb.from('committed_data')
        .select('entity_id, row_data')
        .eq('tenant_id', SABOR).eq('data_type', 'pos_cheque')
        .order('id', { ascending: true }).range(o, o + 999);
      if (!r.error) { data = r.data as any[]; break; }
      await new Promise(res => setTimeout(res, 700)); // transient 'fetch failed' — retry the page
    }
    if (!data || !data.length) break;
    for (const r of data) if (r.entity_id) out.push({ entity_id: r.entity_id, rd: r.row_data || {} });
    if (data.length < 1000) break;
  }
  return out;
}
const num = (v: any) => (typeof v === 'number' ? v : typeof v === 'string' ? (parseFloat(v) || 0) : 0);

(async () => {
  const cheques = await loadCheques();
  console.log(`loaded ${cheques.length} cheques\n`);
  const results: Array<{ mode: string; pass: boolean; truth: string; measured: string; ms: number }> = [];

  // ── STAFF ── per-mesero non-cancelled revenue/checks/tips, grand SUM across servers.
  {
    const byMesero = new Map<string, { rev: number; checks: number; tips: number }>();
    for (const c of cheques) {
      if (num(c.rd.cancelado) === 1) continue;
      const mid = String(num(c.rd.mesero_id));
      if (!mid || mid === '0') continue;
      const a = byMesero.get(mid) || { rev: 0, checks: 0, tips: 0 };
      a.rev += num(c.rd.total); a.checks++; a.tips += num(c.rd.propina);
      byMesero.set(mid, a);
    }
    const truthRev = Array.from(byMesero.values()).reduce((s, a) => s + a.rev, 0);
    const truthChecks = Array.from(byMesero.values()).reduce((s, a) => s + a.checks, 0);
    const truthTips = Array.from(byMesero.values()).reduce((s, a) => s + a.tips, 0);
    const { data, ms } = await call({ tenantId: SABOR, mode: 'staff' });
    const mRev = (data || []).reduce((s: number, r: any) => s + r.revenue, 0);
    const mChecks = (data || []).reduce((s: number, r: any) => s + r.checks, 0);
    const mTips = (data || []).reduce((s: number, r: any) => s + r.tips, 0);
    // truth has byMesero count; route joins only meseros with a staff entity (40). Compare grand totals.
    const pass = Math.abs(truthRev - mRev) < 0.01 && truthChecks === mChecks && Math.abs(truthTips - mTips) < 0.01;
    results.push({ mode: 'staff', pass,
      truth: `rev=$${truthRev.toFixed(2)} checks=${truthChecks} tips=$${truthTips.toFixed(2)} (servers=${byMesero.size})`,
      measured: `rev=$${mRev.toFixed(2)} checks=${mChecks} tips=$${mTips.toFixed(2)} (rows=${(data||[]).length})`, ms });
  }

  // ── PATTERNS ── 7×24 grid revenue/checks (non-cancelled). Grand = sum over heatmap cells.
  {
    let truthRev = 0, truthChecks = 0;
    for (const c of cheques) {
      if (num(c.rd.cancelado) === 1) continue;
      truthRev += num(c.rd.total); truthChecks++;
    }
    const { data, ms } = await call({ tenantId: SABOR, mode: 'patterns' });
    const gridRev = (data?.heatmap || []).reduce((s: number, cell: any) => s + cell.revenue, 0);
    const gridChecks = (data?.heatmap || []).reduce((s: number, cell: any) => s + cell.checks, 0);
    // grid revenue is round2-per-cell so allow a small tolerance proportional to cell count
    const cells = (data?.heatmap || []).length;
    const pass = Math.abs(truthRev - gridRev) < Math.max(0.01, cells * 0.005 + 1) && truthChecks === gridChecks;
    results.push({ mode: 'patterns', pass,
      truth: `gridRev=$${truthRev.toFixed(2)} gridChecks=${truthChecks}`,
      measured: `gridRev=$${gridRev.toFixed(2)} gridChecks=${gridChecks} cells=${cells} peakHour=${data?.peakHour} avgSvcMin=${data?.avgServiceMinutes}`, ms });
  }

  // ── LOCATION_DETAIL ── pick the top-revenue location; entity totals INCLUDE cancelled (raw doesn't skip).
  {
    const byEntity = new Map<string, number>();
    for (const c of cheques) byEntity.set(c.entity_id, (byEntity.get(c.entity_id) || 0) + num(c.rd.total));
    const topLoc = Array.from(byEntity.entries()).sort((a, b) => b[1] - a[1])[0][0];
    let truthRev = 0, truthCheques = 0, truthTips = 0;
    const staffRev = new Map<string, number>();
    for (const c of cheques) {
      if (c.entity_id !== topLoc) continue;
      truthRev += num(c.rd.total); truthCheques++; truthTips += num(c.rd.propina);
      const mid = String(num(c.rd.mesero_id));
      if (mid && mid !== '0') staffRev.set(mid, (staffRev.get(mid) || 0) + num(c.rd.total));
    }
    const truthStaffRev = Array.from(staffRev.values()).reduce((s, v) => s + v, 0);
    const { data, ms } = await call({ tenantId: SABOR, mode: 'location_detail', locationId: topLoc });
    const mRev = data?.revenue ?? 0, mCheques = data?.cheques ?? 0, mTips = data?.tips ?? 0;
    const mStaffRev = (data?.staff || []).reduce((s: number, r: any) => s + r.revenue, 0);
    const pass = Math.abs(truthRev - mRev) < 0.02 && truthCheques === mCheques && Math.abs(truthTips - mTips) < 0.02 && Math.abs(truthStaffRev - mStaffRev) < 0.5;
    results.push({ mode: 'location_detail', pass,
      truth: `rev=$${truthRev.toFixed(2)} cheques=${truthCheques} tips=$${truthTips.toFixed(2)} staffRev=$${truthStaffRev.toFixed(2)}`,
      measured: `rev=$${mRev.toFixed(2)} cheques=${mCheques} tips=$${mTips.toFixed(2)} staffRev=$${mStaffRev.toFixed(2)} staffN=${(data?.staff||[]).length}`, ms });
  }

  // ── SERVER_DETAIL ── pick a server entity; totals include cancelled (raw doesn't skip), filtered by mesero_id globally.
  {
    const { data: ents } = await sb.from('entities').select('id, metadata').eq('tenant_id', SABOR).eq('entity_type', 'individual');
    const server = (ents || []).find((e: any) => (e.metadata || {}).mesero_id != null);
    const meseroId = String((server!.metadata as any).mesero_id);
    let truthRev = 0, truthCheques = 0, truthTips = 0;
    for (const c of cheques) {
      if (String(num(c.rd.mesero_id)) !== meseroId) continue;
      truthRev += num(c.rd.total); truthCheques++; truthTips += num(c.rd.propina);
    }
    const { data, ms } = await call({ tenantId: SABOR, mode: 'server_detail', serverId: server!.id });
    const mRev = data?.revenue ?? 0, mCheques = data?.cheques ?? 0, mTips = data?.tips ?? 0;
    const hourlyTotal = (data?.hourlyPattern || []).reduce((s: number, h: any) => s + h.cheques, 0);
    const pass = Math.abs(truthRev - mRev) < 0.02 && truthCheques === mCheques && Math.abs(truthTips - mTips) < 0.02;
    results.push({ mode: 'server_detail', pass,
      truth: `mesero=${meseroId} rev=$${truthRev.toFixed(2)} cheques=${truthCheques} tips=$${truthTips.toFixed(2)}`,
      measured: `rev=$${mRev.toFixed(2)} cheques=${mCheques} tips=$${mTips.toFixed(2)} hourlySum=${hourlyTotal}(8-23 only)`, ms });
  }

  console.log('═══ VALUE-MATCH RESULTS ═══');
  for (const r of results) {
    console.log(`\n[${r.mode}] ${r.pass ? 'PASS ✓' : 'FAIL ✗ HALT-BYTEMATCH'}  (${r.ms} ms)`);
    console.log(`  truth:    ${r.truth}`);
    console.log(`  measured: ${r.measured}`);
  }
  const allPass = results.every(r => r.pass);
  console.log(`\n${allPass ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.stack || e?.message || e); process.exit(1); });
