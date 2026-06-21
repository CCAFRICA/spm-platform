/**
 * HF-321 Phase 1 — FRMX (Sabor Grupo Gastronomico) seed-data correction.
 *
 * SCOPE: committed_data.row_data (pos_cheque) + the 40 server entities'
 * metadata.mesero_id ONLY. No application code is touched (E952/§6).
 *
 * The prior reseed wrote a reduced/mis-named field set. The financial API route
 * (web/src/app/api/financial/data/route.ts, interface ChequeRowData) reads a
 * different, fuller schema. This script TRANSFORMS each existing row_data into
 * that exact schema IN PLACE (preserving id/entity_id/period_id/source_date and
 * all FK linkage — the minimal-blast-radius equivalent of delete-and-reinsert).
 *
 * Aggregate preservation: total / propina / efectivo / tarjeta / subtotal /
 * descuento are copied VERBATIM, so gross + tips + payment split are byte-exact.
 *
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/frmx-reseed-correction.ts
 *   add  --dry   to compute the post-transform aggregates WITHOUT writing.
 */
import { createClient } from '@supabase/supabase-js';

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TID = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const DRY = process.argv.includes('--dry');

const num = (v: unknown): number => { const x = Number(v); return isNaN(x) ? 0 : x; };
const round2 = (v: number) => Math.round(v * 100) / 100;

const TURNO_ID: Record<string, number> = { morning: 1, afternoon: 2, night: 3 };
const TURNO_DEFAULT_TIME: Record<string, string> = { morning: '09:00', afternoon: '14:00', night: '21:00' };

