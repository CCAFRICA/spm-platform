# HF-373 Phase 0 — EPG-0.8

**Verdict:** PARTIAL

**Root cause:** Two recognition-carry drops, both losing the model's bare primitives that ARE present in the persisted HC trace (nature_role='measure'@0.93-0.98 for every affected Datos column). (1) SHEET fingerprint: columnRoles for writeFingerprint are built from unit.fieldBindings[].semanticRole (process-job/route.ts:445-446). fieldBindings come from the FULL-claim path resolveClaimsPhase1 → generateSemanticBindings (agents.ts:56-74), which passes ONLY the free-form data_nature PROSE (agents.ts:61 `const hcNature = hcInterp?.data_nature;`) into assignTransactionRole; that function reads the prose through the OB-231 word-boundary regex NATURE_IS_MEASURE (agents.ts:81 `/\b(measure|amount|value|metric|quantity|sum|total|numeric)\b/i`) and has NO structural arm for decimal or boolean dataTypes (agents.ts:224-238 handles only date/currency/integer/text) — so a decimal ratio/index column ('measuring', 'metrics', 'ratio', 'index', 'percentage', 'score' all fail the regex) and the boolean-typed count column fall to `unknown@0.3`, and the HF-247 gate (correctly) blocks the write. Which prose the LLM emits per run is roulette: 5 of 6 live Datos imports produced ≥1 'unknown' (Indice_Calidad_Cartera in all 5; +Cumplimiento_Colocacion/Pct_Meta_Depositos/Infracciones_Regulatorias in 3), but Ene2026's prose happened to contain 'period'/'measure' words, PASSED the gate, and stored a POISONED fingerprint (5 measure columns cached as transaction_date because \bperiod\b in their prose matched NATURE_IS_TEMPORAL, which is checked before measure). agents.ts was never converted to the HF-368/HF-372 bare-primitive readers — negotiation.ts:29-56 (the partial-claim twin) was. (2) ATOM warm path (the one that actually carries LLM cost post-HF-372): the atom store's role-stability key is the free-form data_nature prose (decomposed-comprehension.ts:153 `role: interp.data_nature`), which differs on every LLM call, so resolveAtomRole (atom-flywheel.ts:82-86) flipped ALL 14 recurring Datos/roster atoms to 'ambiguous' on their second encounter (live: every mc>1 VLTEST2 atom is role="ambiguous" while its bare nature_role is stable 'measure'/'temporal'/'name'/'identifier'); knownAtomHashes excludes ambiguous atoms (atom-flywheel.ts:109) → all 13 Datos columns are NOVEL on every re-import → full 13-column LLM comprehension re-paid every time. The sheet-level Tier-1 no longer skips any LLM work (HF-372 F-NEW-1: process-job/route.ts:265-272 and analyze/route.ts:201-207 send EVERY sheet through decomposed comprehension; analyze/route.ts:280 `void sheetSkipHC`), so fixing only the sheet-fingerprint write would NOT restore the ~50s saving — the atom prose-role churn must be fixed too.

**HALT-1 notes:** Directive framing corrections: (1) "every Datos import logs Skipped write / fingerprint never stores" — CONTRADICTED in the strict sense: 5 of 6 live Datos imports had ≥1 'unknown' role (gate blocks), but Ene2026 had ZERO unknowns by prose luck and the fingerprint STORED (row fbead6eed137, match_count=2, confidence 0.6667, source_file_sample=BCL_Datos_Ene2026.xlsx) — with GARBAGE roles (Monto_Colocacion/Cumplimiento_Colocacion/Indice_Calidad_Cartera/Pct_Meta_Depositos/Cantidad_Productos_Cruzados all cached as 'transaction_date' because the word 'period' in their measure prose matched NATURE_IS_TEMPORAL first). That row passes the HF-247 READ gate (conf 0.6667≥0.5, no 'unknown') so an identical re-import hits Tier 1 today — the poison is worse than a blocked write. (2) "warm path disabled for this sheet class" is TRUE but the mechanism is not the sheet fingerprint: post-HF-372 the sheet Tier-1 no longer skips LLM (sheetSkipHC is dead code, analyze/route.ts:280; both routes run decomposed comprehension on every sheet). The 50s re-pay is caused by the ATOM flywheel being dead for Datos: all recurring atoms churned role='ambiguous' because role-stability is keyed on free-form data_nature prose, not the stable bare nature_role. (3) ATOM_ALGORITHM_VERSION is 5, not 3 (atom-fingerprint.ts:45; HF-372 bumped v4 identity-keyed + v5 plan_role). (4) The 'which column' answer is per-run nondeterministic: Indice_Calidad_Cartera (5/5 blocked runs), Infracciones_Regulatorias (4/5, platformType=boolean), Cumplimiento_Colocacion + Pct_Meta_Depositos (3/5) — all with nature_role='measure' present in the trace.

