# DIAG-044 -- SCI Import Path Unification Analysis Output

**Date:** 2026-05-14
**Branch:** diag-044-sci-import-path-unification
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Two SCI import execution paths -- inventory, divergence analysis, unification assessment

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- File inventory

### 1.1 / 1.3 -- All `web/src/app/api/import` route.ts files (with line counts)

```
$ find web/src/app/api/import -name "route.ts" -type f -print0 | sort -z | xargs -0 wc -l
    1047 web/src/app/api/import/commit/route.ts
     100 web/src/app/api/import/prepare/route.ts
     274 web/src/app/api/import/sci/analyze-document/route.ts
     497 web/src/app/api/import/sci/analyze/route.ts
     920 web/src/app/api/import/sci/execute-bulk/route.ts
    1865 web/src/app/api/import/sci/execute/route.ts
     379 web/src/app/api/import/sci/process-job/route.ts
      78 web/src/app/api/import/sci/trace/route.ts
    5160 total
```

### 1.2 -- Target paths (line counts)

```
$ wc -l web/src/app/api/import/sci/execute/route.ts web/src/app/api/import/sci/execute-bulk/route.ts
    1865 web/src/app/api/import/sci/execute/route.ts
     920 web/src/app/api/import/sci/execute-bulk/route.ts
    2785 total
```

Non-bulk path = 2.03x the bulk path by line count.

### 1.4 -- UI callers

```
$ grep -rn "import/sci/execute\|import/sci/execute-bulk" web/src/app/ web/src/components/ web/src/lib/ --include="*.ts" --include="*.tsx" | grep -v "route.ts" | grep -v node_modules
web/src/components/sci/SCIExecution.tsx:189:      const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
web/src/components/sci/SCIExecution.tsx:266:    const res = await fetchWithTimeout('/api/import/sci/execute', {
web/src/components/sci/SCIExecution.tsx:326:        const res = await fetchWithTimeout('/api/import/sci/execute', {
web/src/lib/sci/post-commit-construction.ts:5: * `/api/import/sci/execute` (plan path — ran entity resolution post-execute)
web/src/lib/sci/post-commit-construction.ts:6: * and `/api/import/sci/execute-bulk` (data path — entity resolution missing
```

`SCIExecution.tsx` calls both paths — `execute-bulk` once (line 189), `execute` twice (lines 266, 326). `post-commit-construction.ts` doc comment references both as the historical plan-path/data-path split.

---

## Phase 2 -- Non-bulk path anatomy (`web/src/app/api/import/sci/execute/route.ts`)

### 2.1 -- Structural-grep summary (1865 lines)

```
$ grep -n "export\|^function\|^async function\|converge\|Convergence\|pipeline\|commit\|^import\|addLog\|Phase\|OB-\|HF-\|CLT-" web/src/app/api/import/sci/execute/route.ts | head -80
```

First 80 hits surface: extensive `OB-XXX` + `HF-XXX` annotation chain (Decision 77, OB-127, OB-133, OB-150, OB-160E/G/I/J, OB-162, OB-199, HF-084, HF-090, HF-092, HF-094, HF-108, HF-109, HF-126, HF-130, HF-132, HF-181, HF-194, HF-196 Phases 1/1D/1E/1F, HF-203, HF-213). Imports include `convergeBindings`, `executePostCommitConstruction`, `aggregateToFoundational`, `aggregateToDomain`, `writeClassificationSignal`, `writeFingerprint`, `computeFingerprintHashSync`, `extractFieldIdentitiesFromTrace`, `buildFieldIdentitiesFromBindings`, `resolveDataTypeFromClassification`, `supersedePriorBatchOnContentMatch`, `computeFileHashSha256`, `computeContentUnitHashSha256`. Top-level POST handler begins line 59; full helper-function list at §2.4 below.

### 2.2 -- Convergence call site (`convergeBindings`)