function pad2(hhmm: unknown, fallback: string): string {
  const s = String(hhmm ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return fallback;
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
}
function hourOf(hhmm: string): number { return parseInt(hhmm.split(':')[0], 10); }
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().substring(0, 10);
}
function meseroInt(v: unknown): number {
  const m = String(v ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

interface Row { id: string; row_data: Record<string, unknown>; }

// first-defined wins: lets the transform read EITHER the original seed name OR the
// already-corrected name -> idempotent (safe to re-run; already-written rows map to
// the identical value, partially-failed rows get corrected).
const pick = (rd: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (rd[k] !== undefined && rd[k] !== null) return rd[k];
  return undefined;
};

/** Build the ChequeRowData-schema row_data from the existing row_data. IDEMPOTENT. */
function transform(rd: Record<string, unknown>, idx: number): Record<string, unknown> {
  const dateOnly = String(rd.fecha ?? '').substring(0, 10); // YYYY-MM-DD from date-only OR datetime
  const turno = String(rd.turno ?? '').toLowerCase();
  const aperturaT = pad2(rd.hora_apertura, TURNO_DEFAULT_TIME[turno] || '13:00');
  const cierreT = pad2(rd.hora_cierre, aperturaT);
  // fecha must be a DATETIME so the route's new Date(fecha).getHours()/getDay() works (heatmap).
  // If already a datetime (re-run), keep it verbatim; else build it from date + hora_apertura.
  const fechaRaw = String(rd.fecha ?? '');
  const fecha = fechaRaw.includes('T') ? fechaRaw : `${dateOnly}T${aperturaT}:00`;
  const cierreRaw = String(rd.cierre ?? '');
  let cierre: string;
  if (cierreRaw.includes('T')) {
    cierre = cierreRaw;
  } else {
    const cierreDate = hourOf(cierreT) < hourOf(aperturaT) ? addOneDay(dateOnly) : dateOnly;
    cierre = `${cierreDate}T${cierreT}:00`;
  }

  const total = round2(num(rd.total));
  const subtotal = round2(num(rd.subtotal));
  const descuento = round2(num(pick(rd, 'total_descuentos', 'descuento')));
  const guests = Math.max(1, Math.round(num(pick(rd, 'numero_de_personas', 'num_comensales'))) || 1);
  // cancelado in the original seed is a corrupted float (random amounts, never the flag value 1) ->
  // the route's `n(cancelado) === 1` never fired. Normalize to a clean 0/1 flag at ~0.5%, keyed off
  // the stable id-ordered index (re-runs reproduce the identical 220-row set).
  const cancelado = idx % 200 === 0 ? 1 : 0;
  // mesero_id: already-numeric stays numeric; "MES-0XX" -> integer.
  const meseroId = typeof rd.mesero_id === 'number' ? rd.mesero_id : meseroInt(rd.mesero_id);

  return {
    numero_franquicia: String(pick(rd, 'numero_franquicia', 'sucursal_id') ?? ''),
    turno_id: num(pick(rd, 'turno_id')) || (TURNO_ID[turno] ?? 0),
    folio: idx + 1,
    numero_cheque: idx + 1,
    fecha,
    cierre,
    numero_de_personas: guests,
    mesero_id: meseroId,
    pagado: cancelado === 1 ? 0 : total,
    cancelado,
    total_articulos: Math.max(1, Math.round(guests * 2.5)),
    total,
    efectivo: round2(num(rd.efectivo)),
    tarjeta: round2(num(rd.tarjeta)),
    propina: round2(num(rd.propina)),
    descuento,
    subtotal,
    subtotal_con_descuento: round2(subtotal - descuento),
    total_impuesto: round2(num(pick(rd, 'total_impuesto', 'iva'))),
    total_descuentos: descuento,
    total_cortesias: round2(num(pick(rd, 'total_cortesias', 'cortesia'))),
    total_alimentos: round2(num(pick(rd, 'total_alimentos', 'subtotal_alimentos'))),
    total_bebidas: round2(num(pick(rd, 'total_bebidas', 'subtotal_bebidas'))),
    // carry-through context fields (unused by route but harmless for drill-down)
    forma_pago: String(rd.forma_pago ?? ''),
    tipo_servicio: String(rd.tipo_servicio ?? ''),
    mesa: rd.mesa ?? null,
    turno,
  };
}

(async () => {
  console.log(`HF-321 reseed correction ${DRY ? '(DRY RUN — no writes)' : '(LIVE)'} | tenant ${TID}`);

  // 1) fetch all pos_cheque rows (id + row_data)
  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data: page, error } = await c.from('committed_data')
      .select('id, row_data').eq('tenant_id', TID).eq('data_type', 'pos_cheque')
      .order('id', { ascending: true }).range(off, off + 999);
    if (error) throw error;
    if (!page || page.length === 0) break;
    rows.push(...(page as Row[]));
    if (page.length < 1000) break;
  }
  console.log(`fetched ${rows.length} pos_cheque rows`);

  // 2) transform + measure post-transform aggregates
  const updates = rows.map((r, i) => ({ id: r.id, row_data: transform(r.row_data, i) }));
  let gross = 0, tips = 0, food = 0, bev = 0, tax = 0, disc = 0, comp = 0, cash = 0, card = 0, cancelled = 0;
  let badFecha = 0, badMesero = 0, badHour = 0;
  for (const u of updates) {
    const rd = u.row_data;
    gross += num(rd.total); tips += num(rd.propina); food += num(rd.total_alimentos);
    bev += num(rd.total_bebidas); tax += num(rd.total_impuesto); disc += num(rd.total_descuentos);
    comp += num(rd.total_cortesias); cash += num(rd.efectivo); card += num(rd.tarjeta);
    if (num(rd.cancelado) === 1) cancelled++;
    const d = new Date(String(rd.fecha));
    if (isNaN(d.getTime())) badFecha++;
    if (d.getHours() === 0 && !String(rd.fecha).includes('T00:')) badHour++;
    if (!num(rd.mesero_id)) badMesero++;
  }
  console.log('\n── post-transform aggregates ──');
  console.log(`gross(total)      = ${gross.toFixed(2)}   (target 16150334.28)`);
  console.log(`tips(propina)     = ${tips.toFixed(2)}   (target 2060226.87)`);
  console.log(`food(alimentos)   = ${food.toFixed(2)}`);
  console.log(`bev(bebidas)      = ${bev.toFixed(2)}`);
  console.log(`tax(impuesto/IVA) = ${tax.toFixed(2)}`);
  console.log(`discounts         = ${disc.toFixed(2)}`);
  console.log(`comps(cortesias)  = ${comp.toFixed(2)}`);
  console.log(`cash + card       = ${(cash + card).toFixed(2)}`);
  console.log(`cancelled flag=1  = ${cancelled}`);
  console.log(`checks            = ${updates.length}`);
  console.log(`integrity: badFecha=${badFecha} badHour(getHours==0)=${badHour} badMesero(0)=${badMesero}`);
  console.log('sample transformed row_data[0]:', JSON.stringify(updates[0].row_data));

  if (DRY) { console.log('\nDRY RUN complete — no writes performed.'); return; }

  // 3) write row_data in batches (UPDATE per id; preserves entity_id/period_id/source_date/FKs).
  //    Supabase returns row errors IN-RESULT (does not throw) — we check every result and RETRY
  //    failures, because a silent partial failure leaves rows on the old schema.
  console.log('\n── writing row_data updates ──');
  const BATCH = 50; // lower concurrency to avoid the partial-failure seen at 200
  async function writeAll(items: { id: string; row_data: Record<string, unknown> }[]): Promise<string[]> {
    const failedIds: string[] = [];
    let written = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(u =>
        c.from('committed_data').update({ row_data: u.row_data }).eq('id', u.id)
          .then(r => ({ id: u.id, error: r.error }))
      ));
      for (const r of results) if (r.error) failedIds.push(r.id);
      written += slice.length;
      if (written % 5000 === 0 || written === items.length) console.log(`  ${written}/${items.length} (failed so far: ${failedIds.length})`);
    }
    return failedIds;
  }
  const byId = new Map(updates.map(u => [u.id, u]));
  let failed = await writeAll(updates);
  for (let attempt = 1; attempt <= 5 && failed.length > 0; attempt++) {
    console.log(`  retry ${attempt}: ${failed.length} rows`);
    failed = await writeAll(failed.map(id => byId.get(id)!));
  }
  if (failed.length > 0) {
    console.log(`!! ${failed.length} rows STILL failed after retries — HALT (investigate, do not proceed)`);
    process.exit(1);
  }
  console.log('  all row_data updates succeeded (0 failures)');

  // 4) normalize the 40 server entities' metadata.mesero_id "MES-0XX" -> integer (staff join key)
  console.log('\n── normalizing server metadata.mesero_id ──');
  const { data: servers, error: se } = await c.from('entities')
    .select('id, external_id, metadata').eq('tenant_id', TID).eq('entity_type', 'individual');
  if (se) throw se;
  let metaFixed = 0;
  for (const s of servers ?? []) {
    const meta = { ...(s.metadata as Record<string, unknown>) };
    const before = meta.mesero_id;
    meta.mesero_id = meseroInt(before);
    await c.from('entities').update({ metadata: meta }).eq('id', s.id);
    metaFixed++;
  }
  console.log(`  normalized ${metaFixed} server metadata.mesero_id values to integers`);

  // 5) read-back verification
  let vGross = 0, vTips = 0, vCount = 0; let dtSample = ''; let midSample: unknown = '';
  for (let off = 0; ; off += 1000) {
    const { data: page } = await c.from('committed_data').select('row_data').eq('tenant_id', TID).eq('data_type', 'pos_cheque').range(off, off + 999);
    if (!page || page.length === 0) break;
    for (const p of page) {
      const rd = p.row_data as Record<string, unknown>;
      vGross += num(rd.total); vTips += num(rd.propina); vCount++;
      if (!dtSample) { dtSample = String(rd.fecha); midSample = rd.mesero_id; }
    }
    if (page.length < 1000) break;
  }
  console.log('\n── read-back verification ──');
  console.log(`gross=${vGross.toFixed(2)} tips=${vTips.toFixed(2)} count=${vCount}`);
  console.log(`fecha sample (datetime?) = ${dtSample} | mesero_id sample (numeric?) = ${JSON.stringify(midSample)}`);
  console.log('\nHF-321 Phase 1 reseed correction COMPLETE.');
})();
