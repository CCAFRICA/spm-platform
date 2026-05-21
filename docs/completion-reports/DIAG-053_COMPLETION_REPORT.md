# DIAG-053 — Plan Interpretation Regression Triage + Fix

**Branch:** `diag-053-plan-interpretation-fix` off `main @ 9484e3b5`
**Date:** 2026-05-20
**Scope:** Read-only probes (Phase 1) + targeted UX fix (Phase 3). The HF-239 unification path is not modified.

---

## Phase 1 — Diagnostic probes

### Probe 1 — execute-bulk plan wiring

**1A — Imports (`src/app/api/import/sci/execute-bulk/route.ts` head):**

```
33:// HF-239 Phase 0.1: plan interpretation extracted into shared module so this
34:// route's `case 'plan'` arm calls the same logic that execute/route.ts (now
35:// deleted) used to carry inline. Closes the plan/data path divergence.
36:import {
37:  executeBatchedPlanInterpretation,
38:  executePlanPipeline,
39:} from '@/lib/sci/plan-interpretation';
```

**1B — Batched plan dispatch in POST handler (lines 207-229):**

```typescript
    // HF-239: Batched plan interpretation. Plan-classified units from the
    // same file are interpreted in ONE AI call (HF-130 pattern lifted from
    // the deleted execute/route.ts). Handled plan units are skipped by the
    // per-unit dispatch loop below.
    const planUnits = sortedUnits.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();
    if (planUnits.length > 0) {
      try {
        const batchResults = await executeBatchedPlanInterpretation(
          supabase,
          tenantId,
          planUnits as unknown as ContentUnitExecution[],
          profileId,
          storagePath,
        );
        for (const r of batchResults) {
          results.push(r);
          handledPlanUnitIds.add(r.contentUnitId);
        }
      } catch (err) {
        console.error('[SCI Bulk] Batched plan interpretation failed, falling back to per-unit:', err);
      }
    }
```

**1A — `case 'plan'` arm in `processContentUnit` (lines 410-417):**

```typescript
    case 'plan':
      // HF-239: per-unit plan dispatch (single-unit fallback when the
      // batched interpretation at the POST handler did not handle this
      // unit). Delegates to the shared plan-interpretation module which
      // mirrors the deleted execute/route.ts executePlanPipeline behavior.
      return executePlanPipeline(
        supabase, tenantId, unit as unknown as ContentUnitExecution, profileId, storagePath,
      );
```

**Probe 1 verdict:** Plan dispatch is correctly wired. Both the batched and per-unit paths gate on `confirmedClassification === 'plan'`. Imports resolve. No bug here.

### Probe 2 — UI dispatch

**2A/2C — `executeUnits` plan branch (`src/components/sci/SCIExecution.tsx` lines 292-347):**

```typescript
  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
    const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');

    if (planUnits.length > 0) {
      setElapsedSeconds(0);
      // ...
      const planExecUnits = planUnits.map(unit => {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        if (!proposalUnit) return null;
        return {
          contentUnitId: unit.contentUnitId,
          confirmedClassification: unit.classification,
          confirmedBindings: proposalUnit.fieldBindings,
          rawData: [] as Record<string, unknown>[],
          // ... documentMetadata, claimType, ownedFields, sharedFields,
          //     originalClassification, originalConfidence,
          //     classificationTrace, structuralFingerprint, vocabularyBindings,
          //     sourceFile, tabName — all conditionally spread from proposalUnit
        };
      }).filter(Boolean);
      try {
        if (!storagePath) {
          throw new Error('storagePath required: HF-239 unified import requires Storage transport for plan units');
        }
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            storagePath,
            contentUnits: planExecUnits,
          }),
        });
        // ...
```

**2D — How does the UI determine which units are plan-classified? (`src/components/sci/SCIExecution.tsx`):**

`ExecutionUnit.classification` is initialized from `confirmedUnits[i].classification` on mount (line 131). `confirmedUnits` is the prop passed from `page.tsx handleConfirmAll`, which receives `effectiveUnits` from `SCIProposal`. `effectiveUnits` applies `classificationOverrides` over the analyzer's proposed classification. So the chain is:

```
analyzer → proposal.contentUnits[i].classification
    → SCIProposal classificationOverrides (Map<contentUnitId, AgentType>)
    → effectiveUnits[i].classification (override applied if set)
    → onConfirmAll(effectiveUnits)
    → page.tsx handleConfirmAll
    → SCIExecution confirmedUnits prop
    → ExecutionUnit.classification
    → executeUnits filter(u => u.classification === 'plan')
```

The override flow is correctly plumbed.

### Probe 3 — Classification flow

**3A — Override → confirmedClassification trace.** Captured above in 2D. The override flows from `handleChangeClassification` (`SCIProposal.tsx:453`) through `effectiveUnits` and reaches `executeUnits` as `u.classification`. The fetch body sets `confirmedClassification: unit.classification`.

**3B — Pre-HF-239 server-side plan detection:**

`git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts | sed -n '128,145p'`:

