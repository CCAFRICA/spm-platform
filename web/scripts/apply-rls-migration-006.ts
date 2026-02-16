#!/usr/bin/env npx tsx --env-file=.env.local
/**
 * Apply Migration 006: VL Admin Cross-Tenant Read Access
 *
 * This script applies the RLS policies that allow the platform admin (vl_admin)
 * to read data from all tenant-scoped tables.
 *
 * REQUIRES: SUPABASE_DB_PASSWORD in .env.local (your Supabase database password)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/apply-rls-migration-006.ts
 *
 * Alternative: Paste the SQL from supabase/migrations/006_vl_admin_cross_tenant_read.sql
 * into the Supabase Dashboard SQL Editor.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '006_vl_admin_cross_tenant_read.sql');
const sql = readFileSync(migrationPath, 'utf8');

async function applyViaCLI() {
  console.log('Applying migration 006 via Supabase CLI...\n');
  console.log('Project ref:', ref);
  console.log('Migration:', migrationPath);

  const { execSync } = await import('child_process');

  try {
    // Check if project is linked
    execSync('npx supabase projects list', { stdio: 'pipe' });
    console.log('Supabase CLI authenticated. Pushing migration...');
    execSync('npx supabase db push', { stdio: 'inherit', cwd: join(__dirname, '..') });
    console.log('\n✅ Migration applied successfully!');
  } catch {
    console.log('\nSupabase CLI not authenticated. Trying direct DB connection...\n');
    await applyViaPg();
  }
}

async function applyViaPg() {
  if (!dbPassword) {
    console.error('Set SUPABASE_DB_PASSWORD in .env.local to use direct DB connection.');
    console.error('\nAlternative: Copy the SQL below and paste it in the Supabase Dashboard SQL Editor:\n');
    console.error('Dashboard URL: https://supabase.com/dashboard/project/' + ref + '/sql/new\n');
    console.error('─'.repeat(60));
    console.error(sql);
    console.error('─'.repeat(60));
    process.exit(1);
  }

  // Dynamic import of postgres
  let pg: typeof import('postgres');
  try {
    pg = await import('postgres');
  } catch {
    console.log('Installing postgres package...');
    const { execSync } = await import('child_process');
    execSync('npm install postgres --no-save', { stdio: 'pipe' });
    pg = await import('postgres');
  }

  const connString = `postgresql://postgres.${ref}:${dbPassword}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
  const client = pg.default(connString);

  try {
    await client.unsafe(sql);
    console.log('✅ Migration 006 applied successfully!');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      console.log('✅ Policies already exist (migration was already applied).');
    } else {
      console.error('❌ Failed:', msg);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

applyViaCLI();