**Fix implications:** Fix is at recognition-carry, in two places; the HF-247 gate (fingerprint-flywheel.ts:174-190) stays untouched. (1) web/src/lib/sci/agents.ts: convert generateSemanticBindings/assignSemanticRole and the five assign*Role helpers to read the model's bare primitives (hcInterp.nature_role / scope_role by equality, exactly as negotiation.ts:29-56 already does post-HF-372 Phase C) instead of the NATURE_IS_* regexes over data_nature prose (agents.ts:79-85). nature_role='measure' must map to the measure arm regardless of prose wording and regardless of platformType decimal/boolean (assignTransactionRole:224-238 currently has no arm for decimal/boolean); pass the full HeaderInterpretation (or nature_role+scope_role) into assignSemanticRole — today only the prose string is passed (agents.ts:61-63). This removes both failure modes at once: 'unknown' semanticRole (gate-block) AND the transaction_date poison (\bperiod\b prose matching NATURE_IS_TEMPORAL before measure). Constraint: partial-claim path (negotiation.ts generatePartialBindings/inferRoleForAgent) is already bare-primitive; keep the two arms symmetric. (2) Atom role-stability: key resolveAtomRole on the STABLE bare primitive tuple (nature_role, and where relevant scope_role/plan_role), not free-form data_nature prose — decomposed-comprehension.ts:151-153 sets role: interp.data_nature; atom-flywheel.ts resolveAtomRole/writeAtoms/KnownAtom.role and comprehension-planner claims (header-comprehension.ts:550 reconstructs data_nature from k.role — the prose must move to a separate carried field, characterization/identifies are already carried) must be adjusted accordingly. Per the HF-369 lesson, this is a column_roles semantics change → bump ATOM_ALGORITHM_VERSION 5→6 so the 14 ambiguous-poisoned v5 VLTEST2 atoms (role='ambiguous' is sticky — resolveAtomRole:83 'once ambiguous, always ambiguous') are invalidated and re-comprehend fresh; otherwise the Datos warm path stays dead forever even after the code fix. (3) Data hygiene: the stored poisoned sheet fingerprint row (structural_fingerprints fbead6eed137…, tenant 5b078b52, mc=2, five measure columns cached as 'transaction_date', conf 0.6667 — PASSES the Tier-1 read gate) must be superseded; the next gate-passing import overwrites column_roles+classification_result via the update path (fingerprint-flywheel.ts:208-218), so a post-fix re-import self-heals it, but verify. Warm second-import proof: after one post-fix Datos import, a second identical import must show (a) `[SCI-FINGERPRINT] Stored new:`/`Updated:` instead of `Skipped write (failed-outcome quality gate, HF-247)` on the first, (b) `[SCI-FINGERPRINT] tier=1 match=true … LLM skipped` (fingerprint-flywheel.ts:74-75), and (c) `[OB-203][atom-residue] sheet=Datos known=12/13 novel=1 [ID_Empleado]` (comprehension-planner.ts:64) — ID_Empleado alone re-comprehends by design (HF-370 O1 sequence-independence, atom-flywheel.ts:102-110); the other 12 columns CLAIM warm. Tables touched by the fix's effects: structural_fingerprints only (granularity='sheet' + 'atom'); files: web/src/lib/sci/agents.ts, decomposed-comprehension.ts, atom-flywheel.ts, atom-fingerprint.ts (version bump), comprehension-planner.ts/header-comprehension.ts (claim reconstruction).