Full convergence block, **lines 177-265 verbatim**:

```typescript
    // OB-160G: Run convergence ONCE after all pipelines complete (not per-pipeline)
    // Collects convergence report for the execute response
    let convergenceReport: SCIExecutionResult['convergence'] | undefined;
    try {
      const { data: allRuleSets } = await supabase
        .from('rule_sets')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'draft']);

      if (allRuleSets && allRuleSets.length > 0) {
        const reports: NonNullable<SCIExecutionResult['convergence']>['reports'] = [];
        let totalDerivations = 0;

        for (const rs of allRuleSets) {
          const result = await convergeBindings(tenantId, rs.id, supabase);

          if (result.derivations.length > 0 || Object.keys(result.componentBindings).length > 0) {
            // HF-108: convergence_bindings is the PRIMARY output (Decision 111)
            // metric_derivations preserved as read-only fallback for pre-OB-162 data
            // but no longer written for new convergence runs when convergence_bindings exist
            const updatedBindings: Record<string, unknown> = {};

            if (Object.keys(result.componentBindings).length > 0) {
              // HF-109: convergence_bindings is THE sole output (DS-009 4.3)
              // metric_derivations NOT written — single format, no dual write
              updatedBindings.convergence_bindings = result.componentBindings;
            } else {
              // No convergence_bindings produced — write metric_derivations as primary
              // (legacy path for data without field identities)
              const { data: rsData } = await supabase
                .from('rule_sets')
                .select('input_bindings')
                .eq('id', rs.id)
                .single();

              const existing = ((rsData?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
              const merged = [...existing];

              for (const d of result.derivations) {
                if (!merged.some(e => e.metric === d.metric)) {
                  merged.push(d as unknown as Record<string, unknown>);
                }
              }
              updatedBindings.metric_derivations = merged;
            }

            // Preserve existing metric_mappings if present
            const { data: currentRs } = await supabase
              .from('rule_sets')
              .select('input_bindings')
              .eq('id', rs.id)
              .single();
            const currentBindings = (currentRs?.input_bindings as Record<string, unknown>) ?? {};
            if (currentBindings.metric_mappings) {
              updatedBindings.metric_mappings = currentBindings.metric_mappings;
            }

            await supabase
              .from('rule_sets')
              .update({ input_bindings: updatedBindings as unknown as Json })
              .eq('id', rs.id);

            totalDerivations += result.derivations.length;
          }

          reports.push({
            ruleSetId: rs.id,
            ruleSetName: rs.name,
            derivations: result.derivations.length,
            matches: result.matchReport,
            gaps: result.gaps.map(g => ({
              component: g.component,
              reason: g.reason,
              resolution: g.resolution,
              referenceDataAvailable: g.referenceDataAvailable,
            })),
          });
        }

        convergenceReport = {
          ruleSetsProcessed: allRuleSets.length,
          totalDerivations,
          reports,
        };
        console.log(`[SCI Execute] OB-160G: Convergence complete — ${totalDerivations} derivations across ${allRuleSets.length} rule sets`);
      }
    } catch (convErr) {
      console.error('[SCI Execute] Post-execute convergence failed (non-blocking):', convErr);
```

All other `converge` grep hits in this file:
```
13:  import { convergeBindings } from '@/lib/intelligence/convergence-service';
132: // HF-109: Pipeline order — reference before data for convergence, plan independent
668: // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete   (comment marker only)
817: // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete   (comment marker only)
1340: // so convergence Pass 4 reads authoritative semantic intent before AI derivation.    (comment marker only)
```

Only one runtime call to `convergeBindings` — at line 192 inside the OB-160G block.

### 2.3 -- Post-pipeline operations

After convergence completes (line 265), the non-bulk path runs:

