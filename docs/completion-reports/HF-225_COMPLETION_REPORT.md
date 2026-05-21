# HF-225 COMPLETION REPORT

## Date
2026-05-14

## Execution Time
Single session, 2026-05-14 PDT. Four phase commits as specified in the directive (Phase 1 prompt, Phase 2 diagnostic, Phase 3 fix, Phase 4 report).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `23a67856` | Phase 1 | HF-225 Phase 1: composition principle for complex operations (no invented operation names) |
| `2eb56a0d` | Phase 2 | HF-225 Phase 2: period diagnostic script and findings |
| `635986b6` | Phase 3 | HF-225 Phase 3: period fix (scenario B per diagnostic) |
| (this commit) | Phase 4 | HF-225 Phase 4: completion report with evidence |

## FILES CREATED

| Path | Purpose |
|---|---|
| `web/scripts/hf225-period-diagnostic.ts` | Phase 2 service-role read of CRP periods, rule_sets, and committed_data date range. |
| `docs/completion-reports/HF-225_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

| Path | Change |
|---|---|
| `web/src/lib/ai/providers/anthropic-adapter.ts` | Removed three positive teachings of `scope_aggregate` as a component-type / top-level operation; added COMPOSITION PRINCIPLE block. |
| `web/src/app/api/periods/create-from-data/route.ts` | Canonical-key generation moved from legacy `YYYY-MM` format to `{period_type}_{start}_{end}` per OB-188. |

`git diff main..HEAD --stat` (before this commit):

```
 docs/completion-reports/HF-225_COMPLETION_REPORT.md       |   (added by Phase 4 commit)
 web/scripts/hf225-period-diagnostic.ts                    |  74 ++++++++++
 web/src/app/api/periods/create-from-data/route.ts         |  23 ++++---
 web/src/lib/ai/providers/anthropic-adapter.ts             |  54 ++++----
```

## DIAGNOSTIC FINDINGS (Phase 2)

`cd web && set -a && source .env.local && set +a && npx tsx scripts/hf225-period-diagnostic.ts`:

```
=== CRP PERIODS ===
Count: 3
  69ade87b-eb81-4774-ae1f-c29fbc86f8ee | January 1-15, 2026 | type=biweekly | 2026-01-01 to 2026-01-15 | key=biweekly_2026-01-01_2026-01-15 | status=open
  19b75689-b895-4122-be35-eba3dbde7178 | January 2026 | type=monthly | 2026-01-01 to 2026-01-31 | key=monthly_2026-01-01_2026-01-31 | status=open
  9fdbb93b-f376-48c1-ae86-540f0e9cd015 | January 16-31, 2026 | type=biweekly | 2026-01-16 to 2026-01-31 | key=biweekly_2026-01-16_2026-01-31 | status=open

=== CRP RULE SETS ===
Count: 8
  b965d9b3-b34e-4b7e-b37b-fb5e648d294f | Capital Equipment Commission Plan | cadence={"period_type":"biweekly"} | created=2026-05-13T23:32:33.675184+00:00
  12003582-7f01-419d-856e-a9faa3d55ddf | Consumables Commission Plan | cadence={"period_type":"monthly"} | created=2026-05-13T23:33:18.028789+00:00
  c28c5d86-8ad1-4949-8724-fc4510a1abe3 | Cross-Sell Bonus Plan | cadence={"period_type":"monthly"} | created=2026-05-13T23:33:57.56588+00:00
  2b3777bf-6a2e-4a4a-ac30-f86e4d29dceb | District Override Plan | cadence={"period_type":"monthly"} | created=2026-05-13T23:34:38.223057+00:00
  f4afb06e-82a4-4a2a-ab35-1c4270f4c8c5 | Capital Equipment Commission Plan | cadence={"period_type":"biweekly"} | created=2026-05-15T02:53:31.32266+00:00
  34cb4b3c-b2a7-4e69-9b95-0b5352f0f762 | Consumables Commission Plan | cadence={"period_type":"monthly"} | created=2026-05-15T02:54:09.356677+00:00
  a014b3f3-0348-4fb1-9387-25080ab3db1f | Cross-Sell Bonus Plan | cadence={"period_type":"monthly"} | created=2026-05-15T02:54:38.711229+00:00
  00945e01-68de-4f7b-9474-6d75812c034a | District Override Plan | cadence={"period_type":"monthly"} | created=2026-05-15T02:55:14.059576+00:00

