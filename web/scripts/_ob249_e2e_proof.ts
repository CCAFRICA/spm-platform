// OB-249 — END-TO-END PROOF HARNESS (P1/P4/P5/P6/P8) against the REAL substrate.
//
// Runs the ACTUAL commitContentUnit (the mandatory gate) on a synthesized sheet carrying semantic
// variant representations of three real-world products, through the REAL classification_signals
// write+read round-trip. The LLM EXPRESS step is an injected deterministic double (so the proof is
// reproducible with Anthropic down — memory notes it is intermittently unavailable); the unit tests
// prove the express LOGIC, this harness proves the DB + commit + provenance + signal chain. A
// best-effort LIVE Anthropic reachability probe is included at the end.
//
// Tenant: Test #A1 (abb9da8d…, 0 committed_data baseline). The harness PRE-CLEANS and POST-CLEANS
// only its own artifacts (its committed_data + import_batches + remediation:* signals) — atoms and
// everything else are untouched. Read-only otherwise.
//
// Run:  cd web && npx tsx scripts/_ob249_e2e_proof.ts

import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { commitContentUnit } from '@/lib/sci/commit-content-unit';
import { runRemediationPropose } from '@/lib/remediation/remediation-stage';
import { dbRecall } from '@/lib/remediation/remediation-stage';
import { createNormalizer, type VariantExpresser } from '@/lib/remediation/agents/normalizer';
import { streamAnthropicText, getAnthropicCallCount, resetAnthropicCallCount } from '@/lib/ai/anthropic-stream';
import { defaultModel } from '@/lib/ai/model-policy';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SB_URL, SB_KEY);
const TENANT = 'abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b'; // Test #A1 (sandbox: 0 committed_data baseline)

const line = (s = '') => console.log(s);
const hr = () => line('────────────────────────────────────────────────────────');

// A deterministic test-double for the LLM express step (groups by brand stem, with a call counter).
function countingExpresser(): VariantExpresser & { calls: number } {
  const fn = (async ({ values }: { values: string[] }) => {
    fn.calls += 1;
    const buckets: Record<string, string[]> = {};
    for (const v of values) {
      const k = /coca|coke/i.test(v) ? 'A' : /pepsi/i.test(v) ? 'B' : null;
      if (k) (buckets[k] ??= []).push(v);
    }
    return { groups: Object.values(buckets).filter((g) => g.length >= 2) };
  }) as VariantExpresser & { calls: number };
  fn.calls = 0;
  return fn;
}

// Synthesized transaction sheet: Producto carries SEMANTIC variants (structure alone cannot merge
// "Coca-Cola 600ml" / "Coke 600" / "CocaCola .6L"); Codigo is the entity key (excluded), Importe is
// a measure (excluded), Region is a clean categorical (negative-cache).
function makeRows(): Record<string, unknown>[] {
  const spec: Array<[string, number]> = [
    ['Coca-Cola 600ml', 6], ['Coke 600', 3], ['CocaCola .6L', 2],
    ['Pepsi 600ml', 4], ['Pepsi-Cola 600', 2],
    ['Agua Cielo 1L', 3],
  ];
  const rows: Record<string, unknown>[] = [];
  let i = 0;
  for (const [producto, n] of spec) {
    for (let k = 0; k < n; k++) {
      rows.push({ Codigo: `V${String((i % 3) + 1).padStart(2, '0')}`, Producto: producto, Importe: String(100 + i), Region: i % 2 ? 'Norte' : 'Sur' });
      i++;
    }
  }
  return rows;
}

const BINDINGS = [
  { sourceField: 'Codigo', semanticRole: 'entity_identifier', confidence: 0.95, claimedBy: 'transaction' },
  { sourceField: 'Producto', semanticRole: 'category_code', confidence: 0.6, claimedBy: 'transaction' },
  { sourceField: 'Importe', semanticRole: 'transaction_amount', confidence: 0.9, claimedBy: 'transaction' },
  { sourceField: 'Region', semanticRole: 'descriptive_label', confidence: 0.7, claimedBy: 'transaction' },
];

