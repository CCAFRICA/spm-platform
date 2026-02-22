import { createClient } from '@supabase/supabase-js';
import { findMatchingSheet, type AIContextSheet } from '../src/lib/calculation/run-calculation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Fetch AI context
  const { data: batch } = await supabase
    .from('import_batches')
    .select('metadata')
    .eq('id', '24dfad4b-fa4e-4e34-b81d-5c05a3aaad9d')
    .single();

  const meta = batch?.metadata as Record<string, unknown> | null;
  const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
  const aiSheets = aiCtx?.sheets ?? [];

  console.log('=== AI CONTEXT SHEETS ===');
  for (const s of aiSheets) {
    console.log(`  "${s.sheetName}" → matchedComponent: "${s.matchedComponent}"`);
  }

  // Plan component names (from rule set)
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', 'a7c1ae18-e119-4256-aa64-1227b054b563')
    .single();

  const componentsJson = ruleSet?.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as Array<{ name: string; componentType: string }>) ?? [];

  // Available sheets (data_types from committed_data)
  const availableSheets = [
    'Base_Venta_Individual',
    'Base_Venta_Tienda',
    'Base_Clientes_Nuevos',
    'Base_Cobranza',
    'Base_Club_Proteccion',
    'Base_Garantia_Extendida',
    'Datos Colaborador',
  ];

  console.log('\n=== SHEET MATCHING TEST ===');
  for (const comp of components) {
    const match = findMatchingSheet(comp.name, availableSheets, aiSheets);
    const status = match ? `MATCHED → "${match}"` : 'NO MATCH (will fallback to ALL rows!)';
    console.log(`  "${comp.name}" (${comp.componentType}): ${status}`);
  }
}

run().catch(console.error);
