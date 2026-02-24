#!/usr/bin/env npx tsx
/**
 * OB-86 Verification Script
 *
 * Validates all proof gates for the AI/ML Measurement Infrastructure.
 *
 * Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob86-verify.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Gate {
  id: string;
  label: string;
  check: () => Promise<boolean>;
}

const gates: Gate[] = [
  {
    id: 'PG-1',
    label: 'Phase 0 audit script exists',
    check: async () => fs.existsSync(path.resolve(__dirname, 'ob86-phase0-audit.ts')),
  },
  {
    id: 'PG-2',
    label: 'Signal capture service exists',
    check: async () => fs.existsSync(path.resolve(__dirname, '../src/lib/intelligence/classification-signal-service.ts')),
  },
  {
    id: 'PG-3',
    label: 'Signal persistence service exists',
    check: async () => fs.existsSync(path.resolve(__dirname, '../src/lib/ai/signal-persistence.ts')),
  },
  {
    id: 'PG-4',
    label: 'AI metrics computation service exists',
    check: async () => fs.existsSync(path.resolve(__dirname, '../src/lib/intelligence/ai-metrics-service.ts')),
  },
  {
    id: 'PG-5',
    label: 'classification_signals table has data',
    check: async () => {
      const { count } = await supabase
        .from('classification_signals')
        .select('*', { count: 'exact', head: true });
      return (count ?? 0) > 0;
    },
  },
  {
    id: 'PG-6',
    label: 'Accuracy can be computed per signal type',
    check: async () => {
      const { computeAccuracyMetrics } = await import('../src/lib/intelligence/ai-metrics-service');
      const result = await computeAccuracyMetrics();
      return result.byType.length > 0 && result.overall.total > 0;
    },
  },
  {
    id: 'PG-7',
    label: 'Calibration buckets can be computed',
    check: async () => {
      const { computeCalibrationMetrics } = await import('../src/lib/intelligence/ai-metrics-service');
      const result = await computeCalibrationMetrics();
      return result.length > 0;
    },
  },
  {
    id: 'PG-8',
    label: 'Flywheel trend can be computed',
    check: async () => {
      const { computeFlywheelTrend } = await import('../src/lib/intelligence/ai-metrics-service');
      const result = await computeFlywheelTrend();
      return result.length > 0;
    },
  },
  {
    id: 'PG-9',
    label: '/api/ai/metrics route exists',
    check: async () => fs.existsSync(path.resolve(__dirname, '../src/app/api/ai/metrics/route.ts')),
  },
  {
    id: 'PG-10',
    label: '/api/ai/calibration route exists',
    check: async () => fs.existsSync(path.resolve(__dirname, '../src/app/api/ai/calibration/route.ts')),
  },
  {
    id: 'PG-11',
    label: 'AIIntelligenceTab.tsx includes accuracy section',
    check: async () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../src/components/platform/AIIntelligenceTab.tsx'), 'utf-8');
      return content.includes('AccuracyBar') && content.includes('CalibrationChart') && content.includes('FlywheelChart');
    },
  },
  {
    id: 'PG-12',
    label: 'AdminDashboard.tsx includes AI quality card',
    check: async () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../src/components/dashboards/AdminDashboard.tsx'), 'utf-8');
      return content.includes('aiMetrics') && content.includes('AI Quality');
    },
  },
  {
    id: 'PG-13',
    label: 'platform-queries.ts includes enhanced AIIntelligenceData',
    check: async () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../src/lib/data/platform-queries.ts'), 'utf-8');
      return content.includes('accuracyByType') && content.includes('calibration') && content.includes('flywheel');
    },
  },
  {
    id: 'PG-14',
    label: 'persona-queries.ts includes AIQualityMetrics',
    check: async () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../src/lib/data/persona-queries.ts'), 'utf-8');
      return content.includes('AIQualityMetrics') && content.includes('fetchAIQualityMetrics');
    },
  },
];

async function verify() {
  console.log('=== OB-86 Verification ===\n');
  let passed = 0;
  let failed = 0;

  for (const gate of gates) {
    try {
      const ok = await gate.check();
      const status = ok ? 'PASS' : 'FAIL';
      const icon = ok ? '\u2705' : '\u274C';
      console.log(`  ${icon} ${gate.id}: ${gate.label} — ${status}`);
      if (ok) passed++; else failed++;
    } catch (err) {
      console.log(`  \u274C ${gate.id}: ${gate.label} — ERROR: ${err}`);
      failed++;
    }
  }

  console.log(`\n  Result: ${passed}/${passed + failed} gates passed`);
  if (failed === 0) {
    console.log('  All proof gates satisfied!\n');
  } else {
    console.log(`  ${failed} gate(s) need attention.\n`);
  }
}

verify().catch(console.error);