```
270: await executePostCommitConstruction({ supabase, tenantId, source: 'sci-execute' });
272: // HF-126: Auto-create rule_set_assignments after entity resolution.
305:   .from('rule_set_assignments')
341:   .from('rule_set_assignments')   (insert)
347: HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets
365: // Single write path: writeClassificationSignal (HF-092 dedicated columns)
377:   writeClassificationSignal({ ... })   (fire-and-forget classification signal write per OB-160E)
399: // OB-160I: Aggregate anonymized structural pattern to foundational scope
410: // OB-160J: Aggregate to domain scope
420: // HF-181 Layer 2: Update fingerprint with CONFIRMED bindings
1653: // OB-153: Create rule_set_assignments for ALL entities that lack them (inside executePlanPipeline)
```

Sequence after pipelines + convergence: `executePostCommitConstruction` → `rule_set_assignments` insert (HF-126) → return response → fire-and-forget: `writeClassificationSignal`, `aggregateToFoundational`, `aggregateToDomain`, `writeFingerprint`.

### 2.4 -- Function list

```
$ grep -n "^async function\|^function\|^export async function\|^export function" web/src/app/api/import/sci/execute/route.ts
59:   export async function POST(req: NextRequest) {
464:  async function executeContentUnit(
492:  function filterFieldsForPartialClaim(unit: ContentUnitExecution): ContentUnitExecution {
527:  async function executeTargetPipeline(
684:  async function executeTransactionPipeline(
834:  async function executeEntityPipeline(
968:  async function executeReferencePipeline(
1109: async function executeBatchedPlanInterpretation(
1372: async function executePlanPipeline(
1628: async function postCommitConstruction(
```

10 top-level functions: 1 POST handler + 1 dispatcher (`executeContentUnit`) + 6 per-classification pipelines (target / transaction / entity / reference / batched-plan / plan) + 1 partial-claim filter + 1 local `postCommitConstruction` helper (file-private, distinct from the shared `executePostCommitConstruction` module at line 270).

---

## Phase 3 -- Bulk path anatomy (`web/src/app/api/import/sci/execute-bulk/route.ts`)

### 3.1 -- Structural-grep summary (920 lines)

Imports include `buildFieldIdentitiesFromBindings`, `resolveDataTypeFromClassification`, `supersedePriorBatchOnContentMatch`, `computeFileHashSha256`, `computeContentUnitHashSha256`, `executePostCommitConstruction`. **Does NOT import `convergeBindings`** — line 11 carries the explicit retirement annotation: `// OB-182: convergeBindings removed from import — runs at calc time`. POST handler at line 80. Per-classification pipeline functions: `processContentUnit` (305) → `processEntityUnit` (339) / `processDataUnit` (619) / `processReferenceUnit` (788). No `executeTargetPipeline` / `executeTransactionPipeline` / `executeBatchedPlanInterpretation` / `executePlanPipeline` — the non-bulk path's plan-handling pipelines are absent from bulk. Plan classifications are not handled by the bulk path; only entity / data / reference.

### 3.2 -- Convergence presence check

```
$ grep -n "converge\|Convergence\|convergeBindings" web/src/app/api/import/sci/execute-bulk/route.ts
11:  // OB-182: convergeBindings removed from import — runs at calc time
601: // OB-195 Layer 4: Invalidate cached convergence bindings
610: console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
754: // OB-195 Layer 4: Invalidate cached convergence bindings so engine re-derives with new data
763: console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
770: // Convergence derivation also removed (was lines 685-716) — runs at calc time.
772: // OB-182: Entity binding validation and convergence derivation REMOVED.
774: // Convergence: deferred to calculation time (engine derives when input_bindings empty).
895: // OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)
904: console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
```

**Zero runtime `convergeBindings(...)` calls.** All hits are comments documenting OB-182 retirement, OB-195 Layer-4 cache invalidation (which clears `input_bindings` so the engine re-derives), and console.log strings narrating the cache invalidation. The path actively *deletes* cached convergence bindings (entity/data/reference branches at 601-610 / 754-763 / 895-904) rather than computing them at import time.

