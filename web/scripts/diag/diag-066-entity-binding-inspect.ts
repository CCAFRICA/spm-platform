// DIAG-066 — Warm-Path Entity Binding Gap (READ-ONLY inspection).
// Tenant 3d354bfa…, warm session 505a6d2c. No mutations.
//
// Q1c: proposal fieldBindings (SemanticBinding.semanticRole) vs headerComprehension
//      (columnRole) for success (Empleados, Resumen_Producto) vs failure
//      (Sucursales, Menus, Resumen_Sucursal, Resumen_Menu, Resumen_Empleado).
// Q2 : Ventas import_batches for the session (two generations? timestamps? supersede).
// Q3 : rule_sets for the tenant (provenance + component count).
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag-066-entity-binding-inspect.ts

import { createClient } from '@supabase/supabase-js';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const SESSION = '505a6d2c-7b11-42a2-a11e-100c8a42afbd';
const SUCCESS = ['Empleados', 'Resumen_Producto'];
const FAILURE = ['Sucursales', 'Menus', 'Resumen_Sucursal', 'Resumen_Menu', 'Resumen_Empleado'];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadProposal(): Promise<Record<string, unknown> | null> {
  const path = `${TENANT}/proposals/${SESSION}.json`;
  const { data, error } = await sb.storage.from('ingestion-raw').download(path);
  if (error || !data) { console.log(`(proposal JSON not in storage at ${path}: ${error?.message ?? 'no data'})`); return null; }
  return JSON.parse(await data.text());
}

function bindingsLine(fbs: Array<Record<string, unknown>> | undefined): string {
  if (!Array.isArray(fbs) || fbs.length === 0) return '(none)';
  return fbs.map(b => `${b.sourceField}:${b.semanticRole}${b.columnRole ? `/col=${b.columnRole}` : ''}@${b.confidence}`).join(', ');
}
function hcLine(trace: Record<string, unknown> | undefined): string {
  const hc = (trace?.headerComprehension as { interpretations?: Record<string, { columnRole?: string; confidence?: number; identifiesWhat?: string }> } | undefined)?.interpretations;
  if (!hc) return '(no headerComprehension on trace)';
  return Object.entries(hc).map(([col, i]) => `${col}:col=${i.columnRole}${i.identifiesWhat ? `/iw=${i.identifiesWhat}` : ''}@${i.confidence}`).join(', ');
}

