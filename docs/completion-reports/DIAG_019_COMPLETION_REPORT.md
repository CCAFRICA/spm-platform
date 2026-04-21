# DIAG-019 R1 Completion Report — VP Postgres Connectivity Architecture

**Diagnostic ID:** DIAG-019 R1
**Purpose:** Surface VP's actual Postgres connectivity architecture to ground Phase 2.2 transactional coupling mechanism decision (HF-193-A).
**Supersedes:** DIAG-019 R0 (original chat-only paste; D1–D4 lost to context compression)
**Execution date:** 2026-04-21
**Branch:** hf-193-signal-surface
**Executed by:** CC (autonomous; architect-directed)
**Evidence durability:** this file + git commit + push

---

## Triggering context

HF-193-A Phase 2.2 transactional coupling architecture required IRA consultation (invocation 1f6ccf35). IRA recommended Option C (bridge returns specs; caller executes atomically in a single transaction) with structural atomicity required per T1-E906 + T1-E930.

Transaction mechanism for Option C depends on VP's runtime capabilities — specifically whether direct Postgres connection is available, whether RPC is the established pattern, or whether both/neither. Architect CRF correctly flagged that prior reasoning ("VP has no direct Postgres connection") was under-grounded. DIAG-019 is the empirical resolution of the capability question.

---

## Evidence — all 8 diagnostic blocks

### D1 — Database-connection libraries in VP dependencies

```
  (no direct DB libraries found)

Total dependencies: 48
Total devDependencies: 8
```

### D2 — Direct Postgres usage in application code

**D2a — src/ imports (pg / postgres / drizzle / @prisma / new Pool / new Client / postgres()):**
```
(no matches)
```

**D2b — scripts/ imports (pg / postgres / new Pool / new Client / postgres()):**
```
(no matches)
```

**D2c — First file context:** not applicable (no matches in D2a or D2b).

### D3 — Existing RPC patterns in VP codebase

**D3a — Files using .rpc():**
```
(no .rpc() usage found in src/)
```

**D3b — First 15 .rpc() call sites with line context:**
```
(no .rpc() calls)
```

**D3c — SQL function definitions in supabase/migrations/:**
```
supabase/migrations/001_core_tables.sql
supabase/migrations/011_backfill_periods_from_committed_data.sql
```

### D4 — Migration utility inventory

**D4a — Migration-related scripts:**
```
apply-migration-008.mjs
apply-rls-migration-006.ts
hf092-migration.sql
ob152-execute-migration.ts
ob75-migrate.ts
ob81-test-migrations.ts
run-migration-023.ts
```

**D4b — First 40 lines of each apply-migration* / migrate* / db-* script:**
```
### scripts/apply-migration-008.mjs ###
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'inicio';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS experience_tier TEXT DEFAULT 'self_service';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing JSONB DEFAULT '{}';
`;

// Try the Supabase SQL endpoint
const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/';

// Use the pg_net extension or direct SQL exec
// Since exec_sql may not exist, try a workaround with a dummy function
// The safest approach: use the Supabase Management API

// Actually, the simplest approach is to use the supabase-js built-in SQL execution
// via the postgres connection string. But we don't have that.

// Let's try adding the columns one at a time by just inserting a row with the new values
// and catching the error to confirm they're missing, then use the Dashboard

console.log('=== Migration 008: Add billing columns ===');
console.log('SQL to execute in Supabase SQL Editor:');
console.log(SQL);