### 3.3 -- Post-pipeline operations

```
41:  import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
248: await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
601-610:  OB-195 Layer 4 cache invalidation (entity branch — clears input_bindings)
754-763:  OB-195 Layer 4 cache invalidation (data branch — clears input_bindings)
895-904:  OB-195 Layer 4 cache invalidation (reference branch — clears input_bindings)
```

Same `executePostCommitConstruction` shared module call as non-bulk (line 248 here vs line 270 in non-bulk; both pass `source` field — `'sci-bulk'` vs `'sci-execute'`). Per-pipeline cache invalidation only in bulk. **No `rule_set_assignments` insert (HF-126)**, **no `writeClassificationSignal` fire-and-forget**, **no `aggregateToFoundational` / `aggregateToDomain`**, **no `writeFingerprint`**.

### 3.4 -- Function list

```
$ grep -n "^async function\|^function\|^export async function\|^export function" web/src/app/api/import/sci/execute-bulk/route.ts
80:  export async function POST(req: NextRequest) {
273: function filterFieldsForPartialClaim(
305: async function processContentUnit(
339: async function processEntityUnit(
619: async function processDataUnit(
788: async function processReferenceUnit(
```

6 top-level functions: 1 POST + 1 dispatcher (`processContentUnit`) + 3 per-classification pipelines (entity / data / reference) + 1 partial-claim filter. Same `filterFieldsForPartialClaim` shape as non-bulk. No plan-handling pipelines.

---

## Phase 4 -- Divergence analysis

### 4.1 -- Head diff (first 50 lines)

```
$ diff <(head -50 web/src/app/api/import/sci/execute/route.ts) <(head -50 web/src/app/api/import/sci/execute-bulk/route.ts)
1,4c1,3
< // SCI Execute API — POST /api/import/sci/execute
< // Decision 77 — OB-127
< // Processes confirmed proposals through classification-specific pipelines.
< // Zero domain vocabulary. Korean Test applies.
---
> // OB-156: SCI Execute Bulk — Server-side file processing
> // Downloads file from Supabase Storage, parses server-side, bulk inserts.
> // Fixes AP-1 (no row data in HTTP bodies) and AP-2 (no sequential chunks from browser).
6d4
< // OB-133/OB-150: Extended timeout for plan interpretation (AI takes 20-60s on production)
13,26c11
< import { convergeBindings } from '@/lib/intelligence/convergence-service';
< import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
< import { aggregateToFoundational, aggregateToDomain, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
< import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
< import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
< import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
< import type { StructuralFingerprint } from '@/lib/sci/classification-signal-service';
< import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
---
> // OB-182: convergeBindings removed from import — runs at calc time
29d13
<   SCIExecutionRequest,
32c16,17
<   ContentUnitExecution,
---
>   AgentType,
>   SemanticBinding,
40,41c25
< import { extractFieldIdentitiesFromTrace } from '@/lib/sci/header-comprehension';
50a35,50
> import { computeContentUnitHashSha256 } from '@/lib/sci/content-unit-hash';
> import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
> const PROCESSING_ORDER: Record<AgentType, number> = {
>   plan: 0,
>   entity: 1,
>   target: 2,
>   transaction: 3,
>   reference: 4,
> };
```

Header divergence: non-bulk imports convergence + fingerprint flywheel + classification-signal aggregation (8 imports unique to non-bulk); bulk includes content-unit-hash + processing-order map.

### 4.2 -- Function-call divergence

Identifier-followed-by-paren grep (`[a-zA-Z_]+\(`), sorted unique:

```
shared count:        58
non-bulk-only count: 36
bulk-only count:     12
```