## Evidence

### web/src/lib/sci/fingerprint-flywheel.ts:181-189 (the HF-247 WRITE gate — the quoted log line)

```
    const hasUnknownRole = Object.values(columnRoles).some(role => role === 'unknown' || role === '' || role == null);
    if (hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] Skipped write (failed-outcome quality gate, HF-247): hash=${fingerprintHash.substring(0, 12)} file=${sourceFileName} — columnRoles contains 'unknown'`);
      // DI-7: the gate blocked a fingerprint learning WRITE — emit remediation (fire-and-forget).
      fireSignal(
        buildLearningWriteBlockedSignal({ tenantId, surface: 'fingerprint_write', reason: 'unknown_role', fingerprintHash, sourceFileName }),
        supabaseUrl, supabaseServiceKey,
      );
      return;
    }
```

### web/src/lib/sci/fingerprint-flywheel.ts:71-75,86-87 (READ gate + Tier-1 warm lines for warm-import proof)

```
    const cachedRoles = (tier1.column_roles ?? {}) as Record<string, string>;
    const hasUnknownRole = Object.values(cachedRoles).some(role => role === 'unknown' || role === '' || role == null);
    if (conf >= 0.5 && !hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] tier=1 match=true hash=${fingerprintHash.substring(0, 12)} confidence=${conf} matchCount=${tier1.match_count}`);
      console.log(`[SCI-FINGERPRINT] LLM skipped — Tier 1 match from ${tier1.match_count} prior imports`);
...
    if (hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED (poisoned cache): hash=${fingerprintHash.substring(0, 12)} confidence=${conf} — cached column_roles contains 'unknown' (HF-247 outcome quality gate)`);
