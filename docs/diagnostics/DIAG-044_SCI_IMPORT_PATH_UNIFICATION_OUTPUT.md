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