**Shared (subset — both paths call these):** `add`, `arrayBuffer`, `buildFieldIdentitiesFromBindings`, `buildSemanticRolesMap`, `createClient`, `createServerSupabaseClient`, `detectPeriodMarkerColumns`, `download`, `executePostCommitConstruction`, `extractSourceDate`, `filterFieldsForPartialClaim`, `findDateColumnFromBindings`, `getUser`, `insert`, `POST`, `randomUUID`, `resolveDataTypeFromClassification`, `supersedePriorBatchOnContentMatch`, `update`, plus 39 generic JS/array/string built-ins. Full list of 58 in earlier raw output.

**Non-bulk-only (36):**
```
aggregateToDomain, aggregateToFoundational, bridgeAIToEngineFormat, computeFingerprintHashSync,
convergeBindings, emitPlanComprehensionSignals, executeBatchedPlanInterpretation,
executeContentUnit, executeEntityPipeline, executePlanPipeline, executeReferencePipeline,
executeTargetPipeline, executeTransactionPipeline, extractFieldIdentitiesFromTrace,
fromEntries, getAIService, interpretPlan, loadAsync, matchAll, postCommitConstruction,
sheet_to_json, slide, upsert, writeClassificationSignal, writeFingerprint,
plus 11 generic identifiers (async/catch/endsWith/file/is/limit/match/parseInt/range/test/toString)
```

**Bulk-only (12):**
```
buildTemporalAttrs, ceil, now, processContentUnit, processDataUnit, processEntityUnit,
processReferenceUnit, Promise, setTimeout, stringify, substring, values
```

Non-bulk owns: convergence runtime call, all per-pipeline plan/target/transaction/entity/reference functions, classification-signal write + aggregation + fingerprint, plan-interpreter integration (`interpretPlan`, `bridgeAIToEngineFormat`, `emitPlanComprehensionSignals`, `executeBatchedPlanInterpretation`), `getAIService`. Bulk owns: temporal-attribute builder (`buildTemporalAttrs`), the three `process*Unit` pipelines. Plan classification handling exists only in the non-bulk path.

### 4.3 -- POST handler shapes

**Non-bulk POST handler header (lines 59-158, abbreviated):**

```typescript
export async function POST(req: NextRequest) {
  try {
    // HF-084 auth check; HF-090 profileId = authUser.id
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const body: SCIExecutionRequest = await req.json();
    const { proposalId, tenantId, contentUnits, storagePath } = body;
    if (!tenantId || !proposalId || !contentUnits || contentUnits.length === 0) { ... }

    // HF-196 Phase 1F-corrective: SHA-256 over raw file bytes (optional unless non-plan)
    let fileHashSha256: string | null = null;
    if (storagePath) { /* download + computeFileHashSha256 */ }
    const nonPlanExists = contentUnits.some(u => u.confirmedClassification !== 'plan');
    if (nonPlanExists && !fileHashSha256) return error 400;

    // Verify tenant exists + read industry for domain flywheel (OB-160J)
    const { data: tenant } = await supabase.from('tenants').select('id, settings').eq('id', tenantId).single();
    const tenantDomainId = (tenantSettings.industry as string) || '';

    // HF-109: Pipeline order — reference before data for convergence, plan independent
    const PIPELINE_ORDER: Record<string, number> = { reference: 0, entity: 1, target: 1, transaction: 1, plan: 2 };
    const sorted = [...contentUnits].sort((a, b) => (PIPELINE_ORDER[a.confirmedClassification] ?? 9) - ...);

    // HF-130: Batch all plan-classified units from same file into ONE interpretation call
    const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
    if (planUnits.length > 0 && storagePath) {
      const batchResults = await executeBatchedPlanInterpretation(supabase, tenantId, planUnits, profileId, storagePath);
      ...
    }
```

Request shape: `{ proposalId, tenantId, contentUnits, storagePath }`. Sort order: reference < entity/target/transaction < plan. Plan-batch handling via `executeBatchedPlanInterpretation` is non-bulk-exclusive.

**Bulk POST handler header (lines 80-179, abbreviated):**