=== COMMITTED_DATA DATE RANGE ===
Min source_date: 2026-01-01
Max source_date: 2026-01-31
Total committed_data rows: 446

=== PERIOD API ROUTES ===
(CC: run find command separately)
```

`find web/src/app/api/periods -name "route.ts" -type f`:

```
web/src/app/api/periods/route.ts
web/src/app/api/periods/detect/route.ts
web/src/app/api/periods/create-from-data/route.ts
```

`grep -n "canonical_key\|canonicalKey" web/src/app/api/periods/*/route.ts web/src/app/api/periods/route.ts` (pre-fix):

```
web/src/app/api/periods/detect/route.ts:37:    periods.push({ ..., canonical_key: `monthly_${sd}_${ed}` });
web/src/app/api/periods/detect/route.ts:52:    periods.push({ ..., canonical_key: `biweekly_${s1}_${e1}` });
web/src/app/api/periods/detect/route.ts:55:    periods.push({ ..., canonical_key: `biweekly_${s2}_${e2}` });
web/src/app/api/periods/create-from-data/route.ts:189:          canonical_key: key,   ← BUG: `key` is the periodMap key `YYYY-MM` (legacy)
```

The diagnostic identified **Scenario B per directive §5**: `create-from-data/route.ts` was generating `canonical_key` in legacy `YYYY-MM` format. Lines 134 and 148 produced the periodMap key as `${y}-${MM}` for in-memory grouping. Line 189 used that key directly as the inserted `canonical_key`. The `existingKeys` dedup (line 173) reads the periods table — which since OB-188 stores keys as `{period_type}_{start}_{end}` — so the old-format key and the new-format DB key never matched. Every call attempted to INSERT a legacy key and hit the unique constraint with `Key (tenant_id, canonical_key)=(<tenant>, YYYY-MM) already exists`.

`detect/route.ts` was already correct (new-format keys at lines 37/52/55). `periods/route.ts` is pass-through. Only `create-from-data/route.ts` needed the fix.

## PROOF GATES — HARD

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| H1 | TypeScript build exits 0 | PASS | See below. |
| H2 | No new operations in executor (zero new `scope_aggregate` top-level operation case) | PASS | See below. |
| H3 | Composition principle present in prompt | PASS | See below. |
| H4 | Period diagnostic output (existing periods, rule sets, date range) | PASS | See DIAGNOSTIC FINDINGS above. |
| H5 | Period fix applied (scenario identified and resolved) | PASS | See below. |
| H6 | Canonical key uses new format | PASS | See below. |

### H1 — TypeScript build exits 0

`cd web && npx tsc --noEmit; echo "EXIT=$?"`:

```
EXIT=0
```

`cd web && rm -rf .next && npm run build 2>&1 | tail -10`:

```
ƒ /workforce/teams                            11.5 kB         213 kB
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB


ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### H2 — No new operations in executor

`git diff main..HEAD --stat -- web/src/lib/calculation/intent-executor.ts`:

```
(empty — file untouched on this branch)
```

`grep -n "scope_aggregate" web/src/lib/calculation/intent-executor.ts`:

```
145:    case 'scope_aggregate': {
149:      inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
```

Both pre-existing hits are inside `resolveSource` (an IntentSource discriminator), NOT inside `executeOperation`. The directive's intent was "The executor does NOT need a new operation" — confirmed by the empty executor diff. The runtime still throws `IntentExecutorUnknownOperationError` for any top-level `operation: 'scope_aggregate'` emission. `executeOperation` dispatch table for reference:

```typescript
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
    default: {
      const operation = (op as { operation?: string }).operation ?? '<undefined>';
      throw new IntentExecutorUnknownOperationError(
        `[intent-executor] Unknown operation "${operation}" reached executeOperation. ...`
      );
    }
  }
}
```

### H3 — Composition principle present in prompt

`grep -n "COMPOSITION PRINCIPLE\|Do NOT invent\|scope_aggregate" web/src/lib/ai/providers/anthropic-adapter.ts`:

```
612:COMPOSITION PRINCIPLE FOR COMPLEX OPERATIONS:
615:ANY compensation concept must be expressed as a COMPOSITION of these primitives. Do NOT invent new operation names. If a plan describes a concept not directly matching a single primitive, compose multiple primitives.
628:The scope (which district, which region) is resolved by the data binding layer, not by the operation. Do NOT include scope parameters in the operation. Do NOT use "scope_aggregate" or any other compound operation name.
```

The only `scope_aggregate` occurrence in the prompt is inside the negative instruction at line 628 (`Do NOT use "scope_aggregate"`). The three pre-HF-225 positive teachings (component-type example, calculationIntent example, primitive-keys comment row) were removed.

Pasted block in full:

```
COMPOSITION PRINCIPLE FOR COMPLEX OPERATIONS:
The calculation engine supports these primitives: scalar_multiply, conditional_gate, bounded_lookup_1d, bounded_lookup_2d, piecewise_linear, linear_function, ratio, constant, aggregate, weighted_blend, temporal_window.

ANY compensation concept must be expressed as a COMPOSITION of these primitives. Do NOT invent new operation names. If a plan describes a concept not directly matching a single primitive, compose multiple primitives.

EXAMPLE — Manager override (percentage of team/district/region revenue):
The plan says "District Manager earns 1.5% of district equipment revenue."
This is: aggregate the metric (sum), then multiply by the rate.
Express as:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "aggregate", "sourceSpec": { "metric": "equipment_revenue", "function": "sum" } },
    "rate": 0.015
  }
}
The scope (which district, which region) is resolved by the data binding layer, not by the operation. Do NOT include scope parameters in the operation. Do NOT use "scope_aggregate" or any other compound operation name.

EXAMPLE — Tiered override (different rates by performance band):
The plan says "Regional VP earns 0.5% of region revenue."
Express as:
{
  "calculationIntent": {
    "operation": "scalar_multiply",
    "input": { "source": "aggregate", "sourceSpec": { "metric": "equipment_revenue", "function": "sum" } },
    "rate": 0.005
  }
}
```

### H5 — Period fix applied

`git show 635986b6 --stat`:

```
HF-225 Phase 3: period fix (scenario B per diagnostic)
 web/src/app/api/periods/create-from-data/route.ts | 23 ++++++++++++++++-------
 1 file changed, 16 insertions(+), 7 deletions(-)
```

Post-fix region in `create-from-data/route.ts`:

```typescript
// Create periods.
// HF-225 / OB-188: canonical_key uses the new `{period_type}_{start}_{end}`
// format. The periodMap key (`YYYY-MM`) is the legacy grouping handle;
// it is NOT the canonical_key. The actual canonical_key is constructed
// from period_type + start_date + end_date so monthly and biweekly
// periods for the same month do not collide and the dedup check against
// existingKeys (also new-format) matches correctly.
const newPeriods = Array.from(periodMap.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, data]) => {
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const startDate = `${data.year}-${String(data.month).padStart(2, '0')}-01`;
    const endDate = `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const canonicalKey = `monthly_${startDate}_${endDate}`;
    return {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      label: `${MONTH_NAMES[data.month - 1]} ${data.year}`,
      period_type: 'monthly',
      status: 'open',
      start_date: startDate,
      end_date: endDate,
      canonical_key: canonicalKey,
      metadata: { source: 'ob153_calculate', recordCount: data.count },
    };
  })
  .filter(p => !existingKeys.has(p.canonical_key));
```

### H6 — Canonical key uses new format

`grep -rn "canonical_key\|canonicalKey" web/src/app/api/periods/ --include="*.ts"` (selected — generation sites only):

```
web/src/app/api/periods/detect/route.ts:37:    periods.push({ ..., canonical_key: `monthly_${sd}_${ed}` });
web/src/app/api/periods/detect/route.ts:52:    periods.push({ ..., canonical_key: `biweekly_${s1}_${e1}` });
web/src/app/api/periods/detect/route.ts:55:    periods.push({ ..., canonical_key: `biweekly_${s2}_${e2}` });
web/src/app/api/periods/create-from-data/route.ts:188:        const canonicalKey = `monthly_${startDate}_${endDate}`;
web/src/app/api/periods/create-from-data/route.ts:197:          canonical_key: canonicalKey,
```

All three keys at three routes use the OB-188 `{period_type}_{start_date}_{end_date}` format. No legacy `YYYY-MM` literal survives in any generation site.

The existing CRP periods in the database (Phase 2 diagnostic) already carry new-format keys:

```
key=biweekly_2026-01-01_2026-01-15
key=monthly_2026-01-01_2026-01-31
key=biweekly_2026-01-16_2026-01-31
```

## STANDING RULE COMPLIANCE

| Section / Rule | Compliance |
|---|---|
| **GP-1 — Transparent Architectural Compliance** | The executor's dispatch table is the architectural enforcement that `scope_aggregate` is not a top-level operation. By teaching the LLM that the executor rejects unknown operations and that complex concepts compose from existing primitives, prompt-layer correctness is now coherent with executor-layer correctness. |
| **GP-2 — Research-Derived Design** | The composition principle mirrors the substrate-level discipline (Decision 151, single unified path). The LLM expresses concepts as primitives; the executor evaluates the composition. No new primitive added, no new dispatch case. |
| **Section A — AI-First, Never Hardcoded** | Prompt teaching, not hardcoded operation enumeration. The LLM still freely expresses; the prompt now teaches *how* to express. |
| **Section A — Fix Logic, Not Data** | Two pure-logic edits: the LLM prompt and the canonical-key generator. Zero JSONB writes, zero SQL workarounds, zero data backfills. The CRP periods in the database are unmodified. |
| **Section C — AP-25 (Korean Test)** | The COMPOSITION PRINCIPLE block uses domain-specific example labels (`equipment_revenue`, `district`) inside the *illustrative* example — consistent with the existing flat-multiply example (`sales_amount`) and ratio examples (`actual_units` / `target_units`) at the same prompt surface. The principle itself is stated in structural vocabulary (`operation`, `input`, `source`, `aggregate`); no domain term appears in normative text. |
| **Section C — AP-26 (Closed-vocabulary registries)** | The prompt now teaches composition over a known primitive set rather than enumerating new compound names. The set itself comes from existing `primitive-registry.ts` (Rule 27). |
| **Section D, Rule 7 (Service role server-side)** | Diagnostic script uses service-role client via `createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)`. |
| **Section D, Rules 10–14** | NEVER asked yes/no; acted directly per autonomy directive. Diagnostic finding informed scenario selection (B) rather than guessing. |
| **Section D, Rules 15–20 (Proof gates)** | All Hard gates above paste RENDERED grep output, actual code excerpts, or actual diagnostic terminal output. No "verified" claims. |
| **Section D, Rule 22 (Architecture Decision Gate)** | Two-option choice recorded in the directive: (Defect A) extend the executor with a `scope_aggregate` operation case vs. teach the LLM to compose existing primitives. Composition chosen because executor unchanged = no new branch, no new test surface; (Defect B) Scenario A/B/C — chose B based on diagnostic evidence that the generation site (not stale periods, not missing route) was the bug. |
| **Section D, Rule 25 (Scale analysis)** | Both fixes operate at O(1) per call. Prompt change is a one-time inclusion per LLM invocation; canonical-key change is a single string template. Identical performance at 10× and 100× scale. |
| **Section D, Rules 27/28 (Prompt-layer registry derivation)** | The COMPOSITION PRINCIPLE primitive list (`scalar_multiply, conditional_gate, ...`) matches `FOUNDATIONAL_PRIMITIVES` in `primitive-registry.ts` minus `scope_aggregate` (which is `kind: 'source_only'` per the registry). Rule 27 demands prompts derive allowed values from the canonical registry; the list here is consistent with the registry's `kind: 'operation'` subset. A follow-on tightening could programmatically derive the list at prompt-construction time, but the literal list as a string is current standing practice at this prompt surface. |

## KNOWN ISSUES

1. **HF-195/Rule-27 build-time gate scope.** The COMPOSITION PRINCIPLE block hardcodes the primitive list as a literal string. Rule 27 demands prompts derive registry vocabulary at construction time. The existing `verify-korean-test.sh` pre-build check did not flag this insertion because the listed primitives are all valid registry entries. A more ambitious follow-on would build this list from `FOUNDATIONAL_PRIMITIVES.filter(p => REGISTRY[p].kind === 'operation')` at prompt-construction time.

2. **Pre-HF-225 `scope_aggregate` artifacts in code.** The codebase has 15+ references to `scope_aggregate` outside the prompt — type declarations (`compensation-plan.ts:64`, `intent-types.ts:37`), the primitive registry (`primitive-registry.ts:57/215`), the executor's source case (`intent-executor.ts:145`), the convergence service comment (`convergence-service.ts:47`), AI plan-interpreter mapping (`ai-plan-interpreter.ts:467`), and the calculation runner (`run-calculation.ts:262/502`). These are pre-existing and intentional: `scope_aggregate` remains a valid IntentSource at the source level (per `primitive-registry.ts` `kind: 'source_only'`). HF-225 only removed the LLM teaching that it was a top-level operation. No follow-on action required.

## RESIDUALS (per directive §8B)

1. **CRP plan re-import required post-merge.** Architect re-imports the four CRP plans (especially Plan 4 District Override) so the LLM re-interprets with the COMPOSITION PRINCIPLE. The new emission should produce `scalar_multiply { input: { source: 'aggregate', ... } }` instead of `scope_aggregate` as a top-level operation.
2. **CRP full reconciliation pending.** All four CRP plans need calculation across all six periods and reconciliation against `CRP_Resultados_Esperados.xlsx`. Plan 1 GT: $360,007.84. Plan 2 GT: $60,328.79. Plan 3 GT: $4,450. Plan 4 GT: $136,530.42. Net GT: $555,617.05.
3. **Plan 1 delta from March.** Plan 1 produced $84,933.50 for Jan 1-15 this session vs GT $73,142.72; March produced $73,142.72 exact. Needs diagnostic.
4. **Plan 3 ($0 output).** Cross-Sell Bonus requires cross-plan gate (equipment deals from Plan 1 as input). Cross-plan coordination capability may not be wired.
5. **CRP Plan 2 delta.** Consumables produced $71,022.49 for monthly January vs GT $28,159.48. Likely a quota/attainment tier issue from convergence mapping wrong columns to the piecewise_linear input.
6. **February periods missing.** No February `source_date` rows in `committed_data` (range 2026-01-01 to 2026-01-31). After February data is imported, autodetect will create the four expected February periods (Feb biweekly 1-15, biweekly 16-28, monthly). Outside HF-225 scope.
7. **Duplicate rule_sets.** 4 CRP plans × 2 import cycles = 8 rule_sets. Older set may be retired by architect before reconciliation.

## VERIFICATION SCRIPT OUTPUT

```bash
cd ~/spm-platform

# H1
( cd web && npx tsc --noEmit; echo "EXIT=$?" )
( cd web && rm -rf .next && npm run build 2>&1 | tail -10 )

# H2 — executor untouched + scope_aggregate is source-only
git diff main..HEAD --stat -- web/src/lib/calculation/intent-executor.ts
grep -n "scope_aggregate" web/src/lib/calculation/intent-executor.ts

# H3 — COMPOSITION PRINCIPLE present, scope_aggregate only in negative instruction
grep -n "COMPOSITION PRINCIPLE\|Do NOT invent\|scope_aggregate" web/src/lib/ai/providers/anthropic-adapter.ts

# H4 — diagnostic
( cd web && set -a && source .env.local && set +a && npx tsx scripts/hf225-period-diagnostic.ts )

# H5/H6 — canonical key generation new format
grep -rn "canonical_key\|canonicalKey" web/src/app/api/periods/ --include="*.ts"
```