```

### web/src/app/api/import/sci/process-job/route.ts:444-446,461-464 (WHERE columnRoles for the fingerprint write are BUILT — from fieldBindings semanticRole)

```
      const unitHash = computeFingerprintHashSync(sheetForUnit.columns, sheetForUnit.rows);
      const columnRoles: Record<string, string> = {};
      for (const b of unit.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
...
      writeFingerprint(
        tenantId, unitHash,
        { classification: unit.classification, confidence: unit.confidence, fieldBindings: pjEnrichedFieldBindings, tabName: unit.tabName },
        columnRoles, fileName,
```

### web/src/lib/sci/synaptic-ingestion-state.ts:302,314 (fieldBindings source: FULL claim → resolveClaimsPhase1)

```
      const claim = resolveClaimsPhase1(profile, scores);
...
        fieldBindings: claim.semanticBindings,
```

### web/src/lib/sci/agents.ts:56-63 (the recognition-carry DROP: only data_nature PROSE is passed; nature_role bare primitive never read on this path)

```
function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  const rowCount = profile.structure.rowCount ?? profile.fields.length;
  return profile.fields.map(field => {
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcNature = hcInterp?.data_nature;
    const identifies = hcInterp?.identifies;
    const binding = assignSemanticRole(field, agent, hcNature, rowCount, identifies);
```

### web/src/lib/sci/agents.ts:79-85 (OB-231 prose regexes — NOT converted to bare-primitive readers; negotiation.ts:29-56 was, HF-372 Phase C)

```
const NATURE_IS_IDENTIFIER = (n?: string) => !!n && /\b(identifier|\bid\b|primary[ _-]?key)\b/i.test(n);
const NATURE_IS_REFERENCE_KEY = (n?: string) => !!n && /\b(reference[ _-]?key|ref[ _-]?key|foreign[ _-]?key|lookup[ _-]?key)\b/i.test(n);
const NATURE_IS_MEASURE = (n?: string) => !!n && /\b(measure|amount|value|metric|quantity|sum|total|numeric)\b/i.test(n);
const NATURE_IS_TEMPORAL = (n?: string) => !!n && /\b(date|time|temporal|month|year|period|day|week|quarter)\b/i.test(n);
```

### web/src/lib/sci/agents.ts:224-238 (the 'unknown' fall-through: decimal/boolean measure columns have NO arm — only date/currency/integer/text)

```
function assignTransactionRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (NATURE_IS_TEMPORAL(hcNature) || field.dataType === 'date')
    return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
  if (field.dataType === 'currency')
    return { role: 'transaction_amount', context: `${field.fieldName} — monetary value`, confidence: 0.85 };
  if (NATURE_IS_MEASURE(hcNature))
    return { role: 'transaction_count', context: `${field.fieldName} — measure`, confidence: 0.70 };
  if (field.dataType === 'integer')
    return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified event field`, confidence: 0.30 };
}
```

### probe _hf373_epg08_all_datos_jobs.ts — live processing_jobs, all 6 VLTEST2 Datos jobs (2026-07-02 01:00:56Z), per-run 'unknown' columns; note nature_role='measure' PRESENT for every unknown column

```
=== BCL_Datos_Feb2026.xlsx | job=b7e378f9 | tier=3 : UNKNOWN=[Indice_Calidad_Cartera@0.3]
  UNKNOWN col detail: Indice_Calidad_Cartera platformType=decimal data_nature="A normalized quality score measuring portfolio health, likely derived from delinquency or default metrics." nature_role="measure" scope_role="none"
=== BCL_Datos_Ene2026.xlsx | job=24b5c121 : UNKNOWN=[]   <-- the ONLY run with zero unknowns (gate passed, fingerprint stored)
  roleMap: {"ID_Empleado":"entity_identifier",...,"Monto_Colocacion":"transaction_date","Cumplimiento_Colocacion":"transaction_date","Indice_Calidad_Cartera":"transaction_date","Pct_Meta_Depositos":"transaction_date","Cantidad_Productos_Cruzados":"transaction_date",...}
=== BCL_Datos_Dic2025.xlsx | job=e5c5fa9a : UNKNOWN=[Cumplimiento_Colocacion@0.3, Indice_Calidad_Cartera@0.3, Pct_Meta_Depositos@0.3, Infracciones_Regulatorias@0.3]
  UNKNOWN col detail: Cumplimiento_Colocacion platformType=decimal data_nature="A derived ratio/percentage measuring loan placement goal attainment." nature_role="measure"
  UNKNOWN col detail: Infracciones_Regulatorias platformType=boolean data_nature="A quantitative count of compliance violations, functioning as a risk/penalty indicator." nature_role="measure"
=== BCL_Datos_Nov2025.xlsx | job=2c17acee : UNKNOWN=[Cumplimiento_Colocacion@0.3, Indice_Calidad_Cartera@0.3, Pct_Meta_Depositos@0.3, Infracciones_Regulatorias@0.3]
=== BCL_Datos_Oct2025.xlsx | job=2680404f : UNKNOWN=[Cumplimiento_Colocacion@0.3, Indice_Calidad_Cartera@0.3, Pct_Meta_Depositos@0.3, Infracciones_Regulatorias@0.3]
=== BCL_Datos_Mar2026.xlsx | job=2c8dec76 : UNKNOWN=[Indice_Calidad_Cartera@0.3, Infracciones_Regulatorias@0.3]
ALL 6 jobs share job.structural_fingerprint = fbead6eed137c1ae65c355b9e726084b28933397261c2c4c878776a4e51c2b2f (hash is structural: sorted column names + type signature + bucketed ratios — structural-fingerprint.ts:131-171)
```

### probe _hf373_epg08_datos_roles.ts — live structural_fingerprints: the ONE stored (poisoned) Datos sheet fingerprint

```
hash: fbead6eed137c1ae65c355b9e726084b28933397261c2c4c878776a4e51c2b2f
match_count: 2 confidence: 0.6667 algorithm_version: 1
created_at: 2026-07-02T01:01:54.804385+00:00 updated_at: 2026-07-02T01:02:23.711+00:00
source_file_sample: BCL_Datos_Ene2026.xlsx
column_roles: { "Periodo": "transaction_date", "Sucursal": "category_code", "ID_Empleado": "entity_identifier", "Meta_Depositos": "transaction_count", "Meta_Colocacion": "transaction_count", "Nombre_Completo": "category_code", "Monto_Colocacion": "transaction_date", "Pct_Meta_Depositos": "transaction_date", "Depositos_Nuevos_Netos": "transaction_count", "Indice_Calidad_Cartera": "transaction_date", "Cumplimiento_Colocacion": "transaction_date", "Infracciones_Regulatorias": "transaction_count", "Cantidad_Productos_Cruzados": "transaction_date" }
classification_result.classification: transaction confidence: 1 (confidence:1 = written by flywheel-signal-emission.ts:187, the post-commit execute-bulk path)
Ene2026 fieldBinding proving the transaction_date poison mechanism: {"sourceField":"Monto_Colocacion","data_nature":"A quantitative monetary measure representing the employee's loan origination output for the period.","platformType":"decimal","semanticRole":"transaction_date","displayContext":"Monto_Colocacion — event timestamp"}  <-- \bperiod\b in the prose matched NATURE_IS_TEMPORAL (checked BEFORE measure)
```

### web/src/lib/sci/flywheel-signal-emission.ts:160-165,182-192 (second write site — same semanticRole source, post-commit)

```
        const confirmedSemanticRoles: Record<string, string> = {};
        for (const binding of unit.confirmedBindings) {
          if (binding.sourceField && binding.semanticRole) {
            confirmedSemanticRoles[binding.sourceField] = binding.semanticRole;
          }
        }
...
        writeFingerprint(
          tenantId,
          hash,
          {
            classification: unit.confirmedClassification,
            confidence: 1.0,
            fieldBindings: enrichedFieldBindings,
            tabName: unit.tabName || '',
          },
          confirmedSemanticRoles,
```

### web/src/app/api/import/sci/analyze/route.ts:718-721 (third write site — sync analyze path: data_nature prose preferred, semanticRole fallback)

```
        const columnRoles: Record<string, string> = {};
        for (const fb of enrichedFieldBindings) {
          columnRoles[fb.sourceField as string] = (fb.data_nature as string) ?? (fb.semanticRole as string);
        }
```

### probe _hf373_epg08_atoms.ts — live VLTEST2 v5 atoms: EVERY recurring Datos atom churned role='ambiguous' (warm claim dead) while the bare nature_role stayed STABLE

```
VLTEST2 v5 atoms: 37
atom d7a17dad524b mc=5 conf=0.8333 dt=integer | role="ambiguous" roleConf=0.94 nature_role="measure" scope_role="none" (Infracciones_Regulatorias)
atom fca49b7a3e0d mc=3 dt=decimal | role="ambiguous" nature_role="measure" (Pct_Meta_Depositos)
atom 762a535734f9 mc=5 dt=decimal | role="ambiguous" nature_role="measure" (Indice_Calidad_Cartera)
atom fef60f149ba2 mc=4 dt=decimal | role="ambiguous" nature_role="measure" (Cumplimiento_Colocacion)
atom f8860860fc24 mc=5 dt=date | role="ambiguous" nature_role="temporal" (Periodo)
atom 77888c9561fb mc=7 dt=text | role="ambiguous" nature_role="name" scope_role="entity" (Nombre_Completo)
atom 79593e89c156 mc=7 dt=text | role="ambiguous" nature_role="identifier" scope_role="entity" (ID_Empleado)
[+7 more mc>1 ambiguous atoms; ALL 14 mc>1 atoms are ambiguous]
Contrast mc=1 atoms keep prose roles, e.g.: atom c22964238658 mc=1 role="A normalized decimal index measuring portfolio quality, likely derived from delinquency or default rates." nature_role="measure"  <-- the atom 'role' IS the free-form prose; next run's different prose != this prose -> AMBIGUOUS
```

### web/src/lib/sci/decomposed-comprehension.ts:149-153 + atom-flywheel.ts:82-86,106-114 (why atoms churn ambiguous and why ambiguous atoms never warm-claim)

```
        // OB-231: the accumulated atom "role" label carries the free-form data_nature;
        if (interp.data_nature && interp.data_nature !== 'unknown') {
          atomsToWrite.push({ columnName: col, hash: fp.hash, role: interp.data_nature, roleConfidence: interp.confidence, ... });
---
export function resolveAtomRole(existingRole: string | undefined | null, newRole: string): string {
  if (existingRole === AMBIGUOUS_ROLE) return AMBIGUOUS_ROLE;
  if (existingRole && existingRole !== newRole) return AMBIGUOUS_ROLE;
  return newRole;
}
---
export function knownAtomHashes(known: Map<string, KnownAtom>, minConfidence = 0.5): Set<string> {
  for (const [h, a] of Array.from(known.entries())) {
    if (a.confidence < minConfidence || !a.role || a.role === 'unknown' || a.role === AMBIGUOUS_ROLE) continue;
    if (isContextualIdentifierAtom(a)) continue; // identifier scope is sheet-contextual → re-comprehend per sheet
```

### web/src/app/api/import/sci/process-job/route.ts:265-272 + analyze/route.ts:280 (post-HF-372: sheet Tier-1 no longer skips LLM; the warm path IS decomposed/atom comprehension)

```
    // Header comprehension — HF-372 (F-NEW-1): EVERY sheet goes through decomposed comprehension.
    // The former Tier-1 skip left `profile.headerComprehension` absent for a warm sheet, and the
    // HF-367/368 classifier reads the model's per-column bare primitives from exactly that surface —
    // ... Decomposed comprehension IS the warm path: known atoms claim from the flywheel without an LLM dispatch
    const sheetsNeedingHC = sheets;
---
analyze/route.ts:280:      void sheetSkipHC;   // (dead — sheet Tier-1 LLM-skip removed)
```

### web/src/lib/sci/atom-fingerprint.ts:45 + atom-flywheel.ts:46-66 (fingerprint/atom write payload; version is 5, NOT 3 as the directive stated)

```
export const ATOM_ALGORITHM_VERSION = 5;
---
export function buildAtomRow(tenantId, atom, role, roleConfidence, expr?) {
  return {
    tenant_id, fingerprint_hash: atom.hash, fingerprint: atom.hash, granularity: 'atom',
    algorithm_version: ATOM_ALGORITHM_VERSION, scope: 'tenant',
    atom_features: atom.features,
    column_roles: { role, roleConfidence, ...(expr ? { identifies, characterization, relationships, scope_role: expr.scope_role, nature_role: expr.nature_role, plan_role: expr.plan_role } : {}) },
    classification_result: {}, source_file_sample: null, match_count: 1, confidence: 0.5 };
```

### web/src/lib/sci/comprehension-planner.ts:55,61,64 (warm-recall proof lines for a second import: CLAIMED vs NOVEL vs residue)

```
      console.log(`[OB-203][atom-claim] sheet=${sheetName} col=${columnName} hash=${fp.hash.slice(0, 12)} -> CLAIMED role=${k.role}@${k.roleConfidence.toFixed(2)} (stable role-conf; recog=${k.confidence.toFixed(2)})`);
...
      console.log(`[OB-203][atom-claim] sheet=${sheetName} col=${columnName} hash=${fp.hash.slice(0, 12)} -> NOVEL (${why}) — will comprehend`);
...
  console.log(`[OB-203][atom-residue] sheet=${sheetName} known=${knownColumns.length}/${columns.length} novel=${novelColumns.length} [${novelColumns.join(', ')}]`);
```

### probe _hf373_epg08_introspect.ts — VLTEST2 job/fingerprint census (last 72h)

```
6 Datos jobs (Oct2025..Mar2026) all status=finalized tier=3, created 2026-07-02T01:00:56Z; Plantilla 00:54:30, Plan 00:57:53.
VLTEST2 sheet fingerprints: 9 total; exactly ONE Datos row (fbead6eed137 mc=2). All jobs ran tier=3 because the Ene2026 write landed at 01:01:54, AFTER all 6 parallel lookups.
VLTEST2 atom fingerprints by algorithm_version: {"5":37}
```