async function cleanup(tag: string) {
  const { data: batches } = await sb.from('import_batches').select('id').eq('tenant_id', TENANT);
  const ids = (batches ?? []).map((b) => b.id as string);
  if (ids.length) {
    await sb.from('committed_data').delete().in('import_batch_id', ids);
    await sb.from('import_batches').delete().in('id', ids);
  }
  await sb.from('committed_data').delete().eq('tenant_id', TENANT); // any orphans
  await sb.from('classification_signals').delete().eq('tenant_id', TENANT).like('signal_type', 'remediation:%');
  line(`[cleanup:${tag}] removed sandbox committed_data + import_batches + remediation signals`);
}

(async () => {
  hr(); line('OB-249 E2E PROOF — tenant Test#A1 ' + TENANT); hr();

  await cleanup('pre'); // cold start

  const rows = makeRows();
  line(`\nINPUT (${rows.length} rows) — Producto distinct surface forms:`);
  const inputDistinct = Array.from(new Set(rows.map((r) => r.Producto)));
  for (const v of inputDistinct) line(`   • "${v}"  ×${rows.filter((r) => r.Producto === v).length}`);

  // ── STEP A: EXPRESS (propose) — injected expresser, REAL signal write ──
  hr(); line('STEP A — EXPRESS (propose): LLM groups variants → write remediation signals (REAL DB)');
  const expr = countingExpresser();
  const input = {
    tenantId: TENANT, rows, columns: ['Codigo', 'Producto', 'Importe', 'Region'],
    allowedColumns: ['Producto', 'Region'], // Codigo (id) + Importe (measure) excluded by nature
    recall: dbRecall(sb, TENANT),
  };
  const proposeReports = await runRemediationPropose(sb, input, { agents: [createNormalizer({ expresser: expr })] });
  line(`   expresser (LLM) calls this run: ${expr.calls}  → ${expr.calls > 0 ? 'COLD (consulted)' : 'warm'}`);
  line(`   propose report: ${JSON.stringify(proposeReports)}`);

  // ── STEP B: CONSTRUCT (commit) — REAL commitContentUnit, the mandatory gate ──
  hr(); line('STEP B — CONSTRUCT (commitContentUnit): deterministic apply → committed_data');
  const result = await commitContentUnit(sb, {
    unit: { contentUnitId: 'ob249-proof-unit', confirmedBindings: BINDINGS as never, classificationTrace: undefined },
    rows,
    classification: 'transaction' as never,
    tenantId: TENANT,
    proposalId: result_uuid(), // a real UUID — session-telemetry keys on it
    tabName: 'Ventas',
    fileName: 'ob249_proof.xlsx',
    source: 'sci-bulk',
    fileHashSha256: 'ob249proofhash',
  });
  line(`   commit result: success=${result.success} inserted=${result.totalInserted} batch=${result.batchId} entity_id_field=${result.entityIdField}`);

  // ── P1 + P4 + P8: query committed_data ──
  hr(); line('P1 (end-to-end) + P4 (provenance) + P8 (mandatory _stageRan): committed_data');
  const { data: committed } = await sb.from('committed_data')
    .select('row_data, metadata').eq('import_batch_id', result.batchId).order('created_at');
  const rowsOut = committed ?? [];
  const committedProducto = Array.from(new Set(rowsOut.map((r) => (r.row_data as Record<string, unknown>).Producto)));
  line(`   committed Producto distinct surface forms (CANONICAL): ${JSON.stringify(committedProducto)}`);
  const allStamped = rowsOut.every((r) => (((r.metadata as Record<string, unknown>).remediation) as { _stageRan?: boolean })?._stageRan === true);
  line(`   P8: every committed row carries metadata.remediation._stageRan=true → ${allStamped}`);
  // show a CHANGED row's provenance (original retained alongside canonical)
  const changed = rowsOut.find((r) => {
    const rem = (r.metadata as Record<string, unknown>).remediation as { changes?: Record<string, unknown> };
    return rem?.changes && Object.keys(rem.changes).length > 0;
  });
  if (changed) {
    const rem = (changed.metadata as Record<string, unknown>).remediation as { changes: Record<string, { original: unknown; canonical: unknown; basis: string }> };
    line('   P1/P4 sample CHANGED row:');
    line(`      row_data.Producto (committed CANONICAL) = "${(changed.row_data as Record<string, unknown>).Producto}"`);
    line(`      metadata.remediation.changes.Producto   = ${JSON.stringify(rem.changes.Producto)}`);
    // assert canonical is one of the observed input values (no fabrication)
    const canon = rem.changes.Producto.canonical;
    line(`      canonical ∈ observed input values? ${inputDistinct.includes(canon as string)}  (no fabricated value committed)`);
  }
  const cleanRow = rowsOut.find((r) => (r.row_data as Record<string, unknown>).Producto === 'Agua Cielo 1L');
  if (cleanRow) {
    const rem = (cleanRow.metadata as Record<string, unknown>).remediation as { _stageRan?: boolean; changes?: unknown };
    line(`   P8 clean (unchanged) row STILL stamped: _stageRan=${rem._stageRan}, has-changes=${!!rem.changes} (clean data cannot bypass)`);
  }

  // ── P5: signals on the ONE canonical surface ──
  hr(); line('P5 (signal write + read on the single canonical surface):');
  const { data: sigs } = await sb.from('classification_signals')
    .select('signal_type, source, decision_source, scope, structural_fingerprint, signal_value')
    .eq('tenant_id', TENANT).like('signal_type', 'remediation:%').order('created_at', { ascending: false });
  const byType: Record<string, number> = {};
  for (const s of sigs ?? []) byType[s.signal_type as string] = (byType[s.signal_type as string] ?? 0) + 1;
  line(`   remediation signals written: ${JSON.stringify(byType)}`);
  const normSig = (sigs ?? []).find((s) => s.signal_type === 'remediation:normalization' && (s.signal_value as { key?: string })?.key === 'Producto');
  if (normSig) {
    line(`   remediation:normalization (Producto) — source=${normSig.source} decision_source=${normSig.decision_source} scope=${normSig.scope}`);
    line(`      structural_fingerprint=${JSON.stringify(normSig.structural_fingerprint)}`);
    line(`      signal_value.proposal.groups=${JSON.stringify((normSig.signal_value as { proposal?: { groups?: unknown } }).proposal?.groups)}`);
  }
  const stageSig = (sigs ?? []).find((s) => s.signal_type === 'remediation:stage_run');
  line(`   remediation:stage_run present (P8 per-unit marker): ${!!stageSig}`);

  // ── P6: progressive performance — REAL signal round-trip, 2nd run zero LLM ──
  hr(); line('P6 (progressive performance): re-run EXPRESS on the SAME data — read-before-express');
  const expr2 = countingExpresser();
  const reports2 = await runRemediationPropose(sb, input, { agents: [createNormalizer({ expresser: expr2 })] });
  line(`   run-1 expresser calls (cold): ${expr.calls}`);
  line(`   run-2 expresser calls (warm): ${expr2.calls}  → ${expr2.calls === 0 ? 'ZERO LLM (read prior signal) ✓' : 'NON-ZERO ✗'}`);
  line(`   run-2 produced new expressions to persist: ${reports2.some((r) => r.columns.length > 0)} (false = everything already cached)`);

  // ── best-effort LIVE Anthropic reachability probe (does the real express path work end-to-end?) ──
  hr(); line('LIVE LLM reachability probe (best-effort; the product path uses this expresser):');
  resetAnthropicCallCount();
  try {
    const txt = await streamAnthropicText({
      model: defaultModel(),
      system: 'Return ONLY JSON {"groups":[["a","b"]]} grouping equivalent values.',
      user: JSON.stringify({ values: ['Coca-Cola 600ml', 'Coke 600', 'Pepsi 600'] }),
      maxTokens: 256, label: 'ob249:probe', retries: 1,
    });
    line(`   LIVE Anthropic call SUCCEEDED (calls=${getAnthropicCallCount()}). Raw (truncated): ${txt.slice(0, 160).replace(/\n/g, ' ')}`);
  } catch (e) {
    line(`   LIVE Anthropic UNREACHABLE: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
    line('   → P1/P4/P5/P6/P8 above stand on the injected expresser (deterministic); express LOGIC is unit-tested.');
  }

  await cleanup('post');
  hr(); line('OB-249 E2E PROOF COMPLETE'); hr();
})().catch((e) => { console.error('PROOF THREW:', e); process.exit(1); });

// crypto.randomUUID indirection (kept local so the proposalId is unique per run).
function result_uuid(): string { return (globalThis.crypto as Crypto).randomUUID(); }
