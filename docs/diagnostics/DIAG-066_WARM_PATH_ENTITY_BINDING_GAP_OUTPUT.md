# DIAG-066 Output: Warm-Path Entity Binding Gap

**Executed by:** CC
**Date:** 2026-06-13
**Branch:** OB-203-phase-6 (witness worktree `/Users/AndrewAfrica/spm-platform-ob203-witness`)
**SHA:** committed at the SHA of this output's commit (read-only DIAG; no application code changed)
**Inspection script:** `web/scripts/diag/diag-066-entity-binding-inspect.ts` (committed; read-only)
**Sessions identified:** cold = `4ae71225-3a90-4462-8780-d83f176a7bbd` (20 batches), warm = `505a6d2c-7b11-42a2-a11e-100c8a42afbd` (18 batches).

---

## Q1 Answer: Entity-Identifier Derivation Surface

### Read surface (what the commit path reads)

The failure is at the **gate in `processEntityUnit`**, upstream of `commitContentUnit`
(`web/src/app/api/import/sci/execute-bulk/route.ts:781-787`):

```ts
const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');
const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');
if (!idBinding) {
  return { ... success: false, ... error: 'No entity_identifier binding found' };
}
```

This reads ONE surface: `confirmedBindings` (the `SemanticBinding[]`), keyed by `semanticRole`.
It does **not** consult the header-comprehension surface.

The very next stage, `commitContentUnit.resolveEntityIdField` (`web/src/lib/sci/commit-content-unit.ts:160-185` + `findHcRole:133-158`), reads the **other** surface and would resolve the entity id correctly for all five failures:

```ts
function findHcRole(classificationTrace, targetRole): string | null {
  const interpretations = classificationTrace?.headerComprehension?.interpretations;
  for (const [colName, interp] of Object.entries(interpretations)) {
    if (interp.columnRole === targetRole && interp.confidence >= HC_IDENTIFIER_THRESHOLD /* 0.80 */)
      return colName;
  }
  return null;
}
// entity branch: const hcIdentifier = findHcRole(classificationTrace, 'identifier'); if (hcIdentifier) return hcIdentifier;
```

The warm cache carries `location_id:col=identifier@0.85` (≥ 0.80) for every failed sheet — so
`resolveEntityIdField` WOULD return `location_id`. **The `processEntityUnit:781` gate blocks the
unit before that stage runs.** The entity-id pointer exists on the surface the commit derivation
reads; the upstream gate reads a different surface.

### Write surface — cold path (LLM comprehension → proposal)

Cold negotiation builds `SemanticBinding[]` with `semanticRole` via `inferRoleForAgent`
(`web/src/lib/sci/negotiation.ts:294-363`). For `hcRole === 'identifier'`:

```ts
if (hcRole === 'identifier') {
  if (identifiesWhat) { /* ENTITY_TYPES → entity_identifier@0.95; RECORD_TYPES → transaction_identifier@0.95; else entity_identifier@0.85 */ }
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;   // Deterministic Fallback
  if (uniquenessRatio > 0.8) return { role: 'transaction_identifier', ... confidence: 0.80 };   // ← line 323
  return { role: 'entity_identifier', ... confidence: 0.85 };
}
```

The **cold proposal** (storage `…/proposals/4ae71225….json`) negotiated the right role and committed:
```
Sucursales        cls=entity@0.600  HASentity_id=YES   location_id:entity_identifier@0.85
Empleados         cls=entity@0.950  HASentity_id=YES   empleado_id:entity_identifier@0.95
Resumen_Empleado  cls=entity@0.644  HASentity_id=YES   empleado_id:entity_identifier@0.95
```

### Write surface — warm path (flywheel injection, HF-254)

On a Tier-1 match the warm path injects the cached `fieldBindings` into the sheet's
`headerComprehension.interpretations` (`web/src/app/api/import/sci/analyze/route.ts:280-314`),
setting `columnRole` — it does **not** reconstruct a `SemanticBinding` with
`semanticRole === 'entity_identifier'`:

