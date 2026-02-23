/**
 * OB-81 Mission 1: Supabase Migrations Verification
 *
 * Verifies migration files exist, have correct structure, and RLS policies.
 * PG-1: synaptic_density table migration ready
 * PG-2: foundational_patterns table migration ready
 * PG-3: domain_patterns table migration ready
 */

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');

// ══════════════════════════════════════════════
// PG-1: synaptic_density migration
// ══════════════════════════════════════════════
console.log('\n=== PG-1: synaptic_density migration ===');
{
  const filePath = path.join(migDir, '015_synaptic_density.sql');
  assert(fs.existsSync(filePath), 'Migration 015 exists');

  const content = fs.readFileSync(filePath, 'utf-8');
  assert(content.includes('CREATE TABLE IF NOT EXISTS synaptic_density'), 'Creates synaptic_density table');
  assert(content.includes('tenant_id'), 'Has tenant_id column');
  assert(content.includes('signature TEXT NOT NULL'), 'Has signature column');
  assert(content.includes('confidence'), 'Has confidence column');
  assert(content.includes('execution_mode'), 'Has execution_mode column');
  assert(content.includes('total_executions'), 'Has total_executions column');
  assert(content.includes('learned_behaviors JSONB'), 'Has learned_behaviors JSONB');
  assert(content.includes('UNIQUE(tenant_id, signature)'), 'Has unique constraint');
  assert(content.includes('ROW LEVEL SECURITY'), 'RLS enabled');
  assert(content.includes('service_role'), 'Service role policy present');
}

// ══════════════════════════════════════════════
// PG-2: foundational_patterns migration
// ══════════════════════════════════════════════
console.log('\n=== PG-2: foundational_patterns migration ===');
{
  const filePath = path.join(migDir, '016_flywheel_tables.sql');
  assert(fs.existsSync(filePath), 'Migration 016 exists');

  const content = fs.readFileSync(filePath, 'utf-8');
  assert(content.includes('CREATE TABLE IF NOT EXISTS foundational_patterns'), 'Creates foundational_patterns');

  const fpSection = content.split('CREATE TABLE IF NOT EXISTS foundational_patterns')[1]?.split(');')[0] ?? '';
  assert(fpSection.includes('pattern_signature TEXT NOT NULL'), 'Has pattern_signature');
  assert(fpSection.includes('confidence_mean'), 'Has confidence_mean');
  assert(fpSection.includes('tenant_count'), 'Has tenant_count');
  assert(fpSection.includes('learned_behaviors JSONB'), 'Has learned_behaviors JSONB');
  assert(!fpSection.includes('tenant_id'), 'No tenant_id in foundational_patterns (privacy)');

  assert(content.includes('ROW LEVEL SECURITY'), 'RLS enabled');
  assert(content.includes('SELECT TO authenticated'), 'Read-only for authenticated');
}

// ══════════════════════════════════════════════
// PG-3: domain_patterns migration
// ══════════════════════════════════════════════
console.log('\n=== PG-3: domain_patterns migration ===');
{
  const content = fs.readFileSync(path.join(migDir, '016_flywheel_tables.sql'), 'utf-8');
  assert(content.includes('CREATE TABLE IF NOT EXISTS domain_patterns'), 'Creates domain_patterns');

  const dpSection = content.split('CREATE TABLE IF NOT EXISTS domain_patterns')[1]?.split(');')[0] ?? '';
  assert(dpSection.includes('domain_id TEXT NOT NULL'), 'Has domain_id');
  assert(dpSection.includes('vertical_hint'), 'Has vertical_hint');
  assert(dpSection.includes('pattern_signature TEXT NOT NULL'), 'Has pattern_signature');
  assert(!dpSection.includes('tenant_id'), 'No tenant_id in domain_patterns (privacy)');
  assert(!dpSection.includes('entity_id'), 'No entity_id in domain_patterns (privacy)');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`OB-81 Mission 1 Migrations: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