// Try to read current schema
const { data, error } = await sb.from('tenants').select('*').limit(1);
if (data && data[0]) {
  const cols = Object.keys(data[0]);
  const hasTier = cols.includes('tier');
  const hasBilling = cols.includes('billing');
  const hasExpTier = cols.includes('experience_tier');

  console.log('\nCurrent columns:', cols.join(', '));
  console.log('tier:', hasTier ? 'EXISTS' : 'MISSING');
```

**D4b coverage note:** the directive's glob (`apply-migration*`, `migrate*`, `db-*`) matched only `apply-migration-008.mjs`. Other scripts listed in D4a (`apply-rls-migration-006.ts`, `ob152-execute-migration.ts`, `ob75-migrate.ts`, `ob81-test-migrations.ts`, `run-migration-023.ts`, `hf092-migration.sql`) did not match the specified glob patterns and were not read.

### D5 — Environment file inventory

**D5a — All .env* files (in ~/spm-platform/web/):**
```
-rw-r--r--@ 1 AndrewAfrica  staff  916 Feb 14 21:39 .env.local
-rw-r--r--  1 AndrewAfrica  staff  213 Feb 14 15:54 .env.local.example
-rw-r--r--  1 AndrewAfrica  staff  675 Feb 18 17:24 .env.stripe.example
```

**D5b — .env.local.example content:**
```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic AI
ANTHROPIC_API_KEY=your-anthropic-key
```

**D5c — Keys in .env.local (values redacted):**
```
ANTHROPIC_API_KEY=<redacted>
NEXT_PUBLIC_APP_URL=<redacted>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<redacted>
NEXT_PUBLIC_SUPABASE_URL=<redacted>
SUPABASE_SERVICE_ROLE_KEY=<redacted>
```

### D6 — Supabase configuration

**D6a — ~/spm-platform/supabase/ contents:**
```
total 0
drwxr-xr-x     3 AndrewAfrica  staff     96 Feb 26 20:10 .
drwxr-xr-x  1049 AndrewAfrica  staff  33568 Apr 16 11:14 ..
drwxr-xr-x     3 AndrewAfrica  staff     96 Feb 26 20:10 migrations
```

**D6b — ~/spm-platform/web/supabase/ contents:**
```
total 144
drwxr-xr-x   6 AndrewAfrica  staff    192 Feb 18 17:24 .
drwxr-xr-x  62 AndrewAfrica  staff   1984 Apr  5 05:34 ..
-rw-r--r--@  1 AndrewAfrica  staff   8196 Feb 14 19:46 .DS_Store
drwxr-xr-x   3 AndrewAfrica  staff     96 Feb 18 17:24 .temp
drwxr-xr-x  26 AndrewAfrica  staff    832 Apr 21 05:18 migrations
-rw-r--r--   1 AndrewAfrica  staff  58186 Feb 14 20:45 seed.sql
```

**D6c — config.toml (if present):**
```
(no config.toml in either location)
```

**D6d — Most recent migrations (last 11):**
```
-rw-r--r--   1 AndrewAfrica  staff    531 Feb 26 20:10 014_import_batches_metadata.sql
-rw-r--r--   1 AndrewAfrica  staff   1923 Feb 26 20:10 015_synaptic_density.sql
-rw-r--r--   1 AndrewAfrica  staff   1992 Feb 26 20:10 016_flywheel_tables.sql
-rw-r--r--   1 AndrewAfrica  staff    975 Mar  1 06:05 017_calculation_results_unique_constraint.sql
-rw-r--r--   1 AndrewAfrica  staff   6128 Mar  6 05:40 018_decision92_temporal_binding.sql
-rw-r--r--   1 AndrewAfrica  staff   1968 Mar  6 05:40 020_hf090_drop_audit_fk_constraints.sql
-rw-r--r--   1 AndrewAfrica  staff   4416 Mar 13 16:40 021_ingestion_raw_storage_policies.sql
-rw-r--r--   1 AndrewAfrica  staff   5696 Mar 14 20:24 022_hf134_rls_audit_hardening.sql
-rw-r--r--   1 AndrewAfrica  staff   5489 Mar 17 06:20 023_processing_jobs_and_structural_fingerprints.sql
-rw-r--r--   1 AndrewAfrica  staff   1487 Mar 20 05:19 20260320_hf149_platform_events_tenant_nullable.sql
-rw-r--r--   1 AndrewAfrica  staff   1943 Apr 21 05:18 20260421030000_hf_193_a_signal_surface_schema.sql
```

### D7 — Vercel / deployment config

**D7a — Vercel config files:**
```
(no vercel.json in either location)
```

**D7b — .vercel/ directories:**
```
(no .vercel/ directories)
```

**D7c — GitHub Actions:**
```
(no .github/workflows/ directory)
```

### D8 — Shell environment

**D8 — Postgres/DB-related shell env vars:**
```
(no Postgres/DB env vars in shell)
```

---

## CC's summary observations (factual, not interpretive)

- **Direct-Postgres libraries in VP dependencies?** No. Package.json (48 deps + 8 devDeps) contains zero matches for `pg`, `postgres`, `knex`, `drizzle`, `prisma`, `slonik`, `kysely`, `pg-promise`, `mysql`, `mongo`, or `@supabase/postgres`.
- **Direct-Postgres usage in src/ or scripts/?** No. Grep for `from 'pg'`, `from 'postgres'`, `from 'drizzle'`, `from '@prisma'`, `new Pool(`, `new Client(`, or `postgres(` in src/ returned zero hits; same set (plus glob variant) in scripts/ returned zero hits.
- **Is .rpc() an established pattern?** No. Zero `.rpc(` usage in src/. Zero call sites.
- **SQL stored-procedure definitions in migrations?** Yes, two files declare functions: `001_core_tables.sql` and `011_backfill_periods_from_committed_data.sql`. Neither is referenced by any `.rpc()` call site in application code per D3a/D3b.
- **Migration utility scripts count and names?** Seven files under scripts/ matched the migration-related name pattern: `apply-migration-008.mjs`, `apply-rls-migration-006.ts`, `hf092-migration.sql`, `ob152-execute-migration.ts`, `ob75-migrate.ts`, `ob81-test-migrations.ts`, `run-migration-023.ts`. The first one read (apply-migration-008.mjs) uses `@supabase/supabase-js` createClient and explicitly comments "the simplest approach is to use the supabase-js built-in SQL execution via the postgres connection string. But we don't have that" — indicating the historical VP pattern of surfacing SQL to the Supabase Dashboard SQL Editor rather than executing DDL from the app process.
- **Unexpected env vars discovered?** No. `.env.local` contains five keys (ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). No DATABASE_URL, POSTGRES_URL, PGHOST, PGUSER, or similar direct-connection variable. No Supabase CLI config.toml in either supabase/ directory. No Vercel config (vercel.json, .vercel/). No GitHub Actions workflows directory. Shell env has no PG/POSTGRES/DATABASE/DB_/SUPABASE-prefixed variables at CC's invocation time.
- **Env/config story suggestive of direct-Postgres capability or PostgREST-only?** The captured surface shows only Supabase URL + anon key + service role key — credentials consumed by `@supabase/supabase-js` via PostgREST. No direct-connection string (DATABASE_URL / POSTGRES_URL) is present in env files or shell. No direct-connection library is installed. This is what the evidence shows; architectural interpretation deferred to architect.

**CC does NOT draw architectural conclusions.** Observations are factual read-outs only. Architect disposition on Phase 2.2 transaction mechanism is Claude/architect scope.

---

## Architect disposition (pending)

Phase 2.2 transaction mechanism decision blocked on architect review of this evidence. Completion report transitions from DRAFT to FINAL when architect dispositions in chat, with disposition text appended here as an amendment section.

---

*DIAG-019 R1 Completion Report · VP Postgres Connectivity Architecture · Branch hf-193-signal-surface · Evidence durable-committed · 2026-04-21 · Awaiting architect Phase 2.2 transaction mechanism disposition*