```typescript
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Auth check
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const body: BulkRequest = await req.json();
    const { proposalId, tenantId, storagePath, contentUnits } = body;
    if (!tenantId || !proposalId || !storagePath || !contentUnits?.length) { ... }

    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', tenantId).single();
    if (!tenant) return error 404;

    // Step 1: Download file from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase.storage.from('ingestion-raw').download(storagePath);
    // Step 2: Parse server-side via XLSX
    const XLSX = await import('xlsx');
    const buffer = await fileData.arrayBuffer();
    const fileHashSha256 = computeFileHashSha256(buffer);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetDataMap = new Map<string, { rows; columns }>();
    for (const sheetName of workbook.SheetNames) { ... }
    // HF-141 diagnostic: log unique source_dates
    // Step 3: Sort content units
    const sortedUnits = [...contentUnits].sort((a, b) => PROCESSING_ORDER[a.confirmedClassification] - PROCESSING_ORDER[b.confirmedClassification]);
```

Request shape: `{ proposalId, tenantId, storagePath, contentUnits }`. `storagePath` is REQUIRED (bulk gates on it as Step 1); for non-bulk it's optional unless `nonPlanExists`. Sort order via module-level `PROCESSING_ORDER` (plan:0, entity:1, target:2, transaction:3, reference:4). Bulk parses XLSX server-side once and threads `sheetDataMap` into pipelines; non-bulk's `executeBatchedPlanInterpretation` does its own file fetch.

### 4.4 -- Convergence in other import routes

```
$ for f in <import routes>; do grep -n "converge..." "$f"; done

web/src/app/api/import/commit/route.ts:
  777: // data_type and convergence can't distinguish actuals from targets.   (comment)
  986: // Replaced OB-119 Phase 4 inline binding generation with convergence service.
  989: const { convergeBindings } = await import('@/lib/intelligence/convergence-service');
  998: const result = await convergeBindings(tenantId, rs.id, supabase);
  1012: console.log(`[ImportCommit] OB-120 converged "${rs.name}": ${result.derivations.length} new derivations`);
  1016: console.warn('[ImportCommit] OB-120 convergence failed (non-blocking):', convErr);

web/src/app/api/import/prepare/route.ts: (zero hits)
web/src/app/api/import/sci/analyze-document/route.ts: (zero hits)
web/src/app/api/import/sci/analyze/route.ts: (zero hits)
web/src/app/api/import/sci/process-job/route.ts: (zero hits)
web/src/app/api/import/sci/trace/route.ts: (zero hits)
```

**Two runtime convergence call sites at import time:**
1. `web/src/app/api/import/sci/execute/route.ts:192` (non-bulk SCI execute, OB-160G)
2. `web/src/app/api/import/commit/route.ts:998` (legacy `/api/import/commit` path, OB-120)

`/api/import/sci/execute-bulk/route.ts` does not invoke convergence at import time (OB-182 retirement). The other five import-route files do not import or invoke convergence.

---

## Phase 5 -- Calculation-time convergence path

### 5.1 -- HF-165 calc-time convergence block

**`web/src/app/api/calculation/run/route.ts` lines 222-283, verbatim:**

