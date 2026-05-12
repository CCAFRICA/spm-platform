// DIAG-040 — extract full intentTraces from existing calculation_results row.
// Read-only. No re-calculation.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const RESULT_ID = '5258e916-1837-4cc3-99c2-2d480712ade6';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: row, error } = await supabase
    .from('calculation_results')
    .select('id, batch_id, entity_id, rule_set_id, period_id, total_payout, components, metrics, attainment, metadata, created_at')
    .eq('id', RESULT_ID)
    .single();

  if (error || !row) {
    throw new Error(`fetch failed: ${error?.message}`);
  }

  // Build verbatim Markdown report
  const lines: string[] = [];
  lines.push(`# DIAG-040 — Full intentTraces extraction (post-HF-216)`);
  lines.push('');
  lines.push(`**Source row:** \`calculation_results.id = ${row.id}\``);
  lines.push(`**Batch:** \`${row.batch_id}\``);
  lines.push(`**Entity:** \`${row.entity_id}\``);
  lines.push(`**Rule set:** \`${row.rule_set_id}\``);
  lines.push(`**Period:** \`${row.period_id}\``);
  lines.push(`**Created:** \`${row.created_at}\``);
  lines.push(`**Total payout:** \`${row.total_payout}\``);
  lines.push('');
  lines.push(`---`);
  lines.push('');

  lines.push(`## components[] (verbatim)`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(row.components, null, 2));
  lines.push('```');
  lines.push('');

  lines.push(`## metrics (verbatim — full entity metrics map at result-write time)`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(row.metrics, null, 2));
  lines.push('```');
  lines.push('');

  lines.push(`## metadata.intentTraces (verbatim, all 5 components)`);
  lines.push('');
  const meta = row.metadata as Record<string, unknown>;
  const traces = meta?.intentTraces as unknown[] | undefined;
  if (traces && Array.isArray(traces)) {
    for (let i = 0; i < traces.length; i++) {
      lines.push(`### intentTraces[${i}]`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(traces[i], null, 2));
      lines.push('```');
      lines.push('');
    }
  } else {
    lines.push(`(no intentTraces array present in metadata)`);
    lines.push('');
  }

  lines.push(`## metadata.roundingTrace (verbatim)`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(meta?.roundingTrace ?? null, null, 2));
  lines.push('```');
  lines.push('');

  lines.push(`## metadata top-level fields (excluding intentTraces and roundingTrace, verbatim)`);
  lines.push('');
  const metaCopy = { ...(meta as Record<string, unknown>) };
  delete metaCopy.intentTraces;
  delete metaCopy.roundingTrace;
  lines.push('```json');
  lines.push(JSON.stringify(metaCopy, null, 2));
  lines.push('```');
  lines.push('');

  const outPath = path.join(process.cwd(), '..', 'docs', 'diagnostics', 'DIAG-040_post_hf216_traces.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

  console.log(`DIAG-040 extraction complete.`);
  console.log(`Output: ${outPath}`);
  console.log(`Bytes written: ${fs.statSync(outPath).size}`);
}

main().catch(e => { console.error(e); process.exit(1); });
