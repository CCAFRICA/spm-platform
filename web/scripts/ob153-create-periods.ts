// Create periods for Optica using semantic role detection
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DATE_ROLES = ['transaction_date', 'period_marker', 'event_timestamp'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

async function run() {
  // Step 1: Find ALL date fields by scanning metadata across ALL data types
  const dateFieldNames = new Set<string>();

  // Scan in pages to find all unique metadata patterns
  let offset = 0;
  const seenDataTypes = new Set<string>();
  while (offset < 200000) {
    const { data: rows } = await sb.from('committed_data')
      .select('data_type, metadata')
      .eq('tenant_id', OPTICA_ID)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const dt = row.data_type as string;
      if (seenDataTypes.has(dt)) continue;
      seenDataTypes.add(dt);

      const meta = row.metadata as Record<string, unknown> | null;
      const roles = meta?.semantic_roles as Record<string, { role: string }> | undefined;
      if (roles) {
        for (const [field, info] of Object.entries(roles)) {
          if (DATE_ROLES.includes(info.role)) {
            dateFieldNames.add(field);
            console.log(`Found date field: "${field}" in data_type "${dt}" with role "${info.role}"`);
          }
        }
      }
    }

    offset += rows.length;
    if (rows.length < 1000) break;
  }

  console.log(`Scanned ${offset} rows, ${seenDataTypes.size} data types`);
  console.log('Date fields:', Array.from(dateFieldNames));

  if (dateFieldNames.size === 0) {
    console.log('No date fields found via semantic roles.');
    // Fallback: check for Excel serial values in known date-looking columns
    // Check a sample for any number in Excel serial range near current years
    console.log('Trying structural scan...');

    const { data: sample } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', OPTICA_ID)
      .limit(500);

    if (sample) {
      // Find fields with values in Excel serial date range (2024 area: ~45292-45657)
      const fieldCounts = new Map<string, number>();
      for (const row of sample) {
        const rd = row.row_data as Record<string, unknown>;
        for (const [k, v] of Object.entries(rd)) {
          if (k.startsWith('_')) continue;
          if (typeof v === 'number' && v >= 45200 && v <= 46000) {
            fieldCounts.set(k, (fieldCounts.get(k) || 0) + 1);
          }
        }
      }
      // Fields that have >50% of rows with Excel serial dates are likely date columns
      for (const [field, count] of Array.from(fieldCounts.entries())) {
        if (count > sample.length * 0.3) {
          dateFieldNames.add(field);
          console.log(`Structural: "${field}" has ${count}/${sample.length} Excel serial values`);
        }
      }
    }
  }

  if (dateFieldNames.size === 0) {
    console.log('No date fields found. Exiting.');
    return;
  }

  // Step 2: Scan date values from ALL rows
  const periodMap = new Map<string, { year: number; month: number; count: number }>();
  offset = 0;

  while (offset < 200000) {
    const { data: rows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', OPTICA_ID)
      .range(offset, offset + 4999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      for (const field of Array.from(dateFieldNames)) {
        const val = rd[field];
        if (val == null) continue;
        if (typeof val === 'number' && val > 40000 && val < 50000) {
          const date = new Date((val - 25569) * 86400 * 1000);
          if (!isNaN(date.getTime())) {
            const y = date.getUTCFullYear();
            const m = date.getUTCMonth() + 1;
            if (y >= 2020 && y <= 2030) {
              const key = `${y}-${String(m).padStart(2, '0')}`;
              const existing = periodMap.get(key);
              if (existing) existing.count++;
              else periodMap.set(key, { year: y, month: m, count: 1 });
            }
          }
        }
        if (typeof val === 'string' && val.length >= 10) {
          const date = new Date(val);
          if (!isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = date.getMonth() + 1;
            if (y >= 2020 && y <= 2030) {
              const key = `${y}-${String(m).padStart(2, '0')}`;
              const existing = periodMap.get(key);
              if (existing) existing.count++;
              else periodMap.set(key, { year: y, month: m, count: 1 });
            }
          }
        }
      }
    }

    offset += rows.length;
    if (rows.length < 5000) break;
  }

  console.log(`Scanned ${offset} rows for dates`);
  const sorted = Array.from(periodMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log('Detected periods:', sorted.map(([k, v]) => `${k} (${v.count})`).join(', '));

  if (periodMap.size === 0) {
    console.log('No periods detected. Exiting.');
    return;
  }

  // Step 3: Create periods
  const newPeriods = sorted.map(([key, data]) => {
    const lastDay = new Date(data.year, data.month, 0).getDate();
    return {
      id: crypto.randomUUID(),
      tenant_id: OPTICA_ID,
      label: `${MONTH_NAMES[data.month - 1]} ${data.year}`,
      period_type: 'monthly',
      status: 'open',
      start_date: `${data.year}-${String(data.month).padStart(2, '0')}-01`,
      end_date: `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      canonical_key: key,
      metadata: { source: 'ob153_calculate', recordCount: data.count },
    };
  });

  const { error } = await sb.from('periods').insert(newPeriods);
  if (error) {
    console.error('Period creation failed:', error.message);
    return;
  }

  console.log(`\nCreated ${newPeriods.length} periods: ${newPeriods.map(p => p.label).join(', ')}`);
}

run();