```typescript
  // ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
  // OB-182 removed convergence from the bulk import path to eliminate sequence dependency.
  // At calculation time, both plans AND data are guaranteed to exist.
  // If input_bindings is empty, run convergence now to generate derivation rules.
  {
    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
    const hasMetricDerivations = Array.isArray(rawBindings?.metric_derivations) && (rawBindings.metric_derivations as unknown[]).length > 0;
    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;

    if (!hasMetricDerivations && !hasConvergenceBindings) {
      addLog('HF-165: input_bindings empty — running calc-time convergence');
      try {
        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
        const derivationCount = convResult.derivations.length;
        const bindingCount = Object.keys(convResult.componentBindings).length;
        const gapCount = convResult.gaps.length;

        if (derivationCount > 0 || bindingCount > 0) {
          // Store convergence results on the rule_set for future calculations
          const updatedBindings: Record<string, unknown> = {};

          if (bindingCount > 0) {
            // Decision 111: convergence_bindings is the primary output
            updatedBindings.convergence_bindings = convResult.componentBindings;
          }

          if (derivationCount > 0) {
            updatedBindings.metric_derivations = convResult.derivations;
          }

          // Persist to rule_set for reuse on subsequent calculations
          await supabase
            .from('rule_sets')
            .update({ input_bindings: updatedBindings as unknown as Json })
            .eq('id', ruleSetId);

          // Re-read the updated rule_set so the engine uses the new bindings
          const { data: updatedRS } = await supabase
            .from('rule_sets')
            .select('input_bindings')
            .eq('id', ruleSetId)
            .single();

          if (updatedRS) {
            (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
          }

          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
        } else {
          addLog(`HF-165: Convergence produced 0 derivations and 0 bindings (${gapCount} gaps)`);
          for (const gap of convResult.gaps) {
            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
          }
        }
      } catch (convErr) {
        // Non-blocking: convergence failure should not prevent calculation attempt
        addLog(`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}`);
      }
    } else {
      addLog('HF-165: input_bindings already populated — skipping convergence');
    }
  }
```

### 5.2 -- Trigger condition

```
$ grep -n "input_bindings.*empty\|hasConvergenceBindings\|hasCompleteBindings\|convergence_bindings" web/src/app/api/calculation/run/route.ts | head -20
105:  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3 at handler exit.
225:  // If input_bindings is empty, run convergence now to generate derivation rules.
229:  const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;
231:  if (!hasMetricDerivations && !hasConvergenceBindings) {
232:    addLog('HF-165: input_bindings empty — running calc-time convergence');
244:    // Decision 111: convergence_bindings is the primary output
245:    updatedBindings.convergence_bindings = convResult.componentBindings;
321:  // HF-108: Parse convergence_bindings from input_bindings (Decision 111)
325:  // Priority: convergence_bindings (Decision 111) > metric_derivations (legacy)
326:  const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
329:    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
335:    addLog('HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found');
431:  // C_proposed at calc time for the existing convergence_bindings.entity_identifier column.
1242: // Resolves metrics for a component using convergence_bindings (batch_id + column)
1986: const cb = currentBindings.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
2001: convergence_bindings: { ...cb, [compBindingKey]: newComp },
2134: // HF-220 R1 / ADR Decision 2: no convergence_bindings for this component.
2145: type: 'no_convergence_bindings_for_component',
2158: addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
2333: // convergence-resolvable for tenants with convergence_bindings.
```

**Trigger condition (line 231):** calc-time convergence fires when `!hasMetricDerivations && !hasConvergenceBindings` — both legacy `metric_derivations` array AND the newer `convergence_bindings` object are empty/absent. If either is populated, the calc engine skips convergence (line 281: `'HF-165: input_bindings already populated — skipping convergence'`). Newly computed bindings persist to `rule_sets.input_bindings` (lines 253-256) so subsequent calculations reuse them.

---

## Phase 6 -- DIAG-044 Complete

All five phases executed. Output file contains verbatim current-codebase extractions for:
- File inventory of all import routes with line counts (Phase 1.1-1.3)
- UI callers identifying which path the browser invokes (Phase 1.4)
- Non-bulk path full anatomy including OB-160G convergence call site (Phase 2)
- Bulk path full anatomy confirming convergence absence + OB-195 cache invalidation (Phase 3)
- Divergence analysis: head diff, function-call shared/exclusive lists, POST handler shapes (Phase 4.1-4.3)
- Convergence presence in all other import routes (Phase 4.4)
- Calc-time convergence path (HF-165 trigger condition + persistence) (Phase 5)

CC does not interpret findings. Architect dispositions in architect channel.
