# HF-221 — classification_signals Namespace-Enumeration CHECK Constraint Eradication + HF-218 Verification distinct=0 Diagnostic (v2 — VP service-role client discipline)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Working directory:** `~/spm-platform`
**Branch:** `hf-221-signal-vocabulary-eradication-and-verification-diagnostic` (existing from main HEAD `6f17f018`)
**Version note:** v2 supersedes v1 — v1 incorrectly required DATABASE_URL; VP discipline is no DATABASE_URL, service-role client only, with architect-channel SQL Editor for pg_catalog access. v2 corrects.

**Closure path:** Two-part: (R1) schema-layer registry eradication; (R3 Phase 1) verification-defect diagnostic with architect-dispositioned remediation (Phase 3) within this HF.

**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28 + AP-1 through AP-22.

**Bindings:**
- IGF-G7 (Single Canonical Signal Surface)
- IGF-G5 / G6 (Registry as Canonical Processing Vocabulary; Structured Failure at Processing Boundaries)
- IGF-Decision 64 v2 (Dual Intelligence Architecture; three-level signal architecture)
- IGF-Decision 153 (`metric_name TEXT` precedent — AI-determined values on signal-surface columns)
- AP-26 (Signal Vocabulary Registry Prohibition — extended to schema layer by this HF)
- SR-34 (No Bypass; structural fixes only)
- SR-42 (Locked-Rule Halt)
- IGF-T1-E905 (Prove Don't Describe)
- IGF-T1-E907 (Fix Logic Not Data)
- IGF-T1-E952 (Adjacent-Arm Drift Discipline) — applies to R3
- IGF-T1-E953 (Decision-Implementation Gap Pattern) — applies to R3
- IGF-T2-E46 (Reconciliation-Channel Separation)
- IGF-T5-E1064 (Procedural Theater Minimization)

**Verification anchors (architect-channel only — NOT in CC paste artifacts; T2-E46):**
- BCL (tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`): regression target post-closure
- Meridian (tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`): regression target — already verified post-HF-220 January grand total exact
- CRP: carry-forward verification outside this HF

**Substrate-Grounded Closure Path Selection:**

Per IGF-G7, `classification_signals` is the canonical Learn-role signal surface. Per Decision 64 v2, three signal levels describe intelligence emission; HF-218 introduced `engine:` namespace as observability category. The CHECK constraint `classification_signals_signal_type_vocabulary_chk` enumerates five namespaces (`classification`, `comprehension`, `convergence`, `cost`, `lifecycle`) from a prior schema vintage. Per G5/G6, registries belong at processing boundaries (operation primitives — Decision 154); `signal_type` is not a processing-boundary identifier. Per Decision 153's `metric_name TEXT` precedent, signal-surface column values are upstream-determined, not schema-constrained. Per AP-26 spirit, eradication targets the registry shape regardless of layer. Structurally correct pattern operative on `igf.health_signals` (signal_type TEXT NOT NULL, no CHECK).

R1 eradicates the constraint. No replacement validation.

R3 is diagnostic-first. HF-218 verification reads `ID_Empleado` distinct values from committed_data and computes `intersection_ratio` against tenant entity set. On BCL it returns `distinct=0` despite the column being populated (December 2025 succeeds; five other periods fail). Sibling read surface relative to engine's calc-time resolver. Phase 1 retrieves verification query verbatim and runs it against five failing periods plus the one succeeding period. Phase 3 fix architect-dispositioned post-evidence (Vertical Slice integrity: R1 + R3 closed in single HF-221 PR).

---

## EXECUTION CHANNEL DISCIPLINE (VP)

VP-side discipline (per Andrew's standing direction — repeat in this HF for clarity):

- **No `DATABASE_URL` in VP.** CC does not use the pg client. CC does not invoke psql. CC does not call `exec_sql` RPC (does not exist in VP).
- **All CC database access uses the Supabase service-role client** (`createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`) via `npx tsx scripts/...`.
- **PostgREST cannot reach `pg_catalog`, `pg_constraint`, `pg_get_constraintdef()`, or arbitrary aggregations like `COUNT(DISTINCT row_data->>'X')`.** Where these are needed, **architect runs the query in Supabase SQL Editor and pastes verbatim output to CC. CC records the pasted output verbatim in the Completion Report.**
- **Migrations: architect applies via Supabase SQL Editor.** CC commits the migration file post-architect-application.

This is consistent with the long-standing VP discipline (`/mnt/project/CC_STANDING_ARCHITECTURE_RULES.md` Rule 6) — migration discipline extended to all pg-catalog and complex-SQL surfaces.

---

## ARCHITECT-CHANNEL ACTIONS REQUIRED IN THIS HF

Listed once, here, for architect planning:

1. **Phase 0.1** — run constraint-state SQL query in Supabase SQL Editor; paste output to CC
2. **Phase 1.2** — apply R1 migration in Supabase SQL Editor
3. **Phase 1.3** — run post-migration constraint-absence query in Supabase SQL Editor; paste output to CC
4. **Phase 3 disposition** — disposition Phase 3 fix scope based on Phase 2 evidence; dispatch Phase 3 directive to CC
5. **Phase 4.2** — merge PR
6. **Phase 4.4** — production browser verification

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. (Standing Rule 10)

Proceed through Phase 0 (CC-side), Phase 1 (CC-side migration file authoring), Phase 2 continuously. **PAUSE for architect-channel actions where flagged** (Phase 0.1, Phase 1.2, Phase 1.3). After Phase 2, **HALT** and post Completion Report Section A.

---

## PHASE 0 — Schema Verification

### 0.1 — ARCHITECT-CHANNEL — Constraint state

Architect runs in Supabase SQL Editor:

```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'classification_signals_signal_type_vocabulary_chk';
```

Architect pastes output to CC chat. CC records verbatim in Completion Report Phase 0.1 row.

**Architect-pasted expected shape (for reference; do not pre-populate):**
```
conname | definition
--------|-----------
classification_signals_signal_type_vocabulary_chk | CHECK (((signal_type ~~ 'classification:%'::text) OR ...))
```

### 0.2 — CC — Column state via service-role client

CC creates `scripts/diag-hf221-column-state.ts`:

```typescript
// scripts/diag-hf221-column-state.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// PostgREST exposes information_schema views via the public schema only by
// default. We retrieve column shape by sampling one row from the table and
// inspecting the response, plus an explicit empty-select to surface column
// names from the PostgREST response.

const { data: sample, error: sampleErr } = await supabase
  .from('classification_signals')
  .select('*')
  .limit(1);

console.log('SAMPLE ROW (column shape via PostgREST):');
console.log(JSON.stringify(sample, null, 2));
console.log('SAMPLE ERROR:', sampleErr);

// Also retrieve a row count to confirm table accessibility
const { count, error: countErr } = await supabase
  .from('classification_signals')
  .select('*', { count: 'exact', head: true });

console.log('ROW COUNT:', count);
console.log('COUNT ERROR:', countErr);
```

Run: `cd web && npx tsx ../scripts/diag-hf221-column-state.ts` (or adjust path per VP convention).

PASTE output verbatim.

**Note on completeness:** PostgREST sample reveals column names and JSON shapes but not full type definitions (e.g., `text` vs `varchar`, NOT NULL constraints). If full column type definition is needed later, architect runs `information_schema.columns` query in SQL Editor and pastes. For HF-221's purposes, sample-row column-name discovery is sufficient.

### 0.3 — CC — Tenant and period identifiers

CC creates `scripts/diag-hf221-tenant-periods.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: tenant, error: tenantErr } = await supabase
  .from('tenants')
  .select('id, name')
  .eq('id', BCL_TENANT)
  .maybeSingle();

console.log('BCL TENANT:', JSON.stringify(tenant, null, 2));
console.log('TENANT ERROR:', tenantErr);

const { data: periods, error: periodsErr } = await supabase
  .from('periods')
  .select('id, label, start_date, end_date, canonical_key, period_type, status')
  .eq('tenant_id', BCL_TENANT)
  .order('start_date', { ascending: true });

console.log('BCL PERIODS:');
console.log(JSON.stringify(periods, null, 2));
console.log('PERIODS ERROR:', periodsErr);
```

Run: `npx tsx scripts/diag-hf221-tenant-periods.ts`

PASTE output verbatim.

**HALT CONDITION 0.3:** If BCL tenant or any of the six expected periods (Oct 2025 — Mar 2026) does not exist, halt and surface.

---

## PHASE 1 — R1: Eradicate Namespace-Enumeration CHECK Constraint

### 1.1 — CC — Author migration file

CC creates `web/supabase/migrations/<timestamp>_hf221_drop_classification_signals_vocabulary_check.sql`:

```sql
-- HF-221 R1 — Drop classification_signals_signal_type_vocabulary_chk
--
-- Schema-level CHECK constraint enumerating namespace prefixes operated as
-- registry on the canonical Learn-role signal surface, contradicting:
--   IGF-G7 (Single Canonical Signal Surface)
--   Decision 64 v2 (three-level signal architecture, emergent intelligence)
--   AP-26 spirit (signal vocabulary registry prohibition — application
--                  layer scope extended to schema layer by HF-221)
--
-- Structurally correct pattern operative on igf.health_signals:
-- signal_type TEXT NOT NULL, no CHECK enumeration on signal_type.
--
-- Application layer determines signal_type semantics. Schema accepts any
-- text per NOT NULL.

ALTER TABLE classification_signals
DROP CONSTRAINT classification_signals_signal_type_vocabulary_chk;
```

CC does NOT attempt to apply the migration. CC commits the file in Phase 1.5.

### 1.2 — ARCHITECT-CHANNEL — Apply migration

Architect copies the SQL from the migration file into Supabase Dashboard SQL Editor and executes. Architect signals "R1 migration applied" in CC chat.

### 1.3 — ARCHITECT-CHANNEL — Verify constraint absent

Architect runs in Supabase SQL Editor:

```sql
SELECT conname FROM pg_constraint
WHERE conname = 'classification_signals_signal_type_vocabulary_chk';
```

Expected: empty result set.

Architect pastes output to CC. CC records verbatim in Completion Report Phase 1.3 row.

**HALT CONDITION 1.3:** If constraint still present, halt; architect's apply did not succeed.

### 1.4 — CC — Sanity insert via service-role client

CC creates `scripts/diag-hf221-r1-sanity.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data, error } = await supabase
  .from('classification_signals')
  .insert({
    tenant_id: BCL_TENANT,
    signal_type: 'engine:structural_exception',
    source_file_name: 'HF-221-sanity-test',
    sheet_name: 'sanity',
    classification: 'test',
    confidence: 1.0,
    decision_source: 'hf221_sanity_test',
  })
  .select('id')
  .single();

console.log('INSERT RESULT:', JSON.stringify({ data, error }, null, 2));

if (data?.id) {
  const { error: delError } = await supabase
    .from('classification_signals')
    .delete()
    .eq('id', data.id);
  console.log('ROLLBACK:', delError ? JSON.stringify(delError, null, 2) : 'success');
}
```

Run: `npx tsx scripts/diag-hf221-r1-sanity.ts`

PASTE output verbatim.

**HALT CONDITION 1.4:** If insert fails with any constraint error, halt and surface verbatim error.

### 1.5 — CC — Commit and push

```bash
git add web/supabase/migrations/<timestamp>_hf221_drop_classification_signals_vocabulary_check.sql
git add scripts/diag-hf221-column-state.ts
git add scripts/diag-hf221-tenant-periods.ts
git add scripts/diag-hf221-r1-sanity.ts
git commit -m "HF-221 Phase 1 R1 — Drop classification_signals_signal_type_vocabulary_chk

Schema-level CHECK constraint enumerating signal_type namespaces operated
as registry on canonical Learn-role signal surface. Eradicated per AP-26
spirit extension to schema layer, IGF-G7 (Single Canonical Signal Surface),
Decision 64 v2 (three-level signal architecture, emergent intelligence).

Structurally correct pattern operative on igf.health_signals.

Bindings: G7, G5/G6, Decision 64 v2, Decision 153, AP-26, SR-34."
git push origin hf-221-signal-vocabulary-eradication-and-verification-diagnostic
```

---

## PHASE 2 — R3 Phase 1: HF-218 Verification distinct=0 Diagnostic

### 2.1 — CC — Locate HF-218 verification code

```bash
grep -rn "intersection_ratio" web/src/lib/ > /tmp/hf221_grep.txt 2>&1
grep -rn "engine:structural_exception" web/src/lib/ >> /tmp/hf221_grep.txt 2>&1
grep -rn "tenant entity overlap baseline" web/src/lib/ >> /tmp/hf221_grep.txt 2>&1
grep -rn "HF-218" web/src/lib/ >> /tmp/hf221_grep.txt 2>&1
cat /tmp/hf221_grep.txt
```

PASTE all grep output verbatim.

Identify and list file paths plus line ranges for:
1. The function that emits `engine:structural_exception`
2. The query that fetches distinct values from `committed_data`
3. The `intersection_ratio` computation

### 2.2 — CC — Paste verification code verbatim

For each file identified in 2.1, use `view` tool with line ranges to retrieve and paste:
1. The structural_exception emission site (function body)
2. The verification function (query construction + intersection_ratio computation)

PASTE verbatim. Do not paraphrase. Do not summarize.

### 2.3 — CC — Execute verification function against BCL — failing periods

CC creates `scripts/diag-hf221-verification-failing.ts`. The script:

1. Imports the verification function identified in 2.1 if exportable. If not exportable, the script replicates the exact query construction from 2.2 using the Supabase service-role client.
2. Calls the verification (or replicated query) for each failing BCL period:
   - Oct 2025: period_id `97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22`
   - Nov 2025: period_id `e845f8f9-feda-46cd-a90d-5736afd00a41`
   - Jan 2026: period_id `6e3f1b6a-716d-4bc3-930b-75935e41159d`
   - Feb 2026: period_id `25c9b256-539f-4379-bce0-27f5a5724425`
   - Mar 2026: period_id `22155f28-e804-4b1a-870f-7e7b5de2dbaf`
3. For each period logs verbatim:
   - The PostgREST request constructed (URL or query parameters)
   - The raw response data
   - The distinct count
   - The computed intersection_ratio

**If the verification function uses raw SQL aggregation that PostgREST cannot evaluate directly** (e.g., `COUNT(DISTINCT row_data->>'X')`), the script must:
- Fetch the source rows via PostgREST
- Compute the aggregation in TypeScript
- Log both: (a) the fetched row count and (b) the computed distinct value

This preserves exact equivalence to what HF-218 verification computes, since HF-218 itself runs in the same VP runtime under the same service-role client constraints.

Run: `npx tsx scripts/diag-hf221-verification-failing.ts`

PASTE output verbatim per period.

### 2.4 — CC — Execute verification function against BCL — succeeding period

CC creates `scripts/diag-hf221-verification-succeeding.ts` for Dec 2025 period_id `860b4255-23a0-48ce-9ac9-f604ad3058e1`. Same four-item log as 2.3.

Run: `npx tsx scripts/diag-hf221-verification-succeeding.ts`

PASTE output verbatim.

### 2.5 — MIXED — Direct committed_data counts (CC service-role client + architect SQL Editor for aggregation)

CC service-role client component (`scripts/diag-hf221-committed-data-rows.ts`):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const PERIODS = [
  { label: 'Oct 2025', id: '97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22' },
  { label: 'Nov 2025', id: 'e845f8f9-feda-46cd-a90d-5736afd00a41' },
  { label: 'Dec 2025', id: '860b4255-23a0-48ce-9ac9-f604ad3058e1' },
  { label: 'Jan 2026', id: '6e3f1b6a-716d-4bc3-930b-75935e41159d' },
  { label: 'Feb 2026', id: '25c9b256-539f-4379-bce0-27f5a5724425' },
  { label: 'Mar 2026', id: '22155f28-e804-4b1a-870f-7e7b5de2dbaf' },
];

for (const period of PERIODS) {
  const { data, error, count } = await supabase
    .from('committed_data')
    .select('row_data, entity_id, source_date, data_type', { count: 'exact' })
    .eq('tenant_id', BCL_TENANT)
    .eq('period_id', period.id);

  if (error || !data) {
    console.log(`PERIOD ${period.label}: ERROR`, error);
    continue;
  }

  const idEmpleadoValues = new Set<string>();
  let rowsWithIdKey = 0;
  const dataTypes = new Set<string>();
  const sourceDates = new Set<string>();
  const entityIds = new Set<string>();

  for (const row of data) {
    const rd = row.row_data as Record<string, unknown> | null;
    if (rd && 'ID_Empleado' in rd) {
      rowsWithIdKey++;
      const v = rd['ID_Empleado'];
      if (v !== null && v !== undefined) {
        idEmpleadoValues.add(String(v));
      }
    }
    if (row.entity_id) entityIds.add(row.entity_id);
    if (row.data_type) dataTypes.add(row.data_type);
    if (row.source_date) sourceDates.add(String(row.source_date));
  }

  console.log(`PERIOD ${period.label} (${period.id}):`);
  console.log(`  total_rows: ${count}`);
  console.log(`  distinct_id_empleado_jsonb_text: ${idEmpleadoValues.size}`);
  console.log(`  distinct_entity_id_fk: ${entityIds.size}`);
  console.log(`  rows_with_id_empleado_key: ${rowsWithIdKey}`);
  console.log(`  distinct_source_dates: ${Array.from(sourceDates).sort().join(', ')}`);
  console.log(`  distinct_data_types: ${Array.from(dataTypes).sort().join(', ')}`);
  console.log('---');
}
```

Run: `npx tsx scripts/diag-hf221-committed-data-rows.ts`

PASTE output verbatim.

### 2.6 — CC — Tenant entity baseline

CC creates `scripts/diag-hf221-entity-baseline.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data, error, count } = await supabase
  .from('entities')
  .select('id, external_id, scope', { count: 'exact' })
  .eq('tenant_id', BCL_TENANT);

const externalIds = new Set<string>();
const scopes = new Set<string>();
for (const row of data ?? []) {
  if (row.external_id) externalIds.add(row.external_id);
  if (row.scope) scopes.add(row.scope);
}

console.log('TOTAL ENTITIES:', count);
console.log('DISTINCT EXTERNAL_IDS:', externalIds.size);
console.log('SCOPES:', Array.from(scopes).join(', '));
console.log('SAMPLE external_ids (first 10):', Array.from(externalIds).slice(0, 10).join(', '));
console.log('ERROR:', error);
```

Run: `npx tsx scripts/diag-hf221-entity-baseline.ts`

PASTE output verbatim.

### 2.7 — CC — Convergence binding state

CC creates `scripts/diag-hf221-convergence-bindings.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL_RULE_SET = '6008fb2c-da17-46a3-ba1e-b0181ca530a1';

const { data, error } = await supabase
  .from('rule_sets')
  .select('id, plan_name, input_bindings')
  .eq('id', BCL_RULE_SET)
  .maybeSingle();

console.log('RULE SET:', JSON.stringify(data, null, 2));
console.log('ERROR:', error);
```

Run: `npx tsx scripts/diag-hf221-convergence-bindings.ts`

PASTE output verbatim. Architect needs to see the bound column names per component and source_batch_id values — relevant to whether HF-218 verification reads from a different batch than the engine's calc-time cache.

### 2.8 — CC — Side-by-side comparison

Produce a single table with one row per period and columns:
- period_label
- period_id (last 8 chars)
- HF-218 verification distinct count (from 2.3 / 2.4)
- HF-218 verification intersection_ratio
- Direct total_rows (from 2.5)
- Direct distinct_id_empleado_jsonb_text (from 2.5)
- Direct distinct_entity_id_fk (from 2.5)
- Direct rows_with_id_empleado_key (from 2.5)

PASTE table verbatim. CC reports numbers only (T2-E46). Do NOT propose root cause. Do NOT diagnose.

### 2.9 — CC — Completion Report Section A

CC creates `HF-221_COMPLETION_REPORT.md` in project root with structure per Rule 26:

```markdown
# HF-221 COMPLETION REPORT
## Date: <YYYY-MM-DD>
## Execution Time: <start> to <end>

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (verbatim from prompt) | PASS / FAIL | Evidence |
| 0.1 | Constraint state retrieved (architect-channel) | <P/F> | <paste architect's SQL Editor output> |
| 0.2 | Column state retrieved via service-role | <P/F> | <paste 0.2 output> |
| 0.3 | BCL tenant + 6 periods verified | <P/F> | <paste 0.3 output> |
| 1.1 | Migration file authored | <P/F> | <paste file path + commit SHA> |
| 1.2 | Architect applied migration | <P/F> | <architect signal recorded> |
| 1.3 | Constraint absent post-architect-apply (architect-channel) | <P/F> | <paste architect's SQL Editor output> |
| 1.4 | Sanity insert succeeds for engine:structural_exception | <P/F> | <paste 1.4 output> |
| 2.1 | Verification code located via grep | <P/F> | <paste grep output> |
| 2.2 | Verification code pasted verbatim | <P/F> | <paste code blocks> |
| 2.3 | Verification executed against 5 failing BCL periods | <P/F> | <paste per-period output> |
| 2.4 | Verification executed against Dec 2025 succeeding period | <P/F> | <paste output> |
| 2.5 | Direct committed_data counts captured for all 6 periods | <P/F> | <paste output> |
| 2.6 | Tenant entity baseline captured | <P/F> | <paste output> |
| 2.7 | Convergence binding state captured | <P/F> | <paste output> |
| 2.8 | Side-by-side comparison table produced | <P/F> | <paste table> |

## PROOF GATES — SOFT
| # | Criterion | PASS / FAIL | Evidence |
| - | No DATABASE_URL / pg client / psql / exec_sql used (VP discipline) | <P/F> | grep evidence: scripts use createClient |
| - | Architect-channel SQL Editor used for pg_catalog queries | <P/F> | observation |
| - | Reconciliation-channel separation observed (CC reports numbers; no diagnosis) | <P/F> | observation |
| - | Verification function reproduced via service-role + TypeScript aggregation where PostgREST cannot evaluate | <P/F> | observation |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS — Phase 1 commit pushed
- Rule 6 (migration executed AND verified): PASS — architect applied (1.2); architect verified (1.3); CC sanity (1.4)
- Rule 10 (autonomy directive followed): PASS
- Rule 14 (HF prompt committed to git): PASS — file at prompts/HF-221_*.md

## KNOWN ISSUES / OPEN ITEMS
- R3 Phase 1 diagnostic only; Phase 3 fix pending architect disposition

## STATUS
- R1: COMPLETE (constraint dropped; sanity insert succeeding)
- R3 Phase 1: COMPLETE — evidence pasted; HALT for architect Phase 3 disposition
```

### 2.10 — CC — Commit and push diagnostic artifacts

```bash
git add scripts/diag-hf221-*.ts
git add HF-221_COMPLETION_REPORT.md
git commit -m "HF-221 Phase 2 — R3 Phase 1 diagnostic evidence; HALT for architect Phase 3 disposition

Verification code located and pasted verbatim.
Five failing BCL periods + one succeeding BCL period queried via service-role client.
Direct committed_data counts captured per period via TypeScript aggregation.
Side-by-side comparison committed to completion report.

CC reports numbers only per T2-E46. Architect dispositions Phase 3 fix scope.
VP discipline: no DATABASE_URL; architect-channel SQL Editor used for pg_catalog."
git push origin hf-221-signal-vocabulary-eradication-and-verification-diagnostic
```

---

## HALT — End of Phase 2

CC posts to architect channel: "HF-221 Phase 2 complete. Completion Report Section A committed at <SHA>. Awaiting Phase 3 fix-scope disposition."

CC does NOT:
- Propose root cause for the distinct=0 verification defect
- Begin authoring Phase 3 fix code
- Run `gh pr create`
- Modify any code beyond diagnostic scripts

CC waits for architect to dispatch Phase 3 (as continuation of this HF, same branch, additional commits).

---

## PHASE 3 — Architect-dispositioned (deferred)

Phase 3 directive dispatched as continuation of HF-221 after architect dispositions diagnostic evidence from Phase 2. Phase 3 scope cannot be specified in this directive because the structural location of the defect is not known until Phase 2 evidence is in.

Possible Phase 3 fix shapes (non-exhaustive; for architect framing only — CC does NOT pre-empt):
- Query construction defect (filter mismatch; period-scoped vs non-period-scoped read)
- JSONB key resolution defect (case sensitivity, NULL handling, extraction operator)
- Convergence binding source_batch_id resolution defect (HF-218 reads bound column from one batch; data in other batches)
- Data-shape sensitivity (BCL Plantilla + 6 monthly transaction sheets vs Meridian Plantilla + transaction + Datos_Flota_Hub reference)

Phase 3 will include:
- Phase 3.1: Architect-dispositioned structural fix
- Phase 3.2: Local verification (Meridian regression + BCL clean-slate re-import + 6-period calc)
- Phase 3.3: `gh pr create` — Phase 1 + Phase 3 commits in single PR

---

## PHASE 4 — PR + Production Verification (deferred to post-Phase-3)

### 4.1 — CC — PR creation

```bash
gh pr create --base main --head hf-221-signal-vocabulary-eradication-and-verification-diagnostic \
  --title "HF-221 — classification_signals namespace-enumeration CHECK eradication + HF-218 verification fix" \
  --body "<populated post-Phase-3>"
```

### 4.2 — ARCHITECT-CHANNEL — Merge PR

Architect merges via `gh pr merge <N> --merge` and signals merge complete.

### 4.3 — CC — Production verification

CC executes post-merge verification scripts (specified in Phase 3 dispatch).

PASTE output verbatim. Architect performs reconciliation against verification anchors in architect channel.

### 4.4 — ARCHITECT-CHANNEL — Browser verification

Architect verifies at vialuce.ai production:
- BCL calc page total reconciles
- Meridian calc page no regression
- Signal emission post-Phase-3 writes to canonical surface as expected

---

## PHASE 5 — Closure

### 5.1 — CC — Completion report finalization

CC appends Section B (Phase 3 + 4 evidence) to `HF-221_COMPLETION_REPORT.md`.

### 5.2 — Carry-forward bookkeeping

CC notes for architect VG-side substrate work (CC takes no action; architect cycles in separate VG sessions):

- **R2 carry-forward:** Audit other VP schema CHECK constraints for namespace-enumeration patterns. Same disposition where found. Separate substrate-hygiene HF.
- **R4 carry-forward (VG substrate amendment):** AP-26 refinement — schema-level validation patterns evaluated against the same registry test as application-layer registries. Plus "validation must justify its existence, not default to present" as Claude-disposition pattern surfaced this session.

---

## REPORTING DISCIPLINE

- Every phase ends with verbatim output paste (T1-E905; SR-35 EPG)
- HALT conditions enumerated; no auto-resolution
- No SQL without verification (T5-E901)
- Reconciliation-channel separation: CC reports calculated values; architect dispositions diagnosis and fix (T2-E46)
- Decision-Implementation Gap discipline: verify directive's stated semantic against operative implementation in Phase 2 (T1-E953)
- Procedural Theater Minimization: verbatim-output stated once; HALT enumerated once (T5-E1064)
- Premature Numbering Avoidance: PR `<N>` and merge SHA `<SHA>` placeholders (T5-E1065)
- VP execution channel discipline observed throughout: no DATABASE_URL, no pg client, no psql, no exec_sql; service-role client only; architect-channel for pg_catalog

---

## OUT OF SCOPE FOR HF-221

- R2 audit of other VP schema CHECK constraints (separate substrate-hygiene HF)
- R4 AP-26 substrate refinement (VG cycle)
- CRP clean-slate re-import verification (independent HF)
- AI binding non-determinism (HF-221+ candidate)
- IGF-side `igf.health_signals` (already structurally correct)
- HF-220 Known Issues #1, #2, #4, #5 (separate cleanup HF)
- Any modification to `classification_signals` columns beyond constraint drop

---

END OF DIRECTIVE.