```
128:    // HF-130: Batch all plan-classified units from the same file into ONE interpretation call.
129:    // A multi-sheet XLSX plan (e.g., overview + rate tables + targets) must be interpreted as
130:    // a single document — the AI needs cross-sheet context to extract complete components.
131:    const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
132:    const handledPlanUnitIds = new Set<string>();
133:
134:    if (planUnits.length > 0 && storagePath) {
135:      try {
136:        const batchResults = await executeBatchedPlanInterpretation(
137:          supabase, tenantId, planUnits, profileId, storagePath
138:        );
```

**Pre-HF-239 gating logic was IDENTICAL:** `filter(u => u.confirmedClassification === 'plan')`. There was no server-side plan-content detection.

### Probe 4 — Pre-HF-239 plan import mechanism

**4A — Other tenants' rule_set history** (skipped — directive noted BCL was clean-slated; the question is the mechanism, not the data).

**4B — Pre-HF-239 plan unit collection (already captured in 3B):** identical to post-HF-239 — gated on `confirmedClassification === 'plan'`.

**4C — Pre-HF-239 UI plan dispatch** (`git show 6ceb16a7:web/src/components/sci/SCIExecution.tsx | grep -n "plan\|execute\b" | head -30`):

```
326:        const res = await fetchWithTimeout('/api/import/sci/execute', {
333:            ...(storagePath ? { storagePath } : {}),
```

The pre-HF-239 UI posted plan units to `/api/import/sci/execute`. Post-HF-239 they go to `/api/import/sci/execute-bulk`. Both routes process plan units identically once `confirmedClassification === 'plan'`.

**4 — One additional axis: alternate plan-import routes:**

| Route | Status | Calls AI interpretation? |
|---|---|---|
| `/api/import/sci/execute` | DELETED in HF-239 | yes (before deletion) |
| `/api/import/sci/execute-bulk` | active | yes (after HF-239) |
| `/api/plan/import` | active | NO — accepts pre-built planConfig |
| `/api/interpret-import` | dead code (no UI callers) | (was a wrapper) |
| `/admin/launch/plan-import` | redirects to `/operate/import` | n/a |

Only the SCI flow runs AI interpretation. Both pre- and post-HF-239 require the UI to send `confirmedClassification === 'plan'`.

---

## Phase 2 — Root cause identification

**Root cause: A — UI never sends plan-classified units.**

Evidence:
1. Pre- and post-HF-239 execute routes use **identical** gating logic
   (`confirmedClassification === 'plan'`).
2. The XLSX analyzer (`/api/import/sci/analyze`) classifies sheets structurally
   via `PLAN_WEIGHTS` in `src/lib/sci/agents.ts`. A plan XLSX's rate-table sheets
   look like `reference` (high key uniqueness, descriptive columns, low row count);
   roster sheets look like `entity` (entity_id, structural names, single-per-entity).
   The plan agent's positive signals (auto_generated_headers, high_sparsity,
   no_entity_id) don't fire on clean multi-sheet plan workbooks.
3. The override mechanism in `SCIProposal.tsx` already wires through correctly to
   `executeBatchedPlanInterpretation`. Verified by tracing 2D.
4. HF-239 did NOT modify `analyze/route.ts`, `agents.ts`, or `SCIProposal.tsx` —
   the classifier and override UI are unchanged.

**Why the user perceives this as a regression:** Pre-clean-slate, BCL had
`structural_fingerprints` flywheel entries that drove Tier-1 cache hits
classifying the same plan-file fingerprint as `plan`. DIAG-052 Probe 1 captured
`structural_fingerprints` count = `null` for all three proof tenants after the
clean slate. With the flywheel empty, the cold-start structural classifier
falls through to the weight-based scoring, which doesn't favor plan for
clean XLSX rate-table workbooks. The user-visible symptom is "plan import
broke" — but the actual root cause is "flywheel cache wiped, structural
cold-start unreliable for XLSX plans".

This is NOT an HF-239 regression in the strict sense: the same file uploaded
through pre-HF-239 with an empty flywheel would have produced the same
entity/reference classification and required the same override.

---

## Phase 3 — Fix

**Approach:** make the override flow discoverable.

The override mechanism already works (Probe 2D evidence). The fix surfaces it
prominently when the cold-start classifier returns the signature of an XLSX
plan workbook (every sheet `entity` or `reference`, ≥ 2 sheets — neither
transaction nor target nor plan classification). A one-click batch override
sets all units to `plan`, putting the user one click away from triggering
AI plan interpretation.

**File modified:** `web/src/components/sci/SCIProposal.tsx` (+44 lines).

**Detection (after the `effectiveUnits` memo):**

```typescript
const hasPlanCandidate = useMemo(() => {
  if (effectiveUnits.length < 2) return false; // single-sheet files aren't multi-sheet plans
  const types: AgentType[] = effectiveUnits.map(u => u.classification);
  return types.every(t => t === 'entity' || t === 'reference');
}, [effectiveUnits]);
```