async function main() {
  console.log('================ Q1c — proposal binding surfaces (warm session 505a6d2c) ================\n');
  const proposal = await loadProposal();
  if (proposal) {
    const units = (proposal.contentUnits as Array<Record<string, unknown>>) ?? [];
    const byTab = new Map(units.map(u => [u.tabName as string, u]));
    const show = (label: string, tabs: string[]) => {
      console.log(`--- ${label} ---`);
      for (const tab of tabs) {
        const u = byTab.get(tab);
        if (!u) { console.log(`  ${tab}: NOT IN PROPOSAL`); continue; }
        const hasEntityId = Array.isArray(u.fieldBindings) && (u.fieldBindings as Array<Record<string, unknown>>).some(b => b.semanticRole === 'entity_identifier');
        console.log(`  ${tab}  classification=${u.classification}@${u.confidence}  decisionSource=${u.decisionSource ?? '?'}`);
        console.log(`     HAS entity_identifier binding? ${hasEntityId ? 'YES' : 'NO  <-- gate fails here'}`);
        console.log(`     fieldBindings(semanticRole): ${bindingsLine(u.fieldBindings as Array<Record<string, unknown>>)}`);
        console.log(`     headerComprehension(columnRole): ${hcLine(u.classificationTrace as Record<string, unknown>)}`);
      }
      console.log('');
    };
    show('SUCCEEDED on warm', SUCCESS);
    show('FAILED on warm ("No entity_identifier binding found")', FAILURE);
  }

  console.log('================ Q1c (DB backup) — classification:outcome signals ================\n');
  const { data: outcomes } = await sb.from('classification_signals')
    .select('sheet_name, classification, confidence, vocabulary_bindings, header_comprehension')
    .eq('tenant_id', TENANT).eq('signal_type', 'classification:outcome')
    .eq('context->>importSessionId', SESSION);
  for (const r of (outcomes ?? []).filter(r => [...SUCCESS, ...FAILURE].includes(r.sheet_name as string))) {
    const vb = r.vocabulary_bindings as Array<Record<string, unknown>> | null;
    const hc = r.header_comprehension as Record<string, unknown> | null;
    console.log(`${r.sheet_name} (${r.classification}@${r.confidence}): vocabulary_bindings=${vb ? bindingsLine(vb) : 'null'}`);
    console.log(`   header_comprehension present: ${hc ? 'yes' : 'no'}`);
  }

  console.log('\n================ Q2 — Ventas import_batches for the session ================\n');
  const { data: batches } = await sb.from('import_batches')
    .select('id, status, row_count, superseded_by, superseded_at, content_unit_hash_sha256, created_at, completed_at, metadata')
    .eq('tenant_id', TENANT).eq('metadata->>proposalId', SESSION)
    .order('created_at', { ascending: true });
  for (const b of (batches ?? [])) {
    const cu = (b.metadata as Record<string, unknown>)?.contentUnitId as string ?? '?';
    const sheet = cu.split('::')[1] ?? cu;
    console.log(`${String(b.id).slice(0, 8)} ${sheet.padEnd(22)} status=${String(b.status).padEnd(10)} rows=${String(b.row_count).padStart(6)} superseded_by=${b.superseded_by ? String(b.superseded_by).slice(0, 8) : '—'} created=${b.created_at} completed=${b.completed_at ?? '—'}`);
  }
  const ventas = (batches ?? []).filter(b => String((b.metadata as Record<string, unknown>)?.contentUnitId).includes('Ventas'));
  console.log(`\nVentas batch count: ${ventas.length}${ventas.length > 1 ? ' — TWO GENERATIONS (concurrent re-process)' : ''}`);
  if (ventas.length === 2) {
    const gap = (Date.parse(ventas[1].created_at) - Date.parse(ventas[0].created_at)) / 1000;
    console.log(`gen1 created ${ventas[0].created_at} (status ${ventas[0].status}); gen2 created ${ventas[1].created_at}; overlap start gap = ${gap}s`);
  }

  console.log('\n================ Q2 — Ventas unit_state at terminal ================\n');
  const { data: states } = await sb.from('classification_signals')
    .select('sheet_name, signal_value, created_at')
    .eq('tenant_id', TENANT).eq('signal_type', 'comprehension:unit_state')
    .eq('context->>importSessionId', SESSION).order('created_at', { ascending: true });
  const ventasStates = (states ?? []).filter(s => (s.sheet_name as string) === 'Ventas_Transaccional');
  for (const s of ventasStates) {
    const sv = s.signal_value as Record<string, unknown>;
    console.log(`  ${s.created_at} state=${sv.state} seq=${sv.seq}`);
  }

  console.log('\n================ Q3 — rule_sets for the tenant ================\n');
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, content_hash, components, created_at, updated_at')
    .eq('tenant_id', TENANT).order('created_at', { ascending: true });
  for (const rs of (ruleSets ?? [])) {
    const comps = rs.components as unknown[] | Record<string, unknown> | null;
    const compCount = Array.isArray(comps) ? comps.length : (comps && typeof comps === 'object' ? Object.keys(comps).length : 0);
    const inSession = rs.created_at >= '2026-06-13T00:00:00Z';
    console.log(`id=${String(rs.id).slice(0, 8)} name="${rs.name}" status=${rs.status} components=${compCount} content_hash=${rs.content_hash ? String(rs.content_hash).slice(0, 12) : 'null'}`);
    console.log(`   created=${rs.created_at} updated=${rs.updated_at}  -> ${inSession ? 'CREATED THIS-DAY (warm/cold window)' : 'INHERITED (predates)'}`);
  }
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