```ts
const flywheelBindings = flywheelResult.classificationResult.fieldBindings; // from structural_fingerprints
for (const fb of flywheelBindings)
  interpretations.set(fb.sourceField, { columnName: fb.sourceField, columnRole: fb.columnRole!, confidence: fb.confidence, ... });
sheetProfile.headerComprehension = { interpretations, ..., llmModel: 'flywheel-tier1' };
```

The warm proposal's `fieldBindings` (the `SemanticBinding[]`) are **recalled verbatim from the
flywheel cache** (`structural_fingerprints.classification_result.fieldBindings`). The cache, written
during the COLD run (created `2026-06-13T00:35:15`, updated end-of-warm `02:05:41`), stores:
```
Sucursales        cls=entity  location_id:transaction_identifier/col=identifier@0.8    <- diverges from cold proposal
Resumen_Sucursal  cls=entity  location_id:transaction_identifier/col=identifier@0.8
Resumen_Empleado  cls=entity  empleado_id:transaction_identifier/col=identifier@0.8
Empleados         cls=entity  empleado_id:entity_identifier/col=identifier@0.85        <- agrees → warm success
Resumen_Producto  cls=entity  item_id:entity_identifier/col=identifier@0.85            <- agrees → warm success
```

### Surface comparison verdict

```
[ ] SINGLE SURFACE
[X] DUAL SURFACE — two layers, both confirmed by pasted data:
    Layer 1 (consumer): the gate reads confirmedBindings.semanticRole==='entity_identifier' ONLY;
            the HC surface (interpretations[col].columnRole==='identifier') carries the correct
            entity-id pointer for all 5 failures (col=identifier@0.85/0.95) but the gate never
            consults it — and resolveEntityIdField, the next stage, DOES read it.
    Layer 2 (origin of the wrong semanticRole on warm): the flywheel cache stored
            transaction_identifier for these columns during COLD analyze, DIVERGING from the COLD
            PROPOSAL's entity_identifier that COLD EXECUTE used to commit the same sheets. Warm
            recalls the divergent flywheel binding, not the proposal binding.
[ ] PRODUCER-ENUMERATED
```

### Q1c Discriminator

Pasted diff (warm session 505a6d2c proposal), success vs failure — **every entity sheet has
`<id>:col=identifier` in headerComprehension; only the `semanticRole` differs**:

```
SUCCEEDED:
  Empleados         empleado_id:entity_identifier@0.85   | HC empleado_id:col=identifier@0.95
  Resumen_Producto  item_id:entity_identifier@0.85       | HC item_id:col=identifier@0.85
FAILED ("No entity_identifier binding found"):
  Sucursales        location_id:transaction_identifier@0.8 | HC location_id:col=identifier@0.85
  Menus             menu_id:transaction_identifier@0.8     | HC menu_id:col=identifier@0.85
  Resumen_Sucursal  location_id:transaction_identifier@0.8 | HC location_id:col=identifier@0.85
  Resumen_Menu      item_id:transaction_identifier@0.8     | HC item_id:col=identifier@0.85
  Resumen_Empleado  empleado_id:transaction_identifier@0.8 | HC empleado_id:col=identifier@0.95
```

**Discriminating field: `SemanticBinding.semanticRole` of the identifier column** —
`entity_identifier` (2 successes) vs `transaction_identifier` (5 failures). The HC `columnRole`
(`identifier`) is identical and correct on all seven. The `transaction_identifier@0.8` value is
exactly `negotiation.ts:323` (Deterministic Fallback, uniqueness > 0.8, no `identifiesWhat`); the
`entity_identifier@0.85` is the entity branch. The flywheel stored the cardinality-fallback role for
the high-uniqueness dimension identifiers, diverging from the cold proposal's entity role.

**Root cause (evidence-backed):** the COLD flywheel WRITE stored a different `semanticRole` than the
COLD PROPOSAL used to commit. Cold proposal `Sucursales.location_id = entity_identifier@0.85`
(committed — committed_data confirms 6 entity rows in session 4ae71225); cold flywheel
`location_id = transaction_identifier@0.8`. The proposal/execute surface and the flywheel/recall
surface disagree within one run; warm trusts the flywheel.