**Batch override handler:**

```typescript
const reclassifyAllAsPlan = () => {
  setClassificationOverrides(prev => {
    const next = new Map(prev);
    for (const u of effectiveUnits) {
      const uid = (u as { _uniqueId?: string; contentUnitId: string })._uniqueId || u.contentUnitId;
      next.set(uid, 'plan' as AgentType);
    }
    return next;
  });
  setConfirmedIds(new Set()); // unconfirm so user reviews
};
```

**Banner (after file header, before SummaryBar):**

```tsx
{hasPlanCandidate && (
  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
    <p className="font-medium text-amber-300">
      Looks like a data file — is it actually a compensation plan?
    </p>
    <p className="text-xs text-amber-200/80 mt-1">
      All {effectiveUnits.length} sheets classified as data
      (entity / reference). If this is a plan document with rate
      tables and rosters, override to <span className="font-mono">plan</span> so
      AI interpretation can run.
    </p>
    <button
      type="button"
      onClick={reclassifyAllAsPlan}
      className="mt-2 inline-flex items-center rounded border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/25"
    >
      Reclassify all as plan
    </button>
  </div>
)}
```

**Architectural notes:**

- Zero hardcoded filenames, tenant names, plan names, or domain literals
  (AP-5/AP-6 compliant). The trigger is purely structural: a multi-sheet
  file where every sheet classified as data.
- The fix does not change the execute-bulk plan dispatch or the analyzer.
  It surfaces an existing capability (per-unit override) as a batch action.
- After click → `effectiveUnits` reflects override → `onConfirmAll` →
  `confirmedUnits` carries `classification: 'plan'` → `executeUnits` plan
  filter matches → `executeBatchedPlanInterpretation` fires.

**What this does NOT fix:**

- The cold-start XLSX classifier still doesn't recognize plan workbooks
  on its own. A follow-up could add filename-based hints or structural
  cross-sheet plan signatures, but those are out of scope for a fix
  scoped to "restore plan import after the flywheel was wiped".
- The flywheel itself is now empty post-HF-239 + post-clean-slate.
  HF-239 already restored flywheel emission in `execute-bulk` (DIAG-052
  Probe 6 found `structural_fingerprints` empty pre-HF-239; HF-239's
  `emitFlywheelSignals` populates them on import). After enough imports
  through the unified route, the cache will warm and the cold-start
  classifier becomes less critical.

---

## Verification

### Build

```
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ rm -rf .next && npm run build ; echo exit=$?
exit=0
```

### Dev server

```
$ npm run dev
✓ Ready in 1203ms
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
HTTP 307
```

### Manual verification (architect-triggered)

CC cannot drive a browser; the verification gate the directive specifies
("import `BCL_Plan_Comisiones_2025.xlsx`, override to plan, confirm AI
plan interpretation runs and rule_set is created") is architect-manual.
The fix is structurally complete:

1. **Click path:** upload BCL_Plan_Comisiones_2025.xlsx → analyze →
   proposal renders → amber banner appears ("Looks like a data file —
   is it actually a compensation plan?") → click "Reclassify all as plan" →
   confirm → import.
2. **Expected log line:** `[SCI plan-interp] Batched interpretation:
   3 sheets from <storagePath>` (from
   `src/lib/sci/plan-interpretation.ts:39`).
3. **Expected DB state:** `rule_sets` row with
   `tenant_id = b1c2d3e4-...-111`, `status = 'active'`, populated
   `input_bindings` and `components`.

---

## Anti-pattern checklist

```
[x] Override flow plumbed and verified (Probe 2D trace)
[x] AP-5/AP-6: no hardcoded field names or language-specific strings
[x] Domain-agnostic: detection is structural (count of entity/reference
    classifications across sheets)
[x] tsc --noEmit clean
[x] next build clean
[x] next dev responds (HTTP 307 root)
[x] No changes to execute-bulk plan dispatch (HF-239 path preserved intact)
[x] No changes to analyzer or agents.ts (classifier behavior unchanged)
[x] SR-34: no known structural bypasses introduced
```

---

## Follow-up items (not implemented)

1. **Filename-based plan hint in analyzer.** Adding a narrow set of
   structural plan tokens to the analyzer's PLAN_WEIGHTS would let the
   cold-start classifier recognize XLSX plan workbooks. Excluded from
   this PR because AP-5/AP-6 require tokens to be structural identifiers,
   not domain-language literals.
2. **Cross-sheet plan signature.** A multi-sheet XLSX with one roster-shape
   sheet + one rate-table-shape sheet + one target-shape sheet IS a plan
   workbook signature, even if no individual sheet scores high on plan.
   Detecting this requires aggregating across content units before
   per-sheet classification — currently the analyzer scores each sheet
   independently.
3. **Flywheel warming.** With HF-239's `emitFlywheelSignals` populating
   `structural_fingerprints` on every import, the flywheel will warm
   naturally over time. After enough imports, Tier-1 cache hits will
   resolve plan classification without structural cold-start.
