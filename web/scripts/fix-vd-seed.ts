import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Fix Q4 period — try 'open' status
  console.log('1. Creating Q4 period...');
  const { error: q4Err } = await sb.from('periods').upsert({
    id: 'b2000000-0010-0000-0000-000000000008',
    tenant_id: TENANT_ID,
    label: 'Q4 2024 (Oct-Dec)',
    period_type: 'quarterly',
    status: 'open',
    start_date: '2024-10-01',
    end_date: '2024-12-31',
    canonical_key: '2024-Q4',
  }, { onConflict: 'id' });
  if (q4Err) {
    console.log('  open failed, trying closed...');
    const { error: q4Err2 } = await sb.from('periods').upsert({
      id: 'b2000000-0010-0000-0000-000000000008',
      tenant_id: TENANT_ID,
      label: 'Q4 2024 (Oct-Dec)',
      period_type: 'quarterly',
      status: 'closed',
      start_date: '2024-10-01',
      end_date: '2024-12-31',
      canonical_key: '2024-Q4',
    }, { onConflict: 'id' });
    if (q4Err2) console.error('  Still failed:', q4Err2.message);
    else console.log('  Q4 period created with status=closed');
  } else {
    console.log('  Q4 period created with status=open');
  }

  // 2. Now insert Q4 outcomes
  console.log('\n2. Creating Q4 outcomes...');
  // First get Q4 calc results to aggregate
  const { data: q4Results } = await sb.from('calculation_results')
    .select('entity_id, total_payout, components, metrics')
    .eq('tenant_id', TENANT_ID)
    .in('period_id', [
      'b2000000-0010-0000-0000-000000000004',
      'b2000000-0010-0000-0000-000000000005',
      'b2000000-0010-0000-0000-000000000006',
    ]);

  // Aggregate by entity
  const entityTotals: Record<string, { earned: number; components: Record<string, number>; medalCounts: Record<string, number> }> = {};
  for (const r of q4Results || []) {
    if (!entityTotals[r.entity_id]) {
      entityTotals[r.entity_id] = { earned: 0, components: { comision_base: 0, bono_attainment: 0, streak_bonus: 0, pickup_bonus: 0 }, medalCounts: { oro: 0, plata: 0, bronce: 0, sin_medalla: 0 } };
    }
    const et = entityTotals[r.entity_id];
    et.earned += r.total_payout || 0;
    const comps = r.components as Array<{ id: string; value: unknown }>;
    for (const c of comps) {
      if (typeof c.value === 'number' && c.id in et.components) {
        et.components[c.id] += c.value;
      }
      if (c.id === 'medal' && typeof c.value === 'string') {
        et.medalCounts[c.value] = (et.medalCounts[c.value] || 0) + 1;
      }
    }
  }

  let count = 0;
  for (const [entityId, totals] of Object.entries(entityTotals)) {
    const { error } = await sb.from('entity_period_outcomes').upsert({
      tenant_id: TENANT_ID,
      entity_id: entityId,
      period_id: 'b2000000-0010-0000-0000-000000000008',
      total_payout: totals.earned,
      rule_set_breakdown: [
        { rule_set_id: 'b2000000-0001-0000-0000-000000000001', payout: totals.components.comision_base + totals.components.bono_attainment + totals.components.streak_bonus },
        { rule_set_id: 'b2000000-0001-0000-0000-000000000002', payout: totals.components.pickup_bonus },
      ],
      component_breakdown: totals.components,
      lowest_lifecycle_state: 'APPROVED',
      attainment_summary: { medal_summary: totals.medalCounts },
      metadata: { payment_status: 'pending' },
    }, { onConflict: 'tenant_id,entity_id,period_id', ignoreDuplicates: true });
    if (error) console.error(`  EPO error ${entityId}:`, error.message);
    else count++;
  }
  console.log(`  ${count} Q4 outcomes created`);

  // 3. Fix reports_to → manages (reversed direction)
  console.log('\n3. Fixing management relationships...');
  const gerenteMetroId = 'b2000000-0004-0000-0000-000000000019';
  const directorId = 'b2000000-0004-0000-0000-000000000020';

  // CDMX associates (stores 0,1,2) managed by Gerente Metro
  const cdmxAssociates = [
    'b2000000-0004-0000-0000-000000000001',
    'b2000000-0004-0000-0000-000000000002',
    'b2000000-0004-0000-0000-000000000003',
    'b2000000-0004-0000-0000-000000000004',
    'b2000000-0004-0000-0000-000000000005',
    'b2000000-0004-0000-0000-000000000006',
    'b2000000-0004-0000-0000-000000000007',
  ];

  for (const assocId of cdmxAssociates) {
    const { error } = await sb.from('entity_relationships').insert({
      tenant_id: TENANT_ID,
      source_entity_id: gerenteMetroId,
      target_entity_id: assocId,
      relationship_type: 'manages',
      source: 'imported_explicit',
      confidence: 1.0,
      effective_from: '2024-01-01',
    }).select().maybeSingle();
    if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
      console.error(`  manages error:`, error.message);
    }
  }

  // Director manages Gerente Metro
  await sb.from('entity_relationships').insert({
    tenant_id: TENANT_ID,
    source_entity_id: directorId,
    target_entity_id: gerenteMetroId,
    relationship_type: 'manages',
    source: 'imported_explicit',
    confidence: 1.0,
    effective_from: '2024-01-01',
  }).select().maybeSingle();

  // Director manages non-CDMX associates
  const nonCdmxAssociates = [
    'b2000000-0004-0000-0000-000000000008',
    'b2000000-0004-0000-0000-000000000009',
    'b2000000-0004-0000-0000-000000000010',
    'b2000000-0004-0000-0000-000000000011',
    'b2000000-0004-0000-0000-000000000012',
    'b2000000-0004-0000-0000-000000000013',
    'b2000000-0004-0000-0000-000000000014',
    'b2000000-0004-0000-0000-000000000015',
    'b2000000-0004-0000-0000-000000000016',
    'b2000000-0004-0000-0000-000000000017',
    'b2000000-0004-0000-0000-000000000018',
  ];

  for (const assocId of nonCdmxAssociates) {
    const { error } = await sb.from('entity_relationships').insert({
      tenant_id: TENANT_ID,
      source_entity_id: directorId,
      target_entity_id: assocId,
      relationship_type: 'manages',
      source: 'imported_explicit',
      confidence: 1.0,
      effective_from: '2024-01-01',
    }).select().maybeSingle();
    if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
      console.error(`  manages error:`, error.message);
    }
  }

  console.log('  Management relationships created');

  // 4. Count totals
  console.log('\n4. Verification...');
  const { count: entCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: relCount } = await sb.from('entity_relationships').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: crCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: epoCount } = await sb.from('entity_period_outcomes').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: rsaCount } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  const { count: perCount } = await sb.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);

  console.log(`  Entities: ${entCount}`);
  console.log(`  Relationships: ${relCount}`);
  console.log(`  Assignments: ${rsaCount}`);
  console.log(`  Periods: ${perCount}`);
  console.log(`  Committed data: ${cdCount}`);
  console.log(`  Calc results: ${crCount}`);
  console.log(`  Outcomes: ${epoCount}`);
}

main().catch(console.error);