### HALT-4 assessment: DOES NOT FIRE

The stored learning is **not** structurally incapable of carrying entity-id information. The HC
`columnRole='identifier'` survived in the warm cache for all five failures
(`location_id:col=identifier@0.85`, etc., ≥ the 0.80 threshold `resolveEntityIdField` requires). No
re-LLM on the warm path is needed: the fix reads the surviving canonical surface (HC columnRole) at
the gate, or reconciles the flywheel write to store the role the proposal used. Progressive
Performance holds.

---

## Q2 Answer: Resume Ventas Re-processing

### Resume decision logic (`web/src/lib/sci/execute-resume.ts:30-48`, verbatim)

```ts
export function classifyUnitForResume(params): ResumeDisposition {
  const { spineState, latestBatch, livenessMs, nowMs } = params;
  if (spineState === 'bound' || spineState === 'resolved' || spineState === 'failed_interpretation')
    return 'skip_terminal';
  if (latestBatch?.status === 'completed') return 'skip_completed_batch';
  if (latestBatch?.status === 'processing') {
    const age = nowMs - Date.parse(latestBatch.createdAt);
    if (Number.isFinite(age) && age < livenessMs) return 'skip_in_flight';   // ← liveness LEASE
  }
  return 'process';
}
// batchLivenessMs(): env OB203_BATCH_LIVENESS_MS or default 6*60*1000 = 360000ms
```

`skip_in_flight` requires a `processing` batch whose age is **< 360 s** at the moment the resume
invocation runs its upfront batch query.

### Ventas state at the resume check (warm session 505a6d2c)

```
Ventas import_batches (2 generations):
  e8da21cd  Ventas_Transaccional  status=completed  rows=160443  superseded_by=54b246cf  created 01:10:26.047
  54b246cf  Ventas_Transaccional  status=completed  rows=160443  superseded_by=—         created 01:16:37.497
  → gen2 created 371.45 s after gen1.

Ventas unit_state spine: persisted 01:06:10 → … → classified 01:06:22 → bound 01:17:19 (gen1 finished)
  → bound 01:20:18 → bound 01:25:20 → bound 02:05:43  (multiple bound re-emissions across passes)
```

