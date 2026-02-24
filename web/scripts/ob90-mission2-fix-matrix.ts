/**
 * OB-90 Mission 2: Fix non-certified matrix value at [4][3]
 * Current: $1,100 → Correct: $2,200
 * Also verify [3][3]=$600 is correct (already in DB)
 */
import { createClient } from '@supabase/supabase-js';

const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== OB-90 Mission 2: Fix Non-Certified Matrix [4][3] ===\n');

  // Read current rule_set
  const { data: ruleSet } = await sb.from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  if (!ruleSet?.components) throw new Error('Rule set not found');

  const components = ruleSet.components as { type: string; variants: Array<Record<string, unknown>> };
  const variants = components.variants;

  // Find non-certified variant
  const nonCertVariant = variants.find(v =>
    String(v.variantName || '').toLowerCase().includes('no cert') ||
    String(v.variantId || '').includes('non_certified')
  );

  if (!nonCertVariant) throw new Error('Non-certified variant not found');

  console.log(`Found variant: ${nonCertVariant.variantName}`);
  const variantComps = nonCertVariant.components as Array<Record<string, unknown>>;

  // Find optical sales matrix component (first component, index 0)
  const opticalComp = variantComps.find(c =>
    String(c.name || '').toLowerCase().includes('optical')
  );

  if (!opticalComp?.matrixConfig) throw new Error('Optical matrix component not found');

  const mc = opticalComp.matrixConfig as { values: number[][]; [key: string]: unknown };

  console.log('Before fix:');
  for (let r = 0; r < mc.values.length; r++) {
    console.log(`  Row ${r}: ${JSON.stringify(mc.values[r])}`);
  }

  // Verify [3][3] = 600 (correct per OB-90 spec)
  console.log(`\n[3][3] = ${mc.values[3][3]} (expected: 600) ${mc.values[3][3] === 600 ? '✓' : '✗ NEEDS FIX'}`);
  console.log(`[4][3] = ${mc.values[4][3]} (expected: 2200, currently: ${mc.values[4][3]}) ${mc.values[4][3] === 2200 ? '✓ already correct' : '✗ NEEDS FIX'}`);

  // Fix [4][3] from 1100 to 2200
  if (mc.values[4][3] !== 2200) {
    console.log(`\nFixing [4][3]: ${mc.values[4][3]} → 2200`);
    mc.values[4][3] = 2200;
  }

  // Verify [3][3] = 600 (should already be correct)
  if (mc.values[3][3] !== 600) {
    console.log(`UNEXPECTED: [3][3] = ${mc.values[3][3]}, fixing to 600`);
    mc.values[3][3] = 600;
  }

  console.log('\nAfter fix:');
  for (let r = 0; r < mc.values.length; r++) {
    console.log(`  Row ${r}: ${JSON.stringify(mc.values[r])}`);
  }

  // Verify the CORRECT non-certified matrix from OB-90 spec:
  const expected = [
    [0, 0, 0, 250, 400],
    [100, 150, 250, 400, 550],
    [150, 250, 400, 550, 750],
    [400, 550, 750, 600, 1250],
    [500, 650, 900, 2200, 1500],
  ];

  let allMatch = true;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (mc.values[r][c] !== expected[r][c]) {
        console.log(`  MISMATCH at [${r}][${c}]: got ${mc.values[r][c]}, expected ${expected[r][c]}`);
        allMatch = false;
      }
    }
  }
  console.log(`\nFull matrix verification: ${allMatch ? '✓ ALL MATCH' : '✗ MISMATCHES FOUND'}`);

  // Also verify certified matrix is correct
  const certVariant = variants.find(v =>
    String(v.variantName || '').toLowerCase().includes('cert') &&
    !String(v.variantName || '').toLowerCase().includes('no')
  );
  if (certVariant) {
    const certComps = certVariant.components as Array<Record<string, unknown>>;
    const certOptical = certComps.find(c => String(c.name || '').toLowerCase().includes('optical'));
    if (certOptical?.matrixConfig) {
      const certMc = (certOptical.matrixConfig as { values: number[][] });
      const certExpected = [
        [0, 0, 0, 500, 800],
        [200, 300, 500, 800, 1100],
        [300, 500, 800, 1100, 1500],
        [800, 1100, 1500, 1800, 2500],
        [1000, 1300, 1800, 2200, 3000],
      ];
      let certMatch = true;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (certMc.values[r][c] !== certExpected[r][c]) {
            console.log(`  CERT MISMATCH at [${r}][${c}]: got ${certMc.values[r][c]}, expected ${certExpected[r][c]}`);
            certMatch = false;
          }
        }
      }
      console.log(`Certified matrix: ${certMatch ? '✓ CORRECT' : '✗ NEEDS FIX'}`);
    }
  }

  // Update rule_set
  const { error } = await sb.from('rule_sets')
    .update({ components })
    .eq('id', RULE_SET_ID);

  if (error) throw new Error(`Update failed: ${error.message}`);
  console.log('\n✓ Rule set updated successfully');

  // Verify the update
  const { data: verify } = await sb.from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  const vComps = (verify?.components as typeof components).variants;
  const vNonCert = vComps.find(v => String(v.variantId || '').includes('non_certified'));
  const vOptical = (vNonCert?.components as Array<Record<string, unknown>>)?.[0];
  const vMc = (vOptical?.matrixConfig as { values: number[][] });
  console.log(`Verified [4][3] = ${vMc?.values[4][3]} (expected: 2200)`);
  console.log(`Verified [3][3] = ${vMc?.values[3][3]} (expected: 600)`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