gen1's Ventas batch was created `01:10:26` with `status='processing'` and was STILL running (it
reached `bound` at `01:17:19`). The resume invocation's upfront batch query ran at `~01:16:37`
(gen2's creation). At that instant gen1's batch age was **371 s > 360 s** liveness — so the lease
had **expired on a still-alive owner** → `classifyUnitForResume` returned `process`, not
`skip_in_flight` → gen2 reprocessed Ventas from pulse 1, concurrently with gen1's tail.

### Single-flight assessment

**There is no claim/lock.** The liveness window is a read-time check, not a held lease:
`classifyUnitForResume` reads the batch state once at invocation start and acts on it. Two gaps,
both real here:

1. **Lease shorter than legitimate commit time.** A 160,443-row Ventas commit at sci-bulk pacing
   (500-row pulses, 200 ms pacing, ≤4 retries w/ backoff) legitimately exceeds 360 s under the warm
   run's load. The lease's premise ("> 360 s ⇒ dead") is false for the platform's own largest unit.
   gen1 was alive at 371 s.
2. **No mutual exclusion across concurrent invocations.** Even with a correct lease, nothing
   prevents two live invocations from both selecting `process` for a unit whose `processing` batch
   either hasn't been created yet or has aged past the lease. The HF-213 content-hash supersession is
   the only backstop — it fired correctly (gen1 `superseded_by` gen2), so no double-count on the fact
   table — but it de-duplicates the RESULT; it does not prevent the duplicated WORK (a full 321-pulse
   second pass).

(§6A coupling: the resume is a full re-POST → re-download + re-parse of the xlsx before reprocessing;
the Ventas re-process is coupled to a re-parse. Belongs to the double-parse MC item.)

---

## Q3 Answer: Rule_set Provenance

### Rule_set record

```
id=001fe318  name="Plan de Incentivos 2025 - Coordinadores de Logística"  status=active
components=1  created=2026-06-11T12:38:55.652+00:00  updated=2026-06-13T02:05:39.698+00:00
rule_set_assignments for tenant: 356
```

### Provenance verdict

**INHERITED — predates the clean-slate wipe and both the cold and warm runs.** Created
`2026-06-11T12:38:55Z` (a session two days before this witness). Critically, **`rule_sets` was NOT a
category in the clean-slate wipe scope** (the wipe covered structural_fingerprints,
classification_signals, committed_data, import_batches, entities, import_session_telemetry,
processing_jobs, and named storage proposals — not rule_sets). So this plan survived the wipe; the
cold and warm runs neither created nor replaced it. `updated_at 02:05:39` is the warm run's HF-269
`input_bindings` clear touching the existing row, not a new persist.

### Component completeness

**Complete (components = 1, > 0) — not a partial persist.** The HF-264 zero-components guard worked
correctly: the cold run's plan-skeleton interpreted to zero components and was cleanly *not*
persisted (no new rule_set created), leaving the pre-existing 1-component plan in place. The "Cleared
input_bindings on 1 rule_sets" and "356 entities assigned to 1 rule set" log lines refer to this
inherited rule_set. There is no HF-264 violation; the completion-screen plan name is the survivor,
not new learning.

---

## Residuals & cross-references (per §6A)

- **Warm-path roles fallback HF ≡ this entity-binding HF — SAME structural fix.** Both are the
  dual-surface binding defect: stored learning carries the canonical role on the HC `columnRole`
  surface, but the consumer (and the flywheel `semanticRole` write) diverge from it. The fix family is
  canonical-surface unification at the binding layer — derive entity-id (and roles generally) from the
  surviving HC `columnRole` surface that `resolveEntityIdField` already reads, and/or reconcile the
  flywheel write to store the proposal's role. One fix, not two.
- **Single-flight HF (Q2) is DISTINCT** from the binding HF: it is the resume lease (liveness shorter
  than legitimate large-unit commit time) + absence of mutual exclusion. Sequence separately.
- **Double-parse coupling (Q2 / §6A):** the resume re-POST re-downloads + re-parses before
  reprocessing; the Ventas double-pass is coupled to a re-parse. Belongs to the double-parse MC item.
- **Generation accumulation (§6A):** HF-213 held under the concurrent double-pass (valid supersede
  chain gen1→gen2). The entity sheets that committed on BOTH cold and warm retain two un-superseded
  generations (e.g. Empleados committed_data 240 = 120+120) — retention/compaction is a TMB-scale MC
  item.
- **`failed_interpretation` naming (§6A):** inaccurate for this case. Interpretation SUCCEEDED for the
  five sheets — classification (entity), HC roles (columnRole=identifier), and bindings are all
  present. Only entity-id *derivation at the gate* failed. The state name overstates the failure;
  naming-clarity residual confirmed.
- **Clean-slate scope note:** the wipe did not include `rule_sets`; the tenant's plan learning
  survived (Q3). If a future clean slate intends to zero plan learning too, `rule_sets` +
  `rule_set_assignments` must be added to the scope.

## Fix target (this DIAG's output; the HF is a separate work item)

Primary: at `processEntityUnit` (execute-bulk:781), derive the entity identifier from the canonical
surface `resolveEntityIdField` already trusts — `findHcRole(classificationTrace, 'identifier')` at the
0.80 threshold — instead of gating solely on `confirmedBindings.semanticRole === 'entity_identifier'`.
This reads the surface that survived in stored learning (no re-LLM; HALT-4 clear). Secondarily/origin:
the flywheel write must store the `semanticRole` the proposal used (cold proposal entity_identifier vs
flywheel transaction_identifier divergence), so warm recall reconstructs the role cold execute
committed with. Architect disposition selects single-surface unification vs both.
